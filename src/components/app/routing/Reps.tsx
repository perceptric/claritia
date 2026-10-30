"use client";

// A rep's status from Routing › Sales reps: pause for a while, out of office for some dates, or back in.

import { useState } from "react";
import { X } from "../../Icons";
import { Popover } from "../FilterBar";
import { Button } from "../ui";
import { endOfDay, localDate, pauseUntil, rangeWords, repStatus, type PauseChoice, type RepRow } from "./screensModel";

export type Patch = { paused_until?: string; out_dates?: { from: string; to: string }[]; backup?: string; cap_day?: number | null; cap_week?: number | null };

/** Pause for a while, out of office for some dates, or back in. */
export function StatusPopover({ anchor, rep, onClose, onSave }: { anchor: HTMLElement; rep: RepRow | undefined; onClose: () => void; onSave: (p: Patch) => Promise<void> }) {
  const [today] = useState(() => localDate(Date.now()));
  const [until, setUntil] = useState("");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);
  const status = repStatus(rep);
  const dates = rep?.out_dates ?? [];
  const run = async (p: Patch) => {
    setBusy(true);
    await onSave(p);
    setBusy(false);
  };
  const pause = (c: PauseChoice) => run({ paused_until: pauseUntil(c) });
  const row = "flex h-9 w-full items-center rounded-sm px-2.5 text-left hover:bg-hover disabled:opacity-45";
  return (
    <Popover anchor={anchor} onClose={onClose} width={300}>
      <div className="flex flex-col p-1.5" role="dialog" aria-label="Status">
        <p className="px-2.5 pt-1.5 pb-1 text-[12px] text-muted">Pause for</p>
        <button type="button" disabled={busy} className={row} onClick={() => pause("hour")}>
          1 hour
        </button>
        <button type="button" disabled={busy} className={row} onClick={() => pause("today")}>
          Rest of today
        </button>
        <form
          className="flex items-center gap-2 px-2.5 py-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (until && until >= today) void run({ paused_until: endOfDay(until) });
          }}
        >
          <input type="date" min={today} value={until} onChange={(e) => setUntil(e.target.value)} aria-label="Until a date" className="h-8 min-w-0 flex-1 rounded-sm border border-line-strong bg-card px-2 text-[12.5px] outline-none focus:border-ink focus:ring-1 focus:ring-ink" />
          <Button type="submit" variant="ghost" size="sm" disabled={busy || !until || until < today}>
            Pause
          </Button>
        </form>
        <button type="button" disabled={busy} className={row} onClick={() => pause("forever")}>
          Until I turn it back on
        </button>

        <div className="my-1.5 h-px bg-line" />
        <p className="px-2.5 pt-1 pb-1 text-[12px] text-muted">Out of office</p>
        {dates.map((d, i) => (
          <div key={`${d.from}-${d.to}`} className="flex h-8 items-center gap-2 px-2.5 text-[13px]">
            <span className="flex-1">{rangeWords(d.from, d.to)}</span>
            <button type="button" disabled={busy} aria-label={`Remove ${rangeWords(d.from, d.to)}`} onClick={() => void run({ out_dates: dates.filter((_, j) => j !== i) })} className="flex size-6 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink">
              <X size={12} />
            </button>
          </div>
        ))}
        <form
          className="flex flex-wrap items-center gap-1.5 px-2.5 py-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (from && to) void run({ out_dates: [...dates, { from: from <= to ? from : to, to: from <= to ? to : from }] });
          }}
        >
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Out from" className="h-8 min-w-0 flex-1 rounded-sm border border-line-strong bg-card px-2 text-[12.5px] outline-none focus:border-ink focus:ring-1 focus:ring-ink" />
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label="Out until" className="h-8 min-w-0 flex-1 rounded-sm border border-line-strong bg-card px-2 text-[12.5px] outline-none focus:border-ink focus:ring-1 focus:ring-ink" />
          <Button type="submit" variant="ghost" size="sm" disabled={busy || !from || !to}>
            Add
          </Button>
        </form>

        {status.kind !== "in" ? (
          <>
            <div className="my-1.5 h-px bg-line" />
            <Button
              size="sm"
              disabled={busy}
              className="m-1"
              onClick={() => void run({ paused_until: "", ...(status.kind === "out" ? { out_dates: dates.filter((d) => !(d.from <= today && today <= d.to)) } : {}) })}
            >
              Back in
            </Button>
          </>
        ) : null}
      </div>
    </Popover>
  );
}
