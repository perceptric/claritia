// Tia writes emails (docs/email-studio-plan.md Part 8): the outline Tia fills in is checked, every part draws in the
// brand with dark rules and passes the design check, photos exist and say what they show, and Claritia's calm look
// stands in when there's no brand.
import assert from "node:assert/strict";
import { test } from "node:test";
import { blankEmail, composeEmail, PART_KINDS, readComposeSpec, type ComposePart } from "../src/lib/design/email/compose.ts";
import { EMAIL_PHOTOS, emailPhotoUrl } from "../src/lib/design/email/photos.ts";
import { EMAIL_LOOK, emailTokens, washes, lightness } from "../src/lib/design/email/look.ts";
import { compileEmail } from "../src/lib/design/email/compile.ts";
import { checkEmailDesign } from "../src/lib/design/check.ts";
import { readSystem } from "../src/lib/design/model.ts";
import { DEFAULT_TOKENS } from "../src/lib/forms/brand.ts";
import type { EmailDoc } from "../src/lib/design/email/doc.ts";
import { sampleEmail } from "./fixtures/emailSample.ts";

const blocks = (d: EmailDoc) => d.sections.flatMap((s) => s.columns.flatMap((c) => c.blocks));
const tokens = emailTokens({});
const system = readSystem({}, tokens);

/** One of each part, as Tia might write them. */
const EVERY: ComposePart[] = [
  { kind: "hero", eyebrow: "This year", title: "Our year, in short", lead: "Thank you for being part of it." },
  { kind: "photo", photo: "yoga-class" },
  { kind: "text", heading: "What changed", paragraphs: ["We opened on Sundays.", "And we added two evening classes."], link: "See the timetable" },
  { kind: "list", heading: "Coming up", items: ["Beginners' week", "A new teacher", "Summer hours"] },
  { kind: "stats", items: [{ number: "1,240", label: "Classes" }, { number: "38", label: "New faces" }, { number: "4.9", label: "Rating" }] },
  { kind: "cards", heading: "Pick a class", items: [{ title: "Morning flow", text: "Every weekday, 7 AM.", link: "Book" }, { title: "Slow evening", text: "Tuesdays and Thursdays." }] },
  { kind: "quote", text: "The best hour of my week.", cite: "Ana, member since 2022" },
  { kind: "event", title: "Open studio", when: "Saturday, June 7, 10 AM", where: "12 Mill Lane", button: "Save my spot" },
  { kind: "band", title: "Your first class is free", text: "Bring a friend, too." },
  { kind: "sign", text: "See you on the mat.", name: "Sam Rivera", title: "Founder" },
];

test("every part draws in the brand, with dark rules, and the design check finds nothing", () => {
  const spec = readComposeSpec({ preheader: "Our year", parts: EVERY });
  assert.ok(!("error" in spec), JSON.stringify(spec));
  const kinds = new Set(EVERY.map((p) => p.kind));
  for (const k of PART_KINDS) if (!["button", "offer", "meeting"].includes(k)) assert.ok(kinds.has(k), `${k} is covered`);
  for (const tk of [tokens, DEFAULT_TOKENS]) {
    for (const parts of [EVERY, [{ kind: "hero", title: "Talk soon" }, { kind: "offer", title: "30 minutes, free", text: "Pick a time.", button: "Book", meeting: true }], [{ kind: "text", paragraphs: ["Hi."] }, { kind: "meeting", text: "Questions?", label: "Pick a time" }, { kind: "button", label: "Read more" }]] as ComposePart[][]) {
      const doc = composeEmail({ preheader: "", parts });
      assert.deepEqual(checkEmailDesign(readSystem({}, tk), doc, tk).map((n) => n.text), [], parts.map((p) => p.kind).join(","));
      const html = compileEmail(readSystem({}, tk), doc, { tokens: tk }).html;
      assert.match(html, /prefers-color-scheme:dark/);
    }
  }
});

