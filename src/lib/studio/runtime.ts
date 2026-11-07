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

export type PageRun = { done(): void; errors(byName: Record<string, string>): void; busy(on: boolean): void; alert(text: string): void };

/** What sits around the thank-you on a one-page form, to hide once it's sent; anything holding the logo stays. */
export function around(thanks: Element, w: Element): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (let n: Element | null = thanks; n && n !== w && n.parentElement; n = n.parentElement)
    for (const sib of n.parentElement.children) if (sib !== n && !sib.contains(thanks) && !sib.querySelector("img[data-cl-logo]") && !sib.matches("img[data-cl-logo]")) out.push(sib as HTMLElement);
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
  ":where(.cl-cal button){background:transparent;color:inherit;border:1.5px solid rgba(127,127,127,.35);border-radius:10px}:where(.cl-cal button[aria-pressed=true]){border-color:currentColor;font-weight:600}.cl-cal{display:flex;flex-direction:column;gap:14px;margin-top:6px;text-align:start}.cl-host{display:flex;align-items:center;gap:10px}.cl-host img{width:40px;height:40px;border-radius:50%;object-fit:cover;flex:none}.cl-host b{display:block;font-weight:600}.cl-host small{display:block;opacity:.7;font-size:13px}.cl-cal .cl-days{display:flex;flex-wrap:nowrap;gap:8px;overflow-x:auto;padding:2px 2px 6px;scrollbar-width:thin}.cl-cal .cl-days button{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:2px;width:auto;min-width:68px;height:auto;margin:0;padding:8px 12px;font:inherit;line-height:1.2;cursor:pointer}.cl-cal .cl-days small{font-size:11px;letter-spacing:.06em;text-transform:uppercase;opacity:.75}.cl-cal .cl-days strong{font-size:15px}.cl-cal .cl-times{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}@media (max-width:420px){.cl-cal .cl-times{grid-template-columns:repeat(2,minmax(0,1fr))}}.cl-cal .cl-times button{width:100%;min-width:0;height:42px;margin:0;padding:0 8px;font:inherit;font-size:15px;white-space:nowrap;cursor:pointer}.cl-cal .cl-link{align-self:flex-start;background:none;border:0;padding:0;margin:0;font:inherit;font-size:14px;color:inherit;text-decoration:underline;text-underline-offset:3px;cursor:pointer;width:auto;height:auto;box-shadow:none}.cl-cal .cl-zone{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;font-size:13px;opacity:.85}.cl-cal .cl-zone .cl-link{font-size:13px}";

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
  ".cl-consent,.cl-notice{flex:1 0 100%;margin:0}.cl-unit{display:flex;align-items:center;gap:8px}.cl-unit>input{flex:1;min-width:0}.cl-switch input{appearance:none;-webkit-appearance:none;width:36px;height:20px;border-radius:999px;background:rgba(127,127,127,.45);position:relative;flex:none;margin:0;cursor:pointer}.cl-switch input::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .15s}.cl-switch input:checked{background:var(--brand-primary,#111)}.cl-switch input:checked::after{transform:translateX(16px)}.cl-section{display:flex;flex-direction:column;gap:inherit}.cl-progress{height:6px;border-radius:999px;background:rgba(127,127,127,.2);overflow:hidden}.cl-progress>i{display:block;height:100%;width:calc(var(--cl-progress,0)*100%);background:var(--brand-primary,currentColor);transition:width .3s}.cl-review{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:6px 16px;margin:0}.cl-review dt{opacity:.7}.cl-review dd{margin:0;overflow-wrap:anywhere}.cl-timer{font-variant-numeric:tabular-nums}" +
  "@layer base{:where(input,button,select,textarea,a,summary):focus-visible{outline:2px solid currentColor;outline-offset:2px}label:has(input:focus-visible){outline:2px solid currentColor;outline-offset:2px}}@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}";

