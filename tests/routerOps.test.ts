// Routing by chat (docs/routing-chat-plan.md): the checked edits the chat and Flow make, and the rule actions "send to
// the owner" and "hold for review", including the cases that go wrong: an owner who's away, a version saved before
// rules had actions, a name two teammates share, and an edit that would leave the setup broken.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanBody, problems } from "../src/lib/router/check.ts";
import { decide } from "../src/lib/router/engine.ts";
import { explain, pathWords } from "../src/lib/router/explain.ts";
import { applyOp, applyStrict, findMember, firstProblem, type RouterOp } from "../src/lib/router/ops.ts";
import { planLines } from "../src/lib/router/readback.ts";
import { emptyBody, type Facts, type RepFacts, type RouterBody } from "../src/lib/router/types.ts";

const ANA = "22222222-2222-4222-8222-222222222222";
const RAJ = "33333333-3333-4333-8333-333333333333";
const SAM = "44444444-4444-4444-8444-444444444444";
const AC = "55555555-5555-4555-8555-555555555555";
const AM = "66666666-6666-4666-8666-666666666666";
const NOW = Date.UTC(2026, 9, 29, 15, 0);
const ctx = {
  members: [
    { id: ANA, name: "Ana Ruiz", email: "ana@lumen.io" },
    { id: RAJ, name: "Raj Patel", email: "raj@lumen.io" },
    { id: SAM, name: "Sam Rivera", email: "sam@lumen.io" },
    { id: AC, name: "Alex Chen", email: "alexc@lumen.io" },
    { id: AM, name: "Alex Moreno", email: "alexm@lumen.io" },
  ],
};
const rep = (name: string, o: Partial<RepFacts> = {}): RepFacts => ({ name, member: true, tz: "UTC", pausedUntil: null, outUntil: null, backup: null, capDay: null, capWeek: null, today: 0, week: 0, meetingsWeek: 0, inHours: true, ...o });
function facts(o: Partial<Facts> = {}): Facts {
  return {
    now: NOW,
    values: { "lead.country": "DE", "company.size": 900, "contact.lifecycle": "customer" },
    owner: null,
    company: null,
    reps: { [ANA]: rep("Ana Ruiz"), [RAJ]: rep("Raj Patel"), [SAM]: rep("Sam Rivera"), [AC]: rep("Alex Chen"), [AM]: rep("Alex Moreno") },
    counts: {},
    lists: { allow: [], block: [] },
    ...o,
    lead: { id: "c1", name: "Dana Lee", email: "dana@acme.com", emailClass: "work", domain: "acme.com", firstName: "Dana", lastName: "Lee", recent: 1, disposable: false },
  };
}

/** Apply ops in order; fail the test on the first error. */
function build(ops: RouterOp[], start: RouterBody = emptyBody()): RouterBody {
  let b = start;
  for (const op of ops) {
    const r = applyStrict(b, op, ctx);
    if ("error" in r) assert.fail(`${op.op}: ${r.error}`);
    b = r.body;
  }
  return b;
}

const sample = () =>
  build([
    { op: "add_team", name: "AEs", people: ["Sam", "Raj"] },
    { op: "add_team", name: "Everyone", people: ["Ana", "Raj", "Sam", "Alex Chen", "Alex Moreno"] },
    { op: "add_region", name: "Europe", countries: ["DE", "FR", "ES", "GB"] },
    { op: "add_rule", name: "Customers", conds: [{ field: "contact.lifecycle", op: "one_of", value: ["customer"] }], then: "owner" },
    { op: "add_rule", name: "Big companies", conds: [{ field: "company.size", op: "gt", value: 500 }], team: "AEs" },
    { op: "add_rule", name: "Europe", conds: [{ field: "lead.country", op: "one_of", value: ["Europe"] }], person: "Ana" },
    { op: "set_everyone_else", team: "Everyone" },
  ]);

