// Workflows' pure parts (docs/enrich-workflows-reports.md Part 2): the step tree, the engine (branches, splits,
// waits across a daylight saving change, goals, Try a contact), merge fields, the checks, the words, and templates.
import assert from "node:assert/strict";
import { test } from "node:test";
import { at } from "../src/lib/meetings/time.ts";
import { cleanBody, problems } from "../src/lib/workflows/check.ts";
import { branchYes, fillMerge, goalMet, mergeGaps, splitSide, tracePath, waitUntil } from "../src/lib/workflows/engine.ts";
import { diffWords, stepWords, triggerWords } from "../src/lib/workflows/explain.ts";
import { valuesOf, webhookSecret, type Facts } from "../src/lib/workflows/facts.ts";
import { TEMPLATES } from "../src/lib/workflows/templates.ts";
import { copyStep, enterPath, find, insert, maxDepth, move, nextAfter, remove } from "../src/lib/workflows/tree.ts";
import { emptyBody, newStep, type Body, type Step } from "../src/lib/workflows/types.ts";

const email = (id: string, approved = true): Step => ({ id, kind: "email", from: "team", approved, email: { subject: `Hi ${id}`, preheader: "", paragraphs: ["Hello {{first_name|there}}"], cta_label: "", cta_url: "" } });
const wait = (id: string, days = 1): Step => ({ id, kind: "wait", days, hours: 0 });

/** e1 → branch(yes: e2, no: [split(a: e3, b: —)]) → e4 */
const tree = (): Step[] => [
  email("e1"),
  { id: "br", kind: "branch", match: "all", conds: [{ field: "contact.seniority", op: "one_of", value: ["VP", "C-level"] }], yes: [email("e2")], no: [{ id: "sp", kind: "split", percent: 50, a: [email("e3")], b: [] }] },
  email("e4"),
];

test("the tree: the step after a path's last step is the step after its container; an empty path goes straight on", () => {
  const s = tree();
  assert.equal(nextAfter(s, "e1"), "br");
  assert.equal(nextAfter(s, "e2"), "e4");
  assert.equal(nextAfter(s, "e3"), "e4");
  assert.equal(nextAfter(s, "e4"), null);
  assert.equal(enterPath(s, find(s, "sp")!.step, "b"), "e4");
  assert.equal(enterPath(s, find(s, "br")!.step, "yes"), "e2");
  assert.equal(maxDepth(s), 2);
});

test("editing: insert, move, remove and copy leave the original as it was; a container can't move into itself", () => {
  const s = tree();
  const added = insert(s, { parent: "br", path: "yes", index: 1 }, wait("w1"));
  assert.equal(find(added, "w1")?.parent?.step.id, "br");
  assert.equal(find(s, "w1"), null, "the original is unchanged");
  const moved = move(added, "e4", { parent: null, index: 0 });
  assert.deepEqual(moved.map((x) => x.id), ["e4", "e1", "br"]);
  assert.deepEqual(move(s, "br", { parent: "sp", path: "a", index: 0 }), s, "into its own path is refused");
  const down = move(s, "e1", { parent: null, index: 3 });
  assert.deepEqual(down.map((x) => x.id), ["br", "e4", "e1"]);
  assert.deepEqual(remove(s, "br").map((x) => x.id), ["e1", "e4"]);
  let n = 0;
  const c = copyStep(find(s, "br")!.step, () => `c${n++}`);
  assert.equal(c.id, "c0");
  assert.equal(find([c], "e2"), null, "nested steps get new ids too");
});

const f = (values: Record<string, unknown>, o: Partial<Parameters<typeof tracePath>[1]> = {}) => ({ values, lifecycle: null, outcome: null, booked: false, timezone: "America/New_York", ...o });

