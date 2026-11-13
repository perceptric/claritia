// An email's structure for the canvas (src/lib/design/email/tree.ts, pick.ts; docs/email-canvas-b2.md).
import assert from "node:assert/strict";
import { test } from "node:test";
import { compileEmail } from "../src/lib/design/email/compile.ts";
import { newBlock, newSection, readEmailDoc, type Block, type EmailDoc } from "../src/lib/design/email/doc.ts";
import { findEl } from "../src/lib/design/email/ops.ts";
import { paddingZones, partFromClasses } from "../src/lib/design/email/pick.ts";
import { applyDrop, blocksInOrder, canDrop, firstChildOf, kindOf, layerTree, moveStep, nextInOrder, parentOf, siblingOf } from "../src/lib/design/email/tree.ts";
import { readSystem } from "../src/lib/design/model.ts";

const B = (type: Block["type"], id: string, o: Partial<Block> = {}) => ({ ...newBlock(type, id), ...o }) as Block;
/** s1: logo, heading, button. s2: two columns (text a | text b, text c). s3: footer, phone only. */
function doc(): EmailDoc {
  const s1 = newSection([B("image", "img", { src: "https://cdn.x/logo.png", alt: "" }), B("heading", "h1", { text: "Inbound that turns into pipeline" }), B("button", "btn", { label: "Book a call" })], "s1");
  const s2 = { ...newSection([], "s2"), columns: [{ id: "c1", width: 50, blocks: [B("text", "ta", { html: "<p>First <b>words</b> here</p>" })] }, { id: "c2", width: 50, blocks: [B("text", "tb", { html: "<p>B</p>" }), B("text", "tc", { html: "<p>C</p>" })] }] };
  const s3 = { ...newSection([B("footer", "ft")], "s3"), hideOn: "desktop" as const };
  return { ...readEmailDoc({}), sections: [s1, s2, s3] };
}

test("the layer tree: Body › Container › sections, columns only when there are several, first words, marks", () => {
  const t = layerTree(doc());
  assert.equal(t.kind, "body");
  const c = t.children[0]!;
  assert.deepEqual([c.kind, c.part], ["container", "content"]);
  const [s1, s2, s3] = c.children;
  assert.deepEqual(s1!.children.map((x) => [x.kind, x.words]), [["image", "logo.png"], ["heading", "Inbound that turns into pipeline"], ["button", "Book a call"]]);
  assert.deepEqual(s2!.children.map((x) => x.kind), ["column", "column"]);
  assert.equal(s2!.words, "2 columns");
  assert.equal(s2!.children[0]!.children[0]!.words, "First words here");
  assert.equal(s3!.only, "phone", "hidden on desktop shows as phone only");
});

test("reading order, stepping out and in, Tab siblings", () => {
  const d = doc();
  assert.deepEqual(blocksInOrder(d), ["img", "h1", "btn", "ta", "tb", "tc", "ft"]);
  assert.equal(nextInOrder(d, "btn", 1), "ta", "↓ crosses into the next section");
  assert.equal(nextInOrder(d, "ta", -1), "btn");
  assert.equal(nextInOrder(d, "s2", 1), "s3");
  assert.equal(nextInOrder(d, "c1", 1), "c2");
  assert.equal(nextInOrder(d, "ft", 1), null);
  assert.equal(parentOf(d, "h1"), "s1", "one column: a block's parent is its section");
  assert.equal(parentOf(d, "tb"), "c2", "several columns: its column");
  assert.equal(parentOf(d, "c2"), "s2");
  assert.equal(parentOf(d, "s2"), "email");
  assert.equal(parentOf(d, "email"), null);
  assert.equal(firstChildOf(d, "email"), "s1");
  assert.equal(firstChildOf(d, "s1"), "img");
  assert.equal(firstChildOf(d, "s2"), "c1");
  assert.equal(firstChildOf(d, "c2"), "tb");
  assert.equal(siblingOf(d, "btn", 1), "img", "Tab goes round within its parent");
  assert.equal(siblingOf(d, "s1", -1), "s3");
  assert.equal(kindOf(d, "c1"), "column");
  assert.equal(kindOf(d, "email"), "email");
});