test("the header and footer are always there; a blank email has only those", () => {
  assert.deepEqual(blocks(blankEmail()).map((b) => b.type), ["logo", "footer"]);
  const b = blocks(sampleEmail());
  assert.equal(b[0]!.type, "logo");
  assert.equal(b.at(-1)!.type, "footer");
});

test("the outline is checked: kinds, required words, one photo from the set, at most two main buttons, 14 parts", () => {
  const err = (x: unknown) => ("error" in (readComposeSpec(x) as object) ? (readComposeSpec(x) as { error: string }).error : "");
  assert.match(err({ parts: [] }), /at least one/);
  assert.match(err({ parts: [{ kind: "banner" }] }), /kind is one of/);
  assert.match(err({ parts: [{ kind: "hero" }] }), /needs a title/);
  assert.match(err({ parts: [{ kind: "photo", photo: "beach" }] }), /no photo "beach"/);
  assert.match(err({ parts: [{ kind: "photo", photo: "yoga-class" }, { kind: "photo", photo: "field-sunflowers" }] }), /one photo/);
  assert.match(err({ parts: [{ kind: "stats", items: [{ number: "1", label: "x" }] }] }), /2 or 3/);
  assert.match(err({ parts: [{ kind: "button", label: "a" }, { kind: "offer", title: "t", text: "x", button: "b" }, { kind: "event", title: "e", when: "w", where: "", button: "c" }] }), /one or two main buttons/);
  assert.match(err({ parts: Array.from({ length: 15 }, () => ({ kind: "text", paragraphs: ["x"] })) }), /14 parts/);
  const long = readComposeSpec({ parts: [{ kind: "hero", title: "x".repeat(500) }] });
  assert.ok(!("error" in long) && (long.parts[0] as { title: string }).title.length === 120, "long words are cut to size");
});

test("words go in as words: markup is shown, never run; merge tags stay", () => {
  const doc = composeEmail({ preheader: "", parts: [{ kind: "text", paragraphs: ["Hi {{first_name|there}}, <img src=x onerror=alert(1)> & more"] }] });
  const html = compileEmail(system, doc, { tokens }).html;
  assert.ok(!/<img src=x/.test(html) && html.includes("&lt;img"));
  assert.match(JSON.stringify(doc), /\{\{first_name\|there\}\}/);
});

test("photos: each file is on the website over https, with alt text", () => {
  for (const [id, p] of Object.entries(EMAIL_PHOTOS)) {
    assert.match(id, /^[a-z-]+$/, id);
    assert.match(emailPhotoUrl(p), /^https:\/\/tryclaritia\.com\/assets\/email-photos\/[a-z0-9-]+\.jpg$/);
    assert.ok(p.alt.trim(), `${id} has alt text`);
    const img = blocks(composeEmail({ preheader: "", parts: [{ kind: "photo", photo: id }] })).find((b) => b.type === "image") as { src: string; alt: string };
    assert.equal(img.src, emailPhotoUrl(p));
    assert.equal(img.alt, p.alt);
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
  assert.equal(washes({ accent: "#d73e33", buttonBg: "#d73e33", buttonText: "#ffffff" }).buttonBgDark, "#d73e33", "a colored button stays");
});

test("the logo slot shows only in previews", () => {
  const doc = sampleEmail();
  assert.match(compileEmail(system, doc, { tokens, logoSlot: true }).html, /Your logo/);
  assert.doesNotMatch(compileEmail(system, doc, { tokens }).html, /Your logo/);
});

test("in dark mode the cell behind a link button takes its dark fill, so no light edge shows", () => {
  const html = compileEmail(system, sampleEmail(), { tokens }).html;
  const cells = [...html.matchAll(/class="(c[a-z0-9]+-button-cell)"/g)].map((m) => m[1]!);
  assert.ok(cells.length >= 2, "each button's cell has a class");
  for (const c of cells) assert.match(html, new RegExp(`\\.${c}\\{background-color:#[0-9a-f]{6} !important\\}`));
});