/** The look of the form's own dropdowns (pickers); colors, corners and fonts come from the page's .field. */
export const PICK_CSS =
  ".cl-native{position:absolute!important;width:1px!important;height:1px!important;margin:-1px!important;padding:0!important;border:0!important;opacity:0!important;pointer-events:none!important;clip-path:inset(50%)!important}.cl-pick{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;text-align:start;cursor:pointer}.cl-pick>span:first-child{min-width:0;overflow-wrap:anywhere}.cl-pick[data-empty]>span:first-child{opacity:.6}.cl-pick>svg{flex:none;opacity:.7;transition:transform .15s}.cl-pick[aria-expanded=true]>svg{transform:rotate(180deg)}.cl-list{margin:4px 0 0;padding:4px;list-style:none;max-height:260px;overflow-y:auto;border:1px solid var(--brand-line,rgba(127,127,127,.35));border-radius:min(var(--brand-radius,8px),12px);background:var(--brand-field,#fff);color:var(--brand-text,inherit);box-sizing:border-box}.cl-list[hidden]{display:none}.cl-list li{padding:8px 10px;border-radius:min(var(--brand-radius,8px),8px);cursor:pointer;overflow-wrap:anywhere;font-size:14px}.cl-list li:hover,.cl-list li[data-on]{background:var(--brand-soft,rgba(127,127,127,.12))}.cl-list li[aria-selected=true]{font-weight:600}";

let pickSeq = 0;

/**
 * Every <select> in a page as the form's own dropdown: a button that opens the list of its options in the page (never
 * the browser's own menu), with the keyboard: arrows, Home, End, Enter, Space, Escape and a letter to jump. The select
 * stays in the page out of sight and keeps the answer, so the checks, show-if and the send read it as before, and a
 * value set on it from outside (a prefill, a language switch, a personal link) shows on the button.
 */
export function pickers(w: HTMLElement) {
  const doc = w.ownerDocument;
  const all: (() => void)[] = [];
  w.querySelectorAll<HTMLSelectElement>("select").forEach((sel) => {
    if (sel.hasAttribute("data-cl-picker") || sel.multiple) return;
    sel.setAttribute("data-cl-picker", "");
    const n = ++pickSeq;
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.className = `${sel.className} cl-pick`.trim();
    // The question's label names the button: the select's id moves to it.
    btn.id = sel.id || `cl-pick-${n}`;
    if (sel.id) sel.id = `${sel.id}-list`;
    btn.setAttribute("aria-haspopup", "listbox");
    btn.setAttribute("aria-expanded", "false");
    const listId = `cl-picks-${n}`;
    btn.setAttribute("aria-controls", listId);
    const text = doc.createElement("span");
    const NS = "http://www.w3.org/2000/svg";
    const chev = doc.createElementNS(NS, "svg");
    chev.setAttribute("viewBox", "0 0 16 16");
    chev.setAttribute("width", "14");
    chev.setAttribute("height", "14");
    chev.setAttribute("aria-hidden", "true");
    const path = doc.createElementNS(NS, "path");
    path.setAttribute("d", "M4 6l4 4 4-4");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.6");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    chev.append(path);
    btn.append(text, chev);
    const list = doc.createElement("ul");
    list.className = "cl-list";
    list.id = listId;
    list.setAttribute("role", "listbox");
    list.hidden = true;
    sel.classList.add("cl-native");
    sel.tabIndex = -1;
    sel.setAttribute("aria-hidden", "true");
    // Beside the select, so the question's own rules (its required mark, its width) still find it.
    sel.after(btn, list);
    const name = () => (btn.labels?.[0]?.textContent ?? "").replace(/\s*\*\s*$/, "").trim();
    // The placeholder (an option with no value) is what the button says before a pick, never a choice in the list.
    const opts = () => [...sel.options].filter((o) => o.value !== "" && !o.disabled && !o.hidden);
    const holder = () => [...sel.options].find((o) => o.value === "")?.textContent?.trim() || "Choose one";
    const sync = () => {
      const o = sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex] : null;
      const picked = !!o && o.value !== "";
      text.textContent = picked ? (o!.textContent ?? o!.value) : holder();
      btn.toggleAttribute("data-empty", !picked);
      btn.disabled = sel.disabled;
      btn.setAttribute("aria-invalid", sel.getAttribute("aria-invalid") ?? "false");
      const d = sel.getAttribute("aria-describedby");
      if (d) btn.setAttribute("aria-describedby", d);
      if (sel.required) btn.setAttribute("aria-required", "true");
      const nm = name();
      if (nm) list.setAttribute("aria-label", nm);
    };
    all.push(sync);
    let on = -1;
    const items = () => [...list.querySelectorAll<HTMLLIElement>("li")];
    const mark = (i: number) => {
      const li = items();
      if (!li.length) return;
      on = Math.max(0, Math.min(li.length - 1, i));
      li.forEach((x, k) => x.toggleAttribute("data-on", k === on));
      btn.setAttribute("aria-activedescendant", li[on]!.id);
      li[on]!.scrollIntoView?.({ block: "nearest" });
    };
    const close = (focus: boolean) => {
      if (list.hidden) return;
      list.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      btn.removeAttribute("aria-activedescendant");
      if (focus) btn.focus();
    };
    const pick = (value: string) => {
      const was = sel.value;
      sel.value = value;
      sync();
      close(true);
      if (was !== value) {
        sel.dispatchEvent(new Event("input", { bubbles: true }));
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    };
    const open = () => {
      if (sel.disabled) return;
      list.replaceChildren(
        ...opts().map((o, i) => {
          const li = doc.createElement("li");
          li.id = `${listId}-${i}`;
          li.setAttribute("role", "option");
          li.setAttribute("aria-selected", o.selected ? "true" : "false");
          li.textContent = o.textContent ?? o.value;
          li.addEventListener("mousedown", (e) => e.preventDefault());
          li.addEventListener("click", () => pick(o.value));
          return li;
        }),
      );
      list.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      mark(Math.max(0, opts().findIndex((o) => o.selected)));
    };
    let typed = "";
    let typedAt = 0;
    btn.addEventListener("click", () => (list.hidden ? open() : close(false)));
    btn.addEventListener("keydown", (e) => {
      const k = e.key;
      if (list.hidden) {
        if (k === "ArrowDown" || k === "ArrowUp" || k === "Enter" || k === " ") {
          e.preventDefault();
          open();
        }
        return;
      }
      const li = items();
      if (k === "ArrowDown") mark(on + 1);
      else if (k === "ArrowUp") mark(on - 1);
      else if (k === "Home") mark(0);
      else if (k === "End") mark(li.length - 1);
      else if (k === "Enter" || k === " ") {
        const o = opts()[on];
        if (o) pick(o.value);
        else close(true);
      } else if (k === "Escape") close(true);
      else if (k === "Tab") return close(false);
      else if (k.length === 1 && /\S/.test(k)) {
        typed = Date.now() - typedAt > 700 ? k.toLowerCase() : typed + k.toLowerCase();
        typedAt = Date.now();
        const i = li.findIndex((x) => (x.textContent ?? "").trim().toLowerCase().startsWith(typed));
        if (i >= 0) mark(i);
      } else return;
      e.preventDefault();
    });
    // The checks focus the question that needs an answer: that's the button.
    sel.addEventListener("focus", () => btn.focus());
    btn.addEventListener("blur", (e) => {
      if (!list.contains(e.relatedTarget as Node | null)) close(false);
    });
    sync();
    // aria-invalid and the error's id are set on the select by the checks: the button follows. Only the select is
    // watched, so the button's own changes never call this again.
    new MutationObserver(sync).observe(sel, { attributes: true, attributeFilter: ["aria-invalid", "aria-describedby", "disabled", "required"] });
  });
  if (!all.length) return;
  const syncAll = () => all.forEach((f) => f());
  w.addEventListener("input", syncAll);
  w.addEventListener("change", syncAll);
}

