// The plain helpers behind Routing's Reps, Log and Held (src/components/app/routing/screensModel.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dayStart,
  decisionOf,
  factsOf,
  fromWords,
  heldWords,
  leadOf,
  matchesSearch,
  mergeNewer,
  meter,
  parseCap,
  pauseUntil,
  queuesByRep,
  rangeWords,
  repStatus,
  repWarnings,
  resultOf,
  routedBy,
  weekStart,
  type RunRow,
} from "../src/components/app/routing/screensModel.ts";
import { explain, pathWords } from "../src/lib/router/explain.ts";

const LEE = "11111111-1111-4111-8111-111111111111";
const MIA = "22222222-2222-4222-8222-222222222222";
const NOW = new Date(2026, 9, 24, 15, 0).getTime();

const run = (o: Partial<RunRow> = {}): RunRow => ({
  id: "r1",
  contact_id: "c1",
  reason: "form",
  version: 7,
  kind: "owner",
  owner: LEE,
  by: "queue",
  queue_id: "q1",
  rule_id: "r-us",
  steps: [
    { step: "spam", ok: true, checks: 5, signals: [] },
    { step: "rules", ok: true, rule: { id: "r-us", name: "US mid-market", queue: "q1" }, skipped: [] },
    { step: "queue", ok: true, queue: { id: "q1", name: "USMM", method: "rr", strict: false }, picked: LEE, pickedN: 3, others: [], window: 9 },
  ],
  facts: { lead: { id: "c1", name: "Dana Lee", email: "dana@acme.com", emailClass: "work", domain: "acme.com", firstName: "Dana", lastName: "Lee", recent: 1, disposable: false }, values: { "lead.form": "f1" }, reps: { [LEE]: { name: "Lee Park" } as never } },
  ms: 38,
  created_at: new Date(NOW).toISOString(),
  ...o,
});

test("a saved run becomes a Decision from its row", () => {
  assert.deepEqual(resultOf(run()), { kind: "owner", user: LEE, by: "queue", queue: "q1", rule: "r-us" });
  assert.equal(pathWords(decisionOf(run())), "Rule: US mid-market → take turns");
  const held = run({ kind: "held", owner: null, by: null, steps: [{ step: "spam", ok: false, checks: 5, signals: ["disposable", "fake_name"] }] });
  assert.deepEqual(resultOf(held), { kind: "held", signals: ["disposable", "fake_name"] });
  assert.deepEqual(heldWords(held), ["Throwaway email", "Fake name"]);
  assert.deepEqual(resultOf(run({ kind: "unassigned", owner: null })), { kind: "unassigned" });
  // An owner run with no owner (a former teammate's row cleared) reads as unassigned, never crashes.
  assert.deepEqual(resultOf(run({ owner: null })), { kind: "unassigned" });
});

test("runs assigned by hand keep no facts; explain still reads them with today's names", () => {
  const hand = run({ by: "hand", queue_id: null, rule_id: null, facts: {}, steps: [{ step: "hand", ok: true, user: LEE, by_user: MIA }] });
  const f = factsOf(hand, { [LEE]: "Lee Park", [MIA]: "Mia Chen" });
  const lines = explain(decisionOf(hand), f);
  assert.equal(lines.length, 1);
  assert.equal(lines[0]!.parts.map((p) => (typeof p === "string" ? p : p.text)).join(""), "Assigned to Lee Park by Mia Chen.");
  assert.equal(routedBy(hand), "Assigned by hand");
  // The run's own names win over today's.
  assert.equal(factsOf(run(), { [LEE]: "Lee P." }).reps[LEE]!.name, "Lee Park");
});

test("from, lead and routed-by words", () => {
  assert.equal(fromWords(run(), { f1: "Demo request" }), "Demo request");
  assert.equal(fromWords(run(), {}), "Form");
  assert.equal(fromWords(run({ reason: "again" })), "Route again");
  assert.deepEqual(leadOf(run()), { name: "Dana Lee", email: "dana@acme.com", domain: "acme.com", company: "" });
  assert.equal(leadOf(run({ facts: null })).name, "A lead");
  assert.equal(routedBy(run()), "Routed by US mid-market");
  assert.equal(routedBy(run({ by: "keep" })), "Kept owner");
  assert.equal(routedBy(run({ by: "account", steps: [{ step: "account", ok: true, company: { id: "co", name: "Acme", domain: "acme.com" }, owner: LEE, via: "company" }] })), "Matched Acme");
});

