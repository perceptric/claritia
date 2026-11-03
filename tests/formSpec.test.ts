// The form spec (docs/forms.md Part 2): the checker, the round trip to the saved form and back, the layout rules, and
// edits that can't break a form. Every spec that passes the checker turns into a form the form checker passes, and the
// live form's own engine (visibility, nextStep, checkAnswers) runs its logic the way the spec says.
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkForm, emptyForm, nextStep, visibility, type Form } from "../src/lib/forms/schema.ts";
import { checkAnswers, stepPath } from "../src/lib/forms/values.ts";
import { STARTERS, TEMPLATES } from "../src/lib/forms/templates.ts";
import { applyEdits, fitLayout, fromForm, lintSpec, outline, questionCount, toForm, toOnePage, toSteps, type Spec } from "../src/lib/forms/spec.ts";

const base = (): Form => ({ ...emptyForm(), consent: { mode: "off", label: "x" } });
const ok = (f: Form) => {
  const c = checkForm(f);
  assert.ok("form" in c, "errors" in c ? c.errors.join("; ") : "");
  return (c as { form: Form }).form;
};

/** A lead form with logic on a field and on a step. */
const leadSpec = (): Spec => ({
  title: "Talk to sales",
  submit: "Send",
  steps: [
    {
      id: "s1",
      title: "Your team",
      fields: [
        { id: "size", type: "radio", label: "Team size", required: true, options: [{ value: "small", label: "1-10" }, { value: "big", label: "11+" }] },
        { id: "budget", type: "number", label: "Budget", show: { match: "all", conds: [{ field: "size", op: "is", value: "big" }] } },
        { id: "files", type: "file", label: "Your brief", files: { kinds: ["pdf"], maxMb: 5 } },
      ],
    },
    { id: "s2", title: "Enterprise", show: { field: "size", op: "is", value: "big" }, fields: [{ id: "sso", type: "yesno", label: "Need SSO?", required: true }] },
    {
      id: "s3",
      title: "About you",
      fields: [
        { id: "em", type: "email", label: "Work email", key: "email", required: true },
        { id: "nm", type: "text", label: "First name", key: "first_name" },
      ],
    },
  ],
});

test("a spec that passes the checker becomes a form the form checker passes", () => {
  const s = leadSpec();
  assert.deepEqual(lintSpec(s, { needEmail: true }), []);
  const f = ok(toForm(s, base()));
  assert.equal(f.steps.length, 3);
  assert.equal(f.title, "Talk to sales");
  assert.equal(f.submit.label, "Send");
  // Keys: contact keys kept, the rest made from labels.
  const keys = f.steps.flatMap((st) => st.fields.map((x) => x.key));
  assert.deepEqual(keys, ["q.team_size", "q.budget", "q.your_brief", "q.need_sso", "email", "first_name"]);
  // The step's condition is a path on the step before it, going past it when the answer isn't "big".
  assert.deepEqual(f.steps[0]!.jumps, [{ when: { field: "size", op: "is_not", value: "big" }, to: 2 }]);
  const sso = f.steps[1]!.fields[0]!;
  assert.equal(sso.type, "choice");
  assert.deepEqual(sso.options?.map((o) => o.value), ["yes", "no"]);
});

test("the live form's engine runs the spec's logic", () => {
  const f = ok(toForm(leadSpec(), base()));
  // Small team: budget hidden, the Enterprise step skipped, SSO not required.
  assert.equal(visibility(f, { size: "small" }).shown.has("budget"), false);
  assert.equal(nextStep(f, 0, { size: "small" }), 2);
  assert.deepEqual(stepPath(f, { size: "small" }), [0, 2]);
  const small = checkAnswers(f, { size: "small", em: "a@acme.com" });
  assert.deepEqual(small.errors, {});
  // Big team: budget shows, the Enterprise step shows and its question is required.
  assert.equal(visibility(f, { size: "big" }).shown.has("budget"), true);
  assert.equal(nextStep(f, 0, { size: "big" }), 1);
  const big = checkAnswers(f, { size: "big", em: "a@acme.com" });
  assert.ok(big.errors.sso, "SSO is required on the step that shows");
});

test("flaky case: an answer to a question that later hides is dropped, and a hidden required question never blocks", () => {
  const f = ok(toForm(leadSpec(), base()));
  // Picked big, typed a budget and answered SSO, then went back and picked small.
  const r = checkAnswers(f, { size: "small", budget: "50000", sso: "yes", em: "a@acme.com" });
  assert.deepEqual(r.errors, {});
  assert.equal(r.values["q.budget"], undefined);
  assert.equal(r.values["q.need_sso"], undefined);
  assert.equal(r.values.email, "a@acme.com");
});

test("round trip: every template reads as a spec and comes back the same", () => {
  for (const t of [...TEMPLATES.map((x) => x.form()), ...STARTERS.map((x) => x.form())]) {
    const form = ok(t);
    const back = ok(toForm(fromForm(form), form));
    assert.deepEqual(back, form);
  }
});

