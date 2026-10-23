// Links in meeting emails (docs/meetings-scheduler.md 1.7 and 2.4). Server only.
//   Manage link (/book/m/<token>): the guest's reschedule and cancel link. Only its sha256 is meetings.token_hash, so
//     a sealed copy (AES-256-GCM with SECRETS_KEY, src/lib/seal.ts) is kept in meetings.token_sealed for the emails
//     that come later (reminders, updates). A database copy alone can't open anyone's meeting.
//   Outcome links (/api/meetings/outcome/<token>): the host's Held and No-show buttons. Signed with a key made from
//     SECRETS_KEY; the token names the meeting, the outcome and a nonce, and the nonce is spent on first use.
//   Booking links: the type's page with the lead's name and email filled in, plus a signed ref naming the
//     submission, so a meeting booked from a "pick a time" email joins the same submission.

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Rpc } from "../jobs.ts";
import { seal, unseal } from "../seal.ts";
import { newToken, tokenHash } from "./server.ts";

function key(label: string, secret = process.env.SECRETS_KEY): Buffer {
  const s = secret?.trim();
  if (!s || s.length < 32) throw new Error("Add SECRETS_KEY (32 or more random characters) on the server.");
  return createHash("sha256").update(`claritia-meetings-${label}|${s}`).digest();
}