test("moving a step: inside a column, then across columns and sections; sections swap", () => {
  const d = doc();
  assert.deepEqual(blocksInOrder(moveStep(d, "h1", 1)), ["img", "btn", "h1", "ta", "tb", "tc", "ft"]);
  const down = moveStep(d, "btn", 1);
  assert.deepEqual(findEl(down, "c1")!.column!.blocks.map((b) => b.id), ["btn", "ta"], "the last block goes to the next column's start");
  assert.deepEqual(findEl(down, "s1")!.section.columns[0]!.blocks.map((b) => b.id), ["img", "h1"]);
  const up = moveStep(d, "tb", -1);
  assert.deepEqual(findEl(up, "c1")!.column!.blocks.map((b) => b.id), ["ta", "tb"], "the first block of a column goes to the end of the one before");
  assert.deepEqual(moveStep(d, "s1", 1).sections.map((s) => s.id), ["s2", "s1", "s3"]);
  assert.equal(moveStep(d, "img", -1), d, "nothing above the first block");
});

test("drops: sections only among sections, blocks into columns", () => {
  const d = doc();
  assert.equal(canDrop(d, "s1", { column: "c1", index: 0 }), false);
  assert.equal(canDrop(d, "h1", { section: 0 }), false);
  assert.equal(canDrop(d, "c1", { section: 0 }), false);
  assert.deepEqual(applyDrop(d, "s3", { section: 0 }).sections.map((s) => s.id), ["s3", "s1", "s2"]);
  assert.deepEqual(findEl(applyDrop(d, "h1", { column: "c2", index: 1 }), "c2")!.column!.blocks.map((b) => b.id), ["tb", "h1", "tc"]);
  assert.deepEqual(findEl(applyDrop(d, "img", { column: "s1-not-a-column", index: 0 }), "s1")!.section.columns[0]!.blocks.map((b) => b.id), ["img", "h1", "btn"]);
});

test("picking: the part from the preview's classes; padding zones", () => {
  assert.equal(partFromClasses(["clr-w", "ch1-heading"], "h1"), "heading");
  assert.equal(partFromClasses(["cbtn-button"], "h1"), null);
  assert.equal(partFromClasses(["cx-nope"], "x"), null);
  const z = paddingZones({ x: 0, y: 0, w: 600, h: 200 }, { top: 48, right: 32, bottom: 24, left: 32 });
  assert.deepEqual(z.map((x) => [x.side, x.value, x.h]), [["top", 48, 48], ["bottom", 24, 24], ["left", 32, 128], ["right", 32, 128]]);
  assert.deepEqual(paddingZones({ x: 0, y: 0, w: 10, h: 10 }, { top: 0, right: 0, bottom: 0, left: 0 }), []);
});

test("heading levels 4 to 6 and an image's loading read and build; an image with a height takes Fit", () => {
  const raw = { ...readEmailDoc({}), sections: [newSection([B("heading", "hh", { text: "Small", level: 5 as never }), B("image", "pp", { src: "https://cdn.x/a.png", alt: "A", loading: "lazy" } as never)])] };
  const d = readEmailDoc(raw);
  assert.equal((findEl(d, "hh")!.block as { level: number }).level, 5);
  assert.equal((findEl(d, "pp")!.block as { loading?: string }).loading, "lazy");
  assert.equal((findEl(readEmailDoc({ ...raw, sections: [newSection([B("image", "qq", { src: "https://cdn.x/a.png", alt: "A", loading: "soon" } as never)])] }), "qq")!.block as { loading?: string }).loading, undefined);
  const styled = { ...d, styles: { pp: { image: { base: { height: "120px", "object-fit": "cover" } } } } };
  const html = compileEmail(readSystem({}, {}), styled as EmailDoc, { tokens: {} }).html;
  assert.match(html, /<h5[^>]*>Small<\/h5>/);
  assert.match(html, /<img [^>]*loading="lazy"/);
  assert.match(html, /height:120px[^"]*object-fit:cover|object-fit:cover[^"]*height:120px/);
});