test("round trip keeps what the spec can't show: calculations, paths, hide rules and CRM links", () => {
  const form = ok({
    ...base(),
    steps: [
      {
        id: "a",
        fields: [
          { id: "q1", key: "q.seats", type: "number", label: "Seats", required: true, crm: { source: "00000000-0000-0000-0000-000000000001", property: "seats" }, width: "half" },
          { id: "q2", key: "q.total", type: "calc", label: "Total", required: false, calc: { formula: "{q1} * 10", format: "money", currency: "USD" } },
          { id: "q3", key: "q.notes", type: "textarea", label: "Notes", required: false },
        ],
        jumps: [{ when: { field: "q1", op: "gt", value: "100" }, to: 2 }],
      },
      { id: "b", fields: [{ id: "q4", key: "email", type: "email", label: "Email", required: true }] },
      { id: "c", fields: [{ id: "q5", key: "q.why", type: "text", label: "Why", required: false }] },
    ],
    rules: [{ id: "h1", when: { field: "q1", op: "lt", value: "2" }, then: { action: "hide", field: "q3" } }],
  });
  const spec = fromForm(form);
  assert.equal(spec.steps[0]!.fields[1]!.type, "locked");
  assert.equal(spec.rules?.length, 1);
  // gt can't be turned over exactly, so the path stays as it was.
  assert.equal(spec.steps[1]!.show, undefined);
  assert.ok(spec.steps[0]!.raw?.jumps);
  assert.deepEqual(ok(toForm(spec, form)), form);
  // A new question added in the builder doesn't disturb any of it.
  const r = applyEdits(spec, [{ op: "add_field", step: "c", field: { type: "text", label: "Role" } }]);
  assert.ok("spec" in r);
  const after = ok(toForm(r.spec, form));
  assert.deepEqual(after.steps[0], form.steps[0]);
  assert.deepEqual(after.rules, form.rules);
});

test("a step's path survives moving steps, by step id, and drops when it would point back", () => {
  const form = ok({
    ...base(),
    steps: [
      { id: "a", fields: [{ id: "q1", key: "q.n", type: "number", label: "N", required: false }], jumps: [{ when: { field: "q1", op: "gt", value: "5" }, to: 3 }] },
      { id: "b", fields: [{ id: "q2", key: "q.x", type: "text", label: "X", required: false }] },
      { id: "c", fields: [{ id: "q3", key: "q.y", type: "text", label: "Y", required: false }] },
      { id: "d", fields: [{ id: "q4", key: "email", type: "email", label: "Email", required: true }] },
    ],
  });
  const spec = fromForm(form);
  const moved = applyEdits(spec, [{ op: "move_step", id: "c", index: 1 }]);
  assert.ok("spec" in moved);
  assert.deepEqual(ok(toForm(moved.spec, form)).steps[0]!.jumps, [{ when: { field: "q1", op: "gt", value: "5" }, to: 3 }]);
  const back = applyEdits(spec, [{ op: "move_step", id: "d", index: 1 }]);
  assert.ok("spec" in back);
  assert.equal(ok(toForm(back.spec, form)).steps[0]!.jumps, undefined);
});

test("the checker catches what Claude gets wrong", () => {
  const bad: Spec = {
    submit: "Send",
    steps: [
      {
        id: "s1",
        fields: [
          { id: "a", type: "dropdown", label: "Plan", options: [] },
          { id: "b", type: "text", label: "Why", show: { match: "any", conds: [{ field: "c", op: "filled" }] } },
          { id: "c", type: "text", label: "Other" },
          { id: "c", type: "radio", label: "Again", options: [{ value: "x", label: "X" }] },
          { id: "d", type: "text", label: "Size", show: { match: "any", conds: [{ field: "a", op: "is", value: "nope" }] } },
        ],
      },
    ],
  };
  const texts = lintSpec(bad, { needEmail: true }).map((p) => p.text);
  assert.ok(texts.includes("Plan needs at least one option."));
  assert.ok(texts.includes("Why shows on a question that isn't before it."));
  assert.ok(texts.some((t) => t.includes("repeated id")));
  assert.ok(texts.some((t) => t.includes("an option Plan doesn't have")));
  assert.ok(texts.includes("Add an email question, so each answer becomes a contact."));
});

test("two steps in a row can't both have conditions, and the first step always shows", () => {
  const s = leadSpec();
  s.steps[0]!.show = { field: "size", op: "filled" };
  s.steps[2]!.show = { field: "sso", op: "is", value: "yes" };
  const texts = lintSpec(s).map((p) => p.text);
  assert.ok(texts.includes("The first page always shows."));
  assert.ok(texts.some((t) => t.startsWith("Pages 2 and 3 both have conditions")));
});

