// Meeting reminders as a workflow (docs/workflows.md, migration 101, src/lib/workflows/engine.ts and
// worker-intel/jobs/workflows.ts): a Wait "before the meeting" parks until that long before the contact's next booked
// meeting, follows a reschedule, ends on a cancel and skips a reminder that's too late. The flaky cases: a meeting
// moved while the run waits, a meeting canceled, a booking made inside the reminder window, a meeting of another type,
// and the meeting's own reminders stopping only when a live workflow sends them.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Rpc } from "../src/lib/jobs.ts";
import { cleanBody, stepProblems } from "../src/lib/workflows/check.ts";
import { beforeMs, meetingFor, nextReminder, REMINDER_GRACE_MS, reminderMove } from "../src/lib/workflows/engine.ts";
import { waitWords } from "../src/lib/workflows/explain.ts";
import { templateByKey } from "../src/lib/workflows/templates.ts";
import type { Body, Step } from "../src/lib/workflows/types.ts";
import { advance, meetingVars } from "../worker-intel/jobs/workflows.ts";
import { remindersByWorkflow } from "../worker-intel/jobs/meetings.ts";

const H = 3_600_000;
const NOW = Date.UTC(2026, 10, 2, 9);
const iso = (t: number) => new Date(t).toISOString();
const day = (s: Step) => s as Extract<Step, { kind: "wait" }>;

test("before-the-meeting waits keep days and hours only, and say so", () => {
  const b = cleanBody({ trigger: { kind: "meeting", events: ["booked"], types: [] }, steps: [{ id: "w1", kind: "wait", days: 1, hours: 2, before: "meeting", weekday: [1], at: "09:00" }] });
  assert.deepEqual(b.steps[0], { id: "w1", kind: "wait", days: 1, hours: 2, before: "meeting" });
  assert.equal(waitWords(day(b.steps[0]!)), "Wait until 1 day and 2 hours before the meeting");
  assert.deepEqual(stepProblems({ id: "w", kind: "wait", days: 0, hours: 0, before: "meeting" }), ["Set how long before the meeting"]);
  assert.equal(beforeMs({ days: 1, hours: 1 }), 25 * H);
});

test("the meeting counted back from: the soonest still ahead, of the trigger's types", () => {
  const ms = [
    { id: "past", start_at: iso(NOW - H), type_id: "t1" },
    { id: "later", start_at: iso(NOW + 48 * H), type_id: "t1" },
    { id: "other", start_at: iso(NOW + 5 * H), type_id: "t2" },
  ];
  assert.equal(meetingFor(ms, { kind: "meeting", events: ["booked"], types: [] }, NOW)?.id, "other");
  assert.equal(meetingFor(ms, { kind: "meeting", events: ["booked"], types: ["t1"] }, NOW)?.id, "later", "another type's meeting never gets this reminder");
  assert.equal(meetingFor([], { kind: "manual" }, NOW), null);
});

test("park, go, or late; a late reminder skips to the next one", () => {
  const w = { id: "w", kind: "wait", days: 1, hours: 0, before: "meeting" } as const;
  assert.deepEqual(reminderMove(w, NOW + 48 * H, NOW), { kind: "park", at: NOW + 24 * H });
  assert.deepEqual(reminderMove(w, NOW + 24 * H - 60_000, NOW), { kind: "go" }, "a worker a minute late still sends");
  assert.deepEqual(reminderMove(w, NOW + 24 * H - REMINDER_GRACE_MS - 60_000, NOW), { kind: "late" });
  const body = templateByKey("reminders")!.body();
  const [w1, e1, w2] = body.steps;
  assert.equal(nextReminder(body.steps, w1!.id), w2!.id);
  assert.equal(nextReminder(body.steps, w2!.id), null);
  assert.equal(e1!.kind, "email");
});

// The worker over a fake database.
function world(o: { meetings: { id: string; start_at: string; type_id: string | null }[]; now: number }) {
  const body: Body = templateByKey("reminders")!.body();
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const state = { now: o.now, meetings: o.meetings.map((m) => ({ guest_tz: "America/New_York", url: "https://meet.google.com/abc", token_hash: "x", token_sealed: null, ...m })) };
  const rpc: Rpc = async (fn, args) => {
    calls.push({ fn, args });
    if (fn === "workflow_facts")
      return { data: { contact: { id: "c1", email: "dana@acme.com", first_name: "Dana", deleted: false, suppressed: false, lifecycle: null, qualify_outcome: null }, company: null, answers: {}, booked: true, tz: null, owner: null }, error: null };
    if (fn === "workflow_meetings") return { data: state.meetings, error: null };
    if (fn === "workflow_step_begin") return { data: "new", error: null };
    if (fn === "workflow_step_done") return { data: true, error: null };
    if (fn === "workflow_email") return { data: "msg1", error: null };
    return { data: null, error: null };
  };
  const run = (at: string | null, wait: Record<string, string> | null, nextAt = state.now) =>
    advance(rpc, "w", { id: "r1", workflow_id: "wf", workflow_name: "Meeting reminders", version: 1, contact_id: "c1", at_step: at, wait: wait as never, started_at: iso(o.now), next_at: iso(nextAt), body }, { now: () => state.now });
  const dones = () => calls.filter((c) => c.fn === "workflow_step_done").map((c) => c.args);
  const emails = () => calls.filter((c) => c.fn === "workflow_email");
  return { body, state, run, calls, dones, emails };
}

