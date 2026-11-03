"use client";

// A short note at the bottom of the Routing screens, with one action (Undo) for a few seconds: "v8 is live · Undo".
// Call `toast()` from anywhere in Routing; <ToastHost /> in RoutingView shows it. Read out to screen readers.

import { useEffect, useState } from "react";
import { X } from "../../Icons";

export type ToastItem = { text: string; action?: { label: string; run: () => void | Promise<void> }; ms?: number };

let show: ((t: ToastItem) => void) | null = null;

export const toast = (t: ToastItem) => show?.(t);

export function ToastHost() {
  const [item, setItem] = useState<(ToastItem & { id: number }) | null>(null);
  useEffect(() => {
    let n = 0;
    show = (t) => setItem({ ...t, id: ++n });
    return () => {
      show = null;
    };
  }, []);
  useEffect(() => {
    if (!item) return;
    const t = setTimeout(() => setItem((x) => (x?.id === item.id ? null : x)), item.ms ?? (item.action ? 10_000 : 4000));
    return () => clearTimeout(t);
  }, [item]);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-[85] flex justify-center px-4">
      {item ? (
        <div key={item.id} role="status" className="anim-rise-sm pointer-events-auto flex items-center gap-3 rounded-full bg-ink py-1.5 pr-1.5 pl-4 text-[13px] text-paper shadow-float">
          <span>{item.text}</span>
          {item.action ? (
            <button
              type="button"
              onClick={() => {
                const run = item.action!.run;
                setItem(null);
                void run();
              }}
              className="press h-7 rounded-full px-3 text-[12.5px] font-semibold text-paper underline-offset-2 hover:underline"
            >
              {item.action.label}
            </button>
          ) : null}
          <button type="button" aria-label="Close" onClick={() => setItem(null)} className="press flex size-7 items-center justify-center rounded-full text-paper/70 hover:text-paper">
            <X size={12} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
