// The template gallery (docs/form-templates.md): every template becomes a form the form checker passes, its logic
// runs in the live form's own engine, every style is a brand kit cleanTokens keeps whole, and neighbors differ.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { cleanTokens } from "../src/lib/forms/brand.ts";
import { findTemplates, industryCounts, templateById, templateBySlug, templateSlug, templateTheme, TEMPLATES } from "../src/lib/forms/gallery/catalog.ts";
import { ART_BASE, styleNote, styleTokens, templateForm } from "../src/lib/forms/gallery/convert.ts";
import { isTheme, themeById, THEMES } from "../src/lib/forms/gallery/themes.ts";
import { allFields, checkForm, visibility, type Form } from "../src/lib/forms/schema.ts";

const checked = (f: Form) => {
  const r = checkForm(JSON.parse(JSON.stringify(f)));
  assert.ok("form" in r, "errors" in r ? r.errors.join("; ") : "");
  return (r as { form: Form }).form;
};

test("150 templates over 24 industries, every one a form the checker passes in its own style and in every other", () => {
  assert.equal(TEMPLATES.length, 150);
  assert.equal(Object.keys(industryCounts()).length, 24);
  assert.equal(new Set(TEMPLATES.map(templateSlug)).size, 150);
  for (const t of TEMPLATES) {
    assert.equal(templateBySlug(templateSlug(t)), t);
    const form = checked(templateForm(t, themeById(templateTheme(t))));
    assert.ok(form.title && form.submit.label, t.id);
    assert.ok(allFields(form).length > 0, t.id);
  }
  for (const th of THEMES) checked(templateForm(templateById("saas.demo-request")!, th));
});

test("lead forms reach a contact; anonymous surveys say so; internal forms skip consent", () => {
  for (const t of TEMPLATES.filter((x) => x.tags.includes("lead") && !x.internal)) {
    const f = templateForm(t);
    const email = allFields(f).find((x) => x.key === "email");
    assert.ok(email?.required, `${t.id} asks for an email`);
  }
  const exit = templateForm(templateById("hr.exit-interview")!);
  assert.equal(exit.emailOptional, true);
  assert.equal(exit.consent.mode, "off");
  assert.equal(templateForm(templateById("general.contact-us")!).consent.mode, "by_region");
});

test("show-if logic carries over and runs in the form's own engine", () => {
  const t = templateById("real_estate.rental-application")!;
  const form = checked(templateForm(t));
  const pets = allFields(form).find((f) => f.label === "Any pets?")!;
  const about = allFields(form).find((f) => f.label === "Tell us about your pets")!;
  assert.ok(form.rules.some((r) => r.then.field === about.id && r.when.field === pets.id));
  assert.ok(!visibility(form, { [pets.id]: "No" }).shown.has(about.id));
  assert.ok(visibility(form, { [pets.id]: "Yes" }).shown.has(about.id));
  // An email that only shows on a condition stays shown and optional, since the email can't hide.
  const fb = checked(templateForm(templateById("general.customer-feedback")!));
  const email = allFields(fb).find((f) => f.key === "email")!;
  assert.equal(email.required, false);
  assert.ok(!fb.rules.some((r) => r.then.field === email.id));
});

test("question kinds map onto the app's types", () => {
  const types = (id: string) => allFields(templateForm(templateById(id)!)).map((f) => f.type);
  assert.ok(types("events.post-event").includes("grid"), "a matrix is a grid");
  assert.ok(types("real_estate.rental-application").includes("signature"));
  assert.ok(types("real_estate.rental-application").includes("address"));
  assert.ok(types("hospitality.travel-inquiry").includes("daterange"));
  const nps = allFields(templateForm(templateById("general.nps")!)).find((f) => f.type === "rating")!;
  assert.deepEqual([nps.rating?.scale, nps.rating?.style, nps.rating?.zero], [10, "numbers", true]);
  const quiz = allFields(templateForm(templateById("finance.risk-quiz")!)).find((f) => f.type === "choice")!;
  assert.ok(quiz.options!.every((o) => typeof o.score === "number"), "quiz points become scores");
  const demo = allFields(templateForm(templateById("saas.demo-request")!));
  assert.deepEqual(demo.slice(0, 3).map((f) => f.key), ["first_name", "last_name", "email"]);
  assert.equal(demo.find((f) => f.key === "email")!.check, "work_email");
});

test("styles: 18 brand kits cleanTokens keeps whole, drawings for the split ones, and varied neighbors", () => {
  assert.equal(THEMES.length, 18);
  for (const th of THEMES) {
    assert.deepEqual(cleanTokens(styleTokens(th)).dropped, [], th.id);
    assert.equal(styleNote(th), `style:${th.id}`);
    const side = templateForm(templateById("general.contact-us")!, th).layout.side;
    if (th.art) {
      assert.equal(side?.image, `${ART_BASE}/${th.id}.svg`);
      assert.ok(existsSync(`public/form-art/${th.id}.svg`), `${th.id} drawing is served`);
    } else assert.equal(side, undefined);
  }
  assert.equal(new Set(TEMPLATES.map(templateTheme)).size, 18);
  for (const t of TEMPLATES) assert.ok(isTheme(templateTheme(t)));
  for (let i = 1; i < TEMPLATES.length; i++) if (TEMPLATES[i - 1]!.industry === TEMPLATES[i]!.industry) assert.notEqual(templateTheme(TEMPLATES[i - 1]!), templateTheme(TEMPLATES[i]!));
  assert.ok(findTemplates({ text: "solar roof" }).some((t) => t.id === "solar.savings-check"));
});
