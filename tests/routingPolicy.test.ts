// Routing policies at the evaluator (docs/routing-workflow.md Sections 10 to 12, 21 and 26): the Section 26 fixtures
// through the one shared evaluator, for rule order and missing data (R01 to R15), existing ownership, scope and caps
// (O01 to O14), drafts that can't be published (P03 to P06), plus the v1 semantics every migrated body keeps.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanBody } from "../src/lib/router/check.ts";
import { holds, numberOrRange, ruleWords, BASE_FIELDS } from "../src/lib/router/conditions.ts";
import { decide, rotation } from "../src/lib/router/engine.ts";
import { explain } from "../src/lib/router/explain.ts";
import { emptyBody, specBody, type Cond, type RouterBody } from "../src/lib/router/types.ts";
import { evaluate, fingerprint } from "../src/lib/routing/evaluate.ts";
import { applyMappings, countryCode, mappingProblem } from "../src/lib/routing/mapping.ts";
import { validatePolicy } from "../src/lib/routing/validate.ts";
import { ANA, KAI, LEE, maya, NOW, policy, teams, VIN } from "./fixtures/routingSpec.ts";

const members = new Set([ANA, VIN, KAI, LEE]);
const ctx = () => ({ members, teams: teams() });
const ownerOf = (b: RouterBody, f: ReturnType<typeof maya>) => {
  const d = decide(b, f);
  return d.result.kind === "owner" ? d.result.user : d.result.kind;
};
const rulesStep = (b: RouterBody, f: ReturnType<typeof maya>) => decide(b, f).steps.find((s) => s.step === "rules") as Extract<ReturnType<typeof decide>["steps"][number], { step: "rules" }>;

// R: rule semantics, matching and data ---------------------------------------------------------------------------

test("R01 Maya (US, 800): US enterprise wins and Ana is suggested", () => {
  const e = evaluate(policy(), maya());
  assert.equal(e.trace.rules.matched?.name, "US enterprise");
  assert.equal(e.trace.distribution.suggested, ANA);
  assert.equal(e.trace.distribution.destination?.name, "Enterprise US");
  assert.deepEqual([e.state, e.effect], ["assigned", "new"]);
});

test("R02 Germany and 800: Other enterprise wins, Kai skipped for PTO, Ana suggested", () => {
  const e = evaluate(policy(), maya({ country: "DE" }));
  assert.equal(e.trace.rules.matched?.name, "Other enterprise");
  assert.deepEqual(e.trace.distribution.excluded, [{ user: KAI, reason: "out" }]);
  assert.equal(e.trace.distribution.suggested, ANA);
});

test("R03 Vietnam and 50: the Vietnam rule wins, Vincent suggested", () => {
  const e = evaluate(policy(), maya({ country: "VN", employees: 50 }));
  assert.equal(e.trace.rules.matched?.name, "Vietnam");
  assert.equal(e.trace.distribution.suggested, VIN);
});

test("R04 Germany and 50: Everyone else picks General sales, Vincent suggested", () => {
  const e = evaluate(policy(), maya({ country: "DE", employees: 50 }));
  assert.equal(e.trace.rules.matched, null);
  assert.equal(e.trace.rules.usedDefault, true);
  assert.equal(e.trace.distribution.destination?.name, "General sales");
  assert.equal(e.trace.distribution.suggested, VIN);
});

test("R05 Vietnam and 800 in the original order: Other enterprise wins before Vietnam, and the trace says so", () => {
  const e = evaluate(policy(), maya({ country: "VN" }));
  assert.equal(e.trace.rules.matched?.name, "Other enterprise");
  assert.deepEqual(e.trace.rules.evaluated.map((r) => [r.name, r.matched]), [["US enterprise", false], ["Other enterprise", true]]);
  assert.deepEqual(e.trace.rules.notEvaluated.map((r) => r.name), ["Vietnam"]);
  assert.equal(e.trace.distribution.suggested, ANA);
});

test("R06 country and employee count unknown: ordinary comparisons are false and the default is used", () => {
  const e = evaluate(policy(), maya({ country: null, employees: null }));
  assert.equal(e.trace.rules.matched, null);
  assert.equal(e.trace.distribution.suggested, VIN);
  assert.deepEqual(e.trace.input.missing.sort(), ["company.employees", "lead.country"]);
});

