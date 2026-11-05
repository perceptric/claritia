// Gallery templates as Form Studio makes forms (docs/form-templates.md, "Templates in Form Studio"): every template's
// page passes the Studio's own check, so a person can save it after Use template; a cover is the first page; the PDF
// copy of the answers is kept; and money, dates of birth, agreements, countries and lists use the Studio's fields.

import assert from "node:assert/strict";
import { test } from "node:test";
import { TEMPLATES, templateById } from "../src/lib/forms/gallery/catalog.ts";
import { templateForm } from "../src/lib/forms/gallery/convert.ts";
import { checkForm, type Form } from "../src/lib/forms/schema.ts";
import { questionHtml } from "../src/lib/studio/builder.ts";
import { checkStudioPage, errorsIn } from "../src/lib/studio/check.ts";
import { formToPage } from "../src/lib/studio/fromForm.ts";
import { cleanPage } from "../src/lib/studio/page.ts";
import { templateDraft } from "../src/lib/studio/templatePage.ts";

type Draft = Form & { page: { html: string; after?: Parameters<typeof checkStudioPage>[0]["after"] } };
const draftOf = (id: string) => {
  const t = templateById(id);
  assert.ok(t, id);
  return templateDraft(t, "") as Draft;
};
const issuesOf = (d: Draft) => errorsIn(checkStudioPage({ html: d.page.html, after: d.page.after ?? { kind: "thanks" }, meetings: null }));
const checked = (raw: unknown): Form => {
  const r = checkForm(raw);
  assert.ok("form" in r, "errors" in r ? r.errors.join("; ") : "");
  return (r as { form: Form }).form;
};
const base = (fields: unknown[], more: Record<string, unknown> = {}) =>
  checked({
    steps: [{ id: "s0", fields: [{ id: "email", key: "email", type: "email", label: "Email", required: true }, ...fields] }],
    rules: [],
    layout: { labels: "above", width: "narrow" },
    submit: { label: "Send" },
    consent: { mode: "by_region", label: "I agree." },
    spam: { minSeconds: 2, turnstile: false },
    after: { end: { kind: "message", title: "Thanks" } },
    ...more,
  });

test("every template's Studio page passes the Studio's check, health records aside", () => {
  const health: string[] = [];
  for (const t of TEMPLATES) {
    const d = templateDraft(t, "") as Draft;
    const errs = issuesOf(d);
    // Health-record questions wait for health data on the workspace (docs/studio-v2-plan.md), so only those stay.
    const other = errs.filter((e) => e.code !== "health");
    assert.deepEqual(other.map((e) => e.text), [], t.id);
    if (errs.length) health.push(t.id);
  }
  for (const id of health) assert.ok(templateById(id)!.industry === "healthcare" || templateById(id)!.industry === "wellness" || /health|medic|allerg/i.test(JSON.stringify(templateById(id)!.schema)), id);
});

test("a checkbox question with three or more choices is one question, and a real repeat is still caught", () => {
  const one = (html: string) => cleanPage(`<form>${html}</form>`).questions;
  const three = one(questionHtml("checks", "picks"));
  assert.equal(three.length, 1);
  assert.equal(three[0]!.type, "multi");
  assert.equal(three[0]!.twice, undefined);
  assert.equal(three[0]!.options.length, 3);
  const two = one(`<label><input type="checkbox" name="a" value="x"> X</label><label><input type="checkbox" name="a" value="y"> Y</label>`);
  assert.equal(two[0]!.type, "multi");
  assert.equal(two[0]!.twice, undefined);
  // Two text boxes with one name, or a radio and then a check box with it, would lose an answer.
  assert.equal(one(`<label for="a">A</label><input id="a" name="a"><label for="b">B</label><input id="b" name="a">`)[0]!.twice, true);
  assert.equal(one(`<label><input type="radio" name="a" value="x"> X</label><label><input type="checkbox" name="a" value="y"> Y</label><label><input type="checkbox" name="a" value="z"> Z</label>`)[0]!.twice, true);
});

test("a cover is the first page: its title once, its line, and Start", () => {
  const d = draftOf("healthcare.patient-intake");
  const html = d.page.html;
  assert.match(html, /<section data-cl-step id="cover"><h1 class="heading">New patient intake<\/h1><p class="text">About 10 minutes\.[^<]*<\/p>/);
  assert.match(html, /id="cover"[\s\S]*?<button class="btn" type="button" data-cl-next>Start<\/button><\/div><\/section>/);
  assert.equal((html.match(/New patient intake<\/h1>/g) ?? []).length, 1, "no second title in the header");
  // The first page of questions can go back to the cover.
  assert.match(html, /<section data-cl-step id="s0"[\s\S]*?data-cl-back>Back</);
  assert.deepEqual(issuesOf(d).filter((e) => e.code !== "health"), []);
  // A one-page form with a cover becomes two pages.
  const c = formToPage(base([{ id: "msg", key: "q.msg", type: "textarea", label: "Message", required: false }], { layout: { labels: "above", width: "narrow", cover: { title: "Say hello", button: "Go" } } }));
  assert.match(c.html, /id="cover"[\s\S]*data-cl-next>Go<[\s\S]*id="s0"[\s\S]*data-cl-back>Back<[\s\S]*type="submit">Send</);
  assert.deepEqual(c.lost, []);
});

