// Line drawings for first screens and empty states (docs/brand.md, "Drawings"), in the website's style: a thin black
// line, a plain gray fill under it, and emerald for the part that moves. Lines draw themselves in on first view when
// `draw` is on. `tone` is kept for older callers; the colors no longer change with it.

export type SketchTone = "clay" | "sage" | "sky" | "lilac" | "butter" | "rose";

type Def = { wash: string; ink: string; accent?: string; accentTone?: SketchTone; dots?: [number, number][] };

// Points along a curve, for dotted trails.
const along = (from: [number, number], via: [number, number], to: [number, number], n: number): [number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const u = 1 - t;
    return [u * u * from[0] + 2 * u * t * via[0] + t * t * to[0], u * u * from[1] + 2 * u * t * via[1] + t * t * to[1]];
  });

// A gear of eight teeth around (80, 62), drawn as one path.
const gear = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const w = 0.17;
    const p = (r: number, ang: number) => `${(80 + r * Math.cos(ang)).toFixed(1)} ${(62 + r * Math.sin(ang)).toFixed(1)}`;
    pts.push(`${i ? "L" : "M"}${p(34, a - 0.39 + w)}`, `L${p(44, a - w)}`, `L${p(44, a + w)}`, `L${p(34, a + 0.39 - w)}`);
  }
  return `${pts.join("")}Z`;
})();

