// Resend's events (docs/enrich-workflows-reports.md Part 0). Resend signs each delivery the Svix way: an HMAC of
// "<svix-id>.<svix-timestamp>.<body>" with the endpoint secret (whsec_…), in the svix-signature header as "v1,<sig>".
// Nothing is trusted before the signature and the time check pass. svix-id is the same on every retry of an event,
// so it's the dedupe key.

import { createHmac, timingSafeEqual } from "node:crypto";

export type EmailEvent = {
  event_id: string;
  provider_id: string;
  kind: "delivered" | "bounced" | "complained" | "rejected" | "delayed";
  bounce?: "hard" | "soft";
  to: string | null;
  at: string;
  detail: Record<string, unknown>;
};

/** Null when the delivery is genuine and fresh; else the reason it was refused. */
export function checkSvix(o: { secret: string; id: string | null; timestamp: string | null; signature: string | null; body: string; now?: number; toleranceS?: number }): string | null {
  if (!o.id || !o.timestamp || !o.signature) return "Missing signature headers";
  const ts = Number(o.timestamp);
  if (!Number.isFinite(ts)) return "Bad timestamp";
  const now = Math.floor((o.now ?? Date.now()) / 1000);
  if (Math.abs(now - ts) > (o.toleranceS ?? 300)) return "Too old";
  const raw = o.secret.trim().replace(/^whsec_/, "");
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    return "Bad secret";
  }
  if (!key.length) return "Bad secret";
  const want = createHmac("sha256", key).update(`${o.id}.${o.timestamp}.${o.body}`).digest();
  for (const part of o.signature.split(" ")) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    const got = Buffer.from(sig, "base64");
    if (got.length === want.length && timingSafeEqual(got, want)) return null;
  }
  return "Bad signature";
}

type Raw = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    created_at?: string;
    bounce?: { type?: string; subType?: string; message?: string };
    failed?: { reason?: string };
    complaint?: { type?: string };
  };
};

/** One event we act on, or null for kinds we don't (sent, opened, clicked, received, contacts, domains). */
export function parseResendEvent(eventId: string, body: string): EmailEvent | null {
  let r: Raw;
  try {
    r = JSON.parse(body) as Raw;
  } catch {
    return null;
  }
  const id = r.data?.email_id;
  if (!id || !r.type) return null;
  const to = Array.isArray(r.data?.to) ? (r.data?.to[0] ?? null) : (r.data?.to ?? null);
  const base = { event_id: eventId, provider_id: id, to: to ? to.toLowerCase() : null, at: r.created_at ?? r.data?.created_at ?? new Date().toISOString() };
  switch (r.type) {
    case "email.delivered":
      return { ...base, kind: "delivered", detail: {} };
    case "email.bounced": {
      // Resend runs on SES and passes its bounce types on: Permanent is hard; Transient and Undetermined are soft.
      const t = r.data?.bounce?.type ?? "";
      return { ...base, kind: "bounced", bounce: /^permanent$/i.test(t) ? "hard" : "soft", detail: { type: t, sub: r.data?.bounce?.subType, message: r.data?.bounce?.message?.slice(0, 300) } };
    }
    case "email.complained":
      return { ...base, kind: "complained", detail: { type: r.data?.complaint?.type } };
    case "email.failed":
      return { ...base, kind: "rejected", detail: { reason: r.data?.failed?.reason?.slice(0, 300) } };
    case "email.delivery_delayed":
      return { ...base, kind: "delayed", detail: {} };
    default:
      return null;
  }
}
