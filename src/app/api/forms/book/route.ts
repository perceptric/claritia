import { bookForClaim, readBooking, timesForClaim } from "@/lib/forms/booking";
import { allowed, clientIp, cors, json } from "@/lib/forms/server";
import { liveBusyFor } from "@/lib/meetings/live";
import { serviceClient } from "@/lib/serviceClient";
import { APP_URL } from "@/lib/site";

// The inline calendar's booking call (docs/meetings-scheduler.md 2.1). Public, from any site: the signed booking
// token from the submit is the only key. { token } or { token, length } answers fresh times (another length, or the
// calendar opening on a thank-you page); { token, start, length, tz } books that start for the fill's contact, with
// the live free/busy check, and answers the confirmation, or fresh times when the time was just taken.

const MAX_BODY = 4 * 1024;

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (!allowed(`book:${ip}`, 30)) return json({ error: "Too many tries. Wait a minute and try again." }, 429, { "Retry-After": "60" });
  const text = await request.text();
  if (text.length > MAX_BODY) return json({ error: "Bad request." }, 400);
  let raw: { token?: unknown; start?: unknown; length?: unknown; tz?: unknown };
  try {
    raw = JSON.parse(text) as typeof raw;
  } catch {
    return json({ error: "Bad request." }, 400);
  }
  const claim = readBooking(raw.token, process.env.SECRETS_KEY);
  if (claim === "expired") return json({ error: "These times have expired. Refresh the page to see new ones.", expired: true }, 410);
  if (!claim) return json({ error: "This booking link isn't valid." }, 403);
  const token = raw.token as string;
  const length = typeof raw.length === "number" && Number.isInteger(raw.length) ? raw.length : undefined;
  const tz = typeof raw.tz === "string" && raw.tz.length <= 60 && /^[A-Za-z0-9_+\-/]+$/.test(raw.tz) ? raw.tz : undefined;
  const db = serviceClient();
  if (!db) return json({ error: "Not set up." }, 503);
  const rpc = (fn: string, args: Record<string, unknown>) => db.rpc(fn, args);
  try {
    if (raw.start === undefined || raw.start === null) {
      const r = await timesForClaim(rpc, token, claim, { length });
      return json(r.body, r.status);
    }
    if (typeof raw.start !== "number" || !Number.isFinite(raw.start)) return json({ error: "Bad request." }, 400);
    if (!allowed(`book:${claim.submission}`, 10)) return json({ error: "Too many tries. Wait a minute and try again." }, 429, { "Retry-After": "60" });
    const r = await bookForClaim(rpc, token, claim, { start: raw.start, length, tz, base: APP_URL, liveBusyFor: (ws) => liveBusyFor(rpc, ws) });
    return json(r.body, r.status);
  } catch {
    return json({ error: "Booking didn't go through. Try again in a moment." }, 503);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
