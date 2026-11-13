// Where drags land and how pictures resize (src/lib/design/email/drop.ts; docs/email-canvas-b4.md sections 5.4, 6.2, 17.1).
import assert from "node:assert/strict";
import { test } from "node:test";
import { blockSlot, columnAt, isNoop, lineFor, resizeWidth, sectionSlot, slotIndex, type Geometry } from "../src/lib/design/email/drop.ts";
import { newBlock, type Block, type EmailDoc } from "../src/lib/design/email/doc.ts";

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
/** Content 0..600. s1 (y 0-200): one column c1 with blocks a (20-60) and b (100-160). s2 (y 200-400): two columns
 * c2 (x 0-300, block d 220-300) and c3 (x 300-600, empty). s3 (y 400-500): a component use. */
const geo: Geometry = {
  content: box(0, 0, 600, 500),
  sections: [
    { id: "s1", index: 0, box: box(0, 0, 600, 200), locked: false, columns: [{ id: "c1", box: box(32, 0, 536, 200), blocks: [{ id: "a", index: 0, box: box(32, 20, 536, 40) }, { id: "b", index: 1, box: box(32, 100, 536, 60) }] }] },
    { id: "s2", index: 1, box: box(0, 200, 600, 200), locked: false, columns: [{ id: "c2", box: box(0, 200, 300, 200), blocks: [{ id: "d", index: 0, box: box(0, 220, 300, 80) }] }, { id: "c3", box: box(300, 200, 300, 200), blocks: [] }] },
    { id: "s3", index: 2, box: box(0, 400, 600, 100), locked: true, columns: [] },
  ],
};

test("slots by the middles of the drawn blocks", () => {
  assert.equal(slotIndex([40, 130], 10), 0);
  assert.equal(slotIndex([40, 130], 90), 1);
  assert.equal(slotIndex([40, 130], 150), 2);
  assert.equal(slotIndex([], 150), 0);
});

test("the column under the point, else the nearest (stacked on phones works by y)", () => {
  const cols = [{ id: "l", box: box(0, 0, 300, 100) }, { id: "r", box: box(300, 0, 300, 100) }];
  assert.equal(columnAt(cols, { x: 450, y: 50 })!.id, "r");
  const stacked = [{ id: "top", box: box(0, 0, 390, 100) }, { id: "bottom", box: box(0, 100, 390, 100) }];
  assert.equal(columnAt(stacked, { x: 100, y: 150 })!.id, "bottom");
  assert.equal(columnAt(cols, { x: 700, y: 50 })!.id, "r", "past the right edge: the nearest");
});

test("a block lands between blocks, in empty columns, and by x in columns side by side", () => {
  assert.deepEqual(blockSlot(geo, { x: 100, y: 30 }, 8), { column: "c1", index: 0 });
  assert.deepEqual(blockSlot(geo, { x: 100, y: 50 }, 8), { column: "c1", index: 1 });
  assert.deepEqual(blockSlot(geo, { x: 100, y: 150 }, 8), { column: "c1", index: 2 });
  assert.deepEqual(blockSlot(geo, { x: 450, y: 300 }, 8), { column: "c3", index: 0 });
  assert.deepEqual(blockSlot(geo, { x: 100, y: 330 }, 8), { column: "c2", index: 1 });
});

test("the new-section zone, at zoom 1 (8 px) and 0.5 (16 px)", () => {
  assert.deepEqual(blockSlot(geo, { x: 100, y: 205 }, 8), { section: 1 });
  assert.deepEqual(blockSlot(geo, { x: 100, y: 212 }, 8), { column: "c2", index: 0 });
  assert.deepEqual(blockSlot(geo, { x: 100, y: 212 }, 16), { section: 1 });
  assert.deepEqual(blockSlot(geo, { x: 100, y: 497 }, 8), { section: 3 }, "below the last section");
  assert.deepEqual(blockSlot({ content: box(0, 0, 600, 120), sections: [] }, { x: 10, y: 10 }, 8), { section: 0 }, "an empty email");
});

test("a component use takes no blocks: before or after it", () => {
  assert.deepEqual(blockSlot(geo, { x: 100, y: 430 }, 8), { section: 2 });
  assert.deepEqual(blockSlot(geo, { x: 100, y: 470 }, 8), { section: 3 });
});

