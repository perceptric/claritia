// The booking page's look (src/lib/meetings/look.ts): every value cleaned before it's saved or drawn, the kit used only
// when there is one, the accent and buttons on top, and the meetings in the page's order.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ACCENTS, cleanLook, DEFAULT_LOOK, lookTokens, lookWords, ordered, usesKit } from "../src/lib/meetings/look.ts";

const A = "0192f3a1-0000-7000-8000-0000000000a1";
const B = "0192f3a1-0000-7000-8000-0000000000b2";

test("a look is cleaned: unknown values fall back, the welcome line is one short line, ids only in the order", () => {
  assert.deepEqual(cleanLook(null), DEFAULT_LOOK);
  const l = cleanLook({ look: "neon", accent: "#ff0000", buttons: "square", welcome: `  Pick   a time\n${"x".repeat(300)}`, badge: false, order: [A, "nope", A, B, 3] });
  assert.equal(l.look, undefined);
  assert.equal(l.accent, "emerald");
  assert.equal(l.buttons, undefined);
  assert.equal(l.welcome.length, 140);
  assert.ok(l.welcome.startsWith("Pick a time x"));
  assert.equal(l.badge, false);
  assert.deepEqual(l.order, [A, B]);
});

test("the kit is used only when there is one; Claritia's look ignores it", () => {
  const kit = { background: "#101010", text: "#ffffff" };
  assert.equal(usesKit(cleanLook({}), true), true);
  assert.equal(usesKit(cleanLook({ look: "brand" }), false), false, "no kit: Claritia's look");
  const claritia = lookTokens(cleanLook({ look: "claritia", accent: "rose", buttons: "soft" }), kit);
  assert.deepEqual(claritia.tokens, {});
  assert.deepEqual(claritia.vars, { "--cb-dot": ACCENTS.rose, "--clr-btn-radius": "10px" });
  const brand = lookTokens(cleanLook({}), kit);
  assert.equal(brand.tokens, kit);
  assert.deepEqual(brand.vars, {}, "a kit keeps its own accent and corners until changed");
  assert.equal(lookWords(cleanLook({}), false), "Claritia");
  assert.equal(lookWords(cleanLook({ buttons: "soft" }), true), "Your brand");
  assert.equal(lookWords(cleanLook({}), true, "Acme"), "Acme");
  assert.equal(cleanLook({ brand: A }).brand, A, "a page keeps its picked brand");
  assert.equal(cleanLook({ brand: "nope" }).brand, undefined);
});

test("meetings follow the page's order; the rest by name", () => {
  const types = [
    { id: "c", name: "Coffee" },
    { id: B, name: "Demo" },
    { id: A, name: "Audit" },
  ];
  assert.deepEqual(ordered(types, [B]).map((t) => t.name), ["Demo", "Audit", "Coffee"]);
  assert.deepEqual(ordered(types, []).map((t) => t.name), ["Audit", "Coffee", "Demo"]);
});

test("a design dresses a page without a kit; the kit wins when there is one; Claritia's default is unchanged", async () => {
  const { DESIGNS, DESIGN_LIST } = await import("../src/lib/meetings/designs.ts");
  const { cleanTokens, cleanFontUrl } = await import("../src/lib/forms/brand.ts");
  assert.equal(cleanLook({ design: "nope" }).design, undefined);
  assert.equal(cleanLook({ design: "claritia" }).design, undefined, "Claritia is the default, not saved");
  assert.equal(cleanLook({ design: "midnight" }).design, "midnight");
  const d = lookTokens(cleanLook({ look: "claritia", design: "midnight" }), { background: "#101010" });
  assert.equal(d.tokens.background, DESIGNS.midnight.tokens.background);
  assert.equal(d.vars["--cb-page-bg"], "#0a0f1f");
  const kitWins = lookTokens(cleanLook({ design: "midnight" }), { background: "#101010" });
  assert.equal(kitWins.tokens.background, "#101010", "an unset look with a kit uses the kit");
  const plain = lookTokens(cleanLook({ look: "claritia" }), null);
  assert.deepEqual(plain.tokens, {});
  assert.equal(plain.vars["--cb-page-bg"], undefined, "Claritia's look sets no design variables");
  assert.equal(lookWords(cleanLook({ design: "paper" }), false), "Paper");
  for (const x of DESIGN_LIST) {
    if (x.id === "claritia") continue;
    assert.deepEqual(cleanTokens(x.tokens).dropped, [], `${x.id}: every token is valid`);
    assert.ok(cleanFontUrl(x.tokens.fontUrl), `${x.id}: fonts from Google Fonts`);
    assert.ok(x.vars["--cb-page-bg"], `${x.id}: has a page color`);
  }
});
