"use client";

import { Sketch, type SketchName } from "../sketches/Sketch";

// The first screen of a tool, before there's anything to show. Like Omniscient's (and Twenty's): the page stays blank,
// with the tool's animated scene in the middle, a short two-tone title, one line under it and the button that makes
// the first one. The one place in the app that explains; working screens hold labels, buttons and real errors only.
// `features` is kept for older callers and no longer shown.

type Feature = { title: string; text: string; visual?: React.ReactNode };

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ToolIntro({ title, lead, action, features, sketch = "cards" }: { title: string; lead?: string; action?: React.ReactNode; features?: Feature[]; sketch?: SketchName }) {
  // A line break in the title turns the rest gray.
  const [first, rest = ""] = title.split("\n");
  return (
    <section className="anim-rise flex min-h-[calc(100dvh-180px)] flex-col items-center justify-center px-6 py-12 text-center">
      <Sketch name={sketch} size={300} className="max-w-full" />
      <h2 className="mt-8 max-w-md text-[22px] leading-[1.15] font-medium tracking-[-0.025em] text-ink text-balance">
        {first}
        {rest ? <span className="text-faint"> {rest}</span> : null}
      </h2>
      {lead ? <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-muted text-balance">{lead}</p> : null}
      {action ? <div className="mt-6 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </section>
  );
}

// Sample visuals -----------------------------------------------------------------------------------

/** Vertical bars, like visits each day. */
export function SampleBars({ values = [30, 45, 40, 52, 48, 60, 72, 66, 58, 70, 64, 80] }: { values?: number[] }) {
  const max = Math.max(...values);
  return (
    <span className="flex h-16 w-full items-end gap-1" aria-hidden="true">
      {values.map((v, i) => (
        <span key={i} className="flex-1 rounded-[3px] bg-clay" style={{ height: `${(v / max) * 100}%`, opacity: 0.3 + (i / values.length) * 0.7 }} />
      ))}
    </span>
  );
}

/** Horizontal bars with labels and values. */
export function SampleRows({ rows }: { rows: [string, number, string?][] }) {
  const max = Math.max(...rows.map((r) => r[1]));
  return (
    <span className="flex w-full flex-col gap-1.5" aria-hidden="true">
      {rows.map(([label, v, shown]) => (
        <span key={label} className="grid grid-cols-[1fr_90px_44px] items-center gap-2 text-[11.5px]">
          <span className="truncate text-ink">{label}</span>
          <span className="h-1.5 rounded-full bg-paper-deep">
            <span className="block h-full rounded-full bg-clay" style={{ width: `${(v / max) * 100}%` }} />
          </span>
          <span className="num text-right text-body">{shown ?? v}</span>
        </span>
      ))}
    </span>
  );
}

/** A few big numbers side by side. */
export function SampleStats({ items }: { items: [string, string][] }) {
  return (
    <span className="grid w-full grid-cols-3 gap-4" aria-hidden="true">
      {items.map(([lab, v]) => (
        <span key={lab} className="flex flex-col">
          <span className="font-semibold text-[21px] leading-none tracking-[-0.03em] whitespace-nowrap text-ink tabular-nums">{v}</span>
          <span className="label-mono mt-1">{lab}</span>
        </span>
      ))}
    </span>
  );
}

/** Rows with a state tag on the right. */
export function SampleTags({ rows }: { rows: [string, string][] }) {
  return (
    <span className="flex w-full flex-col gap-1.5" aria-hidden="true">
      {rows.map(([label, tag]) => (
        <span key={label} className="flex items-center justify-between gap-2 text-[12px]">
          <span className="truncate text-ink">{label}</span>
          <span className="rounded-full bg-paper-deep px-2 py-0.5 text-[11px] font-medium text-body">{tag}</span>
        </span>
      ))}
    </span>
  );
}