test("Try a contact: branches by the contact's values, splits the same way every time, and stops at an exit or a goal", () => {
  const body: Body = { ...emptyBody(), steps: tree() };
  const vp = tracePath(body, f({ "contact.seniority": "VP" }), "run-1");
  assert.deepEqual(vp.lines.map((l) => `${l.step.id}${l.path ? `:${l.path}` : ""}`), ["e1", "br:yes", "e2", "e4"]);
  const ic = tracePath(body, f({ "contact.seniority": "Individual" }), "run-1");
  assert.deepEqual(ic.lines.map((l) => l.step.id).slice(0, 3), ["e1", "br", "sp"]);
  assert.deepEqual(tracePath(body, f({}), "run-1").lines.map((l) => l.path), tracePath(body, f({}), "run-1").lines.map((l) => l.path), "a run always splits the same way");
  const withExit: Body = { ...body, steps: [email("e1"), { id: "x", kind: "exit" }, email("e9")] };
  assert.deepEqual(tracePath(withExit, f({})).lines.map((l) => l.step.id), ["e1", "x"]);
  const goal: Body = { ...body, goals: [{ kind: "lifecycle", stages: ["customer"] }] };
  assert.equal(tracePath(goal, f({}, { lifecycle: "customer" })).goal?.kind, "lifecycle");
  const only: Body = { ...body, only: { match: "all", conds: [{ field: "contact.email_class", op: "one_of", value: ["work"] }] } };
  assert.equal(tracePath(only, f({ "contact.email_class": "free" })).entered, false);
});

test("a split follows its percent over many runs, and the same run always lands on the same side", () => {
  const sp = { id: "sp", kind: "split" as const, percent: 30, a: [], b: [] };
  let a = 0;
  for (let i = 0; i < 2000; i++) if (splitSide(sp, `run-${i}`) === "a") a++;
  assert.ok(a > 520 && a < 680, `about 30% (${a / 20}%)`);
  assert.equal(splitSide(sp, "run-7"), splitSide(sp, "run-7"));
});

test("a wait across the end of daylight saving lands on the right local hour; weekdays only skips the weekend", () => {
  // Saturday 31 October 2026, 10:00 in New York (EDT). Clocks go back on Sunday 1 November.
  const from = at("2026-10-31", "10:00", "America/New_York");
  const next = waitUntil({ id: "w", kind: "wait", days: 1, hours: 0, at: "09:00" }, from, "America/New_York");
  assert.equal(next, at("2026-11-01", "09:00", "America/New_York"), "09:00 EST, not 08:00");
  assert.equal(new Date(next).toISOString(), "2026-11-01T14:00:00.000Z");
  const weekday = waitUntil({ id: "w", kind: "wait", days: 0, hours: 1, weekday: [1, 2, 3, 4, 5], at: "09:00" }, from, "America/New_York");
  assert.equal(weekday, at("2026-11-02", "09:00", "America/New_York"), "Monday morning");
  assert.equal(waitUntil({ id: "w", kind: "wait", days: 2, hours: 3 }, 0, null), (2 * 24 + 3) * 3_600_000);
});

test("goals and branches read the contact as it is now", () => {
  assert.equal(goalMet([{ kind: "meeting_booked" }], { booked: true, lifecycle: null, outcome: null })?.kind, "meeting_booked");
  assert.equal(goalMet([{ kind: "outcome", outcomes: ["Qualified"] }], { booked: false, lifecycle: null, outcome: "Not a fit" }), null);
  const br = find(tree(), "br")!.step as Extract<Step, { kind: "branch" }>;
  assert.equal(branchYes(br, { "contact.seniority": "C-level" }), true);
  assert.equal(branchYes({ ...br, conds: [] }, {}), false, "no conditions never matches");
});

test("merge fields fill from the contact, take the fallback when blank, and a field with no fallback is a problem", () => {
  assert.equal(fillMerge("Hi {{first_name|there}}, from {{ company | your team }}", { first_name: "Dana", company: "" }), "Hi Dana, from your team");
  assert.equal(fillMerge("Hi {{first_name}}", {}), "Hi ");
  assert.equal(fillMerge("{{secret|x}}", { secret: "leak" }), "x", "only the known keys");
  assert.deepEqual(mergeGaps("Hi {{first_name}} and {{title|friend}}"), ["{{first_name}}"]);
});

test("the checks: what stops Make live, in words", () => {
  const body: Body = { ...emptyBody(), steps: [email("e1", false), { id: "b", kind: "branch", match: "all", conds: [], yes: [], no: [] }, { id: "h", kind: "webhook", url: "http://x.com" }] };
  const p = problems(body).map((x) => `${x.step}:${x.text}`);
  assert.ok(p.includes("e1:Approve the email"));
  assert.ok(p.includes("b:Add a condition"));
  assert.ok(p.includes("h:Webhooks need an https:// address"));
  const gap = problems({ ...emptyBody(), steps: [{ ...email("e2"), email: { subject: "Hi {{first_name}}", preheader: "", paragraphs: ["x"], cta_label: "", cta_url: "" } } as Step] });
  assert.match(gap[0]!.text, /fallback/);
  assert.deepEqual(problems({ ...emptyBody(), steps: [email("e3")] }), []);
  const deep: Step[] = [{ id: "a", kind: "split", percent: 50, a: [{ id: "b", kind: "split", percent: 50, a: [{ id: "c", kind: "split", percent: 50, a: [{ id: "d", kind: "split", percent: 50, a: [email("z")], b: [] }], b: [] }], b: [] }], b: [] }];
  assert.ok(problems({ ...emptyBody(), steps: deep }).some((x) => /levels deep/.test(x.text)));
});

