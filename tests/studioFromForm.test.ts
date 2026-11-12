// Older forms and gallery templates as studio pages (src/lib/studio/fromForm.ts, docs/forms-chat-plan.md Part 8 and
// Part 10 "Round trip"): every one of the 740 templates turned into a page passes the form check, keeps every
// question with its id, type, choices, points, formula and payment, works out the same numbers, and takes the same
// answers as before.

import assert from "node:assert/strict";
import { test } from "node:test";
import { TEMPLATES } from "../src/lib/forms/gallery/catalog.ts";
import { templateForm } from "../src/lib/forms/gallery/convert.ts";
import { checkForm, isContent, withCalcs, type Field, type Form } from "../src/lib/forms/schema.ts";
import { checkAnswers } from "../src/lib/forms/values.ts";
import { formToPage } from "../src/lib/studio/fromForm.ts";
import { pageForm } from "../src/lib/studio/page.ts";

const checked = (raw: unknown): Form => {
  const r = checkForm(raw);
  assert.ok("form" in r, "errors" in r ? r.errors.join("; ") : "");
  return (r as { form: Form }).form;
};
const asPage = (form: Form): Form => {
  const c = formToPage(form);
  return checked(pageForm({ html: c.html, css: c.css, brand: "", after: c.after, title: c.title }).form);
};
const fieldsOf = (f: Form) => f.steps.flatMap((s) => s.fields);
const asked = (f: Form) => fieldsOf(f).filter((x) => !isContent(x.type) || x.type === "payment" || x.type === "result");
/** A field the page can make conditional: one with a rule, or on a page a skip or path passes over. */
function conditional(form: Form): Set<string> {
  const out = new Set(form.rules.map((r) => r.then.field));
  form.steps.forEach((s, i) => {
    for (const j of [...(s.skip ? [s.skip] : []), ...(s.jumps ?? [])]) for (let k = i + 1; k < Math.min(j.to, form.steps.length); k++) for (const f of form.steps[k]!.fields) out.add(f.id);
  });
  return out;
}
const TYPE: Partial<Record<Field["type"], Field["type"]>> = { group: "textarea" };

/** An answer of the right shape for each question, so both forms can take it. */
function sample(f: Field): unknown {
  switch (f.type) {
    case "email":
      return "ada@acme-industries.com";
    case "phone":
      return "+14155550101";
    case "number":
      return (f.valid as { min?: number } | undefined)?.min ?? 3;
    case "rating":
      return 4;
    case "choice":
    case "dropdown":
      return f.options?.[0]?.value;
    case "multi":
      return f.options?.slice(0, 2).map((o) => o.value);
    case "checkbox":
      return true;
    case "date":
      return "2026-12-01";
    case "url":
      return "https://acme.com";
    case "country":
      return "US";
    case "ranking":
      return f.options?.map((o) => o.value);
    case "grid":
      return Object.fromEntries((f.grid?.rows ?? []).map((r) => [r.value, f.grid!.cols[0]!.value]));
    case "text":
    case "textarea":
      return "Ada Lovelace";
    default:
      return undefined;
  }
}
const byId = (form: Form, values: Record<string, unknown>) => {
  const idOf = new Map(fieldsOf(form).map((f) => [f.key, f.id]));
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [idOf.get(k as Field["key"]) ?? k, v]));
};

test("every template turns into a page that keeps its questions, choices, points, formulas and payments", () => {
  assert.equal(TEMPLATES.length, 740);
  for (const t of TEMPLATES) {
    const before = checked(templateForm(t));
    const after = asPage(before);
    const cond = conditional(before);
    const got = new Map(asked(after).map((f) => [f.id, f]));
    for (const f of asked(before)) {
      const g = got.get(f.id);
      const at = `${t.id}: ${f.label} (${f.id})`;
      assert.ok(g, `${at} is missing`);
      assert.equal(g.type, TYPE[f.type] ?? f.type, `${at} type`);
      // Every answer saves where it did, so a converted form's new submissions line up with its old ones.
      if (!isContent(f.type)) assert.equal(g.key, f.key, `${at} saves where it did`);
      if (!cond.has(f.id) && f.type !== "calc") assert.equal(g.required, f.required, `${at} required`);
      // An "Other" choice is a real choice on the page, with its own box for the words.
      if (f.options && f.type !== "ranking") assert.deepEqual(g.options?.filter((o) => !(f.other && o.value === "Other")).map((o) => [o.value, o.score]), f.options.map((o) => [o.value, o.score]), `${at} choices`);
      if (f.calc) assert.deepEqual([g.calc?.formula, g.calc?.format, g.calc?.show], [f.calc.formula, f.calc.format, f.calc.show], `${at} formula`);
      if (f.pay) assert.deepEqual(g.pay, f.pay, `${at} payment`);
      if (f.check) assert.equal(g.check, f.check, `${at} work email`);
      if (f.grid) assert.deepEqual(g.grid, f.grid, `${at} grid`);
    }
  }
});

