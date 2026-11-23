// Checking secrets and signatures: a comparison whose time doesn't depend on where two values differ, HMAC-SHA256,
// short signed tokens that carry a JSON body, and RS256 JWTs. Used by the app and the workers.

import { createHmac, createPrivateKey, createSign, timingSafeEqual } from "node:crypto";

/** Whether a and b are equal, in time that doesn't give away where they differ. */
export function same(a: string | Buffer, b: string | Buffer): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** HMAC-SHA256 of `data` with `key`, as text. */
export const hmac = (key: string | Buffer, data: string, encoding: "hex" | "base64" | "base64url") => createHmac("sha256", key).update(data).digest(encoding);

/** `body.signature`: the JSON body, signed so it comes back unchanged. */
export function signToken(body: object, key: string | Buffer): string {
  const b = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${b}.${hmac(key, b, "base64url")}`;
}

/** The body of a token made by signToken with the same key, or null. The caller checks its fields and expiry. */
export function readToken(raw: string | null, key: string | Buffer): Record<string, unknown> | null {
  const [b, sig] = (raw ?? "").split(".");
  if (!b || !sig || !key.length || !same(sig, hmac(key, b, "base64url"))) return null;
  try {
    const v = JSON.parse(Buffer.from(b, "base64url").toString());
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

/** A JWT with these claims, signed RS256 with a PEM private key (GitHub apps, Google and Snowflake service accounts). */
export function jwtRs256(claims: object, privateKey: string): string {
  const head = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify(claims))}`;
  return `${head}.${b64url(createSign("RSA-SHA256").update(head).sign(createPrivateKey(privateKey)))}`;
}
