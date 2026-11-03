"use client";

// The app's own date picker, in place of the browser's: a pill with the date that opens a small month on the floating
// layer (Popover). Arrow keys move the day, Enter picks it, Escape closes. Dates are YYYY-MM-DD in the viewer's zone.

import { useEffect, useRef, useState } from "react";
import { CalendarIcon, ChevronRight } from "../Icons";
import { Popover } from "./FilterBar";

const pad = (n: number) => String(n).padStart(2, "0");
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1, 12);
};
export const addDay = (s: string, n: number) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return isoDay(d);
};
export const dayWords = (s: string, o: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) => parse(s).toLocaleDateString("en-US", o);

/** A month as weeks of days (Monday first), with blanks before the 1st. */
export function monthCells(ym: string): (string | null)[] {
  const first = parse(`${ym}-01`);
  const lead = (first.getDay() + 6) % 7;
  const out: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = new Date(first); d.getMonth() === first.getMonth(); d.setDate(d.getDate() + 1)) out.push(isoDay(d));
  return out;
}

export function DatePick({
  value,
  onChange,
  label,
  min,
  max,
  on = false,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  min?: string;
  max?: string;
  /** Drawn as picked (ink), for a date that is the current filter. */
  on?: boolean;
  /** Shown in place of the date. */
  placeholder?: string;
  className?: string;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={!!anchor}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
        className={`press inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium tabular-nums transition-colors duration-[140ms] ${on ? "border-ink bg-ink text-paper" : "border-line-strong bg-card text-ink hover:border-ink/40"} ${className}`}
      >
        <CalendarIcon size={13} />
        {placeholder ?? (value ? dayWords(value) : "Pick a day")}
      </button>
      {anchor ? (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} width={272}>
          <MonthPick
            value={value}
            min={min}
            max={max}
            onPick={(d) => {
              setAnchor(null);
              onChange(d);
              anchor.focus();
            }}
          />
        </Popover>
      ) : null}
    </>
  );
}

/** The month inside the picker. */
export function MonthPick({ value, min, max, onPick }: { value: string; min?: string; max?: string; onPick: (d: string) => void }) {
  const today = isoDay(new Date());
  const [focus, setFocus] = useState(value || today);
  const [month, setMonth] = useState((value || today).slice(0, 7));
  const grid = useRef<HTMLDivElement>(null);
  const ok = (d: string) => (!min || d >= min) && (!max || d <= max);
  useEffect(() => {
    grid.current?.querySelector<HTMLElement>(`[data-day="${focus}"]`)?.focus();
  }, [focus, month]);
  const shift = (n: number) => {
    const d = parse(`${month}-15`);
    d.setMonth(d.getMonth() + n);
    setMonth(isoDay(d).slice(0, 7));
  };
  const move = (n: number) => {
    const next = addDay(focus, n);
    setFocus(next);
    if (next.slice(0, 7) !== month) setMonth(next.slice(0, 7));
  };
  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-ink">{parse(`${month}-15`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
        <span className="flex gap-0.5">
          <button type="button" aria-label="Previous month" onClick={() => shift(-1)} className="press inline-flex size-7 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink">
            <ChevronRight size={14} className="rotate-180" />
          </button>
          <button type="button" aria-label="Next month" onClick={() => shift(1)} className="press inline-flex size-7 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink">
            <ChevronRight size={14} />
          </button>
        </span>
      </div>
      <div className="grid grid-cols-7 text-center font-mono text-[10px] tracking-[0.06em] text-faint uppercase" aria-hidden="true">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div
        ref={grid}
        role="grid"
        aria-label="Days"
        className="grid grid-cols-7 gap-0.5"
        onKeyDown={(e) => {
          const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
          if (step) {
            e.preventDefault();
            move(step);
          } else if (e.key === "Enter" && ok(focus)) {
            e.preventDefault();
            onPick(focus);
          }
        }}
      >
        {monthCells(month).map((d, i) =>
          d ? (
            <button
              key={d}
              type="button"
              data-day={d}
              tabIndex={d === focus ? 0 : -1}
              disabled={!ok(d)}
              aria-pressed={d === value}
              aria-label={dayWords(d, { weekday: "long", month: "long", day: "numeric" })}
              onClick={() => onPick(d)}
              className={`relative flex aspect-square items-center justify-center rounded-full text-[12.5px] tabular-nums transition-colors duration-[120ms] outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-30 ${d === value ? "bg-ink font-semibold text-paper" : "text-ink hover:bg-hover"}`}
            >
              {Number(d.slice(8))}
              {d === today && d !== value ? <span aria-hidden="true" className="absolute bottom-1 size-1 rounded-full bg-signal" /> : null}
            </button>
          ) : (
            <span key={`x${i}`} />
          ),
        )}
      </div>
    </div>
  );
}
