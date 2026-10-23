"use client";

import { useEffect, useRef, useState } from "react";

// Pip, the face of every agent in Claritia (docs/brand.md): a clay blob that breathes, pill eyes that blink and
// glance at the mouse, and a mouth for each mood. Plain SVG, so it scales from 16px to 240px.

export type PipMood = "idle" | "thinking" | "writing" | "done" | "oops";

/** A job's state as Pip's mood. */
export const moodFor = (status: string): PipMood =>
  status === "queued" || status === "running" || status === "pending" ? "thinking" : status === "failed" || status === "error" ? "oops" : status === "passed" || status === "done" || status === "live" ? "done" : "idle";

const MOUTH: Record<PipMood, string> = {
  idle: "M20.5 31q3.5 2.4 7 0",
  thinking: "M19.5 31.5q2.2-1.8 4.5 0t4.5 0",
  writing: "M20.5 31.5h7",
  done: "M18.5 29.5q5.5 5.5 11 0",
  oops: "",
};

export function Pip({ mood = "idle", size = 32, follow = false, className = "", title }: { mood?: PipMood; size?: number; follow?: boolean; className?: string; title?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [look, setLook] = useState({ x: 0, y: 0 });

  // The eyes lean a little toward the mouse.
  useEffect(() => {
    if (!follow) return;
    let frame = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const d = Math.max(1, Math.hypot(dx, dy));
        const reach = Math.min(1, d / 300) * 1.6;
        setLook({ x: (dx / d) * reach, y: (dy / d) * reach });
      });
    };
    window.addEventListener("pointermove", move);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
    };
  }, [follow]);

  const eyeY = mood === "writing" ? 2 : 0;
  return (
    <svg ref={ref} width={size} height={size} viewBox="0 0 48 48" className={`shrink-0 overflow-visible ${className}`} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <g className="pip-body">
        <path d="M24 7c9.6 0 16.5 6.4 16.5 16.6 0 10.4-6.6 17.4-16.5 17.4S7.5 34 7.5 23.6C7.5 13.4 14.4 7 24 7z" fill="var(--color-clay)" />
        <g transform={`translate(${look.x} ${look.y + eyeY})`} fill="var(--color-paper)" stroke="var(--color-paper)" strokeLinecap="round" strokeLinejoin="round">
          {mood === "done" ? (
            <>
              <path d="M16 23l2.8-3 2.8 3" fill="none" strokeWidth="2" />
              <path d="M26.4 23l2.8-3 2.8 3" fill="none" strokeWidth="2" />
            </>
          ) : mood === "oops" ? (
            <>
              <circle cx="18.8" cy="21" r="1.8" stroke="none" />
              <circle cx="29.2" cy="21" r="2.8" stroke="none" />
            </>
          ) : (
            <>
              <rect className="pip-eye" x="17.3" y={mood === "thinking" ? 20 : 17.5} width="3" height={mood === "thinking" ? 3 : 6.5} rx="1.5" stroke="none" />
              <rect className="pip-eye" x="27.7" y="17.5" width="3" height="6.5" rx="1.5" stroke="none" style={{ animationDelay: "0.06s" }} />
            </>
          )}
          {mood === "oops" ? <circle cx="24" cy="31" r="2.2" fill="none" strokeWidth="1.8" /> : <path d={MOUTH[mood]} fill="none" strokeWidth="1.8" />}
        </g>
      </g>
      {mood === "thinking" ? (
        <g fill="var(--color-muted)">
          {[0, 1, 2].map((i) => (
            <circle key={i} className="pip-dot" cx={38 + i * 4} cy="8" r="1.4" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </g>
      ) : mood === "writing" ? (
        <path d="M37 13l5-5 2 2-5 5-2.6.6z" fill="none" stroke="var(--color-ink)" strokeWidth="1.4" strokeLinejoin="round" />
      ) : mood === "done" ? (
        <path d="M37 9l2.4 2.4L44 6.5" fill="none" stroke="var(--color-sage)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      ) : mood === "oops" ? (
        <path d="M42 5v5M42 13.2v.1" fill="none" stroke="var(--color-rose)" strokeWidth="2.2" strokeLinecap="round" />
      ) : null}
    </svg>
  );
}

/** Loading: Pip's three dots bouncing. */
export function PipDots({ className = "" }: { className?: string }) {
  return (
    <span role="status" aria-label="Loading" className={`inline-flex items-center gap-1 ${className}`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className="pip-dot size-1.5 rounded-full bg-clay" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  );
}

/** A tag on anything Pip made. */
export function ByPip() {
  return (
    <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-lilac-wash pr-2.5 pl-1 text-[11.5px] font-medium whitespace-nowrap text-lilac">
      <Pip size={16} />
      by Pip
    </span>
  );
}
