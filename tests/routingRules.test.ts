// Routing in On submission (docs/on-submission.md): named rules with several conditions joined by and or or, who takes
// the meeting, Individual or Routing, the checks before any rule, and "can never run". The flaky cases: an "or" rule
// over a Dynamic meeting, a person or team that's gone, overlaps the check can't prove (it must stay quiet, never
// name a rule that does run), and rules saved before rules had names.
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkForm, emptyForm } from "../src/lib/forms/schema.ts";
import { emptyBody, type RouterBody } from "../src/lib/router/types.ts";
import { checkStudioPage } from "../src/lib/studio/check.ts";
import { cleanPage, checkPage, isRouting, pageForm, type PageAfter } from "../src/lib/studio/page.ts";
import { cleanRoute, neverRuns, routeIndex, ruleHolds, ruleWords, sampleFor, type StudioRoute } from "../src/lib/studio/routes.ts";
import { compileRouting, type MeetingLite } from "../src/lib/routing/compile.ts";
import { cleanBody } from "../src/lib/router/check.ts";

const DEMO = "11111111-1111-4111-8111-111111111111";
const ENT = "22222222-2222-4222-8222-222222222222";
const MEETINGS = [
  { id: DEMO, name: "Demo" },
  { id: ENT, name: "Enterprise" },
];
const PAGE = `<form><div data-cl-step><label for="e">Email</label><input id="e" name="email" type="email" required>
<label for="z">Team size</label><input id="z" name="size" type="number">
<fieldset><legend>Country</legend><label><input type="radio" name="country" value="us"> US</label><label><input type="radio" name="country" value="ca"> Canada</label><label><input type="radio" name="country" value="vn"> Vietnam</label></fieldset>
<button type="submit">Send</button></div></form>
<section data-cl-thanks hidden><h2>Thanks</h2><div data-cl-book id="book"></div></section>`;
const qs = cleanPage(PAGE).questions;

const big: StudioRoute = { name: "Big teams", field: "size", op: "gte", value: "51", meeting: ENT };
const na: StudioRoute = { name: "North America", field: "country", op: "one_of", value: ["us"], match: "any", more: [{ field: "country", op: "one_of", value: ["ca"] }], meeting: ENT };

test("a rule holds on all its conditions, or any with or; first match wins", () => {
  const both: StudioRoute = { field: "size", op: "gte", value: "51", more: [{ field: "country", op: "one_of", value: ["us"] }], meeting: ENT };
  assert.equal(ruleHolds(both, { size: "80", country: "us" }, qs), true);
  assert.equal(ruleHolds(both, { size: "80", country: "vn" }, qs), false, "and needs both");
  assert.equal(ruleHolds(na, { country: "ca" }, qs), true, "or needs one");
  assert.equal(ruleHolds(na, { country: "vn" }, qs), false);
  assert.equal(routeIndex([big, na], { size: "80", country: "ca" }, qs), 0);
  assert.equal(routeIndex([big, na], { size: "8", country: "ca" }, qs), 1);
  assert.equal(routeIndex([big, na], { size: "8", country: "vn" }, qs), -1, "Otherwise");
  assert.equal(ruleWords(both, (n) => qs.find((q) => q.name === n), (f) => qs.find((q) => q.name === f)?.label ?? f), "Team size is at least 51 and Country is US");
});

test("rules keep their name, or, more conditions and who takes it; old rows still read", () => {
  const r = cleanRoute({ ...na, with: { kind: "team", id: "q_ent" }, name: "  North America  " })!;
  assert.equal(r.name, "North America");
  assert.equal(r.match, "any");
  assert.equal(r.more!.length, 1);
  assert.deepEqual(r.with, { kind: "team", id: "q_ent" });
  assert.equal(cleanRoute({ ...big, with: { kind: "boss", id: "x" } })!.with, undefined, "an unknown kind is dropped");
  assert.equal(cleanRoute({ ...big, match: "any" })!.match, undefined, "or with one condition is all");
  assert.deepEqual(cleanRoute({ field: "size", value: "5", meeting: ENT }), { field: "size", op: "is", value: "5", meeting: ENT });
});

