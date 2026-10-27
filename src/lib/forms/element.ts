// <claritia-form>: the form visitors fill (docs/form-builder.md Part 6). A web component, so one script line works in
// plain HTML, Webflow, Framer, WordPress or React. It draws the published schema inside a shadow root with the brand
// kit's tokens, checks answers as people go, and sends the fill once. A send that can't reach us waits in
// localStorage with its idem key and is tried again for 24 hours; the server treats a repeat key as the same fill.
//   <script src="https://app.tryclaritia.com/forms/v1.js" async></script>
//   <claritia-form form-id="…"></claritia-form>
// Every label and answer is set as text, never as HTML. Choice lists are the component's own listbox, never <select>.
// A form that books with Claritia calendar swaps to the inline calendar after the send (docs/meetings-scheduler.md
// Part 2); a captured form opens it over the page, or on the thank-you page the team's form goes to.

import { tokensCss, type Tokens } from "./brand.ts";
import { byDay, dayText, localZone, sampleSlots, timeText, zoneName, zones, type Booked, type Booking } from "./calendar.ts";
import { countryNames } from "./countries.ts";
import { allFields, isContent, nextStep, optionsFor, safeUrl, visibility, withCalcs, type Choice, type Field, type FieldWidth, type Form, type RunCtx } from "./schema.ts";
import { checkAnswers, OTHER, stepPath, type Answers } from "./values.ts";

type Loaded = { id: string; version: number; status: "live" | "paused"; body: Form; tokens: Partial<Tokens>; strict?: boolean; turnstile?: string };
type Queued = { url: string; body: string; key: string; at: number; tries: number };

const QUEUE = "clr_form_queue";
const DAY = 86_400_000;
const SCRIPT_BASE = (() => {
  try {
    const src = (document.currentScript as HTMLScriptElement | null)?.src;
    return src ? new URL(src).origin : "";
  } catch {
    return "";
  }
})();

const STYLES = `
:host{display:block;all:initial;font-family:var(--clr-font);font-size:var(--clr-size);color:var(--clr-text);line-height:1.45}
*{box-sizing:border-box;font:inherit;color:inherit}
.f{background:var(--clr-bg);display:flex;flex-direction:column;gap:var(--clr-gap);max-width:var(--clr-width,480px);container-type:inline-size}
.h{font-family:var(--clr-heading-font);font-size:1.45em;font-weight:600;margin:0;line-height:1.2}
.i{margin:0;color:var(--clr-muted)}
.nt{font-size:.85em}
.sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.pop{position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto}
.pop[hidden]{display:none}
.pbox{position:relative;background:var(--clr-bg);padding:28px;max-width:calc(var(--clr-width,480px) + 56px);width:100%;max-height:calc(100vh - 32px);overflow:auto}
.px{position:absolute;top:8px;right:8px;width:32px;height:32px;border:0;background:transparent;cursor:pointer;font-size:20px;line-height:1;color:var(--clr-muted)}
.pg{display:flex;flex-direction:column;gap:8px}
.st{margin:0;font-size:.85em;color:var(--clr-muted)}
.pb{height:4px;border-radius:4px;overflow:hidden;background:color-mix(in srgb,var(--clr-muted) 22%,transparent)}
.pb i{display:block;height:100%;background:var(--clr-accent);transform-origin:left}
.pd{display:flex;gap:6px}
.pd i{width:8px;height:8px;border-radius:50%;background:color-mix(in srgb,var(--clr-muted) 30%,transparent)}
.pd i.on{background:var(--clr-accent)}
.g{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:var(--clr-gap)}
.fl{grid-column:span 6;display:flex;flex-direction:column;gap:6px;min-width:0}
.w4{grid-column:span 4}.w3{grid-column:span 3}.w2{grid-column:span 2}
@container (max-width:400px){.fl{grid-column:span 6}.np{display:none}}
.lb{font-size:var(--clr-label-size);font-weight:var(--clr-label-weight)}
.rq{color:var(--clr-muted);margin-left:2px}
.hp{font-size:.85em;color:var(--clr-muted);margin:0}
.in,.bx{width:100%;min-height:var(--clr-input-h);padding:0 12px;background:var(--clr-input-bg);border:var(--clr-border-w) solid var(--clr-border);border-radius:var(--clr-radius);outline:none}
textarea.in{min-height:calc(var(--clr-input-h)*2.4);padding:10px 12px;resize:vertical}
.sm .in,.sm .bx{min-height:calc(var(--clr-input-h)*.82);font-size:.92em}
.lg .in,.lg .bx{min-height:calc(var(--clr-input-h)*1.2);font-size:1.08em}
.in:focus,.bx:focus,.bx[aria-expanded=true]{border-color:var(--clr-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--clr-accent) 22%,transparent)}
.in[aria-invalid=true],.bx[aria-invalid=true]{border-color:var(--clr-error)}
.er{color:var(--clr-error);font-size:.85em;margin:0}
.bx{display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left;cursor:pointer}
.bx .ph{color:var(--clr-muted)}
.dd{position:relative}
.ls{position:absolute;z-index:10;left:0;right:0;top:calc(100% + 4px);max-height:260px;overflow:auto;margin:0;padding:4px;list-style:none;background:var(--clr-input-bg);border:var(--clr-border-w) solid var(--clr-border);border-radius:var(--clr-radius);box-shadow:0 8px 24px rgba(0,0,0,.12)}
.ls input{margin-bottom:4px}
.op{padding:8px 10px;border-radius:calc(var(--clr-radius)*.6);cursor:pointer}
.op[aria-selected=true]{font-weight:600}
.op.on{background:color-mix(in srgb,var(--clr-accent) 12%,transparent)}
.ch{display:flex;flex-direction:column;gap:8px}
.ck{display:flex;align-items:flex-start;gap:10px;cursor:pointer}
.ck input{width:18px;height:18px;margin:2px 0 0;accent-color:var(--clr-accent);flex:none}
.rt{display:flex;flex-wrap:wrap;gap:6px}
.rt label{position:relative;cursor:pointer;display:flex}
.rt input{position:absolute;opacity:0;width:1px;height:1px;margin:0}
.rt input:focus-visible+span{outline:2px solid var(--clr-accent);outline-offset:2px}
.rs span{font-size:1.7em;line-height:1;border-radius:4px;color:color-mix(in srgb,var(--clr-muted) 40%,transparent)}
.rs .on span{color:var(--clr-accent)}
@media (hover:hover){.rs:hover span{color:var(--clr-accent)}.rs label:hover~label span{color:color-mix(in srgb,var(--clr-muted) 40%,transparent)}}
.rn span{display:flex;align-items:center;justify-content:center;min-width:var(--clr-input-h);height:var(--clr-input-h);padding:0 8px;background:var(--clr-input-bg);border:var(--clr-border-w) solid var(--clr-border);border-radius:var(--clr-radius)}
.rn .on span{background:var(--clr-accent);border-color:var(--clr-accent);color:var(--clr-btn-text)}
.rt[aria-invalid=true] span{border-color:var(--clr-error)}
.rl{display:flex;justify-content:space-between;gap:12px;font-size:.85em;color:var(--clr-muted)}
.k1,.k2,.k3{font-family:var(--clr-heading-font);font-weight:600;margin:0;line-height:1.2}
.k1{font-size:1.45em}.k2{font-size:1.2em}.k3{font-size:1.05em}
.tx{margin:0;white-space:pre-line}
.dv{width:100%;border:0;border-top:var(--clr-border-w) solid var(--clr-border);margin:4px 0}
.im{display:block;max-width:100%;height:auto;border-radius:var(--clr-radius)}
.ce{text-align:center;align-items:center}
.ac{display:flex;gap:10px;align-items:center}
.fw{flex:1}
.bt{min-height:var(--clr-input-h);padding:0 22px;border:0;border-radius:var(--clr-btn-radius);background:var(--clr-btn-bg);color:var(--clr-btn-text);font-weight:var(--clr-btn-weight);text-transform:var(--clr-btn-case);cursor:pointer}
.bt:disabled{opacity:.6;cursor:default}
.bt.bk{background:transparent;color:var(--clr-text);border:var(--clr-border-w) solid var(--clr-border)}
.bt:focus-visible{outline:2px solid var(--clr-accent);outline-offset:2px}
.trap{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.al{color:var(--clr-error);margin:0}
.dn{display:flex;flex-direction:column;gap:6px}
.cl{gap:14px}
.hs{display:flex;align-items:center;gap:10px;font-weight:600}
.av{width:36px;height:36px;border-radius:50%;object-fit:cover}
.ps{display:flex;flex-wrap:wrap;gap:6px}
.dy{flex-wrap:nowrap;overflow-x:auto;padding:2px}
.pl{min-height:calc(var(--clr-input-h)*.8);padding:0 14px;border-radius:999px;border:var(--clr-border-w) solid var(--clr-border);background:var(--clr-input-bg);cursor:pointer;white-space:nowrap}
.pl[aria-pressed=true]{background:var(--clr-accent);border-color:var(--clr-accent);color:var(--clr-btn-text)}
.pl:focus-visible{outline:2px solid var(--clr-accent);outline-offset:2px}
.pl:disabled{opacity:.6;cursor:default}
.tm{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}
.tm .pl{border-radius:var(--clr-radius)}
.tz{display:flex;flex-direction:column;gap:6px;max-width:320px}
@media (prefers-reduced-motion:no-preference){.f{transition:opacity .15s ease}.pb i{transition:transform .2s cubic-bezier(.2,0,0,1)}}
`;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string | boolean | undefined> = {}, ...kids: (Node | string | null | false)[]) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === "text") n.textContent = String(v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids) if (k) n.append(k);
  return n;
};

