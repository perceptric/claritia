// The code Share writes for a website (src/lib/share/embed.ts): each mode's attributes, the button only where a click
// opens it, "once" only where it opens by itself, the phone setting only over the page, and text that can't break out
// of its attribute or tag.
import assert from "node:assert/strict";
import { test } from "node:test";
import { embedSteps, formEmbedCode, meetingEmbedCode, overPage, pageHtmlCss, PLATS, safe } from "../src/lib/share/embed.ts";

const O = "https://app.tryclaritia.com";
const ID = "11111111-1111-4111-8111-111111111111";
const tag = (code: string) => code.split("\n")[1];

test("each form mode writes its element", () => {
  assert.equal(formEmbedCode(O, ID, { mode: "inline" }), `<script src="${O}/forms/v1.js" async></script>\n<claritia-form form-id="${ID}"></claritia-form>`);
  assert.equal(tag(formEmbedCode(O, ID, { mode: "full" })), `<claritia-form form-id="${ID}" full></claritia-form>`);
  assert.equal(tag(formEmbedCode(O, ID, { mode: "popup", opens: "click", size: "l" })), `<claritia-form form-id="${ID}" popup="click" size="l"></claritia-form>`);
  assert.equal(tag(formEmbedCode(O, ID, { mode: "slider", side: "left", opens: "exit", once: true })), `<claritia-form form-id="${ID}" slider="left" popup="exit" once></claritia-form>`);
  assert.equal(tag(formEmbedCode(O, ID, { mode: "popover", icon: "logo", note: "Questions?" })), `<claritia-form form-id="${ID}" popover icon="logo" note="Questions?"></claritia-form>`);
  assert.equal(tag(formEmbedCode(O, ID, { mode: "sidetab", text: "" })), `<claritia-form form-id="${ID}" side-tab="Contact us"></claritia-form>`);
});

test("a button only when a click opens it; once only when it opens by itself; the phone setting only over the page", () => {
  const click = formEmbedCode(O, ID, { mode: "popup", opens: "click", text: "Talk to us", once: true });
  assert.ok(click.endsWith(`<button data-claritia-open="${ID}">Talk to us</button>`));
  assert.ok(!click.includes(" once"), "a click always opens it");
  const timed = formEmbedCode(O, ID, { mode: "popup", opens: "30", once: true });
  assert.ok(timed.includes(`popup="delay:30"`) && timed.includes(" once") && !timed.includes("<button"));
  assert.ok(formEmbedCode(O, ID, { mode: "popover", phoneFull: false }).includes(`mobile="keep"`));
  assert.ok(!formEmbedCode(O, ID, { mode: "inline", phoneFull: false }).includes("mobile"), "in the page there's nothing to fill");
  assert.ok(!formEmbedCode(O, ID, { mode: "popup", phoneFull: true }).includes("mobile"), "full screen is the default");
  assert.deepEqual((["inline", "full", "popup", "slider", "popover", "sidetab"] as const).filter(overPage), ["popup", "slider", "popover", "sidetab"]);
});

test("in the page: a fixed width never grows past its space, a fixed height scrolls, and only in the page", () => {
  assert.equal(tag(formEmbedCode(O, ID, { mode: "inline", width: 640 })), `<claritia-form form-id="${ID}" style="width:640px;max-width:100%"></claritia-form>`);
  assert.equal(tag(formEmbedCode(O, ID, { mode: "inline", height: 600 })), `<claritia-form form-id="${ID}" style="height:600px;overflow:auto"></claritia-form>`);
  assert.equal(tag(formEmbedCode(O, ID, { mode: "inline", width: 20, height: 99999 })), `<claritia-form form-id="${ID}" style="width:280px;max-width:100%;height:4000px;overflow:auto"></claritia-form>`);
  assert.equal(tag(formEmbedCode(O, ID, { mode: "inline", width: Number.NaN, height: null })), `<claritia-form form-id="${ID}"></claritia-form>`);
  assert.equal(tag(formEmbedCode(O, ID, { mode: "popup", opens: "exit", width: 640, height: 600 })), `<claritia-form form-id="${ID}" popup="exit" size="m"></claritia-form>`);
});