test("can never run: named only when an earlier rule surely catches every lead", () => {
  const r = (field: string, op: StudioRoute["op"], value: StudioRoute["value"], extra: Partial<StudioRoute> = {}): StudioRoute => ({ field, op, value, meeting: ENT, ...extra });
  assert.deepEqual(neverRuns([r("size", "gte", "51"), r("size", "gte", "100")], qs), [-1, 0], "51 or more catches 100 or more");
  assert.deepEqual(neverRuns([r("size", "gte", "100"), r("size", "gte", "51")], qs), [-1, -1], "in this order both run");
  assert.deepEqual(neverRuns([r("size", "gte", "10"), r("size", "lte", "100")], qs), [-1, -1], "overlap only: a size of 3 still reaches rule 2");
  assert.deepEqual(neverRuns([r("size", "gt", "50"), r("size", "gte", "50")], qs), [-1, -1], "50 itself reaches rule 2");
  assert.deepEqual(neverRuns([r("size", "gte", "50"), r("size", "between", ["60", "90"])], qs), [-1, 0]);
  assert.deepEqual(neverRuns([r("size", "gte", "51"), r("size", "gte", "100", { more: [{ field: "country", op: "one_of", value: ["us"] }] })], qs), [-1, 0], "narrower with and");
  assert.deepEqual(neverRuns([r("size", "gte", "51", { more: [{ field: "country", op: "one_of", value: ["us"] }] }), r("size", "gte", "100")], qs), [-1, -1], "the earlier rule asks more");
  assert.deepEqual(neverRuns([r("country", "one_of", ["us", "ca"]), r("country", "one_of", ["us"])], qs), [-1, 0]);
  assert.deepEqual(neverRuns([r("country", "one_of", ["us"]), na], qs), [-1, -1], "Canada still reaches the or rule");
  assert.deepEqual(neverRuns([r("country", "one_of", ["us", "ca"]), na], qs), [-1, 0], "every branch of the or rule is caught");
  assert.deepEqual(neverRuns([na, r("country", "one_of", ["ca"])], qs), [-1, 0], "an or rule catches its own branch");
  assert.deepEqual(neverRuns([r("size", "filled", undefined), r("size", "gte", "5")], qs), [-1, 0]);
  assert.deepEqual(neverRuns([r("email", "contains", "acme"), r("email", "contains", "acme.com")], qs), [-1, -1], "text it can't prove stays quiet");
});

test("Preview as: a rule's sample lead meets it, and runs through every rule like a live lead", () => {
  const s = sampleFor(big, qs);
  assert.equal(ruleHolds(big, s.values, qs, s.past), true);
  assert.equal(routeIndex([{ ...big, value: "10" }, big], s.values, qs, s.past), 0, "an earlier rule catches it first");
  const gt = sampleFor({ field: "size", op: "gt", value: "50", meeting: ENT }, qs);
  assert.equal(gt.values.size, "51");
  const not = sampleFor({ field: "country", op: "not_one_of", value: ["us"], meeting: ENT }, qs);
  assert.equal(not.values.country, "ca");
  const past = sampleFor({ field: "past.has_meeting", op: "is", value: "true", meeting: ENT }, qs);
  assert.deepEqual(past.past, { "past.has_meeting": "true" });
});

