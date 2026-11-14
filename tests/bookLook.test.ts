// The booking page's look (src/lib/meetings/look.ts): every value cleaned before it's saved or drawn, the kit used only
// when there is one, the accent and buttons on top, and the meetings in the page's order.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanWelcome, welcomeHtml, welcomeText, WELCOME_MAX } from "../src/lib/meetings/welcome.ts";
import { ACCENTS, cleanLook, DEFAULT_LOOK, lookTokens, lookWords, ordered, usesKit } from "../src/lib/meetings/look.ts";

const A = "0192f3a1-0000-7000-8000-0000000000a1";
const B = "0192f3a1-0000-7000-8000-0000000000b2";

test("a look is cleaned: unknown values fall back, the welcome line is kept as text, ids only in the order", () => {
  assert.deepEqual(cleanLook(null), DEFAULT_LOOK);
  const l = cleanLook({ look: "neon", accent: "#ff0000", buttons: "square", welcome: `  Pick   a time\n${"x".repeat(300)}`, badge: false, order: [A, "nope", A, B, 3] });
  assert.equal(l.look, undefined);
  assert.equal(l.accent, "emerald");
  assert.equal(l.buttons, undefined);
  assert.ok(l.welcome.startsWith("Pick   a time"));
  assert.ok(l.welcome.endsWith("x".repeat(300)));
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

test("the welcome line is rich text that can never run script or load anything", () => {
  // Formatting stays.
  assert.equal(cleanWelcome("<p><b>Hi</b> <i>there</i> <u>you</u></p><ul><li>One</li></ul><ol><li>Two</li></ol>"), "<p><b>Hi</b> <i>there</i> <u>you</u></p><ul><li>One</li></ul><ol><li>Two</li></ol>");
  // A line per <div> from the editor becomes a paragraph; empty lines at the ends go.
  assert.equal(cleanWelcome("<div>One</div><div>Two</div><div><br></div>"), "<p>One</p><p>Two</p>");
  // Script, frames, events and styles are dropped.
  assert.equal(cleanWelcome('<p onclick="x()" style="color:red">Hi<script>alert(1)</script><iframe src="https://x.io"></iframe></p>'), "<p>Hi</p>");
  assert.equal(cleanWelcome("<img src=x onerror=alert(1)>Hello"), "Hello");
  // Links: https, http, mailto and tel only; a javascript: or merge-tag link keeps its words and loses the link.
  assert.equal(cleanWelcome('<a href="https://acme.com">Site</a>'), '<a href="https://acme.com">Site</a>');
  assert.equal(cleanWelcome('<a href="javascript:alert(1)">Bad</a>'), "Bad");
  assert.equal(cleanWelcome('<a href="{{unsubscribe_url}}">Tag</a>'), "Tag");
  assert.equal(welcomeHtml('<a href="mailto:a@b.co">Mail</a>'), '<a target="_blank" rel="noopener noreferrer" href="mailto:a@b.co">Mail</a>');
  // Plain text from older pages reads the same, escaped.
  assert.equal(cleanWelcome("Pick a time & say hi <3"), "Pick a time &amp; say hi &lt;3");
  assert.equal(cleanWelcome("   "), "");
  assert.equal(cleanWelcome("<p><br></p>"), "");
  assert.equal(cleanWelcome(42), "");
  // Summaries are one plain line.
  assert.equal(welcomeText("<p><b>Hi</b> there</p><ul><li>One</li></ul>"), "Hi there - One");
  // Too long: the words, cut to the limit.
  const long = cleanWelcome(`<p><b>${"a".repeat(WELCOME_MAX + 50)}</b></p>`);
  assert.equal(long, "a".repeat(WELCOME_MAX));
  // Cleaning twice changes nothing.
  const once = cleanWelcome('<div><b>Hi</b> <a href="https://a.io">x</a></div><ul><li>y</li></ul>');
  assert.equal(cleanWelcome(once), once);
});
