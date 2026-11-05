// Tracking on the server (docs/integrations-plan.md, Next step 2): Meta's Conversions API and Google Ads offline
// conversions for a form with Tracking on. A fill whose visitor's consent allows ad events keeps its browser details
// (128_track.sql) and gets a track_send job (worker-intel/jobs/track.ts); a booking from that fill gets one more.
//   Meta gets Lead for the fill and Schedule for its booking, with the browser pixel's event id, so it counts each
//   once. Google Ads gets the fill as a click conversion on the action picked in Settings › Tracking, with the fill's
//   id as its order id, so a second upload is dropped by Google.

import { createHash } from "node:crypto";
import type { Rpc } from "../jobs.ts";
import type { Track } from "../forms/schema.ts";
import type { Ctx } from "../sources/types.ts";
import { AuthError } from "../sources/types.ts";

export const META_VERSION = "v21.0";
export const ADS_VERSION = "v22";

/** Whether a form's Tracking sends anything from the server. */
export const serverTracked = (t: Track | undefined): boolean => !!(t?.meta || t?.upload);

export type TrackInfo = { ip?: string; ua?: string; fbp?: string; fbc?: string; url?: string };

/**
 * What a fill keeps for its server events, or null when consent doesn't allow them: the browser's word when it
 * sent one (Consent Mode's ad_storage), else no in strict regions.
 */