test("a setup built from ops has no problems and reads back in order", () => {
  const b = sample();
  assert.deepEqual(problems(b, { members: new Set(ctx.members.map((m) => m.id)) }), []);
  assert.equal(firstProblem(b, ctx), "");
  // Region names in a condition become the region's id.
  assert.deepEqual(b.rules.list[2]!.conds[0]!.value, [`t:${b.territories[0]!.id}`]);
  // One person gets a team of one, named after them.
  assert.equal(b.queues.find((q) => q.id === b.rules.list[2]!.queue)!.name, "Ana Ruiz");
  const lines = planLines(b, { names: Object.fromEntries(ctx.members.map((m) => [m.id, m.name])) });
  assert.deepEqual(lines.map((l) => l.kind), ["spam", "account", "keep", "rule", "rule", "rule", "fallback"]);
  assert.match(lines[3]!.text, /go to their company's owner/);
  assert.match(lines[4]!.text, /AEs team, taking turns/);
});

test("names: a full name, an email and a unique first name work; a shared first name asks", () => {
  assert.deepEqual(findMember(ctx, "Ana"), { id: ANA });
  assert.deepEqual(findMember(ctx, "raj@lumen.io"), { id: RAJ });
  assert.deepEqual(findMember(ctx, "alex moreno"), { id: AM });
  const two = findMember(ctx, "Alex");
  assert.ok("error" in two && /More than one teammate is called Alex/.test(two.error));
  const none = findMember(ctx, "Priya");
  assert.ok("error" in none && /No teammate called Priya/.test(none.error));
  const r = applyOp(emptyBody(), { op: "add_team", name: "SDRs", people: ["Alex"] }, ctx);
  assert.ok("error" in r);
});

test("ops refuse bad input instead of guessing", () => {
  const b = sample();
  const bad: [RouterOp, RegExp][] = [
    [{ op: "add_rule", conds: [{ field: "contact.shoe_size", op: "is", value: "9" }], team: "AEs" }, /No field/],
    [{ op: "add_rule", conds: [{ field: "company.size", op: "contains", value: "5" }], team: "AEs" }, /takes these tests/],
    [{ op: "add_rule", conds: [{ field: "company.size", op: "gt" }], team: "AEs" }, /needs a value/],
    [{ op: "add_rule", conds: [{ field: "lead.country", op: "one_of", value: ["Narnia"] }], team: "AEs" }, /isn't a country code or a region/],
    [{ op: "add_rule", conds: [{ field: "contact.seniority", op: "one_of", value: ["Wizard"] }], team: "AEs" }, /isn't a seniority/],
    [{ op: "add_rule", conds: [], team: "AEs" }, /at least one condition/],
    [{ op: "add_rule", conds: [{ field: "company.size", op: "gt", value: 10 }], team: "Ghosts" }, /No team called Ghosts/],
    [{ op: "add_rule", conds: [{ field: "company.type", op: "one_of", value: ["Enterprise"] }], team: "AEs" }, /No company type called Enterprise/],
    [{ op: "remove_team", team: "AEs" }, /still sends leads/],
    [{ op: "remove_team", team: "Everyone" }, /gets everyone else/],
    [{ op: "set_sla", minutes: 2 }, /5 minutes to 7 days/],
    [{ op: "add_team", name: "AEs", people: ["Ana"] }, /already a team/],
  ];
  for (const [op, re] of bad) {
    const r = applyOp(b, op, ctx);
    assert.ok("error" in r, `${op.op} should fail`);
    assert.match((r as { error: string }).error, re);
  }
});

test("strict: an op that would leave a new problem is refused; the chat can add rules before everyone else", () => {
  const b = build([{ op: "add_team", name: "AEs", people: ["Sam"] }]);
  // No fallback yet is fine while building.
  const r = applyStrict(b, { op: "add_rule", conds: [{ field: "company.size", op: "gt", value: 500 }], team: "AEs" }, ctx);
  assert.ok(!("error" in r));
  // Emptying the team a rule uses adds "has no reps": refused.
  const empty = applyStrict((r as { body: RouterBody }).body, { op: "edit_team", team: "AEs", people: [] }, ctx);
  assert.ok("error" in empty && /would leave a problem/.test(empty.error));
  // The same op through applyOp (Flow, mid-edit) goes through, and Make live names what's missing.
  const loose = applyOp((r as { body: RouterBody }).body, { op: "edit_team", team: "AEs", people: [] }, ctx);
  assert.ok(!("error" in loose));
  assert.equal(firstProblem((loose as { body: RouterBody }).body, ctx), "AEs has no reps");
});

test("a rule that sends to the owner: deal rep first, then company owner, then contact owner", () => {
  const b = sample();
  const d1 = decide(b, facts({ company: { id: "co", name: "Acme", domain: "acme.com", owner: RAJ, ownerCrm: null, oppOwner: SAM, oppName: "Pilot" } }));
  // Same company, same rep is on by default and catches it first; turn it off to reach the rule.
  assert.equal(d1.result.kind === "owner" && d1.result.by, "account");
  const off = (applyOp(b, { op: "set_account", on: false }, ctx) as { body: RouterBody }).body;
  const d2 = decide(off, facts({ company: { id: "co", name: "Acme", domain: "acme.com", owner: RAJ, ownerCrm: null, oppOwner: SAM, oppName: "Pilot" } }));
  assert.deepEqual(d2.result, { kind: "owner", user: SAM, by: "account", rule: off.rules.list[0]!.id });
  assert.match(pathWords(d2), /Rule: Customers → owner/);
  const d3 = decide(off, facts({ company: { id: "co", name: "Acme", domain: "acme.com", owner: RAJ, ownerCrm: null, oppOwner: null, oppName: null } }));
  assert.equal(d3.result.kind === "owner" && d3.result.user, RAJ);
  const keepOff = (applyOp(off, { op: "set_keep", on: false }, ctx) as { body: RouterBody }).body;
  const d4 = decide(keepOff, facts({ owner: { user: ANA, crm: null } }));
  assert.equal(d4.result.kind === "owner" && d4.result.user, ANA);
});

test("flaky case: the owner is away, so the lead goes on to everyone else instead of waiting", () => {
  const b = (applyOp(sample(), { op: "set_account", on: false }, ctx) as { body: RouterBody }).body;
  const f = facts({ company: { id: "co", name: "Acme", domain: "acme.com", owner: RAJ, ownerCrm: null, oppOwner: null, oppName: null } });
  f.reps[RAJ] = rep("Raj Patel", { outUntil: NOW + 3 * 86_400_000 });
  const d = decide(b, f);
  assert.equal(d.result.kind, "owner");
  assert.notEqual(d.result.kind === "owner" && d.result.user, RAJ);
  assert.equal(d.result.kind === "owner" && d.result.by, "fallback");
  const lines = explain(d, f).map((l) => l.parts.map((p) => (typeof p === "string" ? p : p.text)).join(""));
  assert.ok(lines.some((l) => /Raj Patel .*Routed on\./.test(l)), lines.join("\n"));
  // No owner at all: the same, with its own reason.
  const d2 = decide(b, facts());
  assert.equal(d2.result.kind === "owner" && d2.result.by, "fallback");
  assert.ok(explain(d2, facts()).some((l) => l.parts.some((p) => typeof p === "string" && /No owner to send it to/.test(p))));
});

test("a rule that holds: the lead waits for review and nothing later runs", () => {
  const b = build([{ op: "add_rule", name: "Competitors", conds: [{ field: "company.domain", op: "one_of", value: ["rivalco.com"] }], then: "hold", at: 0 }], sample());
  const f = facts({ values: { "company.domain": "rivalco.com", "company.size": 900 } });
  const d = decide(b, f);
  assert.deepEqual(d.result, { kind: "held", signals: ["rule"] });
  assert.equal(pathWords(d), "Held: a rule held it");
  // A hold rule needs no team, and leaves no problem behind.
  assert.equal(b.rules.list[0]!.queue, "");
  assert.equal(firstProblem(b, ctx), "");
});

test("old versions: a rule saved before actions existed still sends to its team, and cleanBody keeps actions", () => {
  const b = sample();
  const old = JSON.parse(JSON.stringify(b)) as RouterBody;
  for (const r of old.rules.list) delete r.then;
  old.rules.list = old.rules.list.filter((r) => r.queue);
  const d = decide(cleanBody(old), facts());
  assert.equal(d.result.kind === "owner" && d.result.by, "queue");
  assert.equal(cleanBody(b).rules.list[0]!.then, "owner");
  assert.equal(cleanBody({ ...b, rules: { on: true, list: [{ ...b.rules.list[0], then: "nurture" }] } }).rules.list[0]!.then, undefined);
});

test("moving and removing rules keeps the order people see", () => {
  let b = sample();
  b = (applyOp(b, { op: "move_rule", rule: "Europe", to: 0 }, ctx) as { body: RouterBody }).body;
  assert.deepEqual(b.rules.list.map((r) => r.name), ["Europe", "Customers", "Big companies"]);
  b = (applyOp(b, { op: "remove_rule", rule: "Customers" }, ctx) as { body: RouterBody }).body;
  assert.deepEqual(b.rules.list.map((r) => r.name), ["Europe", "Big companies"]);
  // The German 900-person lead now meets Europe first.
  const d = decide((applyOp(b, { op: "set_account", on: false }, ctx) as { body: RouterBody }).body, facts());
  assert.equal(d.result.kind === "owner" && d.result.user, ANA);
});
