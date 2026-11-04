// The templates on the Studio's empty canvas (src/lib/forms/gallery/studioList.ts): every template, each with a
// family that's in the menu, its question count, its words for search and its style's colors.
import { test } from "node:test";
import assert from "node:assert/strict";
import { TEMPLATES, templateById } from "../src/lib/forms/gallery/catalog.ts";
import { studioTemplates } from "../src/lib/forms/gallery/studioList.ts";

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

test("each card has its style's colors", () => {
  for (const t of studioTemplates().list) for (const v of Object.values(t.art)) assert.match(v, /^(#|rgb|hsl|oklch)/, t.id);
});
