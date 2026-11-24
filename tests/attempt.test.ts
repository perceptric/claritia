import assert from "node:assert/strict";
import { test } from "node:test";
import { attempt } from "../src/lib/attempt.ts";

test("attempt marks busy, runs after only on success, and turns a throw into the error", async () => {
  const log: string[] = [];
  const o = { setError: (e: string) => log.push(`error:${e}`), setBusy: (b: boolean) => log.push(`busy:${b}`), after: () => log.push("after") };
  await attempt(async () => log.push("run"), o);
  assert.deepEqual(log, ["error:", "busy:true", "run", "after", "busy:false"]);
  log.length = 0;
  await attempt(async () => {
    throw new Error("Nope");
  }, o);
  assert.deepEqual(log, ["error:", "busy:true", "error:Nope", "busy:false"]);
});
