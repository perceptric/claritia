// Form kinds, step 1 (docs/form-kinds-plan.md): paths by answer that end early or jump ahead, forms with no email,
// and split screens. Each case is one a visitor can hit on a live form.
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyOp } from "../src/lib/forms/ops.ts";
import { checkForm, emptyForm, nextStep, type Field, type Form } from "../src/lib/forms/schema.ts";
import { prepareSubmit } from "../src/lib/forms/submit.ts";
import { stepPath } from "../src/lib/forms/values.ts";

const EMAIL: Field = { id: "e", key: "email", type: "email", label: "Email", required: true };
const FIT: Field = { id: "fit", key: "q.fit", type: "choice", label: "Team size", required: true, options: [{ value: "solo", label: "Just me" }, { value: "team", label: "A team" }] };
const q = (id: string, required = true): Field => ({ id, key: `q.${id}`, type: "text", label: id, required });
const ok = (f: unknown): Form => {
  const r = checkForm(f);
  if ("errors" in r) throw new Error(r.errors.join(" "));
  return r.form;
};
const must = (r: ReturnType<typeof applyOp>): Form => {
  if ("error" in r) throw new Error(r.error);
  return r.form;
};
const send = (fm: Form, answers: Record<string, unknown>) => prepareSubmit(fm, 1, { v: 1, version: 1, key: "k".repeat(20), answers, ms: 9000 }, { custom: [] });

const threeSteps = (jumps: { to: number }[]) =>
  ok({ ...emptyForm(), steps: [{ id: "s1", fields: [FIT], jumps: jumps.map((j) => ({ when: { field: "fit", op: "is", value: "solo" }, to: j.to })) }, { id: "s2", fields: [q("a")] }, { id: "s3", fields: [EMAIL] }] });

test("a path to the end sends the form there, and the steps after it aren't required", () => {
  const fm = threeSteps([{ to: 3 }]);
  assert.equal(nextStep(fm, 0, { fit: "solo" }), 3);
  assert.equal(nextStep(fm, 0, { fit: "team" }), 1);
  assert.deepEqual(stepPath(fm, { fit: "solo" }), [0]);
  // No email and no answer to "a": a clear no is kept, with no contact.
  const r = send(fm, { fit: "solo" });
  assert.ok("args" in r, JSON.stringify(r));
  assert.equal(r.args.p_contact, null);
  // The other path still needs everything.
  const r2 = send(fm, { fit: "team" });
  assert.ok("errors" in r2);
});

test("a path to a later step jumps over the ones between", () => {
  const fm = threeSteps([{ to: 2 }]);
  assert.equal(nextStep(fm, 0, { fit: "solo" }), 2);
  assert.deepEqual(stepPath(fm, { fit: "solo", e: "ana@acme.com" }), [0, 2]);
});

test("paths that go nowhere new are refused", () => {
  const r = checkForm({ ...emptyForm(), steps: [{ id: "s1", fields: [FIT], jumps: [{ when: { field: "fit", op: "is", value: "solo" }, to: 1 }] }, { id: "s2", fields: [q("a")] }, { id: "s3", fields: [EMAIL] }] });
  assert.ok("errors" in r && r.errors.some((e) => /path to a step/.test(e)));
});

test("removing a step keeps paths pointing at the same place, and adding one keeps the end the end", () => {
  const fm = ok({ ...emptyForm(), steps: [{ id: "s1", fields: [FIT], jumps: [{ when: { field: "fit", op: "is", value: "solo" }, to: 4 }, { when: { field: "fit", op: "is", value: "team" }, to: 3 }] }, { id: "s2", fields: [q("a")] }, { id: "s3", fields: [q("b")] }, { id: "s4", fields: [EMAIL] }] });
  const less = must(applyOp(fm, { op: "remove_step", index: 1 }));
  assert.deepEqual(less.steps[0]!.jumps!.map((j) => j.to), [3, 2]);
  assert.ok(!("errors" in checkForm(less)));
  const more = must(applyOp(fm, { op: "add_step", title: "Extra" }));
  assert.deepEqual(more.steps[0]!.jumps!.map((j) => j.to), [5, 3]);
});

test("a form with email optional saves fills with and without one", () => {
  const fm = ok({ ...emptyForm(), emailOptional: true, steps: [{ id: "s1", fields: [{ id: "nps", key: "q.nps", type: "rating", label: "How likely?", required: true }, { ...EMAIL, required: false }] }] });
  const none = send(fm, { nps: "4" });
  assert.ok("args" in none, JSON.stringify(none));
  assert.equal(none.args.p_contact, null);
  const some = send(fm, { nps: "4", e: "ana@acme.com" });
  assert.ok("args" in some);
  assert.equal(some.args.p_contact?.email, "ana@acme.com");
  const bad = send(fm, { nps: "4", e: "not an email" });
  assert.ok("errors" in bad);
  // And with no email question at all.
  assert.ok(!("errors" in checkForm({ ...emptyForm(), emailOptional: true, steps: [{ id: "s1", fields: [q("x")] }] })));
  assert.ok("errors" in checkForm({ ...emptyForm(), steps: [{ id: "s1", fields: [q("x")] }] }));
});

test("split screens keep https pictures only, and the kind is kept", () => {
  const fm = ok({ ...emptyForm(), kind: "quiz", layout: { labels: "above", width: "wide", side: { image: "https://cdn.acme.com/a.jpg", at: "right" } }, steps: [{ id: "s1", image: "http://cdn.acme.com/b.jpg", fields: [EMAIL] }] });
  assert.deepEqual(fm.layout.side, { image: "https://cdn.acme.com/a.jpg", at: "right" });
  assert.equal(fm.steps[0]!.image, undefined);
  assert.equal(fm.kind, "quiz");
  assert.equal(ok({ ...emptyForm(), kind: "nope", layout: { labels: "above", width: "wide", side: { image: "javascript:alert(1)" } }, steps: [{ id: "s1", fields: [EMAIL] }] }).kind, undefined);
});
