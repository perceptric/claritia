// The gallery's extras (docs/form-templates-plan.md 5.3 and 5.5): a visitor's brand read with no AI, and the words
// someone types matched to the catalog, with the model's answer never trusted past the catalog's own ids.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { RawBrand } from "../src/lib/brand/deep.ts";
import { TEMPLATES } from "../src/lib/forms/gallery/catalog.ts";
import { catalogLines, keyWords, localMatch, readMatch } from "../src/lib/forms/gallery/match.ts";
import { inkFor, peekFrom } from "../src/lib/forms/gallery/peek.ts";

const raw = (over: Partial<RawBrand>): RawBrand => ({
  site: { url: "https://acme.com", name: "Acme", title: "", description: "" },
  logo: { svg: null, src: null },
  icons: { favicon: null, touch: null, share: null },
  colors: [],
  fonts: [],
  faces: [],
  googleFonts: null,
  type: { h1: {}, h2: {}, h3: {}, h4: {}, body: {}, small: {} },
  buttons: [],
  radii: [],
  shadows: [],
  gradients: [],
  images: [],
  copy: { headlines: [], ctas: [], menu: [], paragraphs: [] },
  social: [],
  emails: [],
  ...over,
});

test("brand peek: the button's color and corners, a Google font, the logo, and nothing it can't see", () => {
  const p = peekFrom(
    raw({
      buttons: [
        { bg: "#ffffff", color: "#111111", count: 9 },
        { bg: "rgb(255, 90, 54)", color: "#ffffff", radius: "999px", count: 4 },
      ],
      fonts: [{ family: "system-ui", count: 20 }, { family: "'DM Sans'", count: 12 }],
      googleFonts: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;700",
      logo: { svg: null, src: "https://acme.com/logo.png" },
    }),
    "Acme",
  );
  assert.equal(p.accent, "#ff5a36", "a white button is never the brand color");
  assert.equal(p.accentInk, "#ffffff");
  assert.equal(p.radius, 999);
  assert.equal(p.font, "DM Sans");
  assert.match(p.fontUrl!, /family=DM\+Sans/);
  assert.equal(p.logo, "https://acme.com/logo.png");
  // A gray page with a font it can't load: no guesses.
  const none = peekFrom(raw({ buttons: [{ bg: "#333333", count: 3 }], fonts: [{ family: "Proxima Nova", count: 9 }], logo: { svg: null, src: "http://acme.com/x.png" } }), "Acme");
  assert.deepEqual(none, { name: "Acme" });
  // Button text that doesn't read on the color is replaced by one that does.
  const pale = peekFrom(raw({ buttons: [{ bg: "#ffd60a", color: "#ffffff", count: 2 }] }), "Acme");
  assert.equal(pale.accentInk, "#111111");
  assert.equal(inkFor("#0a0a0a"), "#ffffff");
});

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
