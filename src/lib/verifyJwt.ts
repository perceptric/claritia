// Checking a Supabase access token on this server, without asking Supabase Auth each time (docs/speed: one round
// trip less on every signed-in request).
//
//   ES256 / RS256 (asymmetric signing keys): verified with the project's public keys, read from
//     <SUPABASE_URL>/auth/v1/.well-known/jwks.json and kept for 10 minutes (read again at once for a key id not seen).
//   HS256 (the legacy shared secret): verified with SUPABASE_JWT_SECRET when the server has it.
//   Anything else, or anything this code can't be sure of (no keys, an unknown key, another issuer): Supabase Auth
//     decides, as before (GET /auth/v1/user).
//
// A token that is expired, or whose signature is wrong for a key we hold, is refused here with no network call.
// No module imports "server-only" here so the tests can run it directly.

import { createHmac, timingSafeEqual } from "node:crypto";

export type Claims = {
  sub: string;
  exp: number;
  iat?: number;
  iss?: string;
  aud?: string | string[];
  role?: string;
  email?: string;
  phone?: string;
  session_id?: string;
  is_anonymous?: boolean;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};

export type Verified = { ok: true; claims: Claims; via: "jwks" | "secret" | "auth" } | { ok: false; why: string };

type Jwk = JsonWebKey & { kid?: string; alg?: string };
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export type VerifyEnv = {
  /** The project's address, e.g. https://abc.supabase.co (no trailing slash). */
  url: string;
  /** The publishable (anon) key, sent to Supabase Auth on the fallback. */
  apiKey: string;
  /** The legacy HS256 secret, when the server has it. */
  jwtSecret?: string | null;
  fetch?: Fetch;
  now?: () => number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JWKS_TTL = 10 * 60_000;
// A key id we don't hold makes us read the keys again, but not more often than this (a forged kid can't flood Auth).
const JWKS_RETRY = 30_000;
const NET_TIMEOUT = 8_000;

const b64urlBytes = (s: string) => new Uint8Array(Buffer.from(s, "base64url"));
const b64urlJson = (s: string): unknown => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));

// Keys per project address, shared by every request in this process.
const jwksCache = new Map<string, { keys: Jwk[]; at: number; tried: number }>();
const keyCache = new Map<string, CryptoKey>();
// Tokens Supabase Auth already said yes to (the fallback), until their expiry or a minute, whichever is first.
const authOk = new Map<string, { claims: Claims; until: number }>();

/** Forget the cached keys and fallback answers (tests). */
export function resetJwtCaches() {
  jwksCache.clear();
  keyCache.clear();
  authOk.clear();
}

async function fetchJwks(env: VerifyEnv, now: number, force: boolean): Promise<Jwk[] | null> {
  const hit = jwksCache.get(env.url);
  if (hit && !force && now - hit.at < JWKS_TTL) return hit.keys;
  if (hit && force && now - hit.tried < JWKS_RETRY) return hit.keys;
  const f = env.fetch ?? fetch;
  try {
    const res = await f(`${env.url}/auth/v1/.well-known/jwks.json`, { headers: { apikey: env.apiKey }, signal: AbortSignal.timeout(NET_TIMEOUT) });
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as { keys?: Jwk[] };
    const keys = Array.isArray(body.keys) ? body.keys : [];
    jwksCache.set(env.url, { keys, at: now, tried: now });
    return keys;
  } catch {
    if (hit) jwksCache.set(env.url, { ...hit, tried: now });
    return hit?.keys ?? null;
  }
}

const ALGS: Record<string, { import: EcKeyImportParams | RsaHashedImportParams; verify: EcdsaParams | AlgorithmIdentifier }> = {
  ES256: { import: { name: "ECDSA", namedCurve: "P-256" }, verify: { name: "ECDSA", hash: "SHA-256" } },
  RS256: { import: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, verify: { name: "RSASSA-PKCS1-v1_5" } },
};

async function cryptoKey(url: string, jwk: Jwk, alg: string): Promise<CryptoKey> {
  const id = `${url}|${jwk.kid}|${alg}`;
  const hit = keyCache.get(id);
  if (hit) return hit;
  const k = await crypto.subtle.importKey("jwk", jwk, ALGS[alg]!.import, false, ["verify"]);
  keyCache.set(id, k);
  return k;
}