test("booked 3 days out: parks until a day before, sends then with the meeting's time, then parks for the hour", async () => {
  const start = NOW + 72 * H;
  const w = world({ meetings: [{ id: "m1", start_at: iso(start), type_id: null }], now: NOW });
  const [w1, e1, w2] = w.body.steps;
  assert.equal(await w.run(null, null), "waiting");
  const park = w.dones().at(-1)!;
  assert.equal(park.p_next_at, iso(start - 24 * H));
  assert.deepEqual(park.p_wait, { step: w1!.id, meeting: "m1", start: iso(start) });
  assert.equal(w.emails().length, 0);
  // The day before: the reminder goes, then it waits for the hour.
  w.state.now = start - 24 * H + 30_000;
  assert.equal(await w.run(w1!.id, park.p_wait as never), "waiting");
  assert.equal(w.emails().length, 1);
  assert.equal(w.emails()[0]!.args.p_step, e1!.id);
  const vars = w.emails()[0]!.args.p_vars as Record<string, string>;
  assert.equal(vars.meeting_time, "Thursday, November 5 at 4:00 AM EST", "in the guest's zone");
  assert.equal(vars.meeting_link, "https://meet.google.com/abc");
  assert.equal(w.dones().at(-1)!.p_next_at, iso(start - H));
  assert.equal((w.dones().at(-1)!.p_wait as { step: string }).step, w2!.id);
});

test("flaky: the meeting moves while the run waits; it parks again for the new time and sends nothing early", async () => {
  const start = NOW + 72 * H;
  const w = world({ meetings: [{ id: "m1", start_at: iso(start), type_id: null }], now: NOW });
  const [w1] = w.body.steps;
  await w.run(null, null);
  const wait = w.dones().at(-1)!.p_wait;
  // Rescheduled two days later: migration 101 wakes the run now.
  const moved = start + 48 * H;
  w.state.meetings[0]!.start_at = iso(moved);
  w.state.now = NOW + H;
  assert.equal(await w.run(w1!.id, wait as never), "waiting");
  assert.equal(w.emails().length, 0);
  assert.equal(w.dones().at(-1)!.p_next_at, iso(moved - 24 * H));
  assert.deepEqual(w.dones().at(-1)!.p_wait, { step: w1!.id, meeting: "m1", start: iso(moved) });
});

test("flaky: a canceled meeting ends the run without an email", async () => {
  const w = world({ meetings: [{ id: "m1", start_at: iso(NOW + 72 * H), type_id: null }], now: NOW });
  const [w1] = w.body.steps;
  await w.run(null, null);
  const wait = w.dones().at(-1)!.p_wait;
  w.state.meetings = [];
  assert.equal(await w.run(w1!.id, wait as never), "exited");
  assert.equal(w.emails().length, 0);
  assert.equal(w.dones().at(-1)!.p_exit, "no meeting");
});

test("flaky: booked 3 hours before, the day-before reminder is skipped and the hour-before one parks", async () => {
  const start = NOW + 3 * H;
  const w = world({ meetings: [{ id: "m1", start_at: iso(start), type_id: null }], now: NOW });
  const [w1, , w2] = w.body.steps;
  assert.equal(await w.run(null, null), "waiting");
  assert.equal(w.emails().length, 0, "never a 'see you tomorrow' for a meeting today");
  const skipped = w.dones().find((d) => d.p_step === w1!.id)!;
  assert.equal(skipped.p_status, "skipped");
  assert.equal(skipped.p_next, w2!.id);
  assert.equal(w.dones().at(-1)!.p_next_at, iso(start - H));
});

test("flaky: booked 20 minutes before, both reminders are skipped and the run ends", async () => {
  const w = world({ meetings: [{ id: "m1", start_at: iso(NOW + 20 * 60_000), type_id: null }], now: NOW });
  assert.equal(await w.run(null, null), "done");
  assert.equal(w.emails().length, 0);
});

test("meeting merge fields: time in the guest's zone, links only when real", () => {
  const v = meetingVars({ id: "m", start_at: iso(NOW), type_id: null, guest_tz: "Asia/Saigon", url: "javascript:alert(1)", token_hash: "x", token_sealed: null }, {});
  assert.match(v.meeting_time!, /Monday, November 2 at 4:00\sPM GMT\+7/);
  assert.equal(v.meeting_link, null);
  assert.equal(v.reschedule_link, null);
  assert.deepEqual(meetingVars(null, {}), { meeting_time: null, meeting_link: null, reschedule_link: null });
});

test("flaky: the meeting's own reminders stop only when a live workflow sends them", async () => {
  const says = (data: unknown, error: { message: string } | null = null): Rpc => async () => ({ data, error });
  assert.equal(await remindersByWorkflow(says(true), "w"), true);
  assert.equal(await remindersByWorkflow(says(false), "w"), false);
  assert.equal(await remindersByWorkflow(says(null, { message: "function workflow_reminders_live does not exist" }), "w"), false, "before 101 they still go");
  assert.equal(await remindersByWorkflow(async () => Promise.reject(new Error("down")), "w"), false);
});
