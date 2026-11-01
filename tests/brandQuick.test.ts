// The quick brand read (docs/brand-capture.md): the look from a site's HTML and stylesheets, with no browser. Named
// brand colors, filled buttons, a builder site's generated styles, fonts by use, and only the site's own logo.
import assert from "node:assert/strict";
import { test } from "node:test";
import { firstFamily, readBrand, stylesheets, tally, toHex } from "../src/lib/brand/quick.ts";

const BASE = "https://acme.example.com/";

test("colors: hex, short hex, rgb and rgba; see-through and gradients are left out", () => {
  assert.equal(toHex("#D73E33"), "#d73e33");
  assert.equal(toHex("#fff"), "#ffffff");
  assert.equal(toHex("rgb(215, 62, 51)"), "#d73e33");
  assert.equal(toHex("rgba(0,0,0,0.1)"), null);
  assert.equal(toHex("#00000010"), null);
  assert.equal(toHex("linear-gradient(red, blue)"), null);
  assert.equal(firstFamily(`"Poppins", "Poppins Placeholder", sans-serif`), "Poppins");
  assert.equal(firstFamily("-apple-system, BlinkMacSystemFont, sans-serif"), null);
});

test("a stylesheet site: named brand color, the filled button, body text and the Google font", () => {
  const html = `<html><head><link rel="stylesheet" href="/app.css"><link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;700&amp;display=swap" rel="stylesheet"></head><body><img src="/img/acme-logo.svg" alt="Acme"></body></html>`;
  const css = `:root{--color-primary:#0f766e;--radius:10px}
  body{color:#1f2937;background:#fff;font-family:Manrope,system-ui,sans-serif}
  .btn{background-color:var(--color-primary);color:#fff;border-radius:var(--radius);font-weight:600}
  .btn:hover{background-color:#000}`;
  const r = readBrand(html, [css], BASE);
  assert.equal(r.tokens.accent, "#0f766e");
  assert.equal(r.tokens.buttonBg, "#0f766e");
  assert.equal(r.tokens.buttonText, "#ffffff");
  assert.equal(r.tokens.buttonRadius, 10);
  assert.equal(r.tokens.buttonWeight, 600);
  assert.equal(r.tokens.text, "#1f2937");
  assert.match(r.tokens.font!, /^Manrope/);
  assert.match(r.tokens.fontUrl!, /fonts\.googleapis\.com\/css2\?family=Manrope/);
  assert.equal(r.logo, "https://acme.example.com/img/acme-logo.svg");
  assert.deepEqual(stylesheets(html, BASE), ["https://acme.example.com/app.css"]);
});

test("a Framer site: the brand red and the font it uses most, not Framer's blue link default or its Inter body", () => {
  const style = `body{--token-a:#d73e33;--token-b:#15181e;--framer-link-text-color:rgb(0, 153, 255)}body{font-family:Inter,sans-serif}`;
  const uses = Array.from({ length: 30 }, () => `<p style="--framer-font-family:&quot;Poppins&quot;, &quot;Poppins Placeholder&quot;, sans-serif;--framer-text-color:var(--token-b, rgb(21, 24, 30))">x</p><div style="background-color:var(--token-a, rgb(215, 62, 51))"></div>`).join("");
  const links = Array.from({ length: 40 }, () => `<a style="--framer-link-text-color:rgb(0, 153, 255)">x</a>`).join("");
  const html = `<html><head><meta name="generator" content="Framer"><style>${style}</style></head><body>${uses}${links}<img src="https://cdn.x.com/microsoft-logo.png" alt="Microsoft logo"></body></html>`;
  const r = readBrand(html, [], BASE);
  assert.equal(r.tokens.accent, "#d73e33");
  assert.equal(r.tokens.buttonBg, "#d73e33");
  assert.equal(r.tokens.text, "#15181e");
  assert.match(r.tokens.font!, /^Poppins/);
  assert.equal(r.logo, null, "a customer's logo is never taken as the site's");
  assert.equal(tally(html).colors.some(([c]) => c === "#0099ff"), false);
});

test("nothing to read gives nothing, never a made-up look", () => {
  const r = readBrand("<html><body>Hello</body></html>", [], BASE);
  assert.deepEqual(r.tokens, {});
  assert.deepEqual(r.found, []);
});
