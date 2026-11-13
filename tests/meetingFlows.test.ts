// The meeting workflows (src/lib/workflows/meetingFlows.ts; docs/workflows-plan.md, Part A): each starts with the
// emails Claritia sends for a meeting, reads back through the checks unchanged, needs nothing fixed, and tells the
// worker which emails go and when reminders go; the emails with the invite always go.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanBody, problems } from "../src/lib/workflows/check.ts";
import { flowKeys, flowReminders, hourly, keyOn, lockedStep, MEETING_FLOW_KINDS, meetingFlow, meetingFlowsPayload, reminderMinutes } from "../src/lib/workflows/meetingFlows.ts";
import { SYSTEM_KEYS } from "../src/lib/meetings/systemEmails.ts";

test("every meeting email belongs to exactly one meeting workflow, and each reads back unchanged with nothing to fix", () => {
  const all = MEETING_FLOW_KINDS.flatMap((k) => flowKeys(meetingFlow(k).body));
  assert.deepEqual([...new Set(all)].sort(), [...SYSTEM_KEYS].sort(), "every System email has its workflow");
  assert.equal(all.filter((k) => k !== "reminder").length, SYSTEM_KEYS.length - 1, "and only one");
  for (const k of MEETING_FLOW_KINDS) {
    const b = meetingFlow(k).body;
    assert.deepEqual(cleanBody(JSON.parse(JSON.stringify(b))), b, `${k} survives the checks`);
    assert.deepEqual(problems(b), [], `${k} has nothing to fix`);
  }
  assert.equal(meetingFlowsPayload().length, 7);
});

test("reminders: each Reminder after a Before-the-meeting Delay goes that long before", () => {
  assert.deepEqual(reminderMinutes(meetingFlow("reminders").body), [1440, 60]);
  assert.deepEqual(reminderMinutes(meetingFlow("reminders", [2880, 120, 2880]).body), [2880, 120]);
  // A Reminder with no Delay before it doesn't go; a Delay with no Reminder after it does nothing.
  assert.deepEqual(reminderMinutes({ steps: [{ id: "r", kind: "meeting_email", key: "reminder" }, { id: "w", kind: "wait", days: 1, hours: 0, before: "meeting" }] }), []);
  assert.deepEqual(flowReminders(null), null, "no Reminders workflow: the meeting type's times");
  assert.deepEqual(flowReminders([{ kind: "reminders", status: "paused", body: meetingFlow("reminders").body }]), [], "paused: none");
  assert.deepEqual(hourly([15, 60, 1440, 90]), [60, 1440, 120], "a Delay counts hours, so 15 minutes becomes an hour");
});

test("which emails go: a paused workflow or a step taken out stops it; the ones with the invite always go", () => {
  const confirmed = meetingFlow("confirmed").body;
  const flows = [{ kind: "confirmed", status: "live", body: { ...confirmed, steps: confirmed.steps.filter((s) => !(s.kind === "meeting_email" && s.key === "host_booked")) } }, { kind: "after", status: "paused", body: meetingFlow("after").body }];
  assert.equal(keyOn(flows, "host_booked"), false, "taken out");
  assert.equal(keyOn(flows, "after"), false, "paused");
  assert.equal(keyOn(flows, "no_show"), true, "no such workflow: as before");
  assert.equal(keyOn(null, "reminder"), true);
  assert.equal(keyOn([{ kind: "confirmed", status: "paused", body: { steps: [] } }], "confirm"), true, "the invite always goes");
  assert.equal(lockedStep({ id: "x", kind: "meeting_email", key: "cancel" }), true);
  assert.equal(lockedStep({ id: "x", kind: "meeting_email", key: "host_canceled" }), false);
});
