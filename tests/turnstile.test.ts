import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenSoon } from "../src/lib/tokenSoon.ts";

// Sign-in waits on the bot check for a few seconds instead of refusing, and stops at once when the check failed.

test("a token that arrives while waiting is used", async () => {
  let token = "";
  setTimeout(() => (token = "tok-1"), 30);
  assert.equal(await tokenSoon(() => token, () => false, 1000, 5), "tok-1");
});

test("a check that never answers gives up after the wait", async () => {
  const start = Date.now();
  assert.equal(await tokenSoon(() => "", () => false, 60, 5), "");
  assert.ok(Date.now() - start >= 55);
});

test("a check that failed stops the wait at once", async () => {
  let failed = false;
  setTimeout(() => (failed = true), 20);
  const start = Date.now();
  assert.equal(await tokenSoon(() => "", () => failed, 5000, 5), "");
  assert.ok(Date.now() - start < 1000);
});
