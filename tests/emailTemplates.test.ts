// The email template library (docs/email-studio-plan.md Part 8): sample copy with no blanks to fill, a footer on
// every one, photos that exist and say what they show, dark rules, and Claritia's calm look when there's no brand.
import assert from "node:assert/strict";
import { test } from "node:test";
import { EMAIL_TEMPLATES } from "../src/lib/design/email/library.ts";
import { EMAIL_PHOTOS, emailPhotoUrl } from "../src/lib/design/email/photos.ts";
import { EMAIL_LOOK, emailTokens, washes, lightness } from "../src/lib/design/email/look.ts";
import { compileEmail } from "../src/lib/design/email/compile.ts";
import { checkEmailDesign } from "../src/lib/design/check.ts";
import { readSystem } from "../src/lib/design/model.ts";
import { DEFAULT_TOKENS } from "../src/lib/forms/brand.ts";
import type { EmailDoc } from "../src/lib/design/email/doc.ts";

const blocks = (d: EmailDoc) => d.sections.flatMap((s) => s.columns.flatMap((c) => c.blocks));
const words = (html: string) => html.replace(/<!--[\s\S]*?-->/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ");
const tokens = emailTokens({});
const system = readSystem({}, tokens);

test("100 templates, each key once", () => {
  assert.equal(EMAIL_TEMPLATES.length, 100);
  assert.equal(new Set(EMAIL_TEMPLATES.map((t) => t.key)).size, 100);
});

test("every template reads as a real email: no [blanks], a footer, and the design check finds nothing", () => {
  for (const t of EMAIL_TEMPLATES) {
    const doc = t.make();
    const html = compileEmail(system, doc, { tokens }).html;
    assert.doesNotMatch(words(html), /\[[^\]]*\]/, `${t.key} has a [blank] left`);
    assert.ok(blocks(doc).some((b) => b.type === "footer"), `${t.key} has no footer`);
    assert.deepEqual(checkEmailDesign(system, doc, tokens).map((n) => n.text), [], `${t.key}`);
    assert.deepEqual(checkEmailDesign(readSystem({}, DEFAULT_TOKENS), doc, DEFAULT_TOKENS).map((n) => n.text), [], `${t.key} with the form defaults`);
    assert.match(html, /prefers-color-scheme:dark/, `${t.key} has no dark rules`);
  }
});

test("photos: every key is a template, each shows up once in its template, over https with alt text", () => {
  const keys = new Set(EMAIL_TEMPLATES.map((t) => t.key));
  for (const k of Object.keys(EMAIL_PHOTOS)) assert.ok(keys.has(k), `photo for unknown template ${k}`);
  for (const t of EMAIL_TEMPLATES) {
    const images = blocks(t.make()).filter((b) => b.type === "image") as Extract<ReturnType<typeof blocks>[number], { type: "image" }>[];
    for (const i of images) {
      assert.match(i.src, /^https:\/\//, `${t.key} image`);
      assert.ok(i.alt.trim(), `${t.key} image has no alt`);
    }
    const p = EMAIL_PHOTOS[t.key];
    if (p) assert.equal(images.filter((i) => i.src === emailPhotoUrl(p)).length, 1, `${t.key} photo`);
  }
});

test("no brand yet: Claritia's calm look, with readable colors", () => {
  assert.equal(tokens.accent, EMAIL_LOOK.accent);
  assert.equal(tokens.buttonBg, EMAIL_LOOK.buttonBg);
  assert.equal(emailTokens({ accent: "#d73e33" }).accent, "#d73e33", "a kit with a look keeps it");
  assert.equal(emailTokens(null).accent, EMAIL_LOOK.accent);
});

test("washes: a black button turns light in dark mode, and a dark accent is lifted", () => {
  const w = washes({ accent: "#0a1a4a", text: "#171717", background: "#ffffff", buttonBg: "#111111", buttonText: "#ffffff" });
  assert.ok(lightness(w.buttonBgDark) > 0.5, "the dark-mode button is light");
  assert.ok(lightness(w.buttonTextDark) < 0.05, "with dark words");
  assert.ok(lightness(w.accentDark) > lightness("#0a1a4a"), "the accent is lifted");
  assert.ok(lightness(w.tint) > 0.8, "the tint is a soft wash");
  const red = washes({ accent: "#d73e33", buttonBg: "#d73e33", buttonText: "#ffffff" });
  assert.equal(red.buttonBgDark, "#d73e33", "a colored button stays");
});

test("the logo slot shows only in previews", () => {
  const doc = EMAIL_TEMPLATES.find((t) => t.key === "newsletter")!.make();
  assert.match(compileEmail(system, doc, { tokens, logoSlot: true }).html, /Your logo/);
  assert.doesNotMatch(compileEmail(system, doc, { tokens }).html, /Your logo/);
});

test("in dark mode the cell behind a link button takes its dark fill, so no light edge shows", () => {
  const doc = EMAIL_TEMPLATES.find((t) => t.key === "newsletter")!.make();
  const html = compileEmail(system, doc, { tokens }).html;
  const cells = [...html.matchAll(/class="(c[a-z0-9]+-button-cell)"/g)].map((m) => m[1]!);
  assert.ok(cells.length >= 3, "each link's cell has a class");
  for (const c of cells) assert.match(html, new RegExp(`\\.${c}\\{background-color:#1c1c1c !important\\}`));
});
