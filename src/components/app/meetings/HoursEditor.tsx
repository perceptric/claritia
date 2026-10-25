"use client";

// Hours (docs/meetings-scheduler.md 1.2): weekly hours in a time zone, several ranges a day, copy a day to the
// others, and date overrides (a day off or different hours on one date). Used on My calendar and, for owners, on
// Team calendars. The server checks with checkAvailability before saving.

import { useMemo, useRef, useState } from "react";
import { addDays, dateIn, dayOf } from "@/lib/meetings/time";
import { DAYS, type Availability, type Day, type Range } from "@/lib/meetings/types";
import { ChevronRight, Copy, Globe, Plus, Search, X } from "../../Icons";
import { Select } from "../Select";
import { IconButton, Toggle } from "../ui";
import { Popover } from "../forms/controls";
import { CLOCKS, copyToAll, DAY_LABEL, nextRange, zones } from "./model";

const CLOCK_OPTIONS = CLOCKS.map((c) => ({ value: c, label: c }));
const FROM_OPTIONS = CLOCK_OPTIONS.slice(0, -1);

export function HoursEditor({ value, onChange }: { value: Availability; onChange: (a: Availability) => void }) {
  const setDay = (d: Day, ranges: Range[]) => onChange({ ...value, weekly: { ...value.weekly, [d]: ranges } });
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <span className="w-24 shrink-0 text-[12px] font-medium text-muted">Time zone</span>
        <ZonePicker value={value.tz} onChange={(tz) => onChange({ ...value, tz })} />
      </div>
      <ul className="flex flex-col divide-y divide-line">
        {DAYS.map((d) => (
          <li key={d} className="flex items-start gap-3 py-2.5 first:pt-0">
            <span className="flex h-8 w-24 shrink-0 items-center gap-2.5">
              <Toggle label={DAY_LABEL[d]} on={value.weekly[d].length > 0} onChange={(on) => setDay(d, on ? [["09:00", "17:00"]] : [])} />
              <span className={`text-[13px] font-medium ${value.weekly[d].length ? "text-ink" : "text-faint"}`}>{DAY_LABEL[d]}</span>
            </span>
            <Ranges
              ranges={value.weekly[d]}
              onChange={(r) => setDay(d, r)}
              extra={
                value.weekly[d].length ? (
                  <IconButton label="Copy to every day" onClick={() => onChange({ ...value, weekly: copyToAll(value.weekly, d, true) })}>
                    <Copy size={13} />
                  </IconButton>
                ) : null
              }
            />
          </li>
        ))}
      </ul>
      <Overrides value={value} onChange={onChange} />
    </div>
  );
}

