import { test } from "node:test";
import assert from "node:assert/strict";
import { DOWN, pageRead } from "../src/lib/meetings/pageRead.ts";

// A public booking page never tells a guest a real link is gone because a read failed (src/lib/meetings/pageRead.ts).

const quiet = async <T>(fn: () => Promise<T>) => {
  const log = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = log;
  }
};

test("an address that names something gives its value", async () => {
  assert.deepEqual(await pageRead(async () => ({ id: "t1" })), { id: "t1" });
});

test("an address that names nothing gives null, so the page says it isn't here", async () => {
  assert.equal(await pageRead(async () => null), null);
});

test("a read that fails is DOWN, never null", async () => {
  assert.equal(await quiet(() => pageRead(async () => Promise.reject(Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" })))), DOWN);
});

test("a flaky database: DOWN on the failed try, the page on the next", async () => {
  let tries = 0;
  const flaky = async () => (++tries === 1 ? Promise.reject(new Error("fetch failed")) : { id: "t1" });
  assert.equal(await quiet(() => pageRead(flaky)), DOWN);
  assert.deepEqual(await pageRead(flaky), { id: "t1" });
});

test("no database to read is DOWN", async () => {
  assert.equal(await pageRead(null), DOWN);
});
