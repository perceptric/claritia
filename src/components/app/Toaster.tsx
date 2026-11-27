"use client";

// One short note at the bottom of every screen that says what just happened ("Saved", "Link copied"), with one
// action (Undo) for a few seconds when there is one, or a calm error when a background action failed. Call `toast()`
// from anywhere; <ToastHost /> in ClientApp shows it. Read out to screen readers.

import { useEffect, useState } from "react";
import { splitRef } from "@/lib/errors";
import { X } from "../Icons";

export type ToastItem = { text: string; tone?: "error"; action?: { label: string; run: () => void | Promise<void> }; ms?: number };

let show: ((t: ToastItem) => void) | null = null;

/** Say what just happened. An error stays longer and keeps its ref. */
export const toast = (t: ToastItem | string) => show?.(typeof t === "string" ? { text: t } : t);

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
    const t = setTimeout(() => setItem((x) => (x?.id === item.id ? null : x)), item.ms ?? (item.action ? 10_000 : item.tone === "error" ? 8000 : 2400));
    return () => clearTimeout(t);
  }, [item]);
  const words = item ? splitRef(item.text) : null;
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-[95] flex justify-center px-4">
      {item && words ? (
        <div key={item.id} role={item.tone === "error" ? "alert" : "status"} className="anim-rise-sm pointer-events-auto flex max-w-[min(560px,100%)] min-w-0 items-center gap-2.5 rounded-full bg-ink py-1.5 pr-1.5 pl-4 text-[13px] text-paper shadow-float">
          {item.tone === "error" ? (
            <span aria-hidden="true" className="grid size-[18px] shrink-0 place-items-center rounded-full bg-warning-soft text-warning">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                <path d="M12 7v6M12 17h.01" />
              </svg>
            </span>
          ) : null}
          <span className="min-w-0 py-1 wrap-break-word">
            {words.words}
            {words.ref ? <span className="ml-2 text-[12px] text-paper/60 tabular-nums">{`Ref ${words.ref}`}</span> : null}
          </span>
          {item.action ? (
            <button
              type="button"
              onClick={() => {
                const run = item.action!.run;
                setItem(null);
                void run();
              }}
              className="press h-7 shrink-0 rounded-full px-3 text-[12.5px] font-semibold text-paper underline-offset-2 hover:underline"
            >
              {item.action.label}
            </button>
          ) : null}
          <button type="button" aria-label="Close" onClick={() => setItem(null)} className="press flex size-7 shrink-0 items-center justify-center rounded-full text-paper/70 hover:text-paper">
            <X size={12} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
