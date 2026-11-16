// Forms right by construction (docs/studio-v2-plan.md Part 16): the guard's rewrite (src/lib/studio/guardCss.ts) and
// stylesheet (guard.ts), readable colors and brand fonts in code (readable.ts), and a form check that only lists what
// the owner decides, each with its spot and never a Fix for Tia.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { THEMES } from "../src/lib/forms/gallery/themes.ts";
import { DEFAULT_BRAND_CSS } from "../src/lib/studio/brandDefault.ts";
import { checkStudioPage } from "../src/lib/studio/check.ts";
import { GUARD_CSS } from "../src/lib/studio/guard.ts";
import { decls, eachRule, guardCss, picksToggle, splitSelectors } from "../src/lib/studio/guardCss.ts";
import { allowedFonts, brandFonts, contrast, parseColor, readableCss, readableCssText, readableOn, readablePair, readBlock, rootVars, writeBlock, type Rgb } from "../src/lib/studio/readable.ts";
import { styleColors, styleCss } from "../src/lib/studio/styleCss.ts";

const rgb = (s: string) => parseColor(s)!;
const ratio = (a: string, b: string) => contrast(rgb(a), rgb(b));
const hsl = (c: Rgb) => {
  const r = c.r / 255, g = c.g / 255, b = c.b / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx === mn) return 0;
  const d = mx - mn;
  return ((mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60) % 360;
};

test("the parsers read selectors and declarations whole", () => {
  assert.deepEqual(splitSelectors(".a, .b:is(.c,.d), [x='1,2']"), [".a", ".b:is(.c,.d)", "[x='1,2']"]);
  assert.deepEqual(decls("color:red; background:url(data:a;b) no-repeat;--x: 1"), [["color", "red"], ["background", "url(data:a;b) no-repeat"], ["--x", "1"]]);
  // Keyframes, @font-face and at-rule headers stay as they are.
  const css = "@font-face{font-family:X;src:url(https://a/b)}@keyframes k{from{width:10px}to{width:900px}}@media (min-width:9px){.a{color:red}}";
  const seen: string[] = [];
  assert.equal(eachRule(css, (s) => (seen.push(s), null)), css);
  assert.deepEqual(seen, [".a"]);
  assert.ok(picksToggle(".choice input") && picksToggle("input[type=radio]") && picksToggle('.opt > input[type="checkbox"]'));
  assert.ok(!picksToggle(".choice") && !picksToggle("input[type=text]") && !picksToggle(".choice input::before"));
});

