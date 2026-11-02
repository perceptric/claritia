// window.Claritia, the script's API (docs/embed.md), in the same forms/v1.js as <claritia-form> and <claritia-book>:
//   Claritia.open("<form id>", { prefill: { email }, size: "l" })   a form over the page, made if the page has none
//   Claritia.open("acme/demo")                                     a meeting's calendar over the page
//   Claritia.close()                                               closes what's open (or one form: close(id))
//   Claritia.prefill({ email, company })                           fills the page's forms (or one: prefill(v, id))
//   const off = Claritia.on("submitted", (d) => …)                 ready, step, open, close, submitted, booked
// A page can call before the script loads: window.Claritia = window.Claritia || { q: [] }; Claritia.q.push(["open",
// "…"]) runs once it's here.
import { closeBooking, openBooking } from "../meetings/bookElement.ts";

export const EVENTS = ["ready", "step", "open", "close", "submitted", "booked"] as const;
export type EventName = (typeof EVENTS)[number];
type FormEl = HTMLElement & { open(): void; close(): void; prefill(v: Record<string, unknown>): void };
type OpenOptions = { prefill?: Record<string, string>; size?: "s" | "m" | "l" };

const FORM_ID = /^[0-9a-f-]{36}$/;
const OVER = ["popup", "popover", "slider", "side-tab"];
const forms = (id?: string) => [...document.querySelectorAll<FormEl>(id ? `claritia-form[form-id="${CSS.escape(id)}"]` : "claritia-form")];

export const Claritia = {
  version: 1,
  open(target: string, o: OpenOptions = {}) {
    if (typeof target !== "string") return;
    if (FORM_ID.test(target)) {
      let el = forms(target).find((f) => OVER.some((a) => f.hasAttribute(a)));
      if (!el) {
        // A form in the page has nothing to open over the page: one is made for the call.
        el = document.createElement("claritia-form") as FormEl;
        el.setAttribute("form-id", target);
        el.setAttribute("popup", "click");
        el.setAttribute("size", o.size && /^[sml]$/.test(o.size) ? o.size : "m");
        document.body.append(el);
      }
      if (o.prefill) el.prefill(o.prefill);
      el.open();
      return;
    }
    openBooking(target, document.body, { name: o.prefill?.name ?? null, email: o.prefill?.email ?? null });
  },
  close(id?: string) {
    for (const f of forms(id)) f.close();
    if (!id) closeBooking();
  },
  prefill(values: Record<string, unknown>, id?: string) {
    for (const f of forms(id)) f.prefill(values);
  },
  on(event: EventName, fn: (detail: Record<string, unknown>) => void): () => void {
    if (!EVENTS.includes(event) || typeof fn !== "function") return () => undefined;
    const h = (e: Event) => fn(((e as CustomEvent).detail ?? {}) as Record<string, unknown>);
    document.addEventListener(`claritia:${event}`, h);
    return () => document.removeEventListener(`claritia:${event}`, h);
  },
};

if (typeof window !== "undefined") {
  const w = window as unknown as { Claritia?: { q?: unknown[] } };
  const queued = Array.isArray(w.Claritia?.q) ? w.Claritia!.q! : [];
  (window as unknown as { Claritia: typeof Claritia }).Claritia = Claritia;
  for (const call of queued) {
    if (!Array.isArray(call)) continue;
    const [name, ...args] = call as [string, ...unknown[]];
    const fn = (Claritia as Record<string, unknown>)[name];
    if (typeof fn === "function") (fn as (...a: unknown[]) => unknown).apply(Claritia, args);
  }
}
