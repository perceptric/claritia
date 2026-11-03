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
import { filterTemplates, menuCounts, MENUS, picksFromQuery, picksToQuery, shownValues, valuesIn } from "../src/lib/forms/gallery/filter.ts";
import { categoryFamily, featuresOf, isCategory, isSub, isTeam, layoutOf, lengthOf, MIN_SHOWN, subParent } from "../src/lib/forms/gallery/taxonomy.ts";
import { INDUSTRIES } from "../src/lib/forms/gallery/types.ts";

const checked = (f: Form) => {
  const r = checkForm(JSON.parse(JSON.stringify(f)));
  assert.ok("form" in r, "errors" in r ? r.errors.join("; ") : "");
  return (r as { form: Form }).form;
};

test("every template is a form the checker passes in its own style, and the demo request in every style", () => {
  assert.ok(TEMPLATES.length >= 150);
  assert.equal(Object.keys(industryCounts()).length, INDUSTRIES.length);
  assert.equal(new Set(TEMPLATES.map(templateSlug)).size, TEMPLATES.length);
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
  assert.ok(
    quiz.options!.every((o) => typeof o.score === "number"),
    "quiz points become scores",
  );
  const demo = allFields(templateForm(templateById("saas.demo-request")!));
  assert.deepEqual(
    demo.slice(0, 3).map((f) => f.key),
    ["first_name", "last_name", "email"],
  );
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

test("menus: every template has real categories, teams and sub-industries", () => {
  for (const t of TEMPLATES) {
    const cats = t.categories ?? [];
    assert.ok(cats.length >= 1 && cats.length <= 3, `${t.id} has 1 to 3 categories`);
    for (const c of cats) assert.ok(isCategory(c), `${t.id}: category ${c}`);
    const teams = t.teams ?? [];
    assert.ok(teams.length >= 1 && teams.length <= 3, `${t.id} has 1 to 3 teams`);
    for (const x of teams) assert.ok(isTeam(x), `${t.id}: team ${x}`);
    for (const s of t.subs ?? []) {
      assert.ok(isSub(s), `${t.id}: sub-industry ${s}`);
      assert.ok([t.industry, ...(t.also ?? [])].includes(subParent(s)!), `${t.id}: ${s} sits in its industry`);
    }
    assert.ok(
      INDUSTRIES.some((i) => i.value === t.industry),
      t.id,
    );
  }
});

test("menus worked out from the form match its fields", () => {
  const t = (id: string) => templateById(id)!;
  assert.ok(featuresOf(t("real_estate.rental-application")).includes("signature"));
  assert.ok(featuresOf(t("real_estate.rental-application")).includes("logic"));
  assert.ok(featuresOf(t("finance.risk-quiz")).includes("score"));
  assert.ok(featuresOf(t("saas.demo-request")).includes("booking"));
  assert.ok(!featuresOf(t("general.newsletter")).includes("booking"));
  assert.equal(layoutOf(t("agency.client-intake")), "steps");
  assert.equal(layoutOf(t("general.newsletter")), "one");
  assert.equal(lengthOf(t("general.newsletter")), "quick");
  for (const x of TEMPLATES) {
    const f = valuesIn(x, "feature");
    const kinds = new Set(x.schema.pages.flatMap((p) => p.fields.map((y) => y.kind)));
    assert.equal(f.includes("payment"), kinds.has("payment"), x.id);
    assert.equal(f.includes("file"), kinds.has("file"), x.id);
    assert.equal(valuesIn(x, "does").includes("anonymous"), !x.schema.pages.some((p) => p.fields.some((y) => y.map === "email")), x.id);
    assert.deepEqual(valuesIn(x, "family"), [...new Set((x.categories ?? []).map((c) => categoryFamily(c)))], x.id);
  }
});

test("filters: two values in a menu widen, two menus narrow, counts match the results", () => {
  const consult = filterTemplates({ category: ["consultation"] });
  const quote = filterTemplates({ category: ["quote"] });
  const both = filterTemplates({ category: ["consultation", "quote"] });
  assert.ok(both.length >= Math.max(consult.length, quote.length) && both.length <= consult.length + quote.length);
  const sales = filterTemplates({ category: ["quote"], team: ["sales"] });
  assert.ok(sales.length <= quote.length && sales.every((x) => x.teams!.includes("sales") && x.categories!.includes("quote")));
  // A family and a category inside another family widen together.
  const fam = filterTemplates({ family: ["legal"], category: ["waiver"] });
  assert.ok(fam.every((x) => valuesIn(x, "family").includes("legal") || x.categories!.includes("waiver")));
  // Each count is what that pick would show.
  const picks = { team: ["sales"] };
  const counts = menuCounts(picks);
  for (const m of MENUS)
    for (const v of shownValues(m.id)) {
      const n = counts[m.id][v.id] ?? 0;
      const more = { ...picks, [m.id]: [v.id] };
      assert.equal(filterTemplates(more).length, n, `${m.id}=${v.id}`);
    }
  // Shown values have enough templates behind them.
  for (const m of MENUS) for (const v of shownValues(m.id)) assert.ok(filterTemplates({ [m.id]: [v.id] }).length >= MIN_SHOWN, `${m.id}=${v.id}`);
  // Search finds by the words people use.
  assert.ok(filterTemplates({}, "sign up").some((x) => x.id === "saas.free-trial"));
  assert.ok(filterTemplates({}, "waiver").some((x) => x.id === "fitness.waiver"));
  // Picks round-trip through the address, and unknown values drop.
  const q = picksToQuery({ category: ["waiver", "consent"], team: ["hr"] });
  assert.deepEqual(picksFromQuery(new URLSearchParams(`${q}&team=hr,nope&x=1`)), { category: ["waiver", "consent"], team: ["hr"] });
});

test("no two templates in one category ask the same questions in the same order", () => {
  const seen = new Map<string, string>();
  for (const t of TEMPLATES) {
    const qs = t.schema.pages.flatMap((p) => p.fields.map((f) => f.label.toLowerCase())).join("|");
    for (const c of t.categories ?? []) {
      const key = `${c}:${qs}`;
      assert.ok(!seen.has(key), `${t.id} repeats ${seen.get(key)}`);
      seen.set(key, t.id);
    }
  }
});