const DEFS = {
  // A form on a clipboard, with a pencil.
  clipboard: {
    wash: "M44 22h66q3 0 3 3v80q0 3-3 3H44q-3 0-3-3V25q0-3 3-3z M118 96l22-40 6 3.4-22 40-7 4z",
    ink: "M44 21.5q33 1 66 .5q3.2 0 3 3.2l.6 80q0 3-3 3.1q-33-.6-66 .2q-3 0-3.1-3l-.4-80.6q0-3 2.9-3.4z M64 15.5h26q2 .2 2 2.2v8.3H62v-8.5q.2-2 2-2z M52 40.5h22 M52 46h50v9H52z M52 61h18 M52 66.5h50v9H52z M57 85h18a5 5 0 0 1 0 10H57a5 5 0 0 1 0-10z",
    accent: "M118 96l22-40 6 3.4-22 40-7 4z M136 63l6 3.4 M118 96l-1.2 5.5",
    accentTone: "clay",
  },
  // Paper planes (visitors) caught by a funnel, out as an envelope (a lead).
  funnel: {
    wash: "M52 30q28 3 56 0l-20 34v26l-16 8V64z M74 102h22v14H74z",
    ink: "M52 30.5q28 2.4 56-.4l-20.3 34v26l-15.7 8.2V64.2z M60 42q20 2 40 0",
    accent: "M26 12l16 5-16 5 3.4-5z M29.4 17h12.6 M68 4l13 4-13 4 2.8-4z M110 10l16 5-16 5 3.4-5z M74 102h22v14H74z M74 102l11 8 11-8",
    accentTone: "sky",
  },
  // A card file with a magnifying glass.
  cards: {
    wash: "M30 60h80v42H30z M104 70a14 14 0 1 0 28 0a14 14 0 1 0-28 0z",
    ink: "M38 60V34q0-2 2-2h52q2 0 2 2v26 M48 32V22q0-2 2-2h52q2 0 2 2v38 M56 27h30 M46 40h30 M30 60.4q40-1 80 0l-.4 41.8q-40 .8-79.4-.4z M60 76h20v8H60z",
    accent: "M104 70a14 14 0 1 0 28 0a14 14 0 1 0-28 0z M128.5 80.5l14 14",
    accentTone: "sky",
  },
  // A road of milestones ending at a flag.
  road: {
    wash: "M31 98a3 3 0 1 0 6 0a3 3 0 1 0-6 0z M59 76a3 3 0 1 0 6 0a3 3 0 1 0-6 0z M91 52a3 3 0 1 0 6 0a3 3 0 1 0-6 0z M136 7q8 3 16 0v12q-8 3-16 0z",
    ink: "M14 104q30-6 46-26t44-30q18-10 32-12 M31 98a3 3 0 1 0 6 0a3 3 0 1 0-6 0z M59 76a3 3 0 1 0 6 0a3 3 0 1 0-6 0z M91 52a3 3 0 1 0 6 0a3 3 0 1 0-6 0z",
    accent: "M136 36V5 M136 7q8 3 16 0v12q-8 3-16 0",
    accentTone: "clay",
  },
  // A paper plane trailing a dotted path.
  plane: {
    wash: "M96 34l48-16-20 44-10-16z",
    ink: "M96 34.4l48-16.4-20.2 44-9.8-16.2z M114 46l30-28 M114 46l-2.2 14.4 8.4-7.6",
    dots: along([18, 100], [52, 108], [92, 44], 11),
    accentTone: "sky",
  },
  // A stack of envelopes with a wax seal.
  envelopes: {
    wash: "M28 50h84v52H28z M61 80a9 9 0 1 0 18 0a9 9 0 1 0-18 0z",
    ink: "M44 30h76v46 M36 40h80v10 M28 50.4q42-.8 84 0v51.4q-42 .6-84 0z M28 50.4l42 29.6 42-29.6",
    accent: "M61 80a9 9 0 1 0 18 0a9 9 0 1 0-18 0z M66 80q4-4 8 0",
    accentTone: "rose",
  },
  // A browser window with a ruler and a paint swatch.
  browser: {
    wash: "M22 20h100v74H22z M84 60h18v28H84z",
    ink: "M22 20.4q50-.8 100 0v73.4q-50 .6-100 0z M22 32h100 M29 26h.1 M35 26h.1 M41 26h.1 M32 44h40 M32 52h60 M32 64h40v20H32z",
    accent: "M108 70l40 22-6 10-40-22z M114 79l2-3.5 M120 82.5l2-3.5 M126 86l2-3.5 M132 89.5l2-3.5 M84 60h18v28H84z M84 78h18",
    accentTone: "butter",
  },
  // A megaphone with sound arcs.
  megaphone: {
    wash: "M40 58l50-24v56L40 66z",
    ink: "M40 57.6l50-23.8v56.4L40 66.4z M28 56h12v12H28z M54 72l5 20h8l-3.4-17",
    accent: "M100 48q8 14 0 28 M110 40q14 22 0 44 M120 32q20 30 0 60",
    accentTone: "clay",
  },
  // A gear made of puzzle pieces.
  gear: {
    wash: gear,
    ink: `${gear} M80 52V28 M80 40q6 0 6-5t-6-5 M90 62h24 M102 62q0 6 5 6t5-6 M80 72v24 M70 62H46`,
    accent: "M70 62a10 10 0 1 0 20 0a10 10 0 1 0-20 0z",
    accentTone: "lilac",
  },
  // A calendar page with a pin going in.
  calendar: {
    wash: "M30 24h80v76H30z M56 60h28v20H56z",
    ink: "M30 24.4q40-.8 80 0v75.4q-40 .6-80 0z M30 40h80 M48 18v12 M92 18v12 M30 60h80 M30 80h80 M56 40v60 M84 40v60",
    accent: "M64 66a6 6 0 1 0 12 0a6 6 0 1 0-12 0z M70 72v8 M132 30q-6 30-46 34 M92 58l-6 6 8 3",
    accentTone: "clay",
  },
  // A signpost with three arrows, and a paper plane landing on the top one.
  signpost: {
    wash: "M80 24h46l8 7-8 7H80z",
    ink: "M80.4 20q-.6 44 .2 88 M58 108.4q22-1.2 44 .2 M80 24.4q23-.8 46 0l8 6.8-8 7.2q-23 .6-46-.2 M80 46.2q-22 .8-44-.2l-8 7.4 8 6.8q22-.6 44 .2 M80 68.4q20-.8 40 0l8 6.8-8 7.2q-20 .6-40-.2 M90 31.2h22 M44 53.2h26 M90 75.4h18",
    accent: "M106 9l18 12-19-2.6 3.4-3.6z M108.4 15.4l15.6 5.6",
    dots: along([28, 26], [58, -4], [100, 10], 9),
    accentTone: "sky",
  },
} satisfies Record<string, Def>;

export type SketchName = keyof typeof DEFS;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function Sketch({ name, tone = "clay", draw = true, size = 200, className = "" }: { name: SketchName; tone?: SketchTone; draw?: boolean; size?: number; className?: string }) {
  const d: Def = DEFS[name];
  const deep = "var(--color-signal)";
  // Lines stay about 1.2px at any size.
  const w = (1.2 * 160) / size;
  return (
    <svg width={size} height={(size * 120) / 160} viewBox="0 0 160 120" fill="none" aria-hidden="true" className={`${draw ? "sketch-draw" : ""} shrink-0 overflow-visible ${className}`}>
      <path d={d.wash} fill="var(--color-paper-deep)" stroke="none" style={{ animation: draw ? "fade 700ms 500ms both" : undefined }} />
      <path d={d.ink} pathLength={1} stroke="var(--color-ink)" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
      {d.accent ? <path d={d.accent} pathLength={1} stroke={deep} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" style={{ animationDelay: "300ms" }} /> : null}
      {d.dots?.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.6" fill={deep} stroke="none" style={{ animation: draw ? `fade 320ms ${200 + i * 70}ms both` : undefined }} />)}
    </svg>
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
