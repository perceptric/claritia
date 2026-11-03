// Stage H and I's pure parts (docs/routing-workflow.md Sections 18 and 20): which recovery each failure gets (the error
// table: reconnect then resume, check the calendar for an unknown outcome, retry only the sync, review actions only for
// the reviewer or an owner), the booking and sync labels, and the role map onto Claritia's owner and member.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DENIED, may, mayHandOff, mayRecover, mayReview } from "../src/lib/routing/access.ts";
import { bookingBadge, recoveryActions, syncBadge, type RecoveryRun } from "../src/lib/routing/screenModel.ts";

const ME = "me";
const OTHER = "other";
const base: RecoveryRun = { kind: "owner", owner: OTHER, review: null, booking_state: "not_requested", booking_reason: null, sync_state: "not_required", meeting: null, owner_calendar: { status: "ok" }, submission_id: "sub" };
const owner = { me: ME, role: "owner" as const };
const member = { me: ME, role: "member" as const };

test("review items: approve, assign by hand and dismiss while open or approved; resume while a child runs; reopen when dismissed", () => {
  const r = (state: string): RecoveryRun => ({ ...base, kind: "held", owner: null, review: { state, reviewer: OTHER } });
  assert.deepEqual(recoveryActions(r("open"), owner), ["approve", "assign", "dismiss"]);
  assert.deepEqual(recoveryActions(r("approved_pending_execution"), owner), ["approve", "assign", "dismiss"]);
  assert.deepEqual(recoveryActions(r("in_progress"), owner), ["resume_child"], "never a second commit while one runs");
  assert.deepEqual(recoveryActions(r("dismissed"), owner), ["reopen"]);
  assert.deepEqual(recoveryActions(r("resolved"), owner), []);
  assert.deepEqual(recoveryActions(r("open"), member), [], "a member who isn't the reviewer sees no review actions");
  assert.deepEqual(recoveryActions({ ...r("open"), review: { state: "open", reviewer: ME } }, member), ["approve", "assign", "dismiss"], "the named reviewer does");
});

test("booking failures: an unknown outcome is checked, never booked again; a disconnected calendar is reconnected before resuming", () => {
  assert.deepEqual(recoveryActions({ ...base, booking_state: "pending_confirmation", booking_reason: "outcome_unknown", meeting: { id: "m" } }, owner), ["reconcile", "reassign"]);
  assert.deepEqual(recoveryActions({ ...base, booking_state: "pending_confirmation", booking_reason: "outcome_unknown", meeting: { id: "m" }, owner_calendar: { status: "reconnect" } }, owner), ["reconnect", "reassign"]);
  assert.deepEqual(recoveryActions({ ...base, booking_state: "failed", booking_reason: "provider_error", meeting: { id: "m" } }, owner), ["reconcile", "reassign"]);
  assert.deepEqual(recoveryActions({ ...base, booking_state: "unavailable", booking_reason: "calendar_disconnected", owner_calendar: { status: "reconnect" } }, owner), ["reconnect", "reassign"]);
  assert.deepEqual(recoveryActions({ ...base, booking_state: "unavailable", booking_reason: "calendar_disconnected" }, owner), ["resume_booking", "reassign"], "reconnected: resume with the same owner");
  assert.deepEqual(recoveryActions({ ...base, booking_state: "abandoned" }, owner), ["resume_booking", "reassign"]);
  assert.deepEqual(recoveryActions({ ...base, booking_state: "confirmed", meeting: { id: "m" } }, owner), ["reassign"], "a confirmed booking needs nothing");
  assert.deepEqual(recoveryActions({ ...base, booking_state: "unavailable", submission_id: null }, owner), ["reassign"], "a handoff books again in Route & book");
});

test("a failed CRM sync is retried on its own; the lead's owner may recover their own run, other members can't", () => {
  assert.deepEqual(recoveryActions({ ...base, booking_state: "confirmed", meeting: { id: "m" }, sync_state: "failed" }, owner), ["retry_sync", "reassign"]);
  assert.deepEqual(recoveryActions({ ...base, owner: ME, sync_state: "failed" }, member), ["retry_sync"]);
  assert.deepEqual(recoveryActions({ ...base, sync_state: "failed" }, member), []);
});

test("labels: an unknown outcome and a failed calendar event say so; sync shows only when it matters", () => {
  assert.equal(bookingBadge("pending_confirmation", "outcome_unknown").label, "Outcome unknown");
  assert.equal(bookingBadge("pending_confirmation", null).label, "Pending confirmation");
  assert.equal(bookingBadge("failed", "provider_error").label, "Calendar event failed");
  assert.equal(syncBadge("not_required"), null);
  assert.deepEqual(syncBadge("failed"), { label: "Sync failed", tone: "red" });
});

test("Section 20 on Claritia's roles: owners do everything; members view, test, hand off their own or unowned leads, and recover their own runs", () => {
  const o = { user: ME, role: "owner" as const };
  const m = { user: ME, role: "member" as const };
  for (const cap of ["view", "test", "handoff", "own_status"] as const) assert.equal(may(m, cap), true, cap);
  for (const cap of ["edit_policy", "publish", "team", "member_settings", "review", "reassign", "override", "recover"] as const) {
    assert.equal(may(m, cap), false, cap);
    assert.equal(may(o, cap), true, cap);
    assert.ok(DENIED[cap].length > 0);
  }
  assert.equal(mayReview(m, { reviewer: ME }), true);
  assert.equal(mayReview(m, { reviewer: OTHER }), false);
  assert.equal(mayRecover(m, { owner: ME }), true);
  assert.equal(mayRecover(m, { owner: OTHER }), false);
  assert.deepEqual([mayHandOff(m, null), mayHandOff(m, ME), mayHandOff(m, OTHER), mayHandOff(o, OTHER)], [true, true, false, true]);
});
