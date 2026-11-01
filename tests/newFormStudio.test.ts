// The live New form (docs/new-form-studio.md): the sketch from one line, one answer at a time folded in, and the
// changes that need no AI (one page or steps, what happens after the send). Every draft shown passes the checker.
import assert from "node:assert/strict";
import { test } from "node:test";
import { refineForm, sketchForm, type Caller } from "../src/lib/forms/aiBuild.ts";
import { applyAfter, outline, placeholderForm, toOnePage, toSteps } from "../src/lib/forms/newForm.ts";
import { allFields, checkForm, emptyForm, type Field, type Form } from "../src/lib/forms/schema.ts";

const f = (id: string, label: string, extra: Partial<Field> = {}): Field => ({ id, key: `q.${id}`, type: "text", label, required: false, ...extra });
const EMAIL: Field = { id: "e", key: "email", type: "email", label: "Email", required: true };
const NAME: Field = { id: "n", key: "name", type: "text", label: "Name", required: false };
const ok = (x: unknown): Form => {
  const r = checkForm(x);
  if ("errors" in r) throw new Error(r.errors.join(" "));
  return r.form;
};
const INTAKE = { name: "Patient intake", kind: "consent", form: { steps: [{ id: "s1", fields: [f("dob", "Date of birth"), f("hist", "Medical history", { type: "textarea" }), { id: "sig", key: "q.sig", type: "signature", label: "Signature", required: true }, EMAIL] }], consent: { mode: "always", label: "I agree", required: true } }, summary: { built: ["An intake form"] }, questions: [{ id: "Bad Id", question: "Which insurers do you take?", kind: "multi", options: ["Aetna", "Cigna"] }, { id: "x", question: " ", kind: "text", options: [] }] };

test("the sketch picks the kind from the line, builds a form that passes, and keeps only real questions", async () => {
  const seen: string[] = [];
  const call: Caller = async (p) => {
    seen.push(p.system);
    return { text: JSON.stringify(INTAKE), usage: {} as never };
  };
  const s = await sketchForm(call, { brief: null, note: "patient intake with consent and insurance card upload", site: "" });
  assert.ok(s);
  assert.equal(s.kind, "consent");
  assert.equal(s.form.kind, "consent");
  assert.deepEqual(s.questions.map((q) => [q.id, q.kind]), [["q1", "multi"]]);
  assert.match(seen[0]!, /THE FIRST SKETCH/);
});

test("the sketch goes back to the model when the kind's must-have is missing", async () => {
  const replies = [JSON.stringify({ ...INTAKE, form: { ...INTAKE.form, steps: [{ id: "s1", fields: [f("dob", "Date of birth"), EMAIL] }] } }), JSON.stringify(INTAKE)];
  const call: Caller = async () => ({ text: replies.shift()!, usage: {} as never });
  const s = await sketchForm(call, { brief: null, note: "a photo release waiver", site: "", kind: "consent" });
  assert.ok(s);
  assert.equal(s.rounds, 2);
});

test("refine folds one answer in and returns a form that passes, or nothing", async () => {
  const draft = ok({ ...emptyForm(), steps: [{ id: "s1", fields: [EMAIL] }] });
  const call: Caller = async (p) => {
    assert.match(p.system, /ONE CHANGE/);
    assert.match(p.user, /Which insurers/);
    return { text: JSON.stringify({ name: "Intake", form: { ...draft, steps: [{ id: "s1", fields: [f("ins", "Insurer", { type: "choice", options: [{ value: "aetna", label: "Aetna" }] }), EMAIL] }] } }), usage: {} as never };
  };
  const r = await refineForm(call, { form: draft, kind: "lead", question: "Which insurers do you take?", answer: ["Aetna"], brief: null });
  assert.ok(r);
  assert.equal(allFields(r.form).length, 2);
  const broken: Caller = async () => ({ text: JSON.stringify({ form: { steps: [] } }), usage: {} as never });
  assert.equal(await refineForm(broken, { form: draft, kind: "lead", question: "q", answer: "a", brief: null }), null);
});

test("one page and steps switch back and forth, and every result passes", () => {
  const one = ok({ ...emptyForm(), steps: [{ id: "s1", fields: [f("a", "A"), f("b", "B"), f("c", "C"), f("d", "D"), NAME, EMAIL] }] });
  const steps = toSteps(one);
  assert.ok(!("errors" in checkForm(steps)));
  assert.equal(steps.steps.length, 3);
  assert.deepEqual(steps.steps[2]!.fields.map((x) => x.key), ["name", "email"], "contact details together, last");
  const back = toOnePage(steps);
  assert.equal(back.steps.length, 1);
  assert.equal(allFields(back).length, 6);
  assert.deepEqual(outline(steps).map((s) => s.questions), [3, 1, 2]);
});

test("after the send: a page, a meeting, or their results by email", () => {
  const fm = ok({ ...emptyForm(), steps: [{ id: "s1", fields: [EMAIL] }] });
  assert.deepEqual(applyAfter(fm, { kind: "page", url: "https://acme.com/thanks" }).after.end, { kind: "redirect", url: "https://acme.com/thanks" });
  const meet = applyAfter(fm, { kind: "meeting", meetingTypeId: "0192f3a1-0000-7000-8000-0000000000aa" });
  assert.equal(meet.after.schedule?.meetingTypeId, "0192f3a1-0000-7000-8000-0000000000aa");
  assert.equal(applyAfter(fm, { kind: "meeting", meetingTypeId: null }).after.schedule, undefined, "a new meeting is made later");
  const withResults = ok({ ...emptyForm(), steps: [{ id: "s1", fields: [EMAIL] }, { id: "s2", result: true, fields: [{ id: "r", key: "c.r", type: "result", label: "", required: false, result: { kind: "outcome" } }] }], results: { show: "instant", outcomes: [{ id: "all", title: "Thanks" }] } });
  const mailed = applyAfter(withResults, { kind: "results" });
  assert.ok(allFields(mailed).some((x) => x.result?.kind === "email"));
  assert.ok(!("errors" in checkForm(mailed)));
  assert.equal(placeholderForm("Patient intake").title, "Patient intake");
});