const hex = (uuid: string) => {
  const h = uuid.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(h)) throw new Error("Not an id");
  return Buffer.from(h, "hex");
};
const uuid = (b: Buffer) => {
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

function sign(label: string, body: Buffer, secret?: string): string {
  const mac = createHmac("sha256", key(label, secret)).update(body).digest().subarray(0, 16);
  return `${body.toString("base64url")}.${mac.toString("base64url")}`;
}

function verify(label: string, token: string, size: number, secret?: string): Buffer | null {
  const [b, m] = String(token ?? "").split(".");
  if (!b || !m || b.length > 80 || m.length > 30) return null;
  const body = Buffer.from(b, "base64url");
  const mac = Buffer.from(m, "base64url");
  if (body.length !== size || mac.length !== 16 || body[0] !== 1) return null;
  let want: Buffer;
  try {
    want = createHmac("sha256", key(label, secret)).update(body).digest().subarray(0, 16);
  } catch {
    return null;
  }
  return timingSafeEqual(mac, want) ? body : null;
}

// Outcome links -------------------------------------------------------------------------------------------------

export type Outcome = "held" | "no_show";
const OUTCOMES: Outcome[] = ["held", "no_show"];

/** Both buttons in one email share a nonce: whichever is pressed first spends the email's links. */
export const newNonce = () => randomBytes(8).toString("hex");

/** version | outcome | meeting (16) | nonce (8) */
export function outcomeToken(t: { meeting: string; outcome: Outcome; nonce: string }, secret?: string): string {
  const body = Buffer.alloc(26);
  body[0] = 1;
  body[1] = OUTCOMES.indexOf(t.outcome);
  hex(t.meeting).copy(body, 2);
  Buffer.from(t.nonce, "hex").copy(body, 18);
  return sign("outcome", body, secret);
}

export function readOutcomeToken(token: string, secret?: string): { meeting: string; outcome: Outcome; nonce: string } | null {
  const body = verify("outcome", token, 26, secret);
  if (!body || body[1] >= OUTCOMES.length) return null;
  return { meeting: uuid(body.subarray(2, 18)), outcome: OUTCOMES[body[1]], nonce: body.subarray(18, 26).toString("hex") };
}

// Book-later ref ------------------------------------------------------------------------------------------------

/** version | submission (16) | made at (4, seconds) */
export function bookRef(submission: string, now = Date.now(), secret?: string): string {
  const body = Buffer.alloc(21);
  body[0] = 1;
  hex(submission).copy(body, 1);
  body.writeUInt32BE(Math.floor(now / 1000) >>> 0, 17);
  return sign("ref", body, secret);
}

/** The submission a booking link was made for, while it's under 30 days old. */
export function readBookRef(ref: string, now = Date.now(), secret?: string): string | null {
  const body = verify("ref", ref, 21, secret);
  if (!body) return null;
  const made = body.readUInt32BE(17) * 1000;
  if (made > now + 60_000 || now - made > 30 * 86_400_000) return null;
  return uuid(body.subarray(1, 17));
}

// URLs ----------------------------------------------------------------------------------------------------------

export const manageUrl = (base: string, token: string) => `${base}/book/m/${encodeURIComponent(token)}`;
export const outcomeUrl = (base: string, token: string) => `${base}/api/meetings/outcome/${encodeURIComponent(token)}`;

/**
 * A type's booking page: /book/<workspace slug>/<type slug>, with name, email, host (to show one host's times) and
 * ref (bookRef) when known. The public booking page reads these.
 */
export function bookingUrl(base: string, o: { workspace: string; type: string; name?: string | null; email?: string | null; host?: string | null; ref?: string | null }): string {
  const q = new URLSearchParams();
  if (o.name?.trim()) q.set("name", o.name.trim());
  if (o.email?.trim()) q.set("email", o.email.trim());
  if (o.host) q.set("host", o.host);
  if (o.ref) q.set("ref", o.ref);
  const s = q.toString();
  return `${base}/book/${encodeURIComponent(o.workspace)}/${encodeURIComponent(o.type)}${s ? `?${s}` : ""}`;
}

// Manage tokens -------------------------------------------------------------------------------------------------

/**
 * Keep a sealed copy of the guest's manage token, right after booking (server.ts book()). Does nothing when the
 * token isn't this meeting's, or a copy is already kept.
 */
export async function keepManageToken(rpc: Rpc, meetingId: string, token: string, secret?: string): Promise<void> {
  const { error } = await rpc("meeting_token_keep", { p_id: meetingId, p_hash: tokenHash(token), p_sealed: seal(token, secret) });
  if (error) throw new Error(`meeting_token_keep: ${error.message}`);
}

/**
 * The guest's manage token from the sealed copy, or null when no usable copy is kept. Emails use this and never make
 * a new token: the confirmation screen and the payment return page already carry the guest's token, and a new one
 * would quietly break them. An email with no copy goes without the manage links.
 */
export function keptManageToken(m: { token_hash: string; token_sealed: string | null }, secret?: string): string | null {
  if (!m.token_sealed) return null;
  try {
    const t = unseal(m.token_sealed, secret);
    return tokenHash(t) === m.token_hash ? t : null;
  } catch {
    return null;
  }
}

/**
 * The guest's manage token for a host who asks to send it again. From the sealed copy when there is one; otherwise
 * (a meeting booked before copies were kept) a new token replaces the old hash, once, and is kept sealed: the
 * guest's older link stops working, so this is for an explicit "send the link again" only.
 */
export async function manageToken(rpc: Rpc, m: { id: string; token_hash: string; token_sealed: string | null }, secret?: string): Promise<string> {
  const kept = keptManageToken(m, secret);
  if (kept) return kept;
  const t = newToken();
  const { data, error } = await rpc("meeting_token_rotate", { p_id: m.id, p_old: m.token_hash, p_hash: tokenHash(t), p_sealed: seal(t, secret) });
  if (error) throw new Error(`meeting_token_rotate: ${error.message}`);
  const now = data as { token_hash: string; token_sealed: string | null } | null;
  if (!now) throw new Error("Meeting not found");
  if (now.token_hash === tokenHash(t)) return t;
  // Another job got there first: use its token.
  if (!now.token_sealed) throw new Error("The meeting's link changed while it was being read");
  const other = unseal(now.token_sealed, secret);
  if (tokenHash(other) !== now.token_hash) throw new Error("The meeting's kept link doesn't match");
  return other;
}