/** The columns a field takes on the form's six-column grid; a narrow form stacks every field. */
export const SPAN: Record<FieldWidth, number> = { full: 6, half: 3, third: 2, two_thirds: 4 };

/**
 * A shuffled list in an order that holds for one page load (one seed), whatever order the list was saved in, so the
 * options don't jump while the visitor answers.
 */
export function shuffled<T extends { value: string }>(list: T[], seed: number): T[] {
  const hash = (v: string) => {
    let h = (2166136261 ^ seed) >>> 0;
    for (let i = 0; i < v.length; i++) h = Math.imul(h ^ v.charCodeAt(i), 16777619) >>> 0;
    return h;
  };
  return list
    .map((o) => [hash(o.value), o] as const)
    .sort((a, b) => a[0] - b[0] || (a[1].value < b[1].value ? -1 : 1))
    .map((x) => x[1]);
}

/** The input attributes a field's checks call for, so the browser and phone keyboards match what checkAnswers takes. */
export function inputAttrs(f: Field): Record<string, string> {
  const v = f.valid ?? {};
  const a: Record<string, string> = {};
  const put = (k: string, x: number | string | undefined) => {
    if (x !== undefined) a[k] = String(x);
  };
  if (f.type === "text" || f.type === "textarea") {
    put("maxlength", v.max ?? (f.type === "text" ? 1000 : 5000));
    if (v.min) put("minlength", v.min);
  } else if (f.type === "number") {
    put("min", v.min);
    put("max", v.max);
    put("step", v.step);
    // Whole numbers that can't go below zero get the digits-only keypad.
    a.inputmode = v.step !== undefined && Number.isInteger(v.step) && v.min !== undefined && v.min >= 0 ? "numeric" : "decimal";
  } else if (f.type === "date") {
    put("min", v.earliest);
    put("max", v.latest);
  } else if (f.type === "email") put("maxlength", 320);
  else if (f.type === "phone") put("maxlength", 50);
  else if (f.type === "url") put("maxlength", 1000);
  return a;
}

/** A default or a value from the address, as the field holds it. */
export function fromText(f: Field, s: string): unknown {
  if (f.type === "multi") return s.split(",").map((x) => x.trim()).filter(Boolean);
  if (f.type === "rating") return Number.isFinite(Number(s)) ? Number(s) : s;
  return s;
}

/** The visitor's own day, for rules like "within 30 days". */
const localDay = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

/** A calc's result as the form shows it. */
export function calcText(f: Field, n: unknown): string {
  if (typeof n !== "number") return "—";
  const c = f.calc ?? { formula: "" };
  const opts: Intl.NumberFormatOptions = { maximumFractionDigits: c.decimals ?? 2, ...(c.decimals !== undefined ? { minimumFractionDigits: c.decimals } : {}) };
  try {
    if (c.format === "money") return n.toLocaleString(undefined, { ...opts, style: "currency", currency: c.currency ?? "USD" });
  } catch {}
  return n.toLocaleString(undefined, opts) + (c.format === "percent" ? "%" : "");
}

const listOf = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : (typeof v === "string" && v) || typeof v === "number" ? [String(v)] : []);

/** A random id for this browser, kept in localStorage; one per page load when storage is blocked. */
let pageVid = "";
function visitorId(): string {
  try {
    const v = localStorage.getItem("_clr_vid");
    if (v && /^[A-Za-z0-9_-]{8,64}$/.test(v)) return v;
    const n = idemKey();
    localStorage.setItem("_clr_vid", n);
    return n;
  } catch {
    return (pageVid ||= idemKey());
  }
}

function idemKey(): string {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function readQueue(): Queued[] {
  try {
    const q = JSON.parse(localStorage.getItem(QUEUE) || "[]") as Queued[];
    return Array.isArray(q) ? q.filter((x) => x && Date.now() - x.at < DAY) : [];
  } catch {
    return [];
  }
}
function writeQueue(q: Queued[]) {
  try {
    if (q.length) localStorage.setItem(QUEUE, JSON.stringify(q.slice(-20)));
    else localStorage.removeItem(QUEUE);
  } catch {}
}

/** Send one queued fill. True when it's settled (accepted, or refused for good). */
async function sendQueued(x: Queued): Promise<boolean> {
  try {
    const res = await fetch(x.url, { method: "POST", headers: { "content-type": "application/json" }, body: x.body, keepalive: true });
    return res.ok || (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429);
  } catch {
    return false;
  }
}

const TOUCH = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "li_fat_id", "msclkid"];
type Touch = { utm: Record<string, string>; first: Record<string, string>; page: string; referrer: string };

/** Inside the frame /f/embed.js draws: it passes the page around it as ?c=. */
const embedFrame = () => {
  try {
    return window.parent !== window && new URLSearchParams(location.search).has("c");
  } catch {
    return false;
  }
};

/**
 * Where the visitor is: the page around the frame when the embed sent it, else this page. UTMs and ad click ids,
 * latest and first touch, kept in localStorage the same way the embed keeps them.
 */
