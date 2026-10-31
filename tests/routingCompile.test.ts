// A form's routing and its meetings compiled into one policy (src/lib/routing/compile.ts): the form picks the meeting,
// the meeting picks the rep. Each path is one rule naming its destination and meeting, in order, and the Default
// meeting's Otherwise is Everyone else. The flaky cases: a half-made condition, a meeting deleted or turned off, a
// team that's gone, a meeting with no host. None of them may catch a lead or send one somewhere wrong.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BASE_FIELDS } from "../src/lib/router/conditions.ts";
import { emptyBody, type RouterBody } from "../src/lib/router/types.ts";
import { compileRouting, sampleLead, traceLead, type MeetingLite } from "../src/lib/routing/compile.ts";

const LEE = "0192f3a1-0000-7000-8000-0000000000a1";
const PRIYA = "0192f3a1-0000-7000-8000-0000000000a2";
const TEAMS = new Set(["q_sales", "q_ent"]);
const base: RouterBody = { ...emptyBody(), v: 2, spam: { ...emptyBody().spam, freeMail: true } };

const intro: MeetingLite = { id: "m_intro", name: "Intro call", active: true, hosts: [{ user_id: LEE }], settings: {} };
const sales: MeetingLite = {
  id: "m_sales",
  name: "Sales demo",
  active: true,
  hosts: [{ user_id: LEE }, { user_id: PRIYA }],
  settings: {
    dynamic: {
      rules: [
        { id: "uk", conds: [{ field: "lead.country", op: "is", value: "GB" }], to: { kind: "user", id: PRIYA } },
        { id: "big", conds: [{ field: "company.employees", op: "gte", value: 1000 }], to: { kind: "team", id: "q_ent" } },
      ],
      otherwise: { kind: "team", id: "q_sales" },
    },
  },
};
const small = { id: "r1", conds: [{ field: "company.employees", op: "lt" as const, value: 50 }], meet: "m_intro" };

test("Default Individual meeting: Everyone else is its host, booking that meeting; the policy's checks stay", () => {
  const { body, problems } = compileRouting(base, { def: "m_intro", routes: [], types: [intro, sales], teamKeys: TEAMS });
  assert.deepEqual(problems, []);
  assert.deepEqual(body.rules.list, []);
  assert.deepEqual(body.fallback, { kind: "user", id: LEE, meet: "m_intro" });
  assert.equal(body.spam.freeMail, true, "the spam check is the policy's own");
});

test("Default Dynamic meeting: its rules in order, then its Otherwise as Everyone else, all booking it", () => {
  const { body } = compileRouting(base, { def: "m_sales", routes: [], types: [intro, sales], teamKeys: TEAMS });
  assert.deepEqual(body.rules.list.map((r) => r.id), ["d_uk", "d_big"]);
  assert.equal(body.rules.list[0]!.then, "user");
  assert.equal(body.rules.list[0]!.user, PRIYA);
  assert.equal(body.rules.list[1]!.queue, "q_ent");
  assert.ok(body.rules.list.every((r) => r.meet === "m_sales"));
  assert.deepEqual(body.fallback, { kind: "queue", id: "q_sales", meet: "m_sales" });
});

test("a condition to a Dynamic meeting carries its conditions into each of that meeting's rules, then its Otherwise", () => {
  const { body } = compileRouting(base, { def: "m_intro", routes: [{ id: "r2", conds: [{ field: "lead.country", op: "is_not", value: "US" }], meet: "m_sales" }], types: [intro, sales], teamKeys: TEAMS });
  assert.deepEqual(body.rules.list.map((r) => r.id), ["f_r2_uk", "f_r2_big", "f_r2"]);
  assert.deepEqual(body.rules.list[0]!.conds, [{ field: "lead.country", op: "is_not", value: "US" }, { field: "lead.country", op: "is", value: "GB" }]);
  assert.equal(body.rules.list[2]!.queue, "q_sales", "the meeting's Otherwise, under the row's conditions");
  assert.deepEqual(body.fallback, { kind: "user", id: LEE, meet: "m_intro" });
});

