"use client";

// Dragging on the canvas (docs/email-canvas-b4.md section 5): a press on an email (or the grip, or a + panel tile)
// becomes a drag after 4 px. While dragging, once per frame, the email under the pointer is found, its boxes are read
// from its frame, and drop.ts says where the thing lands; the page draws the green line and the chip. Near the
// canvas's edges the view pans. Escape, a blur or a release where nothing can land cancels. A drop is one change in
// the canvas editor: a move inside an email, a move into another email (the gainer saves first), or with Alt (or from
// a sent email) a copy.

import { useCallback, useEffect, useRef, useState } from "react";
import { toWorld } from "@/lib/canvas/view";
import { copyElTo, transferEl } from "@/lib/design/email/clip";
import { EMAIL_LIMITS, type EmailDoc } from "@/lib/design/email/doc";
import { blockSlot, isNoop, lineFor, sectionSlot, type Drop, type Geometry, type GeoSection } from "@/lib/design/email/drop";
import { findEl, moveBlock, moveSection, moveToNewSection, type Place } from "@/lib/design/email/ops";
import type { SurfaceApi } from "../../canvas/Surface";
import type { CanvasEditor } from "./useCanvasEditor";

export type DragSource =
  | { kind: "el"; email: string; id: string }
  /** A new block, columns or component from the + panel; `make` puts it into a document at a place. */
  | { kind: "new"; label: string; section: boolean; adds: number; make: (doc: EmailDoc, at: Place, email: string) => { doc: EmailDoc; id: string } | null };
export type DragView = { chip: { x: number; y: number; label: string; note: "Copy" | "Sent" | "Full" | null; above: boolean }; line: { x: number; y: number; w: number } | null };
type Target = { email: string; drop: Drop | null; line: { x: number; y: number; w: number } | null; note: "Sent" | "Full" | null };
type Rect = { id: string; x: number; y: number; w: number; h: number };
type Env = {
  surface: React.RefObject<SurfaceApi | null>;
  frames: React.RefObject<Map<string, HTMLIFrameElement>>;
  rects: Rect[];
  editor: CanvasEditor;
  /** The chip's words for an element ("Heading", "Section", "Footer block (component)"). */
  labelOf: (email: string, id: string) => string;
  /** After a drop: pick it there. */
  onDone: (email: string, id: string, said: string) => void;
  onRefuse: (text: string) => void;
};

const ZONE_PX = 48;
const box = (el: Element | null) => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width || r.height ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
};
const blockCount = (d: EmailDoc) => d.sections.reduce((n, s) => n + s.columns.reduce((m, c) => m + c.blocks.length, 0), 0);

/** An email as drawn in its frame (local px): what's on this screen, each with its place in the document. */
export function readGeometry(frame: HTMLIFrameElement, doc: EmailDoc): Geometry | null {
  const d = frame.contentDocument;
  if (!d) return null;
  const q = (id: string) => d.querySelector(`[data-eid="${CSS.escape(id)}"]`);
  const content = box(q("email")) ?? { x: 0, y: 0, w: frame.clientWidth, h: frame.clientHeight };
  const sections: GeoSection[] = [];
  doc.sections.forEach((s, si) => {
    const sb = box(q(s.id));
    if (!sb) return;
    const locked = !!s.component && !s.component.edit;
    sections.push({
      id: s.id,
      index: si,
      box: sb,
      locked,
      columns: locked
        ? []
        : s.columns.flatMap((c) => {
            const cb = box(q(c.id));
            if (!cb) return [];
            return [{ id: c.id, box: cb, blocks: c.blocks.flatMap((b, bi) => (box(q(b.id)) ? [{ id: b.id, index: bi, box: box(q(b.id))! }] : [])) }];
          }),
    });
  });
  return { content, sections };
}

