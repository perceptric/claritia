// The Router editor's logic (docs/router-ux.md 4.2 and 7.2): undo and redo with typing joined into one step, the
// body edits the inspector makes, condition values that follow their test, the flow's counts, Finish setup, and the
// path a test lead lights up.
import assert from "node:assert/strict";
import { test } from "node:test";
import { problems } from "../src/lib/router/check.ts";
import { BASE_FIELDS, type FieldDef } from "../src/lib/router/conditions.ts";
import type { Line } from "../src/lib/router/explain.ts";
import { fromTemplate } from "../src/lib/router/templates.ts";
import { emptyBody, type RouterBody } from "../src/lib/router/types.ts";
import {
  addMember,
  addQueue,
  addRule,
  madeName,
  editorReducer,
  flowCounts,
  moveRule,
  moveRuleTo,
  newCond,
  pathOf,
  removeMember,
  removeQueue,
  setRule,
  setupItems,
  setWeight,
  splitList,
  startEditor,
  withField,
  withOp,
  type EditorState,
} from "../src/components/app/routing/editorModel.ts";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const field = (key: string) => BASE_FIELDS.find((f) => f.key === key)!;
const rename = (name: string) => (b: RouterBody) => setRule(b, "r1", { name });
const withRule = () => addRule(addQueue(emptyBody(), "q1", "US"), "r1", "q1");
const edit = (s: EditorState, fn: (b: RouterBody) => RouterBody, key?: string, at = 0) => editorReducer(s, { type: "edit", edit: fn, key, at });

test("each edit is one undo step; typing in one box within a second joins one step", () => {
  let s = startEditor(withRule());
  s = edit(s, rename("U"), "rule:r1:name", 1000);
  s = edit(s, rename("US"), "rule:r1:name", 1400);
  s = edit(s, rename("US mid"), "rule:r1:name", 2300);
  assert.equal(s.body.rules.list[0]!.name, "US mid");
  assert.equal(s.past.length, 1, "three keystrokes, each within a second of the last, are one step");
  s = edit(s, rename("US mid-market"), "rule:r1:name", 3500);
  assert.equal(s.past.length, 2, "a pause of over a second starts a new step");
  s = edit(s, (b) => setRule(b, "r1", { match: "any" }));
  s = edit(s, (b) => setRule(b, "r1", { match: "all" }));
  assert.equal(s.past.length, 4, "picks and toggles never join");

  s = editorReducer(s, { type: "undo" });
  assert.equal(s.body.rules.list[0]!.match, "any");
  s = editorReducer(s, { type: "undo" });
  s = editorReducer(s, { type: "undo" });
  assert.equal(s.body.rules.list[0]!.name, "US mid");
  s = editorReducer(s, { type: "redo" });
  assert.equal(s.body.rules.list[0]!.name, "US mid-market");
  // A new edit drops the redo stack.
  s = edit(s, rename("X"));
  assert.equal(s.future.length, 0);
  assert.equal(editorReducer(s, { type: "redo" }), s);
});

test("an edit that changes nothing leaves the history alone, and every change moves the counter", () => {
  const s0 = startEditor(withRule());
  const s1 = edit(s0, (b) => setRule(b, "r1", { match: "all" }));
  assert.equal(s1, s0, "the rule already matches all");
  const s2 = edit(s0, rename("Other"));
  assert.equal(s2.n, 1);
  assert.equal(editorReducer(s2, { type: "undo" }).n, 2, "undo is a change to save too");
  const r = editorReducer(s2, { type: "reset", body: emptyBody() });
  assert.deepEqual([r.past.length, r.future.length, r.n], [0, 0, 2]);
  assert.equal(editorReducer(startEditor(emptyBody()), { type: "undo" }).n, 0, "nothing to undo is no change");
});

test("the undo history keeps the last 100 steps", () => {
  let s = startEditor(withRule());
  for (let i = 0; i < 130; i++) s = edit(s, rename(`R${i}`));
  assert.equal(s.past.length, 100);
  assert.equal(s.past[0]!.rules.list[0]!.name, "R29");
});