test("the guard's rewrite: removed radios stay for the keyboard, widths fit, columns shrink, rows of fields stack", () => {
  const out = guardCss(`.choice input{display:none}
.opts input[type=radio], .x{display:none;color:red}
.card{width:640px}
.cell{min-width:120px}
.row{display:grid;grid-template-columns:260px 260px;gap:16px}
.flex{display:flex;gap:8px}
.col{display:flex;flex-direction:column}
@keyframes k{from{width:10px}to{width:900px}}`);
  assert.match(out, /\.choice input\{position:absolute;opacity:0;width:1px;height:1px[^}]*\}/);
  assert.ok(!/\.choice input\{[^}]*display:none/.test(out), "never display:none on a radio");
  assert.match(out, /\.x\{display:none;color:red\}\.opts input\[type=radio\]\{color:red;position:absolute/, "the rest of the list keeps its rule");
  assert.match(out, /\.card\{width:640px;max-width:100%\}/);
  assert.match(out, /\.cell\{min-width:min\(120px,100%\)\}/);
  assert.match(out, /grid-template-columns:minmax\(0,260px\) minmax\(0,260px\)/);
  assert.match(out, /@container \(max-width:560px\)\{:is\(\.row\):has\(/, "a grid row of fields stacks on a phone");
  assert.match(out, /:is\(\.flex\):has\(/, "a flex row of fields stacks on a phone");
  assert.ok(!/:is\(\.col\)/.test(out), "a column is left alone");
  assert.match(out, /@keyframes k\{from\{width:10px\}to\{width:900px\}\}/);
  // Idempotent: the rewrite of the rewrite is the same.
  assert.equal(guardCss(out), out);
  assert.equal(guardCss(""), "");
});

test("the guard's stylesheet: shrinkable items, 44px taps, focusable choices, one arrow, a calendar that fits", () => {
  assert.match(GUARD_CSS, /:where\(\.cl-root\) :where\(\*\)\{min-width:0\}/);
  assert.match(GUARD_CSS, /overflow-wrap:anywhere/);
  assert.match(GUARD_CSS, /\{min-height:44px!important\}/);
  assert.match(GUARD_CSS, /label:has\(input:is\(\[type=radio\],\[type=checkbox\]\)\):has\(input:focus-visible\)\{outline:2px solid currentColor/);
  assert.match(GUARD_CSS, /select:not\(\[multiple\]\):not\(\[size\]\)\{appearance:none!important/);
  assert.match(GUARD_CSS, /\.cl-pick\{background-image:none!important\}/, "the form's own dropdown keeps its one arrow");
  assert.match(GUARD_CSS, /:has\(>select,>\.cl-pick\)::after[^{]*\{content:none!important\}/, "a wrapper's drawn arrow goes");
  assert.match(GUARD_CSS, /\.cl-cal \.cl-times\{display:grid!important;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(GUARD_CSS, /\.cl-cal \.cl-times>\*\{width:100%!important;min-width:0!important/);
  assert.match(GUARD_CSS, /@container \(max-width:340px\)/, "two columns of times on the narrowest phones");
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(GUARD_CSS.replace(/data:image[^)]*\)/g, "")), "no colors of its own");
});

test("readable: the nearest color of the same hue that passes, darker on light and lighter on dark", () => {
  const pale = "#9ca3af";
  const fixed = readableCss(pale, "#ffffff");
  assert.ok(ratio(fixed, "#ffffff") >= 4.5 && ratio(fixed, "#ffffff") < 4.8, `just past the line (${ratio(fixed, "#ffffff")})`);
  assert.ok(Math.abs(hsl(rgb(fixed)) - hsl(rgb(pale))) < 3, "same hue");
  assert.ok(rgb(fixed).r < rgb(pale).r, "darker on light");
  const onDark = readableCss("#4b5563", "#111111");
  assert.ok(ratio(onDark, "#111111") >= 4.5 && rgb(onDark).r > 0x4b, "lighter on dark");
  // Large text needs 3 to 1; what passes is left as it is.
  assert.ok(ratio(readableCss("#a0a0a0", "#ffffff", 3), "#ffffff") >= 3);
  assert.equal(readableCss("#333333", "#ffffff"), "#333333");
  // Faint text (low alpha) is made to read once drawn over its background.
  const faint = readableOn({ r: 0, g: 0, b: 0, a: 0.3 }, rgb("#ffffff"), 4.5, 1);
  assert.ok(contrast({ r: 255 - (255 - faint.r) * faint.a, g: 255 - (255 - faint.g) * faint.a, b: 255 - (255 - faint.b) * faint.a, a: 1 }, rgb("#ffffff")) >= 4.5);
  // A button's white words keep their white: the button's color darkens a touch.
  const btn = readablePair(rgb("#ffffff"), rgb("#0c8c5e"));
  assert.equal(btn.fg.r, 255);
  assert.ok(contrast(btn.fg, btn.bg) >= 4.5 && Math.abs(hsl(btn.bg) - hsl(rgb("#0c8c5e"))) < 3);
  assert.equal(parseColor("rgb(10 20 30 / 50%)")!.a, 0.5);
  assert.equal(parseColor("hsl(0, 0%, 100%)")!.g, 255);
});

test("readable at the source: a brand's variables and rules that set their own background", () => {
  const brand = ":root{--brand-text:#111;--brand-muted:#a1a1aa;--brand-bg:#ffffff;--brand-surface:#fafafa;--brand-primary:#22c55e;--brand-on-primary:#ffffff}.btn{background:var(--brand-primary);color:var(--brand-on-primary)}.hero{background:#0b0b0b;color:#3f3f46}.note{color:#ddd}";
  const out = readableCssText(brand);
  const v = rootVars(out);
  assert.ok(ratio(v.get("--brand-muted")!, "#fafafa") >= 4.5 && ratio(v.get("--brand-muted")!, "#ffffff") >= 4.5);
  assert.ok(ratio(v.get("--brand-on-primary")!, v.get("--brand-primary")!) >= 4.5);
  assert.ok(ratio(/\.hero\{background:#0b0b0b;color:(#[0-9a-f]{6})/.exec(out)![1]!, "#0b0b0b") >= 4.5, "a rule's color reads on its own background");
  assert.match(out, /\.note\{color:#ddd\}/, "a color with no background of its own is left to the measure");
  assert.equal(readableCssText(out), out, "idempotent");
  assert.equal(readableCssText(DEFAULT_BRAND_CSS), DEFAULT_BRAND_CSS, "the plain brand already reads");
});

test("the 18 styles read at the source: text, muted text and a button's words", () => {
  for (const th of THEMES) {
    const c = styleColors(th);
    // A transparent field shows the page under it.
    for (const bg of [c.card, c.field, c.soft].filter((x) => parseColor(x)?.a === 1)) {
      assert.ok(ratio(c.text, bg) >= 4.5, `${th.id} text`);
      assert.ok(ratio(c.muted, bg) >= 4.5, `${th.id} muted on ${bg}`);
    }
    assert.ok(ratio(c.accentInk, c.accent) >= 4.5, `${th.id} button ${c.accentInk} on ${c.accent}`);
    assert.equal(readableCssText(styleCss(th)), styleCss(th), `${th.id} passes the source pass`);
  }
});

test("fonts: only the brand's, the owner's pick in the Form tab kept", () => {
  const brand = '@import url("https://fonts.googleapis.com/css2?family=Nunito:wght@500&family=Sniglet&display=swap");.btn{font:800 16px/1 Nunito,sans-serif}';
  const form = `@import url("https://fonts.googleapis.com/css2?family=Lobster&display=swap");
@import url("https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap"); /* form font */
.eyebrow{font-family:"Lobster",cursive;color:#999}
.title{font:700 30px/1.1 "Pacifico", serif}
.ok{font-family:Sniglet}
:root{--brand-font:"DM Sans", system-ui, sans-serif}`;
  const out = brandFonts(form, brand);
  assert.ok(!/Lobster|Pacifico/.test(out), "other fonts are put back to the brand's");
  assert.match(out, /\.eyebrow\{font-family:Nunito,sans-serif;color:#999\}/);
  assert.match(out, /\.title\{font:700 30px\/1\.1 Nunito,sans-serif\}/);
  assert.match(out, /\.ok\{font-family:Sniglet\}/);
  assert.match(out, /DM\+Sans[^\n]*\/\* form font \*\//, "the owner's pick stays");
  assert.match(out, /--brand-font:"DM Sans"/);
  assert.match(out, /\.cl-root\{font-family:Nunito,sans-serif\}/, "text nothing gives a font to takes the brand's");
  assert.equal(brandFonts(out, brand), out, "idempotent");
  assert.ok(allowedFonts(brand, form).has("dm sans") && allowedFonts(brand, form).has("sniglet") && !allowedFonts(brand, form).has("lobster"));
});

test("the readable block: written before the editor's rules, read back, and gone when empty", () => {
  const css = ".a{color:red}\n/* editor */\n.b{color:blue}";
  const rules = new Map([[".cl-root #eb:not(#cl-r)", "color:#767676"]]);
  const out = writeBlock(css, rules);
  assert.ok(out.indexOf("/* claritia: readable */") < out.indexOf("/* editor */"));
  assert.deepEqual([...readBlock(out)], [...rules]);
  assert.equal(writeBlock(out, rules), out);
  assert.equal(writeBlock(out, new Map()), ".a{color:red}\n/* editor */\n.b{color:blue}");
});

test("the form check lists only what the owner decides, each with its spot, and no Fix for Tia", () => {
  const page = `<div class="page"><form><section data-cl-step><label for="pw">Password</label><input id="pw" name="pw" type="password"></section><section data-cl-step data-cl-show-if="gone == 'x'"><label for="em">Email</label><input id="em" name="email" type="email"><button type="submit">Send</button></section></form></div>`;
  const issues = checkStudioPage({ html: page, after: { kind: "meeting", meeting: "nope" }, meetings: [{ id: "m1", name: "Intro" }], langs: {} });
  const by = (code: string) => issues.find((i) => i.code === code);
  assert.equal(by("password")?.go, "q:pw");
  assert.equal(by("meeting-gone")?.go, "after");
  assert.equal(by("show-if-gone")?.go, "page:1");
  assert.equal(by("step-stuck")?.go, "page:0");
  assert.ok(issues.every((i) => !("fix" in i)), "no instructions for Tia");
  assert.equal(checkStudioPage({ html: "<div></div>", after: { kind: "thanks" }, meetings: null }).find((i) => i.code === "no-questions")?.go, "add");
  // The header's form check and the Studio have no Fix step.
  const header = readFileSync(new URL("../src/components/app/forms/FormHeader.tsx", import.meta.url), "utf8");
  const studio = readFileSync(new URL("../src/components/app/forms/studio/studio.ts", import.meta.url), "utf8");
  assert.ok(!/Fix all|onFix|canFix|AiMark/.test(header), "FormCheck has no Fix, Fix all or sparkle");
  assert.ok(!/canFix|fix\(fixes|Fix this:|Fix these:/.test(studio), "the Studio sends no fix to Tia");
  // Layout notes in the Studio carry no instruction for Tia either.
  assert.ok(!/code: "(sideways|contrast|clipped|small-tap|keyboard|font)"[^}]*fix:/.test(studio));
});
