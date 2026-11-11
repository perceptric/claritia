// A brand's logo and home page as the Studio shows them (src/lib/brand/svgData.ts, deep.ts cleanSvg, studio/site.ts
// previewHtml, brandKit logosOf). Flaky cases from real sites: an inline SVG logo with no namespace (momos.com showed
// broken), gradients and clip paths whose names are case-sensitive, a logo address the site won't share, and home
// pages carrying scripts, frames, inline handlers and refreshes that must never run in the preview.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanSvg } from "../src/lib/brand/deep.ts";
import { svgDataUri, withSvgNs } from "../src/lib/brand/svgData.ts";
import { logosOf } from "../src/components/app/forms/studio/brandKit.ts";

test("a cleaned logo drawing names the SVG namespace and keeps case-sensitive names", () => {
  const out = cleanSvg('<svg viewBox="0 0 32 24"><defs><linearGradient id="g"><stop offset="0"/></linearGradient><clipPath id="c"><rect width="1" height="1"/></clipPath></defs><path d="M0 0h1" fill="url(#g)" clip-path="url(#c)"/><script>alert(1)</script></svg>');
  assert.equal(out, null, "a drawing with a script is refused whole");
  const ok = cleanSvg('<svg viewBox="0 0 32 24"><defs><linearGradient id="g"><stop offset="0"/></linearGradient><clipPath id="c"><rect width="1" height="1"/></clipPath></defs><path d="M0 0h1" fill="url(#g)" clip-path="url(#c)" onclick="x()"/></svg>')!;
  assert.match(ok, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 32 24">/);
  assert.ok(ok.includes("<linearGradient") && ok.includes("</linearGradient>") && ok.includes("<clipPath") && ok.includes("</clipPath>"));
  assert.ok(!ok.includes("onclick"));
});

test("drawings kept before the fix get their namespace when shown", () => {
  assert.equal(withSvgNs('<svg viewBox="0 0 1 1"></svg>'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>');
  assert.equal(withSvgNs('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  assert.ok(decodeURIComponent(svgDataUri("<svg></svg>")).includes('xmlns="http://www.w3.org/2000/svg"'));
});

test("a brand's logo has a backup: its picture first, then its drawing, nothing unsafe", () => {
  const both = logosOf({ id: "k", source_url: null, scan_status: null, logo_url: "https://cdn.acme.com/logo.png", logo_svg: '<svg viewBox="0 0 1 1"></svg>' });
  assert.equal(both.length, 2);
  assert.equal(both[0], "https://cdn.acme.com/logo.png");
  assert.match(both[1]!, /^data:image\/svg\+xml;utf8,%3Csvg%20xmlns/);
  assert.deepEqual(logosOf({ id: "k", source_url: null, scan_status: null, logo_url: "http://insecure/logo.png", logo_svg: "<div>no</div>" }), []);
  assert.deepEqual(logosOf(null), []);
});

test("the home page preview runs nothing: scripts, frames, handlers, refreshes and javascript links out", async () => {
  const { previewHtml } = await import("../src/lib/studio/site.ts");
  const words = "Welcome to Acme. We make forms that book meetings for small teams everywhere, every day of the week.";
  const html = `<html><head><meta http-equiv="refresh" content="0;url=https://evil.io"><base href="https://evil.io/"><script src="/a.js"></script><script>steal()</script></head><body onload="x()"><h1 onclick='y()'>Acme</h1><p>${words}</p><iframe src="https://evil.io"></iframe><object data="x"></object><embed src="x"><a href="javascript:alert(1)">go</a><img src="/hero.png" onerror=z()></body></html>`;
  const out = previewHtml(html, "https://acme.com/")!;
  for (const bad of ["<script", "steal()", "http-equiv", "evil.io", "<iframe", "<object", "<embed", "onload", "onclick", "onerror", "javascript:"]) assert.ok(!out.includes(bad), bad);
  assert.ok(out.includes('<base href="https://acme.com/" target="_blank">'), "relative addresses read from the site, links open outside");
  assert.ok(out.includes(words));
  assert.equal(previewHtml("<html><body><div id=root></div><script>render()</script></body></html>", "https://app.io/"), null, "an app that draws itself shows nothing without scripts: no preview");
  assert.equal(previewHtml(`<html><body><p>${words}</p>${"x".repeat(1_600_000)}</body></html>`, "https://big.io/"), null, "too big");
});
