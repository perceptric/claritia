"use client";

// What shows while something is dragged on the canvas (docs/email-canvas-b4.md sections 5.5 and 13): the green line
// where it lands (2 px with a dot at each end, the same thickness at every zoom) and a chip that follows the pointer
// with its kind, plus "Copy", "Sent" or "Full". Screen layer; it never takes the pointer.

import type { DragView } from "./useCanvasDrag";

export function DragLayer({ view }: { view: DragView }) {
  const { chip, line } = view;
  return (
    <>
      {line ? (
        <div aria-hidden="true" data-drop-line="" className="absolute h-0.5 rounded-full bg-signal" style={{ left: line.x, top: line.y - 1, width: line.w }}>
          <span className="absolute -top-0.5 -left-[3px] size-1.5 rounded-full bg-signal" />
          <span className="absolute -top-0.5 -right-[3px] size-1.5 rounded-full bg-signal" />
        </div>
      ) : null}
      <div aria-hidden="true" data-drag-chip="" className="absolute z-[7] flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-[12.5px] font-medium whitespace-nowrap text-ink shadow-float" style={{ left: chip.x, top: chip.above ? chip.y - 52 : chip.y }}>
        {chip.label}
        {chip.note ? <span className={chip.note === "Copy" ? "text-signal-text" : "text-muted"}>{chip.note}</span> : null}
      </div>
    </>
  );
}
