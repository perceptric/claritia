// Parts of a studio page that load with the form script's second part (x1.js, src/lib/forms/extras.ts), only on
// forms that use them, so the main script stays small: the form's own dropdowns in place of <select>, and the photos
// on the welcome screen, the pages and the end screen (docs/forms-media-plan.md). The Studio draws with the same
// code. Browser only.

import { focusOf, layoutOf, mediaOk, sizedUrl, srcsetOf, widthsOf } from "../forms/media.ts";
export { ONE_CSS, oneKeys, splitOne } from "./one.ts";

/** Whether a page needs these parts. */
export const needsParts = (html: string) => /<select[\s>]|data-cl-media=|data-cl-one[\s=>]/.test(html);

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

/**
 * Photos on screens (docs/forms-media-plan.md): beside the words (left or right, 40% of the box, edge to edge), a band
 * across the top, or behind the words with a flat shade so they read. A narrow box (a phone) puts a side photo on top.
 * The welcome screen hides the rest of the page until Start. The form fills its box either way: no stage or card.
 */
export const MEDIA_CSS =
  ".cl-fig{margin:0;overflow:hidden;background:rgba(127,127,127,.12)}.cl-fig img{display:block;width:100%;height:100%;object-fit:cover}" +
  ".page.page[data-cl-lay]{position:relative;box-sizing:border-box;display:flex;flex-direction:column}" +
  ".page.page[data-cl-lay=left]:not([data-cl-narrow]),.page.page[data-cl-lay=right]:not([data-cl-narrow]),.page.page[data-cl-lay=behind]{min-height:540px;justify-content:center}" +
  ".page.page[data-cl-lay=left]:not([data-cl-narrow]){padding-left:calc(40% + clamp(24px,4vw,48px))}.page.page[data-cl-lay=right]:not([data-cl-narrow]){padding-right:calc(40% + clamp(24px,4vw,48px))}" +
  ".page[data-cl-lay=left]:not([data-cl-narrow])>.cl-fig,.page[data-cl-lay=right]:not([data-cl-narrow])>.cl-fig{position:absolute;top:0;bottom:0;width:40%}.page[data-cl-lay=left]>.cl-fig{left:0}.page[data-cl-lay=right]>.cl-fig{right:0}" +
  ".page.page[data-cl-lay=top],.page.page[data-cl-narrow][data-cl-lay=left],.page.page[data-cl-narrow][data-cl-lay=right]{padding-top:calc(var(--cl-band) + clamp(20px,4vw,40px))}" +
  ".page[data-cl-lay=top]{--cl-band:180px}.page[data-cl-narrow][data-cl-lay=left],.page[data-cl-narrow][data-cl-lay=right]{--cl-band:220px}" +
  ".page[data-cl-lay=top]>.cl-fig,.page[data-cl-narrow][data-cl-lay=left]>.cl-fig,.page[data-cl-narrow][data-cl-lay=right]>.cl-fig{position:absolute;top:0;left:0;right:0;height:var(--cl-band)}" +
  ".page[data-cl-lay=behind]>.cl-fig{position:absolute;inset:0}.page[data-cl-lay=behind]>.cl-fig::after{content:'';position:absolute;inset:0;background:rgba(0,0,0,.45)}" +
  ".page[data-cl-lay=behind]>:not(.cl-fig){position:relative;z-index:1}.page[data-cl-lay=behind] :is(.heading,.text,.label,.help){color:#fff}" +
  "[data-cl-cover]{display:flex;flex-direction:column;align-items:flex-start;gap:14px;max-width:620px;box-sizing:border-box}[data-cl-cover]>.logo{margin-bottom:6px}" +
  ".page[data-cl-lay=behind]>[data-cl-cover],.page:not([data-cl-lay])>[data-cl-cover]{align-items:center;text-align:center;margin-inline:auto}" +
  "[data-cl-cover] .btn{margin-top:8px}";

const narrowSeen = new WeakSet<Element>();
/** Photos that failed to load: never tried again on the next screen, so the page doesn't jump under a click. */
const failedPhotos = new Set<string>();
/** A side photo goes on top when the box is narrow (a phone, a thin column on a site). */
function watchNarrow(page: HTMLElement) {
  if (narrowSeen.has(page)) return;
  narrowSeen.add(page);
  const set = () => page.toggleAttribute("data-cl-narrow", page.getBoundingClientRect().width < 680);
  set();
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(set).observe(page);
}

/**
 * The photo for the screen showing (the welcome screen, a page or the end screen), from its data-cl-media,
 * data-cl-layout, data-cl-focus, data-cl-alt and data-cl-sizes. A picture that isn't allowed, or that fails to load,
 * leaves the screen as plain words: the form still works.
 */
export function showMedia(page: HTMLElement, screen: Element | null) {
  const url = screen?.getAttribute("data-cl-media")?.trim() ?? "";
  const lay = screen ? layoutOf(screen.getAttribute("data-cl-layout"), screen.hasAttribute("data-cl-step")) : null;
  let fig = page.querySelector<HTMLElement>(":scope > .cl-fig");
  if (!screen || !lay || !mediaOk(url) || failedPhotos.has(url)) {
    page.removeAttribute("data-cl-lay");
    fig?.remove();
    return;
  }
  watchNarrow(page);
  const doc = page.ownerDocument;
  if (!fig) {
    fig = doc.createElement("figure");
    fig.className = "cl-fig";
  }
  if (page.firstElementChild !== fig) page.prepend(fig);
  let img = fig.querySelector("img");
  if (!img) {
    img = doc.createElement("img");
    img.decoding = "async";
    img.addEventListener("error", () => {
      const bad = img!.getAttribute("data-cl-url");
      if (bad) failedPhotos.add(bad);
      page.removeAttribute("data-cl-lay");
      fig!.remove();
    });
    fig.append(img);
  }
  const widths = widthsOf(url, screen.getAttribute("data-cl-sizes"));
  const src = widths.includes(1280) ? sizedUrl(url, 1280) : url;
  if (img.getAttribute("src") !== src) {
    const set = srcsetOf(url, widths);
    if (set) {
      img.srcset = set;
      img.sizes = lay === "left" || lay === "right" ? "(max-width: 680px) 100vw, 40vw" : "100vw";
    } else img.removeAttribute("srcset");
    img.setAttribute("data-cl-url", url);
    img.src = src;
  }
  const alt = screen.getAttribute("data-cl-alt")?.trim() ?? "";
  img.alt = alt;
  fig.setAttribute("aria-hidden", alt ? "false" : "true");
  img.style.objectPosition = focusOf(screen.getAttribute("data-cl-focus"));
  page.setAttribute("data-cl-lay", lay);
}

