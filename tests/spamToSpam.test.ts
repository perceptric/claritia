// Spam goes to Spam (docs/on-submission.md, supabase/migrations/098_spam_to_spam.sql, src/lib/routing/spamRelease.ts).
// A form lead the routing spam check catches lands in the form's Spam list; "Not spam" routes it with that check
// skipped. The flaky cases: a child attempt folded into its parent's item must never move to Spam; a lead from the
// handoff or the API keeps its review item; a test fill is never touched; when routing refuses, the lead stays in
// Spam with its item dismissed again, never left half let in.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { routedSpam, routeSpamLead } from "../src/lib/routing/spamRelease.ts";

const SQL = readFileSync(new URL("../supabase/migrations/098_spam_to_spam.sql", import.meta.url), "utf8");

test("only rows the routing spam check caught, with a lead, need routing when let in", () => {
  assert.equal(routedSpam({ spam_reason: "routing", contact_id: "c1" }), true);
  assert.equal(routedSpam({ spam_reason: "marked", contact_id: "c1" }), false, "marked by hand only leaves Spam");
  assert.equal(routedSpam({ spam_reason: "trap", contact_id: null }), false, "the form's own checks: no lead yet, releaseFill makes one");
  assert.equal(routedSpam({ spam_reason: "routing", contact_id: null }), false, "a contact that's gone has nothing to route");
});

test("the trigger acts on form spam only, after the child trigger, and skips test fills", () => {
  assert.match(SQL, /if new\.reason <> 'spam' or new\.submission_id is null then return new; end if;/);
  assert.match(SQL, /and not test\) then return new; end if;/);
  // Triggers on one table fire by name: the child trigger (which folds a child attempt into its parent) runs first.
  const name = SQL.match(/create trigger (\w+) before insert on public\.routing_reviews/)![1]!;
  assert.ok(name > "routing_reviews_child", `${name} must sort after routing_reviews_child`);
  assert.match(SQL, /new\.state := 'dismissed';/, "the item is kept, dismissed, so Not spam can route through it");
});

type Call = { fn: string; args: Record<string, unknown> };
function fakes(item: { id: string; run_id: string; state: string } | null, fail: (fn: string) => boolean) {
  const calls: Call[] = [];
  const chain: Record<string, unknown> = {};
  for (const k of ["select", "eq", "order", "limit"]) chain[k] = () => chain;
  chain.maybeSingle = async () => ({ data: item, error: null });
  const db = { from: () => chain } as unknown as SupabaseClient;
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    return fail(fn) ? { data: null, error: { message: "boom" } } : { data: fn === "routing_review_act" ? { id: "rv", state: "open", revision: 2 } : null, error: null };
  };
  return { db, rpc, calls };
}

test("flaky: routing refuses, so the item goes back to dismissed and the lead stays in Spam", async () => {
  const f = fakes({ id: "rv", run_id: "0192f3a1-0000-7000-8000-0000000000b1", state: "dismissed" }, (fn) => fn !== "routing_review_act");
  await assert.rejects(routeSpamLead(f.rpc, f.db, { ws: "w", user: "u", submission: "s" }));
  const acts = f.calls.filter((c) => c.fn === "routing_review_act").map((c) => c.args.p_action);
  assert.deepEqual(acts, ["reopen", "dismiss"]);
  assert.equal(f.calls.at(-1)!.args.p_reason, "Spam");
});

test("flaky: a reopen that fails writes nothing else; a resolved item or a missing one never routes", async () => {
  const f = fakes({ id: "rv", run_id: "r", state: "dismissed" }, (fn) => fn === "routing_review_act");
  await assert.rejects(routeSpamLead(f.rpc, f.db, { ws: "w", user: "u", submission: "s" }), /Try again/);
  assert.equal(f.calls.length, 1);
  const done = fakes({ id: "rv", run_id: "r", state: "resolved" }, () => false);
  assert.deepEqual(await routeSpamLead(done.rpc, done.db, { ws: "w", user: "u", submission: "s" }), { owner: null });
  assert.equal(done.calls.length, 0);
  const gone = fakes(null, () => false);
  await assert.rejects(routeSpamLead(gone.rpc, gone.db, { ws: "w", user: "u", submission: "s" }), /gone/);
});