test("every site builder has steps in the page and over it; Embed HTML in one block puts the styles first", () => {
  for (const p of PLATS) for (const over of [false, true]) assert.ok(embedSteps(p.v, over).length >= 3, `${p.v} ${over}`);
  assert.ok(PLATS.some((p) => p.v === "shopify"));
  assert.match(embedSteps("squarespace", false).join(" "), /Embed/);
  assert.match(embedSteps("shopify", true).join(" "), /theme\.liquid/);
  assert.equal(pageHtmlCss({ html: "<div class=\"page\">x</div>", css: ".page{}", brand: ":root{}" }), "<style>\n:root{}\n\n.page{}\n</style>\n<div class=\"page\">x</div>\n");
});

test("text can't break out of its attribute or tag", () => {
  const code = formEmbedCode(O, ID, { mode: "popup", opens: "click", text: `Hi"><script>alert(1)</script>` });
  assert.ok(!code.includes("<script>alert"));
  assert.ok(code.includes("Hi&quot;&gt;&lt;script&gt;"));
  assert.equal(safe("a".repeat(100)).length, 60);
  assert.equal(safe("line\nbreak"), "line break");
  const note = formEmbedCode(O, ID, { mode: "popover", note: `" onmouseover="x` });
  assert.ok(note.includes(`note="&quot; onmouseover=&quot;x"`));
});

test("the meeting calendar: in the page, a floating button, or the site's own link", () => {
  assert.equal(tag(meetingEmbedCode(O, "acme/demo", { mode: "inline" })), `<claritia-book type="acme/demo"></claritia-book>`);
  assert.equal(tag(meetingEmbedCode(O, "acme/demo", { mode: "button", text: "Book a demo" })), `<claritia-book type="acme/demo" mode="button" text="Book a demo"></claritia-book>`);
  assert.equal(tag(meetingEmbedCode(O, "acme/demo", { mode: "link", text: "", phoneFull: false })), `<a href="#" data-claritia-book="acme/demo" data-mobile="keep">Book a meeting</a>`);
  assert.ok(meetingEmbedCode(O, "acme/demo", { mode: "button", phoneFull: false }).includes(`mobile="keep"`));
});

test("the npm package writes the same attributes as the Share tab, for every mode", async () => {
  const { formAttributes, bookAttributes } = await import("../packages/embed/src/index.ts");
  const html = (tag: string, a: Record<string, string>) => `<${tag} ${Object.entries(a).map(([k, v]) => (v === "" ? k : `${k}="${v}"`)).join(" ")}></${tag}>`;
  const cases: [Parameters<typeof formEmbedCode>[2], Parameters<typeof formAttributes>[1]][] = [
    [{ mode: "inline" }, { mode: "inline" }],
    [{ mode: "full" }, { mode: "full" }],
    [{ mode: "popup", opens: "click", size: "l" }, { mode: "popup", opens: "click", size: "l" }],
    [{ mode: "popup", opens: "30", once: true, phoneFull: false }, { mode: "popup", opens: 30, once: true, phoneFull: false }],
    [{ mode: "slider", side: "left", opens: "exit", once: true }, { mode: "slider", side: "left", opens: "exit", once: true }],
    [{ mode: "popover", icon: "calendar", note: "Questions?" }, { mode: "popover", icon: "calendar", note: "Questions?" }],
    [{ mode: "sidetab", text: "Talk to us" }, { mode: "sidetab", text: "Talk to us" }],
  ];
  for (const [share, pkg] of cases) assert.equal(html("claritia-form", formAttributes(ID, pkg)), tag(formEmbedCode(O, ID, share)), JSON.stringify(pkg));
  assert.equal(html("claritia-book", bookAttributes("acme/demo")), tag(meetingEmbedCode(O, "acme/demo", { mode: "inline" })));
  assert.equal(html("claritia-book", bookAttributes("acme/demo", { mode: "button", text: "Book a demo", phoneFull: false })), tag(meetingEmbedCode(O, "acme/demo", { mode: "button", text: "Book a demo", phoneFull: false })));
});
