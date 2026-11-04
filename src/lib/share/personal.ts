import { createHmac, timingSafeEqual } from "node:crypto";

// Personal links (docs/sharing-plan.md, Personal links): a form link that says who it was sent to, so the form fills in
// what Claritia already knows about them. The link holds a signed token, never the person's details: the workspace,
// the contact (or, for an address with no contact yet, the email) and when it stops working. Anyone who forwards or
// edits it can't fill in someone else's details or send as them: a token that's been changed, is past its date or
// belongs to another workspace reads as no token, and the form opens empty. Server only.

export type Person = { w: string; c?: string; e?: string; x: number };

/** How long a personal link fills in its person's details. */
export const PERSONAL_DAYS = 90;

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");
const sign = (body: string, secret: string) => createHmac("sha256", secret).update(`personal:${body}`).digest("base64url").slice(0, 32);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;

/** A personal link's token for one person in a workspace: their contact, or their email when there's no contact yet. */
export function personalToken(p: { ws: string; contact?: string | null; email?: string | null }, secret: string, now = Date.now(), days = PERSONAL_DAYS): string {
  if (!secret) throw new Error("Personal links need SECRETS_KEY.");
  const person: Person = { w: p.ws, x: Math.floor(now / 1000) + days * 86_400 };
  if (p.contact && UUID.test(p.contact)) person.c = p.contact;
  else if (p.email && EMAIL.test(p.email.trim())) person.e = p.email.trim().toLowerCase().slice(0, 254);
  else throw new Error("A personal link needs a contact or an email.");
  const body = b64(JSON.stringify(person));
  return `${body}.${sign(body, secret)}`;
}

/** Who a token was made for, when it's ours, unchanged, still good and for this workspace. Anything else is null. */
export function readPersonal(token: unknown, secret: string | undefined, ws: string, now = Date.now()): Person | null {
  if (!secret || typeof token !== "string" || token.length > 400) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac || token.split(".").length !== 2) return null;
  const want = Buffer.from(sign(body, secret));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<Person>;
    if (p.w !== ws || typeof p.x !== "number" || p.x * 1000 < now) return null;
    if (p.c !== undefined && !(typeof p.c === "string" && UUID.test(p.c))) return null;
    if (p.e !== undefined && !(typeof p.e === "string" && EMAIL.test(p.e))) return null;
    if (!p.c && !p.e) return null;
    return { w: p.w, x: p.x, ...(p.c ? { c: p.c } : {}), ...(p.e ? { e: p.e } : {}) };
  } catch {
    return null;
  }
}

/** A form link made personal: its token, and the channel it came by. */
export function personalLink(url: string, token: string, via: "email" | "personal"): string {
  try {
    const u = new URL(url);
    u.searchParams.set("p", token);
    if (!u.searchParams.get("via")) u.searchParams.set("via", via);
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Whether a link in an email goes to one of this workspace's forms: a form address on Claritia's own host (/f/...), or
 * any address on the workspace's own link domain.
 */
export function isFormLink(url: string, o: { appHost: string; ownHost?: string | null }): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    if (host === o.appHost.toLowerCase()) return /^\/f\/[^/]+/.test(u.pathname) && !/^\/f\/embed\.js$/.test(u.pathname);
    return !!o.ownHost && host === o.ownHost.toLowerCase() && u.pathname.length > 1;
  } catch {
    return false;
  }
}
