// One page or multi-page (docs/form-templates.md, Pages): every template can be used either way, with the same
// questions, keys and order, and the same people seeing the same questions. Also which templates keep photos.
import assert from "node:assert/strict";
import { test } from "node:test";
import { TEMPLATES, questionCount, templateById } from "../src/lib/forms/gallery/catalog.ts";
import { templateForm } from "../src/lib/forms/gallery/convert.ts";
import { canSwitch, MIN_SPLIT, pagesOf, withPages } from "../src/lib/forms/gallery/pages.ts";
import { PICTURE_IDS, PICTURE_SHARE } from "../src/lib/forms/gallery/photos/index.ts";
import { email, fullName, go, one, text, tpl, yesno } from "../src/lib/forms/gallery/templates/build.ts";
import type { FormTemplate } from "../src/lib/forms/gallery/types.ts";
import { checkForm, visibility } from "../src/lib/forms/schema.ts";

const keys = (t: FormTemplate) => t.schema.pages.flatMap((p) => p.fields.filter((f) => f.kind !== "statement").map((f) => f.key));

const sample = () =>
  tpl("insurance.pages-sample", "insurance", "Pages sample", ["request"], "A sample with a skip and an early end.", {
    pages: [
      { title: "You", fields: [fullName(), email("Email"), yesno("Any claims in 5 years?")], skip: go("Any claims in 5 years?", "is", false, "Coverage") },
      { title: "Claims", fields: [text("What happened?", { required: true })] },
      { title: "Coverage", fields: [one("Coverage", ["Basic", "Full"], { required: true })], jumps: [go("Coverage", "is", "Basic", "end")] },
      { title: "Extras", fields: [text("Anything else?")] },
    ],
    end: ["Thanks", "We'll send your quote."],
  });

test("every template works both ways: same keys in the same order, and the form check passes", () => {
  for (const t of TEMPLATES)
    for (const m of ["one", "multi"] as const) {
      const x = withPages(t, m);
      assert.deepEqual(keys(x), keys(t), `${t.id} ${m}`);
      const r = checkForm(templateForm(x));
      assert.ok(!("errors" in r), `${t.id} ${m}: ${"errors" in r ? r.errors[0] : ""}`);
      if (canSwitch(t)) assert.equal(pagesOf(x), m, `${t.id} becomes ${m}`);
    }
});

test("one page: page titles become headings and a skip hides the same questions the pages skipped", () => {
  const t = withPages(sample(), "one");
  assert.equal(t.schema.pages.length, 1);
  const fields = t.schema.pages[0]!.fields;
  assert.deepEqual(fields.filter((f) => f.kind === "statement").map((f) => f.label), ["Claims", "Coverage", "Extras"], "the first page's title isn't over the first questions");
  const form = templateForm(t);
  const r = checkForm(form);
  assert.ok(!("errors" in r));
  const all = form.steps[0]!.fields;
  const id = (label: string) => all.find((f) => f.label === label)!.id;
  const claims = all.find((f) => f.label === "Any claims in 5 years?")!;
  const coverage = all.find((f) => f.label === "Coverage")!;
  const seen = (a: Record<string, unknown>) => visibility(form, a).shown;
  assert.ok(seen({}).has(id("What happened?")), "nothing answered: every question shows");
  const no = seen({ [claims.id]: "No" });
  assert.ok(!no.has(id("What happened?")), "no claims hides the claims question, as the skip did");
  assert.ok(seen({ [claims.id]: "Yes" }).has(id("What happened?")));
  assert.ok(!seen({ [coverage.id]: "Basic" }).has(id("Anything else?")), "an early end hides what came after it");
  assert.ok(all.some((f) => f.key === "email") && seen({ [claims.id]: "No", [coverage.id]: "Basic" }).has(all.find((f) => f.key === "email")!.id), "the email never hides");
});

test("multi-page: a one-page form splits into pages of about four questions, with pairs kept together", () => {
  const long = TEMPLATES.filter((t) => pagesOf(t) === "one" && questionCount(t) >= 8);
  assert.ok(long.length > 20);
  for (const t of long) {
    const x = withPages(t, "multi");
    assert.ok(x.schema.pages.length >= 2 && x.schema.pages.length <= 6, t.id);
    for (const p of x.schema.pages) assert.ok(p.fields.some((f) => f.kind !== "statement" && f.kind !== "hidden"), `${t.id}: every page asks something`);
    // When half-width questions run across a page break, the run before it is whole pairs: no pair is cut in two.
    x.schema.pages.slice(0, -1).forEach((p, i) => {
      if (!x.schema.pages[i + 1]!.fields[0]!.half) return;
      let run = 0;
      for (let k = p.fields.length - 1; k >= 0 && p.fields[k]!.half; k--) run++;
      assert.equal(run % 2, 0, `${t.id}: a half-width pair stays on one page`);
    });
  }
  const contact = withPages(templateById("general.contact-us")!, "multi");
  assert.equal(contact.schema.pages.length, 2);
});

test("short forms stay on one page; a form already that way comes as it is", () => {
  const short = TEMPLATES.filter((t) => pagesOf(t) === "one" && questionCount(t) < MIN_SPLIT);
  assert.ok(short.length > 0);
  for (const t of short) {
    assert.ok(!canSwitch(t));
    assert.equal(withPages(t, "multi"), t);
  }
  const t = TEMPLATES.find((x) => x.schema.pages.length > 2)!;
  assert.equal(withPages(t, "multi"), t);
  assert.equal(withPages(t, null), t);
});

test("one in five templates keeps its photos, from every group", () => {
  const pictured = TEMPLATES.filter((t) => t.schema.cover?.photo);
  assert.equal(PICTURE_IDS.size, Math.round(TEMPLATES.length * PICTURE_SHARE));
  assert.deepEqual(new Set(pictured.map((t) => t.id)), PICTURE_IDS);
  assert.ok(TEMPLATES.filter((t) => !PICTURE_IDS.has(t.id)).every((t) => !t.schema.cover?.photo && t.schema.pages.every((p) => !p.photo && p.fields.every((f) => !f.images))), "the rest have no photo anywhere");
  assert.ok(TEMPLATES.filter((t) => t.featured).every((t) => PICTURE_IDS.has(t.id)), "the popular ones keep theirs");
});
