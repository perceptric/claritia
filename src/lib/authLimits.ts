// Limits on sign-in emails, whose IP they count, and how sign-in errors read: the pure half (the route is
// src/app/api/auth/link/route.ts, the counters 168_auth_limits.sql). No Supabase or Next here, so tests/authLimits.test.ts
// runs it. Same as Omniscient's.

/** Sign-in links: per address and per visitor's IP. The sign-in service also waits 60 seconds between links to one address. */
export const LINK_LIMITS = {
  email: { windowS: 3600, max: 5 },
  ip: { windowS: 3600, max: 20 },
} as const;

type Headers = { get(name: string): string | null };
const clean = (v: string | null | undefined) => (v ?? "").trim().slice(0, 64);

/**
 * The visitor's IP, read only from a header our own proxy sets. CLIENT_IP_HEADER names the header when it's set (for
 * a proxy we don't know). Otherwise the last X-Forwarded-For address: the proxy on the VPS adds the address it saw last,
 * so the first ones can be whatever the visitor sent and are never used. X-Real-IP only when there's none.
 */
export function trustedIp(h: Headers, env: Record<string, string | undefined> = process.env): string {
  const named = env.CLIENT_IP_HEADER?.trim().toLowerCase();
  if (named) return clean(h.get(named)?.split(",")[0]);
  const hops = (h.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return clean(hops.at(-1)) || clean(h.get("x-real-ip"));
}

/** A typed email as it's counted: trimmed and lower case. "" when it can't be an address. */
export function cleanEmail(v: unknown): string {
  const s = String(v ?? "").trim().toLowerCase();
  return s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : "";
}

/** "Try again in 12 minutes." for a wait in seconds. */
export function retryIn(s: number): string {
  const n = Math.max(1, Math.ceil(s));
  if (s < 90) return `Try again in ${n} ${n === 1 ? "second" : "seconds"}.`;
  if (s < 5400) return `Try again in ${Math.ceil(s / 60)} minutes.`;
  return `Try again in ${Math.ceil(s / 3600)} hours.`;
}

/** What the sign-in service said, as one plain line for the sign-in screen. */
export function authMessage(text: string): string {
  if (/captcha/i.test(text)) return "The security check didn't pass. Try again.";
  if (/rate limit|too many/i.test(text) && !/^Too many sign-in emails/.test(text)) return "Too many emails were sent in a short time. Wait a minute and try again.";
  if (/provider is not enabled/i.test(text)) return "This sign-in option is not turned on yet. Use email for now.";
  if (/took too long/i.test(text)) return "This is taking longer than usual. Check your inbox; if nothing arrives in a minute, try again.";
  if (/token has expired|otp.*(expired|invalid)|invalid.*(otp|token)/i.test(text)) return "That code is wrong or has expired. Check the newest email.";
  return text;
}
