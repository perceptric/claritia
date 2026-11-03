// Drawings for first screens and empty states (docs/brand.md, "Drawings"), in tryclaritia.com's style: a dotted grid
// on a soft tile, the product drawn in thin black lines, mono labels, and one emerald part that moves. Each scene
// loops gently (src/app/globals.css, "Empty-state scenes") and stands still under reduced motion. Works in light and
// dark: every color is a token. `tone` and `draw` are kept for older callers.

import { useId } from "react";

export type SketchTone = "clay" | "sage" | "sky" | "lilac" | "butter" | "rose";

const INK = "var(--color-ink)";
const LINE = "var(--color-line-strong)";
const SOFT = "var(--color-line)";
const CARD = "var(--color-card)";
const SIGNAL = "var(--color-signal)";
const FAINT = "var(--color-faint)";
const MONO = { fontFamily: "var(--font-mono, ui-monospace, monospace)", fontSize: 5, letterSpacing: 0.6, fill: FAINT } as const;

/** A thin line bar, the drawings' stand-in for text. */
const Bar = ({ x, y, w, c = INK, h = 2.4, cls }: { x: number; y: number; w: number; c?: string; h?: number; cls?: string }) => <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={c} className={cls} />;

function Form() {
  return (
    <g>
      <rect x="52" y="18" width="56" height="84" rx="5" fill={CARD} stroke={INK} strokeWidth="1.1" />
      <Bar x={60} y={28} w={24} h={1.6} />
      {[38, 52].map((y, i) => (
        <g key={y}>
          <rect x="60" y={y} width="40" height="9" rx="2.5" fill="none" stroke={LINE} strokeWidth="0.9" />
          <Bar x={63} y={y + 3.3} w={26 - i * 6} cls={`sk-type sk-type-${i}`} />
        </g>
      ))}
      <rect x="60" y="66" width="18" height="7" rx="2.5" fill="var(--color-signal-soft)" stroke={SIGNAL} strokeWidth="0.6" className="sk-pop sk-d1" />
      <rect x="82" y="66" width="18" height="7" rx="2.5" fill="var(--color-signal-soft)" stroke={SIGNAL} strokeWidth="0.6" className="sk-pop sk-d2" />
      <g className="sk-press">
        <rect x="60" y="80" width="40" height="11" rx="5.5" fill={INK} />
        <path d="M75 85.5h10m-3-3 3 3-3 3" stroke={CARD} strokeWidth="1.1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </g>
  );
}

function Catch() {
  const dots: [number, number, number][] = [[30, 30, 0], [132, 24, 1], [24, 86, 2], [138, 92, 3], [80, 14, 4], [146, 58, 5], [16, 56, 6]];
  return (
    <g>
      <path d="M52 40v-8h8M100 32h8v8M108 80v8h-8M60 88h-8v-8" stroke={INK} strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <rect x="52" y="32" width="56" height="56" fill="none" stroke={SOFT} strokeWidth="0.6" strokeDasharray="1.5 2" />
      {dots.map(([x, y, i]) => (
        <circle key={i} cx={x} cy={y} r="1.8" fill={FAINT} className={`sk-drift sk-drift-${i}`} style={{ ["--dx" as string]: `${80 - x}px`, ["--dy" as string]: `${60 - y}px` }} />
      ))}
      <circle cx="80" cy="60" r="3" fill={SIGNAL} className="sk-land" />
      <text x="52" y="27" style={MONO}>01 CAPTURE</text>
      <text x="108" y="97" textAnchor="end" style={MONO}>02 KNOW</text>
    </g>
  );
}

function Pipeline() {
  const cols = ["LEAD", "DEMO", "WON"];
  return (
    <g>
      {cols.map((c, i) => (
        <g key={c}>
          <text x={34 + i * 34} y="24" style={MONO}>{c}</text>
          <rect x={30 + i * 34} y="28" width="30" height="74" rx="4" fill="none" stroke={SOFT} strokeWidth="0.7" />
          {[34, 50].map((y, k) => (i < 2 || k === 0 ? <rect key={y} x={33 + i * 34} y={y + (i === 2 ? 16 : 0)} width="24" height="12" rx="2.5" fill={CARD} stroke={LINE} strokeWidth="0.7" /> : null))}
        </g>
      ))}
      <g className="sk-slide">
        <rect x="33" y="66" width="24" height="12" rx="2.5" fill={CARD} stroke={INK} strokeWidth="1" />
        <Bar x={36} y={70.5} w={12} h={1.8} />
        <circle cx="53" cy="72" r="1.6" fill={SIGNAL} className="sk-won" />
      </g>
    </g>
  );
}