test("a stored body is cleaned: unknown kinds dropped, numbers held to their limits, bad ids refused", () => {
  const c = cleanBody({ trigger: { kind: "nope" }, steps: [{ id: "ok", kind: "wait", days: 9999 }, { id: "x", kind: "rm -rf" }, { id: "bad id!", kind: "exit" }, { id: "s", kind: "split", percent: 500, a: [], b: [] }], entry: { mode: "repeat", gapDays: -4 } });
  assert.equal(c.trigger.kind, "form");
  assert.deepEqual(c.steps.map((s) => s.id), ["ok", "s"]);
  assert.equal((c.steps[0] as Extract<Step, { kind: "wait" }>).days, 365);
  assert.equal((c.steps[1] as Extract<Step, { kind: "split" }>).percent, 99);
  assert.deepEqual(c.entry, { mode: "repeat", gapDays: 1 });
});

test("the words: triggers, cards and Make live's list of changes", () => {
  assert.equal(triggerWords({ kind: "form", forms: ["f1"] }, { forms: { f1: "Demo request" } }), "When Demo request is sent");
  assert.equal(triggerWords({ kind: "meeting", events: ["no_show"], types: [] }), "When a meeting is a no-show");
  assert.equal(stepWords(wait("w", 2)), "Wait 2 days");
  assert.equal(stepWords(newStep("route")), "Find the right rep");
  const live: Body = { ...emptyBody(), steps: [email("e1"), wait("w1")] };
  const draft: Body = { ...live, steps: [wait("w1", 3), { ...email("e2") }] };
  assert.deepEqual(diffWords(live, draft), ["Changes: Wait 3 days", "Adds: Send \"Hi e2\"", "Removes: Send \"Hi e1\""]);
  assert.deepEqual(diffWords(null, draft), ["Goes live for the first time"]);
});

test("templates: each builds a clean body with unique step ids and its emails waiting for approval", () => {
  for (const t of TEMPLATES) {
    const b = t.body();
    assert.deepEqual(cleanBody(b), b, `${t.key} round-trips`);
    const ids: string[] = [];
    const all = (xs: Step[]) => xs.forEach((s) => ids.push(s.id));
    all(b.steps);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(problems(b).every((p) => p.step === null || /Approve|https|subject|email|Pick|Write/.test(p.text)), t.key);
  }
});

test("branch values come from the contact, its company and its latest answers; webhook secrets differ per workflow", () => {
  const facts = { contact: { id: "c", email: "dana@acme.com", email_class: "work", first_name: "Dana", last_name: null, title: "VP", seniority: "VP", department: "Sales", country: "US", region: null, lifecycle: "lead", lead_status: null, score: 70, score_band: "hot", qualify_outcome: "Qualified", timezone: null, owner: null, fields: { plan: "pro" }, deleted: false, merged_into: null, suppressed: false }, company: { name: "Acme", employees: 180 }, answers: { size: "50" }, booked: false, tz: null, owner: null } as Facts;
  const v = valuesOf(facts);
  assert.equal(v["lead.qualify"], "Qualified");
  assert.equal(v["company.size"], 180);
  assert.equal(v["contact.f.plan"], "pro");
  assert.equal(v["answer.size"], "50");
  assert.equal(v["contact.email_domain"], "acme.com");
  assert.notEqual(webhookSecret("a", "k".repeat(32)), webhookSecret("b", "k".repeat(32)));
});

