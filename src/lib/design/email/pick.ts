// Picking on the canvas (docs/email-canvas-b2.md section 2): which part of an element a click landed on, from the
// part classes the builder's preview puts on each part (`c<id>-<part>`), and the padding zones the canvas draws on the
// picked element. Pure.

import { isEmailPart, type EmailPartKey } from "./parts.ts";

/** The part of element `id` a class list names, or null. */
export function partFromClasses(classes: Iterable<string>, id: string): EmailPartKey | null {
  for (const c of classes) {
    const m = /^c([a-z0-9]+)-([a-z-]+)$/.exec(c);
    if (m && m[1] === id && isEmailPart(m[2])) return m[2];
  }
  return null;
}

export type Box = { x: number; y: number; w: number; h: number };
export type Zone = Box & { side: "top" | "right" | "bottom" | "left"; value: number };

/** The padding inside a box, as four zones with their sizes in px; sides with no padding are left out. */
export function paddingZones(b: Box, pad: { top: number; right: number; bottom: number; left: number }): Zone[] {
  const out: Zone[] = [];
  const t = Math.max(0, pad.top), r = Math.max(0, pad.right), bo = Math.max(0, pad.bottom), l = Math.max(0, pad.left);
  if (t) out.push({ side: "top", x: b.x, y: b.y, w: b.w, h: Math.min(t, b.h), value: t });
  if (bo) out.push({ side: "bottom", x: b.x, y: b.y + b.h - Math.min(bo, b.h), w: b.w, h: Math.min(bo, b.h), value: bo });
  if (l) out.push({ side: "left", x: b.x, y: b.y + t, w: Math.min(l, b.w), h: Math.max(0, b.h - t - bo), value: l });
  if (r) out.push({ side: "right", x: b.x + b.w - Math.min(r, b.w), y: b.y + t, w: Math.min(r, b.w), h: Math.max(0, b.h - t - bo), value: r });
  return out;
}
