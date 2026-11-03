// AI credits in the step cache (src/lib/ai/cache.ts, supabase/migrations/120_plans.sql): a Tia step takes its credits
// before the model runs, a cached step and unasked work take none, a refused step never calls the model, and a model
// call that fails gives the credits back. Fills past Free's cap are masked on screen (src/lib/planHidden.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import { cachedStep, OutOfCredits } from "../src/lib/ai/cache.ts";
import { hiddenFill, maskFill } from "../src/lib/planHidden.ts";
import { resetMissing } from "../src/lib/rpcCompat.ts";

/** A database stand-in: the cache, the log and a credit balance with a cap. */
function fakeDb(cap: number, o: { missing?: boolean; broken?: boolean } = {}) {
  const store = new Map<string, unknown>();
  const db = { used: 0, cap, calls: [] as string[] };
  const rpc = async (fn: string, a: Record<string, unknown>) => {
    db.calls.push(fn);
    if (fn === "ai_cache_hit") return { data: store.get(`${a.p_kind}:${a.p_key}`) ?? null, error: null };
    if (fn === "ai_cache_store") {
      if (a.p_keep) store.set(`${a.p_kind}:${a.p_key}`, a.p_output);
      return { data: null, error: null };
    }
    if (fn === "ai_credit_take") {
      if (o.missing) return { data: null, error: { message: "Could not find the function public.ai_credit_take" } };
      if (o.broken) return { data: null, error: { message: "connection reset" } };
      const n = a.p_n as number;
      if (db.used + n > db.cap) return { data: false, error: null };
      db.used += n;
      return { data: true, error: null };
    }
    if (fn === "ai_credit_give") {
      db.used = Math.max(0, db.used - (a.p_n as number));
      return { data: null, error: null };
    }
    return { data: null, error: { message: `unknown ${fn}` } };
  };
  return { db, rpc };
}
const usage = { input: 10, output: 10, cache_read: 0, cache_write: 0 };

test("a Tia step takes its credits; the same step again replays from the cache for free", async () => {
  resetMissing();
  const { db, rpc } = fakeDb(100);
  let model = 0;
  const run = async () => (model++, { result: { ok: 1 }, model: "claude-haiku-5-5", usage });
  await cachedStep(rpc, "ws", "studio_chat", "k1", run);
  assert.equal(db.used, 1);
  const again = await cachedStep(rpc, "ws", "studio_chat", "k1", run);
  assert.equal(again.cached, true);
  assert.equal(db.used, 1, "a cached step uses no credits");
  assert.equal(model, 1);
  await cachedStep(rpc, "ws", "form_new_build", "k2", run);
  assert.equal(db.used, 9, "building a form is 8 on top of its brief and plan");
});

test("out of credits: the model is never called and the step says why", async () => {
  resetMissing();
  const { db, rpc } = fakeDb(8);
  let model = 0;
  const run = async () => (model++, { result: 1, model: "claude-sonnet-5-5", usage });
  await cachedStep(rpc, "ws", "form_new_build", "a", run);
  await assert.rejects(() => cachedStep(rpc, "ws", "studio_chat", "b", run), (e) => e instanceof OutOfCredits && /AI credits/.test(e.message) && e.status === 402);
  assert.equal(model, 1);
  assert.equal(db.used, 8);
});

test("work no one asked for in the moment never needs credits", async () => {
  resetMissing();
  const { db, rpc } = fakeDb(0);
  const r = await cachedStep(rpc, "ws", "brand_book", "page", async () => ({ result: "css", model: "claude-haiku-5-5", usage }));
  assert.equal(r.result, "css");
  assert.equal(db.calls.includes("ai_credit_take"), false);
});

test("a model call that fails gives its credits back, and a flaky one retried is charged once", async () => {
  resetMissing();
  const { db, rpc } = fakeDb(5);
  let tries = 0;
  const flaky = async () => {
    tries++;
    if (tries === 1) throw new Error("overloaded");
    return { result: "ok", model: "claude-haiku-5-5", usage };
  };
  await assert.rejects(() => cachedStep(rpc, "ws", "studio_chat", "f", flaky), /overloaded/);
  assert.equal(db.used, 0, "the failed call's credit came back");
  await cachedStep(rpc, "ws", "studio_chat", "f", flaky);
  assert.equal(db.used, 1);
});

test("before the plans migration the step runs as before; a broken count refuses", async () => {
  resetMissing();
  const old = fakeDb(0, { missing: true });
  const r = await cachedStep(old.rpc, "ws", "studio_chat", "m", async () => ({ result: 1, model: "claude-haiku-5-5", usage }));
  assert.equal(r.result, 1);
  resetMissing();
  const broken = fakeDb(100, { broken: true });
  let model = 0;
  await assert.rejects(() => cachedStep(broken.rpc, "ws", "studio_chat", "x", async () => (model++, { result: 1, model: "claude-haiku-5-5", usage })), /ai_credit_take/);
  assert.equal(model, 0);
});

test("fills past Free's cap are hidden this month, and show from the 1st", () => {
  const now = new Date("2026-11-20T12:00:00Z");
  const fill = { id: "s1", created_at: "2026-11-03T09:00:00Z", over_cap: true, values: { email: "a@b.co" }, hidden: { page: "/x" }, contacts: { email: "a@b.co" } };
  assert.equal(hiddenFill(fill, now), true);
  const m = maskFill(fill, now) as typeof fill & { locked: boolean };
  assert.deepEqual([m.values, m.hidden, m.contacts, m.locked], [{}, {}, null, true]);
  assert.equal(hiddenFill(fill, new Date("2026-12-01T00:00:01Z")), false, "a new month shows last month's");
  assert.equal(hiddenFill({ ...fill, over_cap: false }, now), false);
  assert.equal(maskFill({ ...fill, over_cap: false }, now).values.email, "a@b.co");
});
