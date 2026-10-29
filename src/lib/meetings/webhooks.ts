// Meeting webhooks (docs/scheduling-plan.md Part 5). Server only.
//   Each meeting change writes one send per endpoint in the database (081_booking_webhooks.sql) and queues a
//   meeting_webhook job. A try signs the saved body with the endpoint's secret and POSTs it. The first try fills in
//   what the change didn't know yet (the video link, the guest's manage link) and keeps that body for every retry,
//   so receivers always get the same bytes and id and can drop repeats.

import { createHmac, randomBytes } from "node:crypto";
import { hostIsPrivate } from "../privateNet.ts";
import { seal, unseal } from "../seal.ts";
import { keptManageToken, manageUrl } from "./links.ts";
import { WEBHOOK_EVENTS, type WebhookEvent } from "./webhookEvents.ts";

export { EVENT_LABEL, isEvent, WEBHOOK_EVENTS, type WebhookEvent } from "./webhookEvents.ts";

const TIMEOUT_MS = 15_000;

/** The signature header: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">, as form webhooks sign. */
export const signature = (secret: string, body: string, at: number) => `t=${at},v1=${createHmac("sha256", secret).update(`${at}.${body}`).digest("hex")}`;

/** A new signing secret: whsec_ and 32 random bytes. */
export const newSecret = () => `whsec_${randomBytes(32).toString("base64url")}`;

/** An endpoint as typed: an https address, at least one event and an optional note. */
export function checkEndpoint(raw: unknown): { url: string | null; events: WebhookEvent[] | null; description: string | null; active: boolean | null } | { error: string } {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  let url: string | null = null;
  if (r.url !== undefined) {
    let u: URL;
    try {
      u = new URL(String(r.url).trim());
    } catch {
      return { error: "Enter the full address, starting with https://." };
    }
    if (u.protocol !== "https:") return { error: "Webhooks need an https:// address." };
    if (u.username || u.password) return { error: "Take the name and password out of the address." };
    if (u.href.length > 2000) return { error: "That address is too long." };
    url = u.href;
  }
  let events: WebhookEvent[] | null = null;
  if (r.events !== undefined) {
    if (!Array.isArray(r.events)) return { error: "Pick at least one event." };
    events = WEBHOOK_EVENTS.filter((e) => (r.events as unknown[]).includes(e));
    if (!events.length) return { error: "Pick at least one event." };
  }
  const description = r.description === undefined ? null : String(r.description ?? "").trim().slice(0, 120);
  const active = typeof r.active === "boolean" ? r.active : null;
  return { url, events, description, active };
}

/** The sealed address and secret, and what's safe to show of them. */
export function sealEndpoint(url: string, secret: string, key?: string) {
  return { sealed: seal(JSON.stringify({ url, secret }), key), host: new URL(url).host, hint: secret.slice(-4) };
}
export const openEndpoint = (sealed: string, key?: string) => JSON.parse(unseal(sealed, key)) as { url: string; secret: string };

export type Body = { id: string; event: string; created_at: string; workspace_id: string; test: boolean; data: { meeting: Record<string, unknown> } };

export type Taken = {
  id: string;
  event: string;
  body: Body;
  frozen: boolean;
  attempts: number;
  active: boolean;
  sealed: string;
  meeting: { id: string; token_hash: string; token_sealed: string | null; status: string; location: Record<string, unknown> } | null;
};

/**
 * The body the first try sends: the change's body with the meeting's location as it is now (the calendar event may
 * have added the video link) and the guest's manage link while the meeting can still be moved or canceled.
 */
export function firstBody(t: Taken, base: string, key?: string): Body {
  const m = t.meeting;
  if (!m || t.body.test) return t.body;
  const meeting = { ...t.body.data.meeting };
  meeting.location = { ...((meeting.location as Record<string, unknown>) ?? {}), ...m.location };
  const token = t.event === "meeting.canceled" || m.status === "canceled" ? null : keptManageToken(m, key);
  meeting.manage_url = token ? manageUrl(base, token) : null;
  return { ...t.body, data: { ...t.body.data, meeting } };
}

