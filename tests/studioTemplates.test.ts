// The templates on the Studio's empty canvas (src/lib/forms/gallery/studioList.ts): every template, each with a
// family that's in the menu, its question count, its words for search and its style's colors.
import { test } from "node:test";
import assert from "node:assert/strict";
import { TEMPLATES, templateById } from "../src/lib/forms/gallery/catalog.ts";
import { CARD_QUESTIONS, studioTemplates } from "../src/lib/forms/gallery/studioList.ts";

test("every template is listed once, with a family from the menu", () => {
  const { list, families } = studioTemplates();
  assert.equal(list.length, TEMPLATES.length);
  assert.equal(new Set(list.map((t) => t.id)).size, list.length);
  const fams = new Set(families.map((f) => f.id));
  for (const t of list) {
    assert.ok(templateById(t.id), t.id);
    assert.ok(t.fams.length > 0 && t.fams.every((f) => fams.has(f)), `${t.id} has a family`);
    assert.ok(t.n > 0, `${t.id} has questions`);
    assert.ok(t.name && t.blurb, `${t.id} has a name and a line`);
  }
});

test("search words hold the name, the line and the industry", () => {
  const t = studioTemplates().list.find((x) => x.id === "general.contact-us")!;
  assert.ok(t.words.includes("contact us") && t.words.includes("reach your team") && t.words === t.words.toLowerCase());
});

test("each card shows the form's real title, first questions and button, in its style's button color", () => {
  for (const t of studioTemplates().list) {
    const real = templateById(t.id)!;
    const asked = real.schema.pages[0]!.fields.filter((f) => f.kind !== "hidden" && f.kind !== "statement" && f.kind !== "calc");
    assert.equal(t.form.title, real.schema.title, t.id);
    assert.deepEqual(t.form.qs.map((q) => q.label), asked.slice(0, CARD_QUESTIONS).map((f) => f.label), `${t.id} shows its own first questions`);
    assert.ok(t.form.button, `${t.id} has a button`);
    assert.match(t.form.accent, /^#[0-9a-f]{6}$/i, t.id);
    for (const q of t.form.qs) if (q.opts) assert.ok(q.opts.length > 0 && q.opts.length <= 3, `${t.id} ${q.label}`);
  }
  const contact = studioTemplates().list.find((x) => x.id === "general.contact-us")!;
  assert.ok(contact.form.qs.length > 0 && contact.form.qs.every((q) => q.label.trim()));
});