function Chain() {
  const nodes = ["FORM", "WAIT", "EMAIL", "GOAL"];
  return (
    <g>
      <line x1="30" y1="56" x2="130" y2="56" stroke={LINE} strokeWidth="0.9" />
      {nodes.map((n, i) => {
        const x = 30 + i * 33.3;
        return (
          <g key={n}>
            {i === 3 ? <circle cx={x} cy="56" r="9" fill={CARD} stroke={INK} strokeWidth="1.1" className="sk-goal" /> : <rect x={x - 9} y="47" width="18" height="18" rx="5" fill={CARD} stroke={INK} strokeWidth="1.1" />}
            {i === 3 ? <path d={`M${x - 3.5} 56l2.5 2.5 5-5.5`} stroke={CARD} strokeWidth="1.4" fill="none" strokeLinecap="round" className="sk-tick" /> : <Bar x={x - 4.5} y={55} w={9} h={1.6} c={INK} />}
            <text x={x} y="80" textAnchor="middle" style={MONO}>{n}</text>
          </g>
        );
      })}
      <circle cx="30" cy="56" r="2.2" fill={SIGNAL} className="sk-travel" />
    </g>
  );
}

function Branch() {
  const reps: [string, number][] = [["LENA", 30], ["SAM", 60], ["OMAR", 90]];
  return (
    <g>
      <line x1="16" y1="60" x2="49.5" y2="60" stroke={LINE} strokeWidth="0.9" />
      <path d="M60 49.5 70.5 60 60 70.5 49.5 60Z" fill={CARD} stroke={INK} strokeWidth="1.1" strokeLinejoin="round" />
      {reps.map(([n, y], i) => (
        <g key={n}>
          <path d={`M70.5 60C90 60 92 ${y} 112 ${y}`} stroke={i === 1 ? INK : LINE} strokeWidth={i === 1 ? 1.1 : 0.8} fill="none" />
          <circle cx="120" cy={y} r="8" fill={i === 1 ? INK : CARD} stroke={INK} strokeWidth="1.1" className={i === 1 ? "sk-pick" : undefined} />
          <text x="132" y={y + 1.8} style={MONO}>{n}</text>
        </g>
      ))}
      <circle r="2.2" fill={SIGNAL} className="sk-route" style={{ offsetPath: "path('M16 60H112')" }} />
    </g>
  );
}

function Mail() {
  return (
    <g>
      {[0, 1, 2].map((i) => (
        <g key={i} className={`sk-rise sk-d${i}`}>
          <rect x="36" y={26 + i * 24} width="88" height="18" rx="4" fill={CARD} stroke={i === 0 ? INK : LINE} strokeWidth={i === 0 ? 1.1 : 0.8} />
          <path d={`M42 ${31 + i * 24}l8 5 8-5`} stroke={i === 0 ? INK : LINE} strokeWidth="0.9" fill="none" strokeLinejoin="round" />
          <rect x="42" y={31 + i * 24} width="16" height="9" rx="1.5" fill="none" stroke={i === 0 ? INK : LINE} strokeWidth="0.9" />
          <Bar x={64} y={32 + i * 24} w={36 - i * 6} h={2} c={i === 0 ? INK : LINE} />
          <Bar x={64} y={37 + i * 24} w={24} h={1.6} c={SOFT} />
          {i === 0 ? <circle cx="114" cy="35" r="4" fill={SIGNAL} className="sk-pop sk-d3" /> : null}
          {i === 0 ? <path d="M112 35l1.4 1.4 2.8-3" stroke={CARD} strokeWidth="1" fill="none" strokeLinecap="round" className="sk-pop sk-d3" /> : null}
        </g>
      ))}
    </g>
  );
}

