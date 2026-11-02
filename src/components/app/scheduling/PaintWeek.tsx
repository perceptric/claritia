"use client";

// Paint your hours (Meetings › Availability): a week as a grid of half hours. Press on a cell and drag across days and
// times to paint them open; start on an open cell to clear instead. Works with a mouse, a pen or a finger (pointer
// events), and from the keyboard: arrows move, Space or Enter flips a cell. Days you don't touch keep their exact times.

import { useRef, useState } from "react";
import { DAYS, type Availability, type Day } from "@/lib/meetings/types";
import { cellsToRanges, DAY_LABEL, paintRows, rangesToCells } from "../meetings/model";

type Drag = { mode: "on" | "off"; from: [number, number]; to: [number, number] };

const clock = (cell: number) => new Date(2000, 0, 1, Math.floor(cell / 2), (cell % 2) * 30).toLocaleTimeString("en-US", { hour: "numeric", minute: cell % 2 ? "2-digit" : undefined });

export function PaintWeek({ weekly, onChange }: { weekly: Availability["weekly"]; onChange: (w: Availability["weekly"]) => void }) {
  const { from, to } = paintRows(weekly);
  const rows = Array.from({ length: to - from }, (_, i) => from + i);
  const cells = Object.fromEntries(DAYS.map((d) => [d, rangesToCells(weekly[d] ?? [])])) as Record<Day, Set<number>>;
  const [drag, setDrag] = useState<Drag | null>(null);
  const [focus, setFocus] = useState<[number, number]>([0, rows.indexOf(18) >= 0 ? rows.indexOf(18) : 0]);
  const grid = useRef<HTMLDivElement>(null);

  const inDrag = (d: number, r: number) => {
    if (!drag) return null;
    const [d0, r0] = drag.from;
    const [d1, r1] = drag.to;
    return d >= Math.min(d0, d1) && d <= Math.max(d0, d1) && r >= Math.min(r0, r1) && r <= Math.max(r0, r1) ? drag.mode : null;
  };
  const at = (x: number, y: number): [number, number] | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-cell]");
    if (!el || !grid.current?.contains(el)) return null;
    const [d, r] = el.dataset.cell!.split(":").map(Number);
    return [d!, r!];
  };
  const commit = (dr: Drag) => {
    const next = { ...weekly };
    const [d0, d1] = [Math.min(dr.from[0], dr.to[0]), Math.max(dr.from[0], dr.to[0])];
    const [r0, r1] = [Math.min(dr.from[1], dr.to[1]), Math.max(dr.from[1], dr.to[1])];
    for (let d = d0; d <= d1; d++) {
      const day = DAYS[d]!;
      const set = new Set(cells[day]);
      for (let r = r0; r <= r1; r++) {
        if (dr.mode === "on") set.add(rows[r]!);
        else set.delete(rows[r]!);
      }
      next[day] = cellsToRanges(set);
    }
    onChange(next);
  };
  const flip = (d: number, r: number) => commit({ mode: cells[DAYS[d]!].has(rows[r]!) ? "off" : "on", from: [d, r], to: [d, r] });

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-card select-none">
      <div className="grid min-w-[520px] grid-cols-[56px_repeat(7,minmax(0,1fr))]">
        <span className="h-9 border-b border-line" />
        {DAYS.map((d) => (
          <span key={d} className="flex h-9 items-center justify-center border-b border-l border-line text-[12px] font-medium text-muted">
            {DAY_LABEL[d]}
          </span>
        ))}
      </div>
      <div
        ref={grid}
        role="grid"
        aria-label="Weekly hours"
        className="grid min-w-[520px] touch-none grid-cols-[56px_repeat(7,minmax(0,1fr))]"
        onPointerDown={(e) => {
          const c = at(e.clientX, e.clientY);
          if (!c) return;
          e.preventDefault();
          (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
          setFocus(c);
          setDrag({ mode: cells[DAYS[c[0]]!].has(rows[c[1]]!) ? "off" : "on", from: c, to: c });
        }}
        onPointerMove={(e) => {
          if (!drag) return;
          const c = at(e.clientX, e.clientY);
          if (c && (c[0] !== drag.to[0] || c[1] !== drag.to[1])) setDrag({ ...drag, to: c });
        }}
        onPointerUp={() => {
          if (drag) commit(drag);
          setDrag(null);
        }}
        onPointerCancel={() => setDrag(null)}
        onKeyDown={(e) => {
          const step: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
          const s = step[e.key];
          if (s) {
            e.preventDefault();
            const n: [number, number] = [Math.max(0, Math.min(6, focus[0] + s[0])), Math.max(0, Math.min(rows.length - 1, focus[1] + s[1]))];
            setFocus(n);
            grid.current?.querySelector<HTMLElement>(`[data-cell="${n[0]}:${n[1]}"]`)?.focus();
          } else if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            flip(focus[0], focus[1]);
          }
        }}
      >
        {rows.map((cell, r) => (
          <div key={cell} role="row" className="contents">
            <span className="relative h-5 pr-2 text-right text-[10.5px] text-faint tabular-nums">{cell % 2 === 0 ? <span className="absolute -top-[7px] right-2">{r ? clock(cell) : ""}</span> : null}</span>
            {DAYS.map((d, di) => {
              const live = inDrag(di, r);
              const on = live ? live === "on" : cells[d].has(cell);
              return (
                <button
                  key={d}
                  type="button"
                  role="gridcell"
                  data-cell={`${di}:${r}`}
                  tabIndex={focus[0] === di && focus[1] === r ? 0 : -1}
                  aria-selected={on}
                  aria-label={`${DAY_LABEL[d]} ${clock(cell)}, ${on ? "open" : "closed"}`}
                  className={`h-5 border-l border-line outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-inset ${cell % 2 === 0 ? "border-t border-t-line/70" : ""} ${on ? (live ? "bg-signal-soft" : "bg-signal-line") : live === "off" ? "bg-paper-deep" : "bg-card hover:bg-hover"}`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