/** A day's ranges: from and to pickers, add and remove. Empty is a day off. */
function Ranges({ ranges, onChange, extra }: { ranges: Range[]; onChange: (r: Range[]) => void; extra?: React.ReactNode }) {
  const next = nextRange(ranges);
  if (!ranges.length) return <span className="flex h-8 items-center text-[13px] text-faint">Off</span>;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      {ranges.map((r, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <ClockPick label="From" value={r[0]} options={FROM_OPTIONS} onChange={(v) => onChange(ranges.map((x, j) => (j === i ? [v, x[1] <= v ? (CLOCKS[CLOCKS.indexOf(v) + 4] ?? "24:00") : x[1]] : x)))} />
          <span className="text-[12px] text-faint">to</span>
          <ClockPick label="To" value={r[1]} options={CLOCK_OPTIONS.filter((c) => c.value > r[0])} onChange={(v) => onChange(ranges.map((x, j) => (j === i ? [x[0], v] : x)))} />
          <IconButton label="Remove" className="size-7" onClick={() => onChange(ranges.filter((_, j) => j !== i))}>
            <X size={13} />
          </IconButton>
          {i === 0 ? (
            <span className="ml-auto flex items-center">
              {next ? (
                <IconButton label="Add hours" onClick={() => onChange([...ranges, next])}>
                  <Plus size={14} />
                </IconButton>
              ) : null}
              {extra}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ClockPick({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <Select<string>
      value={value}
      options={options}
      onChange={onChange}
      ariaLabel={label}
      className="h-8 w-[84px] rounded-sm border border-line-strong bg-card px-2.5 text-[13px] text-ink tabular-nums hover:border-ink/40"
    />
  );
}

/** A time zone with a search box, since there are hundreds. */
export function ZonePicker({ value, onChange }: { value: string; onChange: (tz: string) => void }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const all = useMemo(() => zones(value), [value]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase().replace(/\s+/g, "_");
    return (t ? all.filter((z) => z.toLowerCase().includes(t)) : all).slice(0, 80);
  }, [all, q]);
  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 min-w-0 items-center gap-2 rounded-sm border border-line-strong bg-card px-2.5 text-[13px] text-ink hover:border-ink/40"
      >
        <Globe size={13} className="text-muted" />
        <span className="truncate">{value.replace(/_/g, " ")}</span>
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} label="Time zone" width={280}>
        <label className="mb-1.5 flex h-8 items-center gap-2 rounded-sm border border-line-strong px-2 focus-within:border-ink">
          <Search size={13} className="text-faint" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search time zones" className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-faint" />
        </label>
        <ul className="max-h-64 overflow-y-auto">
          {shown.map((z) => (
            <li key={z}>
              <button
                type="button"
                onClick={() => {
                  onChange(z);
                  setOpen(false);
                  setQ("");
                }}
                className={`flex h-8 w-full items-center rounded-sm px-2 text-left text-[12.5px] hover:bg-hover ${z === value ? "font-medium text-ink" : "text-body"}`}
              >
                {z.replace(/_/g, " ")}
              </button>
            </li>
          ))}
        </ul>
      </Popover>
    </>
  );
}

/** Date overrides: a day off or other hours on one date, picked from a small month. */
function Overrides({ value, onChange }: { value: Availability; onChange: (a: Availability) => void }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [now] = useState(() => Date.now());
  const today = dateIn(now, value.tz);
  const list = value.overrides.filter((o) => o.date >= today);
  const put = (date: string, ranges: Range[]) => onChange({ ...value, overrides: value.overrides.map((o) => (o.date === date ? { date, ranges } : o)) });
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-5">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[13px] font-semibold tracking-[-0.01em] text-ink">Date changes</span>
        <button ref={anchor} type="button" onClick={() => setOpen((o) => !o)} className="press inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong bg-card px-3 text-[12.5px] font-medium text-ink hover:bg-hover">
          <Plus size={13} />
          Add a date
        </button>
        <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} label="Pick a date" width={264}>
          <MonthPick
            from={today}
            taken={new Set(value.overrides.map((o) => o.date))}
            onPick={(date) => {
              onChange({ ...value, overrides: [...value.overrides.filter((o) => o.date >= today), { date, ranges: [] }].sort((a, b) => (a.date < b.date ? -1 : 1)) });
              setOpen(false);
            }}
          />
        </Popover>
      </div>
      {list.length ? (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
          {list.map((o) => (
            <li key={o.date} className="anim-rise-sm flex items-start gap-3 px-3 py-2.5">
              <span className="flex h-8 w-28 shrink-0 items-center text-[13px] font-medium text-ink tabular-nums">
                {new Date(`${o.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
              </span>
              <span className="flex h-8 shrink-0 items-center">
                <Toggle label="Working" on={o.ranges.length > 0} onChange={(on) => put(o.date, on ? (value.weekly[dayOf(o.date)].length ? value.weekly[dayOf(o.date)] : [["09:00", "17:00"]]) : [])} />
              </span>
              <Ranges ranges={o.ranges} onChange={(r) => put(o.date, r)} />
              <IconButton label="Remove date" className="ml-auto" onClick={() => onChange({ ...value, overrides: value.overrides.filter((x) => x.date !== o.date) })}>
                <X size={13} />
              </IconButton>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** A month of dates from today on, with the ones already changed marked. */
function MonthPick({ from, taken, onPick }: { from: string; taken: Set<string>; onPick: (date: string) => void }) {
  const [month, setMonth] = useState(from.slice(0, 7));
  const cells = useMemo(() => {
    const start = `${month}-01`;
    const out: (string | null)[] = Array.from({ length: DAYS.indexOf(dayOf(start)) }, () => null);
    for (let d = start; d.startsWith(month); d = addDays(d, 1)) out.push(d);
    return out;
  }, [month]);
  const move = (n: number) => {
    const [y, m] = month.split("-").map(Number);
    setMonth(new Date(Date.UTC(y!, m! - 1 + n, 1)).toISOString().slice(0, 7));
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center">
        <span className="flex-1 pl-1 text-[13px] font-semibold text-ink">{new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</span>
        <IconButton label="Last month" className="size-7" disabled={month <= from.slice(0, 7)} onClick={() => move(-1)}>
          <ChevronRight size={13} className="rotate-180" />
        </IconButton>
        <IconButton label="Next month" className="size-7" onClick={() => move(1)}>
          <ChevronRight size={13} />
        </IconButton>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((w) => (
          <span key={w} className="pb-1 text-[10.5px] font-medium text-faint">
            {w}
          </span>
        ))}
        {cells.map((d, i) =>
          d ? (
            <button
              key={d}
              type="button"
              disabled={d < from || taken.has(d)}
              onClick={() => onPick(d)}
              className={`mx-auto flex size-8 items-center justify-center rounded-full text-[12.5px] tabular-nums transition-colors duration-[140ms] disabled:cursor-default ${taken.has(d) ? "bg-clay-wash font-semibold text-clay" : d < from ? "text-faint" : "text-ink hover:bg-hover"}`}
            >
              {Number(d.slice(8))}
            </button>
          ) : (
            <span key={`x${i}`} />
          ),
        )}
      </div>
    </div>
  );
}
