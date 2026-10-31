// What the Routing screens show and check (src/lib/routing/screenModel.ts; docs/routing-workflow.md Sections 4, 7, 11,
// 16-18): state labels, rule rows and their field-level errors (P03, P04), AND/OR (P05), reordering (P06), the
// at-most comparison on numbers and ranges, scope following destinations, a migrated policy on the spec's rules, the
// publish review's change list, the tester's trace in words, the release fingerprint and Activity's badges.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BASE_FIELDS, holds } from "../src/lib/router/conditions.ts";
import { emptyBody, type Rule, type RouterBody } from "../src/lib/router/types.ts";
import { evaluate } from "../src/lib/routing/evaluate.ts";
import {
  assignmentBadge,
  bookingBadge,
  changesBetween,
  condSummary,
  hasChanges,
  newCond,
  policyState,
  releaseFingerprint,
  releaseSources,
  ruleDest,
  ruleProblem,
  semanticsChanges,
  toV2,
  traceWords,
  withRuleDest,
  withScope,
  type SourceRow,
} from "../src/lib/routing/screenModel.ts";
import { ANA, KAI, maya, policy, VIN } from "./fixtures/routingSpec.ts";

const names = { people: { [ANA]: "Ana Silva", [VIN]: "Vincent Nguyen", [KAI]: "Kai Ito" }, teams: { eus: "Enterprise US", eg: "Enterprise global", gs: "General sales", vn: "Vietnam sales" } };
const row = (o: Partial<Parameters<typeof policyState>[0]> = {}) => ({ archived: false, active_version: 3, draft: null, live: policy(), draft_name: null, staged: 0, live_sources: 3, ...o });

test("policy state labels (Section 4): Draft, Published vN, draft changes, not connected, Archived", () => {
  assert.equal(policyState(row({ active_version: null, live: null, draft: policy() })).label, "Draft");
  assert.equal(policyState(row()).label, "Published v3");
  assert.equal(policyState(row({ draft: policy() })).label, "Published v3", "a draft equal to live is no change");
  const moved = policy();
  moved.rules.list.reverse();
  assert.equal(policyState(row({ draft: moved })).label, "Published v3 · draft changes");
  assert.equal(policyState(row({ draft_name: "EU sales" })).label, "Published v3 · draft changes", "a staged rename");
  assert.equal(policyState(row({ staged: 1 })).label, "Published v3 · draft changes", "a staged connection is never shown as live");
  assert.equal(policyState(row({ live_sources: 0 })).label, "Published v3 · not connected");
  assert.equal(policyState(row({ archived: true })).label, "Archived");
  assert.equal(hasChanges({ draft: null, live: policy(), draft_name: null, staged: 0 }), false);
});

test("P03 P04 an incomplete rule is an error on its row and never a catch-all; zero conditions is an error", () => {
  const f = BASE_FIELDS.find((x) => x.key === "lead.country")!;
  const r: Rule = { id: "r_new", name: "Germany", match: "all", conds: [newCond(f)], queue: "gs" };
  assert.equal(ruleProblem(r, BASE_FIELDS), "A condition has no value");
  assert.equal(holds(r.conds[0]!, "DE", [], "v2"), false, "no value never matches");
  const b = policy();
  b.rules.list.unshift(r);
  const ev = evaluate(b, maya({ country: "DE", employees: 50 }));
  assert.equal(ev.trace.rules.matched, null, "the incomplete rule didn't become a catch-all");
  assert.equal(ruleProblem({ ...r, conds: [] }, BASE_FIELDS), "Add at least one condition");
  assert.equal(ruleProblem({ ...r, name: " " }, BASE_FIELDS), "Add a name");
  assert.equal(ruleProblem({ ...r, conds: [{ field: "company.employees", op: "gte", value: "lots" }] }, BASE_FIELDS), "Employees must be a number");
  assert.equal(ruleProblem({ ...r, conds: [{ field: "company.employees", op: "gte", value: 0.5 }] }, BASE_FIELDS), "Employees must be a whole number");
  assert.equal(ruleProblem({ ...r, conds: [{ field: "lead.country", op: "one_of", value: ["DE"] }], queue: "" }, BASE_FIELDS), "Choose a destination");
  assert.equal(ruleProblem({ ...r, conds: [{ field: "lead.country", op: "one_of", value: ["DE"] }] }, BASE_FIELDS, new Set(["eus"])), "The team is gone");
  assert.equal(ruleProblem({ ...r, conds: [{ field: "lead.country", op: "empty" }] }, BASE_FIELDS), null, "is unknown needs no value");
});

