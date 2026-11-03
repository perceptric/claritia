// A brand's look from its page source (docs/forms.md, Styling): what goes to Claude (markup without scripts, every
// stylesheet, the brand's fonts and no math or icon fonts) and what comes back (cleaned, with only the fonts it uses).
// The flaky cases: no JSON, a stylesheet that tries to load files, and one with no button.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fontFaces, googleFontSheets, pageMarkup, pageSource, skinFromSource, sourceText, type SourceCaller } from "../src/lib/brand/sourceSkin.ts";

const usage = { input_tokens: 1, output_tokens: 1 } as never;
const answer = (o: unknown): SourceCaller => async () => ({ text: typeof o === "string" ? o : JSON.stringify(o), usage });

const html = `<html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;800&amp;display=swap"><style>.btn{background:#58cc02;border-radius:12px}</style><script>window.x = 1</script></head><body><!-- hi --><svg><path d="M0"/></svg><button class="btn">Get started</button></body></html>`;
const css = `@font-face{font-family:"Feather";font-weight:700;src:url(/f/feather.woff2) format("woff2"),url(/f/feather.woff) format("woff")}
@font-face{font-family:KaTeX_Main;src:url(/k.woff2)}
@font-face{font-family:'Nunito';font-style:normal;font-weight:800;src:url(https://fonts.gstatic.com/s/nunito/cyr.woff2) format('woff2');unicode-range:U+0301,U+0400-045F}
@font-face{font-family:'Nunito';font-style:normal;font-weight:800;src:url(https://fonts.gstatic.com/s/nunito/latin.woff2) format('woff2');unicode-range:U+0000-00FF,U+0131}
.input{border:2px solid #e5e5e5;border-radius:12px}`;

test("the markup Claude reads: no scripts, drawings or comments", () => {
  const m = pageMarkup(html);
  assert.ok(m.includes('<button class="btn">Get started</button>'));
  assert.ok(!m.includes("window.x"));
  assert.ok(!m.includes("<path"));
  assert.ok(!m.includes("hi -->"));
});

test("fonts: the brand's own, the best file, Latin only; no math or icon fonts", () => {
  const faces = fontFaces(css, "https://acme.com/css/app.css");
  assert.deepEqual(faces, [
    { family: "Feather", weight: "700", style: "normal", src: "https://acme.com/f/feather.woff2" },
    { family: "Nunito", weight: "800", style: "normal", src: "https://fonts.gstatic.com/s/nunito/latin.woff2" },
  ]);
  assert.deepEqual(googleFontSheets(html, "https://acme.com/"), ["https://fonts.googleapis.com/css2?family=Nunito:wght@400;800&display=swap"]);
});

test("the source: inline styles first, @font-face rules out of the CSS, and the colors read from the site", () => {
  const src = { ...pageSource("https://acme.com/", html, [{ url: "https://acme.com/css/app.css", text: css }]), colors: { buttonBg: "#58cc02" } };
  assert.equal(src.css[0]!.text, ".btn{background:#58cc02;border-radius:12px}");
  assert.ok(!src.css[1]!.text.includes("@font-face"));
  const t = sourceText(src);
  assert.match(t, /COLORS \{"buttonBg":"#58cc02"\}/);
  assert.match(t, /FONTS Feather 700 normal; Nunito 800 normal/);
});

test("Claude's stylesheet comes back cleaned, with only the fonts it uses", async () => {
  const src = pageSource("https://acme.com/", html, [{ url: "https://acme.com/css/app.css", text: css }]);
  const r = await skinFromSource(answer({ css: ':host{font-family:Feather,sans-serif}.bt{background:#58cc02;border-radius:12px;box-shadow:0 4px 0 #58a700;background-image:url(https://evil.example/x.png)}.bt:active{transform:translateY(4px);box-shadow:none}', fonts: ["Feather"], notes: ["the green button"] }), src);
  assert.ok(r);
  assert.ok(!r.css.includes("url("), "links are dropped");
  assert.ok(r.css.includes(".bt:active"));
  assert.deepEqual(r.faces.map((f) => f.family), ["Feather"]);
});

test("flaky cases: no JSON, a sheet with @import, or no button style give nothing", async () => {
  const src = pageSource("https://acme.com/", html, []);
  assert.equal(await skinFromSource(answer("Sorry, I can't."), src), null);
  assert.equal(await skinFromSource(answer({ css: "@import url(x.css); .bt{color:red", fonts: [], notes: [] }), src), null);
  assert.equal(await skinFromSource(answer({ css: ".in{border:1px solid #ccc}", fonts: [], notes: [] }), src), null);
  assert.equal(await skinFromSource(async () => null, src), null);
});
