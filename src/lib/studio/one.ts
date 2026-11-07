// One question at a time (docs/forms-media-plan.md Part 4): a studio page whose <form> has data-cl-one shows each
// question on its own screen. Before the page runs, each question is moved into a step of its own
// (data-cl-one-step), keeping its page's show-if, so the page's own rules (show-if, required checks, progress, timers,
// the send) run exactly as they do for pages. Then the keys: Enter goes on (Shift+Enter is a new line in long text),
// a letter picks a choice, and a single pick moves on by itself. Loads with the form script's second part. Browser.

/** The look: big questions, one screen at a time, sliding in. Colors and fonts stay the brand's. */
export const ONE_CSS =
  "[data-cl-one-step]{min-height:min(420px,70vh);display:flex;flex-direction:column;justify-content:center;gap:20px}" +
  "[data-cl-one-step]:not([hidden]){animation:cl-one-in .24s cubic-bezier(.2,.8,.2,1)}@keyframes cl-one-in{from{opacity:0;transform:translateY(10px)}}" +
  "[data-cl-one-step] .label,[data-cl-one-step] legend.label{font-size:clamp(19px,3.2vw,24px);line-height:1.3;font-weight:600}" +
  "[data-cl-one-step] label[data-cl-key]{gap:10px}[data-cl-one-step] label[data-cl-key]::before{content:attr(data-cl-key);flex:none;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border:1px solid currentColor;border-radius:4px;font-size:12px;font-weight:600;opacity:.6}" +
  ".cl-one-nav{display:flex;flex-wrap:wrap;gap:8px;align-items:center}";

/** Whether a page asks one question at a time. */
export const isOne = (w: ParentNode) => !!w.querySelector("form[data-cl-one]");

const UNIT = ".q,[data-cl-field],fieldset";
const NAV = "[data-cl-next],[data-cl-back]";
/** Blocks that show something and take no answer: they go with the questions around them. */
const SHOWN = new Set(["hidden", "calc", "payment", "result", "image", "video"]);

/** A show-if for both: every way one holds, with every way the other holds ("and" binds before "or"). */
export function bothIf(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  const pa = a.split(/\s+or\s+/i), pb = b.split(/\s+or\s+/i);
  return pa.flatMap((x) => pb.map((y) => `${x.trim()} and ${y.trim()}`)).join(" or ");
}

/** A question on a screen: its box, and the words just before it when the page didn't put them inside. */
type Unit = { el: HTMLElement; head: Node[] };
const firstOf = (u: Unit) => u.head[0] ?? u.el;
const HEADS = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "LABEL", "LEGEND", "P"]);
const NAMED = "input[name]:not([type=hidden]),textarea[name],select[name]";

/**
 * The questions in a page, in order: the outermost question boxes that take an answer (.q, a block, a fieldset), and
 * questions the page wrote loose (inputs that share a name, in the biggest box that holds only them, with the heading
 * or label just before it).
 */
