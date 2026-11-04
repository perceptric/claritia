// A brand's page source for Tia (src/lib/brand/sourceSkin.ts): what goes to Claude for the brand's Form Studio
// stylesheet (markup without scripts, every stylesheet, the brand's fonts and no math or icon fonts).
import assert from "node:assert/strict";
import { test } from "node:test";
import { fontFaces, googleFontSheets, pageMarkup, pageSource, sourceText } from "../src/lib/brand/sourceSkin.ts";


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