test("R07 country unknown and the rule is Country is not US: that condition is false", () => {
  const b = policy();
  b.rules.list.unshift({ id: "r_not_us", name: "Not US", match: "all", conds: [{ field: "lead.country", op: "not_one_of", value: ["US"] }], queue: "vn" });
  assert.notEqual(evaluate(b, maya({ country: null })).trace.rules.matched?.name, "Not US");
  assert.equal(holds({ field: "x", op: "is_not", value: "US" }, null, [], "v2"), false);
  assert.equal(holds({ field: "x", op: "not_one_of", value: ["US"] }, "", [], "v2"), false);
  assert.equal(holds({ field: "x", op: "not_one_of", value: ["US"] }, "DE", [], "v2"), true, "a known different country still matches");
});

test("R08 an explicit Country is unknown rule placed first matches a missing country", () => {
  const b = policy();
  b.rules.list.unshift({ id: "r_unknown", name: "No country", match: "all", conds: [{ field: "lead.country", op: "empty" }], queue: "vn" });
  assert.equal(evaluate(b, maya({ country: null })).trace.rules.matched?.name, "No country");
  assert.notEqual(evaluate(b, maya()).trace.rules.matched?.name, "No country");
});

test("R09 numbers compare as numbers, never as text", () => {
  const c: Cond = { field: "company.employees", op: "gte", value: 201 };
  for (const v of [800, "800", 1000, "1000", "1,000"]) assert.equal(holds(c, v, [], "v2"), true, String(v));
  for (const v of [200, "200", "99"]) assert.equal(holds(c, v, [], "v2"), false, String(v));
  assert.equal(evaluate(policy(), maya({ employees: "1000" })).trace.rules.matched?.name, "US enterprise");
});

