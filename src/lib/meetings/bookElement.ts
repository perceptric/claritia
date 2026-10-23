// The booking calendar on any site (docs/meetings-scheduler.md 1.8, 1.8b), in the same forms/v1.js script as
// <claritia-form>, so one script tag does forms and booking:
//   <script src="https://app.tryclaritia.com/forms/v1.js" async></script>
//   <claritia-book type="acme/demo"></claritia-book>                          inline, grows to fit
//   <claritia-book type="acme/demo" mode="button" text="Book a demo"></claritia-book>   a floating button
//   <a href="#" data-claritia-book="acme/demo">Book a demo</a>                 any link or button opens it in a popup
// `type` is <workspace>/<type or person>, a page address under /book/, or a full booking page link. The page runs
// in a frame from Claritia (the guest's details never touch the site around it); it reports its height and, after a
// booking, a `claritia:booked` event bubbles from the element (or the link) for the site's analytics.

const BOOK_BASE = (() => {
  try {
    const src = (document.currentScript as HTMLScriptElement | null)?.src;
    return src ? new URL(src).origin : "";
  } catch {
    return "";
  }
})();

type Msg = { claritia?: boolean; type?: string; height?: number; start?: number; end?: number };

/** The frame's address for a `type` value, on Claritia's own origin only. */
export function bookUrl(type: string, base: string, extra: Record<string, string | null> = {}): string | null {
  const v = (type || "").trim();
  if (!v || !base) return null;
  let path: string;
  if (/^https:\/\//.test(v)) {
    try {
      const u = new URL(v);
      if (u.origin !== base) return null;
      path = u.pathname;
    } catch {
      return null;
    }
  } else path = v.startsWith("/book/") ? v : `/book/${v.replace(/^\/+/, "")}`;
  if (!/^\/book\/[a-z0-9-]{3,40}(\/[a-z0-9-]{1,60})?\/?$|^\/book\/[lp]\/[A-Za-z0-9_-]{20,64}$/i.test(path)) return null;
  const q = new URLSearchParams({ embed: "1" });
  for (const [k, x] of Object.entries(extra)) if (x) q.set(k, x.slice(0, 320));
  return `${base}${path.replace(/\/$/, "")}?${q}`;
}

const frame = (src: string) => {
  const f = document.createElement("iframe");
  f.src = src;
  f.title = "Book a meeting";
  f.setAttribute("allow", "payment");
  f.style.cssText = "width:100%;height:640px;border:0;display:block;background:transparent;color-scheme:normal";
  return f;
};

/** Follows the page's height and passes its booking on, while the frame lives. */
function listen(f: HTMLIFrameElement, from: Element, onHeight?: (h: number) => void) {
  const on = (e: MessageEvent) => {
    if (e.source !== f.contentWindow || e.origin !== BOOK_BASE) return;
    const d = e.data as Msg | null;
    if (!d || d.claritia !== true) return;
    if (d.type === "book:height" && typeof d.height === "number") {
      const h = Math.max(200, Math.min(4000, Math.round(d.height)));
      if (onHeight) onHeight(h);
      else f.style.height = `${h}px`;
    }
    if (d.type === "book:booked") from.dispatchEvent(new CustomEvent("claritia:booked", { bubbles: true, composed: true, detail: { start: d.start, end: d.end } }));
  };
  window.addEventListener("message", on);
  return () => window.removeEventListener("message", on);
}

/** The calendar over the page. */
export function openBooking(type: string, from: Element = document.body, extra: Record<string, string | null> = {}) {
  const src = bookUrl(type, BOOK_BASE, extra);
  if (!src) return;
  const back = document.createElement("div");
  back.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;transition:opacity .14s";
  const box = document.createElement("div");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", "Book a meeting");
  box.style.cssText = "position:relative;width:100%;max-width:1060px;max-height:92vh;overflow:auto;border-radius:16px;background:#fff;box-shadow:0 24px 64px rgba(0,0,0,.25)";
  const close = document.createElement("button");
  close.type = "button";
  close.setAttribute("aria-label", "Close");
  close.textContent = "×";
  close.style.cssText = "position:absolute;top:8px;right:10px;z-index:1;width:32px;height:32px;border:0;border-radius:999px;background:rgba(0,0,0,.06);font:20px/1 sans-serif;cursor:pointer;color:#333";
  const f = frame(src);
  const stop = listen(f, from);
  const prev = document.activeElement as HTMLElement | null;
  const done = () => {
    stop();
    back.remove();
    document.removeEventListener("keydown", esc);
    prev?.focus?.();
  };
  const esc = (e: KeyboardEvent) => e.key === "Escape" && done();
  close.addEventListener("click", done);
  back.addEventListener("click", (e) => e.target === back && done());
  document.addEventListener("keydown", esc);
  box.append(close, f);
  back.append(box);
  document.body.append(back);
  requestAnimationFrame(() => (back.style.opacity = "1"));
  close.focus();
}

const BBase = (typeof HTMLElement === "undefined" ? class {} : HTMLElement) as typeof HTMLElement;

export class ClaritiaBook extends BBase {
  static observedAttributes = ["type", "mode"];
  private stop: (() => void) | null = null;
  connectedCallback() {
    this.draw();
  }
  disconnectedCallback() {
    this.stop?.();
    this.stop = null;
  }
  attributeChangedCallback() {
    if (this.isConnected) this.draw();
  }
  private extra() {
    return { name: this.getAttribute("name"), email: this.getAttribute("email") };
  }
  private draw() {
    this.stop?.();
    this.stop = null;
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    root.replaceChildren();
    const type = this.getAttribute("type") ?? "";
    if (this.getAttribute("mode") === "button") {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = this.getAttribute("text") || "Book a meeting";
      b.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483000;padding:12px 20px;border:0;border-radius:999px;background:var(--claritia-book-bg,#111);color:var(--claritia-book-text,#fff);font:600 15px/1.2 system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.2)";
      b.addEventListener("click", () => openBooking(type, this, this.extra()));
      root.append(b);
      return;
    }
    const src = bookUrl(type, BOOK_BASE, this.extra());
    if (!src) return;
    const style = document.createElement("style");
    style.textContent = ":host{display:block}";
    const f = frame(src);
    root.append(style, f);
    this.stop = listen(f, this);
  }
}

if (typeof customElements !== "undefined" && !customElements.get("claritia-book")) customElements.define("claritia-book", ClaritiaBook);

// Any element with data-claritia-book opens the calendar in a popup.
if (typeof document !== "undefined")
  document.addEventListener("click", (e) => {
    const t = (e.target as Element | null)?.closest?.("[data-claritia-book]");
    if (!t) return;
    e.preventDefault();
    openBooking(t.getAttribute("data-claritia-book") ?? "", t, { name: t.getAttribute("data-name"), email: t.getAttribute("data-email") });
  });
