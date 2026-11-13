"use client";

// What the canvas draws over the email being edited (docs/email-canvas-b2.md sections 2 and 7): a 1 px outline and a
// kind tag on the element under the pointer; on the picked one a 2 px outline, its tag, its padding as a soft green
// tint with the numbers, and the element bar (Select parent, Move up, Move down, Duplicate, Delete). Boxes are in the
// email's own pixels and drawn on the screen layer, so lines keep their thickness at every zoom.

import { toScreen, type Camera } from "@/lib/canvas/view";
import type { Box, Zone } from "@/lib/design/email/pick";
import { ArrowDown, ArrowUp, Copy, CornerDownLeft, Trash } from "../../../Icons";

type Rect = { x: number; y: number; w: number; h: number };
export type OverlayActions = { parent?: () => void; up?: () => void; down?: () => void; duplicate?: () => void; remove?: () => void };

export function Overlay({ c, at, hover, picked, pad, actions }: { c: Camera; at: Rect; hover: { box: Box; tag: string } | null; picked: { id: string; box: Box; tag: string } | null; pad: Zone[]; actions: OverlayActions | null }) {
  const z = c.z;
  const place = (b: Box) => {
    const a = toScreen(c, at.x + b.x, at.y + b.y);
    return { left: a.x, top: a.y, width: b.w * z, height: b.h * z };
  };
  return (
    <>
      {hover ? (
        <>
          <div data-canvas-hover="" aria-hidden="true" className="absolute shadow-[0_0_0_1px_var(--color-signal)]" style={place(hover.box)} />
          {z >= 0.3 ? <Tag box={place(hover.box)} text={hover.tag} soft inside={hover.box.y * z < 26} /> : null}
        </>
      ) : null}
      {picked ? (
        <>
          {pad.map((p) => {
            const s = place(p);
            return (
              <div key={p.side} aria-hidden="true" className="absolute flex items-center justify-center bg-signal/12 text-[11px] font-medium text-signal-text tabular-nums" style={s}>
                {Math.min(s.width, s.height) >= 14 ? p.value : null}
              </div>
            );
          })}
          <div data-canvas-pick={picked.id} aria-hidden="true" className="absolute shadow-[0_0_0_2px_var(--color-signal)]" style={place(picked.box)} />
          {picked.tag ? <Tag box={place(picked.box)} text={picked.tag} inside={picked.box.y * z < 26} /> : null}
          {actions ? <Bar box={place(picked.box)} actions={actions} below={picked.box.y * z < 48} /> : null}
        </>
      ) : null}
    </>
  );
}

function Tag({ box, text, soft, inside }: { box: { left: number; top: number }; text: string; soft?: boolean; inside?: boolean }) {
  return (
    <span data-canvas-tag={soft ? "hover" : "pick"} className={`absolute rounded-sm px-1.5 py-px text-[11.5px] leading-[18px] font-medium whitespace-nowrap ${soft ? "bg-card text-signal-text shadow-chip" : "bg-signal text-white"}`} style={{ left: box.left + (inside ? 4 : 0), top: inside ? box.top + 4 : box.top - 22 }}>
      {text}
    </span>
  );
}

function Bar({ box, actions, below }: { box: { left: number; top: number; width: number; height: number }; actions: OverlayActions; below?: boolean }) {
  const btn = (label: string, run: (() => void) | undefined, icon: React.ReactNode, keys?: string) => (
    <button type="button" aria-label={label} title={keys ? `${label} (${keys})` : label} disabled={!run} onClick={run} className="flex size-7 items-center justify-center rounded-full text-body hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-35">
      {icon}
    </button>
  );
  return (
    <div data-canvas-ui="" role="toolbar" aria-label="Element actions" className="pointer-events-auto absolute flex -translate-x-full items-center gap-0.5 rounded-full bg-card p-0.5 shadow-float" style={{ left: box.left + box.width, top: below ? box.top + box.height + 6 : box.top - 36 }}>
      {btn("Select parent", actions.parent, <CornerDownLeft size={13} className="rotate-90" />, "Esc")}
      {btn("Move up", actions.up, <ArrowUp size={13} />, "⌥⇧↑")}
      {btn("Move down", actions.down, <ArrowDown size={13} />, "⌥⇧↓")}
      {btn("Duplicate", actions.duplicate, <Copy size={13} />, "⌘D")}
      {btn("Delete", actions.remove, <Trash size={13} />, "⌫")}
    </div>
  );
}
