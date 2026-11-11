// The deep brand read and the brand book (docs/brand-capture.md): a builder site's presets, gradient buttons, own font
// files and sprite logo are read; the book keeps only colors and fonts the site uses; tokens and font CSS follow it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanBook, fontCss, tokensFromBook, writeBook, type Caller } from "../src/lib/brand/book.ts";
import { cleanSvg, extractBrand } from "../src/lib/brand/deep.ts";

const BASE = "https://momos.example.com/";
const HTML = `<html><head><title>Momos | AI For Hospitality</title><meta name="description" content="Unify guest experience.">
<style>
@font-face { font-family: "Poppins"; src: url("https://cdn.example.com/poppins-600.woff2"); font-weight: 600 }
@font-face { font-family: "Poppins"; src: url("https://cdn.example.com/poppins-400.woff2"); font-weight: 400 }
h1,h2,h3,h4,h5,h6,p,body{font:16px Inter}
.preset-h1{--framer-font-family:"Poppins", "Poppins Placeholder", sans-serif;--framer-font-size:64px;--framer-font-weight:600;--framer-line-height:126%;--framer-letter-spacing:-.03em}
.preset-p{--framer-font-family:"Poppins", sans-serif;--framer-font-size:16px;--framer-font-weight:400;--framer-line-height:162%}
body{--token-red:#d73e33;--token-ink:#15181e}
</style></head><body>
<header><a data-framer-name="logo/momos" href="/"><svg viewBox="0 0 32 24"><use href="#mark"/></svg></a><nav><a href="/pricing">Pricing</a><a href="/about">About</a></nav></header>
<svg style="display:none"><symbol id="mark"><path d="M1 1h30v22H1z" onclick="x()"/></symbol></svg>
<h1 class="framer-text preset-h1" style="--framer-text-color:var(--token-ink, rgb(21, 24, 30))">Hospitality, unforgettable</h1>
<p class="preset-p" style="--framer-text-color:rgb(77, 77, 77)">Momos helps multi-location restaurants answer every guest and grow loyalty.</p>
<a data-framer-name="Button Primary" href="/demo" style="--border-color:var(--token-red, rgb(215, 62, 51));background:linear-gradient(139deg, var(--token-red, rgb(215, 62, 51)) 0%, rgb(255, 120, 122) 100%);border-top-left-radius:16px"><div><p style="--framer-text-color:var(--token-x, rgb(255, 255, 255))">Book a demo</p></div><div><p>Book a demo</p></div></a>
${Array.from({ length: 12 }, () => `<div style="background-color:var(--token-red, rgb(215, 62, 51))"></div><p class="preset-p" style="--framer-font-family:&quot;Poppins&quot;, sans-serif">x</p>`).join("")}
<a href="https://www.linkedin.com/company/momos">in</a>
</body></html>`;

test("the deep read: a builder site's type presets, gradient button, own fonts, sprite logo and words", () => {
  const r = extractBrand([{ url: BASE, html: HTML }], []);
  assert.deepEqual(r.type.h1, { family: "Poppins", size: "64px", weight: "600", lineHeight: "126%", letterSpacing: "-.03em" });
  assert.equal(r.type.body.family, "Poppins");
  const btn = r.buttons[0]!;
  assert.equal(btn.bg, "#d73e33");
  assert.match(btn.gradient!, /^linear-gradient\(139deg, #d73e33 0%, rgb\(255, 120, 122\) 100%\)$/);
  assert.equal(btn.color, "#ffffff");
  assert.equal(btn.radius, "16px");
  assert.equal(btn.label, "Book a demo");
  assert.equal(r.fonts[0]!.family, "Poppins");
  assert.deepEqual(r.faces.map((f) => f.weight).sort(), ["400", "600"]);
  assert.match(r.logo.svg!, /<path d="M1 1h30v22H1z"/);
  assert.doesNotMatch(r.logo.svg!, /onclick|script/);
  assert.equal(r.colors.find((c) => c.hex === "#d73e33")!.bg > 10, true);
  assert.deepEqual(r.copy.menu, ["Pricing", "About"]);
  assert.equal(r.social[0]!.kind, "linkedin");
  assert.equal(r.site.name, "Momos");
});

test("an SVG with a script, a link or an outside picture is refused or stripped", () => {
  assert.equal(cleanSvg('<svg><script>alert(1)</script><path d="M0 0"/></svg>'), null);
  assert.equal(cleanSvg('<svg><a href="https://x.com"><path d="M0 0"/></a></svg>'), null);
  assert.equal(cleanSvg('<svg><image href="https://x.com/a.png"/><path d="M0 0" fill="url(https://x)"/></svg>'), '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>');
});

test("the book keeps only colors and fonts the site uses, and sets the tokens and font CSS", async () => {
  const raw = extractBrand([{ url: BASE, html: HTML }], []);
  const call: Caller = async () => ({
    text: JSON.stringify({
      name: "Momos",
      tagline: "Hospitality, unforgettable",
      colors: [
        { hex: "#d73e33", role: "primary", name: "Momos red" },
        { hex: "#15181e", role: "text", name: "Ink" },
        { hex: "#123456", role: "accent", name: "Made up" },
      ],
      type: { heading: { family: "Poppins", weight: "600" }, body: { family: "Comic Sans", weight: "400" }, scale: [{ role: "h1", size: "64px", weight: "600", lineHeight: "126%", letterSpacing: "-.03em" }] },
      buttons: { primary: { bg: "#d73e33", text: "#ffffff", radius: 16, gradient: "linear-gradient(139deg, #d73e33 0%, #ff787a 100%)" }, secondary: null },
      corners: 12,
      shadow: null,
      imagery: "Restaurant teams at work.",
      voice: { tone: "Warm and confident", words: ["guests"], avoid: ["jargon"], ctas: ["Book a demo"] },
      rules: ["Lead with the red button."],
    }),
    usage: {},
  });
  const book = (await writeBook(call, raw))!;
  assert.deepEqual(book.colors.map((c) => c.hex), ["#d73e33", "#15181e"], "a color the site doesn't use is dropped");
  assert.equal(book.type.body.family, "Poppins", "a font the site doesn't use falls back to its own");
  const tokens = tokensFromBook(book, "https://app.tryclaritia.com/api/brand/fonts/0192f3a1-0000-7000-8000-000000000001");
  assert.equal(tokens.buttonBg, "#d73e33");
  assert.equal(tokens.buttonRadius, 16);
  assert.equal(tokens.text, "#15181e");
  assert.match(tokens.font, /^Poppins/);
  assert.equal(tokens.fontUrl, "https://app.tryclaritia.com/api/brand/fonts/0192f3a1-0000-7000-8000-000000000001");
  const css = fontCss(raw.faces, ["Poppins"]);
  assert.match(css, /@font-face\{font-family:"Poppins";src:url\("https:\/\/cdn\.example\.com\/poppins-600\.woff2"\);font-weight:600/);
  assert.equal(fontCss([{ family: 'X"}body{', weight: "400", style: "normal", src: 'https://a.com/x.woff2");}' }], ['X"}body{']), "");
  assert.equal(cleanBook({ colors: [], buttons: { primary: { bg: "#000001" } } }, raw), null, "no real primary color, no book");
});