test("R10 a 51-200 range never becomes a number: blocked as a mapping, held as an answer, compared only as a range", () => {
  assert.match(mappingProblem({ field: "f_size", target: "company.employees", type: "integer" }, { id: "f_size", type: "choice", label: "Company size" }) ?? "", /can't fill a whole number/);
  assert.equal(mappingProblem({ field: "f_size", target: "company.size", type: "range" }, { id: "f_size", type: "choice", label: "Company size" }), null);
  const m = applyMappings([{ field: "f_size", target: "company.employees", type: "integer" }], { f_size: "51-200" });
  assert.deepEqual(m.values, {}, "no invented midpoint");
  assert.deepEqual(m.issues, [{ code: "source_mapping_mismatch", field: "company.employees", detail: "integer" }]);
  const e = evaluate(policy(), maya({ employees: null, issues: m.issues }));
  assert.deepEqual([e.state, e.trace.checks.reason, e.trace.distribution.suggested], ["held_for_review", "source_mapping_mismatch", null]);
  assert.deepEqual(numberOrRange("51-200"), { lo: 51, hi: 200 });
  assert.equal(holds({ field: "company.size", op: "gte", value: 51 }, "51-200", [], "v2"), true, "the whole range is at least 51");
  assert.equal(holds({ field: "company.size", op: "gte", value: 100 }, "51-200", [], "v2"), false, "not all of 51-200 is at least 100");
  assert.equal(holds({ field: "company.size", op: "lt", value: 201 }, "51-200", [], "v2"), true);
  assert.equal(holds({ field: "company.size", op: "gte", value: 10 }, "about 50", [], "v2"), false, "text that isn't a number is unknown");
  assert.deepEqual(applyMappings([{ field: "c", target: "lead.country", type: "country" }], { c: "Viet Nam" }).values, { "lead.country": "VN" });
  assert.equal(countryCode("United States"), "US");
});

test("R11 the contact's own company link is used for ownership facts", () => {
  const e = evaluate(policy(), maya({ companyOwner: ANA, companyMatch: { kind: "linked", count: 1 } }));
  assert.equal(e.trace.input.company?.match, "linked");
  assert.deepEqual([e.trace.distribution.suggested, e.trace.ownership.candidates[0]?.outcome], [ANA, "picked"]);
});

test("R12 a free email with no trusted company: no company, no owner inferred", () => {
  const e = evaluate(policy(), maya({ company: null, companyMatch: { kind: "none", count: 0 } }));
  assert.equal(e.trace.input.company, null);
  assert.deepEqual(e.trace.ownership.candidates[0], { kind: "company", user: null, outcome: "none", reason: "no_company" });
  assert.equal(e.trace.rules.matched?.name, "US enterprise");
});

test("R13 several plausible companies: review with the reason, no account picked", () => {
  const e = evaluate(policy(), maya({ companyOwner: ANA, companyMatch: { kind: "ambiguous", count: 3 } }));
  assert.deepEqual([e.state, e.trace.checks.reason, e.trace.distribution.suggested], ["held_for_review", "multiple_companies", null]);
  assert.match(explain(e.decision, maya()).map((l) => l.parts.join("")).join(" "), /3 companies could be/);
});

test("R14 a winning rule followed by another matching rule: the later one is never evaluated", () => {
  const b = policy();
  b.rules.list.push({ id: "r_all_us", name: "All US", match: "all", conds: [{ field: "lead.country", op: "one_of", value: ["US"] }], queue: "gs" });
  const e = evaluate(b, maya());
  assert.equal(e.trace.rules.matched?.name, "US enterprise");
  assert.deepEqual(e.trace.rules.notEvaluated.map((r) => r.name), ["Other enterprise", "Vietnam", "All US"]);
});

test("R15 the winning team has nobody eligible though a later rule could match: backup or review, never the later rule", () => {
  const f = maya({ country: "VN", reps: { [ANA]: { pausedUntil: Infinity } } });
  const e = evaluate(policy(), f);
  assert.equal(e.trace.rules.matched?.name, "Other enterprise", "Vietnam also matches but comes later");
  assert.deepEqual([e.state, e.trace.distribution.suggested, e.trace.distribution.backup?.reason], ["unassigned_needs_review", null, "review"]);
  // With Vincent as the backup: one hop to him, still not the Vietnam rule's team.
  const b = policy();
  b.backup = { kind: "user", id: VIN };
  const e2 = evaluate(b, f);
  assert.deepEqual([e2.decision.result.kind === "owner" && e2.decision.result.by, e2.trace.distribution.suggested], ["backup", VIN]);
});

// O: ownership, scope and quotas ----------------------------------------------------------------------------------

test("O01 a contact Vincent owns: Vincent kept, no new quota, no team turn", () => {
  const e = evaluate(policy(), maya({ owner: VIN }));
  assert.deepEqual([e.trace.distribution.suggested, e.effect, e.trace.rules.evaluated.length], [VIN, "retained", 0]);
  assert.equal(e.decision.steps.some((s) => s.step === "queue"), false, "no queue was asked");
});

test("O02 company owned by Ana, contact by Vincent: company first gives Ana as a new owner, no team turn", () => {
  const e = evaluate(policy(), maya({ owner: VIN, companyOwner: ANA }));
  assert.deepEqual([e.trace.distribution.suggested, e.effect], [ANA, "new"]);
  assert.equal(e.decision.result.kind === "owner" && e.decision.result.by, "account");
  assert.equal(e.decision.steps.some((s) => s.step === "queue"), false);
});

test("O03 contact first for O02: Vincent kept, no new quota", () => {
  const b = policy();
  b.ownership = { order: ["contact", "company"], capBlocksNew: true };
  const e = evaluate(b, maya({ owner: VIN, companyOwner: ANA }));
  assert.deepEqual([e.trace.distribution.suggested, e.effect], [VIN, "retained"]);
  assert.deepEqual(e.trace.ownership.order, ["contact", "company"]);
});

test("O04 company owner Ana at her cap, contact owner Vincent eligible: Ana skipped, Vincent kept", () => {
  const e = evaluate(policy(), maya({ owner: VIN, companyOwner: ANA, reps: { [ANA]: { today: 5 } } }));
  assert.deepEqual(e.trace.ownership.candidates.map((c) => [c.user, c.outcome, c.reason]), [[ANA, "skipped", "cap_day"], [VIN, "picked", undefined]]);
  assert.deepEqual([e.trace.distribution.suggested, e.effect], [VIN, "retained"]);
});

test("O05 contact owner Ana already at her cap: kept, no extra quota", () => {
  const e = evaluate(policy(), maya({ owner: ANA, reps: { [ANA]: { today: 5 } } }));
  assert.deepEqual([e.trace.distribution.suggested, e.effect], [ANA, "retained"]);
});

test("O06 an existing owner outside the scope: skipped with the scope reason, rules run", () => {
  const e = evaluate(policy(), maya({ owner: LEE }));
  assert.deepEqual(e.trace.ownership.candidates.find((c) => c.user === LEE), { kind: "contact", user: LEE, outcome: "skipped", reason: "out_of_scope" });
  assert.deepEqual([e.trace.rules.matched?.name, e.trace.distribution.suggested, e.effect], ["US enterprise", ANA, "new"]);
});

test("O07 an existing owner paused or out: skipped", () => {
  assert.equal(evaluate(policy(), maya({ owner: VIN, reps: { [VIN]: { pausedUntil: Infinity } } })).trace.ownership.candidates[1]?.reason, "paused");
  const e = evaluate(policy(), maya({ owner: KAI }));
  assert.deepEqual([e.trace.ownership.candidates[1]?.reason, e.trace.distribution.suggested], ["out", ANA]);
});

test("O08 a solo policy and an Ana-owned contact: Ana isn't kept outside the solo scope; the solo person gets it", () => {
  const b = specBody({ people: [VIN], reviewer: VIN });
  b.fallback = { kind: "user", id: VIN };
  assert.deepEqual(validatePolicy(b, ctx()).errors, [], "P01: no team needed");
  const e = evaluate(b, maya({ owner: ANA }));
  assert.deepEqual([e.trace.ownership.candidates[1]?.reason, e.trace.distribution.suggested, e.effect], ["out_of_scope", VIN, "new"]);
});

test("O09 an SDR owner outside the AE scope: the SDR is skipped and the AE pool is used", () => {
  const b = policy();
  b.scope = { everyone: false, people: [], teams: ["eus"] };
  b.rules.list = [b.rules.list[0]!];
  b.fallback = { kind: "queue", id: "eus" };
  const e = evaluate(b, maya({ owner: LEE, country: "DE" }));
  assert.deepEqual([e.trace.ownership.candidates.find((c) => c.user === LEE)?.reason, e.trace.distribution.destination?.name, e.trace.distribution.suggested], ["out_of_scope", "Enterprise US", ANA]);
});

test("O10 the evaluator never touches company or opportunity owners (it writes nothing at all)", () => {
  const f = maya({ companyOwner: VIN });
  const before = JSON.stringify(f);
  evaluate(policy(), f);
  assert.equal(JSON.stringify(f), before);
});

test("O11 a cap reached through another team blocks a new allocation anywhere", () => {
  const e = evaluate(policy(), maya({ reps: { [ANA]: { today: 5 } } }));
  assert.deepEqual(e.trace.distribution.excluded, [{ user: ANA, reason: "cap_day" }]);
  assert.equal(e.trace.distribution.suggested, VIN);
});

test("O12 a cap lowered below today's count blocks new allocations, keeps existing ownership", () => {
  const f = maya({ reps: { [ANA]: { today: 2, capDay: 1 } } });
  assert.equal(evaluate(policy(), f).trace.distribution.suggested, VIN);
  assert.equal(evaluate(policy(), { ...f, owner: { user: ANA, crm: null } }).trace.distribution.suggested, ANA);
});

test("O13 the evaluator reads the count it's given; the period itself is the committer's (tests/pg/routingPolicies.pg.ts)", () => {
  const f = maya({ reps: { [ANA]: { tz: "Asia/Ho_Chi_Minh", today: 4 } } });
  assert.equal(evaluate(policy(), f).trace.distribution.suggested, ANA);
});

test("O14 held or unallocated runs keep the existing owner in the trace and suggest nobody new", () => {
  const held = evaluate(policy(), maya({ owner: LEE, issues: [{ code: "source_mapping_mismatch", field: "company.employees" }] }));
  assert.deepEqual([held.state, held.trace.assignment.previousOwner, held.trace.assignment.recipient], ["held_for_review", LEE, null]);
  const none = evaluate(policy(), maya({ owner: LEE, reps: { [ANA]: { pausedUntil: Infinity }, [VIN]: { pausedUntil: Infinity } } }));
  assert.deepEqual([none.state, none.trace.assignment.previousOwner], ["unassigned_needs_review", LEE]);
});

// Distribution ---------------------------------------------------------------------------------------------------

test("teams take turns from their persisted next position, the same for every rule and policy that points at them", () => {
  const t = teams();
  t.gs!.next = 2;
  const f = maya({ country: "DE", employees: 50, teams: t });
  assert.equal(evaluate(policy(), f).trace.distribution.suggested, ANA, "position 2 is Ana");
  assert.deepEqual(rotation({ next: 1, members: t.gs!.members }).map((m) => m.user), [KAI, ANA, VIN]);
  // A removed member's position is skipped over without restarting the queue.
  assert.deepEqual(rotation({ next: 1, members: t.gs!.members.filter((m) => m.user !== KAI) }).map((m) => m.user), [ANA, VIN]);
});

test("the booking stage follows the source: thank-you, the owner's calendar, or the follow-up", () => {
  assert.deepEqual(evaluate(policy(), maya(), { source: { outcome: "assign_only", meetingTypeId: null } }).trace.booking, { outcome: "not_requested", host: null, meetingType: null });
  assert.deepEqual(evaluate(policy(), maya(), { source: { outcome: "assign_and_calendar", meetingTypeId: "intro" } }).trace.booking, { outcome: "calendar", host: ANA, meetingType: "intro" });
  assert.equal(evaluate(policy(), maya(), { source: { outcome: "assign_and_calendar", meetingTypeId: "intro", slots: false } }).trace.booking.outcome, "no_slots_follow_up");
  assert.equal(evaluate(policy(), maya({ issues: [{ code: "source_mapping_mismatch", field: "x" }] }), { source: { outcome: "assign_and_calendar", meetingTypeId: "intro" } }).trace.booking.outcome, "follow_up");
});

test("the same facts always give the same answer, and the fingerprint changes with the policy or its teams", () => {
  assert.deepEqual(evaluate(policy(), maya()), evaluate(policy(), maya()));
  const a = fingerprint(policy(), teams());
  assert.equal(a, fingerprint(policy(), teams()));
  const moved = teams();
  moved.eus!.next = 1;
  assert.equal(fingerprint(policy(), moved), a, "a live queue turn doesn't make evidence stale");
  const b = policy();
  b.rules.list.reverse();
  assert.notEqual(fingerprint(b, teams()), a);
  const t = teams();
  t.eus!.members.pop();
  assert.notEqual(fingerprint(policy(), t), a);
});

// P: drafts that can't be published ------------------------------------------------------------------------------

test("P03 a rule with no value: the draft keeps it, publishing is blocked, and it never acts as a catch-all", () => {
  const b = policy();
  b.rules.list.unshift({ id: "r_new", name: "New rule", match: "all", conds: [{ field: "lead.country", op: "not_one_of", value: [] }], queue: "vn" });
  assert.equal(cleanBody(b).rules.list[0]?.id, "r_new", "kept in the draft");
  assert.ok(validatePolicy(b, ctx()).errors.some((e) => /no value/.test(e.text)));
  assert.equal(evaluate(b, maya()).trace.rules.matched?.name, "US enterprise");
  const v1 = emptyBody();
  assert.equal(holds({ field: "x", op: "is_not" }, "DE"), false, "an incomplete 'is not' is never true, in v1 either");
  assert.equal(v1.v, 1);
});

test("P04 removing every condition is an explicit error, never an always-true rule", () => {
  const b = policy();
  b.rules.list[0]!.conds = [];
  assert.ok(validatePolicy(b, ctx()).errors.some((e) => /no conditions/.test(e.text)));
  assert.equal(evaluate(b, maya()).trace.rules.matched?.name, "Other enterprise");
});

test("P05 AND to OR: the saved grouping and the readable summary both change", () => {
  const b = policy();
  const r = b.rules.list[0]!;
  assert.match(ruleWords(r, BASE_FIELDS, []), /Country is United States, and employees is at least 201/);
  r.match = "any";
  const saved = cleanBody(b).rules.list[0]!;
  assert.equal(saved.match, "any");
  assert.match(ruleWords(saved, BASE_FIELDS, []), /Country is United States, or employees is at least 201/);
  assert.equal(evaluate(b, maya({ country: "US", employees: 10 })).trace.rules.matched?.name, "US enterprise");
});

test("P06 Vietnam moved above the enterprise rules: an 800-employee Vietnam lead now goes to Vietnam", () => {
  const b = policy();
  b.rules.list = [b.rules.list[2]!, b.rules.list[0]!, b.rules.list[1]!];
  const e = evaluate(b, maya({ country: "VN" }));
  assert.deepEqual([e.trace.rules.matched?.name, e.trace.distribution.suggested], ["Vietnam", VIN]);
});

test("T05 publish validation blocks a backup that is a destination it would back up, or missing review", () => {
  const b = policy();
  b.backup = { kind: "queue", id: "eus" };
  assert.ok(validatePolicy(b, ctx()).errors.some((e) => e.code === "fallback_cycle"));
  b.backup = { kind: "default" };
  assert.ok(validatePolicy(b, ctx()).errors.some((e) => e.code === "fallback_cycle"));
  b.backup = { kind: "user", id: VIN };
  assert.deepEqual(validatePolicy(b, ctx()).errors, []);
  b.review = { owner: null };
  assert.ok(validatePolicy(b, ctx()).errors.some((e) => /reviews/.test(e.text)));
  const out = policy();
  out.rules.list[0]!.then = "user";
  out.rules.list[0]!.user = LEE;
  assert.ok(validatePolicy(out, ctx()).errors.some((e) => /outside the policy's scope/.test(e.text)));
  const calendar = validatePolicy(policy(), { ...ctx(), sources: [{ id: "s1", name: "Demo request", enabled: true, outcome: "assign_and_calendar", meetingTypeId: null }] });
  assert.ok(calendar.errors.some((e) => /no meeting type/.test(e.text)));
  const dup = policy();
  dup.rules.list.push({ ...dup.rules.list[0]!, id: "r_dup", name: "Copy" });
  assert.ok(validatePolicy(dup, ctx()).warnings.some((w) => w.code === "shadowed_rule"));
});

test("cleanBody keeps a v2 policy's settings, and leaves a v1 body exactly as it was", () => {
  const b = policy();
  b.backup = { kind: "user", id: VIN };
  const c = cleanBody(JSON.parse(JSON.stringify(b)));
  assert.deepEqual([c.v, c.scope, c.ownership, c.backup, c.review], [2, b.scope, b.ownership, b.backup, b.review]);
  const v1 = cleanBody(emptyBody());
  assert.deepEqual([v1.v, "scope" in v1, "backup" in v1, "ownership" in v1], [1, false, false, false]);
});

// v1: every migrated body runs as it did ----------------------------------------------------------------------------

test("v1 keeps its live semantics: 'is not' matches unknown, a range's low end, the company owner over their cap", () => {
  assert.equal(holds({ field: "x", op: "not_one_of", value: ["US"] }, null), true);
  assert.equal(holds({ field: "x", op: "gte", value: 51 }, "51-200"), true);
  assert.equal(holds({ field: "x", op: "lt", value: 100 }, "51-200"), true, "v1 reads 51");
  assert.equal(holds({ field: "x", op: "lt", value: 100 }, "51-200", [], "v2"), false, "v2: not the whole range");
  // A v1 body carries its own copy of its queues.
  const queues = Object.entries(teams()).map(([id, t]) => ({ id, name: t.name, method: t.method, strict: false, hoursOnly: false, members: t.members.map((m) => ({ user: m.user, weight: 1 })) }));
  const b = cleanBody({ ...policy(), v: 1, queues, scope: undefined, ownership: undefined, backup: undefined, review: undefined });
  b.account.oppFirst = true;
  b.keep.whenOut = "backup";
  const f = maya({ companyOwner: ANA, reps: { [ANA]: { today: 5 } } });
  assert.equal(ownerOf(b, f), ANA, "v1: the company owner ignores caps");
  assert.notEqual(ownerOf(policy(), f), ANA);
  // v1 with every rule's team empty falls to Everyone else; v2 goes to review instead.
  const empty = maya({ country: "DE", reps: { [ANA]: { pausedUntil: Infinity } } });
  assert.equal(ownerOf(b, empty), VIN);
  assert.equal(ownerOf(policy(), empty), "unassigned");
  assert.equal(rulesStep(b, empty).notEvaluated?.[0]?.name, "Vietnam");
});

test("explain reads every v2 step as a sentence", () => {
  const e = evaluate(policy(), maya({ owner: LEE, reps: { [ANA]: { pausedUntil: Infinity }, [VIN]: { pausedUntil: Infinity } } }));
  const text = explain(e.decision, maya()).map((l) => `${l.title}: ${l.parts.map((p) => (typeof p === "string" ? p : p.text)).join("")}`);
  assert.ok(text.some((t) => /Existing owner/.test(t)));
  assert.ok(text.some((t) => /Sent to review/.test(t)), text.join("\n"));
  assert.ok(NOW > 0);
});
