// The "Turn them off" link in getting-started emails (src/lib/tips/send.ts, src/app/api/email/tips/route.ts): a token
// naming the workspace and the person, signed with a key made from SECRETS_KEY, so nobody can turn off someone
// else's tips by changing the link. Works on claritia-intel (which makes it) and claritia-web (which reads it).

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const VERSION = 1;
const SIZE = 33;

function key(secret: string | undefined): Buffer | null {
  const s = secret?.trim();
  return s && s.length >= 32 ? createHash("sha256").update(`claritia-tips|${s}`).digest() : null;
}

const hex = (uuid: string): Buffer | null => {
  const h = uuid.replace(/-/g, "").toLowerCase();
  return /^[0-9a-f]{32}$/.test(h) ? Buffer.from(h, "hex") : null;
};
const uuid = (b: Buffer) => {
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

/** The token for one person in one workspace. Throws without SECRETS_KEY or with ids that aren't uuids. */
export function tipsToken(workspaceId: string, userId: string, secret = process.env.SECRETS_KEY): string {
  const k = key(secret);
  const ws = hex(workspaceId);
  const user = hex(userId);
  if (!k) throw new Error("Add SECRETS_KEY (32 or more random characters) on the server.");
  if (!ws || !user) throw new Error("Not an id");
  const body = Buffer.concat([Buffer.from([VERSION]), ws, user]);
  const mac = createHmac("sha256", k).update(body).digest().subarray(0, 16);
  return `${body.toString("base64url")}.${mac.toString("base64url")}`;
}

/** The workspace and person in a token, or null when it was changed, cut short or made with another key. */
export function readTipsToken(token: string, secret = process.env.SECRETS_KEY): { workspaceId: string; userId: string } | null {
  const k = key(secret);
  const [b, m] = String(token ?? "").split(".");
  if (!k || !b || !m || b.length > 60 || m.length > 30) return null;
  const body = Buffer.from(b, "base64url");
  const mac = Buffer.from(m, "base64url");
  if (body.length !== SIZE || mac.length !== 16 || body[0] !== VERSION) return null;
  const want = createHmac("sha256", k).update(body).digest().subarray(0, 16);
  if (!timingSafeEqual(mac, want)) return null;
  return { workspaceId: uuid(body.subarray(1, 17)), userId: uuid(body.subarray(17, 33)) };
}
