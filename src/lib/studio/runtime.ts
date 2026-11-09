// What a studio page runs on (docs/forms-chat-plan.md, Part 3): steps, show-if, required checks, progress and the
// thanks. The form script (src/lib/forms/element.ts) runs it on live forms; the studio's preview runs the same rules.

export type Vals = Record<string, string | string[]>;

/** A text with the answers in it: {first_name} becomes what they typed, and an empty one leaves no stray comma. */
export function pipeText(template: string, v: Record<string, string | string[] | undefined>): string {
  return template
    .replace(/\{([A-Za-z][\w-]{0,60})\}/g, (m, n: string) => {
      if (!(n in v)) return m;
      const x = v[n];
      return Array.isArray(x) ? x.join(", ") : (x ?? "");
    })
    .replace(/[ ,]+([.!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Texts with answers in them ({first_name}), as written in data-cl-pipe (src/lib/studio/builder.ts). */
export function pipes(w: ParentNode, v: Vals) {
  w.querySelectorAll<HTMLElement>("[data-cl-pipe]").forEach((el) => (el.textContent = pipeText(el.getAttribute("data-cl-pipe")!, v)));
}

/** Choices in a new order for each visitor, once. */
export function shuffle(w: ParentNode) {
  w.querySelectorAll<HTMLElement>("[data-cl-shuffle]").forEach((box) => {
    const k = [...box.children];
    for (let i = k.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [k[i], k[j]] = [k[j]!, k[i]!];
    }
    box.append(...k);
  });
}

/** What a question's own limits say about its answer: its length, its number range, the most it may pick. */
export function limitMsg(el: HTMLInputElement, group: HTMLInputElement[]): string {
  if (el.type === "checkbox") {
    const most = Number(el.closest("[data-cl-limit]")?.getAttribute("data-cl-limit"));
    return most > 0 && group.filter((x) => x.checked).length > most ? `Pick up to ${most}.` : "";
  }
  const t = el.value.trim();
  if (!t || el.type === "radio") return "";
  const lo = Number(el.getAttribute("minlength")),
    hi = Number(el.getAttribute("maxlength"));
  if (lo > 0 && t.length < lo) return `Write at least ${lo} characters.`;
  if (hi > 0 && t.length > hi) return `Keep it under ${hi} characters.`;
  // Formatted text (a ZIP code, an ID): the page's own pattern, with its own words for a miss.
  const pat = el.getAttribute("pattern");
  if (pat) {
    try {
      if (!new RegExp(`^(?:${pat})$`).test(t)) return el.getAttribute("title") || "Check the format.";
    } catch {}
  }
  if (el.type === "number") {
    const n = Number(t),
      a = el.getAttribute("min"),
      b = el.getAttribute("max");
    if (!Number.isFinite(n)) return "Enter a number.";
    if (a && n < Number(a)) return `Enter ${a} or more.`;
    if (b && n > Number(b)) return `Enter ${b} or less.`;
  }
  return "";
}

/** Every named question's answer: a list for check boxes, the picked value for radios, the text for the rest. */
export function pageValues(w: ParentNode): Vals {
  const v: Vals = {};
  w.querySelectorAll<HTMLInputElement>("input[name],textarea[name],select[name]").forEach((el) => {
    const n = el.name;
    if (el.type === "radio") {
      if (el.checked) v[n] = el.value;
      else if (!(n in v)) v[n] = "";
    } else if (el.type === "checkbox") {
      const list = (Array.isArray(v[n]) ? v[n] : []) as string[];
      if (el.checked) list.push(el.value === "on" ? "yes" : el.value);
      v[n] = list;
    } else v[n] = el.value.trim();
  });
  return v;
}

const DAY = /^\d{4}-\d{2}-\d{2}/;
/** Today as YYYY-MM-DD where the visitor is, N days on. */
const dayAt = (n: number) => {
  const d = new Date(Date.now() + n * 864e5);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function clause(c: string, v: Vals): boolean {
  // A date within the next N days: move_in within 30 days.
  let m = /^([\w-]+)\s+within\s+(\d{1,4})\s+days$/i.exec(c);
  if (m) {
    const x = String(v[m[1]!] ?? "").slice(0, 10);
    return DAY.test(x) && x >= dayAt(0) && x <= dayAt(Number(m[2]));
  }
  m = /^([\w-]+)\s+(filled|empty)$/i.exec(c);
  if (m) {
    const x = v[m[1]!];
    const f = Array.isArray(x) ? x.length > 0 : !!x;
    return m[2]!.toLowerCase() === "filled" ? f : !f;
  }
  m = /^([\w-]+)\s+in\s+\((.*)\)$/i.exec(c);
  if (m) {
    const list = [...m[2]!.matchAll(/'([^']*)'|"([^"]*)"|([^,\s]+)/g)].map((y) => y[1] ?? y[2] ?? y[3] ?? "");
    const x = v[m[1]!];
    return Array.isArray(x) ? x.some((y) => list.includes(y)) : list.includes(x ?? "");
  }
  m = /^([\w-]+)\s*(==|!=|>=|<=|>|<)\s*(?:'([^']*)'|"([^"]*)"|(\S+))$/.exec(c);
  if (!m) return true;
  const x = v[m[1]!];
  const val = m[3] ?? m[4] ?? m[5] ?? "";
  const list = Array.isArray(x) ? x : [x ?? ""];
  if (m[2] === "==") return list.includes(val);
  if (m[2] === "!=") return !list.includes(val);
  // Dates compare as days: start < '2026-12-01' is "before December 1".
  if (DAY.test(String(list[0])) && DAY.test(val)) {
    const a = String(list[0]).slice(0, 10),
      b = val.slice(0, 10);
    return m[2] === ">" ? a > b : m[2] === "<" ? a < b : m[2] === ">=" ? a >= b : a <= b;
  }
  const n = Number(list[0]);
  const t = Number(val);
  if (!Number.isFinite(n) || !Number.isFinite(t)) return false;
  return m[2] === ">" ? n > t : m[2] === "<" ? n < t : m[2] === ">=" ? n >= t : n <= t;
}

/** A show-if: clauses joined with and / or (and binds first). */
export const holds = (expr: string, v: Vals) => expr.split(/\s+or\s+/i).some((part) => part.split(/\s+and\s+/i).every((c) => clause(c.trim(), v)));

/** Whether an element shows by the page's conditions (not by which page is open): every show-if around it holds. */
export function showsByIf(el: Element, v: Vals): boolean {
  for (let p: Element | null = el; p; p = p.parentElement) {
    const e = p.getAttribute("data-cl-show-if");
    if (e && !holds(e, v)) return false;
  }
  return true;
}

/**
 * The answers to send and to price: an answer a show-if hides is dropped, as on every form, so a choice picked and
 * then hidden by a later change is never charged. Twice, so a question hidden because its parent is hidden goes too.
 */
export function shownValues(w: ParentNode, v: Vals): Vals {
  let cur = v;
  for (let pass = 0; pass < 2; pass++) {
    const keep = new Set<string>();
    w.querySelectorAll<HTMLInputElement>("input[name],textarea[name],select[name]").forEach((el) => {
      if (showsByIf(el, cur)) keep.add(el.name);
    });
    cur = Object.fromEntries(Object.entries(v).filter(([k]) => keep.has(k)));
  }
  return cur;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type PageRun = { done(): void; start(): void; refresh(): void; errors(byName: Record<string, string>): void; busy(on: boolean): void; alert(text: string): void };

/**
 * What sits around the thank-you, to hide once it's sent: everything but the logo, so the form's own heading and
 * line go too, on one-page and multi-page forms alike. The welcome screen hides on its own.
 */
export function around(thanks: Element, w: Element): HTMLElement[] {
  const out: HTMLElement[] = [];
  const add = (el: Element): void => {
    if (el.matches("img[data-cl-logo],[data-cl-cover]")) return;
    if (!el.querySelector("img[data-cl-logo]")) out.push(el as HTMLElement);
    else for (const c of el.children) add(c);
  };
  for (let n: Element | null = thanks; n && n !== w && n.parentElement; n = n.parentElement)
    for (const sib of n.parentElement.children) if (sib !== n && !sib.contains(thanks)) add(sib);
  return out;
}

/** Where the consent line goes: above the row of buttons the send button sits in, else right above the button. */
export function consentSpot(send: Element, w: Element): Element {
  const row = send.parentElement;
  return row && row !== w && row.querySelectorAll("button,a").length > 1 && !row.matches("form,section,[data-cl-step]") ? row : send;
}

/**
 * The booking calendar inside a studio page (live and in the Studio): a host line, day chips that scroll, a compact
 * grid of times with More times, and a short time-zone line. Buttons wear the brand's .btn and .btn-secondary; these
 * rules only size them, so the brand's colors, corners and fonts show.
 */
export const CAL_CSS =
  ":where(.cl-cal button){background:transparent;color:inherit;border:1.5px solid rgba(127,127,127,.35);border-radius:10px}:where(.cl-cal button[aria-pressed=true]){border-color:currentColor;font-weight:600}.cl-cal{display:flex;flex-direction:column;gap:14px;margin-top:6px;text-align:start}.cl-host{display:flex;align-items:center;gap:10px}.cl-host img{width:40px;height:40px;border-radius:50%;object-fit:cover;flex:none}.cl-host b{display:block;font-weight:600}.cl-host small{display:block;opacity:.7;font-size:13px}.cl-cal .cl-days{display:flex;flex-wrap:nowrap;gap:8px;overflow-x:auto;padding:2px 2px 6px;scrollbar-width:thin}.cl-cal .cl-days button{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:2px;width:auto;min-width:68px;height:auto;margin:0;padding:8px 12px;font:inherit;line-height:1.2;cursor:pointer}.cl-cal .cl-days small{font-size:11px;letter-spacing:.06em;text-transform:uppercase;opacity:.75}.cl-cal .cl-days strong{font-size:15px}.cl-cal .cl-times{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}@media (max-width:420px){.cl-cal .cl-times{grid-template-columns:repeat(2,minmax(0,1fr))}}.cl-cal .cl-times button{width:100%;min-width:0;height:42px;margin:0;padding:0 8px;font:inherit;font-size:15px;white-space:nowrap;cursor:pointer}.cl-cal .cl-link{align-self:flex-start;background:none;border:0;padding:0;margin:0;font:inherit;font-size:14px;color:inherit;text-decoration:underline;text-underline-offset:3px;cursor:pointer;width:auto;height:auto;box-shadow:none}.cl-cal .cl-zone{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;font-size:13px;opacity:.85}.cl-cal .cl-zone .cl-link{font-size:13px}" +
  // The plain calendar (Free): Claritia's own look on a white card, whatever the form wears.
  ".cl-cal.cl-plain{background:#fff;color:#1f1f1f;border:1px solid rgba(0,0,0,.1);border-radius:12px;padding:16px;font:14px/1.4 Inter,system-ui,-apple-system,sans-serif;letter-spacing:normal;text-transform:none}.cl-plain h3{margin:0;font-size:17px;font-weight:600}.cl-plain p{margin:0}.cl-plain button{background:#fff;color:#1f1f1f;border:1px solid rgba(0,0,0,.14);border-radius:8px;box-shadow:none;text-transform:none;letter-spacing:normal;font-weight:500}.cl-plain button[aria-pressed=true]{background:#1f1f1f;color:#fff;border-color:#1f1f1f}.cl-plain .cl-link{background:none;border:0;color:#1f1f1f}";

/** A time zone in words people know: "Saigon (GMT+7)". */
export function zoneWords(tz: string): string {
  let off = "";
  try {
    off = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(Date.now()).find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {}
  const city = (tz.split("/").pop() ?? tz).replace(/_/g, " ");
  return off ? `${city} (${off})` : city;
}

/** Errors are tied to their question and read out as they appear (docs/studio-v2-plan.md 6.4). */
export function linkErrors(w: ParentNode) {
  w.querySelectorAll<HTMLElement>("[data-cl-error-for]").forEach((e, i) => {
    if (!e.id) e.id = `cl-err-${i}`;
    e.setAttribute("aria-live", "polite");
    w.querySelectorAll(`[name="${CSS.escape(e.getAttribute("data-cl-error-for")!)}"]`).forEach((x) => {
      const d = x.getAttribute("aria-describedby") ?? "";
      if (!d.split(" ").includes(e.id)) x.setAttribute("aria-describedby", `${d} ${e.id}`.trim());
    });
  });
}

/** Focus always shows, choice cards with hidden inputs too, the consent line takes its own row above the button, and
 * motion stops for people who ask for less. */
export const ACCESS_CSS =
  "[data-cl-behind-cover]{display:none!important}.cl-consent,.cl-notice{flex:1 0 100%;margin:14px 0 8px}.cl-unit{display:flex;align-items:center;gap:8px}.cl-unit>input{flex:1;min-width:0}.cl-switch input{appearance:none;-webkit-appearance:none;width:36px;height:20px;border-radius:999px;background:rgba(127,127,127,.45);position:relative;flex:none;margin:0;cursor:pointer}.cl-switch input::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .15s}.cl-switch input:checked{background:var(--brand-primary,#111)}.cl-switch input:checked::after{transform:translateX(16px)}.cl-section{display:flex;flex-direction:column;gap:inherit}.cl-progress{height:6px;border-radius:999px;background:rgba(127,127,127,.2);overflow:hidden}.cl-progress>i{display:block;height:100%;width:calc(var(--cl-progress,0)*100%);background:var(--brand-primary,currentColor);transition:width .3s}.cl-review{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:6px 16px;margin:0}.cl-review dt{opacity:.7}.cl-review dd{margin:0;overflow-wrap:anywhere}.cl-timer{font-variant-numeric:tabular-nums}" +
  "@layer base{:where(input,button,select,textarea,a,summary):focus-visible{outline:2px solid currentColor;outline-offset:2px}label:has(input:focus-visible){outline:2px solid currentColor;outline-offset:2px}}@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}";

/** The page box the photo fills: the page's .page, else the root. */
export const pageBox = (w: HTMLElement) => w.querySelector<HTMLElement>(".page") ?? w;

/** The welcome screen in view (or not): everything else on the page waits behind it. */
export function showCover(page: HTMLElement, cover: HTMLElement, on: boolean) {
  if (cover.parentElement !== page) page.prepend(cover);
  cover.hidden = !on;
  for (const x of page.children) if (x !== cover && !x.classList.contains("cl-fig")) x.toggleAttribute("data-cl-behind-cover", on);
}

/** What a page run asks of the form script's second part, once it's loaded (src/lib/studio/pageParts.ts). */
export type PageHooks = { media?(page: HTMLElement, screen: Element | null): void };

/**
 * Run a page in `w`. `onSend` gets the answers once every shown question checks out. `hooks.media` draws the photo
 * for the screen showing, when the second part is there; `refresh` draws again once it arrives.
 */
export function runPage(w: HTMLElement, onSend: (v: Vals) => void, hooks: PageHooks = {}): PageRun {
  const steps = [...w.querySelectorAll<HTMLElement>("[data-cl-step]")];
  const thanks = w.querySelector<HTMLElement>("[data-cl-thanks]");
  const page = pageBox(w);
  // The welcome screen: shown first, until Start (or an answer from an email, or an error the server sends back).
  const cover = w.querySelector<HTMLElement>("[data-cl-cover]");
  let onCover = !!cover;
  let at = 0;
  linkErrors(w);
  shuffle(w);
  let finished = false;
  const errFor = (n: string) => w.querySelector<HTMLElement>(`[data-cl-error-for="${CSS.escape(n)}"]`);
  // A page with a timer (data-cl-timer, in seconds) moves on by itself when its time is up.
  let timed = -1;
  let tick = 0;
  const timer = () => {
    const st = steps[at];
    const secs = Number(st?.getAttribute("data-cl-timer"));
    if (finished || onCover || !st || !(secs > 0)) {
      clearInterval(tick);
      timed = -1;
      return;
    }
    if (timed === at) return;
    clearInterval(tick);
    timed = at;
    const end = Date.now() + secs * 1000;
    let left = st.querySelector<HTMLElement>("[data-cl-timer-left]");
    if (!left) {
      left = document.createElement("p");
      left.className = "text cl-timer";
      left.setAttribute("data-cl-timer-left", "");
      left.setAttribute("aria-live", "off");
      st.prepend(left);
    }
    const show = () => {
      const s = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      left!.textContent = `Time left ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
      if (s > 0) return;
      clearInterval(tick);
      if (at < steps.length - 1) move(1);
      else send();
    };
    show();
    tick = window.setInterval(show, 500);
  };
  const apply = () => {
    const v = pageValues(w);
    w.querySelectorAll<HTMLElement>("[data-cl-show-if]").forEach((el) => {
      if (!el.hasAttribute("data-cl-step")) el.hidden = !holds(el.getAttribute("data-cl-show-if")!, v);
    });
    const shown = steps.filter((s) => !s.hasAttribute("data-cl-show-if") || holds(s.getAttribute("data-cl-show-if")!, v));
    steps.forEach((s, i) => (s.hidden = finished || i !== at));
    if (thanks) thanks.hidden = !finished;
    // The thank-you takes the form's place, heading included (the logo stays).
    if (finished && thanks) for (const x of around(thanks, w)) x.hidden = true;
    const pos = shown.indexOf(steps[at]!);
    const p = steps.length ? (finished ? 1 : (Math.max(0, pos) + 1) / Math.max(1, shown.length)) : finished ? 1 : 0;
    w.querySelectorAll<HTMLElement>("[data-cl-progress]").forEach((el) => el.style.setProperty("--cl-progress", String(p)));
    pipes(w, v);
    if (cover) showCover(page, cover, onCover && !finished);
    hooks.media?.(page, onCover && !finished ? cover : finished ? thanks : (steps[at] ?? w.querySelector("form[data-cl-media],.form-card[data-cl-media]")));
    timer();
    return shown;
  };
  const start = () => {
    if (!onCover) return;
    onCover = false;
    apply();
    visible(steps[at] ?? w)[0]?.focus();
  };
  const visible = (scope: ParentNode) => [...scope.querySelectorAll<HTMLInputElement>("input[name],textarea[name],select[name]")].filter((el) => el.type !== "hidden" && !el.closest("[hidden]"));
  const check = (scope: ParentNode) => {
    let ok = true;
    const seen = new Set<string>();
    for (const el of visible(scope)) {
      if (seen.has(el.name)) continue;
      seen.add(el.name);
      const group = visible(scope).filter((x) => x.name === el.name);
      const filled = el.type === "radio" || el.type === "checkbox" ? group.some((x) => x.checked) : !!el.value.trim();
      let msg = "";
      if (group.some((x) => x.required) && !filled) msg = "Fill this in.";
      else if (el.type === "email" && el.value && !EMAIL.test(el.value.trim())) msg = "Enter a valid email.";
      else msg = limitMsg(el, group);
      group.forEach((x) => x.setAttribute("aria-invalid", msg ? "true" : "false"));
      const e = errFor(el.name);
      if (e) e.textContent = msg;
      if (msg && ok) {
        ok = false;
        el.focus();
      }
    }
    return ok;
  };
  const move = (dir: number) => {
    const shown = apply();
    let i = at + dir;
    while (i >= 0 && i < steps.length && !shown.includes(steps[i]!)) i += dir;
    if (i >= 0 && i < steps.length) at = i;
    apply();
  };
  const clear = (e: Event) => {
    const n = (e.target as HTMLInputElement | null)?.name;
    if (!n) return;
    const er = errFor(n);
    if (er) er.textContent = "";
    w.querySelectorAll(`[name="${CSS.escape(n)}"]`).forEach((x) => x.setAttribute("aria-invalid", "false"));
  };
  const send = () => {
    if (check(w)) onSend(pageValues(w));
  };
  w.addEventListener("input", (e) => (clear(e), apply()));
  w.addEventListener("change", (e) => (clear(e), apply()));
  w.addEventListener("click", (e) => {
    const t = (e.target as Element | null)?.closest?.("[data-cl-next],[data-cl-back],[data-cl-start],[type=submit]");
    if (!t) return;
    e.preventDefault();
    if (t.hasAttribute("data-cl-start")) return start();
    if (t.hasAttribute("data-cl-back")) return move(-1);
    if (t.hasAttribute("data-cl-next")) return void (check(steps[at] ?? w) && move(1));
    send();
  });
  w.addEventListener("submit", (e) => (e.preventDefault(), send()));
  apply();
  let note: HTMLElement | null = null;
  return {
    done: () => {
      finished = true;
      apply();
    },
    start,
    refresh: () => void apply(),
    errors: (byName) => {
      onCover = false;
      let first = -1;
      for (const [n, msg] of Object.entries(byName)) {
        const e = errFor(n);
        if (e) e.textContent = msg;
        w.querySelectorAll(`[name="${CSS.escape(n)}"]`).forEach((x) => x.setAttribute("aria-invalid", "true"));
        // A block holds its answer under data-cl-name: an empty one on an earlier page opens that page.
        const s = steps.findIndex((st) => st.querySelector(`[name="${CSS.escape(n)}"],[data-cl-name="${CSS.escape(n)}"]`));
        if (s >= 0 && (first < 0 || s < first)) first = s;
      }
      if (first >= 0) at = first;
      apply();
    },
    busy: (on) => w.querySelectorAll<HTMLButtonElement>("[type=submit]").forEach((b) => (b.disabled = on)),
    alert: (text) => {
      note?.remove();
      note = null;
      if (!text) return;
      note = document.createElement("p");
      note.className = "cl-alert";
      note.setAttribute("role", "alert");
      note.textContent = text;
      const btn = [...w.querySelectorAll("[type=submit]")].find((b) => !b.closest("[hidden]"));
      if (btn) btn.after(note);
      else w.append(note);
    },
  };
}