function touch(): Touch {
  const params = new URLSearchParams(location.search);
  const pick = (o: unknown) => {
    const out: Record<string, string> = {};
    if (o && typeof o === "object") for (const k of TOUCH) if (typeof (o as Record<string, unknown>)[k] === "string" && (o as Record<string, string>)[k]) out[k] = (o as Record<string, string>)[k].slice(0, 300);
    return out;
  };
  const text = (v: unknown) => (typeof v === "string" ? v.slice(0, 1000) : "");
  if (embedFrame()) {
    try {
      const raw = atob((params.get("c") ?? "").replace(/-/g, "+").replace(/_/g, "/"));
      const o = JSON.parse(new TextDecoder().decode(Uint8Array.from(raw, (ch) => ch.charCodeAt(0)))) as Record<string, unknown>;
      return { utm: pick(o.utm), first: pick(o.first), page: text(o.page), referrer: text(o.referrer) };
    } catch {}
  }
  const store = (k: string, v?: Record<string, string>): unknown => {
    try {
      if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null");
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
    return null;
  };
  const now = pick(Object.fromEntries(params));
  if (Object.keys(now).length) {
    store("_clr_utm", now);
    if (!store("_clr_utm1")) store("_clr_utm1", now);
  }
  return { utm: Object.keys(now).length ? now : pick(store("_clr_utm")), first: pick(store("_clr_utm1")), page: text(location.href), referrer: text(document.referrer) };
}

/** What hidden fields pick up on this page, by field id. */
function hiddenValues(form: Form, t: Touch): Record<string, string> {
  const out: Record<string, string> = {};
  const params = new URLSearchParams(location.search);
  for (const f of allFields(form)) {
    if (f.type !== "hidden" || !f.hidden) continue;
    const name = f.hidden.name ?? "";
    const v = f.hidden.from === "param" ? (t.utm[name] ?? t.first[name] ?? params.get(name)) : f.hidden.from === "page" ? t.page : f.hidden.from === "referrer" ? t.referrer : f.hidden.value;
    if (v) out[f.id] = v.slice(0, 500);
  }
  return out;
}

/** The booking calendar over the page, for captured forms (they have no screen of their own to show it in). */
function bookingOverlay(url: string) {
  const back = el("div", { style: "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px" });
  const box = el("div", { role: "dialog", "aria-modal": "true", "aria-label": "Book a meeting", style: "background:#fff;width:100%;max-width:760px;max-height:92vh;overflow:auto;border-radius:8px;position:relative" });
  const close = el("button", { type: "button", "aria-label": "Close", text: "×", style: "position:absolute;top:6px;right:10px;border:0;background:none;font:24px/1 sans-serif;cursor:pointer;color:#333" });
  const done = () => {
    back.remove();
    document.removeEventListener("keydown", esc);
  };
  const esc = (e: KeyboardEvent) => e.key === "Escape" && done();
  close.addEventListener("click", done);
  back.addEventListener("click", (e) => e.target === back && done());
  document.addEventListener("keydown", esc);
  box.append(close, el("iframe", { src: url, title: "Book a meeting", style: "width:100%;min-height:680px;border:0;display:block" }));
  back.append(box);
  document.body.append(back);
  close.focus();
}

type Values = (name: string) => unknown;
/** What a send or a booking call answers. */
type Answer = { schedule?: { url: string } | null; booking?: Booking; booked?: Booked; taken?: boolean; error?: string; expired?: boolean };

/** Claritia calendar over the page: a <claritia-form> in booking mode, in the form's own look. */
function calendarOver(data: Loaded, base: string, a: Answer) {
  if (!a.booking && !a.booked) return;
  const c = document.createElement("claritia-form") as ClaritiaForm;
  c.setAttribute("popup", "");
  c.setAttribute("host", base);
  c.over(data, a);
  document.body.append(c);
}

const PEND = "clr_book_pend";
/** A captured send in flight: when the page moves on first, the next page (same site) sends it again, same key. */
const pend = (v?: object) => {
  try {
    if (v) sessionStorage.setItem(PEND, JSON.stringify(v));
    else sessionStorage.removeItem(PEND);
  } catch {}
};
let addressDone = false;

/**
 * Captured forms (docs/form-builder.md Part 9): the team's own form, read when it's sent. Only the fields mapped in
 * Claritia are read, by their names, and only from the form set up here; the team's form keeps working as before.
 * Started by <script src=".../forms/v1.js" data-capture="<form id>">.
 */
export function startCapture(formId: string, base: string) {
  if (!/^[0-9a-f-]{36}$/.test(formId)) return;
  const started = Date.now();
  // Listeners go on at once and keep what was sent; the form's settings are read alongside, so a send made before
  // they arrive still counts.
  const ready: Promise<Loaded | null> = fetch(`${base}/api/forms/${formId}`, { credentials: "omit" })
    .then((r) => (r.ok ? (r.json() as Promise<Loaded>) : null))
    .catch(() => null);
  const sentKeys = new Set<string>();

  const show = (data: Loaded, j: Answer) => {
    if (j.booking || j.booked) calendarOver(data, base, j);
    else if (j.schedule && /^https:\/\//.test(j.schedule.url)) bookingOverlay(j.schedule.url);
  };
  const post = async (url: string, body: string): Promise<{ res: Response; j: Answer } | null> => {
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body, credentials: "omit", keepalive: true });
      return { res, j: (await res.json().catch(() => ({}))) as Answer };
    } catch {
      return null;
    }
  };

  // A thank-you page: the calendar opens from the token in the address, or from a send the last page didn't hear back.
  void ready.then(async (data) => {
    if (!data) return;
    const tok = /[#&?]clr_book=([^&#]+)/.exec(location.href)?.[1];
    if (tok && !addressDone) {
      addressDone = true;
      const r = await post(`${base}/api/forms/book`, JSON.stringify({ token: decodeURIComponent(tok) }));
      if (r?.res.ok) show(data, r.j);
      return;
    }
    let p: { url?: string; body?: string; form?: string; at?: number } | null = null;
    try {
      p = JSON.parse(sessionStorage.getItem(PEND) || "null");
    } catch {}
    if (!p || p.form !== formId || !p.url || !p.body || Date.now() - (p.at ?? 0) > 600_000) return;
    pend();
    const r = await post(p.url, p.body);
    if (r?.res.ok) {
      writeQueue(readQueue().filter((x) => x.body !== p!.body));
      show(data, r.j);
    }
  });

  const send = async (adapter: NonNullable<Form["capture"]>["adapter"], get: Values, el?: HTMLFormElement, quiet = false): Promise<Answer | null> => {
    const data = await ready;
    const form = data?.body;
    const cap = form?.capture;
    if (!data || !form || !cap || data.status !== "live") return null;
    // Only the adapter set up here, and for HTML only the form it names (or the one holding the mapped email).
    if (adapter !== cap.adapter && !(adapter === "html" && (cap.adapter === "webflow" || cap.adapter === "framer"))) return null;
    const fields = allFields(form).filter((f) => f.source);
    const email = fields.find((f) => f.key === "email");
    if (!email) return null;
    if (el && (cap.selector ? !el.matches(cap.selector) : get(email.source!) === undefined)) return null;
    const answers: Answers = {};
    for (const f of fields) {
      const v = get(f.source!);
      if (v === undefined || v === null || v === "") continue;
      answers[f.id] = f.type === "checkbox" ? v === true || v === "true" || v === "on" || v === "yes" : f.type === "multi" ? (Array.isArray(v) ? v.map(String) : String(v).split(/[;,]/)) : Array.isArray(v) ? String(v[0]) : String(v);
    }
    if (checkAnswers(form, answers).errors[email.id] || !answers[email.id]) return null;
    // The same answers sent twice in a row (a double click, two events for one send) count once.
    const sig = JSON.stringify(answers);
    if (sentKeys.has(sig)) return null;
    sentKeys.add(sig);
    const key = idemKey();
    const t = touch();
    const body = JSON.stringify({ v: 1, version: data.version, key, answers, hidden: hiddenValues(form, t), consent: {}, page: t.page, referrer: t.referrer, utm: t.utm, first: t.first, ms: Date.now() - started, trap: "" });
    const url = `${base}/api/forms/${formId}/submit`;
    pend({ url, body, form: formId, at: Date.now() });
    const r = await post(url, body);
    // Kept when there was no answer (the page moving on cuts the request off), for the next page to send again.
    if (r) pend();
    if (r?.res.ok) {
      if (!quiet) show(data, r.j);
      return r.j;
    }
    if (r && r.res.status < 500 && r.res.status !== 408 && r.res.status !== 429) return null;
    writeQueue([...readQueue(), { url, body, key, at: Date.now(), tries: 1 }]);
    return null;
  };

  const byName = (list: { name: string; value: unknown }[]) => (name: string) => {
    const hits = list.filter((x) => x.name === name || x.name.endsWith(`/${name}`)).map((x) => x.value);
    return hits.length > 1 ? hits : hits[0];
  };

  // HubSpot: legacy embeds post a message; v4 forms raise a window event (check both against a live portal).
  window.addEventListener("message", (e: MessageEvent) => {
    const d = e.data as { type?: string; eventName?: string; data?: unknown } | null;
    if (!d || d.type !== "hsFormCallback" || d.eventName !== "onFormSubmitted") return;
    const raw = d.data as { name: string; value: unknown }[] | { submissionValues?: Record<string, unknown> } | undefined;
    const list = Array.isArray(raw) ? raw : Object.entries(raw?.submissionValues ?? {}).map(([name, value]) => ({ name, value }));
    void send("hubspot", byName(list));
  });
  window.addEventListener("hs-form-event:on-submission:success", async (e: Event) => {
    const hs = (window as unknown as { HubSpotFormsV4?: { getFormFromEvent?: (e: Event) => { getFormFieldValues?: () => Promise<{ name: string; value: unknown }[]> } } }).HubSpotFormsV4;
    const list = await hs?.getFormFromEvent?.(e)?.getFormFieldValues?.().catch(() => []);
    if (list?.length) void send("hubspot", byName(list));
  });
  // Marketo: with a follow-up page, it opens once our answer is in (3 seconds at most), carrying the booking token so
  // the calendar opens there; without one, the calendar opens over this page.
  const tryMarketo = (n: number) => {
    const M = (window as unknown as { MktoForms2?: { whenReady: (cb: (f: { onSuccess: (cb: (values: Record<string, unknown>, follow?: string) => boolean | void) => void }) => void) => void } }).MktoForms2;
    if (!M) return void (n < 60 && setTimeout(() => tryMarketo(n + 1), 500));
    M.whenReady((f) =>
      f.onSuccess((values, follow) => {
        const p = send("marketo", (name) => values[name], undefined, !!follow);
        if (!follow) return;
        let gone = false;
        const go = (t?: string) => {
          if (gone) return;
          gone = true;
          location.assign(t ? `${follow}${follow.includes("#") ? "&" : "#"}clr_book=${encodeURIComponent(t)}` : follow);
        };
        setTimeout(go, 3000);
        void p.then((j) => go(j?.booking?.token));
        return false;
      }),
    );
  };
  void ready.then((d) => d?.body.capture?.adapter === "marketo" && tryMarketo(0));
  // Plain HTML, Webflow and Framer: the form's own submit event, heard before the page moves on. The values are read
  // at once, then checked against the settings.
  document.addEventListener(
    "submit",
    (e) => {
      const f = e.target as HTMLFormElement | null;
      if (!f || f.tagName !== "FORM") return;
      const fd = new FormData(f);
      void send(
        "html",
        (name) => {
          const all = fd.getAll(name).filter((v): v is string => typeof v === "string");
          return all.length > 1 ? all : all[0];
        },
        f,
      );
    },
    true,
  );
}

let flushing = false;
/** Fills that couldn't be sent before, oldest first. Runs when any form loads and every so often while open. */
async function flushQueue() {
  if (flushing) return;
  flushing = true;
  try {
    for (const x of readQueue()) {
      const ok = await sendQueued(x);
      const q = readQueue();
      const i = q.findIndex((y) => y.key === x.key);
      if (i < 0) continue;
      if (ok) q.splice(i, 1);
      else q[i] = { ...x, tries: x.tries + 1 };
      writeQueue(q);
      if (!ok) break;
    }
  } finally {
    flushing = false;
  }
}

