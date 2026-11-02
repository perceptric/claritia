// Branded booking pages (src/lib/meetings/brandPage.ts): the brand's stylesheet scoped to the booking root, its
// classes on the booking parts, its colors bridged with a contrast guard, Claritia's sizing kept, and only on paid
// plans (pageShell).
import assert from "node:assert/strict";
import { test } from "node:test";
import { aliasSelector, bookBrand, bookBrandCss, brandPlan, pageShell, SCOPE } from "../src/lib/meetings/brandPage.ts";
import { cleanLook } from "../src/lib/meetings/look.ts";

const BRAND = `@import url("https://fonts.googleapis.com/css2?family=Manrope:wght@400;600&display=swap");
@import url("https://evil.example.com/x.css");
/* a comment { with braces } */
:root{--brand-primary:#1a56db;--brand-text:#111827;--brand-muted:#6b7280;--brand-bg:#ffffff;--brand-line:#e5e7eb;--brand-radius:8px;--brand-font:"Manrope",sans-serif}
body{font-family:var(--brand-font);color:var(--brand-text);margin:0;padding:40px;background:#f00}
.btn{background:var(--brand-primary);color:#fff;padding:14px 32px;width:100%;border-radius:999px}
.btn:hover{opacity:.9}
.btn-secondary{background:transparent;border:1px solid var(--brand-line);color:var(--brand-text)}
.field{border:1px solid var(--brand-line);border-radius:var(--brand-radius);padding:12px}
.field:focus{border-color:var(--brand-primary)}
.label{font-weight:600;font-size:14px}
.heading{font-family:"Manrope";letter-spacing:-.03em}
.card{box-shadow:0 1px 2px #0002}
h1{font-size:80px}
button{all:unset}
@media (max-width:600px){.btn{padding:10px}}
@supports (display:grid){.nothing{color:red}}
@font-face{font-family:Brand;src:url(https://cdn.example.com/brand.woff2)}
@keyframes pop{0%{opacity:0}100%{opacity:1}}
@layer base{.btn{color:red}}
.wrap{.btn{color:blue}}`;

test("brand classes land on the booking parts, every selector inside the booking root", () => {
  assert.deepEqual(aliasSelector(".btn"), [`${SCOPE} .cb-btn:not(.cb-ghost):not(.cb-danger)`]);
  assert.deepEqual(aliasSelector(".btn-secondary:hover"), [`${SCOPE} .cb-btn.cb-ghost:hover`, `${SCOPE} .cb-time:hover`, `${SCOPE} .cb-sc:hover`]);
  assert.deepEqual(aliasSelector(".field:focus"), [`${SCOPE} .cb-in:focus`]);
  assert.deepEqual(aliasSelector(".label"), [`${SCOPE} .cb-field>span`]);
  assert.deepEqual(aliasSelector(".heading"), [`${SCOPE} .cb-h`, `${SCOPE} .cb-two`]);
  assert.deepEqual(aliasSelector(":root"), [SCOPE]);
  assert.deepEqual(aliasSelector("html body"), [SCOPE]);
  assert.deepEqual(aliasSelector("body .btn"), [`${SCOPE} .cb-btn:not(.cb-ghost):not(.cb-danger)`]);
  assert.deepEqual(aliasSelector(".btn-lg"), [], "a class that only starts like .btn is not .btn");
  assert.deepEqual(aliasSelector("h1"), [], "bare elements would reach the calendar's own buttons and titles");
  assert.deepEqual(aliasSelector("button"), []);
  assert.deepEqual(aliasSelector(".card"), []);
});

