"use client";

// The automation's flow on a canvas (docs/email-unify-plan.md, E4): the same surface as the Emails canvas (pan with two
// fingers, Space or the Hand; pinch or ⌘ + scroll to zoom; Shift+1 fits, Shift+0 is 100%), opening as wide as fits
// from the top. The flow is measured as it grows, so Fit always takes in every branch. Keys on the canvas: Delete
// removes the picked step, ⌘D copies it, Escape picks the trigger.

import { useLayoutEffect, useRef, useState } from "react";
import { columnView, type Box } from "@/lib/canvas/view";
import { Surface } from "../canvas/Surface";

export function FlowCanvas({ storageKey, children, onKey }: { storageKey: string; children: React.ReactNode; onKey?: (e: KeyboardEvent) => boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [all, setAll] = useState<Box | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setAll((a) => (a && a.r === el.offsetWidth && a.b === el.offsetHeight ? a : { x: 0, y: 0, r: el.offsetWidth, b: el.offsetHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <Surface
      storageKey={storageKey}
      label="Automation"
      all={all}
      picked={null}
      ready={!!all && all.r > 0}
      first={(view) => columnView(all ?? { x: 0, y: 0, r: 400, b: 400 }, view)}
      world={
        <div ref={box} data-flow="" className="w-max px-16 pt-2">
          {children}
        </div>
      }
      screen={() => null}
      onKey={onKey}
      className="h-full"
    />
  );
}
