// New form's AI steps (docs/forms.md Part 6), with a fake model: the plan's layout rules, the build's check and fix
// round, and edits that apply all or none. The flaky cases: Claude answers with a broken form first, or edits that
// point at a question that isn't there, or no JSON at all.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildForm, checkPlan, editForm, editsFromAi, parseJson, planForm, specFromAi, type Caller, type Plan } from "../src/lib/forms/specAi.ts";
import { lintSpec, type Spec } from "../src/lib/forms/spec.ts";

const usage = { input_tokens: 10, output_tokens: 10 } as never;
/** A fake model that answers each call with the next text in the list, and records what it was sent. */
function fake(answers: (string | null)[], thinking = "") {
  const sent: Parameters<Caller>[0][] = [];
  const call: Caller = async (p) => {
    sent.push(p);
    if (thinking && p.onThinking) p.onThinking(thinking);
    const a = answers.shift();
    return a === null || a === undefined ? null : { text: a, thinking, usage };
  };
  return { call, sent };
}

const field = (o: Record<string, unknown>) => ({ saves_as: "", required: false, placeholder: "", help: "", options: [], file_kinds: [], max_mb: 0, scale: 0, show: { match: "any", conds: [] }, ...o });
const cond = (o: Record<string, unknown>) => ({ field: "", op: "filled", value: "", values: [], ...o });
const goodForm = () => ({
  name: "Demo request",
  title: "Book a demo",
  intro: "",
  submit: "Book my demo",
  steps: [
    {
      id: "s1",
      title: "Your team",
      show: cond({}),
      fields: [
        field({ id: "size", type: "radio", label: "Team size", required: true, options: [{ value: "small", label: "1-10", image: "" }, { value: "big", label: "11+", image: "" }] }),
        field({ id: "tools", type: "checkboxes", label: "Tools you use", options: [{ value: "hubspot", label: "HubSpot", image: "" }, { value: "sheets", label: "Sheets", image: "" }] }),
      ],
    },
    {
      id: "s2",
      title: "Enterprise",
      show: cond({ field: "size", op: "is", value: "big" }),
      fields: [field({ id: "sso", type: "yesno", label: "Need SSO?" }), field({ id: "rfp", type: "file", label: "Your RFP", file_kinds: ["pdf"], max_mb: 10 })],
    },
    {
      id: "s3",
      title: "About you",
      show: cond({}),
      fields: [field({ id: "Work Email!", type: "email", label: "Work email", saves_as: "email", required: true }), field({ id: "name", type: "text", label: "First name", saves_as: "first_name" })],
    },
  ],
  thanks: { title: "Thanks!", text: "We'll email you a time today." },
  questions: [
    { id: "q1", question: "Ask for budget?", kind: "choice", options: ["Yes", "No"] },
    { id: "q2", question: "Bad one", kind: "choice", options: ["Only one"] },
  ],
});
const plan: Plan = { name: "Demo request", layout: "steps", why: "It qualifies first.", steps: [{ title: "Team", items: ["Size", "Tools"] }, { title: "You", items: ["Email", "Name"] }, { title: "More", items: ["SSO"] }], needsEmail: true };

