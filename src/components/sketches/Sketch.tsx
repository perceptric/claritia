// Pictures for first screens and empty states (docs/brand.md, "Drawings"): one 3D object per tool, glazed white with
// one part in Claritia green, rendered to PNG by scripts/empty-art (a light and a dark set in public/empty). The
// picture floats gently and stands still under reduced motion. `tone` and `draw` are kept for older callers.

export type SketchTone = "clay" | "sage" | "sky" | "lilac" | "butter" | "rose";

/** Every picture there is, by the name callers already use. */
export const SKETCHES = ["clipboard", "funnel", "cards", "road", "plane", "signpost", "envelopes", "browser", "megaphone", "gear", "calendar", "sync", "domain", "key"] as const;

export type SketchName = (typeof SKETCHES)[number];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function Sketch({ name, tone = "clay", draw = true, size = 200, className = "" }: { name: SketchName; tone?: SketchTone; draw?: boolean; size?: number; className?: string }) {
  const pic = SKETCHES.includes(name) ? name : "clipboard";
  // The pictures are square; they keep the old drawings' 4:3 box so the screens around them don't move.
  const side = Math.round((size * 120) / 160);
  return (
    <span aria-hidden="true" className={`sk-3d inline-flex shrink-0 items-center justify-center ${className}`} style={{ width: size, height: side }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/empty/${pic}.png`} alt="" width={side} height={side} draggable={false} decoding="async" className="sk-float block select-none dark:hidden" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/empty/${pic}-dark.png`} alt="" width={side} height={side} draggable={false} decoding="async" className="sk-float hidden select-none dark:block" />
    </span>
  );
}

/** Scribbles for notes: an arrow, a circle, an underline or a star, in a status tone. */
export function Scribble({ kind, tone = "clay", className = "" }: { kind: "arrow" | "circle" | "underline" | "star"; tone?: SketchTone; className?: string }) {
  const path = {
    arrow: "M4 30q20-26 52-16 M46 6l10 8-12 6",
    circle: "M30 4q26 0 26 14t-28 14Q2 32 4 17 6 4 34 6",
    underline: "M2 10q30-6 56-2t30 0",
    star: "M30 4l7 16 17 1-13 11 4 17-15-9-15 9 4-17-13-11 17-1z",
  }[kind];
  const box = kind === "underline" ? "0 0 90 16" : "0 0 60 40";
  return (
    <svg viewBox={box} fill="none" aria-hidden="true" className={`sketch-draw overflow-visible ${className}`}>
      <path d={path} pathLength={1} stroke={`var(--color-${tone})`} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