test("Individual books everyone into the meeting; Routing compiles every rule with its or, name and who", () => {
  const routes: StudioRoute[] = [{ ...na, with: { kind: "team", id: "q_ent" } }, big];
  const sched = (after: PageAfter) => (pageForm({ html: PAGE, css: "", brand: "", after }).form.after as { schedule: { routes: { id: string; match?: string; name?: string; with?: unknown; conds: unknown[] }[]; none?: string; before?: unknown } }).schedule;
  assert.deepEqual(sched({ kind: "meeting", meeting: DEMO, mode: "one", routes }).routes, [], "Individual: rules kept on the page, none compiled");
  const s = sched({ kind: "meeting", meeting: DEMO, mode: "routing", routes, none: "later", before: { spam: true, keep: false } });
  assert.equal(s.routes.length, 2);
  assert.equal(s.routes[0]!.match, "any");
  assert.equal(s.routes[0]!.name, "North America");
  assert.deepEqual(s.routes[0]!.with, { kind: "team", id: "q_ent" });
  assert.equal(s.routes[0]!.conds.length, 2);
  assert.equal(s.none, "later");
  assert.deepEqual(s.before, { spam: true, keep: false });
  assert.equal(sched({ kind: "meeting", meeting: DEMO, routes: [big] }).routes.length, 1, "rules saved before Individual and Routing still route");
  assert.equal(isRouting({ routes: [big] }), true);
  assert.equal(isRouting({ mode: "one", routes: [big] }), false);
  const kept = checkPage({ html: PAGE, after: { kind: "meeting", mode: "routing", none: "later", before: { spam: false, keep: true }, routes } }, new Set())!.after!;
  assert.equal(kept.mode, "routing");
  assert.equal(kept.none, "later");
  assert.deepEqual(kept.before, { spam: false, keep: true });
  assert.equal(kept.routes![0]!.match, "any");
});

test("the form check names a rule that can never run, and leaves Individual's saved rules alone", () => {
  const warn = (after: PageAfter) => checkStudioPage({ html: PAGE, after, meetings: MEETINGS }).filter((i) => i.code === "route-never").map((i) => i.text);
  const shadowed: StudioRoute[] = [big, { ...big, name: "Largest teams", value: "100" }];
  assert.deepEqual(warn({ kind: "meeting", meeting: DEMO, mode: "routing", routes: shadowed }), ["Rule 2, Largest teams, can never run: rule 1 catches every lead it would. Move it up or narrow rule 1."]);
  assert.deepEqual(warn({ kind: "meeting", meeting: DEMO, mode: "routing", routes: [...shadowed].reverse() }), []);
  assert.deepEqual(warn({ kind: "meeting", meeting: DEMO, mode: "one", routes: shadowed }), []);
  const errs = checkStudioPage({ html: PAGE, after: { kind: "meeting", meeting: DEMO, mode: "routing", routes: [{ ...big, more: [{ field: "gone", op: "is", value: "x" }] }] }, meetings: MEETINGS }).filter((i) => i.level === "error").map((i) => i.code);
  assert.deepEqual(errs, ["route-gone"], "a second condition on a gone question is caught too");
});

const LEE = "0192f3a1-0000-7000-8000-0000000000a1";
const PRIYA = "0192f3a1-0000-7000-8000-0000000000a2";
const TEAMS = new Set(["q_sales", "q_ent"]);
const base: RouterBody = { ...emptyBody(), v: 2 };
const intro: MeetingLite = { id: "m_intro", name: "Intro call", active: true, hosts: [{ user_id: LEE }], settings: {} };
const sales: MeetingLite = {
  id: "m_sales",
  name: "Sales demo",
  active: true,
  hosts: [{ user_id: LEE }, { user_id: PRIYA }],
  settings: { dynamic: { rules: [{ id: "uk", conds: [{ field: "lead.country", op: "is", value: "GB" }], to: { kind: "user", id: PRIYA } }], otherwise: { kind: "team", id: "q_sales" } } },
};
const US = { field: "lead.country", op: "is" as const, value: "US" };
const CA = { field: "lead.country", op: "is" as const, value: "CA" };

test("an or rule over a Dynamic meeting is one path per condition, each with the meeting's own rules, in order", () => {
  const { body, problems } = compileRouting(base, { def: "m_intro", routes: [{ id: "r1", name: "North America", match: "any", conds: [US, CA], meet: "m_sales" }], types: [intro, sales], teamKeys: TEAMS });
  assert.deepEqual(problems, []);
  assert.deepEqual(body.rules.list.map((r) => r.id), ["f_r1_1_uk", "f_r1_1", "f_r1_2_uk", "f_r1_2"]);
  assert.deepEqual(body.rules.list[0]!.conds, [US, sales.settings.dynamic!.rules[0]!.conds[0]]);
  assert.deepEqual(body.rules.list[3]!.conds, [CA]);
  assert.ok(body.rules.list.every((r) => r.match === "all" && r.meet === "m_sales"));
  assert.equal(body.rules.list[1]!.name, "North America, Sales demo");
});

