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

/**
 * What to say when a sign-in link comes back here and can't sign in, read from the address before it's cleaned. An
 * error the sign-in service put on the address is an `error` line. A link with its ?code= still on it while nobody is
 * signed in is a `note`: links use PKCE, so only the browser that asked for the email can use the code, and a link
 * opened in another browser or on another device lands here with it. The email is confirmed by then, and the code in
 * that email is used up, so a new code signs in on this browser. null when there's nothing to say.
 */
export function linkLine(search: string, hash: string): { tone: "error" | "note"; message: string } | null {
  const q = new URLSearchParams(search.replace(/^\?/, ""));
  const h = new URLSearchParams(hash.replace(/^#/, ""));
  const raw = q.get("error_description") || h.get("error_description") || q.get("error") || h.get("error") || "";
  if (raw) {
    if (/verifier|code challenge|flow state/i.test(raw)) return { tone: "note", message: DIFFERENT_BROWSER };
    if (/expired|invalid|otp/i.test(raw)) return { tone: "error", message: "That sign-in link has expired or was already used. Send a new one." };
    if (/access_denied|cancel/i.test(raw)) return null;
    return { tone: "error", message: raw.replace(/\+/g, " ") };
  }
  return q.get("code") ? { tone: "note", message: DIFFERENT_BROWSER } : null;
}

const DIFFERENT_BROWSER = "That link opened in a different browser. Continue with email for a code to sign in here.";