test("every template's page works out the same numbers and takes the same answers", () => {
  let priced = 0;
  for (const t of TEMPLATES) {
    const before = checked(templateForm(t));
    const after = asPage(before);
    // Only questions every visitor sees are answered: the live page drops an answer its show-if hides, as the old
    // form did (checked in the browser by scripts/studio-check.ts).
    const cond = conditional(before);
    const answers = Object.fromEntries(asked(before).filter((f) => !cond.has(f.id)).map((f) => [f.id, sample(f)]).filter(([, v]) => v !== undefined));
    const calcs = fieldsOf(before).filter((f) => f.type === "calc");
    if (calcs.length) priced++;
    const a = withCalcs(before, answers);
    const b = withCalcs(after, answers);
    for (const c of calcs) assert.equal(b[c.id], a[c.id], `${t.id}: ${c.label} works out the same`);
    const x = checkAnswers(before, answers);
    const y = checkAnswers(after, answers);
    // The page never requires a question a condition hides; with every question answered, both take them all.
    assert.deepEqual(Object.keys(y.errors), Object.keys(x.errors).filter((id) => !conditional(before).has(id)), `${t.id}: errors ${JSON.stringify(y.errors)} vs ${JSON.stringify(x.errors)}`);
    const keep = (v: Record<string, unknown>) => Object.fromEntries(Object.entries(v).filter(([id]) => !cond.has(id) && asked(before).some((f) => f.id === id)));
    assert.deepEqual(keep(byId(after, y.values)), keep(byId(before, x.values)), `${t.id}: the same answers are kept`);
  }
  assert.ok(priced >= 60, `templates with a price or score: ${priced}`);
});

test("conditions become show-if words: show, hide, any of, between, and pages a skip passes over", () => {
  const base: Form = checked({
    steps: [
      { id: "s0", fields: [{ id: "size", key: "q.size", type: "choice", label: "Team size", required: true, options: [{ value: "1-10", label: "1-10" }, { value: "11-50", label: "11-50" }, { value: "51+", label: "51+" }] }, { id: "budget", key: "q.budget", type: "number", label: "Budget", required: true }], skip: { when: { field: "size", op: "is", value: "1-10" }, to: 2 } },
      { id: "s1", fields: [{ id: "it", key: "q.it", type: "text", label: "IT contact", required: false }] },
      { id: "s2", fields: [{ id: "email", key: "email", type: "email", label: "Email", required: true }, { id: "note", key: "q.note", type: "textarea", label: "Note", required: false }, { id: "vip", key: "q.vip", type: "text", label: "VIP code", required: false }] },
    ],
    rules: [
      { id: "r1", when: { field: "size", op: "any_of", values: ["11-50", "51+"] }, then: { action: "show", field: "note" } },
      { id: "r2", when: { field: "budget", op: "between", value: "1000", value2: "5000" }, then: { action: "hide", field: "note" } },
      { id: "r3", when: { field: "size", op: "is", value: "51+" }, then: { action: "show", field: "vip" } },
    ],
    layout: { labels: "above", width: "narrow" },
    submit: { label: "Send" },
    consent: { mode: "by_region", label: "I agree." },
    spam: { minSeconds: 2, turnstile: false },
    after: { end: { kind: "message", title: "Thanks" } },
  });
  const c = formToPage(base);
  assert.match(c.html, /data-cl-show-if="team_size in \('11-50', '51\+'\) and budget &lt; 1000 or team_size in \('11-50', '51\+'\) and budget &gt; 5000"/);
  assert.match(c.html, /<section data-cl-step id="s1" data-cl-show-if="team_size != '1-10'">/, "the page the skip passes over");
  assert.match(c.html, /data-cl-show-if="team_size == '51\+'"/);
  assert.deepEqual(c.lost, []);
  const page = asPage(base);
  assert.equal(page.steps[0]!.fields.find((f) => f.id === "note")!.required, false);
});

