"use client";

// A small info mark beside a section title: its words show on hover or focus, on a layer above the page, so no
// card or panel can cut it off (the KindTip pattern).

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "../../Icons";

export function HelpTip({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setAt({ x: Math.min(Math.max(r.left + r.width / 2, 130), window.innerWidth - 130), y: r.top });
  };
  return (
    <span
      ref={ref}
      tabIndex={0}
      role="button"
      aria-label={text}
      onMouseEnter={show}
      onMouseLeave={() => setAt(null)}
      onFocus={show}
      onBlur={() => setAt(null)}
      className="inline-flex size-5 shrink-0 cursor-help items-center justify-center rounded-full text-faint outline-none transition-colors duration-[120ms] hover:text-ink focus-visible:shadow-focus"
    >
      <Info size={13} />
      {at
        ? createPortal(
            <span role="tooltip" style={{ left: at.x, top: at.y - 8 }} className="anim-fade pointer-events-none fixed z-[200] w-[240px] -translate-x-1/2 -translate-y-full rounded-[10px] bg-ink px-[10px] py-[7px] text-[12px] leading-[1.45] font-normal text-paper shadow-float">
              {text}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