test("who takes it: a person or team booked straight, with or kept; a team that's gone never routes", () => {
  const one = compileRouting(base, { def: "m_intro", routes: [{ id: "r1", match: "any", conds: [US, CA], meet: "m_sales", with: { kind: "user", id: PRIYA } }], types: [intro, sales], teamKeys: TEAMS });
  assert.equal(one.body.rules.list.length, 1, "the meeting's own rules are skipped");
  assert.equal(one.body.rules.list[0]!.match, "any");
  assert.equal(one.body.rules.list[0]!.then, "user");
  assert.equal(one.body.rules.list[0]!.user, PRIYA);
  const team = compileRouting(base, { def: "m_intro", routes: [{ id: "r1", conds: [US], meet: "m_intro", with: { kind: "team", id: "q_ent" } }], types: [intro, sales], teamKeys: TEAMS });
  assert.equal(team.body.rules.list[0]!.queue, "q_ent");
  assert.equal(team.body.rules.list[0]!.book, undefined, "a team's distribution books one host");
  // Collective: the rule books everyone on its team, and a saved body keeps it.
  const all = compileRouting(base, { def: "m_intro", routes: [{ id: "r1", conds: [US], meet: "m_intro", with: { kind: "team", id: "q_ent", all: true } }], types: [intro, sales], teamKeys: TEAMS });
  assert.deepEqual([all.body.rules.list[0]!.queue, all.body.rules.list[0]!.book], ["q_ent", "all"]);
  const kept = cleanBody(JSON.parse(JSON.stringify(all.body)));
  assert.equal(kept.rules.list[0]!.book, "all");
  assert.deepEqual(cleanRoute({ ...big, with: { kind: "team", id: "q_ent", all: true } })!.with, { kind: "team", id: "q_ent", all: true });
  assert.deepEqual(cleanRoute({ ...big, with: { kind: "user", id: PRIYA, all: true } as never })!.with, { kind: "user", id: PRIYA }, "only a team books collectively");
  const gone = compileRouting(base, { def: "m_intro", routes: [{ id: "r1", name: "Big", conds: [US], meet: "m_intro", with: { kind: "team", id: "q_old" } }], types: [intro, sales], teamKeys: TEAMS });
  assert.deepEqual(gone.body.rules.list, []);
  assert.deepEqual(gone.problems, ["Big: its team is gone"]);
});

test("before any rule: the form's spam check and owner keeping, else the policy's own", () => {
  const on = { ...base, spam: { ...base.spam, on: true }, keep: { ...base.keep, on: true } };
  const off = compileRouting(on, { def: "m_intro", routes: [], types: [intro], teamKeys: TEAMS, before: { spam: false, keep: false } }).body;
  assert.equal(off.spam.on, false);
  assert.equal(off.keep.on, false);
  const left = compileRouting(on, { def: "m_intro", routes: [], types: [intro], teamKeys: TEAMS }).body;
  assert.equal(left.spam.on, true);
  assert.equal(left.keep.on, true);
});

test("the saved form keeps or, name, who and before any rule; a bad who is dropped", () => {
  const f = emptyForm();
  (f.after as Record<string, unknown>).schedule = {
    tool: "claritia",
    url: "",
    perOwner: false,
    meetingTypeId: DEMO,
    routes: [{ id: "r1", meet: ENT, match: "any", name: "North America", with: { kind: "team", id: "q_ent" }, conds: [US, CA] }, { id: "r2", meet: ENT, with: { kind: "x", id: "q" }, conds: [US] }],
    before: { spam: false, keep: true, extra: 1 },
  };
  const out = checkForm(f);
  assert.ok("form" in out, JSON.stringify("errors" in out ? out.errors : []));
  const s = out.form.after.schedule!;
  assert.deepEqual(s.routes![0], { id: "r1", meet: ENT, conds: [US, CA], match: "any", name: "North America", with: { kind: "team", id: "q_ent" } });
  assert.equal(s.routes![1]!.with, undefined);
  assert.deepEqual(s.before, { spam: false, keep: true });
});