test("JSON in a fence, or no JSON at all", () => {
  assert.deepEqual(parseJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.equal(parseJson("Sorry, I can't."), null);
  assert.equal(parseJson("{broken"), null);
});

test("the plan's layout rules: 10 questions on one page become steps; 3 in steps become one page", () => {
  const long = checkPlan({ ...plan, layout: "page", steps: [{ title: "All", items: Array.from({ length: 10 }, (_, i) => `Q${i}`) }] });
  assert.equal(long.layout, "steps");
  assert.equal(long.steps.length, 3);
  assert.ok(long.changed);
  const short = checkPlan({ ...plan, steps: [{ title: "A", items: ["x", "y"] }, { title: "B", items: ["z"] }] });
  assert.equal(short.layout, "page");
  assert.equal(short.steps.length, 1);
  assert.equal(checkPlan(plan).changed, undefined);
});

test("the plan streams its thinking and comes back checked", async () => {
  const seen: string[] = [];
  const f = fake([JSON.stringify({ name: "Intake", layout: "page", why: "Short.", steps: [{ title: "x", items: Array.from({ length: 9 }, (_, i) => `q${i}`) }], needs_email: true })], "Nine questions, so...");
  const r = await planForm(f.call, { brief: null, note: "patient intake" }, (t) => seen.push(t));
  assert.ok(r);
  assert.deepEqual(seen, ["Nine questions, so..."]);
  assert.equal(r.thinking, "Nine questions, so...");
  assert.equal(r.plan.layout, "steps");
  assert.equal(await planForm(fake(["no json"]).call, { brief: null, note: "x" }), null);
});

test("Claude's form becomes a spec: ids made safe and the conditions that use them renamed, one-option questions dropped", () => {
  const r = specFromAi(goodForm());
  assert.ok(r);
  assert.deepEqual(lintSpec(r.spec, { needEmail: true }), []);
  const email = r.spec.steps[2]!.fields[0]!;
  assert.equal(email.id, "workemail");
  assert.equal(email.key, "email");
  assert.deepEqual(r.spec.steps[1]!.show, { field: "size", op: "is", value: "big" });
  assert.deepEqual(r.spec.steps[1]!.fields[1]!.files, { kinds: ["pdf"], maxMb: 10 });
  assert.equal(r.questions.length, 1);
  assert.equal(r.thanks.text, "We'll email you a time today.");
});

test("flaky case: a broken form first, fixed on the second round", async () => {
  const broken = goodForm();
  // A condition pointing forward, and a dropdown with no options.
  broken.steps[0]!.fields[0]!.show = { match: "any", conds: [cond({ field: "sso", op: "filled" })] } as never;
  broken.steps[0]!.fields.push(field({ id: "plan", type: "dropdown", label: "Plan", options: [] }) as never);
  const f = fake([JSON.stringify(broken), JSON.stringify(goodForm())]);
  const r = await buildForm(f.call, { brief: null, note: "demo form", plan });
  assert.ok(r);
  assert.equal(r.rounds, 2);
  assert.equal(f.sent.length, 2);
  const fixAsk = f.sent[1]!.history!.at(-1)!.content as string;
  assert.match(fixAsk, /shows on a question that isn't before it/);
  assert.match(fixAsk, /Plan needs at least one option/);
  assert.deepEqual(lintSpec(r.spec, { needEmail: true }), []);
});

test("flaky case: broken twice gives nothing, never a broken form", async () => {
  const broken = goodForm();
  broken.steps[2]!.fields = [];
  const r = await buildForm(fake([JSON.stringify(broken), JSON.stringify(broken)]).call, { brief: null, note: "x", plan });
  assert.equal(r, null);
  assert.equal(await buildForm(fake([null]).call, { brief: null, note: "x", plan }), null);
  assert.equal(await buildForm(fake(["not json", null]).call, { brief: null, note: "x", plan }), null);
});

test("a built form with no email when the plan takes leads goes back for a fix", async () => {
  const noEmail = goodForm();
  noEmail.steps[2]!.fields = [field({ id: "name", type: "text", label: "First name", saves_as: "first_name" })] as never;
  const f = fake([JSON.stringify(noEmail), JSON.stringify(goodForm())]);
  const r = await buildForm(f.call, { brief: null, note: "x", plan });
  assert.ok(r);
  assert.match(f.sent[1]!.history!.at(-1)!.content as string, /Add an email question/);
});

const spec = (): Spec => specFromAi(goodForm())!.spec;
const edit = (o: Record<string, unknown>) => ({ op: "add_field", id: "", step: "", after: "", index: 0, title: "", intro: "", submit: "", field: field({ id: "", type: "text", label: "" }), show: cond({}), ...o });

test("an answer becomes small edits: the rest of the form doesn't change", async () => {
  const before = spec();
  const f = fake([JSON.stringify({ edits: [edit({ step: "s1", after: "size", field: field({ id: "budget", type: "number", label: "Budget", show: { match: "any", conds: [cond({ field: "size", op: "is", value: "big" })] } }) })], reply: "Added budget" })]);
  const r = await editForm(f.call, { spec: before, ask: "Ask for budget? Yes", needEmail: true });
  assert.ok(!("error" in r));
  assert.equal(r.changed, 1);
  assert.deepEqual(r.spec.steps[0]!.fields.map((x) => x.id), ["size", "budget", "tools"]);
  assert.deepEqual(r.spec.steps.slice(1), before.steps.slice(1));
});

test("replace_field keeps where the answer saves when Claude leaves it out", () => {
  const s = spec();
  const r = editsFromAi({ edits: [edit({ op: "replace_field", id: "workemail", field: field({ id: "workemail", type: "email", label: "Your email", required: true }) })], reply: "" }, s);
  assert.ok(r);
  const e = r.edits[0]!;
  assert.equal(e.op, "update_field");
  assert.equal(e.op === "update_field" && e.set.key, "email");
});

test("flaky case: edits that name a question that isn't there go back once, and a second miss changes nothing", async () => {
  const before = spec();
  const ghost = JSON.stringify({ edits: [edit({ op: "remove_field", id: "ghost" })], reply: "" });
  const good = JSON.stringify({ edits: [edit({ op: "remove_field", id: "tools" })], reply: "Removed tools" });
  const f = fake([ghost, good]);
  const r = await editForm(f.call, { spec: before, ask: "drop the tools question", needEmail: true });
  assert.ok(!("error" in r));
  assert.equal(r.spec.steps[0]!.fields.length, 1);
  assert.match(f.sent[1]!.history!.at(-1)!.content as string, /That question isn't on the form/);
  const twice = await editForm(fake([ghost, ghost]).call, { spec: before, ask: "x", needEmail: true });
  assert.ok("error" in twice);
  // Removing the only email is refused by the checker, so the form never loses it.
  const noEmail = await editForm(fake([JSON.stringify({ edits: [edit({ op: "remove_field", id: "workemail" })], reply: "" }), null]).call, { spec: before, ask: "remove email", needEmail: true });
  assert.ok("error" in noEmail && /email/.test(noEmail.error));
});

test("no edits needed: the form stays and the reply says why", async () => {
  const r = await editForm(fake([JSON.stringify({ edits: [], reply: "It already asks that." })]).call, { spec: spec(), ask: "ask for email", needEmail: true });
  assert.ok(!("error" in r));
  assert.equal(r.changed, 0);
  assert.equal(r.reply, "It already asks that.");
});
