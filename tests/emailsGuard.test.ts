// What an agent's send must pass before anything queues (src/lib/emails/guard.ts, docs/email-studio-plan.md Part 9).
import assert from "node:assert/strict";
import { test } from "node:test";
import { AGENT_SEND_LIMIT, campaignGuard, sendAtOf } from "../src/lib/emails/guard.ts";

const ok = { role: "owner", ready: 40, subject: "Spring reset" };

test("only an owner's key sends, with a subject, to someone, and at most 500 people", () => {
  assert.equal(campaignGuard(ok), null);
  assert.match(campaignGuard({ ...ok, role: "admin" })!, /owner/);
  assert.match(campaignGuard({ ...ok, role: null })!, /owner/);
  assert.match(campaignGuard({ ...ok, subject: "  " })!, /subject/);
  assert.match(campaignGuard({ ...ok, ready: 0 })!, /No one/);
  assert.equal(campaignGuard({ ...ok, ready: AGENT_SEND_LIMIT }), null);
  assert.equal(campaignGuard({ ...ok, ready: AGENT_SEND_LIMIT + 1 }), "confirm");
});

test("send_at: now when left out or close to now; refused when past, over a year out or not a date", () => {
  const now = Date.parse("2026-11-12T12:00:00Z");
  assert.deepEqual(sendAtOf(undefined, now), { at: null });
  assert.deepEqual(sendAtOf("", now), { at: null });
  assert.deepEqual(sendAtOf("2026-11-12T12:00:30Z", now), { at: null });
  assert.deepEqual(sendAtOf("2026-11-20T15:00:00Z", now), { at: "2026-11-20T15:00:00.000Z" });
  assert.ok("error" in sendAtOf("2026-11-01T00:00:00Z", now));
  assert.ok("error" in sendAtOf("2028-01-01T00:00:00Z", now));
  assert.ok("error" in sendAtOf("next tuesday", now));
  assert.ok("error" in sendAtOf(5, now));
});
