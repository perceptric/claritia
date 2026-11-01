// HTML sections (docs/ai-form-builder.md): whatever the AI or a person writes, a section keeps only words, pictures and
// layout. Scripts, frames, event handlers, javascript: and data: links, remote CSS and private addresses never pass.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanHtml, cleanStyle, htmlText } from "../src/lib/forms/html.ts";

test("keeps a hero: headings, words, a picture and a link", () => {
  const out = cleanHtml('<section class="hero" style="display:grid;gap:24px;padding:40px"><h1>Build a smarter plan.</h1><p>Answer a <strong>few</strong> questions.</p><img src="https://img.acme.com/a.jpg" alt="Team"><a href="https://acme.com/pricing">Pricing</a></section>');
  assert.equal(out, '<section class="hero" style="display:grid;gap:24px;padding:40px"><h1>Build a smarter plan.</h1><p>Answer a <strong>few</strong> questions.</p><img src="https://img.acme.com/a.jpg" alt="Team" loading="lazy"><a href="https://acme.com/pricing" rel="noopener noreferrer" target="_blank">Pricing</a></section>');
});

test("drops scripts, frames, handlers and bad links, with what's inside them", () => {
  const evil = [
    "<script>alert(1)</script>",
    "<iframe src=https://evil.com></iframe>",
    '<img src="x" onerror="alert(1)">',
    '<img src="javascript:alert(1)">',
    '<a href="javascript:alert(1)">x</a>',
    '<a href="data:text/html,hi">x</a>',
    '<img src="https://127.0.0.1/a.png">',
    '<img src="http://acme.com/a.png">',
    '<div onclick="steal()">hi</div>',
    "<style>body{display:none}</style>",
    "<svg><script>alert(1)</script></svg>",
    '<form action="https://evil.com"><input name="password"></form>',
    "<<script>script>alert(1)<</script>/script>",
  ];
  for (const e of evil) {
    const out = cleanHtml(e);
    assert.doesNotMatch(out, /<script|<iframe|onerror=|onclick=|javascript:|data:|127\.0\.0\.1|http:\/\/|<style|<form|<input|<svg/i, `${e} -> ${out}`);
  }
  assert.equal(cleanHtml('<div onclick="steal()">hi</div>'), "<div>hi</div>");
});

test("styles keep layout and color, never urls, positions or expressions", () => {
  assert.equal(cleanStyle("color:#111;padding:8px;position:fixed;background:url(https://x/y.png);width:expression(alert(1))"), "color:#111;padding:8px");
  assert.equal(cleanStyle("behavior:url(x.htc);font-size:18px"), "font-size:18px");
});

test("text is escaped, tags are closed, and too much HTML gives nothing", () => {
  assert.equal(cleanHtml("<p>5 < 6 & 7 > 3"), "<p>5 &lt; 6 &amp; 7 &gt; 3</p>");
  assert.equal(cleanHtml("<div><p>open"), "<div><p>open</p></div>");
  assert.equal(cleanHtml(`<p>${"a".repeat(30000)}</p>`), "");
  assert.equal(htmlText("<h1>Hi</h1><p>there &amp; you</p>"), "Hi there & you");
});
