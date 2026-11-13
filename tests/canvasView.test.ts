// The canvas camera and layout (src/lib/canvas/view.ts, docs/email-canvas-b1.md).
import assert from "node:assert/strict";
import { test } from "node:test";
import { between, boundsOf, dropSlot, firstView, fitBox, nearView, offScreen, rowLayout, snapWidth, stepZoom, toolbarSpot, toScreen, toWorld, wheelFactor, zoomAt, ZMAX, ZMIN } from "../src/lib/canvas/view.ts";

const view = { w: 1200, h: 800 };
const near = (a: number, b: number, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} ≈ ${b}`);

test("zooming at a point keeps that point still, and stops at 10% and 400%", () => {
  const c = { x: 120, y: -40, z: 0.8 };
  const before = toWorld(c, 500, 300);
  const z = zoomAt(c, 500, 300, 1.7);
  const after = toWorld(z, 500, 300);
  near(before.x, after.x);
  near(before.y, after.y);
  assert.equal(zoomAt(c, 0, 0, 99).z, ZMAX);
  assert.equal(zoomAt(c, 0, 0, 0.001).z, ZMIN);
  const s = toScreen(z, after.x, after.y);
  near(s.x, 500);
  near(s.y, 300);
});

test("zoom steps go up and down and stop at the ends; a wheel notch is about 1.5x, a pinch step small", () => {
  assert.equal(stepZoom(1, 1), 1.25);
  assert.equal(stepZoom(1, -1), 0.75);
  assert.equal(stepZoom(0.8, 1), 1);
  assert.equal(stepZoom(0.8, -1), 0.75);
  assert.equal(stepZoom(4, 1), ZMAX);
  assert.equal(stepZoom(0.1, -1), ZMIN);
  near(wheelFactor(-100), Math.exp(0.4));
  near(wheelFactor(-3), Math.exp(0.024));
  near(wheelFactor(3, true), Math.exp(-0.384));
});

test("the row puts emails left to right, 80 apart; fit shows them all with room, never past 100%", () => {
  const rects = rowLayout([{ id: "a", w: 600, h: 1200 }, { id: "b", w: 640, h: 500 }, { id: "c", w: 700, h: 900 }]);
  assert.deepEqual(rects.map((r) => r.x), [0, 680, 1400]);
  const b = boundsOf(rects)!;
  assert.deepEqual(b, { x: 0, y: 0, r: 2100, b: 1200 });
  const c = fitBox(b, view);
  const tl = toScreen(c, b.x, b.y);
  const br = toScreen(c, b.r, b.b);
  assert.ok(tl.x >= 63 && br.x <= view.w - 63, "sides have room");
  assert.ok(tl.y >= 64 + 36 - 1e-6 && br.y <= view.h - 63, "the top keeps room for labels");
  assert.equal(fitBox({ x: 0, y: 0, r: 100, b: 100 }, view).z, 1, "a small email isn't blown up");
});

test("a long row opens on its first emails at a size you can read", () => {
  const rects = rowLayout(Array.from({ length: 40 }, (_, i) => ({ id: String(i), w: 600, h: 700 })));
  const c = firstView(rects, view);
  assert.ok(c.z >= 0.25, String(c.z));
  near(toScreen(c, 0, 0).x, 64);
  const short = rowLayout([{ id: "a", w: 600, h: 700 }]);
  assert.equal(firstView(short, view).z, fitBox(boundsOf(short)!, view).z);
});

test("dragging: the drop slot, the others make room, the line sits in the gap", () => {
  const rects = rowLayout([{ id: "a", w: 600, h: 1 }, { id: "b", w: 600, h: 1 }, { id: "c", w: 600, h: 1 }]);
  // Drag a past the middle of c: it lands last; b and c slide left into its place.
  const end = dropSlot(rects, "a", 1700);
  assert.equal(end.slot, 2);
  assert.deepEqual(end.shift, { b: -680, c: -680 });
  assert.equal(end.lineX, 1360 - 40);
  // Drag c before a: first; a and b slide right.
  const start = dropSlot(rects, "c", 100);
  assert.equal(start.slot, 0);
  assert.deepEqual(start.shift, { a: 680, b: 680 });
  assert.equal(start.lineX, 680 - 40);
});

test("only emails near the view load; Back to emails when every email is off screen", () => {
  const rects = rowLayout(Array.from({ length: 30 }, (_, i) => ({ id: String(i), w: 600, h: 800 })));
  const c = { x: 0, y: 0, z: 1 };
  const set = nearView(rects, c, view);
  assert.ok(set.has("0") && set.has("3") && !set.has("10"), [...set].join(","));
  assert.equal(offScreen(boundsOf(rects), c, view), false);
  assert.equal(offScreen(boundsOf(rects), { x: 0, y: 5000, z: 1 }, view), true);
});

test("the toolbar sits above the picked email, stays inside the view, and sticks to the top", () => {
  const b = { x: 100, y: 0, r: 700, b: 900 };
  const above = toolbarSpot(b, { x: 0, y: 300, z: 1 }, view, 260);
  assert.deepEqual(above, { x: 400, y: 300 - 36 - 44 });
  assert.equal(toolbarSpot(b, { x: 0, y: -400, z: 1 }, view, 260).y, 10, "sticks at the top");
  assert.equal(toolbarSpot(b, { x: -650, y: 300, z: 1 }, view, 260).x, 140, "kept inside the left edge");
});

test("resizing snaps to the widths the builder supports; a glide ends where it should", () => {
  assert.equal(snapWidth(590), 600);
  assert.equal(snapWidth(625), 640);
  assert.equal(snapWidth(690), 700);
  assert.equal(snapWidth(900), 700);
  const a = { x: 0, y: 0, z: 0.5 };
  const b = { x: 100, y: 50, z: 2 };
  assert.deepEqual(between(a, b, 1), b);
  near(between(a, b, 0).z, 0.5);
  assert.ok(between(a, b, 0.5).z > 0.5 && between(a, b, 0.5).z < 2);
});
