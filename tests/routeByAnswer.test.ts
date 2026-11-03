// Route by answer, past fills, Always do and the form check (docs/on-submission.md; src/lib/studio/routes.ts,
// src/lib/router/server.ts readPast, src/lib/studio/check.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import { resetNewer } from "../src/lib/forms/newer.ts";
import type { Rpc } from "../src/lib/jobs.ts";
import { dynamicHosts, routeQuestions, routeValues } from "../src/lib/meetings/dynamic.ts";
import { whoBooks } from "../src/lib/meetings/dynamicWords.ts";
import { BASE_FIELDS, condWords, ruleMatches } from "../src/lib/router/conditions.ts";
import { readFacts, readPast } from "../src/lib/router/server.ts";
import { emptyBody, type Rule } from "../src/lib/router/types.ts";
import { checkStudioPage } from "../src/lib/studio/check.ts";
import { alwaysOf, cleanPage, pageForm, teamAlert, type PageAfter } from "../src/lib/studio/page.ts";
import { cleanRoute, routeCond, routeKind, routeMeeting, routeWords, type StudioRoute } from "../src/lib/studio/routes.ts";

const DEMO = "11111111-1111-4111-8111-111111111111";
const ENT = "22222222-2222-4222-8222-222222222222";
const MEETINGS = [
  { id: DEMO, name: "Demo" },
  { id: ENT, name: "Enterprise" },
];
const PAGE = `<form><div data-cl-step><label for="e">Email</label><input id="e" name="email" type="email" required>
<label for="l">Locations</label><input id="l" name="locations" type="number">
<fieldset><legend>Plan</legend><label><input type="radio" name="plan" value="team"> Team</label><label><input type="radio" name="plan" value="ent"> Enterprise</label></fieldset>
<label for="n">Notes</label><textarea id="n" name="notes"></textarea><button data-cl-next type="button">Next</button></div>
<div data-cl-step data-cl-show-if="locations &lt; 5"><label for="s">Site</label><input id="s" name="site"><button type="submit">Send</button></div></form>
<section data-cl-thanks hidden><h2>Thanks</h2><div data-cl-book id="book"></div></section>`;
const qs = cleanPage(PAGE).questions;
const q = (name: string) => qs.find((x) => x.name === name);

test("a route compiles each test on its question's type: numbers as numbers, picks as lists, past fills as they are", () => {
  const num = (r: Partial<StudioRoute>) => routeCond({ field: "locations", op: "lt", meeting: ENT, ...r }, "answer.q.l", routeKind("locations", q("locations")));
  assert.equal(routeKind("locations", q("locations")), "number");
  assert.equal(routeKind("plan", q("plan")), "choice");
  assert.equal(routeKind("notes", q("notes")), "text");
  assert.equal(routeKind("past.sent_form", undefined), "yesno");
  assert.equal(routeKind("past.days_since_booked", undefined), "days");
  assert.deepEqual(num({ value: "5" }), { field: "answer.q.l", op: "lt", value: 5 });
  assert.deepEqual(num({ op: "between", value: ["50", "10"] }), { field: "answer.q.l", op: "between", value: [10, 50] }, "a range in either order");
  assert.equal(num({ value: "" }), null, "a number left blank never routes");
  assert.equal(num({ value: "lots" }), null, "nor one that isn't a number");
  assert.equal(num({ op: "between", value: ["1", ""] }), null);
  assert.deepEqual(num({ op: "empty", value: undefined }), { field: "answer.q.l", op: "empty" });
  assert.deepEqual(routeCond({ field: "plan", op: "one_of", value: ["ent"], meeting: ENT }, "answer.q.p", "choice"), { field: "answer.q.p", op: "one_of", value: ["ent"] });
  assert.equal(routeCond({ field: "plan", op: "one_of", value: [], meeting: ENT }, "answer.q.p", "choice"), null);
  assert.deepEqual(routeCond({ field: "past.sent_form", op: "is", value: "false", meeting: ENT }, "past.sent_form", "yesno"), { field: "past.sent_form", op: "is", value: "false" });
  assert.deepEqual(routeCond({ field: "past.days_since_booked", op: "lte", value: 30, meeting: ENT }, "past.days_since_booked", "days"), { field: "past.days_since_booked", op: "lte", value: 30 });
});

