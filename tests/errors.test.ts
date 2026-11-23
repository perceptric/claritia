import assert from "node:assert/strict";
import { test } from "node:test";
import { errorText } from "../src/lib/attempt.ts";
import { dbError, GENERIC, UserError, userMessage } from "../src/lib/errors.ts";
import { fail, publicMessage } from "../src/lib/http.ts";
import { call } from "../src/lib/jobs.ts";

const quiet = <T>(fn: () => T): T => {
  const err = console.error;
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.error = err;
  }
};

test("our own words are shown: a UserError, and a message a database function raised (P0001)", () => {
  assert.equal(userMessage(new UserError("Pick a repository.")), "Pick a repository.");
  assert.equal(userMessage({ code: "P0001", message: "Only owners can connect tools" }), "Only owners can connect tools");
  assert.equal(userMessage(dbError({ code: "P0001", message: "Workspace not found" })), "Workspace not found");
});

test("common database errors get a plain sentence, and nothing else from the database is shown", () => {
  assert.equal(userMessage({ code: "23505", message: 'duplicate key value violates unique constraint "github_links_pkey"' }), "That already exists.");
  assert.equal(userMessage({ code: "42501", message: 'new row violates row-level security policy for table "runs"' }), "You don't have access to that.");
  assert.equal(userMessage({ code: "XX000", message: "internal error" }), null);
  assert.equal(userMessage(new Error("connect ECONNREFUSED 10.0.0.5:5432")), null);
  assert.equal(userMessage("a string"), null);
});

test("a screen shows our words, or GENERIC for anything else", () => {
  assert.equal(errorText(new UserError("The file is empty.")), "The file is empty.");
  assert.equal(quiet(() => errorText(new Error("relation \"x\" does not exist"))), GENERIC);
  assert.equal(errorText(new TypeError("Failed to fetch")), "Can't reach Claritia. Check your connection and try again.");
});

test("a route answers with our words and its status, or GENERIC with a reference and a 500, never the raw error", async () => {
  const known = fail(new UserError("Pick a plan."), 400);
  assert.equal(known.status, 400);
  assert.deepEqual(await known.json(), { error: "Pick a plan." });
  const raw = quiet(() => fail(new Error("password authentication failed for user postgres"), 400));
  assert.equal(raw.status, 500);
  const { error } = (await raw.json()) as { error: string };
  assert.match(error, /^Something went wrong\. Try again in a moment\. \(Reference [0-9a-f]{8}\)$/);
  assert.ok(!error.includes("password"));
  assert.notEqual(quiet(() => publicMessage(new Error("a"))), quiet(() => publicMessage(new Error("a"))), "each reference is new");
});

test("call() passes a database function's own message through, and keeps the code of anything else", async () => {
  const said = call(async () => ({ data: null, error: { code: "P0001", message: "Five runs are already waiting." } }), "queue_run", {});
  await assert.rejects(said, (e) => e instanceof UserError && e.message === "Five runs are already waiting.");
  const raw = call(async () => ({ data: null, error: { code: "23505", message: "duplicate key" } }), "x", {});
  await assert.rejects(raw, (e) => userMessage(e) === "That already exists." && (e as Error).message === "x: duplicate key");
});
