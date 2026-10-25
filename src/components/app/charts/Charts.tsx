"use client";

// Reports' charts (docs/enrich-workflows-reports.md 3.5): funnel bars, a day line and ranked bars, as small SVG and
// HTML parts. One series each, in the Reports hue; labels in text tokens on the marks; a hover card with the exact
// number; bars grow at the standard speed and stand still under reduced motion.

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** Bars grow from the baseline once, after the first paint. */
function useGrown() {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(r);
  }, []);
  return grown;
}

export type FunnelStep = { key: string; label: string; value: number; format?: (n: number) => string; pickable?: boolean };

/** The funnel as horizontal bars: each step's count at its tip, and the share of the step before it on the right. */
export function FunnelBars({ steps, onPick }: { steps: FunnelStep[]; onPick?: (key: string) => void }) {
  const grown = useGrown();
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <ol className="flex flex-col gap-1" aria-label="Funnel">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1]!.value : null;
        const rate = prev ? `${Math.round((s.value / prev) * 100)}%` : "";
        const w = (s.value / max) * 100;
        const text = (s.format ?? ((n: number) => n.toLocaleString("en-US")))(s.value);
        return (
          <li key={s.key} className="group grid grid-cols-[112px_minmax(0,1fr)_48px] items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-hover sm:grid-cols-[140px_minmax(0,1fr)_56px]">
            <span className="truncate text-[13px] text-body">{s.label}</span>
            <span className="relative flex h-6 items-center">
              <span
                className="h-5 min-w-[2px] origin-left rounded-r-[4px] bg-lilac transition-transform duration-[320ms] ease-out motion-reduce:transition-none"
                style={{ width: `${w}%`, transform: grown ? "scaleX(1)" : "scaleX(0)", transitionDelay: `${i * 30}ms` }}
              />
              {s.pickable && onPick && s.value > 0 ? (
                <button type="button" onClick={() => onPick(s.key)} className="ml-2 rounded-full px-1 text-[13px] font-semibold text-ink tabular-nums underline-offset-2 hover:underline focus-visible:underline">
                  {text}
                </button>
              ) : (
                <span className="ml-2 text-[13px] font-semibold text-ink tabular-nums">{text}</span>
              )}
              <span role="tooltip" className="pointer-events-none absolute -top-8 left-0 hidden rounded-md bg-ink px-2 py-1 text-[12px] whitespace-nowrap text-paper shadow-float group-hover:block">
                {s.label}: {text}
                {rate ? `, ${rate} of the step before` : ""}
              </span>
            </span>
            <span className="text-right text-[12.5px] text-muted tabular-nums">{rate}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Ranked bars for a short list: a label, a bar and the number at its tip. */
export function RankBars({ rows, format = (n) => n.toLocaleString("en-US"), onPick }: { rows: { key: string; label: string; value: number }[]; format?: (n: number) => string; onPick?: (key: string) => void }) {
  const grown = useGrown();
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-1">
      {rows.map((r, i) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] items-center gap-3 px-2 py-1">
          <span className="truncate text-[13px] text-body" title={r.label}>
            {r.label}
          </span>
          <span className="flex h-5 items-center">
            <span
              className="h-4 min-w-[2px] origin-left rounded-r-[4px] bg-lilac transition-transform duration-[320ms] ease-out motion-reduce:transition-none"
              style={{ width: `${(r.value / max) * 85}%`, transform: grown ? "scaleX(1)" : "scaleX(0)", transitionDelay: `${i * 30}ms` }}
            />
            {onPick && r.value > 0 ? (
              <button type="button" onClick={() => onPick(r.key)} className="ml-2 text-[12.5px] font-medium text-ink tabular-nums hover:underline">
                {format(r.value)}
              </button>
            ) : (
              <span className="ml-2 text-[12.5px] font-medium text-ink tabular-nums">{format(r.value)}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

const H = 168;
const PAD = { top: 12, right: 12, bottom: 24, left: 40 };

/** A clean top for the axis: 1, 2 or 5 times a power of ten. */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** One value a day as a 2px line over a light wash, with a crosshair and the exact number on hover. Days with no value
 * (null) break the line. */
export function DayLine({ points, label, format = (n) => n.toLocaleString("en-US") }: { points: { day: string; v: number | null }[]; label: string; format?: (n: number) => string }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [at, setAt] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => e && setW(Math.max(200, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const n = points.length;
  const top = niceMax(Math.max(0, ...points.map((p) => p.v ?? 0)));
  const x = (i: number) => PAD.left + (n <= 1 ? 0 : (i / (n - 1)) * (w - PAD.left - PAD.right));
  const y = (v: number) => PAD.top + (1 - v / top) * (H - PAD.top - PAD.bottom);
  // Runs of days with values, each its own path.
  const runs: { i: number; v: number }[][] = [];
  points.forEach((p, i) => {
    if (p.v == null) return void runs.push([]);
    if (!runs.length) runs.push([]);
    runs[runs.length - 1]!.push({ i, v: p.v });
  });
  const lines = runs.filter((r) => r.length);
  const last = [...points.keys()].reverse().find((i) => points[i]!.v != null);
  const hover = at != null ? points[at] : null;
  const ticks = [0, top / 2, top];
  const labels = n ? [...new Set([0, Math.floor((n - 1) / 2), n - 1])] : [];

  return (
    <div ref={box} className="relative w-full select-none">
      <svg
        width={w}
        height={H}
        role="img"
        aria-label={label}
        className="block text-lilac"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.round(((e.clientX - r.left - PAD.left) / Math.max(1, w - PAD.left - PAD.right)) * (n - 1));
          setAt(n ? Math.min(n - 1, Math.max(0, i)) : null);
        }}
        onMouseLeave={() => setAt(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={w - PAD.right} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth="1" />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="fill-faint text-[11px] tabular-nums">
              {format(t)}
            </text>
          </g>
        ))}
        {labels.map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="fill-faint text-[11px]">
            {shortDay(points[i]!.day)}
          </text>
        ))}
        {lines.map((r, k) => (
          <g key={k}>
            {r.length > 1 ? <path d={`M${x(r[0]!.i)},${y(0)} ${r.map((p) => `L${x(p.i)},${y(p.v)}`).join(" ")} L${x(r[r.length - 1]!.i)},${y(0)} Z`} fill="currentColor" opacity="0.1" /> : null}
            <path d={r.map((p, j) => `${j ? "L" : "M"}${x(p.i)},${y(p.v)}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          </g>
        ))}
        {last != null ? <circle cx={x(last)} cy={y(points[last]!.v!)} r="4" fill="currentColor" className="stroke-card" strokeWidth="2" /> : null}
        {hover && at != null ? (
          <g>
            <line x1={x(at)} x2={x(at)} y1={PAD.top} y2={H - PAD.bottom} className="stroke-line-strong" strokeWidth="1" />
            {hover.v != null ? <circle cx={x(at)} cy={y(hover.v)} r="4" fill="currentColor" className="stroke-card" strokeWidth="2" /> : null}
          </g>
        ) : null}
      </svg>
      {hover && at != null ? (
        <div className="pointer-events-none absolute top-0 rounded-md bg-ink px-2 py-1 text-[12px] whitespace-nowrap text-paper shadow-float" style={{ left: Math.min(Math.max(0, x(at) - 50), w - 120) }}>
          {shortDay(hover.day)}: {hover.v == null ? "none" : format(hover.v)}
        </div>
      ) : null}
    </div>
  );
}
