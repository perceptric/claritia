// The gallery's extras (docs/form-templates-plan.md 5.5): the words someone types matched to the catalog, with the
// model's answer never trusted past the catalog's own ids.
import assert from "node:assert/strict";
import { test } from "node:test";
import { TEMPLATES } from "../src/lib/forms/gallery/catalog.ts";
import { catalogLines, keyWords, localMatch, readMatch } from "../src/lib/forms/gallery/match.ts";

test("describe your form: local words first, and only catalog ids from the model", () => {
  assert.deepEqual(keyWords("I need a form for the Cake orders"), ["cake", "orders"]);
  const hit = localMatch("demo request");
  assert.ok(hit.length >= 1 && hit.some((t) => t.id === "saas.demo-request"));
  assert.ok(localMatch("zzzz qqqq").length === 0);
  const lines = catalogLines();
  assert.equal(lines.split("\n").length, TEMPLATES.length);
  assert.ok(lines.includes("saas.demo-request | Demo request |"));
  assert.deepEqual(readMatch("saas.demo-request\nmade.up-template\ngeneral.contact-us\nsaas.demo-request"), ["saas.demo-request", "general.contact-us"]);
  assert.deepEqual(readMatch("NONE"), []);
});

test("starter kits: 3 to 5 public forms of one industry, from different groups; seasons name real templates", async () => {
  const { KITS, SEASONAL, inSeason, kitById, newest } = await import("../src/lib/forms/gallery/kits.ts");
  const { templateById } = await import("../src/lib/forms/gallery/catalog.ts");
  const { facets } = await import("../src/lib/forms/gallery/filter.ts");
  assert.ok(KITS.length >= 20);
  assert.equal(new Set(KITS.map((k) => k.id)).size, KITS.length);
  for (const k of KITS) {
    assert.equal(kitById(k.id), k);
    assert.ok(k.templates.length >= 3 && k.templates.length <= 5, k.id);
    const list = k.templates.map((id) => templateById(id)!);
    assert.ok(list.every((t) => t && t.industry === k.industry && !t.internal), k.id);
    assert.ok(new Set(list.flatMap((t) => facets(t).families)).size >= 3, `${k.id} covers several groups`);
    assert.equal(new Set(k.templates).size, k.templates.length, k.id);
  }
  for (const id of Object.keys(SEASONAL)) assert.ok(templateById(id), `seasonal ${id}`);
  assert.ok(inSeason(1).some((t) => t.id === "accounting.tax-intake"));
  assert.ok(!inSeason(7).some((t) => t.id === "accounting.tax-intake"));
  assert.ok(newest("2026-11-20").every((t) => t.added! >= "2026-10-21"));
  assert.deepEqual(newest("2025-01-01"), []);
});