test("a template that offers a PDF copy of the answers keeps it", () => {
  let n = 0;
  for (const t of TEMPLATES) {
    const d = templateDraft(t, "");
    assert.equal(!!d.copy, !!t.schema.copy, t.id);
    if (d.copy) n++;
  }
  assert.ok(n >= 15, `${n} templates with a copy`);
  assert.deepEqual(formToPage(base([], { copy: true })).lost, []);
});

test("money, dates of birth, agreements, countries, hidden values and lists use the Studio's fields", () => {
  const c = formToPage(
    base([
      { id: "budget", key: "q.budget", type: "number", unit: "money", label: "Budget", required: false },
      { id: "fee", key: "q.fee", type: "number", unit: "money", label: "Fee", required: false, valid: { min: 50 } },
      { id: "dob", key: "q.dob", type: "date", label: "Date of birth", required: true },
      { id: "start", key: "q.start", type: "date", label: "Start date", required: false },
      { id: "terms", key: "q.terms", type: "checkbox", label: "I agree to the terms.", required: true },
      { id: "country", key: "country", type: "country", label: "Country", required: false },
      { id: "src", key: "q.src", type: "hidden", label: "Source", required: false, hidden: { from: "param", name: "src" } },
      { id: "kids", key: "q.kids", type: "group", label: "Children", required: false, group: { fields: [{ id: "kidsr0", key: "q.kidsr0", type: "text", label: "Full name", required: true }, { id: "kidsr1", key: "q.kidsr1", type: "date", label: "Date of birth", required: false }], max: 8, add: "Add a child" } },
    ]),
  );
  assert.match(c.html, /name="budget" type="number" min="0" step="0\.01" placeholder="0\.00" inputmode="decimal"/);
  assert.match(c.html, /name="fee" type="number" min="50" step="0\.01" placeholder="0\.00" inputmode="decimal"/, "its own lowest amount stays");
  assert.match(c.html, /name="date_of_birth" type="date" autocomplete="bday" required/);
  assert.match(c.html, /data-cl-field="date" data-cl-name="start_date"/, "other dates keep the date picker");
  assert.match(c.html, /<label class="choice"><input type="checkbox" name="i_agree_to_the" id="q_terms" value="Yes" required/);
  assert.match(c.html, /data-cl-field="country" data-cl-name="country"[^>]*data-cl-save="country"/);
  assert.match(c.html, /data-cl-field="hidden" data-cl-name="source" data-cl-label="Source"/);
  assert.match(c.html, /data-cl-field="group" data-cl-name="children"[^>]*data-cl-fields="Full name::text\|Date of birth::date" data-cl-max="8" data-cl-add="Add a child"/);
  assert.deepEqual(c.lost, []);
  const { questions } = cleanPage(c.html);
  const q = (n: string) => questions.find((x) => x.name === n)!;
  assert.equal(q("children").block?.type, "group");
  assert.deepEqual(q("children").block?.fields, [{ label: "Full name", type: "text" }, { label: "Date of birth", type: "date" }]);
  assert.equal(q("source").labelFrom, "label");
  assert.equal(q("i_agree_to_the").type, "checkbox");
  // A row's list has no place in a Studio group row: it's a box to type in, and the page says so.
  const list = formToPage(base([{ id: "pets", key: "q.pets", type: "group", label: "Pets", required: false, group: { fields: [{ id: "petsr0", key: "q.petsr0", type: "dropdown", label: "Kind", required: false, options: [{ value: "Dog", label: "Dog" }] }], max: 3 } }]));
  assert.match(list.html, /data-cl-fields="Kind::text"/);
  assert.deepEqual(list.lost, ["Pets: Kind is a box to type in"]);
});

test("templates: lists are repeating groups and countries are the Country list", () => {
  const groups = TEMPLATES.flatMap((t) => t.schema.pages.flatMap((p) => p.fields.filter((f) => f.kind === "group").map((f) => `${t.id}: ${f.label}`)));
  assert.equal(groups.length, 10, groups.join("\n"));
  const camp = templateForm(templateById("education.summer-camp")!);
  const meds = camp.steps.flatMap((s) => s.fields).find((f) => f.label === "Medicines to take at camp")!;
  assert.equal(meds.type, "group");
  assert.deepEqual(meds.group?.fields.map((f) => f.label), ["Medicine", "Dose", "When to take it"]);
  const dpa = templateDraft(templateById("saas.dpa-request")!, "");
  assert.equal(dpa.steps.flatMap((s) => s.fields).find((f) => f.key === "country")?.type, "country");
});
