// Signed-in requests are checked on this server (src/lib/verifyJwt.ts, src/lib/serverAuth.ts): a valid token passes
// with no call to Supabase Auth, an expired one or one signed wrongly is refused, and anything this server can't
// verify (no secret, no keys, a key it doesn't know, keys it can't fetch) goes to Supabase Auth as before. The role
// cache (src/lib/roleCache.ts) keeps a yes for at most its TTL, forgets on a change, and never keeps a no.
import assert from "node:assert/strict";
import { createHmac, generateKeyPairSync, randomUUID, sign as nodeSign } from "node:crypto";
import { beforeEach, test } from "node:test";
import { resetJwtCaches, verifyJwt, type VerifyEnv } from "../src/lib/verifyJwt.ts";
import { roleCache, ttlCache } from "../src/lib/roleCache.ts";
import { isMissingFunction, resetMissing, rpcOr } from "../src/lib/rpcCompat.ts";

const URL_ = "https://abc.supabase.co";
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = () => Math.floor(Date.now() / 1000);
const claims = (o: Record<string, unknown> = {}) => ({ sub: randomUUID(), email: "dana@acme.io", role: "authenticated", aud: "authenticated", iss: `${URL_}/auth/v1`, exp: now() + 3600, iat: now(), ...o });

function hs256(payload: object, secret: string) {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64(payload);
  return `${head}.${body}.${createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url")}`;
}

const ec = () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return { privateKey, jwk: publicKey.export({ format: "jwk" }) };
};