/** Run a page in `w`. `onSend` gets the answers once every shown question checks out. */
export function runPage(w: HTMLElement, onSend: (v: Vals) => void): PageRun {
  const steps = [...w.querySelectorAll<HTMLElement>("[data-cl-step]")];
  const thanks = w.querySelector<HTMLElement>("[data-cl-thanks]");
  let at = 0;
  linkErrors(w);
  shuffle(w);
  pickers(w);
  let finished = false;
  const errFor = (n: string) => w.querySelector<HTMLElement>(`[data-cl-error-for="${CSS.escape(n)}"]`);
  // A page with a timer (data-cl-timer, in seconds) moves on by itself when its time is up.
  let timed = -1;
  let tick = 0;
  const timer = () => {
    const st = steps[at];
    const secs = Number(st?.getAttribute("data-cl-timer"));
    if (finished || !st || !(secs > 0)) {
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
    // A one-page form: the thank-you takes its place (the logo stays).
    if (finished && thanks && !steps.length) for (const x of around(thanks, w)) x.hidden = true;
    const pos = shown.indexOf(steps[at]!);
    const p = steps.length ? (finished ? 1 : (Math.max(0, pos) + 1) / Math.max(1, shown.length)) : finished ? 1 : 0;
    w.querySelectorAll<HTMLElement>("[data-cl-progress]").forEach((el) => el.style.setProperty("--cl-progress", String(p)));
    pipes(w, v);
    timer();
    return shown;
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
    const t = (e.target as Element | null)?.closest?.("[data-cl-next],[data-cl-back],[type=submit]");
    if (!t) return;
    e.preventDefault();
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
    errors: (byName) => {
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
