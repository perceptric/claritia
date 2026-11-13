// Where a dragged block or section lands on the canvas, and how a picture resizes by its corners
// (docs/email-canvas-b4.md sections 5.4 and 6.2). The page reads the target email's boxes from its frame (local px,
// only what's drawn on this screen, each with its place in the document) and these functions do the rest, so they're
// plain numbers and tested without a browser.

import type { Align, EmailDoc } from "./doc.ts";
import { findEl } from "./ops.ts";

export type Box = { x: number; y: number; w: number; h: number };
export type Drop = { section: number } | { column: string; index: number };
export type GeoBlock = { id: string; index: number; box: Box };
export type GeoColumn = { id: string; box: Box; blocks: GeoBlock[] };
export type GeoSection = { id: string; index: number; box: Box; locked: boolean; columns: GeoColumn[] };
/** An email as drawn: its content box and its sections, columns and blocks, in order, with their document places. */
export type Geometry = { content: Box; sections: GeoSection[] };
export type Point = { x: number; y: number };

const mid = (b: Box) => b.y + b.h / 2;
const inside = (b: Box, p: Point) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
const distance = (b: Box, p: Point) => Math.hypot(Math.max(b.x - p.x, 0, p.x - (b.x + b.w)), Math.max(b.y - p.y, 0, p.y - (b.y + b.h)));

/** The slot among drawn items by the pointer's y: before the first item whose middle is below it. */
export function slotIndex(mids: number[], y: number): number {
  const i = mids.findIndex((m) => y < m);
  return i < 0 ? mids.length : i;
}

/** The column for a point: the one holding it, else the nearest (so stacked columns on phones work by y). */
export function columnAt<T extends { box: Box }>(cols: T[], p: Point): T | undefined {
  return cols.find((c) => inside(c.box, p)) ?? [...cols].sort((a, b) => distance(a.box, p) - distance(b.box, p))[0];
}

/** A drawn-items slot as a document index: before the k-th drawn item, or after the last one. */
const docIndex = (items: { index: number }[], k: number) => (k < items.length ? items[k]!.index : items.length ? items[items.length - 1]!.index + 1 : 0);

/** The section a point is over, or the nearest by y. */
function sectionAt(geo: Geometry, p: Point): GeoSection | undefined {
  return geo.sections.find((s) => p.y >= s.box.y && p.y <= s.box.y + s.box.h) ?? [...geo.sections].sort((a, b) => distance(a.box, p) - distance(b.box, p))[0];
}

/**
 * Where a block lands: within `zone` of a line between sections, as a new section there; over a component use,
 * before or after it; otherwise into the column under the point (or the nearest), between its blocks by their
 * middles. An email with nothing drawn takes it as its first section.
 */
export function blockSlot(geo: Geometry, p: Point, zone: number): Drop {
  const ss = geo.sections;
  if (!ss.length) return { section: 0 };
  for (const s of ss) if (Math.abs(p.y - s.box.y) <= zone) return { section: s.index };
  const last = ss[ss.length - 1]!;
  if (Math.abs(p.y - (last.box.y + last.box.h)) <= zone) return { section: last.index + 1 };
  const s = sectionAt(geo, p)!;
  if (s.locked || !s.columns.length) return { section: p.y < mid(s.box) ? s.index : s.index + 1 };
  const col = columnAt(s.columns, p)!;
  return { column: col.id, index: docIndex(col.blocks, slotIndex(col.blocks.map((b) => mid(b.box)), p.y)) };
}

/** Where a section lands: before the section under the point when above its middle, otherwise after. */
export function sectionSlot(geo: Geometry, p: Point): number {
  return docIndex(geo.sections, slotIndex(geo.sections.map((s) => mid(s.box)), p.y));
}

/** Where the green line goes for a slot (local px): across the column between blocks, or across the email. */
export function lineFor(geo: Geometry, drop: Drop): { x: number; y: number; w: number } {
  if ("section" in drop) {
    const ss = geo.sections;
    const next = ss.find((s) => s.index >= drop.section);
    const prev = [...ss].reverse().find((s) => s.index < drop.section);
    const y = next && prev ? (prev.box.y + prev.box.h + next.box.y) / 2 : next ? next.box.y : prev ? prev.box.y + prev.box.h : geo.content.y + 8;
    return { x: geo.content.x, y, w: geo.content.w };
  }
  const col = geo.sections.flatMap((s) => s.columns).find((c) => c.id === drop.column);
  if (!col) return { x: geo.content.x, y: geo.content.y, w: geo.content.w };
  const next = col.blocks.find((b) => b.index >= drop.index);
  const prev = [...col.blocks].reverse().find((b) => b.index < drop.index);
  const y = next && prev ? (prev.box.y + prev.box.h + next.box.y) / 2 : next ? next.box.y + 2 : prev ? prev.box.y + prev.box.h - 2 : mid(col.box);
  return { x: col.box.x, y, w: col.box.w };
}

/** True when a drop would leave the element where it is (the line still shows; nothing changes). */
export function isNoop(doc: EmailDoc, id: string, drop: Drop): boolean {
  const f = findEl(doc, id);
  if (!f) return true;
  if (f.block) {
    if ("column" in drop) return drop.column === f.column!.id && (drop.index === f.bi || drop.index === f.bi! + 1);
    const alone = f.section.columns.length === 1 && f.column!.blocks.length === 1;
    return alone && (drop.section === f.si || drop.section === f.si + 1);
  }
  if (f.column) return true;
  return "section" in drop && (drop.section === f.si || drop.section === f.si + 1);
}

/**
 * A picture's width while a corner is dragged (local px): right corners grow with the pointer, left corners against
 * it; centered pictures grow from both sides (twice the move). Clamped to its limits, whole px, and snapped to the
 * column's width or the picture's own width within 6 screen px unless snapping is off (Shift).
 */
export function resizeWidth(o: { w0: number; dx: number; corner: "tl" | "tr" | "bl" | "br"; align: Align; min: number; max: number; natural?: number; zoom: number; snap: boolean }): { w: number; snapped: "column" | "own" | null } {
  const d = o.corner === "tr" || o.corner === "br" ? o.dx : -o.dx;
  const raw = o.w0 + (o.align === "center" ? 2 * d : d);
  let w = Math.round(Math.min(o.max, Math.max(o.min, raw)));
  let snapped: "column" | "own" | null = null;
  if (o.snap) {
    const near = 6 / Math.max(0.01, o.zoom);
    if (Math.abs(raw - o.max) <= near) (w = Math.round(o.max)), (snapped = "column");
    else if (o.natural && o.natural < o.max && o.natural >= o.min && Math.abs(raw - o.natural) <= near) (w = Math.round(o.natural)), (snapped = "own");
  }
  if (w === Math.round(o.max) && !snapped && o.snap) snapped = "column";
  return { w, snapped };
}
