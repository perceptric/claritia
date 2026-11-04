// Forms bug fixes (docs/form-kinds-plan.md, step 0): each test is the case that broke before the fix.
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyOp } from "../src/lib/forms/ops.ts";
import { checkForm, emptyForm, numOf, resultOf, usedBy, type Field, type Form } from "../src/lib/forms/schema.ts";
import { acceptFill, type PublicForm } from "../src/lib/forms/submit.ts";
import type { Rpc } from "../src/lib/jobs.ts";

const EMAIL: Field = { id: "e", key: "email", type: "email", label: "Email", required: true };
const PLAN: Field = { id: "plan", key: "q.plan", type: "choice", label: "Plan", required: false, options: [{ value: "Starter", label: "Starter" }, { value: "Enterprise", label: "Enterprise" }] };
const SEATS: Field = { id: "seats", key: "q.seats", type: "number", label: "Seats", required: false };
const ok = (f: Form): Form => {
  const r = checkForm(f);
  if ("errors" in r) throw new Error(r.errors.join(" "));
  return r.form;
};
const must = (r: ReturnType<typeof applyOp>): Form => {
  if ("error" in r) throw new Error(r.error);
  return r.form;
};

test("renaming a choice keeps the rules, skips and defaults that used it", () => {
  const fm = ok({
    ...emptyForm(),
    steps: [{ id: "s1", fields: [EMAIL, { ...PLAN, default: "Enterprise" }, SEATS] }],
    rules: [{ id: "r1", when: { field: "plan", op: "is", value: "Enterprise" }, then: { action: "show", field: "seats" } }],
  });
  const next = must(applyOp(fm, { op: "update_field", id: "plan", patch: { options: [{ value: "Starter", label: "Starter" }, { value: "Enterprise plan", label: "Enterprise plan" }] } }));
  assert.equal(next.rules[0]!.when.value, "Enterprise plan");
  assert.equal(next.steps[0]!.fields[1]!.default, "Enterprise plan");
  assert.ok(!("errors" in checkForm(next)));
});

test("moving choices around renames nothing", () => {
  const fm = ok({ ...emptyForm(), steps: [{ id: "s1", fields: [EMAIL, PLAN, SEATS] }], rules: [{ id: "r1", when: { field: "plan", op: "is", value: "Enterprise" }, then: { action: "show", field: "seats" } }] });
  const next = must(applyOp(fm, { op: "update_field", id: "plan", patch: { options: [{ value: "Enterprise", label: "Enterprise" }, { value: "Starter", label: "Starter" }] } }));
  assert.equal(next.rules[0]!.when.value, "Enterprise");
});

test("removing a step moves the skips after it down one, and drops one that no longer jumps", () => {
  const q = (id: string): Field => ({ id, key: `q.${id}`, type: "text", label: id, required: false });
  const fm = ok({
    ...emptyForm(),
    steps: [
      { id: "s1", fields: [EMAIL, PLAN], skip: { when: { field: "plan", op: "is", value: "Starter" }, to: 3 } },
      { id: "s2", fields: [q("a")] },
      { id: "s3", fields: [q("b")] },
      { id: "s4", fields: [q("c")] },
    ],
  });
  // Step 1 skipped to step 4; with step 2 gone, step 4 is now step 3.
  const one = must(applyOp(fm, { op: "remove_step", index: 1 }));
  assert.equal(one.steps[0]!.skip?.to, 2);
  assert.ok(!("errors" in checkForm(one)));
  // Step 1 skipped to step 3; with step 2 gone, that's the very next step, so the skip comes off.
  const short = ok({ ...fm, steps: fm.steps.map((s, i) => (i === 0 ? { ...s, skip: { when: s.skip!.when, to: 2 } } : s)) });
  const two = must(applyOp(short, { op: "remove_step", index: 1 }));
  assert.ok(!two.steps[0]!.skip);
  assert.ok(!("errors" in checkForm(two)));
});

test("a result block that shows a number question gets the number", () => {
  assert.equal(numOf("42"), 42);
  assert.equal(numOf(""), null);
  assert.equal(numOf("abc"), null);
  const fm = ok({
    ...emptyForm(),
    steps: [{ id: "s1", fields: [EMAIL, SEATS, { id: "res", key: "c.res", type: "result", label: "", required: false, result: { kind: "metric", field: "seats" } }] }],
  });
  assert.equal(resultOf(fm, { e: "a@acme.com", seats: "42" })?.values["q.seats"], 42);
});

test("Delete names the dropdown whose choices follow the question", () => {
  const city: Field = { id: "city", key: "q.city", type: "dropdown", label: "City", required: false, optionsBy: { field: "plan", map: { Starter: [{ value: "A", label: "A" }] } } };
  const fm = ok({ ...emptyForm(), steps: [{ id: "s1", fields: [EMAIL, PLAN, city] }] });
  assert.ok(usedBy(fm, "plan").some((x) => x.includes("City")));
});

test("a fill started before a publish is checked against the version the visitor saw", async () => {
  const v1 = ok({ ...emptyForm(), steps: [{ id: "s1", fields: [EMAIL, { ...SEATS, required: true }] }] });
  const v2 = ok({ ...emptyForm(), steps: [{ id: "s1", fields: [EMAIL, { ...PLAN, required: true }] }] });
  const sent: Record<string, unknown>[] = [];
  const rpc: Rpc = async (fn, args) => {
    if (fn === "form_version_body") return { data: args.p_version === 1 ? v1 : null, error: null };
    if (fn === "form_submit_all") {
      sent.push(args);
      return { data: { id: "0192f3a1-0000-7000-8000-00000000abcd" }, error: null };
    }
    return { data: null, error: null };
  };
  const pub: PublicForm = { id: "0192f3a1-0000-7000-8000-0000000000ff", workspace_id: "w", version: 2, status: "live", body: v2, logo_url: null };
  const r = await acceptFill(rpc, pub, { v: 1, version: 1, key: "k".repeat(20), answers: { e: "ana@acme.com", seats: "5" }, ms: 9000, trap: "" }, { custom: [] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(sent[0]!.p_version, 1);
});