function unitsOf(scope: Element): Unit[] {
  const all = [...scope.querySelectorAll<HTMLElement>(UNIT)].filter((u) => !u.closest("[data-cl-thanks]") && !SHOWN.has(u.getAttribute("data-cl-field") ?? "") && !u.querySelector(NAV) && !u.closest(NAV) && !u.closest(".cl-consent"));
  const asks = (u: HTMLElement) => (u.hasAttribute("data-cl-field") && !SHOWN.has(u.getAttribute("data-cl-field")!)) || !!u.querySelector("input:not([type=hidden]),textarea,select,[data-cl-field]:not([data-cl-field=hidden])");
  const boxes = all.filter((u) => !all.some((o) => o !== u && o.contains(u)) && asks(u));
  const out: Unit[] = boxes.map((el) => ({ el, head: [] }));
  const names = (el: Element) => new Set([...el.querySelectorAll<HTMLInputElement>(NAMED)].map((x) => x.name));
  const loose = [...scope.querySelectorAll<HTMLInputElement>(NAMED)].filter((x) => !boxes.some((b) => b.contains(x)) && !x.closest(NAV) && !x.closest("[data-cl-thanks]") && !x.closest(".cl-consent,.trap"));
  const byName = new Map<string, HTMLElement[]>();
  for (const x of loose) byName.set(x.name, [...(byName.get(x.name) ?? []), x]);
  for (const [name, group] of byName) {
    let g: HTMLElement = group[0]!;
    while (!group.every((x) => g.contains(x)) && g.parentElement && g.parentElement !== scope) g = g.parentElement;
    for (let up = g.parentElement; up && up !== scope && !boxes.some((b) => up!.contains(b)) && !up.querySelector(NAV) && [...names(up)].every((n) => n === name); up = up.parentElement) g = up;
    const prev = g.previousElementSibling;
    const head = prev && HEADS.has(prev.tagName) && !prev.querySelector(NAMED) && !prev.querySelector(NAV) ? [prev] : [];
    out.push({ el: g, head });
  }
  return out.sort((x, y) => (firstOf(x).compareDocumentPosition(firstOf(y)) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
}

/** What's before `node` inside `root`, outermost first: its earlier siblings at each level up to `root`. */
function before(node: Node, root: Node): Node[] {
  const out: Node[] = [];
  for (let n: Node | null = node; n && n !== root && n.parentNode; n = n.parentNode) {
    const sibs: Node[] = [];
    for (let x: ChildNode | null = n.parentNode.firstChild; x && x !== n; x = x.nextSibling) sibs.push(x);
    out.unshift(...sibs);
  }
  return out;
}
/** What's after `node` inside `root`, in page order. */
function after(node: Node, root: Node): Node[] {
  const out: Node[] = [];
  for (let n: Node | null = node; n && n !== root && n.parentNode; n = n.parentNode) for (let x = n.nextSibling; x; x = x.nextSibling) out.push(x);
  return out;
}
const blank = (n: Node) => n.nodeType === 3 ? !(n.textContent ?? "").trim() : n.nodeType === 8;

/**
 * Split the page into one question a screen. Each question becomes its own step, keeping its page's show-if; a page's
 * words before its first question go with that question, words between questions with the next one, and what's left
 * of a page after its last question goes with that question's screen, so nothing on the page is ever lost: hidden
 * values, totals and the send button included. The send button ends up on the last screen. Returns, for each new step,
 * the page it came from, or [] when the page doesn't ask for it.
 */
export function splitOne(w: HTMLElement): number[] {
  const form = w.querySelector<HTMLElement>("form[data-cl-one]");
  if (!form || form.hasAttribute("data-cl-split")) return [];
  form.setAttribute("data-cl-split", "");
  const doc = w.ownerDocument;
  const thanks = form.querySelector("[data-cl-thanks]");
  const stepsOld = [...form.querySelectorAll<HTMLElement>("[data-cl-step]")].filter((s) => !s.closest("[data-cl-thanks]"));
  const pages: HTMLElement[] = stepsOld.length ? stepsOld : [form];
  if (!pages.some((pg) => unitsOf(pg).length)) {
    form.removeAttribute("data-cl-split");
    return [];
  }
  // Where the new screens go: where the first page was.
  const mark = doc.createComment("");
  const firstUnit = unitsOf(pages[0]!)[0];
  if (stepsOld.length) stepsOld[0]!.before(mark);
  else {
    let top: Node = firstOf(firstUnit!);
    while (top.parentNode && top.parentNode !== form) top = top.parentNode;
    top.parentNode!.insertBefore(mark, top);
  }
  const out: HTMLElement[] = [];
  const from: number[] = [];
  const keep = (n: Node) => !blank(n) && !(n instanceof Element && (n === thanks || n.contains(thanks)));
  pages.forEach((pg, pi) => {
    const units = unitsOf(pg);
    if (!units.length) {
      // A page with no questions (a review, a statement): a screen as it is.
      if (pg === form) return;
      pg.setAttribute("data-cl-one-step", "");
      out.push(pg);
      from.push(pi);
      return;
    }
    const showIf = pg === form ? null : pg.getAttribute("data-cl-show-if");
    const lead = before(firstOf(units[0]!), pg).filter((n) => keep(n) && !(n instanceof Element && n.hasAttribute("data-cl-one-step")) && n !== mark);
    const tail = after(units[units.length - 1]!.el, pg).filter(keep);
    const secs = units.map((u, ui) => {
      const sec = doc.createElement("section");
      sec.setAttribute("data-cl-step", "");
      sec.setAttribute("data-cl-one-step", "");
      const cond = bothIf(showIf, u.el.getAttribute("data-cl-show-if"));
      if (cond) sec.setAttribute("data-cl-show-if", cond);
      // Words between this question and the one before it, at the same level, come with it.
      const mid: Node[] = [];
      const start = firstOf(u);
      if (ui > 0 && units[ui - 1]!.el.parentNode === start.parentNode) for (let x = units[ui - 1]!.el.nextSibling; x && x !== start; x = x.nextSibling) if (keep(x)) mid.push(x);
      sec.append(...(ui === 0 ? lead : mid), ...u.head, u.el);
      return sec;
    });
    // What's left of the page (its buttons, hidden values, totals, empty wrappers) goes with its last question.
    secs[secs.length - 1]!.append(...tail);
    if (pg !== form) for (const n of [...pg.childNodes]) if (keep(n)) secs[secs.length - 1]!.append(n);
    out.push(...secs);
    secs.forEach(() => from.push(pi));
  });
  for (const s of out) mark.before(s);
  mark.remove();
  for (const s of stepsOld) if (!out.includes(s)) s.remove();
  // A one-page form: anything still outside the screens (an empty wrapper, a hidden value) goes on the last screen.
  if (!stepsOld.length) for (const n of [...form.childNodes]) if (!out.includes(n as HTMLElement) && keep(n)) out[out.length - 1]!.append(n);
  // The send button on the last screen; every screen's own buttons: Back, and OK until the last.
  const last = out[out.length - 1]!;
  const send = [...form.querySelectorAll<HTMLElement>("[type=submit]")].find((b) => !b.closest("[data-cl-thanks]"));
  if (send && !last.contains(send)) last.append(send);
  out.forEach((s, i) => {
    s.querySelectorAll(NAV).forEach((b) => b.remove());
    const row = doc.createElement("div");
    row.className = "nav cl-one-nav";
    const btn = (cls: string, attr: string, text: string) => {
      const b = doc.createElement("button");
      b.type = "button";
      b.className = cls;
      b.setAttribute(attr, "");
      b.textContent = text;
      return b;
    };
    if (i > 0) row.append(btn("btn-secondary", "data-cl-back", "Back"));
    if (s !== last) row.append(btn("btn", "data-cl-next", "OK"));
    if (!row.childNodes.length) return;
    // On the last screen, Back sits before the row that holds the send button.
    let top: Node | null = s === last && send ? send : null;
    while (top && top.parentNode && top.parentNode !== s) top = top.parentNode;
    s.insertBefore(row, top && top.parentNode === s ? top : null);
  });
  return from;
}

/** The keys and the moving on by itself, for a split page in `w`. */
export function oneKeys(w: HTMLElement) {
  if (w.hasAttribute("data-cl-one-keys")) return;
  w.setAttribute("data-cl-one-keys", "");
  const current = () => [...w.querySelectorAll<HTMLElement>("[data-cl-one-step]")].find((s) => !s.hidden && !s.closest("[hidden]")) ?? null;
  const choicesIn = (s: Element) => [...s.querySelectorAll<HTMLInputElement>("input[type=radio],input[type=checkbox]")].filter((x) => !x.closest("[hidden]") && !x.closest(".cl-consent"));
  const fields = (s: Element) => [...s.querySelectorAll<HTMLElement>("input:not([type=hidden]),textarea,select,button.cl-pick")].filter((x) => !x.closest("[hidden]") && !x.closest(".cl-consent") && !(x as HTMLInputElement).classList?.contains("cl-native"));
  const go = (s: HTMLElement) => (s.querySelector<HTMLButtonElement>(".cl-one-nav [data-cl-next]") ?? s.querySelector<HTMLButtonElement>("[type=submit]"))?.click();
  // Letters on the choices, A to Z.
  const keys = () =>
    w.querySelectorAll<HTMLElement>("[data-cl-one-step]").forEach((s) => {
      const c = [...s.querySelectorAll<HTMLInputElement>("input[type=radio],input[type=checkbox]")].filter((x) => !x.closest(".cl-consent"));
      if (c.length > 1 && c.length <= 26) c.forEach((x, i) => x.closest("label")?.setAttribute("data-cl-key", String.fromCharCode(65 + i)));
    });
  keys();
  // After a move, the new screen's first answer is ready to type in.
  let seen: HTMLElement | null = current();
  const settle = () =>
    requestAnimationFrame(() => {
      const s = current();
      if (s && s !== seen) {
        seen = s;
        const f = fields(s)[0];
        if (f && !s.contains((w.getRootNode() as Document | ShadowRoot).activeElement)) f.focus({ preventScroll: true });
      }
    });
  w.addEventListener("click", (e) => { if ((e.target as Element | null)?.closest?.("[data-cl-next],[data-cl-back],[data-cl-start]")) settle(); });
  w.addEventListener("keydown", (e) => {
    const s = current();
    if (!s || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target as HTMLElement;
    const typing = t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && !["radio", "checkbox", "button", "submit"].includes((t as HTMLInputElement).type));
    if (e.key === "Enter" && !e.isComposing) {
      if (t.tagName === "BUTTON" || t.closest(".cl-list") || (t.tagName === "TEXTAREA" && e.shiftKey)) return;
      e.preventDefault();
      go(s);
      settle();
      return;
    }
    if (typing || e.key.length !== 1) return;
    const i = e.key.toUpperCase().charCodeAt(0) - 65;
    const c = choicesIn(s);
    if (i < 0 || i >= c.length || c.length > 26) return;
    e.preventDefault();
    const x = c[i]!;
    if (x.type === "radio") x.checked = true;
    else x.checked = !x.checked;
    x.focus();
    x.dispatchEvent(new Event("input", { bubbles: true }));
    x.dispatchEvent(new Event("change", { bubbles: true }));
  });
  // A single pick moves on by itself after a moment, once, and only from the screen it was made on. Never on the
  // last screen: sending stays a press of the button.
  w.addEventListener("change", (e) => {
    const x = e.target as HTMLInputElement;
    const s = current();
    if (!s || x.type !== "radio" || !x.checked || !s.contains(x)) return;
    const all = fields(s);
    const names = new Set(all.map((f) => (f as HTMLInputElement).name));
    if (names.size !== 1 || all.some((f) => (f as HTMLInputElement).type !== "radio")) return;
    if (!s.querySelector(".cl-one-nav [data-cl-next]")) return;
    setTimeout(() => {
      if (current() === s && x.checked) {
        go(s);
        settle();
      }
    }, 300);
  });
}