test("rows saved before tests ('plan is ent') still read, as 'is' that answer", () => {
  assert.deepEqual(cleanRoute({ field: "plan", value: "ent", meeting: ENT }), { field: "plan", op: "is", value: "ent", meeting: ENT });
  assert.equal(cleanRoute({ field: "plan" }), null);
  assert.equal(cleanRoute("nope"), null);
  assert.deepEqual(cleanRoute({ field: "locations", op: "drop table", value: 3, meeting: ENT }), { field: "locations", op: "is", value: 3, meeting: ENT }, "an unknown test falls back to is");
});

test("the preview picks the first row that holds, else Otherwise; a past fill it can't know never matches", () => {
  const routes: StudioRoute[] = [
    { field: "past.sent_form", op: "is", value: "true", meeting: ENT },
    { field: "locations", op: "gte", value: "50", meeting: ENT },
    { field: "plan", op: "one_of", value: ["ent"], meeting: ENT },
  ];
  assert.equal(routeMeeting(routes, DEMO, { locations: "120" }, qs), ENT);
  assert.equal(routeMeeting(routes, DEMO, { locations: "12" }, qs), DEMO);
  assert.equal(routeMeeting(routes, DEMO, { locations: "lots" }, qs), DEMO, "text that isn't a number is unknown");
  assert.equal(routeMeeting(routes, DEMO, { plan: "ent" }, qs), ENT);
  assert.equal(routeMeeting(routes, DEMO, {}, qs), DEMO);
  assert.equal(routeMeeting(routes, DEMO, {}, qs, { "past.sent_form": "true" }), ENT);
  assert.equal(routeMeeting([{ field: "notes", op: "contains", value: "SSO", meeting: ENT }], DEMO, { notes: "we need sso" }, qs), ENT, "contains ignores case");
  assert.equal(routeMeeting([{ field: "notes", op: "empty", meeting: ENT }], DEMO, { notes: "  " }, qs), ENT);
});

test("published, each row is one router condition on the answer's field, and Always do is the form's team alert", () => {
  const after: PageAfter = {
    kind: "meeting",
    meeting: DEMO,
    routes: [
      { field: "locations", op: "gte", value: "50", meeting: ENT },
      { field: "past.has_meeting", op: "is", value: "true", meeting: ENT },
      { field: "gone", op: "is", value: "x", meeting: ENT },
      { field: "locations", op: "lt", value: "", meeting: ENT },
    ],
    always: { email: true, to: ["Team@Acme.com", "not an email"], slack: true },
  };
  const { form, questions } = pageForm({ html: PAGE, css: "", brand: "", after });
  const loc = questions.find((x) => x.name === "locations")!;
  const sch = (form.after as { schedule: { meetingTypeId: string; routes: { id: string; meet: string; conds: unknown[] }[] } }).schedule;
  assert.equal(sch.meetingTypeId, DEMO);
  assert.deepEqual(
    sch.routes.map((r) => r.conds),
    [[{ field: `answer.q.${loc.id}`, op: "gte", value: 50 }], [{ field: "past.has_meeting", op: "is", value: "true" }]],
    "a row on a gone question or with no value never routes",
  );
  assert.deepEqual(form.notify, { on: true, to: ["team@acme.com"], subject: "New submission: {{form}} from {{name}}", answers: true, slack: true });
  const page = (form.page as { after: PageAfter }).after;
  assert.equal(page.routes?.length, 4, "the rows stay on the page as written, to fix in the Studio");
  const none = pageForm({ html: PAGE, css: "", brand: "", after: { kind: "thanks" } }).form;
  assert.equal("notify" in none, false, "a form with no Always do keeps the alerts it had");
});

