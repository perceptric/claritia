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
  assert.equal(lookWords(cleanLook({}), false), "Claritia, round buttons");
  assert.equal(lookWords(cleanLook({ buttons: "soft" }), true), "Your brand kit, soft corners");
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
