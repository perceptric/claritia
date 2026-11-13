// Copy, cut, paste and moves between emails (src/lib/design/email/clip.ts; docs/email-canvas-b4.md sections 8 and 17.1).
import assert from "node:assert/strict";
import { test } from "node:test";
import { clipFromClipboard, clipToClipboard, copyElTo, makeClip, pastePlace, putClip, transferEl, type PutRules } from "../src/lib/design/email/clip.ts";
import { newBlock, readEmailDoc, type Block, type EmailDoc } from "../src/lib/design/email/doc.ts";
import { findEl } from "../src/lib/design/email/ops.ts";
import { readSystem, type DesignSystem } from "../src/lib/design/model.ts";

const B = (type: Block["type"], id: string, o: Partial<Block> = {}) => ({ ...newBlock(type, id), ...o }) as Block;
/** s1: heading h1, text t1 (h1 is styled and has a class). s2: two columns (a1 | b1, b2). s3: footer. */
const docA = (): EmailDoc => ({
  v: 1,
  settings: { width: 600, align: "center", darkMode: "auto", preheader: "", lang: "en" },
  sections: [
    { id: "s1", stackOnPhone: true, columns: [{ id: "c1", width: 100, blocks: [B("heading", "h1", { text: "Hello" } as Partial<Block>), B("text", "t1")] }] },
    { id: "s2", stackOnPhone: true, columns: [{ id: "c2", width: 50, blocks: [B("text", "a1")] }, { id: "c3", width: 50, blocks: [B("text", "b1"), B("text", "b2")] }] },
    { id: "s3", stackOnPhone: true, columns: [{ id: "c4", width: 100, blocks: [B("footer", "f1")] }] },
  ],
  styles: { h1: { heading: { base: { "font-size": "40px" } } }, s2: { section: { base: { "padding-top": "20px" } } } },
  classes: { h1: ["cls1"] },
});
const docB = (): EmailDoc => ({ ...docA(), sections: [{ id: "x1", stackOnPhone: true, columns: [{ id: "xc", width: 100, blocks: [B("text", "x2")] }] }], styles: undefined, classes: undefined });
const base = readSystem({}, {});
const sysWith: DesignSystem = { ...base, email: { globals: {}, classes: [{ id: "cls1", name: "Big", styles: {} }], components: [{ id: "cmp1", name: "Footer block", stackOnPhone: true, columns: [{ id: "kc", width: 100, blocks: [B("text", "kt")] }] }] } };
const same: PutRules = { sameKit: true, system: sysWith };
const other: PutRules = { sameKit: false, system: base };
const ctx = { kit: "k1", ws: "w1", from: "e1" };
const blocksIn = (d: EmailDoc) => d.sections.flatMap((s) => s.columns.flatMap((c) => c.blocks));

test("copy then paste a block: new id, same content, its styles under the new id", () => {
  const clip = makeClip(docA(), "h1", ctx)!;
  const r = putClip(docB(), clip, { column: "xc", index: 0 }, same);
  assert.ok(!("error" in r));
  const b = findEl(r.doc, r.id)!.block!;
  assert.notEqual(r.id, "h1");
  assert.equal((b as { text: string }).text, "Hello");
  assert.deepEqual(r.doc.styles?.[r.id], { heading: { base: { "font-size": "40px" } } });
});

test("a section with two columns: every id new, styles of the section carried", () => {
  const clip = makeClip(docA(), "c3", ctx)!;
  assert.equal(clip.kind, "section", "a column copies its section");
  const r = putClip(docB(), clip, { section: 1 }, same);
  assert.ok(!("error" in r));
  const s = r.doc.sections[1]!;
  assert.equal(s.columns.length, 2);
  const ids = [s.id, ...s.columns.flatMap((c) => [c.id, ...c.blocks.map((b) => b.id)])];
  for (const old of ["s2", "c2", "c3", "a1", "b1", "b2"]) assert.ok(!ids.includes(old), old);
  assert.deepEqual(r.doc.styles?.[s.id], { section: { base: { "padding-top": "20px" } } });
});

test("pasting twice gives two copies with different ids", () => {
  const clip = makeClip(docA(), "h1", ctx)!;
  const r1 = putClip(docB(), clip, { column: "xc", index: 0 }, same);
  assert.ok(!("error" in r1));
  const r2 = putClip(r1.doc, clip, { column: "xc", index: 0 }, same);
  assert.ok(!("error" in r2));
  assert.notEqual(r1.id, r2.id);
  assert.equal(blocksIn(r2.doc).length, 3);
});

test("classes: kept with the same kit, left off with another, and missing ones dropped", () => {
  const clip = makeClip(docA(), "h1", ctx)!;
  const a = putClip(docB(), clip, { column: "xc", index: 0 }, same);
  assert.ok(!("error" in a));
  assert.deepEqual(a.doc.classes?.[a.id], ["cls1"]);
  const b = putClip(docB(), clip, { column: "xc", index: 0 }, other);
  assert.ok(!("error" in b));
  assert.equal(b.doc.classes?.[b.id], undefined);
  const c = putClip(docB(), clip, { column: "xc", index: 0 }, { sameKit: true, system: base });
  assert.ok(!("error" in c));
  assert.equal(c.doc.classes?.[c.id], undefined, "the kit has no such class");
});