function es256(payload: object, key: ReturnType<typeof ec>["privateKey"], kid: string) {
  const head = b64({ alg: "ES256", typ: "JWT", kid });
  const body = b64(payload);
  // JWS wants the raw r||s signature (ieee-p1363), not DER.
  const sig = nodeSign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${head}.${body}.${sig}`;
}

/** A fake Supabase: the keys endpoint and the user endpoint, counting calls. */
function fakeSupabase(o: { keys?: object[]; user?: (token: string) => object | null; jwksDown?: boolean } = {}) {
  const calls = { jwks: 0, user: 0 };
  const fetch = (async (u: string, init?: RequestInit) => {
    if (u.endsWith("/auth/v1/.well-known/jwks.json")) {
      calls.jwks++;
      if (o.jwksDown) throw new Error("connect ECONNREFUSED");
      return Response.json({ keys: o.keys ?? [] });
    }
    if (u.endsWith("/auth/v1/user")) {
      calls.user++;
      const token = String(new Headers(init?.headers).get("authorization")).replace(/^Bearer /, "");
      const user = o.user?.(token) ?? null;
      return user ? Response.json(user) : Response.json({ msg: "invalid JWT" }, { status: 401 });
    }
    throw new Error(`unexpected ${u}`);
  }) as unknown as VerifyEnv["fetch"];
  return { calls, env: (extra: Partial<VerifyEnv> = {}): VerifyEnv => ({ url: URL_, apiKey: "sb_publishable_x", fetch, ...extra }) };
}

beforeEach(() => resetJwtCaches());

test("an asymmetric (ES256) token is verified with the project's keys: no call to Supabase Auth, keys fetched once", async () => {
  const k = ec();
  const s = fakeSupabase({ keys: [{ ...k.jwk, kid: "k1", alg: "ES256" }] });
  const c = claims();
  const a = await verifyJwt(s.env(), es256(c, k.privateKey, "k1"));
  const b = await verifyJwt(s.env(), es256(claims(), k.privateKey, "k1"));
  assert.equal(a.ok && a.claims.sub, c.sub);
  assert.equal(a.ok && a.via, "jwks");
  assert.ok(b.ok);
  assert.equal(s.calls.user, 0, "Supabase Auth is never asked");
  assert.equal(s.calls.jwks, 1, "the keys are kept");
});

test("a wrong signature is refused: another key under the same kid, or a changed payload", async () => {
  const k = ec();
  const other = ec();
  const s = fakeSupabase({ keys: [{ ...k.jwk, kid: "k1", alg: "ES256" }], user: () => ({ id: randomUUID() }) });
  const forged = await verifyJwt(s.env(), es256(claims(), other.privateKey, "k1"));
  assert.deepEqual(forged, { ok: false, why: "signature" });
  const good = es256(claims(), k.privateKey, "k1");
  const [h, , sig] = good.split(".");
  const tampered = await verifyJwt(s.env(), `${h}.${b64(claims({ sub: randomUUID() }))}.${sig}`);
  assert.deepEqual(tampered, { ok: false, why: "signature" });
  assert.equal(s.calls.user, 0, "a known key's wrong signature never reaches Auth (which might say yes)");
});

test("an expired token is refused with no network call, whatever signs it", async () => {
  const k = ec();
  const s = fakeSupabase({ keys: [{ ...k.jwk, kid: "k1" }], user: () => ({ id: randomUUID() }) });
  const old = claims({ exp: now() - 5 });
  assert.deepEqual(await verifyJwt(s.env(), es256(old, k.privateKey, "k1")), { ok: false, why: "expired" });
  assert.deepEqual(await verifyJwt(s.env({ jwtSecret: "s".repeat(40) }), hs256(old, "s".repeat(40))), { ok: false, why: "expired" });
  assert.deepEqual(await verifyJwt(s.env(), hs256(old, "whatever")), { ok: false, why: "expired" });
  assert.equal(s.calls.jwks + s.calls.user, 0);
});

test("HS256 with the secret: verified here; a token signed with another secret is refused", async () => {
  const secret = "super-secret-jwt-token-with-at-least-32-characters";
  const s = fakeSupabase({ user: () => ({ id: randomUUID() }) });
  const c = claims();
  const ok = await verifyJwt(s.env({ jwtSecret: secret }), hs256(c, secret));
  assert.equal(ok.ok && ok.via, "secret");
  assert.equal(ok.ok && ok.claims.email, "dana@acme.io");
  assert.deepEqual(await verifyJwt(s.env({ jwtSecret: secret }), hs256(c, `${secret}x`)), { ok: false, why: "signature" });
  assert.equal(s.calls.user, 0);
});

test("missing setup falls back to Supabase Auth: HS256 with no secret, no keys, an unknown kid, keys that can't be fetched", async () => {
  const secret = "the-projects-secret-the-server-does-not-have-xxxxxx";
  const known = new Set<string>();
  const s = fakeSupabase({ keys: [], user: (t) => (known.has(t) ? { id: "u", email: "dana@acme.io" } : null) });
  const t1 = hs256(claims(), secret);
  known.add(t1);
  const a = await verifyJwt(s.env(), t1);
  assert.equal(a.ok && a.via, "auth");
  assert.equal(s.calls.user, 1);
  // A token Auth turns down is refused.
  assert.deepEqual(await verifyJwt(s.env(), hs256(claims(), "forged")), { ok: false, why: "auth" });
  // Auth's yes is kept for the same token (up to a minute).
  await verifyJwt(s.env(), t1);
  assert.equal(s.calls.user, 2, "only the forged one asked again");

  // An ES256 token whose kid isn't in the keys: Auth decides; the keys are read again for it, but at most every 30 s.
  const k = ec();
  let t = Date.now();
  const s2 = fakeSupabase({ keys: [{ ...ec().jwk, kid: "old" }], user: () => ({ id: "u2" }) });
  const env2 = s2.env({ now: () => t });
  const r = await verifyJwt(env2, es256(claims(), k.privateKey, "new"));
  assert.equal(r.ok && r.via, "auth");
  assert.equal(s2.calls.jwks, 1, "just read: not read twice");
  t += 31_000;
  await verifyJwt(env2, es256(claims(), k.privateKey, "new2"));
  assert.equal(s2.calls.jwks, 2, "read again for a kid it doesn't know (a rotated key)");
  t += 1_000;
  await verifyJwt(env2, es256(claims(), k.privateKey, "new3"));
  assert.equal(s2.calls.jwks, 2, "not again within 30 seconds: a forged kid can't flood the keys endpoint");

  // Keys endpoint down: Auth decides.
  const s3 = fakeSupabase({ jwksDown: true, user: () => ({ id: "u3" }) });
  const r3 = await verifyJwt(s3.env(), es256(claims(), k.privateKey, "k"));
  assert.equal(r3.ok && r3.via, "auth");
});

test("tokens that aren't a signed-in person's go to Supabase Auth: another issuer, the anon role, no sub", async () => {
  const k = ec();
  const s = fakeSupabase({ keys: [{ ...k.jwk, kid: "k1" }], user: () => null });
  for (const c of [claims({ iss: "https://evil.example/auth/v1" }), claims({ role: "anon" }), claims({ sub: undefined }), claims({ aud: "other" })]) {
    assert.equal((await verifyJwt(s.env(), es256(c, k.privateKey, "k1"))).ok, false);
  }
  assert.equal(s.calls.user, 4);
  assert.deepEqual(await verifyJwt(s.env(), "not.a.jwt!"), { ok: false, why: "malformed" });
  assert.deepEqual(await verifyJwt(s.env(), "abc"), { ok: false, why: "malformed" });
});

test("requireUser: the person from the token, a client made only when used, and plain refusals", async () => {
  const saved = { ...process.env };
  try {
    const { requireUser } = await import("../src/lib/serverAuth.ts");
    const req = (token?: string) => new Request("https://app.test/api/x", { headers: token ? { authorization: `Bearer ${token}` } : {} });
    delete process.env.SUPABASE_URL;
    let r = await requireUser(req("x"));
    assert.ok("denied" in r && r.denied.status === 500);
    process.env.SUPABASE_URL = URL_;
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_x";
    process.env.SUPABASE_JWT_SECRET = "a-secret-that-is-long-enough-for-hs256-tokens";
    r = await requireUser(req());
    assert.ok("denied" in r && r.denied.status === 401);
    const c = claims();
    r = await requireUser(req(hs256(c, process.env.SUPABASE_JWT_SECRET)));
    assert.ok(!("denied" in r));
    if (!("denied" in r)) {
      assert.equal(r.user.id, c.sub);
      assert.equal(r.user.email, "dana@acme.io");
      assert.equal(typeof r.sb.from, "function");
      assert.equal(r.sb, r.sb, "one client per request");
    }
    r = await requireUser(req(hs256(claims({ exp: now() - 1 }), process.env.SUPABASE_JWT_SECRET)));
    assert.ok("denied" in r && r.denied.status === 401);
    r = await requireUser(req(hs256(claims(), "wrong-secret")));
    assert.ok("denied" in r && r.denied.status === 401);
  } finally {
    process.env = saved;
  }
});

test("role cache: a yes is kept until its TTL, a no is never kept, forget clears at once", async () => {
  let t = 0;
  const cache = roleCache({ ttlMs: 60_000, now: () => t });
  let reads = 0;
  let role: string | null = "owner";
  const look = async () => (reads++, role);
  assert.equal(await cache.get("w", "u", look), "owner");
  assert.equal(await cache.get("w", "u", look), "owner");
  assert.equal(reads, 1);
  role = null; // removed from the workspace
  t = 59_999;
  assert.equal(await cache.get("w", "u", look), "owner", "kept within the minute");
  t = 60_001;
  assert.equal(await cache.get("w", "u", look), null, "gone after it");
  assert.equal(await cache.get("w", "u", look), null);
  assert.equal(reads, 3, "a no is read every time");
  role = "member";
  assert.equal(await cache.get("w", "u", look), "member", "a new member gets in at once");
  role = "owner";
  cache.forget("w", "u");
  assert.equal(await cache.get("w", "u", look), "owner", "a change in this process counts at once");
  cache.forget("w");
  assert.equal(cache.size(), 0);
});

test("role cache: lookups at the same time share one read, and one that started before a forget isn't kept", async () => {
  const cache = roleCache();
  let reads = 0;
  let release!: (v: string) => void;
  const slow = () => (reads++, new Promise<string>((r) => (release = r)));
  const a = cache.get("w", "u", slow);
  const b = cache.get("w", "u", slow);
  cache.forget("w", "u");
  release("owner");
  assert.deepEqual(await Promise.all([a, b]), ["owner", "owner"]);
  assert.equal(reads, 1);
  assert.equal(cache.size(), 0, "the answer from before the change isn't kept");
  const small = roleCache({ max: 2 });
  for (const u of ["a", "b", "c"]) await small.get("w", u, async () => "member");
  assert.equal(small.size(), 2, "the oldest goes first");
});

test("ttl cache: kept until its time, a failed load isn't kept", async () => {
  let t = 0;
  const c = ttlCache<number>({ ttlMs: 1000, now: () => t });
  let n = 0;
  assert.equal(await c.get("k", async () => ++n), 1);
  assert.equal(await c.get("k", async () => ++n), 1);
  t = 1001;
  assert.equal(await c.get("k", async () => ++n), 2);
  await assert.rejects(c.get("x", async () => Promise.reject(new Error("down"))));
  assert.equal(await c.get("x", async () => 7), 7);
});

test("rpcOr: the new function when it's there; the old calls when it isn't (remembered); other errors pass through", async () => {
  resetMissing();
  let newCalls = 0;
  const missing = async (fn: string) => {
    newCalls++;
    return { data: null, error: { message: `Could not find the function public.${fn}(p_ws) in the schema cache` } };
  };
  const old = async () => ({ data: 1, error: null });
  assert.deepEqual(await rpcOr(missing, "speed_fn", {}, old), { data: 1, error: null });
  await rpcOr(missing, "speed_fn", {}, old);
  assert.equal(newCalls, 1, "not asked again for five minutes");
  assert.ok(isMissingFunction("function public.x(uuid) does not exist", "x"));
  const failing = async () => ({ data: null, error: { message: "permission denied" } });
  assert.deepEqual(await rpcOr(failing, "other_fn", {}, old), { data: null, error: { message: "permission denied" } });
  assert.deepEqual(await rpcOr(failing, "other_fn", {}, old, { anyError: true }), { data: 1, error: null });
  assert.deepEqual(await rpcOr(async () => ({ data: 5, error: null }), "ok_fn", {}, old), { data: 5, error: null });
});