test("the form check flags rules on a gone question, answer or meeting, a blank value, and a page shown by a later answer", () => {
  const codes = (after: PageAfter, html = PAGE, meetings = MEETINGS) => checkStudioPage({ html, after, meetings }).filter((i) => i.level === "error").map((i) => i.code);
  const base: PageAfter = { kind: "meeting", meeting: DEMO };
  assert.deepEqual(codes(base), []);
  assert.deepEqual(codes({ ...base, routes: [{ field: "seats", op: "gt", value: 3, meeting: ENT }] }), ["route-gone"]);
  assert.deepEqual(codes({ ...base, routes: [{ field: "plan", op: "one_of", value: ["pro"], meeting: ENT }] }), ["route-value"]);
  assert.deepEqual(codes({ ...base, routes: [{ field: "plan", value: "pro", meeting: ENT } as unknown as StudioRoute] }), ["route-value"], "an old row too");
  assert.deepEqual(codes({ ...base, routes: [{ field: "locations", op: "between", value: ["1", ""], meeting: ENT }] }), ["route-empty"]);
  assert.deepEqual(codes({ ...base, routes: [{ field: "past.sent_form", op: "is", value: "true", meeting: "33333333-3333-4333-8333-333333333333" }] }), ["route-meeting"]);
  assert.deepEqual(codes({ ...base, routes: [{ field: "past.vip", op: "is", value: "true", meeting: ENT }] }), ["route-gone"]);
  assert.deepEqual(codes({ ...base, meeting: "33333333-3333-4333-8333-333333333333" }), ["meeting-gone"]);
  assert.deepEqual(codes({ kind: "thanks", always: { email: true, to: [] } }), ["always-email"]);
  const later = PAGE.replace('<div data-cl-step data-cl-show-if="locations &lt; 5">', '<div data-cl-step data-cl-show-if="site == &quot;x&quot;">');
  assert.deepEqual(codes(base, later), ["show-if-later"], "a page shown by its own question never shows");
  const inner = PAGE.replace('<label for="n">Notes</label>', '<label for="n" data-cl-show-if="site == &quot;x&quot;">Notes</label>');
  assert.ok(codes(base, inner).includes("show-if-later"), "a part shown by a question on a later page");
  const gone = PAGE.replace('<input id="l" name="locations" type="number">', "");
  assert.ok(codes(base, gone).includes("show-if-gone"), "a page shown by a deleted question");
});

test("past fills: read once, only when a rule tests one, with this form and this send left out", async () => {
  resetNewer();
  const body = emptyBody();
  const raw = { contact: { id: "c1", email: "a@acme.com", email_clean: "a@acme.com", email_class: "work", fields: {} }, domain: "acme.com", owner: { user: null, crm: null }, company: null, submission: { id: "s9", form_id: "f1", values: {}, hidden: {} }, recent: 0, reps: {}, counts: {}, lists: { allow: [], block: [] }, more: {} };
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const rpc: Rpc = async (fn, args) => {
    calls.push({ fn, args });
    if (fn === "routing_facts") return { data: raw, error: null };
    if (fn === "routing_past") return { data: { sent_form: true, has_meeting: false, days_since_booked: 12 }, error: null };
    return { data: null, error: null };
  };
  const plain = await readFacts(rpc, { ws: "w", contact: "c1", key: null, body, reason: "form" });
  assert.ok(plain && "facts" in plain);
  assert.equal(calls.some((c) => c.fn === "routing_past"), false, "no past rule, no extra read");
  const rule: Rule = { id: "r1", name: "Again", match: "all", conds: [{ field: "past.sent_form", op: "is", value: "true" }], queue: "q1" };
  body.rules = { ...body.rules, on: true, list: [rule] };
  const read = await readFacts(rpc, { ws: "w", contact: "c1", key: null, body, reason: "form" });
  assert.ok(read && "facts" in read);
  assert.deepEqual(calls.find((c) => c.fn === "routing_past")!.args, { p_ws: "w", p_contact: "c1", p_email: "a@acme.com", p_form: "f1", p_skip: "s9" });
  assert.deepEqual([read.facts.values["past.sent_form"], read.facts.values["past.has_meeting"], read.facts.values["past.days_since_booked"]], ["true", "false", 12]);
  assert.equal(ruleMatches(rule, read.facts.values, [], "v2").ok, true);
});

