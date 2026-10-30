import assert from "node:assert/strict";
import { test } from "node:test";
import { matches, QueryCache } from "../src/lib/queryCache.ts";

const later = <T>(value: T, ms = 5) => new Promise<T>((r) => setTimeout(() => r(value), ms));
const fail = (msg: string, ms = 5) => new Promise<never>((_, reject) => setTimeout(() => reject(new Error(msg)), ms));

test("two asks for one key share one fetch", async () => {
  const c = new QueryCache();
  let calls = 0;
  const fn = () => {
    calls++;
    return later(["a"]);
  };
  const [a, b] = await Promise.all([c.fetch("k", fn), c.fetch("k", fn)]);
  assert.equal(calls, 1);
  assert.deepEqual(a, b);
  assert.deepEqual(c.get("k").data, ["a"]);
  // A forced fetch starts a new one.
  await c.fetch("k", fn, true);
  assert.equal(calls, 2);
});

test("stale-while-revalidate: old data stays on screen while the new fetch runs", async () => {
  const c = new QueryCache();
  let t = 1000;
  c.now = () => t;
  await c.fetch("k", () => later(1));
  assert.equal(c.isStale("k", 10_000), false);
  t += 20_000;
  assert.equal(c.isStale("k", 10_000), true);
  const p = c.fetch("k", () => later(2, 20));
  // While the fetch is out, the cached value is still there to paint.
  assert.equal(c.get("k").data, 1);
  assert.equal(c.get("k").fetching, true);
  await p;
  assert.equal(c.get("k").data, 2);
  assert.equal(c.get("k").fetching, false);
});

test("a failed fetch keeps the last good data and reports the error", async () => {
  const c = new QueryCache();
  await c.fetch("k", () => later("ok"));
  await assert.rejects(c.fetch("k", () => fail("offline"), true));
  assert.equal(c.get("k").data, "ok");
  assert.equal(c.get("k").error, "offline");
  await c.fetch("k", () => later("ok again"), true);
  assert.equal(c.get("k").error, "");
});

test("optimistic update shows at once and stays when the write works", async () => {
  const c = new QueryCache();
  c.set("rows", [{ id: 1, on: false }]);
  let seen: unknown = null;
  c.subscribe("rows", () => (seen = c.get("rows").data));
  const write = c.mutate<{ id: number; on: boolean }[]>("rows", (rows) => (rows ?? []).map((r) => ({ ...r, on: true })), () => later("saved"));
  // Changed before the write comes back.
  assert.deepEqual(c.get("rows").data, [{ id: 1, on: true }]);
  assert.deepEqual(seen, [{ id: 1, on: true }]);
  assert.equal(await write, "saved");
  assert.deepEqual(c.get("rows").data, [{ id: 1, on: true }]);
});

test("optimistic update rolls back and rethrows when the write fails", async () => {
  const c = new QueryCache();
  c.set("rows", [{ id: 1, on: false }]);
  const p = c.mutate<{ id: number; on: boolean }[]>("rows", (rows) => (rows ?? []).map((r) => ({ ...r, on: true })), () => fail("no permission"));
  assert.equal((c.get("rows").data as { on: boolean }[])[0].on, true);
  await assert.rejects(p, /no permission/);
  assert.deepEqual(c.get("rows").data, [{ id: 1, on: false }]);
});

test("a slow write that fails after a newer change refetches instead of undoing the newer change", async () => {
  const c = new QueryCache();
  c.set("n", 1);
  await c.fetch("n", () => later(1));
  const sub = c.subscribe("n", () => {});
  const slow = c.mutate<number>("n", () => 2, () => fail("timeout", 20));
  c.set("n", 3);
  await assert.rejects(slow);
  // The newer local change isn't overwritten by the rollback; the key is fetched again instead.
  await later(null, 10);
  assert.equal(c.get("n").data, 1);
  sub();
});

test("a fetch that started before a local change can't overwrite it", async () => {
  const c = new QueryCache();
  c.set("k", "old");
  const p = c.fetch("k", () => later("from server before the change", 20), true);
  c.set("k", "changed here");
  await p;
  assert.equal(c.get("k").data, "changed here");
});

test("invalidate by key: matching keys on screen fetch again, others wait for their next use", async () => {
  const c = new QueryCache();
  let a = 0;
  let b = 0;
  await c.fetch("meeting_types:ws1", () => later(++a));
  await c.fetch("meeting_types_extra:ws1", () => later(++b));
  await c.fetch("people:ws1", () => later("p"));
  const off = c.subscribe("meeting_types:ws1", () => {});
  await c.invalidate("meeting_types");
  assert.equal(a, 2, "the key on screen fetched again");
  assert.equal(c.get("meeting_types:ws1").data, 2);
  assert.equal(b, 1, "a key that only shares a prefix isn't touched");
  assert.equal(c.isStale("people:ws1", 60_000), false);
  off();
  // Off screen: marked stale, fetched on next use.
  await c.invalidate("people");
  assert.equal(c.isStale("people:ws1", 60_000), true);
  assert.equal(c.get("people:ws1").data, "p");
});

test("matches names a key or the keys under it", () => {
  assert.equal(matches("a:1", "a"), true);
  assert.equal(matches("a", "a"), true);
  assert.equal(matches("ab:1", "a"), false);
  assert.equal(matches("a:1:2", "a:1"), true);
});

test("idle entries past the limit are dropped, oldest first; entries on screen stay", async () => {
  const c = new QueryCache();
  c.limit = 3;
  const off = c.subscribe("keep", () => {});
  c.set("keep", 0);
  for (let i = 0; i < 6; i++) c.set(`k${i}`, i);
  assert.ok(c.entries.size <= 4);
  assert.equal(c.get("keep").data, 0);
  assert.equal(c.get("k5").data, 5);
  assert.equal(c.get("k0").data, undefined);
  off();
});

test("a flaky server: retries after a failure share one fetch and the last answer wins", async () => {
  const c = new QueryCache();
  let n = 0;
  const flaky = () => (++n % 2 ? fail("blip") : later(n));
  await assert.rejects(c.fetch("k", flaky));
  const [x, y] = await Promise.all([c.fetch("k", flaky), c.fetch("k", flaky)]);
  assert.equal(x, y);
  assert.equal(n, 2);
  assert.equal(c.get("k").data, 2);
  assert.equal(c.get("k").error, "");
});
