// The brand skin (docs/brand-skin.md): what a skin may hold, how its fonts are served, how the capture picks pages
// and fonts, and that a model's stylesheet is always cleaned before it's kept.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanSkin, readSkin, skinContent, skinFontCss, skinForKit, writeSkin, type SkinCaller } from "../src/lib/brand/skin.ts";
import { facesIn, formPages, mergeSources, type SkinSource } from "../src/lib/brand/skinCapture.ts";

test("a skin keeps styles and layout rules, and loses every link, import and script", () => {
  const ok = ".bt{background:rgb(88,204,2);box-shadow:rgb(88,167,0) 0 4px 0}.bt:active{transform:translateY(4px)}@media (max-width:600px){.in{font-size:16px}}";
  assert.equal(cleanSkin(ok), ok);
  assert.equal(cleanSkin(".bt{color:red;background:url(https://evil.example/x.png)}"), ".bt{color:red;}");
  assert.equal(cleanSkin("@import url(https://evil.example/a.css);.bt{color:red}"), ".bt{color:red}");
  assert.equal(cleanSkin('@font-face{font-family:x;src:url(a.woff)}.h{font-weight:700}'), ".h{font-weight:700}");
  assert.equal(cleanSkin(".bt{color:red}}"), "", "unbalanced");
  assert.equal(cleanSkin("@page{margin:0}.bt{color:red}"), "", "an at-rule that isn't allowed");
  assert.equal(cleanSkin(".bt{background:\\75 rl(x)}"), "", "escapes that could spell url");
  assert.equal(cleanSkin(".bt{width:expression(alert(1))}"), ".bt{}");
  assert.ok(!cleanSkin("</style><script>x</script>.bt{color:red}").includes("</style"), "can't close the style tag it sits in");
  assert.equal(cleanSkin("x".repeat(40_001)), "");
});

test("a skin's fonts load from Claritia's copy, never the site's own address", () => {
  const css = skinFontCss("0192f3a1-0000-7000-8000-0000000000aa", [{ family: 'duo"lingo', weight: "100 900", style: "normal", src: "https://cdn.example.com/a.woff2" }, { family: "x", weight: "bold", style: "italic", src: "https://cdn.example.com/b.ttf" }], "https://app.tryclaritia.com");
  assert.match(css, /src:url\("https:\/\/app\.tryclaritia\.com\/api\/brand\/fontfile\/0192f3a1-0000-7000-8000-0000000000aa\/0"\) format\("woff2"\)/);
  assert.match(css, /font-family:"duolingo"/);
  assert.match(css, /font-weight:100 900/);
  assert.match(css, /\/1"\) format\("truetype"\);font-weight:400;font-style:italic/);
  assert.ok(!css.includes("cdn.example.com"));
  const kit = { id: "0192f3a1-0000-7000-8000-0000000000aa", skin: { css: ".bt{color:red}", faces: [{ family: "x", weight: "400", style: "normal", src: "http://insecure.example/a.woff2" }] } };
  assert.deepEqual(readSkin(kit.skin)?.faces, [], "http fonts are dropped");
  assert.equal(skinForKit(kit, "https://app.tryclaritia.com")?.css, ".bt{color:red}");
  assert.equal(skinForKit({ id: "x", skin: null }, "https://a"), null);
});

test("the capture finds @font-face files in stylesheets and the pages that hold forms", () => {
  const faces = facesIn('@font-face{font-family:"Brand Sans";src:url(../fonts/brand.woff2) format("woff2"),url(x.woff);font-weight:700}', "https://cdn.acme.com/css/app.css");
  assert.deepEqual(faces, [{ family: "Brand Sans", weight: "700", style: "normal", src: "https://cdn.acme.com/fonts/brand.woff2" }]);
  const pages = formPages(
    [
      { href: "https://www.acme.com/handbook", text: "Handbook" },
      { href: "https://www.acme.com/log-in", text: "Log in" },
      { href: "https://www.acme.com/register", text: "Get started" },
      { href: "https://other.com/contact", text: "Contact" },
      { href: "https://acme.com/contact#form", text: "Contact us" },
    ],
    "https://www.acme.com/",
  );
  assert.deepEqual(pages, ["https://www.acme.com/register", "https://acme.com/contact", "https://www.acme.com/log-in"]);
});

const SRC: SkinSource = {
  url: "https://www.duolingo.com/",
  page: { color: "rgb(75, 75, 75)" },
  parts: [
    { role: "primary", text: "GET STARTED", self: { fontFamily: "duolingo-sans, sans-serif" }, boxFrom: "before", box: { backgroundColor: "rgb(88, 204, 2)", boxShadow: "rgb(88, 167, 0) 0px 4px 0px 0px" }, pressed: { boxShadow: "none" }, shot: "iVBORw0KGgo=" },
    { role: "input", text: "Email", self: {}, boxFrom: "parent", box: { backgroundColor: "rgb(247, 247, 247)" } },
  ],
  faces: [{ family: "duolingo-sans", weight: "100 900", style: "normal", src: "https://cdn.example.com/a.woff2" }],
};

test("pages merge by role, and Claude reads the parts' data and pictures", async () => {
  const merged = mergeSources([SRC, { ...SRC, url: "https://www.duolingo.com/log-in", parts: [{ ...SRC.parts[1]!, text: "Password" }, { role: "card", text: "Spanish", self: {}, boxFrom: "self", box: {} }] }]);
  assert.deepEqual(merged?.parts.map((p) => `${p.role}:${p.text}`), ["primary:GET STARTED", "input:Email", "card:Spanish"]);
  assert.equal(merged?.faces.length, 1);
  const content = skinContent(SRC);
  assert.equal(content.filter((c) => c.type === "image").length, 1);
  assert.ok(!JSON.stringify(content[0]).includes("iVBORw0KGgo="), "pictures go as images, not in the data");
  const call: SkinCaller = async (p) => {
    assert.match(p.system, /\.bt\.bk/);
    return { text: JSON.stringify({ css: ".bt{background:rgb(88,204,2);background-image:url(https://x/y.png)}", notes: ["3D button"] }), usage: {} as never };
  };
  const out = await writeSkin(call, SRC);
  assert.equal(out?.css, ".bt{background:rgb(88,204,2);}");
  assert.equal(await writeSkin(async () => null, SRC), null);
});