export function useCanvasDrag(env: Env) {
  const envRef = useRef(env);
  useEffect(() => {
    envRef.current = env;
  });
  const [view, setView] = useState<DragView | null>(null);
  const cur = useRef<{
    source: DragSource;
    x0: number;
    y0: number;
    x: number;
    y: number;
    alt: boolean;
    on: boolean;
    target: Target | null;
    geo: Map<string, Geometry | null>;
    raf: number;
    dim: HTMLStyleElement | null;
    off: AbortController;
    onClick?: () => void;
  } | null>(null);

  const isSection = (src: DragSource) => (src.kind === "new" ? src.section : (() => {
    const doc = envRef.current.editor.latest(src.email);
    const f = doc ? findEl(doc, src.id) : null;
    return !!f && !f.block;
  })());

  /** What's under the pointer: the email, where the thing would land there, and the line (local px). */
  const targetAt = (clientX: number, clientY: number): Target | null => {
    const c = cur.current;
    const e = envRef.current;
    const sf = e.surface.current;
    if (!c || !sf) return null;
    const cam = sf.camera();
    const p = sf.point(clientX, clientY);
    const w = toWorld(cam, p.x, p.y);
    const r = e.rects.find((x) => w.x >= x.x && w.x <= x.x + x.w && w.y >= x.y && w.y <= x.y + x.h);
    if (!r) return null;
    if (e.editor.readOnly(r.id)) return { email: r.id, drop: null, line: null, note: "Sent" };
    const frame = e.frames.current?.get(r.id);
    const doc = e.editor.latest(r.id);
    if (!frame || !doc) return null;
    if (!c.geo.has(r.id)) c.geo.set(r.id, readGeometry(frame, doc));
    const geo = c.geo.get(r.id);
    if (!geo) return null;
    const local = { x: (w.x - r.x), y: (w.y - r.y) };
    const section = isSection(c.source);
    const drop: Drop = section ? { section: sectionSlot(geo, local) } : blockSlot(geo, local, 8 / cam.z);
    // Room: moving inside one email adds nothing; anything else adds its blocks (and maybe a section).
    const src = c.source;
    const same = src.kind === "el" && src.email === r.id && !c.alt && !e.editor.readOnly(src.email);
    if (!same) {
      const adds = src.kind === "new" ? src.adds : (() => {
        const d = e.editor.latest(src.email);
        const f = d ? findEl(d, src.id) : null;
        return f?.block ? 1 : f ? f.section.columns.reduce((n, col) => n + col.blocks.length, 0) : 0;
      })();
      if (blockCount(doc) + adds > EMAIL_LIMITS.blocks || (("section" in drop) && doc.sections.length >= EMAIL_LIMITS.sections)) return { email: r.id, drop: null, line: null, note: "Full" };
    }
    return { email: r.id, drop, line: lineFor(geo, drop), note: null };
  };

  const render = () => {
    const c = cur.current;
    const e = envRef.current;
    const sf = e.surface.current;
    if (!c || !sf) return;
    const cam = sf.camera();
    const p = sf.point(c.x, c.y);
    const t = c.target;
    const r = t ? e.rects.find((x) => x.id === t.email) : null;
    const line = t?.line && r ? { x: cam.x + (r.x + t.line.x) * cam.z, y: cam.y + (r.y + t.line.y) * cam.z, w: t.line.w * cam.z } : null;
    const copy = c.alt || (c.source.kind === "el" && e.editor.readOnly(c.source.email));
    const label = c.source.kind === "new" ? c.source.label : e.labelOf(c.source.email, c.source.id);
    setView({ chip: { x: p.x + 12, y: p.y + 12, label, note: t?.note ?? (copy && c.source.kind === "el" ? "Copy" : null), above: !!line && line.y > p.y && line.y - p.y < 40 }, line });
  };

  const end = () => {
    const c = cur.current;
    if (!c) return;
    cancelAnimationFrame(c.raf);
    c.off.abort();
    c.dim?.remove();
    document.body.style.removeProperty("cursor");
    cur.current = null;
    setView(null);
  };

  const finish = () => {
    const c = cur.current;
    const e = envRef.current;
    if (!c) return;
    const t = c.target;
    const src = c.source;
    end();
    if (!t || !t.drop || t.note) return;
    const ed = e.editor;
    const toDoc = ed.latest(t.email);
    if (!toDoc) return;
    if (src.kind === "new") {
      const r = src.make(toDoc, t.drop, t.email);
      if (!r) return e.onRefuse("This email is full.");
      ed.change({ emails: { [t.email]: { doc: r.doc } } }, { label: `Add ${src.label}` });
      return e.onDone(t.email, r.id, `${src.label} added`);
    }
    const fromDoc = ed.latest(src.email);
    if (!fromDoc || !findEl(fromDoc, src.id)) return;
    const kind = e.labelOf(src.email, src.id);
    const copy = c.alt || ed.readOnly(src.email);
    const fromKit = ed.kitNow(fromDoc);
    const toKit = ed.kitNow(toDoc);
    const rules = { sameKit: fromKit.kitId === toKit.kitId, system: toKit.system, tokens: toKit.tokens };
    const toName = ed.nameOf(t.email);
    if (src.email === t.email && !copy) {
      if (isNoop(fromDoc, src.id, t.drop)) return;
      const f = findEl(fromDoc, src.id)!;
      const next = f.block ? ("column" in t.drop ? moveBlock(fromDoc, src.id, t.drop) : moveToNewSection(fromDoc, src.id, t.drop.section)) : "section" in t.drop ? moveSection(fromDoc, src.id, t.drop.section) : fromDoc;
      if (next === fromDoc) return;
      ed.change({ emails: { [src.email]: { doc: next } } }, { label: `Move ${kind}` });
      return e.onDone(src.email, src.id, `${kind} moved`);
    }
    if (copy) {
      const r = copyElTo(fromDoc, toDoc, src.id, t.drop, rules);
      if ("error" in r) return e.onRefuse(r.error === "full" ? "This email is full." : "That couldn't be copied.");
      ed.change({ emails: { [t.email]: { doc: r.to } } }, { label: src.email === t.email ? `Copy ${kind}` : `Copy ${kind} to ${toName}` });
      return e.onDone(t.email, r.id, src.email === t.email ? `${kind} copied` : `${kind} copied to ${toName}`);
    }
    const r = transferEl(fromDoc, toDoc, src.id, t.drop, rules);
    if ("error" in r) return e.onRefuse(r.error === "full" ? "This email is full." : "That couldn't be moved.");
    ed.change({ emails: { [src.email]: { doc: r.from }, [t.email]: { doc: r.to } } }, { label: `Move ${kind} to ${toName}` });
    e.onDone(t.email, r.id, `${kind} moved to ${toName}`);
  };

  // Each frame while dragging: auto-pan near the edges, then what's under the pointer.
  const tick = () => {
    const c = cur.current;
    const sf = envRef.current.surface.current;
    if (!c || !c.on || !sf) return;
    const p = sf.point(c.x, c.y);
    const v = sf.size();
    const speed = (d: number) => (d < ZONE_PX ? 4 + 16 * (1 - Math.max(0, d) / ZONE_PX) : 0);
    const dx = speed(p.x) - speed(v.w - p.x);
    const dy = speed(p.y) - speed(v.h - p.y);
    if (dx || dy) sf.nudge(dx, dy);
    c.target = targetAt(c.x, c.y);
    render();
    c.raf = requestAnimationFrame(tick);
  };

  const startDrag = () => {
    const c = cur.current;
    if (!c) return;
    c.on = true;
    document.body.style.cursor = "grabbing";
    // The source stays in place at 40% (a sent email stays as it is).
    if (c.source.kind === "el" && !envRef.current.editor.readOnly(c.source.email)) {
      const d = envRef.current.frames.current?.get(c.source.email)?.contentDocument;
      if (d?.head) {
        const st = d.createElement("style");
        st.textContent = `[data-eid="${CSS.escape(c.source.id)}"]{opacity:.4!important}`;
        d.head.append(st);
        c.dim = st;
      }
    }
    c.raf = requestAnimationFrame(tick);
  };

  /** A press that may become a drag; without a 4 px move it's a click (`onClick` runs on release). */
  const press = useCallback((source: DragSource | null, e: { clientX: number; clientY: number; altKey?: boolean }, onClick?: () => void) => {
    if (cur.current) end();
    const off = new AbortController();
    const o = { signal: off.signal };
    if (!source) {
      if (onClick) window.addEventListener("pointerup", () => (off.abort(), onClick()), { ...o, once: true });
      return;
    }
    cur.current = { source, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, alt: !!e.altKey, on: false, target: null, geo: new Map(), raf: 0, dim: null, off, onClick };
    window.addEventListener(
      "pointermove",
      (ev) => {
        const c = cur.current;
        if (!c) return;
        c.x = ev.clientX;
        c.y = ev.clientY;
        c.alt = ev.altKey;
        if (!c.on && Math.hypot(ev.clientX - c.x0, ev.clientY - c.y0) >= 4) startDrag();
      },
      o,
    );
    window.addEventListener(
      "pointerup",
      () => {
        const c = cur.current;
        if (!c) return;
        if (c.on) finish();
        else {
          const click = c.onClick;
          end();
          click?.();
        }
      },
      o,
    );
    window.addEventListener("pointercancel", () => end(), o);
    window.addEventListener("blur", () => end(), o);
    window.addEventListener(
      "keydown",
      (ev) => {
        const c = cur.current;
        if (!c) return;
        if (ev.key === "Escape" && c.on) {
          ev.preventDefault();
          ev.stopPropagation();
          end();
        } else if (ev.key === "Alt") c.alt = true;
      },
      { ...o, capture: true },
    );
    window.addEventListener("keyup", (ev) => cur.current && ev.key === "Alt" && (cur.current.alt = false), o);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => end(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return { press, view, dragging: !!view, isSection };
}