test("a component use stays when the kit has it, and arrives as plain blocks when not", () => {
  const d = docA();
  d.sections.push({ id: "u1", stackOnPhone: true, component: { id: "cmp1" }, columns: [{ id: "uc", width: 100, blocks: [B("text", "ut")] }] });
  const clip = makeClip(d, "u1", ctx)!;
  const kept = putClip(docB(), clip, { section: 0 }, same);
  assert.ok(!("error" in kept));
  assert.equal(kept.doc.sections[0]!.component?.id, "cmp1");
  const detached = putClip(docB(), clip, { section: 0 }, other);
  assert.ok(!("error" in detached));
  assert.equal(detached.doc.sections[0]!.component, undefined);
  assert.equal(detached.doc.sections[0]!.columns[0]!.blocks.length, 1);
});

test("a crafted clip is cleaned or refused", () => {
  const evil = { claritia: "email-clip", v: 1, kind: "block", el: { id: "e1", type: "text", html: '<p>hi<script>alert(1)</script><a href="javascript:alert(2)">x</a></p>' }, styles: {}, classes: {}, kit: null, ws: "", from: "" };
  const c = clipFromClipboard({ json: JSON.stringify(evil) })!;
  const r = putClip(docB(), c, { column: "xc", index: 0 }, other);
  assert.ok(!("error" in r));
  const html = (findEl(r.doc, r.id)!.block as { html: string }).html;
  assert.ok(!html.includes("script") && !html.includes("javascript"), html);
  const unknown = clipFromClipboard({ json: JSON.stringify({ ...evil, el: { id: "e2", type: "rocket" } }) })!;
  assert.deepEqual(putClip(docB(), unknown, { column: "xc", index: 0 }, other), { error: "empty" });
  const huge = { ...evil, kind: "section", el: { id: "s9", columns: [{ id: "c9", width: 100, blocks: Array.from({ length: 10_000 }, (_, i) => ({ id: `z${i}`, type: "spacer", height: 8 })) }] } };
  const hc = clipFromClipboard({ json: JSON.stringify(huge) })!;
  const hr = putClip(docB(), hc, { section: 0 }, other);
  assert.deepEqual(hr, { error: "full" }, "200 blocks plus the email's own is past the limit");
  assert.equal(clipFromClipboard({ json: "x".repeat(1_000_001) }), null, "over 1 MB");
  assert.equal(clipFromClipboard({ json: JSON.stringify({ ...evil, v: 2 }) }), null, "a newer version");
  assert.equal(clipFromClipboard({ json: "{not json" }), null);
});

test("the HTML marker round-trips; a bad marker is ignored", () => {
  const clip = makeClip(docA(), "h1", ctx)!;
  const out = clipToClipboard(clip);
  assert.equal(out.text, "Hello");
  const back = clipFromClipboard({ html: out.html })!;
  assert.equal(back.el.id, "h1");
  assert.equal(clipFromClipboard({ html: '<div data-claritia-clip="!!!">x</div>' }), null);
  assert.equal(clipFromClipboard({ html: '<div data-claritia-clip="bm90IGpzb24=">x</div>' }), null);
});

test("a full email refuses", () => {
  const d = docB();
  d.sections[0]!.columns[0]!.blocks = Array.from({ length: 200 }, (_, i) => B("spacer", `p${i}`));
  const full = readEmailDoc(d);
  assert.deepEqual(putClip(full, makeClip(docA(), "h1", ctx)!, { column: "xc", index: 0 }, same), { error: "full" });
});

test("where a paste or a new block lands", () => {
  const d = docA();
  assert.deepEqual(pastePlace(d, "h1", "block"), { column: "c1", index: 1 });
  assert.deepEqual(pastePlace(d, "h1", "section"), { section: 1 });
  assert.deepEqual(pastePlace(d, "c3", "block"), { column: "c3", index: 2 });
  assert.deepEqual(pastePlace(d, "c3", "section"), { section: 2 });
  assert.deepEqual(pastePlace(d, "s2", "block"), { column: "c2", index: 1 });
  assert.deepEqual(pastePlace(d, "s2", "section"), { section: 2 });
  assert.deepEqual(pastePlace(d, null, "block"), { section: 2 }, "before the footer");
  assert.deepEqual(pastePlace(d, "email", "section"), { section: 2 });
  d.sections.splice(1, 0, { id: "u1", stackOnPhone: true, component: { id: "cmp1" }, columns: [{ id: "uc", width: 100, blocks: [B("text", "ut")] }] });
  assert.deepEqual(pastePlace(d, "u1", "block"), { section: 2 }, "after a component use");
  const noFooter = docB();
  assert.deepEqual(pastePlace(noFooter, null, "block"), { section: 1 }, "at the end without a footer");
});

test("moving to another email: it leaves the first and joins the second, nothing left behind", () => {
  const r = transferEl(docA(), docB(), "h1", { column: "xc", index: 1 }, same);
  assert.ok(!("error" in r));
  assert.equal(findEl(r.from, "h1"), null);
  assert.equal(r.from.styles?.h1, undefined);
  assert.deepEqual(blocksIn(r.to).map((b) => b.id), ["x2", r.id]);
  assert.deepEqual(r.to.styles?.[r.id], { heading: { base: { "font-size": "40px" } } });
});

test("copying within one email leaves the original", () => {
  const d = docA();
  const r = copyElTo(d, d, "h1", { column: "c3", index: 0 }, same);
  assert.ok(!("error" in r));
  assert.ok(findEl(r.to, "h1"));
  assert.equal(findEl(r.to, r.id)!.column!.id, "c3");
});