test("a past fill that can't be read is unknown, so no rule on it holds by mistake (missing function, a failed read, a reset)", async () => {
  const rules: Rule[] = [
    { id: "a", name: "a", match: "all", conds: [{ field: "past.sent_form", op: "is", value: "false" }], queue: "q" },
    { id: "b", name: "b", match: "all", conds: [{ field: "past.days_since_booked", op: "lte", value: 30 }], queue: "q" },
    { id: "c", name: "c", match: "all", conds: [{ field: "past.has_meeting", op: "is", value: "false" }], queue: "q" },
  ];
  const cases: Rpc[] = [
    async () => ({ data: null, error: { message: "Could not find the function public.routing_past", code: "PGRST202" } as never }),
    async () => ({ data: null, error: { message: "canceling statement due to statement timeout" } as never }),
    async () => Promise.reject(new Error("connection reset")),
    async () => ({ data: "garbage", error: null }),
  ];
  for (const rpc of cases) {
    resetNewer();
    const v = await readPast(rpc, { ws: "w", contact: "c1", email: null, form: "f1", skip: "s1" });
    assert.deepEqual(v, { "past.sent_form": null, "past.has_meeting": null, "past.days_since_booked": null });
    for (const r of rules) assert.equal(ruleMatches(r, v, [], "v2").ok, false, `${r.id} must not hold on an unknown past fill`);
  }
  // Never booked: the days are unknown, so "booked in the last 30 days" doesn't hold, and "has never booked" does.
  resetNewer();
  const never = await readPast(async () => ({ data: { sent_form: false, has_meeting: false, days_since_booked: null }, error: null }), { ws: "w", contact: null, email: "a@acme.com", form: null, skip: null });
  assert.equal(ruleMatches(rules[1]!, never, [], "v2").ok, false);
  assert.equal(ruleMatches({ ...rules[1]!, conds: [{ field: "past.days_since_booked", op: "empty" }] }, never, [], "v2").ok, true);
  assert.deepEqual(await readPast(async () => assert.fail("no read without a person"), { ws: "w", contact: null, email: null, form: null, skip: null }), { "past.sent_form": null, "past.has_meeting": null, "past.days_since_booked": null });
});

test("a Dynamic booking page reads past fills by the guest's email and routes on them", () => {
  const t = {
    hosts: [{ user_id: "u1" }, { user_id: "u2" }],
    settings: { dynamic: { rules: [{ id: "r", conds: [{ field: "past.has_meeting", op: "is" as const, value: "true" }], to: { kind: "user" as const, id: "u2" } }], otherwise: { kind: "user" as const, id: "u1" } } },
  };
  const qsB = routeQuestions(t as never, BASE_FIELDS);
  assert.deepEqual(qsB.map((x) => x.key), ["email"], "a past fill is never asked; the email is");
  assert.deepEqual(dynamicHosts(t as never, routeValues({ email: "a@acme.com" }, qsB, undefined, { "past.has_meeting": "true" }), {}), ["u2"]);
  assert.deepEqual(dynamicHosts(t as never, routeValues({ email: "a@acme.com" }, qsB, undefined, { "past.has_meeting": null }), {}), ["u1"], "unknown goes to Otherwise");
  assert.deepEqual(routeValues({ "past.has_meeting": "true" }, qsB), {}, "a guest can't type their own past fill");
});

