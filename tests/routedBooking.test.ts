// Routing decides, the form shows the result (docs/inbound.md): what a Claritia-calendar form does after the send
// for each way Routing can answer, including the flaky ones (no answer in time, paused, no router); the booking token
// that ties the lead to their rep (dropping or adding the tie breaks the signature); the rep's own version of a type.
// The database side is in tests/pg/routedBooking.pg.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readBooking, signBooking, type Claim } from "../src/lib/forms/booking.ts";
import { claritiaPlan, type Schedule } from "../src/lib/forms/schedule.ts";
import { checkForm, emptyForm } from "../src/lib/forms/schema.ts";
import { soloType } from "../src/lib/meetings/server.ts";
import { DEFAULT_SETTINGS, type MeetingType } from "../src/lib/meetings/types.ts";

const TYPE = "0192f3a1-0000-7000-8000-0000000000aa";
const MEET = "0192f3a1-0000-7000-8000-0000000000ab";
const REP = "0192f3a1-0000-7000-8000-0000000000bb";
const SID = "0192f3a1-0000-7000-8000-000000000001";
const SECRET = "unit-test-secret-0123456789abcdef";
const sch: Schedule = { tool: "claritia", url: "", perOwner: false, meetingTypeId: TYPE };
const live = { paused: false };

test("Routing live: the rule's meeting (else the form's) with the routed rep only", () => {
  assert.deepEqual(claritiaPlan(sch, { kind: "owner", rule: "ent", by: "queue", user: REP, meet: MEET }, live), { kind: "times", type: MEET, rep: REP });
  assert.deepEqual(claritiaPlan(sch, { kind: "owner", rule: "smb", by: "queue", user: REP }, live), { kind: "times", type: TYPE, rep: REP }, "the rule names no meeting");
  assert.deepEqual(claritiaPlan(sch, { kind: "owner", rule: null, by: "account", user: REP }, live), { kind: "times", type: TYPE, rep: REP }, "has a rep");
  assert.deepEqual(claritiaPlan(sch, { kind: "owner", rule: null, by: "fallback", user: REP, meet: MEET }, live), { kind: "times", type: MEET, rep: REP }, "everyone else");
});

test("Routing live: held and unassigned leads see the message; an owner with no rep never gets the pool", () => {
  assert.deepEqual(claritiaPlan(sch, { kind: "held" }, live), { kind: "message" });
  assert.deepEqual(claritiaPlan(sch, { kind: "unassigned" }, live), { kind: "message" });
  assert.deepEqual(claritiaPlan(sch, { kind: "owner", rule: "x", by: "queue" }, live), { kind: "message" });
  assert.deepEqual(claritiaPlan({ ...sch, meetingTypeId: undefined }, { kind: "owner", by: "queue", user: REP }, live), { kind: "message" }, "nothing to book");
});

test("flaky cases fall back to the type's own hosts: no answer in time, paused, no router", () => {
  assert.deepEqual(claritiaPlan(sch, null, live), { kind: "times", type: TYPE, rep: null }, "routing didn't answer in time");
  assert.deepEqual(claritiaPlan(sch, null, { paused: true }), { kind: "times", type: TYPE, rep: null });
  assert.deepEqual(claritiaPlan(sch, { kind: "held" }, { paused: true }), { kind: "times", type: TYPE, rep: null }, "paused: the old answer isn't read");
  assert.deepEqual(claritiaPlan(sch, null, null), { kind: "times", type: TYPE, rep: null });
  assert.deepEqual(claritiaPlan(sch, null, undefined), { kind: "times", type: TYPE, rep: null }, "the router read failed");
  // The old who / routeRules are not read here.
  assert.deepEqual(claritiaPlan({ ...sch, who: "routed", routeRules: ["other"] }, { kind: "owner", rule: "ent", by: "queue", user: REP }, live), { kind: "times", type: TYPE, rep: REP });
});

test("a rep-only token reads back, and the tie to the rep can't be dropped or added", () => {
  const exp = Date.now() + 3_600_000;
  const c: Claim = { submission: SID, type: TYPE, owner: REP, exp, only: true };
  const t = signBooking(c, SECRET);
  assert.deepEqual(readBooking(t, SECRET), { ...c, exp: Math.floor(exp / 1000) * 1000 });
  const parts = t.split(".");
  assert.equal(parts[2], `~${REP}`);
  assert.equal(readBooking(parts.map((p, i) => (i === 2 ? REP : p)).join("."), SECRET), null, "tie dropped");
  const plain = signBooking({ ...c, only: false }, SECRET);
  assert.equal((readBooking(plain, SECRET) as Claim).only, undefined);
  assert.equal(readBooking(plain.split(".").map((p, i) => (i === 2 ? `~${REP}` : p)).join("."), SECRET), null, "tie added");
  assert.equal(readBooking(parts.map((p, i) => (i === 2 ? "~-" : p)).join("."), SECRET), null);
});

test("the rep's own type: one host, no team, whatever the kind; a group keeps its seats", () => {
  const t: MeetingType = { id: TYPE, workspace_id: "w", slug: "d", name: "Demo", kind: "round_robin", hosts: [{ user_id: "a" }, { user_id: "b" }], settings: { ...DEFAULT_SETTINGS, team: "sales" }, secret: false, active: true, owner_user_id: null, template_id: null, locked: [] } as unknown as MeetingType;
  for (const kind of ["round_robin", "owner_first", "collective", "double", "one"] as const) {
    const s = soloType({ ...t, kind }, REP);
    assert.deepEqual([s.kind, s.hosts, s.settings.team, s.id], ["one", [{ user_id: REP }], undefined, TYPE]);
  }
  assert.equal(soloType({ ...t, kind: "group" }, REP).kind, "group");
  assert.equal(t.settings.team, "sales", "the type itself is untouched");
});

test("When their rep has no times: kept for Claritia calendar, dropped for anything else", () => {
  const f = (schedule: Record<string, unknown>) => ({ ...emptyForm(), steps: [{ id: "s1", fields: [{ id: "em", key: "email", type: "email", label: "Email", required: true }] }], after: { end: { kind: "message", title: "Thanks" }, schedule } });
  const a = checkForm(f({ tool: "claritia", url: "", perOwner: false, meetingTypeId: TYPE, none: "later" }));
  assert.ok("form" in a && a.form.after.schedule?.none === "later");
  const b = checkForm(f({ tool: "claritia", url: "", perOwner: false, meetingTypeId: TYPE, none: "nope" }));
  assert.ok("form" in b && b.form.after.schedule?.none === undefined);
  const c = checkForm(f({ tool: "calendly", url: "https://calendly.com/acme/demo", perOwner: false, none: "later" }));
  assert.ok("form" in c && c.form.after.schedule?.none === undefined);
});
