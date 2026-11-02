// What a studio page runs on (docs/forms-chat-plan.md, Part 3): steps, show-if, required checks, progress and the
// thanks. The form script (src/lib/forms/element.ts) runs it on live forms; the studio's preview runs the same rules.

export type Vals = Record<string, string | string[]>;

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

function clause(c: string, v: Vals): boolean {
  let m = /^([\w-]+)\s+(filled|empty)$/i.exec(c);
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
  const n = Number(list[0]);
  const t = Number(val);
  if (!Number.isFinite(n) || !Number.isFinite(t)) return false;
  return m[2] === ">" ? n > t : m[2] === "<" ? n < t : m[2] === ">=" ? n >= t : n <= t;
}

/** A show-if: clauses joined with and / or (and binds first). */
export const holds = (expr: string, v: Vals) => expr.split(/\s+or\s+/i).some((part) => part.split(/\s+and\s+/i).every((c) => clause(c.trim(), v)));

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type PageRun = { done(): void; errors(byName: Record<string, string>): void; busy(on: boolean): void; alert(text: string): void };

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

/** Focus always shows, choice cards with hidden inputs too, and motion stops for people who ask for less. */
export const ACCESS_CSS =
  "@layer base{:where(input,button,select,textarea,a,summary):focus-visible{outline:2px solid currentColor;outline-offset:2px}label:has(input:focus-visible){outline:2px solid currentColor;outline-offset:2px}}@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}";

/** Run a page in `w`. `onSend` gets the answers once every shown question checks out. */
export function runPage(w: HTMLElement, onSend: (v: Vals) => void): PageRun {
  const steps = [...w.querySelectorAll<HTMLElement>("[data-cl-step]")];
  const thanks = w.querySelector<HTMLElement>("[data-cl-thanks]");
  let at = 0;
  linkErrors(w);
  let finished = false;
  const errFor = (n: string) => w.querySelector<HTMLElement>(`[data-cl-error-for="${CSS.escape(n)}"]`);
  const apply = () => {
    const v = pageValues(w);
    w.querySelectorAll<HTMLElement>("[data-cl-show-if]").forEach((el) => {
      if (!el.hasAttribute("data-cl-step")) el.hidden = !holds(el.getAttribute("data-cl-show-if")!, v);
    });
    const shown = steps.filter((s) => !s.hasAttribute("data-cl-show-if") || holds(s.getAttribute("data-cl-show-if")!, v));
    steps.forEach((s, i) => (s.hidden = finished || i !== at));
    if (thanks) thanks.hidden = !finished;
    const pos = shown.indexOf(steps[at]!);
    const p = steps.length ? (finished ? 1 : (Math.max(0, pos) + 1) / Math.max(1, shown.length)) : finished ? 1 : 0;
    w.querySelectorAll<HTMLElement>("[data-cl-progress]").forEach((el) => el.style.setProperty("--cl-progress", String(p)));
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
        const s = steps.findIndex((st) => st.querySelector(`[name="${CSS.escape(n)}"]`));
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
