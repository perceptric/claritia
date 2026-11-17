import { createHmac } from "node:crypto";
import { cleanEmail, LINK_LIMITS, retryIn, trustedIp } from "@/lib/authLimits";
import { cleanEmail as checkAddress, isRejected } from "@/lib/email/address";
import { serviceClient } from "@/lib/serviceClient";

// Asked before the sign-in screen sends a link (src/components/app/AuthScreen.tsx): counts one link for the address and
// one for the visitor's IP (168_auth_limits.sql), and says to wait when either is over its limit. The link itself is
// still sent by the browser, so its sign-in stays in this browser (PKCE). Tries that skip the app meet the sign-in
// service's own email limits and its bot check.

const noStore = { "Cache-Control": "no-store" };
type Limit = { windowS: number; max: number };

/** A bucket name that never holds an address or IP as it is. Keyed, so one can't be found by trying every address. */
const secret = () => (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const bucket = (kind: string, v: string) => `link:${kind}:${createHmac("sha256", secret()).update(v).digest("hex").slice(0, 32)}`;

// When the database can't be asked, this server counts on its own, so the limit still holds here.
const local = new Map<string, { start: number; n: number }>();
function takeLocal(b: string, l: Limit, now = Date.now()): number {
  const start = Math.floor(now / 1000 / l.windowS) * l.windowS * 1000;
  const hit = local.get(b);
  const n = hit && hit.start === start ? hit.n + 1 : 1;
  if (local.size > 5000) local.clear();
  local.set(b, { start, n });
  return n <= l.max ? 0 : Math.ceil((start + l.windowS * 1000 - now) / 1000);
}

async function take(b: string, l: Limit): Promise<number> {
  const db = serviceClient();
  if (db) {
    for (let i = 0; i < 2; i++) {
      const { data, error } = await db.rpc("take_rate", { p_bucket: b, p_window_s: l.windowS, p_max: l.max }).abortSignal(AbortSignal.timeout(3000));
      if (!error) return Number(data) || 0;
      if (i === 1) console.error("auth link limit:", error.message);
    }
  }
  return takeLocal(b, l);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: unknown };
  const email = cleanEmail(body.email);
  if (!email) return Response.json({ error: "Enter your email address." }, { status: 400, headers: noStore });
  // Throwaway inboxes (the disposable-email list forms use) can't make accounts.
  const checked = checkAddress(email);
  if (isRejected(checked) && checked.rejected === "disposable") return Response.json({ error: "Use your work or personal email. Throwaway inboxes can't sign up." }, { status: 400, headers: noStore });
  const ip = trustedIp(request.headers);
  const waits = await Promise.all([take(bucket("email", email), LINK_LIMITS.email), ip ? take(bucket("ip", ip), LINK_LIMITS.ip) : Promise.resolve(0)]);
  const wait = Math.max(...waits);
  if (wait) return Response.json({ error: `Too many sign-in emails. ${retryIn(wait)}` }, { status: 429, headers: { ...noStore, "Retry-After": String(wait) } });
  return Response.json({ ok: true }, { headers: noStore });
}