function Feed() {
  return (
    <g>
      <rect x="28" y="22" width="104" height="78" rx="5" fill={CARD} stroke={INK} strokeWidth="1.1" />
      <line x1="28" y1="32" x2="132" y2="32" stroke={SOFT} strokeWidth="0.7" />
      {[33, 38, 43].map((x) => <circle key={x} cx={x} cy="27" r="1.3" fill={SOFT} />)}
      {[0, 1, 2, 3].map((i) => (
        <g key={i} className={`sk-rise sk-d${i}`}>
          <circle cx="38" cy={43 + i * 15} r={i === 0 ? 2.2 : 1.6} fill={i === 0 ? SIGNAL : SOFT} className={i === 0 ? "sk-pulse" : undefined} />
          <Bar x={45} y={42 + i * 15} w={i === 0 ? 40 : 30 - i * 2} h={i === 0 ? 2.4 : 2} c={i === 0 ? INK : LINE} />
          <Bar x={96} y={42 + i * 15} w={14} h={2} c={SOFT} />
          <text x="126" y={44.5 + i * 15} textAnchor="end" style={MONO}>{["LIVE", "2M", "9M", "1H"][i]}</text>
        </g>
      ))}
    </g>
  );
}

function People() {
  return (
    <g>
      {[0, 1, 2, 3].map((i) => (
        <g key={i} className={`sk-rise sk-d${i}`}>
          <rect x="34" y={20 + i * 21} width="92" height="16" rx="4" fill={CARD} stroke={i === 1 ? INK : LINE} strokeWidth={i === 1 ? 1.1 : 0.8} />
          <circle cx="44" cy={28 + i * 21} r="4.2" fill={i === 1 ? INK : "var(--color-paper-deep)"} stroke={i === 1 ? INK : LINE} strokeWidth="0.8" />
          <Bar x={52} y={25 + i * 21} w={28 + (i % 2) * 8} h={2} c={i === 1 ? INK : LINE} />
          <Bar x={52} y={30 + i * 21} w={18} h={1.6} c={SOFT} />
          {i === 1 ? <rect x="104" y={24.5 + i * 21} width="16" height="7" rx="3.5" fill="var(--color-signal-soft)" stroke={SIGNAL} strokeWidth="0.6" className="sk-pop sk-d3" /> : null}
          {i === 1 ? <text x="112" y={29.6 + i * 21} textAnchor="middle" style={{ ...MONO, fill: SIGNAL, fontSize: 4 }} className="sk-pop sk-d3">NEW</text> : null}
        </g>
      ))}
    </g>
  );
}

function Toggles() {
  return (
    <g>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x="34" y={26 + i * 24} width="92" height="18" rx="4" fill={CARD} stroke={LINE} strokeWidth="0.8" />
          <Bar x={42} y={33.8 + i * 24} w={34 - i * 6} h={2} c={i === 1 ? INK : LINE} />
          <rect x="102" y={30 + i * 24} width="18" height="10" rx="5" fill={i === 1 ? undefined : SOFT} className={i === 1 ? "sk-switch-bg" : undefined} />
          <circle cx="107" cy={35 + i * 24} r="3.6" fill={CARD} stroke={LINE} strokeWidth="0.6" className={i === 1 ? "sk-switch" : undefined} />
        </g>
      ))}
    </g>
  );
}

function Week() {
  const days = ["MON", "TUE", "WED", "THU", "FRI"];
  const open: [number, number][] = [[0, 1], [1, 0], [1, 2], [2, 1], [3, 0], [3, 2], [4, 1], [0, 3], [2, 3], [4, 3]];
  return (
    <g>
      {days.map((d, i) => <text key={d} x={35 + i * 22.5} y="26" textAnchor="middle" style={MONO}>{d}</text>)}
      {open.map(([c, r]) => <rect key={`${c}${r}`} x={26 + c * 22.5} y={32 + r * 18} width="18" height="12" rx="3" fill={CARD} stroke={LINE} strokeWidth="0.8" />)}
      <rect x={26 + 3 * 22.5} y={32 + 2 * 18} width="18" height="12" rx="3" fill={SIGNAL} stroke={SIGNAL} strokeWidth="0.8" className="sk-book" />
      <path d={`M${26 + 3 * 22.5 + 5.5} ${32 + 2 * 18 + 6}l2.3 2.3 4.5-4.6`} stroke={CARD} strokeWidth="1.2" fill="none" strokeLinecap="round" className="sk-book" />
      <path d="M0 0l0 9 2.6-2.4 2 4.2 1.6-.8-2-4.1 3.4-.2z" fill={INK} stroke={CARD} strokeWidth="0.6" className="sk-cursor" />
    </g>
  );
}

