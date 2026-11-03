// A Dynamic meeting's own booking link (src/lib/meetings/dynamic.ts, dynamicServer.ts): the questions its rules test,
// then the reps those answers pick, for the times and the booking alike. The flaky cases: a half-made rule, a rep who
// isn't among the meeting's reps, a team that's gone or empty, junk answers. None may narrow the page to the wrong
// person; the page keeps every rep instead.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BASE_FIELDS } from "../src/lib/router/conditions.ts";
import { dynamicHosts, narrowTo, routeQuestions, routeValues } from "../src/lib/meetings/dynamic.ts";
import { answersOf } from "../src/lib/meetings/dynamicServer.ts";
import { DEFAULT_SETTINGS, type MeetingType } from "../src/lib/meetings/types.ts";

const LEE = "0192f3a1-0000-7000-8000-0000000000a1";
const PRIYA = "0192f3a1-0000-7000-8000-0000000000a2";
const SAM = "0192f3a1-0000-7000-8000-0000000000a3";
const OUT = "0192f3a1-0000-7000-8000-0000000000a9";
const TEAMS = { q_ent: { members: [{ user: LEE }, { user: SAM }] }, q_empty: { members: [] } };

const meeting = (dynamic: unknown, o: Partial<MeetingType> = {}): MeetingType =>
  ({
    id: "m1",
    workspace_id: "w",
    slug: "sales",
    name: "Sales demo",
    kind: "round_robin",
    hosts: [{ user_id: LEE }, { user_id: PRIYA }, { user_id: SAM }],
    settings: { ...DEFAULT_SETTINGS, rrMode: "strict", ...(dynamic ? { dynamic } : {}) },
    ...o,
  }) as unknown as MeetingType;

const sales = meeting({
  rules: [
    { id: "uk", conds: [{ field: "lead.country", op: "one_of", value: ["GB"] }], to: { kind: "user", id: PRIYA } },
    { id: "big", conds: [{ field: "company.employees", op: "gte", value: 1000 }], to: { kind: "team", id: "q_ent" } },
    { id: "half", conds: [{ field: "contact.title", op: "is", value: "" }], to: { kind: "user", id: LEE } },
  ],
  otherwise: { kind: "user", id: LEE },
});

test("the questions are the fields complete rules test, in order; a half-made rule asks nothing", () => {
  assert.deepEqual(routeQuestions(sales, BASE_FIELDS).map((q) => q.key), ["lead.country", "company.employees"]);
  assert.deepEqual(routeQuestions(meeting(null), BASE_FIELDS), [], "an Individual meeting asks nothing");
  const byEmail = meeting({ rules: [{ id: "free", conds: [{ field: "contact.email_class", op: "one_of", value: ["free"] }], to: { kind: "user", id: SAM } }], otherwise: null });
  assert.deepEqual(routeQuestions(byEmail, BASE_FIELDS).map((q) => q.key), ["email"], "the email's type comes from the email");
});

test("answers pick the rule's rep, the team's members among the reps, or Otherwise", () => {
  const qs = routeQuestions(sales, BASE_FIELDS);
  assert.deepEqual(dynamicHosts(sales, routeValues({ "lead.country": "GB" }, qs), TEAMS), [PRIYA]);
  assert.deepEqual(dynamicHosts(sales, routeValues({ "lead.country": "US", "company.employees": "5,000" }, qs), TEAMS), [LEE, SAM]);
  assert.deepEqual(dynamicHosts(sales, routeValues({ "lead.country": "US", "company.employees": "20" }, qs), TEAMS), [LEE]);
});

test("flaky: a rep outside the meeting, a gone or empty team, or no Otherwise keeps every rep", () => {
  const odd = meeting({
    rules: [
      { id: "a", conds: [{ field: "lead.country", op: "one_of", value: ["FR"] }], to: { kind: "user", id: OUT } },
      { id: "b", conds: [{ field: "lead.country", op: "one_of", value: ["DE"] }], to: { kind: "team", id: "q_gone" } },
      { id: "c", conds: [{ field: "lead.country", op: "one_of", value: ["IT"] }], to: { kind: "team", id: "q_empty" } },
      // A later rule that would also match must never catch a lead an earlier rule matched.
      { id: "d", conds: [{ field: "lead.country", op: "filled" }], to: { kind: "user", id: PRIYA } },
    ],
    otherwise: null,
  });
  for (const c of ["FR", "DE", "IT"]) assert.equal(dynamicHosts(odd, { "lead.country": c }, TEAMS), null, c);
  assert.equal(dynamicHosts(odd, {}, TEAMS), null, "no answers and no Otherwise");
  assert.equal(dynamicHosts(meeting(null), { "lead.country": "GB" }, TEAMS), null);
});

test("flaky: junk answers are dropped, never matched", () => {
  const qs = [...routeQuestions(sales, BASE_FIELDS), { key: "contact.seniority", label: "Seniority", type: "choice" as const, options: ["VP"] }];
  assert.deepEqual(routeValues({ "lead.country": "  ", "company.employees": "lots", "contact.seniority": "Pope", extra: "x" }, qs), {});
  assert.deepEqual(routeValues("nope", qs), {});
  assert.equal(answersOf("{bad"), null);
  assert.equal(answersOf("x".repeat(3000)), null);
  assert.equal(answersOf("[1]"), null);
  assert.deepEqual(answersOf('{"lead.country":"GB"}'), { "lead.country": "GB" });
});

test("narrowing keeps the meeting as it is for all or none, and loosens strict turns for one rep", () => {
  assert.equal(narrowTo(sales, null), sales);
  assert.equal(narrowTo(sales, [OUT]), sales);
  assert.equal(narrowTo(sales, [LEE, PRIYA, SAM]), sales);
  const one = narrowTo(sales, [PRIYA]);
  assert.deepEqual(one.hosts, [{ user_id: PRIYA }]);
  assert.equal(one.settings.rrMode, "flexible");
  const two = narrowTo(sales, [LEE, SAM]);
  assert.deepEqual(two.hosts.map((h) => h.user_id), [LEE, SAM]);
  assert.equal(two.settings.rrMode, "strict", "a team keeps its turns");
});

test("flaky: a Dynamic meeting's reschedule always keeps the rep its rules picked", async () => {
  const { keepsHost } = await import("../src/lib/meetings/public.ts");
  const pool = (dynamic: unknown) => meeting(dynamic, {}) as MeetingType;
  const individualPool = pool(null);
  individualPool.settings.reschedule = "pool";
  assert.equal(keepsHost(individualPool), false, "an Individual meeting set to the pool may move to another host");
  const dyn = pool({ rules: [], otherwise: { kind: "user", id: LEE } });
  dyn.settings.reschedule = "pool";
  assert.equal(keepsHost(dyn), true);
  assert.equal(keepsHost(pool(null)), true, "same host is the default");
});