test("rules move by drag or Move up and Move down, and stay put at the ends", () => {
  let b = addRule(addRule(addRule(emptyBody(), "a"), "b"), "c");
  assert.deepEqual(
    b.rules.list.map((r) => r.name),
    ["New rule", "New rule 2", "New rule 3"],
  );
  const ids = (x: RouterBody) => x.rules.list.map((r) => r.id).join("");
  assert.equal(ids(moveRuleTo(b, "c", 0)), "cab");
  assert.equal(ids(moveRuleTo(b, "a", 99)), "bca");
  assert.equal(ids(moveRule(b, "b", -1)), "bac");
  assert.equal(ids(moveRule(b, "b", 1)), "acb");
  assert.equal(moveRule(b, "a", -1), b, "the first rule can't move up");
  assert.equal(moveRule(b, "c", 1), b, "the last can't move down");
  assert.equal(moveRuleTo(b, "nope", 0), b);
  // A new rule's name skips the ones taken, starts with a country to fill and goes to the everyone-else team.
  b = setRule(b, "a", { name: "New rule 4" });
  const d = addRule({ ...b, queues: [{ id: "q9", name: "Everyone", method: "rr", strict: false, hoursOnly: false, members: [] }], fallback: { kind: "queue", id: "q9" } }, "d").rules.list[3]!;
  assert.equal(d.name, "New rule");
  assert.equal(d.queue, "q9");
  assert.equal(d.conds[0]!.field, "lead.country");
  assert.ok(madeName("New rule 5", "x") && madeName("Rule 1", "x") && madeName("Country is DE", "Country is DE") && !madeName("Europe", "Country is DE"));
});

test("queues: names stay their own, removing one clears the rules and fallback that used it", () => {
  let b = addQueue(addQueue(emptyBody(), "q1"), "q2");
  assert.deepEqual(
    b.queues.map((q) => q.name),
    ["New team", "New team 2"],
  );
  b = addRule(b, "r1", "q1");
  b = { ...b, fallback: { kind: "queue", id: "q1" } };
  const out = removeQueue(b, "q1");
  assert.deepEqual(
    out.queues.map((q) => q.id),
    ["q2"],
  );
  assert.equal(out.rules.list[0]!.queue, "");
  assert.equal(out.fallback, null);
  assert.ok(problems(out, { members: new Set() }).some((p) => p.text === '"New rule" has no team'));
});

test("reps join a queue once, weights stay between 1 and 10, and they can leave", () => {
  let b = addQueue(emptyBody(), "q1");
  b = addMember(addMember(addMember(b, "q1", U1), "q1", U1), "q1", U2);
  assert.deepEqual(
    b.queues[0]!.members.map((m) => m.user),
    [U1, U2],
  );
  assert.equal(setWeight(b, "q1", U1, 14).queues[0]!.members[0]!.weight, 10);
  assert.equal(setWeight(b, "q1", U1, 0).queues[0]!.members[0]!.weight, 1);
  assert.equal(removeMember(b, "q1", U1).queues[0]!.members.length, 1);
  assert.equal(addMember(b, "nope", U1), b);
});

test("a condition's value follows its test", () => {
  const size = field("company.size");
  const country = field("lead.country");
  const title = field("contact.title");
  assert.deepEqual(newCond(country), { field: "lead.country", op: "one_of", value: [] });
  assert.deepEqual(newCond(size), { field: "company.size", op: "is" });
  assert.deepEqual(newCond(title), { field: "contact.title", op: "is", value: "" });
  // Between needs a fresh pair; a list keeps what was typed; "is filled" drops the value.
  assert.deepEqual(withOp({ field: "company.size", op: "gt", value: 50 }, "between", "number"), { field: "company.size", op: "between", value: [] });
  assert.deepEqual(withOp({ field: "company.size", op: "between", value: [51, 200] }, "gt", "number"), { field: "company.size", op: "gt" });
  assert.deepEqual(withOp({ field: "company.size", op: "is", value: 50 }, "gt", "number"), { field: "company.size", op: "gt", value: 50 });
  assert.deepEqual(withOp({ field: "contact.title", op: "is", value: "CEO" }, "one_of", "text"), { field: "contact.title", op: "one_of", value: ["CEO"] });
  assert.deepEqual(withOp({ field: "contact.title", op: "one_of", value: ["CEO", "CTO"] }, "contains", "text"), { field: "contact.title", op: "contains", value: "CEO" });
  assert.deepEqual(withOp({ field: "lead.country", op: "one_of", value: ["US"] }, "filled", "country"), { field: "lead.country", op: "filled" });
  assert.deepEqual(withOp({ field: "x.flag", op: "filled" }, "is", "bool"), { field: "x.flag", op: "is", value: "true" });
  // Every new condition passes the checks except for its empty value.
  for (const f of BASE_FIELDS) {
    const c = newCond(f);
    let b = addRule(addQueue(emptyBody(), "q1"), "r1", "q1");
    b = setRule(b, "r1", { conds: [c] });
    const texts = problems(b, { members: new Set() }).filter((p) => p.where.kind === "rule").map((p) => p.text);
    for (const t of texts) assert.match(t, /no value|two numbers/, `${f.key}: ${t}`);
  }
});