export function trackInfoFor(raw: unknown, c: { ip?: string; ua?: string | null; page?: unknown; strict: boolean }): TrackInfo | null {
  const t = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const ok = t && typeof t.ok === "boolean" ? t.ok : !c.strict;
  if (!ok) return null;
  const str = (v: unknown, max: number, re?: RegExp) => (typeof v === "string" && v && v.length <= max && (!re || re.test(v)) ? v : undefined);
  const out: TrackInfo = {
    ip: str(c.ip, 64, /^[0-9a-fA-F:.]+$/),
    ua: str(c.ua ?? undefined, 500),
    fbp: str(t?.fbp, 200, /^fb\.\d\.\d+\.\d+$/),
    fbc: str(t?.fbc, 500, /^fb\.\d\.\d+\.[A-Za-z0-9_-]+$/),
    url: str(c.page, 2000, /^https?:\/\//),
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as TrackInfo;
}

/** Keep the details and queue the fill's event. A hiccup here costs the event, never the fill. */
export async function queueTrack(rpc: Rpc, submission: string, info: TrackInfo): Promise<void> {
  await rpc("track_keep", { p_sub: submission, p_info: info });
}

/** What track_take reads for one fill (128). */
export type TrackTake = {
  workspace_id: string;
  submission: { id: string; created_at: string; hidden: Record<string, unknown>; contact_id: string | null };
  form: { id: string | null; name: string | null };
  track: Track;
  info: TrackInfo;
  booked_at: string | null;
  contact: { id: string; email: string | null; phone: string | null; first_name: string | null; last_name: string | null; country: string | null } | null;
  meta_source: string | null;
  ads_source: string | null;
};

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const hashed = (v: string | null | undefined, clean: (s: string) => string = (s) => s.trim().toLowerCase()) => {
  const c = v ? clean(v) : "";
  return c ? [sha(c)] : undefined;
};

/** One Conversions API event: Lead for the fill, Schedule for its booking. Hashes what Meta asks to be hashed. */
export function metaEvent(x: TrackTake, event: "submit" | "booked") {
  const c = x.contact;
  const at = event === "booked" && x.booked_at ? x.booked_at : x.submission.created_at;
  const user = {
    em: hashed(c?.email),
    ph: hashed(c?.phone, (s) => s.replace(/\D/g, "")),
    fn: hashed(c?.first_name),
    ln: hashed(c?.last_name),
    country: hashed(c?.country),
    external_id: hashed(c?.id),
    client_ip_address: x.info.ip,
    client_user_agent: x.info.ua,
    fbp: x.info.fbp,
    fbc: x.info.fbc,
  };
  return {
    event_name: event === "submit" ? "Lead" : "Schedule",
    event_time: Math.floor(Date.parse(at) / 1000),
    event_id: event === "submit" ? x.submission.id : `book_${x.submission.id}`,
    action_source: "website",
    ...(x.info.url ? { event_source_url: x.info.url } : {}),
    user_data: Object.fromEntries(Object.entries(user).filter(([, v]) => v !== undefined)),
    custom_data: { content_name: x.form.name ?? "" },
  };
}

/** A Google click id the fill kept: gclid, or gbraid and wbraid from iOS. */
export function clickIdOf(hidden: Record<string, unknown>): { gclid?: string; gbraid?: string; wbraid?: string } | null {
  const pick = (k: string) => {
    const v = hidden[k] ?? hidden[`first_${k}`];
    return typeof v === "string" && /^[A-Za-z0-9._-]{10,300}$/.test(v) ? v : undefined;
  };
  const gclid = pick("gclid"),
    gbraid = pick("gbraid"),
    wbraid = pick("wbraid");
  return gclid ? { gclid } : gbraid ? { gbraid } : wbraid ? { wbraid } : null;
}

/** Google's time: "yyyy-mm-dd hh:mm:ss+00:00". */
export const adsTime = (iso: string) => `${new Date(iso).toISOString().slice(0, 19).replace("T", " ")}+00:00`;

/** One click conversion for the fill, or null with no click id. */
export function adsConversion(x: TrackTake) {
  const u = x.track.upload;
  const click = clickIdOf(x.submission.hidden ?? {});
  if (!u || !click) return null;
  return {
    ...click,
    conversionAction: `customers/${u.customer}/conversionActions/${u.action}`,
    conversionDateTime: adsTime(x.submission.created_at),
    orderId: x.submission.id,
    consent: { adUserData: "GRANTED" },
  };
}

/** A refusal that won't change (a sign-in turned down, a 4xx); anything else (down, slow, rate limited) is tried again. */
const refused = (e: unknown) => e instanceof AuthError || (typeof (e as { status?: unknown }).status === "number" && (e as { status: number }).status < 500 && (e as { status: number }).status !== 429);

export type SendOut = { status: "done" } | { status: "skipped"; reason: string } | { status: "failed"; error: string };

/** Send Meta's event with the connection's token. A 4xx won't change; the rest throws for the job to try again. */
export async function sendMeta(ctx: Ctx, pixel: string, event: ReturnType<typeof metaEvent>): Promise<SendOut> {
  const token = ctx.secret("access_token");
  if (!token) return { status: "failed", error: "Connect Meta again in Settings › Integrations." };
  try {
    const r = await ctx.api<{ events_received?: number }>(`https://graph.facebook.com/${META_VERSION}/${pixel}/events`, {
      method: "POST",
      auth: false,
      body: JSON.stringify({ data: [event], access_token: token }),
    });
    return (r.events_received ?? 0) > 0 ? { status: "done" } : { status: "failed", error: "Meta took no event." };
  } catch (e) {
    if (!refused(e)) throw e;
    return { status: "failed", error: `Meta: ${(e as Error).message}`.slice(0, 300) };
  }
}

/** Upload the click conversion. A repeat of the same order id is already there, so it counts as done. */
export async function sendAds(ctx: Ctx, customer: string, conversion: NonNullable<ReturnType<typeof adsConversion>>, developerToken: string, login?: string): Promise<SendOut> {
  type Answer = { partialFailureError?: { message?: string; details?: { errors?: { errorCode?: Record<string, string>; message?: string }[] }[] } };
  try {
    const r = await ctx.api<Answer>(`https://googleads.googleapis.com/${ADS_VERSION}/customers/${customer}:uploadClickConversions`, {
      method: "POST",
      headers: { "developer-token": developerToken, ...(login ? { "login-customer-id": login } : {}) },
      body: JSON.stringify({ conversions: [conversion], partialFailure: true }),
    });
    const errs = (r.partialFailureError?.details ?? []).flatMap((d) => d.errors ?? []);
    if (!r.partialFailureError) return { status: "done" };
    if (errs.length && errs.every((x) => Object.values(x.errorCode ?? {}).some((c) => /ALREADY_EXISTS|DUPLICATE/.test(c)))) return { status: "done" };
    const why = errs[0]?.message ?? r.partialFailureError.message ?? "Google Ads refused it.";
    return { status: "failed", error: `Google Ads: ${why}`.slice(0, 300) };
  } catch (e) {
    if (!refused(e)) throw e;
    return { status: "failed", error: `Google Ads: ${(e as Error).message}`.slice(0, 300) };
  }
}
