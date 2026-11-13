"use client";

// What the canvas draws over the email being edited (docs/email-canvas-b2.md sections 2 and 7): a 1 px outline and a
// kind tag on the element under the pointer; on the picked one a 2 px outline, its tag, its padding as a soft green
// tint with the numbers, and the element bar (Select parent, Move up, Move down, Duplicate, Delete). Boxes are in the
// email's own pixels and drawn on the screen layer, so lines keep their thickness at every zoom.

import { toScreen, type Camera } from "@/lib/canvas/view";
import type { Box, Zone } from "@/lib/design/email/pick";
import { ArrowDown, ArrowUp, Copy, CornerDownLeft, Grip, Sparkle, Trash } from "../../../Icons";

type Rect = { x: number; y: number; w: number; h: number };
export type OverlayActions = { chat?: () => void; parent?: () => void; up?: () => void; down?: () => void; duplicate?: () => void; remove?: () => void };

export function Overlay({
  c,
  at,
  hover,
  picked,
  pad,
  actions,
  onGrip,
  image,
}: {
  c: Camera;
  at: Rect;
  hover: { box: Box; tag: string } | null;
  picked: { id: string; box: Box; tag: string } | null;
  pad: Zone[];
  actions: OverlayActions | null;
  /** A press on the grip left of the picked element starts dragging it (B4). */
  onGrip?: (e: React.PointerEvent) => void;
  /** A picked picture: its own box, the width while resizing, and a press on a corner (B4). */
  image?: { box: Box; tag: { w: number; snapped: "column" | "own" | null } | null; onCorner: (corner: "tl" | "tr" | "bl" | "br", e: React.PointerEvent) => void };
}) {
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
          {image
            ? (() => {
                const b = place(image.box);
                const corners = [
                  ["tl", b.left, b.top, "nwse-resize", "top left"],
                  ["tr", b.left + b.width, b.top, "nesw-resize", "top right"],
                  ["bl", b.left, b.top + b.height, "nesw-resize", "bottom left"],
                  ["br", b.left + b.width, b.top + b.height, "nwse-resize", "bottom right"],
                ] as const;
                return (
                  <>
                    {corners.map(([k, x, y, cursor, words]) => (
                      <span
                        key={k}
                        data-canvas-ui=""
                        data-handle={k}
                        role="separator"
                        aria-label={`Resize from the ${words} corner`}
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          e.stopPropagation();
                          e.preventDefault();
                          image.onCorner(k, e);
                        }}
                        className="pointer-events-auto absolute size-2.5 rounded-[2px] bg-card shadow-[0_0_0_1.5px_var(--color-signal)] before:absolute before:-inset-2 before:content-['']"
                        style={{ left: x - 5, top: y - 5, cursor }}
                      />
                    ))}
                    {image.tag ? (
                      <span data-width-tag="" className="absolute rounded-sm bg-signal px-1.5 py-px text-[11.5px] leading-[18px] font-medium whitespace-nowrap text-white tabular-nums" style={{ left: b.left + b.width / 2, top: b.top - 24, transform: "translateX(-50%)" }}>
                        {image.tag.w} px{image.tag.snapped === "column" ? " · Column width" : image.tag.snapped === "own" ? " · Own size" : ""}
                      </span>
                    ) : null}
                  </>
                );
              })()
            : null}
          {onGrip ? (
            <button
              type="button"
              data-canvas-ui=""
              aria-label={`Drag ${picked.tag}`}
              title="Drag to move"
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                e.preventDefault();
                onGrip(e);
              }}
              className="pointer-events-auto absolute flex h-7 w-4 cursor-grab items-center justify-center rounded-full bg-card text-muted shadow-chip hover:text-ink"
              style={{ left: place(picked.box).left - 22, top: place(picked.box).top }}
            >
              <Grip size={11} />
            </button>
          ) : null}
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
      {actions.chat ? btn("Add to chat", actions.chat, <Sparkle size={13} className="text-lilac" />, "⌘L") : null}
      {btn("Select parent", actions.parent, <CornerDownLeft size={13} className="rotate-90" />, "Esc")}
      {btn("Move up", actions.up, <ArrowUp size={13} />, "⌥⇧↑")}
      {btn("Move down", actions.down, <ArrowDown size={13} />, "⌥⇧↓")}
      {btn("Duplicate", actions.duplicate, <Copy size={13} />, "⌘D")}
      {btn("Delete", actions.remove, <Trash size={13} />, "⌫")}
    </div>
  );
}