test("P05 AND to OR changes the summary and the match; P06 Vietnam above enterprise picks Vietnam for 800 employees", () => {
  const b = policy();
  const us = b.rules.list[0]!;
  assert.equal(condSummary(us, BASE_FIELDS), "Country = United States AND Employees ≥ 201");
  const any = { ...us, match: "any" as const };
  assert.equal(condSummary(any, BASE_FIELDS), "Country = United States OR Employees ≥ 201");
  assert.equal(evaluate(b, maya({ country: "DE", employees: 800 })).trace.rules.matched?.name, "Other enterprise");
  const or = { ...b, rules: { ...b.rules, list: [any, ...b.rules.list.slice(1)] } };
  assert.equal(evaluate(or, maya({ country: "DE", employees: 800 })).trace.rules.matched?.name, "US enterprise");
  assert.equal(evaluate(b, maya({ country: "VN", employees: 800 })).trace.rules.matched?.name, "Other enterprise", "R05: order decides");
  const moved = { ...b, rules: { ...b.rules, list: [b.rules.list[2]!, b.rules.list[0]!, b.rules.list[1]!] } };
  const ev = evaluate(moved, maya({ country: "VN", employees: 800 }));
  assert.equal(ev.trace.rules.matched?.name, "Vietnam");
  assert.equal(ev.trace.assignment.recipient, VIN);
  assert.deepEqual(ev.trace.rules.notEvaluated.map((r) => r.name), ["US enterprise", "Other enterprise"]);
});

test("at most: a number, a whole range under it, and unknown is false", () => {
  const c = { field: "company.employees", op: "lte" as const, value: 200 };
  assert.equal(holds(c, 150, [], "v2"), true);
  assert.equal(holds(c, 201, [], "v2"), false);
  assert.equal(holds(c, "51-200", [], "v2"), true, "the whole range is at most 200");
  assert.equal(holds(c, "51-500", [], "v2"), false);
  assert.equal(holds(c, null, [], "v2"), false);
  assert.equal(holds(c, "about 50", [], "v2"), false, "text that isn't a number is unknown");
  assert.equal(holds(c, "51-200", [], "v1"), true, "v1 reads the low end");
  assert.equal(condSummary({ id: "r", name: "Small", match: "all", conds: [c], queue: "gs" }, BASE_FIELDS), "Employees ≤ 200");
});

test("destinations and scope: a team, a person or review; the scope is what the policy can send to", () => {
  const r: Rule = { id: "r", name: "X", match: "all", conds: [], queue: "eus" };
  assert.deepEqual(ruleDest(r), { kind: "team", key: "eus" });
  const toVin = withRuleDest(r, { kind: "person", id: VIN });
  assert.deepEqual([toVin.then, toVin.user, toVin.queue], ["user", VIN, ""]);
  assert.deepEqual(ruleDest(withRuleDest(toVin, { kind: "review" })), { kind: "review" });
  assert.deepEqual(ruleDest(withRuleDest(toVin, { kind: "team", key: "vn" })), { kind: "team", key: "vn" });
  const b = policy();
  b.rules.list[0] = withRuleDest(b.rules.list[0]!, { kind: "person", id: KAI });
  const s = withScope(b);
  assert.deepEqual(s.scope, { everyone: false, people: [KAI], teams: ["eg", "vn", "gs"] });
  // A rule with no destination yet narrows nothing; a migrated "every member" scope is kept.
  assert.deepEqual(withScope({ ...b, scope: { everyone: true, people: [], teams: [] } }).scope?.everyone, true);
});

test("a migrated v1 policy opens on the spec's rules; publishing it lists what changes", () => {
  const v1: RouterBody = { ...emptyBody(), queues: [{ id: "eus", name: "Enterprise US", method: "rr", strict: false, hoursOnly: false, members: [{ user: ANA, weight: 1 }] }], fallback: { kind: "queue", id: "eus" } };
  const v2 = toV2(v1, { reviewer: VIN, teamKeys: new Set(["eus"]) });
  assert.equal(v2.v, 2);
  assert.deepEqual(v2.queues, [], "the team is referenced, not copied");
  assert.deepEqual(v2.scope, { everyone: true, people: [], teams: [] });
  assert.deepEqual(v2.ownership?.order, ["company", "contact"]);
  assert.equal(v2.review?.owner, VIN);
  assert.deepEqual(toV2(v2, { reviewer: ANA, teamKeys: new Set() }), v2, "a v2 policy is left as it is");
  assert.ok(semanticsChanges(v1, v2).length >= 6);
  assert.deepEqual(semanticsChanges(policy(), policy()), []);
  assert.ok(changesBetween(v1, v2, { names, fields: BASE_FIELDS }).includes("Moves to the new routing rules"));
});

test("the publish review's changes: moves, adds, removes, renames, Everyone else, backup, ownership and sources", () => {
  const live = policy();
  const d = policy();
  d.rules.list = [d.rules.list[2]!, { ...d.rules.list[0]!, name: "US big" }, { id: "r_new", name: "Germany", match: "all", conds: [{ field: "lead.country", op: "one_of", value: ["DE"] }], queue: "gs" }];
  d.fallback = { kind: "user", id: VIN };
  d.backup = { kind: "queue", id: "gs" };
  d.ownership = { order: ["contact", "company"], capBlocksNew: true };
  d.spam = { ...d.spam, on: false };
  const out = changesBetween(live, d, { names, fields: BASE_FIELDS, rename: "Inbound EU", sources: [{ name: "Contact sales", text: "disconnects" }] });
  assert.deepEqual(out, [
    "Renamed to Inbound EU",
    "Contact sales: disconnects",
    "Spam check turned off",
    "Contact owner is kept first",
    "Moved US big to position 2",
    "Renamed rule US enterprise to US big",
    "Removed rule Other enterprise",
    "Moved Vietnam to position 1",
    "Added rule Germany",
    "Everyone else now goes to Vincent Nguyen",
    "Backup is now General sales",
  ]);
});

