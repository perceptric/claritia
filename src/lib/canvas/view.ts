// The canvas camera and layout (docs/email-canvas-b1.md): pure math, so it can be tested. The camera is a pan (x, y)
// in screen pixels and a zoom (z): a point in the world at (wx, wy) shows on screen at (x + wx * z, y + wy * z).

export type Camera = { x: number; y: number; z: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type Box = { x: number; y: number; r: number; b: number };
export type Size = { w: number; h: number };

export const ZMIN = 0.1;
export const ZMAX = 4;
export const STEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4];
/** Space between emails in a row, in world pixels. */
export const GAP = 80;
/** Room left around the emails when fitting, in screen pixels; the top keeps room for the labels. */
export const PAD = 64;
export const LABEL_ROOM = 36;

export const clampZ = (z: number) => Math.max(ZMIN, Math.min(ZMAX, z));
export const toScreen = (c: Camera, wx: number, wy: number) => ({ x: c.x + wx * c.z, y: c.y + wy * c.z });
export const toWorld = (c: Camera, sx: number, sy: number) => ({ x: (sx - c.x) / c.z, y: (sy - c.y) / c.z });

/** Zoom to z with the screen point (sx, sy) staying over the same world point. */
export function zoomAt(c: Camera, sx: number, sy: number, z: number): Camera {
  const nz = clampZ(z);
  const w = toWorld(c, sx, sy);
  return { z: nz, x: sx - w.x * nz, y: sy - w.y * nz };
}

/** The next zoom step up (dir 1) or down (dir -1) from z, stopping at the ends. */
export function stepZoom(z: number, dir: 1 | -1): number {
  if (dir > 0) return STEPS.find((s) => s > z * 1.001) ?? ZMAX;
  return [...STEPS].reverse().find((s) => s < z * 0.999) ?? ZMIN;
}

/**
 * A wheel step turned into a zoom factor. Trackpad pinches send small steps (and ctrlKey) and a mouse wheel big ones;
 * each step is capped, so one notch is about 1.5 times and a pinch stays smooth. `lines` is a wheel that counts lines.
 */
export function wheelFactor(deltaY: number, lines = false): number {
  const d = Math.max(-50, Math.min(50, deltaY * (lines ? 16 : 1)));
  return Math.exp(-d * 0.008);
}

export function boundsOf(rects: Rect[]): Box | null {
  if (!rects.length) return null;
  return { x: Math.min(...rects.map((r) => r.x)), y: Math.min(...rects.map((r) => r.y)), r: Math.max(...rects.map((r) => r.x + r.w)), b: Math.max(...rects.map((r) => r.y + r.h)) };
}

/** The camera that shows the box in the view with room around it, never past maxZ (fitting stops at 100%). */
export function fitBox(b: Box, view: Size, maxZ = 1): Camera {
  const bw = Math.max(1, b.r - b.x);
  const bh = Math.max(1, b.b - b.y);
  const z = clampZ(Math.min(maxZ, (view.w - PAD * 2) / bw, (view.h - PAD * 2 - LABEL_ROOM) / bh));
  const x = (view.w - bw * z) / 2 - b.x * z;
  // Tall emails start at the top (below the labels), short ones sit in the middle.
  const y = Math.max(PAD + LABEL_ROOM, (view.h - bh * z) / 2) - b.y * z;
  return { x, y, z };
}

/**
 * The first view of a canvas: everything fits, unless that drops under 25% (a long row like Ungrouped); then the
 * first emails, from the left, at a size you can read.
 */
export function firstView(rects: Rect[], view: Size): Camera {
  const all = boundsOf(rects);
  if (!all) return { x: view.w / 2, y: PAD + LABEL_ROOM, z: 1 };
  const c = fitBox(all, view);
  if (c.z >= 0.25) return c;
  const few = boundsOf(rects.slice(0, 4))!;
  let f = fitBox(few, view);
  if (f.z < 0.25) f = fitBox({ ...few, r: few.x + rects[0]!.w }, view);
  return { ...f, x: PAD - rects[0]!.x * f.z };
}

/** Emails in one row, left to right, `GAP` apart, tops aligned. */
export function rowLayout(items: { id: string; w: number; h: number }[]): (Rect & { id: string })[] {
  let x = 0;
  return items.map((it) => {
    const r = { id: it.id, x, y: 0, w: it.w, h: it.h };
    x += it.w + GAP;
    return r;
  });
}

/**
 * While an email is dragged in a row: where it would land (its index among the others) for the pointer's world x,
 * and how far each other email slides to make room.
 */
export function dropSlot(rects: (Rect & { id: string })[], dragId: string, worldX: number): { slot: number; shift: Record<string, number>; lineX: number } {
  const me = rects.find((r) => r.id === dragId);
  const others = rects.filter((r) => r.id !== dragId);
  if (!me) return { slot: 0, shift: {}, lineX: 0 };
  let slot = others.findIndex((o) => worldX < o.x + o.w / 2);
  if (slot < 0) slot = others.length;
  const shift: Record<string, number> = {};
  let cx = 0;
  others.forEach((o, i) => {
    if (i === slot) cx += me.w + GAP;
    shift[o.id] = cx - o.x;
    cx += o.w + GAP;
  });
  const lineX = slot < others.length ? others[slot]!.x + shift[others[slot]!.id]! - GAP / 2 : cx - GAP / 2;
  return { slot, shift, lineX };
}

/** Rects within `margin` screens of the view (by default one screen each way): those load their email. */
export function nearView(rects: (Rect & { id: string })[], c: Camera, view: Size, margin = 1): Set<string> {
  const out = new Set<string>();
  for (const r of rects) {
    const s = toScreen(c, r.x, r.y);
    if (s.x + r.w * c.z > -view.w * margin && s.x < view.w * (1 + margin) && s.y + r.h * c.z > -view.h * margin && s.y < view.h * (1 + margin)) out.add(r.id);
  }
  return out;
}

/** True when no part of the box is on screen: the canvas then offers "Back to emails". */
export function offScreen(b: Box | null, c: Camera, view: Size): boolean {
  if (!b) return false;
  const a = toScreen(c, b.x, b.y);
  const d = toScreen(c, b.r, b.b);
  return d.x < 0 || a.x > view.w || d.y < 0 || a.y > view.h;
}

/**
 * Where the toolbar goes for picked emails: centered above them (above their labels), kept inside the view, and stuck
 * to the top when their top is out of view. `tw` is the toolbar's width.
 */
export function toolbarSpot(b: Box, c: Camera, view: Size, tw: number, labelH = LABEL_ROOM): { x: number; y: number } {
  const a = toScreen(c, b.x, b.y);
  const d = toScreen(c, b.r, b.b);
  const y = Math.max(10, a.y - labelH - 44);
  const mid = (a.x + d.x) / 2;
  const x = Math.max(10 + tw / 2, Math.min(view.w - 10 - tw / 2, mid));
  return { x, y };
}

/** The email width a resize lands on: the nearest width the builder supports. */
export const EMAIL_WIDTHS = [600, 640, 700] as const;
export function snapWidth(want: number): (typeof EMAIL_WIDTHS)[number] {
  return EMAIL_WIDTHS.reduce<(typeof EMAIL_WIDTHS)[number]>((best, v) => (Math.abs(v - want) < Math.abs(best - want) ? v : best), 600);
}

/** A glide between two cameras at time t (0 to 1): pan on a straight line, zoom on a log scale so it feels even. */
export function between(from: Camera, to: Camera, t: number): Camera {
  const k = 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
  return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, z: Math.exp(Math.log(from.z) + (Math.log(to.z) - Math.log(from.z)) * k) };
}