test("rules read in plain words: past fills, Who books it, and each route", () => {
  const w = (c: Parameters<typeof condWords>[0]) => condWords(c, BASE_FIELDS, []);
  assert.equal(w({ field: "past.sent_form", op: "is", value: "true" }), "has sent this form before");
  assert.equal(w({ field: "past.has_meeting", op: "is", value: "false" }), "has no meeting booked");
  assert.equal(w({ field: "past.days_since_booked", op: "lte", value: 30 }), "booked in the last 30 days");
  const facts = {
    fields: [...BASE_FIELDS, { key: "answer.q.l", label: "Locations", group: "Form answers" as const, type: "number" as const }],
    teams: [{ name: "Enterprise", keys: ["t_ent"] }, { name: "All reps", keys: ["q_everyone"] }],
    people: [{ id: "u1", name: "Ana Diaz" }],
  };
  const dyn = { hosts: [{ user_id: "u1" }], settings: { dynamic: { rules: [{ id: "r", conds: [{ field: "answer.q.l", op: "gte" as const, value: 50 }], to: { kind: "team" as const, id: "t_ent" } }], otherwise: { kind: "team" as const, id: "q_everyone" } } } };
  assert.equal(whoBooks(dyn, facts), "Locations is at least 50 → Enterprise, otherwise anyone on the team");
  assert.equal(whoBooks({ hosts: [{ user_id: "u1" }], settings: {} }, facts), "Ana Diaz");
  assert.equal(whoBooks({ ...dyn, settings: { dynamic: { rules: [], otherwise: { kind: "team", id: "t_gone" } } } }, facts), "Anyone on a removed team");
  assert.equal(routeWords({ field: "locations", op: "between", value: [1, 5], meeting: ENT }, q("locations"), "Locations"), "Locations is between 1 and 5");
  assert.equal(routeWords({ field: "plan", op: "one_of", value: ["team", "ent"], meeting: ENT }, q("plan"), "Plan"), "Plan is Team or Enterprise");
  assert.equal(routeWords({ field: "past.days_since_booked", op: "lte", value: 7, meeting: ENT }, undefined, ""), "Booked in the last 7 days");
});

test("an older policy never takes a past fill it couldn't read as an answer, even for 'is not'", () => {
  const rule: Rule = { id: "x", name: "x", match: "all", conds: [{ field: "past.days_since_booked", op: "is_not", value: 5 }], queue: "q" };
  assert.equal(ruleMatches(rule, { "past.days_since_booked": null }, [], "v1").ok, false);
  assert.equal(ruleMatches(rule, { "past.days_since_booked": 9 }, [], "v1").ok, true);
  const old: Rule = { ...rule, conds: [{ field: "lead.country", op: "is_not", value: "US" }] };
  assert.equal(ruleMatches(old, {}, [], "v1").ok, true, "other fields run as they always did");
});

test("the team alert: the last place it changed wins, and Settings' subject stays", () => {
  const settings = { on: true, to: ["ops@acme.com"], subject: "New lead: {{name}}", answers: false, slack: false };
  const studio = { on: true, to: ["sam@acme.com"], subject: "New submission: {{form}} from {{name}}", answers: true, slack: true };
  const was = { email: true, to: ["sam@acme.com"], slack: true };
  assert.deepEqual(teamAlert(settings, studio, was, was), settings, "Always do untouched: Settings' change stays");
  assert.deepEqual(teamAlert(settings, studio, { email: true, to: ["sam@acme.com", "kim@acme.com"], slack: true }, was), { ...settings, to: ["sam@acme.com"], slack: true }, "changed here: the change wins, the subject stays");
  assert.deepEqual(teamAlert(settings, undefined, undefined, undefined), settings, "no Always do: the alert stays");
  assert.deepEqual(teamAlert(undefined, studio, was, undefined), studio);
  assert.deepEqual(alwaysOf(settings), { email: true, to: ["ops@acme.com"], slack: false });
  assert.deepEqual(alwaysOf({ on: false, to: ["ops@acme.com"], slack: true }), { email: false, to: ["ops@acme.com"], slack: false });
});
