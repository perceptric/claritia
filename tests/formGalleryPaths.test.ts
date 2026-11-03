// Page paths in form templates (docs/multipage-forms-plan.md, Step 1): written by page title, checked on the template,
// and carried into the saved form, where the engine's own check accepts them.
import assert from "node:assert/strict";
import { test } from "node:test";
import { TEMPLATES } from "../src/lib/forms/gallery/catalog.ts";
import { templateForm } from "../src/lib/forms/gallery/convert.ts";
import { hasPaths, pathProblems } from "../src/lib/forms/gallery/paths.ts";
import { email, fullName, go, money, one, text, tpl, yesno } from "../src/lib/forms/gallery/templates/build.ts";
import { checkForm } from "../src/lib/forms/schema.ts";

const sample = () =>
  tpl("insurance.sample-quote", "insurance", "Sample quote", ["request"], "A sample with paths.", {
    cover: { title: "Get a quote", text: "About 4 minutes.", button: "Start" },
    resume: true,
    copy: true,
    pages: [
      { title: "You", fields: [fullName(), email("Email"), one("What do you need?", ["Car", "Home"], { required: true })], jumps: [go("What do you need?", "is", "Home", "Home")] },
      { title: "Car", fields: [text("Make and model", { required: true }), yesno("Any claims in 5 years?")], skip: go("Any claims in 5 years?", "is", false, "Coverage") },
      { title: "Claims", fields: [text("What happened?")], jumps: [go("What happened?", "answered", undefined, "Coverage")] },
      { title: "Home", fields: [money("Home value")] },
      { title: "Coverage", fields: [one("Coverage", ["Basic", "Full"], { required: true })], jumps: [go("Coverage", "is", "Basic", "end")] },
      { title: "Extras", fields: [text("Anything else?")] },
    ],
    end: ["Thanks", "We'll send your quote."],
  });

test("page paths: by title, resolved to places, carried into the saved form, and the engine accepts them", () => {
  const t = sample();
  const p = t.schema.pages;
  assert.deepEqual(p[0]!.jumps, [{ when: { key: "what_do_you_need", op: "is", value: "Home" }, to: 3 }]);
  assert.deepEqual(p[1]!.skip, { when: { key: "any_claims_in_5_years", op: "is", value: false }, to: 4 });
  assert.equal(p[4]!.jumps![0]!.to, 6, "end is the number of pages");
  assert.deepEqual(pathProblems(t), []);
  assert.ok(hasPaths(t));
  const form = templateForm(t);
  assert.equal(form.steps[0]!.jumps?.[0]?.to, 3);
  assert.equal(form.steps[1]!.skip?.to, 4);
  assert.deepEqual(form.layout.cover, { title: "Get a quote", text: "About 4 minutes.", button: "Start" });
  assert.equal(form.resume, true);
  assert.equal(form.copy, true);
  const r = checkForm(JSON.parse(JSON.stringify(form)));
  assert.ok(!("errors" in r), JSON.stringify("errors" in r ? r.errors : ""));
  if (!("errors" in r)) {
    assert.equal(r.form.steps[0]!.jumps?.length, 1, "the engine keeps the path");
    assert.equal(r.form.steps[1]!.skip?.to, 4, "and the skip");
  }
});

test("page paths: bad ones are named, in words", () => {
  const t = sample();
  const pages = t.schema.pages;
  pages[1]!.skip = { when: { key: "anything_else", op: "answered" }, to: 2 };
  pages[3]!.jumps = [{ when: { key: "coverage", op: "is", value: "Gold" }, to: 1 }];
  const out = pathProblems(t);
  assert.ok(out.some((m) => /page 2: a skip on "anything_else", which isn't on this page or one before it/.test(m)), out.join("\n"));
  assert.ok(out.some((m) => /page 2: a skip goes to page 3, which isn't after the next one/.test(m)));
  assert.ok(out.some((m) => /page 4: a path goes to page 2/.test(m)));
  assert.throws(() => tpl("x.y", "general", "X", ["lead"], "x", { pages: [{ title: "A", fields: [text("Q")], jumps: [go("Q", "answered", undefined, "Nope")] }, { title: "B", fields: [] }], end: ["a", "b"] }), /isn't a page title/);
});

test("the whole catalog: every form template's page paths are sound and multi-page forms title every page", () => {
  for (const t of TEMPLATES) {
    assert.deepEqual(pathProblems(t), [], t.id);
    if (hasPaths(t)) assert.ok(t.schema.pages.every((p) => p.title), `${t.id}: every page has a title`);
  }
});