test("edits are all or none: one bad edit leaves the spec as it was", () => {
  const s = leadSpec();
  const r = applyEdits(s, [
    { op: "update_field", id: "budget", set: { label: "Yearly budget" } },
    { op: "update_field", id: "ghost", set: { label: "Nope" } },
  ]);
  assert.deepEqual(r, { error: "That question isn't on the form." });
  assert.equal(s.steps[0]!.fields[1]!.label, "Budget");
  // An edit that would break the form is refused with the checker's words.
  const broken = applyEdits(s, [{ op: "update_field", id: "size", set: { options: [] } }]);
  assert.ok("error" in broken && broken.error.includes("at least one option"));
});

test("removing a question removes the conditions that read it", () => {
  const r = applyEdits(leadSpec(), [{ op: "remove_field", id: "size" }]);
  assert.ok("spec" in r);
  assert.equal(r.spec.steps[0]!.fields[0]!.show, undefined);
  assert.equal(r.spec.steps[1]!.show, undefined);
});

test("changing a question's type tidies what the old type had", () => {
  const r = applyEdits(leadSpec(), [{ op: "update_field", id: "nm", set: { type: "dropdown" } }]);
  assert.ok("spec" in r);
  const f = r.spec.steps[2]!.fields[1]!;
  assert.equal(f.key, undefined, "first name can't be a dropdown, so it saves on the fill");
  assert.equal(f.options?.length, 1);
});

test("layout rules: too many questions for one page become steps, and contact details go last", () => {
  const fields = Array.from({ length: 10 }, (_, i) => ({ id: `q${i}`, type: "text" as const, label: `Question ${i}` }));
  const s: Spec = { submit: "Send", steps: [{ id: "s1", fields: [{ id: "em", type: "email", label: "Email", key: "email", required: true }, ...fields] }] };
  const r = fitLayout(s);
  assert.ok(r.changed);
  assert.ok(r.spec.steps.length > 1);
  assert.deepEqual(r.spec.steps.at(-1)!.fields.map((f) => f.id), ["em"]);
  assert.ok(r.spec.steps.every((st) => st.fields.length <= 6));
  assert.deepEqual(lintSpec(r.spec), []);
  assert.equal(questionCount(r.spec), 11);
});

test("layout rules: a short form in steps becomes one page, keeping step titles as headings", () => {
  const s: Spec = {
    submit: "Send",
    steps: [
      { id: "s1", title: "Start", fields: [{ id: "a", type: "text", label: "A" }] },
      { id: "s2", title: "More", fields: [{ id: "em", type: "email", label: "Email", key: "email" }] },
    ],
  };
  const r = fitLayout(s);
  assert.equal(r.spec.steps.length, 1);
  assert.deepEqual(r.spec.steps[0]!.fields.map((f) => f.type), ["text", "heading", "email"]);
});

test("one page carries a step's condition onto its questions, and refuses when that can't be said exactly", () => {
  const one = toOnePage(leadSpec());
  assert.ok(one);
  const sso = one.steps[0]!.fields.find((f) => f.id === "sso")!;
  assert.deepEqual(sso.show, { match: "all", conds: [{ field: "size", op: "is", value: "big" }] });
  const f = ok(toForm(one, base()));
  assert.equal(checkAnswers(f, { size: "small", em: "a@acme.com" }).errors.sso, undefined);
  assert.ok(checkAnswers(f, { size: "big", em: "a@acme.com" }).errors.sso);
  // A question that shows on any of two answers, on a step with its own condition: no exact one page.
  const s = leadSpec();
  s.steps[1]!.fields.push({ id: "x", type: "text", label: "X", show: { match: "any", conds: [{ field: "size", op: "is", value: "big" }, { field: "budget", op: "filled" }] } });
  assert.equal(toOnePage(s), null);
});

test("steps and back again keeps every question", () => {
  const one = toOnePage(leadSpec())!;
  const again = toSteps(one);
  // Headings turn into step titles; every question stays.
  const qs = (fs: { id: string; type: string }[]) => fs.filter((f) => f.type !== "heading").map((f) => f.id).sort();
  assert.deepEqual(qs(again.steps.flatMap((st) => st.fields)), qs(one.steps[0]!.fields));
  assert.deepEqual(lintSpec(again), []);
  assert.deepEqual(outline(again).map((o) => o.items.length).reduce((a, b) => a + b, 0), questionCount(again));
});

test("two questions that both save as email: the second gets its own answer key", () => {
  const s: Spec = {
    submit: "Send",
    steps: [
      {
        id: "s1",
        fields: [
          { id: "a", type: "email", label: "Email", key: "email" },
          { id: "b", type: "email", label: "Other email", raw: { id: "b", key: "email", type: "email", label: "Other email", required: false } },
        ],
      },
    ],
  };
  assert.ok(lintSpec(s).some((p) => p.text.startsWith("Two questions save as")));
  const f = ok(toForm(s, base()));
  assert.deepEqual(f.steps[0]!.fields.map((x) => x.key), ["email", "q.other_email"]);
});
