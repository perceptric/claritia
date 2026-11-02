// @claritia/embed: Claritia's forms and meeting calendars on any site (https://tryclaritia.com/developers/embed).
// It loads the one script (forms/v1.js) once, and passes calls to window.Claritia, which the script defines. Events
// bubble from the elements to the document, so `on` works before the script has loaded.

export const DEFAULT_HOST = "https://app.tryclaritia.com";

export type FormMode = "inline" | "full" | "popup" | "slider" | "popover" | "sidetab";
export type FormOptions = {
  mode?: FormMode;
  /** Popup and slider: a click on a button, a number of seconds, or leaving the page. */
  opens?: "click" | number | "exit";
  size?: "s" | "m" | "l";
  side?: "left" | "right";
  /** The side tab's words. */
  text?: string;
  icon?: "chat" | "calendar" | "form" | "logo";
  note?: string;
  /** Not again by itself for someone who already sent it. */
  once?: boolean;
  /** Over the page on a phone: the whole screen (default), or as on a computer. */
  phoneFull?: boolean;
};
export type BookOptions = { mode?: "inline" | "button"; text?: string; phoneFull?: boolean };
export type EventName = "ready" | "step" | "open" | "close" | "submitted" | "booked";
export type EventDetail = { formId?: string | null; step?: number; of?: number; submissionId?: string | null; start?: number; end?: number };

export type ClaritiaApi = {
  version: number;
  open(target: string, o?: { prefill?: Record<string, string>; size?: "s" | "m" | "l" }): void;
  close(id?: string): void;
  prefill(values: Record<string, string | number>, id?: string): void;
  on(event: EventName, fn: (d: EventDetail) => void): () => void;
};

type Win = { Claritia?: ClaritiaApi & { q?: unknown[] } };
let loading: Promise<ClaritiaApi> | null = null;

/** Loads the script once (a page that already has it keeps that one). Resolves with window.Claritia. */
export function load(host: string = DEFAULT_HOST): Promise<ClaritiaApi> {
  if (typeof window === "undefined") return Promise.reject(new Error("Claritia runs in the browser."));
  const w = window as unknown as Win;
  if (w.Claritia && typeof w.Claritia.open === "function") return Promise.resolve(w.Claritia);
  if (loading) return loading;
  const src = `${host.replace(/\/+$/, "")}/forms/v1.js`;
  loading = new Promise<ClaritiaApi>((resolve, reject) => {
    const done = () => (w.Claritia && typeof w.Claritia.open === "function" ? resolve(w.Claritia) : reject(new Error("Claritia's script didn't start.")));
    const have = [...document.querySelectorAll<HTMLScriptElement>("script[src]")].find((s) => /\/forms\/v1(\.[\w-]+)?\.js(\?|$)/.test(s.src));
    if (have) {
      have.addEventListener("load", done);
      have.addEventListener("error", () => reject(new Error("Claritia's script couldn't load.")));
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = done;
    s.onerror = () => {
      loading = null;
      reject(new Error("Claritia's script couldn't load."));
    };
    document.head.append(s);
  });
  return loading;
}

/** A form over the page (one is made if the page has none), or a meeting's calendar ("workspace/type"). */
export async function open(target: string, o?: { prefill?: Record<string, string>; size?: "s" | "m" | "l"; host?: string }) {
  (await load(o?.host)).open(target, o);
}
export async function close(id?: string, host?: string) {
  (await load(host)).close(id);
}
/** Fill the page's forms (or one form) by question key: "email", "company", a custom field's name. */
export async function prefill(values: Record<string, string | number>, id?: string, host?: string) {
  (await load(host)).prefill(values, id);
}
/** Listen to every form and calendar on the page; returns the function that stops listening. */
export function on(event: EventName, fn: (d: EventDetail) => void): () => void {
  if (typeof document === "undefined") return () => undefined;
  const h = (e: Event) => fn(((e as CustomEvent).detail ?? {}) as EventDetail);
  document.addEventListener(`claritia:${event}`, h);
  return () => document.removeEventListener(`claritia:${event}`, h);
}

/** The <claritia-form> attributes for a mode, the same ones Claritia's Share tab writes. */
export function formAttributes(id: string, o: FormOptions = {}): Record<string, string> {
  const a: Record<string, string> = { "form-id": id };
  const mode = o.mode ?? "inline";
  const opens = o.opens ?? "click";
  const popup = opens === "click" ? "click" : opens === "exit" ? "exit" : `delay:${Math.max(0, Math.min(999, Math.round(opens)))}`;
  if (mode === "full") a.full = "";
  if (mode === "popup") Object.assign(a, { popup, size: o.size ?? "m" });
  if (mode === "slider") Object.assign(a, { slider: o.side === "left" ? "left" : "right", popup });
  if (mode === "popover") {
    Object.assign(a, { popover: "", icon: o.icon ?? "chat" });
    if (o.note?.trim()) a.note = o.note.trim().slice(0, 60);
  }
  if (mode === "sidetab") a["side-tab"] = (o.text || "Contact us").trim().slice(0, 40);
  if (o.once && (mode === "popup" || mode === "slider") && opens !== "click") a.once = "";
  if (o.phoneFull === false && mode !== "inline" && mode !== "full") a.mobile = "keep";
  return a;
}

/** The <claritia-book> attributes. `type` is "<workspace>/<meeting type>". */
export function bookAttributes(type: string, o: BookOptions = {}): Record<string, string> {
  const a: Record<string, string> = { type };
  if (o.mode === "button") Object.assign(a, { mode: "button", text: (o.text || "Book a meeting").slice(0, 60) });
  if (o.phoneFull === false) a.mobile = "keep";
  return a;
}