test("the editor: typing in one field is one undo step, an edited email loses its approval, copies and nudges stay in their list", async () => {
  const { addStep, duplicateStep, editorReducer, nudge, patchStep, removeStep, startEditor } = await import("../src/components/app/workflows/model.ts");
  const b0: Body = { ...emptyBody(), steps: tree() };
  let s = startEditor(b0);
  s = editorReducer(s, { type: "set", body: patchStep(s.body, "e1", { email: { ...(find(s.body.steps, "e1")!.step as Extract<Step, { kind: "email" }>).email, subject: "A" } } as Partial<Step>), key: "e1:subject", at: 1000 });
  s = editorReducer(s, { type: "set", body: patchStep(s.body, "e1", { email: { ...(find(s.body.steps, "e1")!.step as Extract<Step, { kind: "email" }>).email, subject: "AB" } } as Partial<Step>), key: "e1:subject", at: 1500 });
  assert.equal(s.past.length, 1);
  const e1 = find(s.body.steps, "e1")!.step as Extract<Step, { kind: "email" }>;
  assert.equal(e1.email.subject, "AB");
  assert.equal(e1.approved, false);
  // Approving is itself a change, and keeps the approval.
  const ok = patchStep(s.body, "e1", { approved: true } as Partial<Step>);
  assert.equal((find(ok.steps, "e1")!.step as Extract<Step, { kind: "email" }>).approved, true);
  // A different field, or a pause over 1.5 s, starts a new undo step; undo and redo walk them.
  s = editorReducer(s, { type: "set", body: removeStep(s.body, "e4"), at: 1600 });
  assert.equal(s.past.length, 2);
  s = editorReducer(s, { type: "undo" });
  assert.ok(find(s.body.steps, "e4"));
  s = editorReducer(s, { type: "redo" });
  assert.equal(find(s.body.steps, "e4"), null);
  s = editorReducer(s, { type: "undo" });
  s = editorReducer(s, { type: "undo" });
  assert.deepEqual(s.body, b0);
  // A copy lands right under the original, inside the same path, unapproved and with new ids.
  const c = duplicateStep(b0, "e2");
  const w = find(c.body.steps, c.id!)!;
  assert.equal(w.parent?.step.id, "br");
  assert.equal(w.parent?.path, "yes");
  assert.equal(w.index, 1);
  assert.equal((w.step as Extract<Step, { kind: "email" }>).approved, false);
  // Nudging past either end of its list does nothing; inside it, it swaps.
  assert.deepEqual(nudge(b0, "e1", -1), b0);
  assert.deepEqual(nudge(b0, "e4", 1), b0);
  assert.deepEqual(nudge(b0, "e1", 1).steps.map((x) => x.id), ["br", "e1", "e4"]);
  assert.deepEqual(nudge(nudge(b0, "e1", 1), "e1", -1), b0);
  // Adding into an empty path.
  const added = addStep(b0, { parent: "sp", path: "b", index: 0 }, newStep("task"));
  assert.equal((find(added.steps, "sp")!.step as Extract<Step, { kind: "split" }>).b.length, 1);
});

test("an email built with blocks: checked for words, links, images and its footer, and read safely", async () => {
  const { stepProblems, cleanBody } = await import("../src/lib/workflows/check.ts");
  const step = (blocks: object[]) => ({ id: "e1", kind: "email", from: "team", approved: true, email: { subject: "Hi", preheader: "", paragraphs: [], cta_label: "", cta_url: "", doc: { sections: [{ id: "s1", columns: [{ id: "c1", blocks }] }] } } });
  const clean = (blocks: object[]) => cleanBody({ trigger: { kind: "manual" }, steps: [step(blocks)] }).steps[0]!;
  assert.deepEqual(stepProblems(clean([{ id: "f", type: "footer" }])), ["Write the email"]);
  assert.deepEqual(stepProblems(clean([{ id: "h", type: "heading", text: "Hi {{first_name}}" }])), ["Add the Footer block", "Give {{first_name}} a fallback, like {{first_name|there}}"]);
  assert.deepEqual(stepProblems(clean([{ id: "b", type: "button", label: "Go", url: "http://x.io" }, { id: "i", type: "image", src: "" }, { id: "f", type: "footer" }])), ["The button needs an https:// link", "Add the image or remove its block"]);
  assert.deepEqual(stepProblems(clean([{ id: "h", type: "heading", text: "Hi {{first_name|there}}" }, { id: "f", type: "footer" }])), [], "the footer's own merge tags need no fallback");
  const read = clean([{ id: "t", type: "text", html: "<p onclick=x>ok<script>bad()</script></p>" }]) as { email: { doc: { sections: { columns: { blocks: { html: string }[] }[] }[] } } };
  assert.equal(read.email.doc.sections[0]!.columns[0]!.blocks[0]!.html, "<p>ok</p>");
});
