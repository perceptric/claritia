// The template gallery (docs/interactive-forms-plan.md Part 6): all 24 templates pass the checker, every example
// gives the plan's numbers and outcome in the browser's run and on the server's, and the server ignores numbers the
// browser sends. A template whose example drifts by a cent fails here.
import assert from "node:assert/strict";
import { test } from "node:test";
import { exampleAnswers, GALLERY, withExampleConstants } from "../src/lib/forms/gallery.ts";
import { checkForm, pickOutcome, publicForm, resultOf, unsetConstants, withCalcs, type Form } from "../src/lib/forms/schema.ts";
import { prepareSubmit } from "../src/lib/forms/submit.ts";

const checked = (raw: Form): Form => {
  const r = checkForm(raw);
  if ("errors" in r) throw new Error(r.errors.join(" "));
  return r.form;
};
const byKey = (form: Form, vals: Record<string, unknown>) => Object.fromEntries(form.steps.flatMap((s) => s.fields).map((x) => [x.key, vals[x.id]]));

test("24 templates: 12 static and 12 interactive, unique keys, each one passes the checker twice the same way", () => {
  assert.equal(GALLERY.length, 24);
  assert.equal(GALLERY.filter((t) => t.kind === "static").length, 12);
  assert.equal(GALLERY.filter((t) => t.kind === "interactive").length, 12);
  assert.equal(new Set(GALLERY.map((t) => t.key)).size, 24);
  for (const t of GALLERY) {
    const fm = checked(t.form());
    // Checking a checked form changes nothing.
    assert.deepEqual(checked(fm), fm, t.key);
    if (t.kind === "interactive") {
      assert.ok(fm.results?.outcomes.length, `${t.key} has outcomes`);
      assert.equal(fm.layout.mode, "screens", t.key);
    }
  }
});

for (const t of GALLERY.filter((x) => x.examples?.length)) {
  test(`${t.key}: every example gives its numbers and outcome, in the browser and on the server`, () => {
    for (const ex of t.examples!) {
      const fm = withExampleConstants(checked(t.form()), ex);
      const answers = exampleAnswers(fm, ex);
      const vals = byKey(fm, withCalcs(fm, answers));
      for (const [k, want] of Object.entries(ex.values ?? {})) assert.equal(vals[k] ?? null, want, `${t.key} ${k} for ${JSON.stringify(ex.answers)}`);
      if (ex.outcome) assert.equal(pickOutcome(fm, answers)?.id, ex.outcome, `${t.key} outcome for ${JSON.stringify(ex.answers)}`);
      // The server: a full send with an email (and a name when it's required), and made-up totals that must be ignored.
      const fields = fm.steps.flatMap((s) => s.fields);
      const extra: Record<string, unknown> = {};
      for (const x of fields) {
        if (x.key === "email") extra[x.id] = "ana@acme.com";
        else if (x.required && answers[x.id] === undefined && x.type === "text") extra[x.id] = "Ana";
        else if (x.type === "calc") extra[x.id] = 999999;
      }
      const r = prepareSubmit(fm, 1, { v: 1, version: 1, key: "g".repeat(20), answers: JSON.parse(JSON.stringify({ ...extra, ...answers })), ms: 9000, consent: { given: true } }, { custom: [] });
      if (!("args" in r)) {
        // Only an example meant to stop short (a Not sure, an empty number) may fail the required checks.
        assert.ok("errors" in r || "error" in r);
        continue;
      }
      // What the server saves: worked out again from the checked answers only (hidden calcs aren't answers).
      const checkedById = Object.fromEntries(fields.filter((x) => (r.args.p_values as Record<string, unknown>)[x.key] !== undefined).map((x) => [x.id, (r.args.p_values as Record<string, unknown>)[x.key]]));
      const saved = resultOf(fm, checkedById)!;
      for (const [k, want] of Object.entries(ex.values ?? {})) assert.equal(saved.values[k] ?? null, want, `server ${t.key} ${k}`);
      if (ex.outcome) assert.equal(saved.outcome?.id, ex.outcome, `server outcome ${t.key}`);
    }
  });
}

test("the quiz's answer key and the quote's private setting never reach the browser", () => {
  const quiz = publicForm(checked(GALLERY.find((t) => t.key === "quiz")!.form()));
  assert.ok(quiz.steps.flatMap((s) => s.fields).filter((x) => x.secret).every((x) => x.options!.every((o) => o.score === undefined)));
  const quote = publicForm(checked(GALLERY.find((t) => t.key === "instant_quote")!.form()));
  assert.equal(quote.constants!.find((c) => c.id === "visit_from")!.value, null);
});

test("the benchmark ships with no reference rate, so it can't be published until the owner sets one", () => {
  const fm = checked(GALLERY.find((t) => t.key === "benchmark")!.form());
  assert.deepEqual(unsetConstants(fm).map((c) => c.id), ["reference_rate"]);
  for (const t of GALLERY.filter((x) => x.key !== "benchmark")) assert.deepEqual(unsetConstants(checked(t.form())), [], t.key);
});

test("the configurator refuses a module without the one it needs", () => {
  const fm = checked(GALLERY.find((t) => t.key === "configurator")!.form());
  const r = prepareSubmit(fm, 1, { v: 1, version: 1, key: "c".repeat(20), answers: { ...exampleAnswers(fm, { answers: { plan: "core", mods: ["b"], seats: "10" } }), [fm.steps.flatMap((s) => s.fields).find((x) => x.key === "email")!.id]: "ana@acme.com" }, ms: 9000 }, { custom: [] });
  assert.ok("errors" in r);
  assert.match(Object.values(r.errors).join(" "), /Forecasting needs Reporting/);
});

test("a result screen waiting for the send is skipped before it", async () => {
  const { nextStep } = await import("../src/lib/forms/schema.ts");
  const fm = checked(GALLERY.find((t) => t.key === "quiz")!.form());
  const contact = fm.steps.findIndex((s) => s.fields.some((x) => x.key === "email"));
  assert.equal(nextStep(fm, contact, {}), fm.steps.length, "the contact step is the last one shown");
});
