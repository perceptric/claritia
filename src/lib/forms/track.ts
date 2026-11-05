// Tracking in the browser (docs/integrations-plan.md, Next step 2): the form's events go to the team's own tags.
// Part of the form script's second file (x1.js, src/lib/forms/extras.ts), loaded only by forms with Tracking on.
//   view and start come from the form's own view and start counts (once per load), submit and booked from the send
//   and the booking. GTM gets claritia_view, claritia_start, claritia_submit and claritia_booked in dataLayer. GA4
//   gets the same, with generate_lead for the send. Google Ads gets a conversion on the send. Meta's pixel gets Lead
//   and Schedule, with the event id the server's Conversions API event uses, so Meta counts each once.
//   Consent: on a page with Google Consent Mode, nothing is loaded or sent to Meta or Google Ads until it's granted;
//   a page with its own gtag or fbq keeps control of them. With no consent tool on the page, Claritia loads no tag
//   of its own for a visitor where the law asks first (the server's strict regions).

export type TrackCfg = { ga4?: string; gtm?: true; pixel?: string; meta?: true; ads?: { id: string; label: string } };
export type TrackName = "view" | "start" | "submit" | "booked";
export type TrackDetail = { formId: string; formName?: string; submissionId?: string | null };

type Fn = ((...a: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown };
export type TrackWindow = { dataLayer?: unknown[]; gtag?: Fn; fbq?: Fn; _fbq?: Fn; document?: { cookie?: string }; location?: { search?: string }; __clrT?: Set<string> };

/** Google Consent Mode as the page set it, or null when the page doesn't use it. */
export function consentState(dl: unknown[] | undefined): { analytics: boolean; ads: boolean } | null {
  let seen = false;
  const st: Record<string, unknown> = {};
  for (const e of dl ?? []) {
    const a = e as { 0?: unknown; 1?: unknown; 2?: unknown; length?: number } | null;
    if (a && typeof a === "object" && typeof a.length === "number" && a[0] === "consent" && (a[1] === "default" || a[1] === "update") && a[2] && typeof a[2] === "object") {
      seen = true;
      Object.assign(st, a[2]);
    }
  }
  return seen ? { analytics: st.analytics_storage === "granted", ads: st.ad_storage === "granted" } : null;
}

/** Whether a tag may run: Consent Mode decides when the page has it; otherwise loading a tag waits in strict regions. */
export function mayRun(kind: "analytics" | "ads", dl: unknown[] | undefined, strict: boolean, loading: boolean): boolean {
  const c = consentState(dl);
  if (c) return c[kind];
  return !(strict && loading);
}

const DL_NAME: Record<TrackName, string> = { view: "claritia_view", start: "claritia_start", submit: "claritia_submit", booked: "claritia_booked" };
const GA_NAME: Record<TrackName, string> = { view: "claritia_view", start: "claritia_start", submit: "generate_lead", booked: "claritia_booked" };

/** The id Meta dedupes on: the fill's for the send, and the fill's with book_ for its booking. The server uses the same. */
export const metaEventId = (name: TrackName, submissionId?: string | null): string | undefined => (!submissionId ? undefined : name === "submit" ? submissionId : name === "booked" ? `book_${submissionId}` : undefined);

/** The tags this page already set up: a GA4 or Ads id configured, a pixel started. */
const doneOn = (w: TrackWindow) => (w.__clrT ??= new Set());

function gtagOf(w: TrackWindow, id: string, load: (src: string) => void): Fn {
  if (!w.gtag) {
    const dl = (w.dataLayer ??= []);
    w.gtag = function () {
      // gtag.js reads its commands as arguments objects.
      // eslint-disable-next-line prefer-rest-params
      dl.push(arguments);
    } as Fn;
    w.gtag("js", new Date());
    load(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`);
  }
  if (!doneOn(w).has(id)) {
    doneOn(w).add(id);
    w.gtag("config", id, { send_page_view: false });
  }
  return w.gtag;
}

function fbqOf(w: TrackWindow, pixel: string, load: (src: string) => void): Fn {
  if (!w.fbq) {
    const n = function (...a: unknown[]) {
      if (n.callMethod) n.callMethod(...a);
      else n.queue!.push(a);
    } as Fn;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    w.fbq = n;
    w._fbq ??= n;
    load("https://connect.facebook.net/en_US/fbevents.js");
  }
  if (!doneOn(w).has(`px:${pixel}`)) {
    doneOn(w).add(`px:${pixel}`);
    w.fbq("init", pixel);
  }
  return w.fbq;
}

const loadScript = (src: string) => {
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  document.head.append(s);
};

/** Send one of the form's events to the tags it has on. Never throws: a blocked tag never stops the form. */
export function track(cfg: TrackCfg, name: TrackName, d: TrackDetail, strict: boolean, w: TrackWindow = window as unknown as TrackWindow, load: (src: string) => void = loadScript): void {
  const params = { form_id: d.formId, form_name: d.formName ?? "", ...(d.submissionId ? { submission_id: d.submissionId } : {}) };
  try {
    if (cfg.gtm) (w.dataLayer ??= []).push({ event: DL_NAME[name], claritia_form_id: d.formId, claritia_form_name: d.formName ?? "", claritia_submission_id: d.submissionId ?? null });
  } catch {}
  try {
    if (cfg.ga4 && (w.gtag || mayRun("analytics", w.dataLayer, strict, true))) gtagOf(w, cfg.ga4, load)("event", GA_NAME[name], { send_to: cfg.ga4, ...params });
  } catch {}
  try {
    if (cfg.ads && name === "submit" && (w.gtag ? mayRun("ads", w.dataLayer, strict, false) : mayRun("ads", w.dataLayer, strict, true)))
      gtagOf(w, cfg.ads.id, load)("event", "conversion", { send_to: `${cfg.ads.id}/${cfg.ads.label}`, ...(d.submissionId ? { transaction_id: d.submissionId } : {}) });
  } catch {}
  try {
    const ev = name === "submit" ? "Lead" : name === "booked" ? "Schedule" : null;
    if (cfg.pixel && ev && mayRun("ads", w.dataLayer, strict, !w.fbq)) {
      const id = metaEventId(name, d.submissionId);
      fbqOf(w, cfg.pixel, load)("trackSingle", cfg.pixel, ev, { content_name: d.formName ?? "" }, id ? { eventID: id } : {});
    }
  } catch {}
}

const cookie = (w: TrackWindow, name: string) => {
  const m = new RegExp(`(?:^|; )${name}=([^;]*)`).exec(w.document?.cookie ?? "");
  return m ? decodeURIComponent(m[1]!) : undefined;
};

/**
 * What the send tells the server for its own events: Meta's browser and click cookies, and whether the visitor's
 * consent lets ad events go (Consent Mode's ad_storage, or no consent tool outside strict regions).
 */
export function trackInfo(strict: boolean, w: TrackWindow = window as unknown as TrackWindow, now = Date.now()): { fbp?: string; fbc?: string; ok: boolean } {
  const ok = mayRun("ads", w.dataLayer, strict, true);
  if (!ok) return { ok };
  const fbclid = new URLSearchParams(w.location?.search ?? "").get("fbclid");
  const fbp = cookie(w, "_fbp");
  const fbc = cookie(w, "_fbc") ?? (fbclid ? `fb.1.${now}.${fbclid}` : undefined);
  return { ok, ...(fbp ? { fbp: fbp.slice(0, 200) } : {}), ...(fbc ? { fbc: fbc.slice(0, 500) } : {}) };
}
