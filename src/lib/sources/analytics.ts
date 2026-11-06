// Product analytics (docs/integrations-plan.md, Next step 8): Segment, PostHog, Mixpanel and Amplitude get each
// form fill (and a workflow's event step) as an event, with the person's email as their id and their name and company
// set on them. Keys pasted in Settings › Integrations; nothing pulls. Each event carries the fill's id as the tool's
// own dedupe id (Segment's messageId, PostHog's uuid, Mixpanel's $insert_id, Amplitude's insert_id), so a retry
// after a lost answer is dropped by the tool and counts once.

import { createHash } from "node:crypto";
import type { AnalyticsEvent, Connector, Ctx } from "./types.ts";

export type { AnalyticsEvent } from "./types.ts";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
/** A UUID made from any id, the same every time (PostHog dedupes on it). */
export function uuidOf(id: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return id.toLowerCase();
  const h = sha(id);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16]!, 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
/** Mixpanel's and Amplitude's dedupe ids: letters, digits and dashes, 36 at most. */
export const insertIdOf = (id: string) => (/^[A-Za-z0-9-]{1,36}$/.test(id) ? id : sha(id).slice(0, 32));
const who = (ev: AnalyticsEvent) => ev.userId ?? `anon-${ev.id}`;
const accountOf = (ctx: Ctx, key: string, label: string) => ({ id: sha(ctx.secret(key)).slice(0, 16), label });
const eu = (ctx: Ctx) => /^eu$/i.test(ctx.secret("region").trim());

// Segment ------------------------------------------------------------------------------------------------------

const segBase = (ctx: Ctx) => (eu(ctx) ? "https://events.eu1.segmentapis.com/v1" : "https://api.segment.io/v1");
const segAuth = (ctx: Ctx) => ({ authorization: `Basic ${Buffer.from(`${ctx.secret("write_key").trim()}:`).toString("base64")}` });

export const segment: Connector = {
  kind: "segment",
  objects: [],
  gapMs: 50,
  account: async (ctx) => accountOf(ctx, "write_key", "Segment"),
  async event(ctx, ev) {
    const base = { userId: who(ev), timestamp: ev.at, context: { library: { name: "claritia", version: "1" } } };
    if (ev.traits && ev.userId) await ctx.api(`${segBase(ctx)}/identify`, { method: "POST", auth: false, headers: segAuth(ctx), body: JSON.stringify({ ...base, messageId: `${ev.id}:identify`, traits: { email: ev.userId, ...ev.traits } }) });
    await ctx.api(`${segBase(ctx)}/track`, { method: "POST", auth: false, headers: segAuth(ctx), body: JSON.stringify({ ...base, messageId: ev.id, event: ev.name, properties: ev.props }) });
  },
  defaults: { contact: {} },
};

// PostHog ------------------------------------------------------------------------------------------------------

const phHost = (ctx: Ctx) => {
  const h = ctx.secret("host").trim().replace(/\/+$/, "") || "https://us.i.posthog.com";
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(h)) throw Object.assign(new Error("Use your PostHog address, like https://us.i.posthog.com."), { status: 400 });
  return h;
};

export const posthog: Connector = {
  kind: "posthog",
  objects: [],
  gapMs: 50,
  account: async (ctx) => accountOf(ctx, "api_key", phHost(ctx).replace(/^https:\/\//, "")),
  async event(ctx, ev) {
    await ctx.api(`${phHost(ctx)}/capture/`, {
      method: "POST",
      auth: false,
      body: JSON.stringify({
        api_key: ctx.secret("api_key").trim(),
        event: ev.name,
        distinct_id: who(ev),
        timestamp: ev.at,
        uuid: uuidOf(ev.id),
        properties: { ...ev.props, ...(ev.traits && ev.userId ? { $set: { email: ev.userId, ...ev.traits } } : {}), $lib: "claritia" },
      }),
    });
  },
  defaults: { contact: {} },
};

// Mixpanel -----------------------------------------------------------------------------------------------------

const mpBase = (ctx: Ctx) => (eu(ctx) ? "https://api-eu.mixpanel.com" : "https://api.mixpanel.com");

/** Mixpanel answers 200 with { status: 0, error } when it took nothing; a bad token is the sign-in. */
async function mpSend(ctx: Ctx, path: string, body: unknown) {
  const r = await ctx.api<{ status?: number; error?: string } | number>(`${mpBase(ctx)}${path}?strict=1&verbose=1`, { method: "POST", auth: false, body: JSON.stringify(body) });
  if (typeof r === "object" && r && r.status === 0) throw Object.assign(new Error(`Mixpanel: ${r.error ?? "it took nothing"}`), { status: /token/i.test(r.error ?? "") ? 401 : 400 });
}

export const mixpanel: Connector = {
  kind: "mixpanel",
  objects: [],
  gapMs: 50,
  account: async (ctx) => accountOf(ctx, "token", "Mixpanel"),
  async event(ctx, ev) {
    const token = ctx.secret("token").trim();
    await mpSend(ctx, "/track", [{ event: ev.name, properties: { ...ev.props, token, distinct_id: who(ev), time: Date.parse(ev.at), $insert_id: insertIdOf(ev.id) } }]);
    if (ev.traits && ev.userId) await mpSend(ctx, "/engage", [{ $token: token, $distinct_id: ev.userId, $set: { $email: ev.userId, ...ev.traits } }]);
  },
  defaults: { contact: {} },
};

// Amplitude ----------------------------------------------------------------------------------------------------

const ampUrl = (ctx: Ctx) => (eu(ctx) ? "https://api.eu.amplitude.com/2/httpapi" : "https://api2.amplitude.com/2/httpapi");

export const amplitude: Connector = {
  kind: "amplitude",
  objects: [],
  gapMs: 50,
  account: async (ctx) => accountOf(ctx, "api_key", "Amplitude"),
  async event(ctx, ev) {
    await ctx.api(ampUrl(ctx), {
      method: "POST",
      auth: false,
      body: JSON.stringify({
        api_key: ctx.secret("api_key").trim(),
        events: [{ user_id: who(ev), event_type: ev.name, time: Date.parse(ev.at), insert_id: insertIdOf(ev.id), event_properties: ev.props, ...(ev.traits ? { user_properties: { email: ev.userId, ...ev.traits } } : {}) }],
      }),
    });
  },
  defaults: { contact: {} },
};

export const ANALYTICS = [segment, posthog, mixpanel, amplitude];