test("search and merging newer runs", () => {
  assert.ok(matchesSearch(run(), "ACME.com"));
  assert.ok(matchesSearch(run(), "dana"));
  assert.ok(!matchesSearch(run(), "initech"));
  assert.ok(matchesSearch(run(), "  "));
  const a = run({ id: "a", created_at: "2026-10-24T10:00:00Z" });
  const b = run({ id: "b", created_at: "2026-10-24T11:00:00Z" });
  const c = run({ id: "c", created_at: "2026-10-24T12:00:00Z" });
  assert.deepEqual(mergeNewer([a], [b, c, a]).map((r) => r.id), ["c", "b", "a"]);
});

test("a rep's status: paused, out on hand-set dates, or in", () => {
  assert.equal(repStatus(null, NOW).kind, "in");
  assert.deepEqual(repStatus({ paused_until: "infinity", out_dates: [] }, NOW), { kind: "paused", words: "Paused", until: Infinity });
  const later = repStatus({ paused_until: new Date(NOW + 3_600_000).toISOString(), out_dates: [] }, NOW);
  assert.equal(later.kind, "paused");
  assert.match(later.words, /^Paused · \d{1,2}:\d{2} [AP]M$/);
  assert.equal(repStatus({ paused_until: new Date(NOW - 1000).toISOString(), out_dates: [] }, NOW).kind, "in");
  assert.equal(repStatus({ paused_until: null, out_dates: [{ from: "2026-10-22", to: "2026-10-26" }] }, NOW).words, "Out · Oct 22–26");
  assert.equal(repStatus({ paused_until: null, out_dates: [{ from: "2026-10-28", to: "2026-10-31" }] }, NOW).kind, "in");
  // Paused wins over out.
  assert.equal(repStatus({ paused_until: "infinity", out_dates: [{ from: "2026-10-22", to: "2026-10-26" }] }, NOW).kind, "paused");
  assert.equal(rangeWords("2026-10-30", "2026-11-02"), "Oct 30–Nov 2");
  assert.equal(rangeWords("2026-10-28", "2026-10-28"), "Oct 28");
});

test("pause choices, day and week starts", () => {
  assert.equal(pauseUntil("forever", NOW), "infinity");
  assert.equal(Date.parse(pauseUntil("hour", NOW)), NOW + 3_600_000);
  const eod = new Date(pauseUntil("today", NOW));
  assert.equal(eod.getDate(), 24);
  assert.equal(eod.getHours(), 23);
  assert.equal(new Date(dayStart(NOW)).getHours(), 0);
  const w = new Date(weekStart(NOW));
  assert.equal(w.getDay(), 1); // Monday
  assert.ok(weekStart(NOW) <= dayStart(NOW) && dayStart(NOW) - weekStart(NOW) < 7 * 86_400_000);
});

test("meters and caps", () => {
  assert.deepEqual(meter(6, 8), { words: "6/8", fill: 0.75, full: false });
  assert.deepEqual(meter(9, 8), { words: "9/8", fill: 1, full: true });
  assert.deepEqual(meter(2, null), { words: "2/—", fill: 0, full: false });
  assert.equal(parseCap("", 1000), null);
  assert.equal(parseCap(" 8 ", 1000), 8);
  assert.equal(parseCap("0", 1000), undefined);
  assert.equal(parseCap("1001", 1000), undefined);
  assert.equal(parseCap("2.5", 1000), undefined);
});

test("queues per rep and row warnings", () => {
  const m = queuesByRep({ queues: [{ id: "q1", name: "USMM", method: "rr", strict: false, hoursOnly: false, members: [{ user: LEE, weight: 1 }] }, { id: "q2", name: "Ent", method: "rr", strict: false, hoursOnly: false, members: [{ user: LEE, weight: 1 }, { user: MIA, weight: 1 }] }] });
  assert.deepEqual(m.get(LEE)!.map((q) => q.name), ["USMM", "Ent"]);
  assert.equal(m.get(MIA)!.length, 1);
  assert.equal(queuesByRep(null).size, 0);
  assert.deepEqual(repWarnings({ calendar: true, queues: 1, hasRouter: true, hours: { mon: [["09:00", "17:00"]] } }), []);
  assert.deepEqual(repWarnings({ calendar: false, queues: 0, hasRouter: true, hours: { mon: [], tue: [] } }), ["no_calendar", "no_queue", "no_hours"]);
  // No router yet: not being in a queue isn't a problem.
  assert.deepEqual(repWarnings({ calendar: true, queues: 0, hasRouter: false, hours: null }), ["no_hours"]);
});
