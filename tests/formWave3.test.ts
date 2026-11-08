// Templates, wave 3 (docs/template-wave3-plan.md): simple forms stay simple, new multi-page forms are plain and titled,
// a form split into pages keeps its questions, and every template has its own name, slug and menus.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { questionCount, templateSlug, TEMPLATES } from "../src/lib/forms/gallery/catalog.ts";
import { lengthOf } from "../src/lib/forms/gallery/taxonomy.ts";

const WAVE3 = "2026-11-08";
const keysBefore = JSON.parse(readFileSync(new URL("./fixtures/template-keys.json", import.meta.url), "utf8")) as Record<string, string[]>;

test("simple forms: one page, 3 to 6 questions, no welcome screen, logic, calculation or payment, under a minute", () => {
  const simple = TEMPLATES.filter((t) => t.simple);
  for (const t of simple) {
    const fields = t.schema.pages.flatMap((p) => p.fields);
    assert.equal(t.schema.pages.length, 1, `${t.id} is one page`);
    const n = questionCount(t);
    assert.ok(n >= 3 && n <= 6, `${t.id} asks 3 to 6 questions (${n})`);
    assert.ok(!t.schema.cover, `${t.id} has no welcome screen`);
    assert.ok(!t.mode, `${t.id} shows as one page`);
    assert.ok(!fields.some((f) => f.show || f.kind === "calc" || f.kind === "payment" || f.kind === "matrix" || f.kind === "ranking"), `${t.id} has no logic, calculation, payment, grid or ranking`);
    assert.equal(lengthOf(t), "quick", `${t.id} takes under a minute`);
  }
});

test("new multi-page forms: 3 to 6 titled pages, no photo, opening on page 1", () => {
  for (const t of TEMPLATES.filter((x) => x.added === WAVE3 && x.schema.pages.length > 1 && !keysBefore[x.id])) {
    assert.ok(t.schema.pages.length >= 3 && t.schema.pages.length <= 6, `${t.id} has 3 to 6 pages`);
    assert.ok(t.schema.pages.every((p) => p.title?.trim()), `${t.id} titles every page`);
    assert.ok(!t.schema.cover, `${t.id} opens on page 1, no welcome screen or photo`);
    t.schema.pages.forEach((p, i) => {
      for (const j of [...(p.skip ? [p.skip] : []), ...(p.jumps ?? [])]) assert.ok(j.to > i + 1, `${t.id}: page ${i + 1}'s skip points forward`);
    });
  }
});

test("a form split into pages, like every template before wave 3, keeps its questions in the same order", () => {
  for (const [id, keys] of Object.entries(keysBefore)) {
    const t = TEMPLATES.find((x) => x.id === id);
    assert.ok(t, `${id} is still in the gallery`);
    assert.deepEqual(t!.schema.pages.flatMap((p) => p.fields.map((f) => f.key)), keys, `${id} keeps its question keys and order`);
  }
});

test("every template has its own name and slug, a category, an industry and a team", () => {
  const names = new Map<string, string>();
  const slugs = new Set<string>();
  for (const t of TEMPLATES) {
    const n = t.name.toLowerCase();
    assert.ok(!names.has(`${t.industry}:${n}`), `${t.id} shares its name with ${names.get(`${t.industry}:${n}`)} in ${t.industry}`);
    names.set(`${t.industry}:${n}`, t.id);
    const slug = templateSlug(t);
    assert.ok(!slugs.has(slug), `${t.id}'s slug ${slug} is taken`);
    slugs.add(slug);
    assert.ok(t.categories?.length, `${t.id} has a category`);
    assert.ok(t.teams?.length, `${t.id} has a team`);
    assert.ok(t.industry, `${t.id} has an industry`);
  }
});