const fontsAdded = new Set<string>();
function addFont(url: string) {
  if (!url || fontsAdded.has(url) || !/^https:\/\/fonts\.googleapis\.com\//.test(url)) return;
  fontsAdded.add(url);
  document.head.append(el("link", { rel: "stylesheet", href: url }));
}

/** Whether a change to this field can change what the form shows: a rule, a skip, a calc or a list reads it. */
function affects(form: Form, id: string): boolean {
  const c = (w: { field: string }) => w.field === id;
  return form.rules.some((r) => c(r.when) || !!r.group?.when.some(c)) || form.steps.some((s) => (s.skip && c(s.skip.when)) || s.fields.some((f) => f.type === "calc" || f.optionsBy?.field === id));
}

// Node (the tests) has no HTMLElement; the helpers above still load there.
const Base = (typeof HTMLElement === "undefined" ? class {} : HTMLElement) as typeof HTMLElement;

export class ClaritiaForm extends Base {
  static observedAttributes = ["form-id"];
  private root: ShadowRoot;
  private data: Loaded | null = null;
  private answers: Answers = {};
  private errors: Record<string, string> = {};
  private step = 0;
  private started = Date.now();
  private key = idemKey();
  private consent = false;
  private sending = false;
  private done = false;
  private alert = "";
  private isPreview = false;
  private open: string | null = null;
  private schedule: { tool: string; url: string } | null = null;
  private filter = "";
  /** "Other" text by field id: undefined when Other isn't picked. */
  private other: Record<string, string | undefined> = {};
  /** The defaults put in, so the builder can swap one the visitor hasn't changed. */
  private defaults: Record<string, unknown> = {};
  private seed = (Math.random() * 2 ** 31) | 0;
  // Claritia calendar after the send: the times, the booked meeting, the day picked, the visitor's zone, a line to say.
  private bk: Booking | null = null;
  private bkDone: Booked | null = null;
  private bkDay = "";
  private bkTz = localZone();
  private bkMsg = "";
  private bkBusy = false;
  private overPage = false;
  /** Field ids hidden because enrichment already knows them (fill before submit), and the email they're for. */
  private known = new Set<string>();
  private knownFor = "";
  /** Region lists by country, fetched when a dropdown follows a country field; a promise while one loads. */
  private regions = new Map<string, string[] | Promise<void>>();
  private get ctx(): RunCtx {
    return { today: localDay(), regions: (c) => (Array.isArray(this.regions.get(c)) ? (this.regions.get(c) as string[]) : undefined) };
  }
  private loadRegions(form: Form) {
    for (const f of allFields(form)) {
      const c = f.optionsBy?.preset === "regions" ? this.answers[f.optionsBy.field] : null;
      if (typeof c !== "string" || !/^[A-Z]{2}$/.test(c) || this.regions.has(c)) continue;
      const done = (list: string[]) => {
        this.regions.set(c, list);
        this.later();
      };
      this.regions.set(
        c,
        fetch(`${this.base}/api/forms/regions?c=${c}`, { credentials: "omit" })
          .then((r) => r.json())
          .then((j: { regions?: unknown }) => done(Array.isArray(j.regions) ? j.regions.map(String) : []))
          .catch(() => {
            this.regions.delete(c);
            this.later();
          }),
      );
    }
  }

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    // The first answer is a start (Reports' Forms page).
    const start = () => this.beacon("start");
    this.root.addEventListener("input", start);
    this.root.addEventListener("change", start);
  }

  /** One view (half on screen for a second) and one start per load; the server counts each visitor every 30 minutes. */
  private sent = new Set<"view" | "start">();
  private beacon(kind: "view" | "start") {
    const id = this.getAttribute("form-id");
    if (this.isPreview || this.sent.has(kind) || !this.data || this.data.status !== "live" || !id) return;
    this.sent.add(kind);
    fetch(`${this.base}/api/forms/${id}/seen`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, vid: visitorId() }), credentials: "omit", keepalive: true }).catch(() => {});
  }

  private watchView() {
    if (this.isPreview || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          timer ??= setTimeout(() => {
            this.beacon("view");
            io.disconnect();
          }, 1000);
        } else if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      },
      { threshold: 0.5 },
    );
    io.observe(this);
  }

  /** The app's builder shows a draft without loading or sending anything. */
  set preview(p: { form: Form; tokens?: Partial<Tokens>; step?: number; done?: boolean }) {
    this.isPreview = true;
    const fresh = !this.data || this.done !== !!p.done;
    if (fresh || p.form.after.schedule?.tool !== "claritia") this.bk = this.bkDone = null;
    this.data = { id: "preview", version: 0, status: "live", body: p.form, tokens: p.tokens ?? {}, strict: true };
    this.step = Math.min(p.step ?? this.step, p.form.steps.length - 1);
    this.done = !!p.done;
    if (fresh) this.errors = {};
    this.applyDefaults(p.form);
    this.render();
  }

  /** Captured forms: the calendar alone, over the page (calendarOver). */
  over(data: Loaded, a: Answer) {
    this.data = data;
    this.done = this.opened = this.overPage = true;
    this.bk = a.booking ?? null;
    this.bkDone = a.booked ?? null;
    this.render();
    queueMicrotask(() => this.toggle(true));
  }

  private get base() {
    return this.getAttribute("host") || SCRIPT_BASE || location.origin;
  }

  connectedCallback() {
    if (!this.isPreview) void this.load();
    void flushQueue();
    this.wirePopup();
    // In the embed's frame: tell the page around it how tall the form is.
    if (!this.isPreview && embedFrame() && typeof ResizeObserver !== "undefined") {
      const size = () => {
        try {
          window.parent.postMessage({ type: "claritia-form", id: this.getAttribute("form-id"), height: document.documentElement.scrollHeight }, "*");
        } catch {}
      };
      new ResizeObserver(size).observe(document.body);
    }
  }

  attributeChangedCallback() {
    if (this.isConnected && !this.isPreview) void this.load();
  }

  private async load() {
    const id = this.getAttribute("form-id");
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) return;
    try {
      const res = await fetch(`${this.base}/api/forms/${id}`, { credentials: "omit" });
      if (!res.ok) throw new Error(String(res.status));
      this.data = (await res.json()) as Loaded;
    } catch {
      this.put(el("p", { text: "This form couldn't load. Refresh the page to try again." }));
      return;
    }
    // Defaults first, then the address wins: ?email=… for fields set to take it.
    this.applyDefaults(this.data.body);
    const params = new URLSearchParams(location.search);
    for (const f of allFields(this.data.body)) {
      const fromKey = params.get(f.key.replace(/^[fq]\./, ""));
      if (f.prefill && fromKey) this.answers[f.id] = fromText(f, fromKey);
    }
    this.started = Date.now();
    this.render();
    this.watchView();
    if (this.data.turnstile && this.data.body.spam.turnstile) this.loadTurnstile();
  }

  /** Each field's default, unless the visitor already answered it. */
  private applyDefaults(form: Form) {
    for (const f of allFields(form)) {
      const prev = this.defaults[f.id];
      const cur = this.answers[f.id];
      if (cur !== undefined && (prev === undefined || JSON.stringify(cur) !== JSON.stringify(prev))) continue;
      const next = f.default !== undefined && f.type !== "hidden" && !isContent(f.type) ? fromText(f, f.default) : undefined;
      if (next === undefined) {
        if (prev !== undefined) delete this.answers[f.id];
        delete this.defaults[f.id];
      } else this.answers[f.id] = this.defaults[f.id] = next;
    }
  }

  private turnstileToken = "";
  private loadTurnstile() {
    const w = window as unknown as { turnstile?: { render: (el: Element, o: object) => void } };
    const draw = () =>
      w.turnstile?.render(this.root.querySelector(".ts")!, { sitekey: this.data!.turnstile, size: "invisible", callback: (t: string) => (this.turnstileToken = t) });
    if (w.turnstile) return draw();
    const s = el("script", { src: "https://challenges.cloudflare.com/turnstile/v0/api.js", async: true });
    s.addEventListener("load", draw);
    document.head.append(s);
  }

  // Drawing ------------------------------------------------------------------------------------------------

  private pending = 0;
  /** Draw again on the next frame, keeping focus where the visitor moved it (a change fires before focus moves on). */
  private later() {
    if (this.pending) return;
    this.pending = requestAnimationFrame(() => {
      this.pending = 0;
      const focused = (this.root.activeElement as HTMLElement | null)?.id;
      this.render();
      if (focused) (this.root.getElementById(focused) as HTMLElement | null)?.focus();
    });
  }

  private render() {
    const d = this.data;
    if (!d) return;
    const form = d.body;
    addFont(d.tokens.fontUrl ?? "");
    const width = form.layout.maxWidth ? `${form.layout.maxWidth}px` : form.layout.width === "wide" ? "720px" : "480px";
    const style = el("style", { text: `:host{${tokensCss(d.tokens)}--clr-width:${width}}${STYLES}` });
    if (d.status === "paused") return this.put(style, el("div", { class: "f" }, el("p", { class: "i", text: "This form is closed." })));
    if (this.done) return this.put(style, this.endScreen(form));

    this.loadRegions(form);
    const { shown, required } = visibility(form, this.answers, this.ctx);
    // The last step is the one whose next step (after any skip) is the end.
    const last = nextStep(form, this.step, this.answers, this.ctx) >= form.steps.length;
    const step = form.steps[this.step];
    const wrap = el("form", { class: "f", novalidate: true, "aria-label": form.title || "Form" });
    if (form.title) wrap.append(el("h2", { class: "h", text: form.title }));
    if (form.intro) wrap.append(el("p", { class: "i", text: form.intro }));
    if (form.steps.length > 1) wrap.append(this.progress(form));
    const grid = el("div", { class: "g" });
    for (const f of step.fields) if (f.type !== "hidden" && shown.has(f.id) && !this.known.has(f.id)) grid.append(this.field(f, form, required.has(f.id)));
    wrap.append(grid);
    if (last && this.needsConsent()) {
      const box = el("input", { type: "checkbox", id: "clr-consent" }) as HTMLInputElement;
      box.checked = this.consent;
      box.addEventListener("change", () => (this.consent = box.checked));
      wrap.append(el("label", { class: "ck" }, box, el("span", { text: form.consent.label })));
    }
    if (last && form.consent.mode === "notice") wrap.append(el("p", { class: "i nt", text: form.consent.label }));
    // Spam trap: hidden from people and screen readers; bots fill it.
    wrap.append(el("div", { class: "trap", "aria-hidden": "true" }, el("input", { type: "text", name: "company_url", tabindex: "-1", autocomplete: "off" })));
    if (d.turnstile && form.spam.turnstile) wrap.append(el("div", { class: "ts" }));
    if (this.alert) wrap.append(el("p", { class: "al", role: "alert", text: this.alert }));
    const actions = el("div", { class: "ac" });
    if (this.step > 0) {
      const back = el("button", { type: "button", class: "bt bk", text: "Back" });
      back.addEventListener("click", () => {
        // Back goes along the path the answers took, so a skipped step stays skipped.
        const path = stepPath(form, this.answers, this.ctx);
        const at = path.indexOf(this.step);
        this.step = at > 0 ? path[at - 1]! : this.step - 1;
        this.alert = "";
        this.render();
      });
      actions.append(back);
    }
    actions.append(el("button", { type: "submit", class: form.submit.full ? "bt fw" : "bt", disabled: this.sending, text: this.sending ? "Sending…" : last ? form.submit.label : "Next" }));
    wrap.append(actions);
    wrap.addEventListener("submit", (e) => {
      e.preventDefault();
      void this.next();
    });
    this.put(style, wrap);
  }

  /** Where the visitor is in a form of several steps: a bar, dots, or only words for screen readers. */
  private progress(form: Form): HTMLElement {
    const n = form.steps.length;
    const at = this.step + 1;
    const title = form.steps[this.step].title;
    const text = `Step ${at} of ${n}${title ? ` · ${title}` : ""}`;
    const kind = form.layout.progress ?? "bar";
    if (kind === "none") return el("p", { class: "sr", text });
    if (kind === "dots")
      return el("div", { class: "pg" }, el("p", { class: "sr", text }), el("div", { class: "pd", "aria-hidden": "true" }, ...Array.from({ length: n }, (_, j) => el("i", { class: j < at ? "on" : undefined }))));
    return el(
      "div",
      { class: "pg" },
      el("p", { class: "st", id: "clr-step", text }),
      el("div", { class: "pb", role: "progressbar", "aria-labelledby": "clr-step", "aria-valuemin": "1", "aria-valuemax": String(n), "aria-valuenow": String(at) }, el("i", { style: `transform:scaleX(${at / n})` })),
    );
  }

  /** After a fill: the page links the visit to the person (Claritia's site script), and the embed around a frame resizes or opens the next page. */
  private tellPage() {
    const d = this.data!;
    const emailField = allFields(d.body).find((f) => f.key === "email");
    const email = emailField && typeof this.answers[emailField.id] === "string" ? (this.answers[emailField.id] as string) : null;
    const end = d.body.after.end;
    if (embedFrame()) {
      const redirect = end.kind === "redirect" && !this.schedule && safeUrl(end.url) ? end.url : null;
      try {
        window.parent.postMessage({ type: "claritia-form-done", id: d.id, email, redirect }, "*");
      } catch {}
      return;
    }
    const site = (window as unknown as { claritia?: (kind: string, email: string) => void }).claritia;
    if (email && typeof site === "function") {
      try {
        site("form", email);
      } catch {}
    }
  }

  /**
   * <claritia-form popup="click|delay:5|exit">: the form opens over the page from any [data-claritia-open] button for
   * it, after a number of seconds, or when the pointer leaves the top of the window (once a visit).
   */
  private opened = false;
  private put(...nodes: Node[]) {
    if (!this.hasAttribute("popup") || this.isPreview) return this.root.replaceChildren(...nodes);
    const style = nodes.find((n) => n instanceof HTMLStyleElement);
    const close = el("button", { type: "button", class: "px", "aria-label": "Close", text: "×" });
    close.addEventListener("click", () => this.toggle(false));
    const box = el("div", { class: "pbox", role: "dialog", "aria-modal": "true" }, close, ...nodes.filter((n) => n !== style));
    const pop = el("div", { class: "pop", ...(this.opened ? {} : { hidden: true }) }, box);
    pop.addEventListener("click", (e) => e.target === pop && this.toggle(false));
    this.root.replaceChildren(...(style ? [style] : []), pop);
  }
  private toggle(open: boolean) {
    if (!open && this.overPage) return this.remove();
    this.opened = open;
    const pop = this.root.querySelector(".pop") as HTMLElement | null;
    if (pop) pop.hidden = !open;
    if (open) (this.root.querySelector(".in, .bx, input, button:not(.px)") as HTMLElement | null)?.focus();
  }
  private popupWired = false;
  private wirePopup() {
    if (this.popupWired || !this.hasAttribute("popup") || this.isPreview) return;
    this.popupWired = true;
    const how = this.getAttribute("popup") || "click";
    const id = this.getAttribute("form-id");
    document.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement | null)?.closest?.("[data-claritia-open]");
      if (b && b.getAttribute("data-claritia-open") === id) {
        e.preventDefault();
        this.toggle(true);
      }
    });
    document.addEventListener("keydown", (e) => e.key === "Escape" && this.opened && this.toggle(false));
    const delay = /^delay:(\d{1,3})$/.exec(how);
    if (delay) setTimeout(() => this.toggle(true), Number(delay[1]) * 1000);
    if (how === "exit")
      document.addEventListener("mouseout", (e) => {
        if (e.relatedTarget || e.clientY > 0) return;
        try {
          if (sessionStorage.getItem(`clr_exit_${id}`)) return;
          sessionStorage.setItem(`clr_exit_${id}`, "1");
        } catch {}
        this.toggle(true);
      });
  }

  private needsConsent() {
    const c = this.data!.body.consent;
    return c.mode === "always" || (c.mode === "by_region" && this.data!.strict !== false);
  }

  private field(f: Field, form: Form, req: boolean): HTMLElement {
    const id = `clr-${f.id}`;
    const err = this.errors[f.id];
    // A required field always shows: hidden on a phone, it could never be filled there.
    const cls = ["fl", `w${SPAN[f.width ?? "full"]}`, f.size === "sm" || f.size === "lg" ? f.size : "", f.hideOnPhone && !req ? "np" : "", f.content?.align === "center" ? "ce" : ""];
    const box = el("div", { class: cls.filter(Boolean).join(" ") });
    if (isContent(f.type)) {
      const c = this.content(f);
      if (c) box.append(c);
      return box;
    }
    if (f.type === "calc") {
      box.append(el("label", { class: `lb${f.hideLabel ? " sr" : ""}`, for: id, text: f.label }), el("output", { class: "in", id, "aria-live": "polite", text: calcText(f, withCalcs(form, this.answers, this.ctx)[f.id]) }));
      return box;
    }
    const inside = (f.labels ?? form.layout.labels) === "inside" && ["text", "email", "phone", "number", "url", "textarea", "date", "dropdown", "country"].includes(f.type);
    const group = f.type === "choice" || f.type === "multi" || f.type === "rating";
    const star = req ? el("span", { class: "rq", "aria-hidden": "true", text: "*" }) : null;
    // A hidden label, or one shown inside the box, stays for screen readers.
    const label = group
      ? el("div", { class: `lb${f.hideLabel ? " sr" : ""}`, id: `${id}-l`, text: f.label }, star)
      : el("label", { class: `lb${f.hideLabel || inside ? " sr" : ""}`, for: id, text: f.label }, star);
    if (f.type !== "checkbox") box.append(label);
    const common = { id, "aria-invalid": err ? "true" : undefined, "aria-describedby": err ? `${id}-e` : f.help ? `${id}-h` : undefined, "aria-required": req ? "true" : undefined };
    const set = (v: unknown, picked = false) => {
      this.answers[f.id] = v;
      // A list that follows this field drops a pick its new list doesn't have.
      for (const g of allFields(form))
        if (g.optionsBy?.field === f.id && this.answers[g.id] !== undefined) {
          const ok = new Set(optionsFor(g, this.answers, this.ctx).map((o) => o.value));
          const kept = listOf(this.answers[g.id]).filter((x) => ok.has(x));
          if (g.type === "multi") this.answers[g.id] = kept;
          else if (!kept.length) delete this.answers[g.id];
        }
      // A pick is checked at once (too many picks, say); typing is checked when the visitor moves on.
      if (picked) {
        const e = checkAnswers(form, this.answers, { steps: [this.step], known: this.known, ...this.ctx }).errors[f.id];
        if (e && listOf(v).length) this.errors[f.id] = e;
        else delete this.errors[f.id];
        return this.later();
      }
      if (this.errors[f.id]) {
        delete this.errors[f.id];
        this.later();
      } else if (affects(form, f.id)) this.later();
    };
    const blur = () => {
      if (f.key === "email") void this.lookupKnown(form, this.answers[f.id]);
      const r = checkAnswers(form, this.answers, { steps: [this.step], known: this.known, ...this.ctx });
      if (r.errors[f.id] && this.answers[f.id] !== undefined && this.answers[f.id] !== "") {
        this.errors[f.id] = r.errors[f.id];
        this.later();
      }
    };
    if (f.type === "dropdown" || f.type === "country") {
      box.append(this.listbox(f, common, set, inside));
      if (this.otherText(f) !== undefined) box.append(this.otherBox(f, id, set));
    } else if (f.type === "choice" || f.type === "multi") box.append(this.picks(f, id, common, set));
    else if (f.type === "rating") box.append(this.rating(f, id, common, set));
    else if (f.type === "checkbox") {
      const c = el("input", { type: "checkbox", ...common }) as HTMLInputElement;
      c.checked = this.answers[f.id] === true;
      c.addEventListener("change", () => set(c.checked));
      box.append(el("label", { class: "ck" }, c, el("span", { class: f.hideLabel ? "sr" : undefined, text: f.label }, star)));
    } else {
      const types: Record<string, string> = { email: "email", phone: "tel", number: "text", url: "url", date: "date" };
      const auto: Record<string, string> = { email: "email", first_name: "given-name", last_name: "family-name", name: "name", phone: "tel", company: "organization", title: "organization-title", website: "url" };
      const input = (f.type === "textarea" ? el("textarea", { class: "in", ...common, ...inputAttrs(f) }) : el("input", { class: "in", type: types[f.type] ?? "text", ...common, ...inputAttrs(f) })) as
        | HTMLInputElement
        | HTMLTextAreaElement;
      if (auto[f.key]) input.setAttribute("autocomplete", auto[f.key]);
      const ph = inside ? f.label + (req ? " *" : "") : f.placeholder;
      if (ph) input.setAttribute("placeholder", ph);
      input.value = typeof this.answers[f.id] === "string" ? (this.answers[f.id] as string) : "";
      input.addEventListener("input", () => {
        this.answers[f.id] = input.value;
        if (this.errors[f.id]) {
          delete this.errors[f.id];
          input.removeAttribute("aria-invalid");
          box.querySelector(".er")?.remove();
        }
      });
      input.addEventListener("change", () => set(input.value));
      input.addEventListener("blur", blur);
      box.append(input);
    }
    if (f.help) box.append(el("p", { class: "hp", id: `${id}-h`, text: f.help }));
    if (err) box.append(el("p", { class: "er", id: `${id}-e`, text: err }));
    return box;
  }

  /** A heading, text, divider or image. Text is set as text; a picture needs https. */
  private content(f: Field): HTMLElement | null {
    const c = f.content ?? {};
    if (f.type === "heading") {
      const level = c.level ?? 2;
      return el(`h${level + 1}` as "h2", { class: `k${level}`, text: c.text ?? "" });
    }
    if (f.type === "paragraph") return el("p", { class: "tx", text: c.text ?? "" });
    if (f.type === "divider") return el("hr", { class: "dv" });
    if (f.type === "image" && c.src && /^https:\/\//.test(c.src) && safeUrl(c.src)) return el("img", { class: "im", src: c.src, alt: c.alt ?? "", loading: "lazy", decoding: "async" });
    return null;
  }

  /** The options in the order this visitor sees them. */
  private optionsOf(f: Field): Choice[] {
    const list = optionsFor(f, this.answers, this.ctx);
    return f.shuffle ? shuffled(list, this.seed) : list;
  }

  /** The "Other" text, or undefined when Other isn't picked. */
  private otherText(f: Field): string | undefined {
    if (f.id in this.other) return this.other[f.id];
    const hit = listOf(this.answers[f.id]).find((v) => v.startsWith(OTHER));
    return hit === undefined ? undefined : hit.slice(OTHER.length);
  }

  /** The answer from the picks and the Other text: "Other: " and the words, left out while the words are empty. */
  private compose(f: Field, picked?: string[]): unknown {
    const o = this.otherText(f);
    const extra = o !== undefined && o.trim() ? OTHER + o.trim().slice(0, 200) : null;
    if (f.type === "multi") {
      const base = picked ?? listOf(this.answers[f.id]).filter((v) => !v.startsWith(OTHER));
      return extra ? [...base, extra] : base;
    }
    return o !== undefined ? (extra ?? undefined) : picked?.[0];
  }

  private otherBox(f: Field, id: string, set: (v: unknown, picked?: boolean) => void): HTMLElement {
    const t = el("input", { class: "in", type: "text", id: `${id}-ot`, "aria-label": `${f.label}: Other`, maxlength: "200" }) as HTMLInputElement;
    t.value = this.otherText(f) ?? "";
    t.addEventListener("input", () => {
      this.other[f.id] = t.value;
      this.answers[f.id] = this.compose(f);
      if (this.errors[f.id]) {
        delete this.errors[f.id];
        const box = t.closest(".fl");
        box?.querySelector(".er")?.remove();
        box?.querySelector("[aria-invalid]")?.removeAttribute("aria-invalid");
      }
    });
    t.addEventListener("change", () => set(this.compose(f)));
    return t;
  }

  /** Pick one or pick many: radios or check boxes, with "Other" and its text box last. */
  private picks(f: Field, id: string, common: Record<string, string | undefined>, set: (v: unknown, picked?: boolean) => void): HTMLElement {
    const multi = f.type === "multi";
    const list = el("div", {
      class: "ch",
      role: multi ? "group" : "radiogroup",
      "aria-labelledby": `${id}-l`,
      "aria-invalid": common["aria-invalid"],
      "aria-describedby": common["aria-describedby"],
      "aria-required": multi ? undefined : common["aria-required"],
    });
    const other = this.otherText(f);
    const cur = listOf(this.answers[f.id]).filter((v) => !v.startsWith(OTHER));
    const item = (value: string, text: string, n: string, on: boolean, change: (checked: boolean) => void) => {
      const c = el("input", { type: multi ? "checkbox" : "radio", name: id, value, id: `${id}-${n}` }) as HTMLInputElement;
      c.checked = on;
      c.addEventListener("change", () => change(c.checked));
      list.append(el("label", { class: "ck" }, c, el("span", { text })));
    };
    this.optionsOf(f).forEach((o, i) =>
      item(o.value, o.label, String(i), cur.includes(o.value) && (multi || other === undefined), (checked) => {
        if (!multi) {
          this.other[f.id] = undefined;
          return set(o.value, true);
        }
        set(this.compose(f, checked ? [...cur, o.value] : cur.filter((v) => v !== o.value)), true);
      }),
    );
    if (f.other) {
      item("", "Other", "o", other !== undefined, (checked) => {
        this.other[f.id] = checked ? (other ?? "") : undefined;
        set(this.compose(f, multi ? cur : []), true);
      });
      if (other !== undefined) list.append(this.otherBox(f, id, set));
    }
    return list;
  }

  /** A rating: a radio group of stars or numbers, so arrows move and screen readers say "3 of 5". */
  private rating(f: Field, id: string, common: Record<string, string | undefined>, set: (v: unknown, picked?: boolean) => void): HTMLElement {
    const r = f.rating ?? { scale: 5, style: "stars" };
    const cur = Number(this.answers[f.id]) || 0;
    const stars = r.style !== "numbers";
    const group = el("div", {
      class: `rt ${stars ? "rs" : "rn"}`,
      role: "radiogroup",
      "aria-labelledby": `${id}-l`,
      "aria-invalid": common["aria-invalid"],
      "aria-describedby": common["aria-describedby"],
      "aria-required": common["aria-required"],
    });
    for (let n = 1; n <= r.scale; n++) {
      const words = n === 1 && r.low ? `, ${r.low}` : n === r.scale && r.high ? `, ${r.high}` : "";
      const c = el("input", { type: "radio", name: id, value: String(n), id: `${id}-${n}`, "aria-label": `${n} of ${r.scale}${words}` }) as HTMLInputElement;
      c.checked = cur === n;
      c.addEventListener("change", () => set(n, true));
      group.append(el("label", { class: (stars ? n <= cur : n === cur) ? "on" : undefined }, c, el("span", { "aria-hidden": "true", text: stars ? "★" : String(n) })));
    }
    if (!r.low && !r.high) return group;
    return el("div", { class: "ch" }, group, el("div", { class: "rl", "aria-hidden": "true" }, el("span", { text: r.low ?? "" }), el("span", { text: r.high ?? "" })));
  }

  /** A single-pick list: a button that opens options, with keys (up, down, enter, escape, letters) and search for long lists. */
  private listbox(f: Field, common: Record<string, string | undefined>, set: (v: unknown, picked?: boolean) => void, inside: boolean): HTMLElement {
    const OTHER_PICK = "\u0000other";
    const options: Choice[] = f.type === "country" ? countryNames(navigator.language) : [...this.optionsOf(f), ...(f.other ? [{ value: OTHER_PICK, label: "Other" }] : [])];
    const other = f.type === "country" ? undefined : this.otherText(f);
    const cur = other !== undefined ? OTHER_PICK : typeof this.answers[f.id] === "string" ? (this.answers[f.id] as string) : "";
    const pick = (value: string) => {
      if (value === OTHER_PICK) {
        this.other[f.id] = other ?? "";
        return set(this.compose(f), true);
      }
      this.other[f.id] = undefined;
      set(value, true);
    };
    const isOpen = this.open === f.id;
    const wrap = el("div", { class: "dd" });
    const btn = el("button", { type: "button", class: "bx", ...common, "aria-haspopup": "listbox", "aria-expanded": isOpen ? "true" : "false" });
    const picked = options.find((o) => o.value === cur);
    btn.append(el("span", { class: picked ? "" : "ph", text: picked?.label ?? (inside ? f.label : f.placeholder) ?? "Choose…" }), el("span", { "aria-hidden": "true", text: "▾" }));
    const close = (focus = true) => {
      this.open = null;
      this.filter = "";
      this.render();
      if (focus) (this.root.getElementById(`clr-${f.id}`) as HTMLElement | null)?.focus();
    };
    btn.addEventListener("click", () => {
      this.open = isOpen ? null : f.id;
      this.filter = "";
      this.render();
      const box = this.root.querySelector(".ls input, .ls .op[aria-selected=true], .ls .op") as HTMLElement | null;
      box?.focus();
    });
    wrap.append(btn);
    if (!isOpen) return wrap;
    const search = options.length > 8;
    const list = el("ul", { class: "ls", role: "listbox", "aria-label": f.label });
    const shownOpts = this.filter ? options.filter((o) => o.label.toLowerCase().includes(this.filter.toLowerCase())) : options;
    const items: HTMLElement[] = [];
    const move = (i: number) => {
      const n = Math.max(0, Math.min(items.length - 1, i));
      items.forEach((x, j) => x.classList.toggle("on", j === n));
      items[n]?.focus();
    };
    if (search) {
      const q = el("input", { class: "in", type: "text", "aria-label": `Search ${f.label}`, autocomplete: "off" }) as HTMLInputElement;
      q.value = this.filter;
      q.addEventListener("input", () => {
        this.filter = q.value;
        this.render();
        const again = this.root.querySelector(".ls input") as HTMLInputElement | null;
        again?.focus();
        again?.setSelectionRange(again.value.length, again.value.length);
      });
      q.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          move(0);
        } else if (e.key === "Escape") close();
        else if (e.key === "Enter") {
          e.preventDefault();
          if (shownOpts[0]) {
            pick(shownOpts[0].value);
            close();
          }
        }
      });
      list.append(el("li", { role: "presentation" }, q));
    }
    shownOpts.slice(0, 300).forEach((o, i) => {
      const li = el("li", { class: "op", role: "option", tabindex: "-1", "aria-selected": o.value === cur ? "true" : "false", text: o.label });
      li.addEventListener("click", () => {
        pick(o.value);
        close();
      });
      li.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          move(i + 1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          if (i === 0 && search) (this.root.querySelector(".ls input") as HTMLElement).focus();
          else move(i - 1);
        } else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          pick(o.value);
          close();
        } else if (e.key === "Escape" || e.key === "Tab") close(e.key === "Escape");
        else if (e.key.length === 1) {
          const j = shownOpts.findIndex((x) => x.label.toLowerCase().startsWith(e.key.toLowerCase()));
          if (j >= 0) move(j);
        }
      });
      items.push(li);
      list.append(li);
    });
    wrap.append(list);
    return wrap;
  }

  private endScreen(form: Form): HTMLElement {
    // Claritia calendar: the times in place of the form. In the builder, sample times and no network.
    if (this.isPreview && form.after.schedule?.tool === "claritia" && !this.bk) this.bk = { token: "", slots: sampleSlots(Date.now()), lengths: [30], length: 30 };
    if (this.bkDone) return this.booked();
    if (this.bk) return this.calendar(form, this.bk);
    // A meeting to book: the scheduler opens in the form, with the lead filled in. In the builder, its link stands in.
    const book = this.schedule ?? (this.isPreview && form.after.schedule?.url ? { tool: form.after.schedule.tool, url: form.after.schedule.url } : null);
    if (book && (!this.isPreview || safeUrl(book.url))) {
      return el(
        "div",
        { class: "f dn", role: "status" },
        el("h2", { class: "h", text: form.after.schedule?.heading || "Pick a time" }),
        el("iframe", { src: book.url, title: "Book a meeting", style: "width:100%;min-height:680px;border:0", loading: "lazy", allow: "payment" }),
      );
    }
    const end = form.after.end;
    if (end.kind === "redirect" && !this.isPreview && safeUrl(end.url)) {
      // In the embed's frame, the page around it opens the address.
      if (!embedFrame()) location.assign(end.url);
      return el("div", { class: "f" }, el("p", { class: "i", text: "One moment…" }));
    }
    const title = end.kind === "message" ? end.title : "Thanks, we got it.";
    const text = end.kind === "message" ? end.text : `Then we open ${end.url}`;
    const box = el("div", { class: "f dn", role: "status", tabindex: "-1" }, el("h2", { class: "h", text: title }), text ? el("p", { class: "i", text }) : null);
    queueMicrotask(() => box.focus());
    return box;
  }

  // Booking ------------------------------------------------------------------------------------------------

  /** The host's photo and name, when known. */
  private hostRow(h?: Booking["host"]) {
    return h ? el("div", { class: "hs" }, h.photo ? el("img", { class: "av", src: h.photo, alt: "" }) : null, el("span", { text: h.name })) : null;
  }

  /** The inline calendar: lengths, the visitor's zone, days and times. One click on a time books it. */
  private calendar(form: Form, b: Booking): HTMLElement {
    const tz = this.bkTz;
    const days = byDay(b.slots, tz);
    const day = days.find((d) => d.day === this.bkDay) ?? days[0];
    this.bkDay = day?.day ?? "";
    const pill = (id: string, text: string, on: boolean, click: () => void, label?: string) => {
      const x = el("button", { type: "button", id: `clr-${id}`, class: "pl", "aria-pressed": on ? "true" : "false", disabled: this.bkBusy, "aria-label": label, text });
      x.addEventListener("click", click);
      return x;
    };
    const box = el("div", { class: "f dn cl" }, el("h2", { class: "h", tabindex: "-1", text: form.after.schedule?.heading || "Pick a time" }), this.hostRow(b.host));
    if (b.lengths.length > 1)
      box.append(el("div", { class: "ps", role: "group", "aria-label": "Length" }, ...b.lengths.map((n) => pill(`l${n}`, `${n} min`, n === b.length, () => void this.times(n)))));
    // The zone: the component's own listbox, so it works like every other list on the form.
    const TZ = "_tz";
    this.answers[TZ] = tz;
    const zf = { id: TZ, key: TZ, type: "dropdown", label: "Time zone", required: false, options: zones(localZone()).map((z) => ({ value: z, label: zoneName(z) })) } as unknown as Field;
    box.append(
      el("div", { class: "tz" }, el("label", { class: "lb", for: `clr-${TZ}`, text: "Time zone" }), this.listbox(zf, { id: `clr-${TZ}` }, (v) => {
        if (typeof v === "string" && v) this.bkTz = v;
        this.later();
      }, false)),
    );
    if (this.bkMsg) box.append(el("p", { class: "al", role: "alert", text: this.bkMsg }));
    if (!day) {
      box.append(el("p", { class: "i", text: "No open times right now." }));
      return box;
    }
    box.append(el("div", { class: "ps dy", role: "group", "aria-label": "Day" }, ...days.map((d) => pill(`d${d.day}`, dayText(d.starts[0]!, tz), d === day, () => ((this.bkDay = d.day), this.later())))));
    const label = `Times on ${dayText(day.starts[0]!, tz)}`;
    box.append(el("div", { class: "tm", role: "group", "aria-label": label }, ...day.starts.map((t) => pill(`t${t}`, timeText(t, tz), false, () => void this.pick(t), `Book ${timeText(t, tz)}, ${dayText(t, tz)}`))));
    return box;
  }

  /** The meeting booked, in place of the calendar. */
  private booked(): HTMLElement {
    const m = this.bkDone!;
    const tz = this.bkTz;
    const box = el(
      "div",
      { class: "f dn cl", role: "status", tabindex: "-1" },
      el("h2", { class: "h", text: "You're booked" }),
      this.hostRow(m.host),
      el("p", { class: "i", text: `${dayText(m.start, tz)}, ${timeText(m.start, tz)} to ${timeText(m.end, tz)} (${zoneName(tz)})` }),
      el("p", { class: "i", text: "The invite is on its way to your inbox." }),
      m.manage && /^https:\/\//.test(m.manage) ? el("a", { class: "i", href: m.manage, target: "_blank", rel: "noopener", text: "Change or cancel" }) : null,
    );
    queueMicrotask(() => box.focus());
    return box;
  }

  /** Ask the booking route: fresh times (no start) or a booking. */
  private async bookCall(body: object): Promise<{ status: number; j: Answer }> {
    try {
      const res = await fetch(`${this.base}/api/forms/book`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: this.bk!.token, ...body }), credentials: "omit" });
      return { status: res.status, j: (await res.json().catch(() => ({}))) as Answer };
    } catch {
      return { status: 0, j: {} };
    }
  }

  private settle(r: { status: number; j: Answer }, focus = "") {
    this.bkBusy = false;
    if (r.j.booked) this.bkDone = r.j.booked;
    if (r.j.booking) this.bk = r.j.booking;
    this.bkMsg = r.j.taken ? "That time was just taken. Pick another." : r.j.booked || (r.status === 200 && r.j.booking) ? "" : (r.j.error ?? "Booking didn't go through. Try again.");
    this.render();
    (this.root.getElementById(focus) ?? (this.bkMsg ? this.root.querySelector(".tm .pl") : null) as HTMLElement | null)?.focus();
  }

  private async times(length: number) {
    if (this.isPreview) return void ((this.bk = { ...this.bk!, length }), this.later());
    if (this.bkBusy) return;
    this.bkBusy = true;
    this.render();
    this.settle(await this.bookCall({ length }), `clr-l${length}`);
  }

  private async pick(start: number) {
    const b = this.bk!;
    if (this.bkBusy) return;
    if (this.isPreview) {
      this.bkDone = { start, end: start + b.length * 60_000, ...(b.host ? { host: b.host } : {}) };
      return this.render();
    }
    this.bkBusy = true;
    this.bkMsg = "";
    this.render();
    this.settle(await this.bookCall({ start, length: b.length, tz: this.bkTz }));
  }

  // Sending ------------------------------------------------------------------------------------------------

  private async next() {
    const d = this.data!;
    const form = d.body;
    // A region list still on its way: wait for it, so what shows matches what the server checks.
    await Promise.all([...this.regions.values()].filter((x) => x instanceof Promise));
    const r = checkAnswers(form, this.answers, { steps: [this.step], known: this.known, ...this.ctx });
    this.errors = r.errors;
    this.alert = "";
    if (Object.keys(r.errors).length) {
      this.render();
      // A group (radios, check boxes, a rating) takes focus on its first box.
      const first = this.root.querySelector("[aria-invalid=true]") as HTMLElement | null;
      (first && !first.matches("input,button,textarea") ? (first.querySelector("input,button") as HTMLElement | null) : first)?.focus();
      return;
    }
    const to = nextStep(form, this.step, this.answers, this.ctx);
    if (to < form.steps.length) {
      this.step = to;
      this.render();
      (this.root.querySelector(".in, .bx, input") as HTMLElement | null)?.focus();
      return;
    }
    if (this.isPreview) {
      this.done = true;
      return this.render();
    }
    await this.send();
  }


  /**
   * Fill before submit: ask which of the owner's chosen fields enrichment already knows for this email, and hide the
   * ones the visitor hasn't answered. A slow or failed answer hides nothing. A new email asks again.
   */
  private async lookupKnown(form: Form, value: unknown) {
    if (!form.enrich?.hideKnown || this.isPreview || !this.data) return;
    const email = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email === this.knownFor) return;
    this.knownFor = email;
    let ids: string[] = [];
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 2500);
      const res = await fetch(`${this.base}/api/forms/${this.data.id}/known`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }), credentials: "omit", signal: ctl.signal });
      clearTimeout(t);
      if (res.ok) ids = ((await res.json()) as { known?: unknown }).known as string[];
    } catch {
      ids = [];
    }
    // The email changed while we asked: this answer is for another person.
    if (this.knownFor !== email || !Array.isArray(ids)) return;
    const empty = (id: string) => this.answers[id] === undefined || this.answers[id] === "" || (Array.isArray(this.answers[id]) && !(this.answers[id] as unknown[]).length);
    const next = new Set(ids.filter((id) => typeof id === "string" && empty(id)));
    const same = next.size === this.known.size && [...next].every((id) => this.known.has(id));
    if (same) return;
    this.known = next;
    for (const id of next) delete this.errors[id];
    this.later();
  }

  private async send() {
    const d = this.data!;
    this.sending = true;
    this.render();
    const t = touch();
    const body = JSON.stringify({
      v: 1,
      version: d.version,
      key: this.key,
      answers: this.answers,
      hidden: hiddenValues(d.body, t),
      consent: this.needsConsent() ? { given: this.consent, wording: d.body.consent.label } : {},
      page: t.page,
      referrer: t.referrer,
      utm: t.utm,
      first: t.first,
      ms: Date.now() - this.started,
      trap: (this.root.querySelector('input[name="company_url"]') as HTMLInputElement | null)?.value ?? "",
      turnstile: this.turnstileToken || undefined,
      // The daily form check opens the form with its token; the fill is then marked as a test.
      qa: new URLSearchParams(location.search).get("clr_qa") || undefined,
      known: this.known.size ? [...this.known] : undefined,
      today: localDay(),
    });
    const url = `${this.base}/api/forms/${d.id}/submit`;
    let res: Response | null = null;
    try {
      res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body, credentials: "omit", keepalive: true });
    } catch {
      res = null;
    }
    this.sending = false;
    if (res && res.status === 400) {
      // The server's own check found something the browser didn't (a free email on a work email field).
      const j = (await res.json().catch(() => ({}))) as { errors?: Record<string, string>; error?: string };
      this.errors = j.errors ?? {};
      this.alert = j.errors ? "" : (j.error ?? "Check the form and try again.");
      const firstStep = d.body.steps.findIndex((s) => s.fields.some((f) => this.errors[f.id]));
      if (firstStep >= 0) this.step = firstStep;
      return this.render();
    }
    if (res && res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      this.alert = j.error ?? "This form can't take answers right now.";
      return this.render();
    }
    if (!res || !res.ok) {
      // Kept and sent later with the same key; the visitor is done either way.
      writeQueue([...readQueue().filter((x) => x.key !== this.key), { url, body, key: this.key, at: Date.now(), tries: 1 }]);
      setTimeout(() => void flushQueue(), 15_000);
    } else {
      const j = (await res.json().catch(() => ({}))) as { id?: string; schedule?: { tool: string; url: string } | null; booking?: Booking };
      if (j.schedule && /^https:\/\//.test(j.schedule.url)) this.schedule = j.schedule;
      if (j.booking?.token && Array.isArray(j.booking.slots)) this.bk = j.booking;
      this.dispatchEvent(new CustomEvent("claritia:submitted", { bubbles: true, composed: true, detail: { formId: d.id, submissionId: j.id ?? null } }));
      this.tellPage();
    }
    this.done = true;
    this.render();
    // The calendar in place of the form: screen readers and keys start at its heading.
    if (this.bk) (this.root.querySelector(".cl .h") as HTMLElement | null)?.focus();
  }
}

if (typeof customElements !== "undefined" && !customElements.get("claritia-form")) customElements.define("claritia-form", ClaritiaForm);

// <script src=".../forms/v1.js" data-capture="<form id>,<form id>">: capture the team's own forms on this page.
const captureIds = (typeof document !== "undefined" && (document.currentScript as HTMLScriptElement | null)?.dataset.capture) || "";
if (captureIds) {
  void flushQueue();
  for (const id of captureIds.split(",").map((x) => x.trim()).filter(Boolean)) void startCapture(id, SCRIPT_BASE || location.origin);
}