export type SendResult = { status: "done"; code: number } | { status: "retry"; code: number | null; error: string; retryAfterS?: number } | { status: "failed"; code: number | null; error: string };

export type SendDeps = { fetcher?: typeof fetch; resolve?: Parameters<typeof hostIsPrivate>[1]; now?: () => number };

const transient = (status: number) => status === 408 || status === 425 || status === 429 || status >= 500;

/** One POST of a body to an endpoint, signed. Says whether it worked, should be tried again, or can't work. */
export async function sendWebhook(o: { url: string; secret: string; delivery: string; body: Body }, d: SendDeps = {}): Promise<SendResult> {
  let u: URL;
  try {
    u = new URL(o.url);
  } catch {
    return { status: "failed", code: null, error: "Add the webhook address again." };
  }
  if (u.protocol !== "https:" || u.username || u.password) return { status: "failed", code: null, error: "Webhooks need an https:// address." };
  if (await hostIsPrivate(u.hostname, d.resolve)) return { status: "failed", code: null, error: "That address is on a private network." };
  const text = JSON.stringify(o.body);
  const at = Math.floor((d.now ?? Date.now)() / 1000);
  let res: Response;
  try {
    res = await (d.fetcher ?? fetch)(u.href, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "Claritia-Webhooks/1",
        "x-claritia-event": o.body.event,
        "x-claritia-delivery": o.delivery,
        "x-claritia-signature": signature(o.secret, text, at),
      },
      body: text,
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const err = e as Error;
    return { status: "retry", code: null, error: err.name === "TimeoutError" ? "No answer within 15 seconds." : `Couldn't reach it: ${err.message}`.slice(0, 300) };
  }
  if (res.ok) return { status: "done", code: res.status };
  if (res.status >= 300 && res.status < 400) return { status: "failed", code: res.status, error: `It answered ${res.status} (a redirect). Use the final address.` };
  if (transient(res.status)) {
    const n = Number(res.headers.get("retry-after"));
    return { status: "retry", code: res.status, error: `It answered ${res.status}.`, ...(Number.isFinite(n) && n > 0 ? { retryAfterS: Math.min(n, 21_600) } : {}) };
  }
  return { status: "failed", code: res.status, error: `It answered ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`.trim() };
}

/** A sample body for "Send test", shaped like a real one. */
export function sampleBody(event: WebhookEvent, ws: string, at = new Date()): Body {
  const start = new Date(at.getTime() + 2 * 86_400_000);
  start.setUTCMinutes(0, 0, 0);
  return {
    id: `evt_test_${at.getTime()}`,
    event,
    created_at: at.toISOString(),
    workspace_id: ws,
    test: true,
    data: {
      meeting: {
        id: "00000000-0000-0000-0000-000000000000",
        status: event === "meeting.canceled" ? "canceled" : event === "meeting.held" ? "held" : event === "meeting.no_show" ? "no_show" : "booked",
        start_time: start.toISOString(),
        end_time: new Date(start.getTime() + 30 * 60_000).toISOString(),
        guest_timezone: "America/New_York",
        source: "page",
        created_at: at.toISOString(),
        type: { id: "00000000-0000-0000-0000-000000000000", name: "Intro call", slug: "intro", kind: "one" },
        hosts: [{ id: "00000000-0000-0000-0000-000000000000", name: "Sam Lee", email: "sam@example.com", timezone: "America/Chicago" }],
        guest: { name: "Ada Park", email: "ada@example.com", contact_id: null },
        answers: {},
        location: { kind: "google_meet", url: "https://meet.google.com/abc-defg-hij" },
        submission_id: null,
        cancel_reason: event === "meeting.canceled" ? "Something came up" : null,
        rescheduled_from: event === "meeting.rescheduled" ? new Date(start.getTime() - 86_400_000).toISOString() : null,
        payment: null,
        manage_url: null,
      },
    },
  };
}
