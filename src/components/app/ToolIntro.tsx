"use client";

import { Sketch, type SketchName } from "../sketches/Sketch";

// The first screen of a tool, before there's anything to show: what it does, and cards with small sample visuals.
// The one place in the app that explains; working screens hold labels, buttons and real errors only.
// Same pattern as Omniscient's and Arrowsterr's ToolIntro.

type Feature = { title: string; text: string; visual?: React.ReactNode };

export function ToolIntro({ title, lead, action, features, sketch = "cards" }: { title: string; lead?: string; action?: React.ReactNode; features?: Feature[]; sketch?: SketchName }) {
  // Big headings take two tones: a line break in the title turns the rest gray.
  const [first, rest = ""] = title.split("\n");
  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-8 py-2">
      <div className="wash relative grid items-center gap-6 overflow-hidden rounded-2xl border border-line px-7 py-9 md:grid-cols-[1fr_auto] md:px-10">
        <div className="anim-rise flex flex-col gap-4">
          <span className="font-mono text-[11.5px] font-medium tracking-[0.08em] text-muted uppercase">Start here</span>
          <h2 className="max-w-2xl text-[31px] leading-[1.08] font-medium tracking-[-0.035em] text-ink md:text-[38px]">
            {first}
            {rest ? <span className="block text-faint">{rest}</span> : null}
          </h2>
          {lead ? <p className="max-w-xl text-[15px] leading-relaxed text-body">{lead}</p> : null}
          {action ? <div className="mt-1 flex flex-wrap gap-2">{action}</div> : null}
        </div>
        <Sketch name={sketch} size={240} className="hidden md:block" />
      </div>
      {features?.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <div key={f.title} className="lift anim-rise flex flex-col rounded-lg border border-line bg-card" style={{ animationDelay: `${120 + i * 80}ms` }}>
              <div className="flex flex-1 flex-col gap-3 p-6">
                {f.visual ? <div className="flex h-20 items-center">{f.visual}</div> : null}
                <h3 className="mt-2 text-[16px] leading-tight font-medium tracking-[-0.015em] text-ink">{f.title}</h3>
                <p className="text-[13.5px] leading-relaxed text-muted">{f.text}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
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