test("flaky forms: a condition with no show-if words, a missing field, a long condition, and quotes in a value", () => {
  const form = checked({
    steps: [{ id: "s0", fields: [{ id: "co", key: "q.co", type: "text", label: "Company", required: false }, { id: "x", key: "q.x", type: "text", label: "Why", required: false }, { id: "y", key: "q.y", type: "choice", label: "Pick", required: false, options: [{ value: "it's", label: "It's" }, { value: "no", label: "No" }] }, { id: "z", key: "q.z", type: "text", label: "More", required: false }, { id: "email", key: "email", type: "email", label: "Email", required: true }] }],
    rules: [
      { id: "r1", when: { field: "co", op: "contains", value: "inc" }, then: { action: "show", field: "x" } },
      { id: "r2", when: { field: "y", op: "is", value: "it's" }, then: { action: "show", field: "z" } },
    ],
    layout: { labels: "above", width: "narrow" },
    submit: { label: "Send" },
    consent: { mode: "by_region", label: "I agree." },
    spam: { minSeconds: 2, turnstile: false },
    after: { end: { kind: "message", title: "Thanks" } },
  });
  const c = formToPage(form);
  // Text matching can't be said in a show-if: the question shows always, and the note says so.
  assert.ok(c.lost.some((l) => /Why: shows always/.test(l)), c.lost.join("; "));
  assert.match(c.html, /data-cl-show-if="pick == &quot;it's&quot;"/, "a value with a quote is wrapped in the other quote");
  asPage(form);
});

test("the MCP server's starting points turn into pages too", async () => {
  const { TEMPLATES: STARTS } = await import("../src/lib/forms/templates.ts");
  const { emptyForm } = await import("../src/lib/forms/schema.ts");
  for (const t of [...STARTS.map((x) => x.form()), emptyForm()]) {
    const before = checked(t);
    const after = asPage(before);
    for (const f of asked(before)) assert.ok(fieldsOf(after).some((g) => g.id === f.id && (isContent(f.type) || g.key === f.key)), `${f.label} is on the page and saves where it did`);
  }
});

test("every template's thank-you is centred with a round check, its heading and words, and a booking under them", () => {
  for (const t of TEMPLATES) {
    const c = formToPage(templateForm(t));
    const m = /<section data-cl-thanks hidden id="thanks" class="thanks"[^>]*><span class="thanks-mark" aria-hidden="true"><\/span><h2 class="heading">([^<]+)<\/h2>/.exec(c.html);
    assert.ok(m, `${t.id}: the thank-you has the check and a heading`);
    assert.ok(!/\.$/.test(m![1]!.trim()), `${t.id}: the heading has no full stop`);
    // The words survive the page's cleaning, so the live form shows them too.
    const page = pageForm({ html: c.html, css: c.css, brand: "", after: c.after, title: c.title }).form.page as { html: string };
    assert.match(page.html, /class="thanks-mark"/, `${t.id}: the check survives the cleaning`);
  }
  // A form that books puts the booking spot after the words.
  const f = templateForm(TEMPLATES[0]!);
  const booked = formToPage({ ...f, after: { ...f.after, schedule: { tool: "claritia", url: "", perOwner: false, meetingTypeId: "11111111-1111-4111-8111-111111111111" } } } as Form).html;
  assert.match(booked, /<h2 class="heading">[^<]+<\/h2>(<p class="text">[^<]*<\/p>)*<div data-cl-book id="book"><\/div><\/section>/);
  assert.match(formToPage(templateForm(TEMPLATES[0]!)).css, /\.thanks\{align-items:center;text-align:center;justify-content:center;min-height:320px/);
});