test("the tester's trace in words: seven stages, later rules faint, retention, review and the visitor's outcome", () => {
  const b = policy();
  const ev = evaluate(b, maya(), { source: { outcome: "assign_and_calendar", meetingTypeId: "m", slots: true } });
  const w = traceWords(ev.trace, { names, fields: BASE_FIELDS, reviewer: VIN, meetingName: "Intro call · 30 min", test: true, email: "maya@globex.com" });
  assert.deepEqual(w.map((x) => x.k), ["Input", "Checks", "Ownership", "Rules", "Distribution", "Assignment", "Visitor sees"]);
  assert.equal(w[0]!.v[0]!.t, "Work email maya@globex.com");
  assert.deepEqual(w[3]!.v.map((x) => [x.t, !!x.faint]), [["US enterprise: matched", false], ["Other enterprise: not evaluated", true], ["Vietnam: not evaluated", true]]);
  assert.equal(w[4]!.v[0]!.t, "Enterprise US: Ana Silva is next");
  assert.equal(w[5]!.v[0]!.t, "Would newly assign Ana Silva. Quota +1, team turn advances");
  assert.equal(w[6]!.v[0]!.t, "Shows Ana Silva's calendar for Intro call · 30 min");
  const kept = traceWords(evaluate(b, maya({ owner: VIN })).trace, { names, fields: BASE_FIELDS, reviewer: VIN, test: true });
  assert.equal(kept[2]!.v[1]!.t, "Contact owner Vincent Nguyen: selected");
  assert.equal(kept[5]!.v[0]!.t, "Would retain Vincent Nguyen. No new quota, no team turn");
  const held = traceWords(evaluate(b, maya({ lead: { ...maya().lead, disposable: true } })).trace, { names, fields: BASE_FIELDS, reviewer: VIN, test: true });
  assert.equal(held[1]!.v[0]!.t, "Sent to Spam");
  assert.equal(held[5]!.v[0]!.t, "No new assignment; needs review by Vincent Nguyen");
  const real = traceWords(ev.trace, { names, fields: BASE_FIELDS, reviewer: VIN, test: false });
  assert.equal(real[5]!.v[0]!.t, "Assigned to Ana Silva. Quota +1, team turn advances", "a real run never says Would");
});

test("the release fingerprint follows rules, teams and source settings, never a rename", () => {
  const src = (o: Partial<SourceRow> = {}): SourceRow => ({ id: "s1", kind: "form", form_id: "f1", name: "Demo request", enabled: true, policy_id: "p1", follows_default: false, outcome: "assign_only", meeting_type_id: null, mappings: [], no_slots: {}, live_revision: 1, draft: null, draft_revision: 0, ...o });
  const b = policy();
  const a = releaseFingerprint(b, {}, releaseSources([src()], "p1").serving);
  assert.equal(releaseFingerprint(b, {}, releaseSources([src({ name: "Renamed form" })], "p1").serving), a);
  const staged = releaseSources([src({ draft: { policy_id: "p1", outcome: "assign_and_calendar", meeting_type_id: "m1", enabled: true }, draft_revision: 2 })], "p1");
  assert.notEqual(releaseFingerprint(b, {}, staged.serving), a);
  assert.deepEqual(staged.staged, [{ id: "s1", revision: 2 }]);
  const elsewhere = releaseSources([src({ draft: { policy_id: "p2", enabled: true } })], "p1");
  assert.equal(elsewhere.serving.length, 0, "a source moving to another policy leaves this release");
  const moved = policy();
  moved.rules.list.reverse();
  assert.notEqual(releaseFingerprint(moved, {}, releaseSources([src()], "p1").serving), a);
});

test("Activity's badges keep assignment and booking apart", () => {
  assert.deepEqual(assignmentBadge("assigned", "retained", "owner"), { label: "Retained", tone: "green" });
  assert.deepEqual(assignmentBadge("held_for_review", "none", "held"), { label: "Held for review", tone: "amber" });
  assert.deepEqual(assignmentBadge(null, null, "unassigned"), { label: "Needs review", tone: "amber" });
  assert.deepEqual(bookingBadge("unavailable", "calendar_disconnected"), { label: "Calendar disconnected", tone: "red" });
  assert.deepEqual(bookingBadge("unavailable", "no_slots"), { label: "No slots", tone: "amber" });
  assert.deepEqual(bookingBadge("pending_confirmation", null), { label: "Pending confirmation", tone: "amber" });
  assert.deepEqual(bookingBadge(null, null), { label: "Not requested", tone: "gray" });
});