/** Ask Supabase Auth (the old way). Its yes is kept for a minute at most, so the same token doesn't ask twice. */
export async function askAuth(env: VerifyEnv, token: string, o: { fresh?: boolean } = {}): Promise<Verified> {
  const now = (env.now ?? Date.now)();
  const hit = o.fresh ? null : authOk.get(token);
  if (hit && hit.until > now) return { ok: true, claims: hit.claims, via: "auth" };
  const f = env.fetch ?? fetch;
  type AuthUser = { id?: string; email?: string; phone?: string; aud?: string; role?: string; is_anonymous?: boolean; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> };
  let user = null as AuthUser | null;
  try {
    const res = await f(`${env.url}/auth/v1/user`, { headers: { apikey: env.apiKey, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(NET_TIMEOUT) });
    if (res.ok) user = (await res.json()) as AuthUser;
  } catch {
    user = null;
  }
  if (!user?.id) return { ok: false, why: "auth" };
  let exp = Math.floor(now / 1000) + 60;
  try {
    const p = b64urlJson(token.split(".")[1] ?? "") as { exp?: number };
    if (typeof p.exp === "number") exp = p.exp;
  } catch {
    // Auth said yes; the payload's expiry is only for how long we keep that.
  }
  const claims: Claims = { sub: user.id, exp, email: user.email, phone: user.phone, aud: user.aud, role: user.role, is_anonymous: user.is_anonymous, app_metadata: user.app_metadata, user_metadata: user.user_metadata };
  if (authOk.size > 2000) authOk.clear();
  authOk.set(token, { claims, until: Math.min(now + 60_000, exp * 1000) });
  return { ok: true, claims, via: "auth" };
}

/**
 * Check a token. Refused when it is malformed, expired, or signed wrongly; Supabase Auth decides when this server
 * can't verify it itself.
 */
export async function verifyJwt(env: VerifyEnv, token: string): Promise<Verified> {
  const now = (env.now ?? Date.now)();
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((p) => !p || !/^[A-Za-z0-9_-]+$/.test(p))) return { ok: false, why: "malformed" };
  let header: { alg?: string; kid?: string; typ?: string };
  let claims: Claims;
  try {
    header = b64urlJson(parts[0]!) as typeof header;
    claims = b64urlJson(parts[1]!) as Claims;
  } catch {
    return { ok: false, why: "malformed" };
  }
  if (!claims || typeof claims !== "object" || typeof claims.exp !== "number") return { ok: false, why: "malformed" };
  if (claims.exp * 1000 <= now) return { ok: false, why: "expired" };
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const sig = b64urlBytes(parts[2]!);

  // Only a signed-in person's token is checked here; anything else (an anon or service key, another issuer, another
  // audience) goes to Supabase Auth, which decides as it always did.
  const issOk = !claims.iss || claims.iss === `${env.url}/auth/v1`;
  const audOk = claims.aud === "authenticated" || (Array.isArray(claims.aud) && claims.aud.includes("authenticated"));
  const sure = typeof claims.sub === "string" && UUID.test(claims.sub) && issOk && audOk && claims.role === "authenticated";

  if (header.alg === "HS256") {
    if (!env.jwtSecret || !sure) return askAuth(env, token);
    const want = createHmac("sha256", env.jwtSecret).update(signed).digest();
    if (want.length !== sig.length || !timingSafeEqual(want, Buffer.from(sig))) return { ok: false, why: "signature" };
    return { ok: true, claims, via: "secret" };
  }

  if (header.alg && ALGS[header.alg] && header.kid && sure && globalThis.crypto?.subtle) {
    let keys = await fetchJwks(env, now, false);
    let jwk = keys?.find((k) => k.kid === header.kid);
    if (!jwk && keys) {
      keys = await fetchJwks(env, now, true);
      jwk = keys?.find((k) => k.kid === header.kid);
    }
    if (jwk) {
      let good = false;
      try {
        good = await crypto.subtle.verify(ALGS[header.alg]!.verify, await cryptoKey(env.url, jwk, header.alg), sig, signed);
      } catch {
        good = false;
      }
      return good ? { ok: true, claims, via: "jwks" } : { ok: false, why: "signature" };
    }
  }
  return askAuth(env, token);
}