test("the stylesheet is scoped: nothing outside .cb-brand, page spacing kept, unsafe and unknown at-rules dropped", () => {
  const { css, fonts } = bookBrandCss(BRAND);
  assert.deepEqual(fonts, ["https://fonts.googleapis.com/css2?family=Manrope:wght@400;600&display=swap"]);
  assert.ok(!css.includes("evil.example.com"));
  assert.ok(!css.includes("comment"));
  assert.ok(!css.includes("@import"));
  assert.ok(!css.includes("@layer"), "unknown at-rules are left out");
  assert.ok(!css.includes("color:blue"), "nested rules are left out");
  assert.ok(!css.includes("80px") && !css.includes("all:unset"), "bare element rules are left out");
  assert.ok(!/padding:40px|background:#f00/.test(css), "the root keeps only variables and type");
  assert.ok(css.includes(`.cb-root${SCOPE}{--brand-primary:#1a56db`));
  assert.ok(css.includes(`${SCOPE} .cb-btn:not(.cb-ghost):not(.cb-danger){background:var(--brand-primary)`));
  assert.ok(css.includes(`@media (max-width:600px){${SCOPE} .cb-btn:not(.cb-ghost):not(.cb-danger){padding:10px}}`));
  assert.ok(!css.includes("@supports"), "an at-rule left empty is dropped");
  assert.ok(css.includes("@font-face{font-family:Brand;src:url(https://cdn.example.com/brand.woff2)}"));
  assert.ok(css.includes("@keyframes pop{0%{opacity:0}100%{opacity:1}}"));
  // Every rule outside the at-rules starts at the booking root.
  for (const line of css.split("\n")) {
    if (line.startsWith("@")) continue;
    const sels = line.slice(0, line.indexOf("{")).split(",");
    for (const s of sels) assert.ok(s.startsWith(SCOPE) || s.startsWith(`.cb-root${SCOPE}`), `unscoped: ${s}`);
  }
});

test("the brand's variables feed the page's own, so the month's days and focus take its colors", () => {
  const { css } = bookBrandCss(BRAND);
  assert.ok(css.includes("--clr-accent:var(--brand-primary)!important"));
  assert.ok(css.includes("--clr-btn-bg:var(--brand-primary)!important"));
  assert.ok(css.includes("--cb-dot:var(--brand-primary)!important"));
  assert.ok(css.includes("--clr-btn-text:#ffffff!important"), "white reads on a blue main color");
  assert.ok(css.includes("--clr-text:var(--brand-text)!important"));
  assert.ok(css.includes("--clr-radius:var(--brand-radius)!important"));
  assert.ok(css.includes("--clr-font:var(--brand-font)!important"));
  assert.ok(css.includes("--clr-heading-font:var(--brand-font)!important"));
  assert.ok(!css.includes("--clr-input-bg"), "only variables the brand has");
});

test("contrast guard: a main color that can't be seen on the brand's background isn't used for the days", () => {
  const pale = bookBrandCss(":root{--brand-primary:#f5f5f5;--brand-bg:#ffffff}.btn{color:#000}").css;
  assert.ok(!pale.includes("--clr-accent"));
  const dark = bookBrandCss(":root{--brand-primary:#111111;--brand-bg:#0a0a0a;--brand-text:#fafafa}.btn{color:#fff}").css;
  assert.ok(!dark.includes("--clr-accent"), "a near-black main color on a dark page");
  assert.ok(dark.includes("--clr-text:var(--brand-text)!important"));
  const yellow = bookBrandCss(":root{--brand-primary:#facc15;--brand-bg:#0a0a0a}.btn{color:#000}").css;
  assert.ok(yellow.includes("--clr-accent:var(--brand-primary)!important"));
  assert.ok(yellow.includes("--clr-btn-text:#0a0a0a!important"), "dark text on a light main color");
  const viaVar = bookBrandCss(":root{--blue:#1a56db;--brand-primary:var(--blue)}.btn{color:#fff}").css;
  assert.ok(viaVar.includes("--clr-accent:var(--brand-primary)!important"), "var() references are followed");
});

test("Claritia's sizing stays: a full-width, padded brand button can't break the time list", () => {
  const { css } = bookBrandCss(BRAND);
  const guards = css.slice(css.indexOf(`${SCOPE} .cb-time{`));
  assert.ok(guards.includes("width:auto!important") && guards.includes("min-width:0!important"));
  assert.ok(css.includes(`${SCOPE} .cb-tpair .cb-btn{flex:1 1 0!important`));
  assert.ok(css.includes(`${SCOPE} .cb-time.cb-on{background:var(--cb-fill)!important`), "the picked time keeps its fill");
  assert.ok(css.indexOf(`${SCOPE} .cb-time{`) > css.indexOf("background:var(--brand-primary)"), "guards come after the brand's rules");
});

test("nothing to draw: empty, comments only, or only unknown rules", () => {
  assert.deepEqual(bookBrandCss(""), { css: "", fonts: [] });
  assert.deepEqual(bookBrandCss(null), { css: "", fonts: [] });
  assert.equal(bookBrandCss("/* hi */").css, "");
  assert.equal(bookBrandCss("h1{color:red}.card{color:blue}").css, "");
  assert.equal(bookBrandCss("<style>.btn{color:red}</style>").css.includes("<"), false);
  assert.equal(bookBrandCss(".btn{background:url(javascript:alert(1))}").css.includes("javascript"), false);
  // Broken CSS (an unclosed block) never throws and never leaks outside the root.
  const broken = bookBrandCss(".btn{color:red;.field{border:0").css;
  assert.ok(!broken || broken.split("\n").every((l) => l.startsWith(SCOPE) || l.startsWith(`.cb-root${SCOPE}`)));
});

test("only paid plans get the brand: Free draws Claritia's look", () => {
  assert.equal(brandPlan("free"), false);
  assert.equal(brandPlan(undefined), false);
  assert.equal(brandPlan("starter"), true);
  assert.equal(brandPlan("team"), true);
  assert.equal(brandPlan("business"), true);
  assert.deepEqual(bookBrand("free", BRAND), { paid: false, css: "", fonts: [] });
  const b = bookBrand("team", BRAND);
  assert.equal(b.paid, true);
  assert.ok(b.css.includes(SCOPE));
  assert.deepEqual(bookBrand("starter", null), { paid: true, css: "", fonts: [] });
});

type T = Parameters<typeof pageShell>[0];
const target = (over: Partial<T>): T =>
  ({
    kit: { tokens: { accent: "#1a56db", background: "#ffffff" }, logo_url: "https://x.test/logo.png", design: { v: 1 } },
    look: cleanLook({ badge: false }),
    ...over,
  }) as T;

test("pageShell: Free is Claritia's look with the badge on, whatever the page saved", () => {
  for (const brand of [undefined, { paid: false, css: "", fonts: [] }]) {
    const s = pageShell(target({ brand }));
    assert.deepEqual(s.tokens, {});
    assert.equal(s.design, undefined);
    assert.equal(s.logo, null);
    assert.equal(s.badge, true, "the badge can't be hidden on Free");
    assert.equal(s.brand, undefined);
  }
});

test("pageShell: paid plans get the kit, the brand's stylesheet and a hidden badge", () => {
  const sheet = bookBrand("team", BRAND);
  const s = pageShell(target({ brand: sheet }));
  assert.equal(s.badge, false);
  assert.equal(s.logo, "https://x.test/logo.png");
  assert.equal((s.tokens as { accent?: string }).accent, "#1a56db");
  assert.equal(s.brand?.css, sheet.css);
  // Paid, but the page picked Claritia's look: no brand stylesheet.
  const plain = pageShell(target({ brand: sheet, look: cleanLook({ look: "claritia" }) }));
  assert.equal(plain.brand, undefined);
  assert.deepEqual(plain.tokens, {});
  // Paid with no stylesheet read yet: the kit's colors, no brand sheet.
  const noCss = pageShell(target({ brand: { paid: true, css: "", fonts: [] } }));
  assert.equal(noCss.brand, undefined);
  assert.equal((noCss.tokens as { accent?: string }).accent, "#1a56db");
});
