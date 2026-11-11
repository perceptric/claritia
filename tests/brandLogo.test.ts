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

// ── Finding the logo on real page layouts ───────────────────────────────────────────────────────────────────────────

const ICON = '<symbol id="i1" viewBox="0 0 32 24"><path d="M0 0h32v24H0z" fill="#e03"/></symbol>';
const WORD = '<symbol id="w1" viewBox="0 0 96 16"><path d="M0 0h96v16H0z" fill="#222"/></symbol>';
const page = (header: string, rest = "") => ({ url: "https://www.acme.com/", html: `<html><head><title>Acme</title></head><body><svg style="display:none">${ICON}${WORD}</svg><a href="#main">Skip to content</a><header>${header}</header><main>${rest}</main></body></html>` });
const logoOf = async (header: string, rest = "") => {
  const { extractBrand } = await import("../src/lib/brand/deep.ts");
  return extractBrand([page(header, rest)], []).logo;
};

test("an icon and a wordmark in the home link are one logo, joined at their own sizes (momos.com)", async () => {
  const l = await logoOf('<a href="./" data-framer-name="logo"><div><svg viewBox="0 0 32 24"><use href="#i1"/></svg></div><div><svg viewBox="0 0 96 16"><use href="#w1"/></svg></div></a><nav><a href="/pricing">Pricing</a></nav>');
  assert.ok(l.svg, "a drawing is found");
  assert.match(l.svg!, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 136 24">/, "32 + gap 8 + 96 wide, 24 high");
  assert.ok(l.svg!.includes('fill="#e03"') && l.svg!.includes('fill="#222"'), "both the icon and the word");
});

test("the skip link, a customer wall and another company's picture are never the logo", async () => {
  const wall = '<div class="logo-carousel"><div data-framer-name="Sweetgreen logo"><svg viewBox="0 0 80 20"><path d="M0 0h80v20H0z" fill="#0a0"/></svg></div></div>';
  const l = await logoOf('<a href="/"><svg viewBox="0 0 60 25"><path d="M0 0h60v25H0z" fill="#635bff"/></svg></a>', wall);
  assert.ok(l.svg!.includes("#635bff"));
  const pic = await logoOf('<nav><a href="/pricing">Pricing</a></nav>', '<img src="https://cdn.acmecms.com/microsoftLogo.svg" alt="Microsoft">');
  assert.equal(pic.src, null, "a picture on the site's own image host named for someone else");
  const own = await logoOf('<nav><a href="/pricing">Pricing</a></nav>', '<img src="/img/acme-logo.png" alt="">');
  assert.equal(own.src, "https://www.acme.com/img/acme-logo.png");
});

test("a picture in the home link is the logo; a wordmark followed by a small-screen icon keeps the wordmark", async () => {
  assert.equal((await logoOf('<a href="https://www.acme.com/"><img src="/brand.svg" alt="Home"></a>')).src, "https://www.acme.com/brand.svg");
  const l = await logoOf('<a href="/home"><svg viewBox="0 0 96 16"><path d="M0 0h96v16H0z" fill="#111"/></svg><svg viewBox="0 0 20 20"><path d="M0 0h20v20H0z" fill="#111"/></svg></a>');
  assert.match(l.svg!, /viewBox="0 0 96 16"/);
});

test("colors from the page are read, white-only logos show dark, painted backgrounds and symbol frames are kept", async () => {
  const { extractBrand } = await import("../src/lib/brand/deep.ts");
  const v = extractBrand([page('<a href="/"><svg viewBox="0 0 10 10"><path d="M0 0h10v10H0z" fill="var(--logo-fill, var(--black))"/></svg></a>')], [{ url: "https://www.acme.com/a.css", text: ":root{--logo-fill:#0f62fe}" }]).logo;
  assert.ok(v.svg!.includes('fill="#0f62fe"'), v.svg!);
  const w = await logoOf('<a href="/"><svg viewBox="0 0 16 24"><path d="M0 0h16v24H0z" fill="rgb(255, 255, 255)"/></svg></a>');
  assert.ok(w.svg!.includes('fill="#111111"'), "a white logo would vanish on a light form");
  const mixed = await logoOf('<a href="/"><svg viewBox="0 0 10 10"><path d="M0 0h5v5H0z" fill="#fff"/><path d="M5 5h5v5H5z" fill="#000"/></svg></a>');
  assert.ok(mixed.svg!.includes('fill="#fff"'), "white inside a dark logo stays");
  const bg = await logoOf(`<a href="./"><div style="background-image:url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 24%22><path d=%22M0 0h16v24H0z%22 fill=%22%23333%22></path></svg>')"></div></a>`);
  assert.ok(bg.svg && bg.svg.includes('viewBox="0 0 16 24"'), "a builder's painted drawing (framer.com)");
  const sym = await logoOf('<a href="/"><svg aria-hidden="true"><use href="#i1"/></svg></a>');
  assert.match(sym.svg!, /viewBox="0 0 32 24"/, "the symbol's own frame (tryclaritia.com)");
});