test("conditions come first, in order, then the Default meeting's rules; the trace follows the router's matching", () => {
  const { body } = compileRouting(base, { def: "m_sales", routes: [small], types: [intro, sales], teamKeys: TEAMS });
  assert.deepEqual(body.rules.list.map((r) => r.id), ["f_r1", "d_uk", "d_big"]);
  const f = BASE_FIELDS;
  assert.deepEqual(traceLead(body, { "company.employees": "20", "lead.country": "GB" }, f).meet, "m_intro", "the condition wins over the Default meeting's rules");
  assert.deepEqual(traceLead(body, { "company.employees": "300", "lead.country": "GB" }, f).dest, { kind: "user", id: PRIYA });
  assert.deepEqual(traceLead(body, { "company.employees": "5000", "lead.country": "US" }, f).dest, { kind: "team", id: "q_ent" });
  const none = traceLead(body, { "company.employees": "300", "lead.country": "US" }, f);
  assert.equal(none.rule, null);
  assert.deepEqual(none.dest, { kind: "team", id: "q_sales" });
  assert.equal(none.meet, "m_sales");
});

test("flaky: half-made rows, gone or off meetings, gone teams and hostless meetings never route", () => {
  const off: MeetingLite = { ...intro, id: "m_off", active: false };
  const hostless: MeetingLite = { ...intro, id: "m_nohost", hosts: [] };
  const goneTeam: MeetingLite = { ...sales, id: "m_gone", settings: { dynamic: { rules: [{ id: "x", conds: [{ field: "lead.country", op: "is", value: "DE" }], to: { kind: "team", id: "q_deleted" } }], otherwise: { kind: "team", id: "q_deleted" } } } };
  const halfRule: MeetingLite = { ...sales, id: "m_half", settings: { dynamic: { rules: [{ id: "y", conds: [{ field: "lead.country", op: "is", value: "" }], to: { kind: "user", id: PRIYA } }], otherwise: { kind: "user", id: LEE } } } };
  const routes = [
    { id: "a", conds: [{ field: "lead.country", op: "is" as const, value: "" }], meet: "m_intro" },
    { id: "b", conds: [], meet: "m_intro" },
    { id: "c", conds: [{ field: "lead.country", op: "is" as const, value: "FR" }], meet: "m_missing" },
    { id: "d", conds: [{ field: "lead.country", op: "is" as const, value: "FR" }], meet: "m_off" },
    { id: "e", conds: [{ field: "lead.country", op: "is" as const, value: "FR" }], meet: "m_nohost" },
    { id: "g", conds: [{ field: "lead.country", op: "is" as const, value: "DE" }], meet: "m_gone" },
    { id: "h", conds: [{ field: "lead.country", op: "is" as const, value: "IT" }], meet: "m_half" },
  ];
  const { body, problems } = compileRouting(base, { def: "m_missing", routes, types: [intro, off, hostless, goneTeam, halfRule], teamKeys: TEAMS });
  assert.deepEqual(body.rules.list.map((r) => r.id), ["f_h"], "only the half-made meeting's Otherwise survives, under its row's complete condition");
  assert.equal(body.rules.list[0]!.user, LEE);
  assert.equal(body.fallback, null, "no Default meeting: Everyone else is empty, so the form shows its message");
  assert.ok(problems.length >= 7);
  // Nothing catches a lead from an empty or unknown answer.
  assert.equal(traceLead(body, {}, BASE_FIELDS).dest, null);
});

test("rule ids stay within the router's 40 characters and names within 80", () => {
  const long: MeetingLite = { ...sales, name: "A very long meeting name that goes on and on past the eighty character limit for sure" };
  const { body } = compileRouting(base, { def: long.id, routes: [{ id: "r".repeat(30), conds: [{ field: "lead.country", op: "is", value: "US" }], meet: long.id }], types: [long], teamKeys: TEAMS });
  assert.ok(body.rules.list.every((r) => r.id.length <= 40 && r.name.length <= 80));
});

test("the publish test's sample lead matches the first compiled rule", () => {
  const { body } = compileRouting(base, { def: "m_sales", routes: [small], types: [intro, sales], teamKeys: TEAMS });
  const lead = sampleLead(body);
  assert.deepEqual(lead, { "company.employees": "49" });
  assert.equal(traceLead(body, lead, BASE_FIELDS).rule?.id, "f_r1");
});