test("changing a condition's field keeps the test when it still fits", () => {
  const c = { field: "contact.country", op: "not_one_of" as const, value: ["US"] };
  assert.deepEqual(withField(c, field("company.country"), field("contact.country")), { ...c, field: "company.country" });
  assert.deepEqual(withField(c, field("company.size"), field("contact.country")), { field: "company.size", op: "is" });
  const custom: FieldDef = { key: "contact.f.tier", label: "Tier", group: "Contact", type: "choice", options: ["a", "b"] };
  assert.deepEqual(withField({ field: "lead.form", op: "one_of", value: ["f1"] }, custom, field("lead.form")), { field: "contact.f.tier", op: "one_of", value: ["f1"] });
});

test("pasted lists split on commas, spaces, semicolons and new lines", () => {
  assert.deepEqual(splitList("a.com, b.com;c.com\n d.com\t\te.com,,"), ["a.com", "b.com", "c.com", "d.com", "e.com"]);
  assert.deepEqual(splitList("   "), []);
});

test("the flow's counts: each step passes on what it didn't decide, and steps that are off pass everyone", () => {
  const b = withRule();
  b.rules.list.push({ id: "r2", name: "EMEA", match: "all", conds: [], queue: "q1" });
  const stats = { total: 100, held: 10, unassigned: 3, by: { account: 20, keep: 5, queue: 50, fallback: 12 }, rules: { r1: 40, r2: 10 }, queues: {} };
  const c = flowCounts(stats, b);
  assert.deepEqual([c.total, c.held, c.afterSpam, c.matched, c.afterAccount, c.kept, c.afterKeep], [100, 10, 90, 20, 70, 5, 65]);
  assert.deepEqual(c.rules, { r1: 40, r2: 10 });
  assert.equal(c.noRule, 15);
  assert.equal(c.fallback, 15);
  const off = flowCounts(stats, { ...b, spam: { ...b.spam, on: false }, account: { ...b.account, on: false } });
  assert.deepEqual([off.held, off.afterSpam, off.matched, off.afterAccount], [0, 100, 0, 100]);
  // Missing or odd stats read as zero, and counts never go below zero.
  const none = flowCounts(null, b);
  assert.deepEqual([none.total, none.noRule, none.rules.r1], [0, 0, 0]);
  assert.equal(flowCounts({ total: 10, held: 50, by: {}, rules: { r1: 99 } }, b).noRule, 0);
});

test("Finish setup turns problems into things to do, each opening its card", () => {
  const b = fromTemplate("territories", { regions: ["North America", "EMEA"] });
  const items = setupItems(problems(b, { members: new Set() }));
  assert.deepEqual(
    items.map((i) => i.text),
    ["Add reps to North America", "Add reps to EMEA", "Pick a fallback"],
  );
  assert.deepEqual(items[0]!.at, { kind: "queue", id: "q_north_america" });
  assert.deepEqual(items[2]!.at, { kind: "fallback" });
  // Fixing them empties the list.
  let fixed = addMember(addMember(b, "q_north_america", U1), "q_emea", U2);
  fixed = { ...fixed, fallback: { kind: "user", id: U1 } };
  assert.deepEqual(setupItems(problems(fixed, { members: new Set([U1, U2]) })), []);
});

test("a test lead's path: each step's mark, the steps reached, the matched rule and its queue", () => {
  const lines: Line[] = [
    { step: "spam", mark: "ok", title: "Spam check", parts: ["Passed 4 checks."] },
    { step: "account", mark: "skip", title: "Match account", parts: ["No company for acme.com."] },
    { step: "keep", mark: "skip", title: "Keep owner", parts: ["Dana had no owner."] },
    { step: "rules", mark: "ok", title: "Rules", parts: [{ text: '"US"', kind: "rule", id: "r1" }, " matched."] },
    { step: "queue", mark: "ok", title: "Queue", parts: [{ text: "US", kind: "queue", id: "q1" }, ", round robin. ", { text: "Lee", kind: "user", id: U1 }, " had 3 of the last 9."] },
  ];
  const p = pathOf(lines);
  assert.deepEqual(p.marks, { spam: "ok", account: "skip", keep: "skip", rules: "ok" });
  assert.deepEqual([...p.reached], ["spam", "account", "keep", "rules"]);
  assert.equal(p.rule, "r1");
  assert.equal(p.queue, "q1");
  // A queue where no one could take it marks the Rules card as passed on, and the fallback is reached.
  const stuck = pathOf([...lines.slice(0, 4), { ...lines[4]!, mark: "miss" }, { step: "fallback", mark: "ok", title: "Fallback", parts: [] }]);
  assert.equal(stuck.marks.rules, "miss");
  assert.ok(stuck.reached.has("fallback"));
  // Held at spam: nothing after it is reached.
  const held = pathOf([{ step: "spam", mark: "miss", title: "Spam check", parts: ["Held: blocked domain."] }]);
  assert.deepEqual([...held.reached], ["spam"]);
  assert.equal(held.rule, null);
  assert.deepEqual(pathOf(null).marks, {});
});
