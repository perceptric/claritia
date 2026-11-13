// Typing in place (src/lib/design/email/typing.ts; docs/email-canvas-b3.md section 7).
import assert from "node:assert/strict";
import { test } from "node:test";
import { newBlock, type Block } from "../src/lib/design/email/doc.ts";
import { cleanTyped, inlineMarkdown, looksLikeMarkdown, markdownBlocks, markdownPaste, plainToRich, stripMarks, typeMode, typedPatch, typeSource, typable } from "../src/lib/design/email/typing.ts";

const B = (type: Block["type"], o: Partial<Block> = {}) => ({ ...newBlock(type, "b1"), ...o }) as Block;

test("which blocks type in place, and how", () => {
  assert.equal(typeMode(B("heading")), "line");
  assert.equal(typeMode(B("button")), "line");
  assert.equal(typeMode(B("meeting")), "line");
  assert.equal(typeMode(B("text")), "rich");
  assert.equal(typeMode(B("list")), "items");
  assert.equal(typeMode(B("quote")), "lines");
  for (const t of ["image", "divider", "spacer", "footer", "html", "product"] as const) assert.equal(typeMode(B(t)), null, t);
});

test("the words shown while typing keep merge tags as written", () => {
  const h = B("heading", { text: "Hi {{first_name|there}} & <you>" } as Partial<Block>);
  assert.ok(typable(h));
  assert.equal(typeSource(h as never), "Hi {{first_name|there}} &amp; &lt;you&gt;");
  assert.equal(typeSource(B("list", { items: ["One", "Two"] } as Partial<Block>) as never), '<li style="margin:0 0 6px">One</li><li style="margin:0 0 6px">Two</li>');
  assert.equal(typeSource(B("quote", { text: "a\nb" } as Partial<Block>) as never), "a<br>b");
  assert.equal(typeSource(B("text", { html: "" } as Partial<Block>) as never), "<p><br></p>");
});

test("what was typed becomes the block's words", () => {
  assert.deepEqual(typedPatch(B("heading") as never, { html: "", text: "  New\nheading  " }), { text: "New heading" });
  assert.deepEqual(typedPatch(B("button") as never, { html: "", text: "Book a call" }), { label: "Book a call" });
  assert.deepEqual(typedPatch(B("list") as never, { html: "", text: "", items: ["One ", "", " Two"] }), { items: ["One", "Two"] });
  assert.deepEqual(typedPatch(B("list") as never, { html: "", text: "", items: [] }), { items: [""] });
  assert.deepEqual(typedPatch(B("quote") as never, { html: "", text: "Line one\nLine  two\n" }), { text: "Line one\nLine two" });
  assert.deepEqual(typedPatch(B("text") as never, { html: "<div>One</div><div><b>Two</b></div>", text: "" }), { html: "<p>One</p><p><b>Two</b></p>" });
});

test("typed HTML is cleaned to the Text block's allow list", () => {
  assert.equal(cleanTyped("<p>a <strike>b</strike> <strong>c</strong> <em>d</em></p>"), "<p>a <s>b</s> <b>c</b> <i>d</i></p>");
  assert.equal(cleanTyped('<p>x<script>alert(1)</script><span style="color:red">y</span></p>'), "<p>xy</p>");
  assert.equal(cleanTyped('<p><a href="javascript:alert(1)">bad</a> <a href="https://ok.test">ok</a></p>'), '<p>bad <a href="https://ok.test">ok</a></p>');
  assert.equal(cleanTyped("loose words<p>then</p>"), "<p>loose words</p><p>then</p>");
  assert.equal(cleanTyped("<p><br></p><p>a</p><p><br></p>"), "<p>a</p>");
  assert.equal(cleanTyped("<p>a&nbsp;b</p>"), "<p>a b</p>");
});

test("plain text pastes as paragraphs", () => {
  assert.equal(plainToRich("One\nline two\n\nTwo <b>"), "<p>One<br>line two</p><p>Two &lt;b&gt;</p>");
});

test("Markdown: what counts, inline marks, and blocks", () => {
  assert.ok(looksLikeMarkdown("# Title"));
  assert.ok(looksLikeMarkdown("- a\n- b"));
  assert.ok(looksLikeMarkdown("a **bold** word"));
  assert.ok(looksLikeMarkdown("see [the guide](https://x.test)"));
  assert.ok(!looksLikeMarkdown("Just a sentence, 2 * 3 = 6."));
  assert.equal(inlineMarkdown("a **b** *c* ~~d~~ [e](https://x.test/?a=1&b=2) [f](javascript:x)"), 'a <b>b</b> <i>c</i> <s>d</s> <a href="https://x.test/?a=1&amp;b=2">e</a> f');
  assert.deepEqual(markdownBlocks("# Big news\nIntro **here**.\n\n- one\n- **two**\n1. first\n## Next"), [
    { type: "heading", text: "Big news", level: 1 },
    { type: "text", html: "<p>Intro <b>here</b>.</p>" },
    { type: "list", items: ["one", "two"], ordered: false },
    { type: "list", items: ["first"], ordered: true },
    { type: "heading", text: "Next", level: 2 },
  ]);
  assert.equal(stripMarks("**a** [b](https://x.test) _c_"), "a b c");
  assert.deepEqual(markdownPaste("a **b** c"), { inline: "a <b>b</b> c" });
  assert.ok("blocks" in markdownPaste("# T\nbody"));
  assert.ok("blocks" in markdownPaste("one\n\ntwo **x**"), "two paragraphs become a block");
});