test("hidden blocks keep their places: slots are document indexes", () => {
  const g: Geometry = { content: box(0, 0, 600, 200), sections: [{ id: "s", index: 0, box: box(0, 0, 600, 200), locked: false, columns: [{ id: "c", box: box(0, 0, 600, 200), blocks: [{ id: "p", index: 0, box: box(0, 0, 600, 50) }, { id: "r", index: 2, box: box(0, 60, 600, 50) }] }] }] };
  assert.deepEqual(blockSlot(g, { x: 10, y: 70 }, 8), { column: "c", index: 2 });
  assert.deepEqual(blockSlot(g, { x: 10, y: 190 }, 8), { column: "c", index: 3 });
});

test("sections land by middles", () => {
  assert.equal(sectionSlot(geo, { x: 0, y: 50 }), 0);
  assert.equal(sectionSlot(geo, { x: 0, y: 150 }), 1);
  assert.equal(sectionSlot(geo, { x: 0, y: 480 }), 3);
});

test("no-ops: before itself, right after itself, its own section places", () => {
  const B = (id: string) => newBlock("text", id) as Block;
  const doc: EmailDoc = { v: 1, settings: { width: 600, align: "center", darkMode: "auto", preheader: "", lang: "en" }, sections: [{ id: "s1", stackOnPhone: true, columns: [{ id: "c1", width: 100, blocks: [B("a"), B("b")] }] }, { id: "s2", stackOnPhone: true, columns: [{ id: "c2", width: 100, blocks: [B("d")] }] }] };
  assert.ok(isNoop(doc, "a", { column: "c1", index: 0 }));
  assert.ok(isNoop(doc, "a", { column: "c1", index: 1 }));
  assert.ok(!isNoop(doc, "a", { column: "c1", index: 2 }));
  assert.ok(isNoop(doc, "d", { section: 1 }), "a block alone in its section, as a new section beside it");
  assert.ok(!isNoop(doc, "a", { section: 0 }));
  assert.ok(isNoop(doc, "s1", { section: 0 }));
  assert.ok(isNoop(doc, "s1", { section: 1 }));
  assert.ok(!isNoop(doc, "s1", { section: 2 }));
});

test("the green line: across a column between blocks, or across the email", () => {
  assert.deepEqual(lineFor(geo, { column: "c1", index: 1 }), { x: 32, y: 80, w: 536 });
  assert.deepEqual(lineFor(geo, { column: "c1", index: 0 }), { x: 32, y: 22, w: 536 });
  assert.deepEqual(lineFor(geo, { column: "c3", index: 0 }), { x: 300, y: 300, w: 300 });
  assert.deepEqual(lineFor(geo, { section: 1 }), { x: 0, y: 200, w: 600 });
  assert.deepEqual(lineFor(geo, { section: 3 }), { x: 0, y: 500, w: 600 });
});

test("resizing a picture: corners, alignment, limits, snapping and Shift", () => {
  const o = { w0: 300, corner: "br" as const, align: "left" as const, min: 24, max: 536, zoom: 1, snap: true };
  assert.equal(resizeWidth({ ...o, dx: 40 }).w, 340);
  assert.equal(resizeWidth({ ...o, dx: 40, corner: "bl" }).w, 260, "a left corner grows against the pointer");
  assert.equal(resizeWidth({ ...o, dx: 40, align: "center" }).w, 380, "centered grows from both sides");
  assert.equal(resizeWidth({ ...o, dx: -1000 }).w, 24);
  assert.deepEqual(resizeWidth({ ...o, dx: 1000 }), { w: 536, snapped: "column" });
  assert.deepEqual(resizeWidth({ ...o, dx: 232 }), { w: 536, snapped: "column" }, "within 6 px of the column");
  assert.deepEqual(resizeWidth({ ...o, dx: 232, snap: false }), { w: 532, snapped: null }, "Shift: no snapping");
  assert.deepEqual(resizeWidth({ ...o, dx: 103, natural: 400 }), { w: 400, snapped: "own" });
  assert.deepEqual(resizeWidth({ ...o, dx: 110, natural: 400, zoom: 0.5 }), { w: 400, snapped: "own" }, "12 local px at half zoom");
  assert.equal(resizeWidth({ ...o, dx: 110, natural: 400 }).snapped, null);
});
