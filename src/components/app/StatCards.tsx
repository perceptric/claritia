"use client";

// Numbers first (docs/app-structure.md Part 2.2): three or four cards, each a big number and one sentence under it,
// as on Default's pages. Numbers count up on load (slow, ease-out) and show at once under reduced motion.

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "../Icons";
import { Popover } from "./FilterBar";

export type StatCard = { label: string; value: number | null; format?: (n: number) => string; note?: string; tone?: "sage" | "butter" | "rose" };

const TONE_TEXT = { sage: "text-sage", butter: "text-butter", rose: "text-rose" } as const;

const fmt = (n: number) => n.toLocaleString("en-US");

/** A number that counts up to `value` once it's known. */
export function CountUp({ value, format = fmt }: { value: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(0);
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const start = from.current;
    from.current = value;
    if (reduce || start === value) {
      setShown(value);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 700);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(start + (value - start) * eased));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(shown)}</>;
}

export function StatCards({ cards }: { cards: StatCard[] }) {
  return (
    <div className={`grid gap-3 sm:grid-cols-2 ${cards.length >= 4 ? "xl:grid-cols-4" : "lg:grid-cols-3"}`}>
      {cards.map((c, i) => (
        <div key={c.label} className="anim-rise-sm flex min-w-0 flex-col gap-2 rounded-2xl border border-line bg-card px-5 py-4" style={{ animationDelay: `${i * 60}ms` }}>
          <span className="truncate text-[12.5px] text-muted">{c.label}</span>
          <span className={`text-[30px] leading-none font-semibold tracking-[-0.04em] tabular-nums ${c.tone ? TONE_TEXT[c.tone] : "text-ink"}`}>
            {c.value === null ? <span className="anim-shimmer inline-block h-7 w-16 rounded-full bg-paper-deep align-middle" /> : <CountUp value={c.value} format={c.format} />}
          </span>
          {c.note ? <span className="truncate text-[12.5px] text-faint">{c.note}</span> : null}
        </div>
      ))}
    </div>
  );
}

/** Bars over days, like Default's "New companies over time": one bar a day, the label under the first, middle and last. */
export function DayBars({ days, label }: { days: { day: string; n: number }[]; label: string }) {
  const max = Math.max(1, ...days.map((d) => d.n));
  const mid = Math.floor(days.length / 2);
  const words = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return (
    <figure aria-label={label} className="flex flex-col gap-2">
      <div className="flex h-36 items-end gap-[3px]">
        {days.map((d, i) => (
          <div key={d.day} className="group relative flex h-full flex-1 items-end">
            <div
              className="anim-grow w-full rounded-t-[3px] bg-sky/80 transition-colors duration-[140ms] group-hover:bg-sky"
              style={{ height: `${Math.max(d.n ? 4 : 1, (d.n / max) * 100)}%`, animationDelay: `${Math.min(i, 30) * 12}ms` }}
              title={`${words(d.day)}: ${d.n}`}
            />
          </div>
        ))}
      </div>
      <figcaption className="flex justify-between text-[11.5px] text-faint tabular-nums">
        <span>{days[0] ? words(days[0].day) : ""}</span>
        <span>{days[mid] ? words(days[mid].day) : ""}</span>
        <span>{days.length ? words(days[days.length - 1]!.day) : ""}</span>
      </figcaption>
    </figure>
  );
}

/** Count rows by day over the last `n` days, oldest first, with empty days kept. */
export function byDay(isoTimes: string[], n: number, now = Date.now()): { day: string; n: number }[] {
  const out: { day: string; n: number }[] = [];
  const counts = new Map<string, number>();
  for (const t of isoTimes) {
    const d = new Date(t).toLocaleDateString("en-CA");
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now - i * 86_400_000).toLocaleDateString("en-CA");
    out.push({ day: d, n: counts.get(d) ?? 0 });
  }
  return out;
}

/** A ⋯ button that opens a short menu of actions. */
export function MoreMenu({ label = "More", items }: { label?: string; items: ({ label: string; run: () => void; danger?: boolean } | null)[] }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = !!anchor;
  const setOpen = (v: boolean) => (v ? null : setAnchor(null));
  const list = items.filter(Boolean) as { label: string; run: () => void; danger?: boolean }[];
  return (
    <>
      <button type="button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={(e) => { e.stopPropagation(); setAnchor(anchor ? null : e.currentTarget); }} className="press inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink">
        <MoreHorizontal size={15} />
      </button>
      {open ? (
        <Popover anchor={anchor} onClose={() => setOpen(false)} width={200}>
          <div role="menu" className="flex flex-col p-1">
            {list.map((i) => (
              <button
                key={i.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  i.run();
                }}
                className={`flex h-8 items-center rounded-md px-2.5 text-left text-[13px] hover:bg-hover ${i.danger ? "text-rose" : "text-ink"}`}
              >
                {i.label}
              </button>
            ))}
          </div>
        </Popover>
      ) : null}
    </>
  );
}
