"use client";

// Resizing a picture by its corners (docs/email-canvas-b4.md section 6): the picture keeps its shape, grows from the
// side its alignment says (both sides when centered), stays between its limits and the column's width, and snaps to
// the column's width or its own size (Shift turns snapping off). While dragging, the picture in the frame changes size
// directly; on release one change saves its width (cleared at the column's full width for an Image), and this
// picture's own Width style is cleared, or written when a class or "Every image" sets one, so the new width shows.
// Escape puts it back.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Block, EmailDoc } from "@/lib/design/email/doc";
import { resizeWidth } from "@/lib/design/email/drop";
import { setEmailProp } from "@/lib/design/email/edit";
import { findEl, updateBlock } from "@/lib/design/email/ops";
import { resolveEmail } from "@/lib/design/email/style";
import type { SurfaceApi } from "../../canvas/Surface";
import type { CanvasEditor } from "./useCanvasEditor";

export type Corner = "tl" | "tr" | "bl" | "br";
export type ResizeTag = { w: number; snapped: "column" | "own" | null };

export function useImageResize({ surface, frames, editor, onTick }: { surface: React.RefObject<SurfaceApi | null>; frames: React.RefObject<Map<string, HTMLIFrameElement>>; editor: CanvasEditor; onTick: () => void }) {
  const env = useRef({ surface, frames, editor, onTick });
  useEffect(() => {
    env.current = { surface, frames, editor, onTick };
  });
  const [tag, setTag] = useState<ResizeTag | null>(null);
  const cur = useRef<{ email: string; id: string; img: HTMLImageElement; w0: number; style: { width: string; maxWidth: string }; off: AbortController; w: number } | null>(null);

  const stop = (keep: boolean) => {
    const c = cur.current;
    if (!c) return;
    c.off.abort();
    cur.current = null;
    setTag(null);
    const { editor: ed } = env.current;
    if (!keep || c.w === c.w0) {
      c.img.style.width = c.style.width;
      c.img.style.maxWidth = c.style.maxWidth;
      env.current.onTick();
      return;
    }
    const doc = ed.latest(c.email);
    const f = doc ? findEl(doc, c.id) : null;
    const b = f?.block;
    if (!doc || !b || (b.type !== "image" && b.type !== "logo")) return;
    const max = maxOf(c.img, b);
    const full = b.type === "image" && c.w >= Math.round(max);
    let next: EmailDoc = updateBlock(doc, c.id, (full ? { width: undefined } : { width: c.w }) as Partial<Block>);
    // This picture's own Width style would hide the new width: cleared; a class's or the brand's is beaten by its own.
    const k = ed.kitNow(next);
    let e = { system: k.system, doc: next };
    for (const prop of ["width", "max-width"] as const) e = setEmailProp(e, k.tokens, { kind: "element" }, c.id, "image", "base", undefined, prop, "") ?? e;
    const shown = resolveEmail(e.system, e.doc, { id: c.id, part: "image" }, "base")["width"];
    if (shown && shown.source.level !== "default") e = setEmailProp(e, k.tokens, { kind: "element" }, c.id, "image", "base", undefined, "width", `${c.w}px`) ?? e;
    next = e.doc;
    ed.change({ emails: { [c.email]: { doc: next } } }, { label: `Resize ${b.type === "logo" ? "Logo" : "Image"}` });
  };

  /** The column's inner width for a picture (a logo also stops at 400). */
  const maxOf = (img: HTMLImageElement, b: Block) => {
    const cell = img.closest("[data-eid]") as HTMLElement | null;
    const win = img.ownerDocument.defaultView;
    let inner = cell?.clientWidth ?? img.offsetWidth;
    if (cell && win) {
      const cs = win.getComputedStyle(cell);
      inner -= (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    }
    return b.type === "logo" ? Math.min(400, inner) : inner;
  };

  /** A press on a corner handle of the picked picture. */
  const start = useCallback((email: string, id: string, corner: Corner, e: React.PointerEvent) => {
    const { frames: fr, editor: ed, surface: sf } = env.current;
    const d = fr.current?.get(email)?.contentDocument;
    const img = d?.querySelector<HTMLImageElement>(`.c${CSS.escape(id)}-image`);
    const doc = ed.latest(email);
    const b = doc ? findEl(doc, id)?.block : undefined;
    if (!img || !b || (b.type !== "image" && b.type !== "logo") || ed.readOnly(email)) return;
    const off = new AbortController();
    const w0 = Math.round(img.getBoundingClientRect().width);
    cur.current = { email, id, img, w0, style: { width: img.style.width, maxWidth: img.style.maxWidth }, off, w: w0 };
    const x0 = e.clientX;
    const min = b.type === "logo" ? 40 : 24;
    const max = maxOf(img, b);
    const align = b.align;
    const move = (ev: PointerEvent) => {
      const c = cur.current;
      if (!c) return;
      const z = sf.current?.camera().z ?? 1;
      const r = resizeWidth({ w0, dx: (ev.clientX - x0) / z, corner, align, min, max, natural: img.naturalWidth || undefined, zoom: z, snap: !ev.shiftKey });
      c.w = r.w;
      img.style.width = `${r.w}px`;
      img.style.maxWidth = `${r.w}px`;
      setTag(r);
      env.current.onTick();
    };
    window.addEventListener("pointermove", move, { signal: off.signal });
    window.addEventListener("pointerup", () => stop(true), { signal: off.signal });
    window.addEventListener("pointercancel", () => stop(false), { signal: off.signal });
    window.addEventListener(
      "keydown",
      (ev) => {
        if (ev.key !== "Escape") return;
        ev.preventDefault();
        ev.stopPropagation();
        stop(false);
      },
      { signal: off.signal, capture: true },
    );
    setTag({ w: w0, snapped: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => cur.current?.off.abort(), []);
  return { start, tag, resizing: !!tag };
}