/** Two tools trading contacts: rows travel each way along the lines, one in emerald. */
function Sync() {
  return (
    <g>
      {[0, 1].map((side) => (
        <g key={side}>
          <rect x={side ? 102 : 22} y="30" width="36" height="60" rx="5" fill={CARD} stroke={INK} strokeWidth="1.1" />
          <text x={side ? 120 : 40} y="40" textAnchor="middle" style={MONO}>{side ? "CLARITIA" : "CRM"}</text>
          {[0, 1, 2].map((i) => <Bar key={i} x={side ? 108 : 28} y={48 + i * 11} w={24 - i * 4} h={2} c={i === 0 ? INK : LINE} />)}
        </g>
      ))}
      <line x1="60" y1="52" x2="100" y2="52" stroke={LINE} strokeWidth="0.8" strokeDasharray="2 2" />
      <line x1="60" y1="68" x2="100" y2="68" stroke={LINE} strokeWidth="0.8" strokeDasharray="2 2" />
      <rect x="58" y="49" width="10" height="6" rx="2" fill={SIGNAL} className="sk-sync-r" />
      <rect x="92" y="65" width="10" height="6" rx="2" fill={CARD} stroke={INK} strokeWidth="0.8" className="sk-sync-l" />
    </g>
  );
}

/** An envelope with its three checks turning on, one after another. */
function Domain() {
  return (
    <g>
      <rect x="40" y="24" width="80" height="50" rx="5" fill={CARD} stroke={INK} strokeWidth="1.1" />
      <path d="M40 28l40 26 40-26" stroke={INK} strokeWidth="1.1" fill="none" strokeLinejoin="round" />
      {["DKIM", "SPF", "DMARC"].map((t, i) => (
        <g key={t}>
          <rect x={34 + i * 32} y="84" width="28" height="12" rx="6" fill={CARD} stroke={LINE} strokeWidth="0.8" />
          <circle cx={41 + i * 32} cy="90" r="2.6" fill={SIGNAL} className={`sk-pop sk-d${i + 1}`} />
          <text x={52 + i * 32} y="91.8" textAnchor="middle" style={{ ...MONO, fontSize: 4.2 }}>{t}</text>
        </g>
      ))}
    </g>
  );
}

/** A key and a line of code that types itself. */
function Key() {
  return (
    <g>
      <rect x="30" y="58" width="100" height="34" rx="5" fill={CARD} stroke={INK} strokeWidth="1.1" />
      <text x="38" y="70" style={MONO}>CURL</text>
      <Bar x={38} y={76} w={70} h={2} c={LINE} cls="sk-type" />
      <Bar x={38} y={82} w={46} h={2} c={LINE} cls="sk-type sk-type-1" />
      <g className="sk-pick">
        <circle cx="62" cy="38" r="10" fill={CARD} stroke={INK} strokeWidth="1.1" />
        <circle cx="62" cy="38" r="3.2" fill={SIGNAL} />
        <path d="M72 38h28v6M90 38v5" stroke={INK} strokeWidth="1.1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </g>
  );
}

const SCENES = { clipboard: Form, funnel: Catch, cards: Pipeline, road: Chain, plane: Branch, signpost: Branch, envelopes: Mail, browser: Feed, megaphone: People, gear: Toggles, calendar: Week, sync: Sync, domain: Domain, key: Key } as const;

export type SketchName = keyof typeof SCENES;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function Sketch({ name, tone = "clay", draw = true, size = 200, className = "" }: { name: SketchName; tone?: SketchTone; draw?: boolean; size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  const Scene = SCENES[name] ?? Form;
  return (
    <svg width={size} height={(size * 120) / 160} viewBox="0 0 160 120" fill="none" aria-hidden="true" className={`sk shrink-0 ${className}`}>
      <defs>
        <pattern id={`g${id}`} width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.45" fill="var(--color-line-strong)" />
        </pattern>
        <radialGradient id={`f${id}`} cx="50%" cy="50%" r="60%">
          <stop offset="55%" stopColor="#fff" />
          <stop offset="100%" stopColor="#000" />
        </radialGradient>
        <mask id={`m${id}`}>
          <rect width="160" height="120" fill={`url(#f${id})`} />
        </mask>
      </defs>
      <rect width="160" height="120" rx="10" fill="var(--color-paper-deep)" opacity="0.55" />
      <rect width="160" height="120" fill={`url(#g${id})`} mask={`url(#m${id})`} opacity="0.8" />
      <Scene />
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
