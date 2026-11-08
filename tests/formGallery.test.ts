// The template gallery (docs/form-templates.md): every template becomes a form the form checker passes, its logic
// runs in the live form's own engine, and neighboring cards differ in style.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { findTemplates, industryCounts, templateById, templateBySlug, templateSlug, templateTheme, TEMPLATES } from "../src/lib/forms/gallery/catalog.ts";
import { templateForm } from "../src/lib/forms/gallery/convert.ts";
import { isTheme, THEMES } from "../src/lib/forms/gallery/themes.ts";
import { allFields, checkForm, visibility, type Form } from "../src/lib/forms/schema.ts";
import { filterTemplates, menuCounts, MENUS, picksFromQuery, picksToQuery, shownValues, valuesIn } from "../src/lib/forms/gallery/filter.ts";
import { categoryFamily, featuresOf, isCategory, isSub, isTeam, layoutOf, lengthOf, MIN_SHOWN, subParent } from "../src/lib/forms/gallery/taxonomy.ts";
import { INDUSTRIES } from "../src/lib/forms/gallery/types.ts";
import { kitBooks, kitMeeting, kitWorkflows } from "../src/lib/forms/gallery/kit.ts";
import { templateByKey } from "../src/lib/workflows/templates.ts";
import { cleanBody } from "../src/lib/workflows/check.ts";

const checked = (f: Form) => {
  const r = checkForm(JSON.parse(JSON.stringify(f)));
  assert.ok("form" in r, "errors" in r ? r.errors.join("; ") : "");
  return (r as { form: Form }).form;
};

test("every template is a form the checker passes", () => {
  assert.ok(TEMPLATES.length >= 150);
  assert.equal(Object.keys(industryCounts()).length, INDUSTRIES.length);
  assert.equal(new Set(TEMPLATES.map(templateSlug)).size, TEMPLATES.length);
  for (const t of TEMPLATES) {
    assert.equal(templateBySlug(templateSlug(t)), t);
    const form = checked(templateForm(t));
    assert.ok(form.title && form.submit.label, t.id);
    assert.ok(allFields(form).length > 0, t.id);
  }
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

test("card styles: 18, a drawing served for the split ones, and varied neighbors", () => {
  assert.equal(THEMES.length, 18);
  for (const th of THEMES) if (th.art) assert.ok(existsSync(`public/form-art/${th.id}.svg`), `${th.id} drawing is served`);
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

test("wired templates: the meeting only when there's one to pick, and follow-ups as drafts on the form", () => {
  // Never a guess: one active meeting is booked; none or several leave it for the owner.
  assert.equal(kitMeeting([]), null);
  assert.equal(kitMeeting([{ id: "a", active: true }]), "a");
  assert.equal(kitMeeting([{ id: "a", active: true }, { id: "b", active: true }]), null);
  assert.equal(kitMeeting([{ id: "a", active: false }, { id: "b", active: true }]), "b");
  const form = "00000000-0000-4000-8000-000000000001";
  const meeting = "00000000-0000-4000-8000-000000000002";
  for (const t of TEMPLATES) {
    // A booking template with the meeting set still passes the form check.
    if (kitBooks(t)) {
      const f = templateForm(t);
      checked({ ...f, after: { ...f.after, schedule: { tool: "claritia", url: "", meetingTypeId: meeting, perOwner: false } } });
    }
    for (const key of kitWorkflows(t)) {
      const w = templateByKey(key);
      assert.ok(w, `${t.id}: workflow template ${key}`);
      const body = w!.body();
      if ("forms" in body.trigger) body.trigger = { ...body.trigger, forms: [form] };
      const clean = cleanBody(JSON.parse(JSON.stringify(body)));
      assert.deepEqual("forms" in clean.trigger ? clean.trigger.forms : [form], [form], `${t.id}: starts on the new form`);
      const emails = JSON.stringify(clean.steps);
      assert.ok(!emails.includes('"approved":true'), `${t.id}: every email starts unapproved`);
    }
    if (t.internal) assert.deepEqual(kitWorkflows(t), [], `${t.id}: internal forms send no follow-up`);
  }
  assert.deepEqual(kitWorkflows(templateById("saas.demo-request")!), ["demo_request"]);
  assert.deepEqual(kitWorkflows(templateById("general.book-a-call")!), ["not_booked"]);
  assert.deepEqual(kitWorkflows(templateById("events.registration")!), ["event"]);
  assert.deepEqual(kitWorkflows(templateById("general.nps")!), []);
  assert.ok(valuesIn(templateById("general.waitlist")!, "does").includes("follow-up"));
});

test("browsing mixes the gallery: every template once, kinds of form side by side, a search keeps its order", () => {
  const all = filterTemplates({});
  assert.equal(all.length, TEMPLATES.length);
  assert.equal(new Set(all.map((t) => t.id)).size, TEMPLATES.length);
  assert.deepEqual(filterTemplates({}).map((t) => t.id), all.map((t) => t.id), "same order every time");
  const top = all.slice(0, 30);
  const photo = (t: (typeof all)[number]) => !!t.schema.cover?.photo;
  assert.ok(new Set(top.map((t) => valuesIn(t, "family")[0])).size >= 7, "the first cards cover most groups");
  assert.ok(top.filter(photo).length <= 18 && top.filter(photo).length >= 10, "photo and plain forms in turn");
  for (let i = 2; i < 60; i++) assert.ok(!(photo(all[i]!) === photo(all[i - 1]!) && photo(all[i]!) === photo(all[i - 2]!)), `no three of a kind in a row at ${i}`);
  assert.ok(new Set(top.map((t) => valuesIn(t, "layout")[0])).size >= 2, "one page and steps both show");
  const search = filterTemplates({}, "demo request");
  assert.equal(search[0]!.id, "saas.demo-request", "a search keeps its best match first");
});
