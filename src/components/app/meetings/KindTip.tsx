"use client";

// What Individual and Dynamic mean, on hover or focus of a meeting's kind (docs/on-submission.md). Drawn on a layer
// above the page, so no card or panel can cut it off.

import { useRef, useState } from "react";
import { createPortal } from "react-dom";

export const KIND_TIPS = {
  individual: "Individual: one person hosts it. Every lead books with them.",
  dynamic: "Dynamic: its rules pick the rep from the lead's answers, or a team takes turns.",
} as const;

export function KindTip({ kind, children }: { kind: keyof typeof KIND_TIPS; children: React.ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setAt({ x: Math.min(Math.max(r.left + r.width / 2, 130), window.innerWidth - 130), y: r.top });
  };
  return (
    <span ref={ref} tabIndex={0} aria-label={KIND_TIPS[kind]} onMouseEnter={show} onMouseLeave={() => setAt(null)} onFocus={show} onBlur={() => setAt(null)} className="relative z-10 inline-flex rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ink">
      {children}
      {at
        ? createPortal(
            <span role="tooltip" style={{ left: at.x, top: at.y - 8 }} className="anim-fade pointer-events-none fixed z-[200] w-[240px] -translate-x-1/2 -translate-y-full rounded-[10px] bg-ink px-[10px] py-[7px] text-[12px] leading-[1.45] text-paper shadow-float">
              {KIND_TIPS[kind]}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
