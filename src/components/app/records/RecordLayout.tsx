"use client";

// The Record page type, copied from Omniscient (src/components/RecordLayout.tsx and RecordBits.tsx there): who or
// what the record is, its key numbers, tabs and the open tab in the main column, and a right rail of fields in
// folding groups with short lists of related records. Contacts, companies, opportunities and custom records share it.

import { useState } from "react";
import { ChevronRight } from "../../Icons";
import { Avatar } from "../ui";

/** Who or what a record is: its picture, name, state tags and one line under it. */
export function RecordHead({ visual, title, tag, sub }: { visual?: React.ReactNode; title: string; tag?: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-5 pt-5 pb-4">
      {visual}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[18px] leading-tight font-medium tracking-[-0.015em] text-ink">{title}</h2>
          {tag}
        </div>
        {sub ? <p className="mt-1 truncate text-[13px] text-muted">{sub}</p> : null}
      </div>
    </div>
  );
}

/** The main column (head, numbers, tabs, the open tab) and the right rail of fields. At most 6xl wide. */
export function RecordLayout({ head, top, tabs, rail, children }: { head?: React.ReactNode; top?: React.ReactNode; tabs?: React.ReactNode; rail?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col bg-card lg:flex-row">
      <section className="min-w-0 flex-1">
        {head}
        {top}
        {tabs ? <div className="border-b border-line px-3">{tabs}</div> : null}
        {children}
      </section>
      {rail ? <aside className="w-full shrink-0 border-t border-line pb-4 lg:w-[360px] lg:border-t-0 lg:border-l">{rail}</aside> : null}
    </div>
  );
}

/** A record's key numbers in one strip with hairlines between them. */
export function StatStrip({ items }: { items: [string, React.ReactNode][] }) {
  if (!items.length) return null;
  const cols = { 1: "md:grid-cols-1", 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-4" }[Math.min(items.length, 4) as 1 | 2 | 3 | 4];
  return (
    <div className="px-5 pb-4">
      <div className={`grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line ${cols}`}>
        {items.map(([label, value]) => (
          <div key={label} className="min-w-0 bg-card px-4 py-3">
            <p className="truncate text-[12px] font-medium text-muted">{label}</p>
            <div className="mt-1 truncate text-[22px] leading-[1.1] font-normal tracking-[-0.02em] text-ink tabular-nums">{value ?? "—"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const FOLD_KEY = "claritia:record-folds";
const readFolds = (): string[] => {
  try {
    const v = JSON.parse(window.localStorage.getItem(FOLD_KEY) ?? "[]");
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
};

/** A titled group in the rail that folds. Which groups are folded is kept in this browser. */
export function FieldGroup({ id, title, children, action }: { id: string; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  const [folded, setFolded] = useState(() => (typeof window === "undefined" ? false : readFolds().includes(id)));
  const toggle = () => {
    const next = !folded;
    setFolded(next);
    try {
      const all = new Set(readFolds());
      if (next) all.add(id);
      else all.delete(id);
      window.localStorage.setItem(FOLD_KEY, JSON.stringify([...all]));
    } catch {}
  };
  return (
    <section className="border-t border-line px-3 py-2 first:border-t-0">
      <div className="flex items-center">
        <button type="button" onClick={toggle} aria-expanded={!folded} className="label-mono flex h-7 flex-1 items-center gap-1.5 rounded-md px-2 text-left hover:text-ink">
          <ChevronRight size={12} className={`transition-transform duration-[120ms] ${folded ? "" : "rotate-90"}`} />
          {title}
        </button>
        {action}
      </div>
      {folded ? null : <div className="pb-1">{children}</div>}
    </section>
  );
}

/** One read-only line in the rail, in the same grid as an editable field. */
export function RailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[132px_1fr] items-start gap-2 rounded-md px-2 py-1 text-[13px]">
      <span className="truncate pt-0.5 text-[12px] text-muted">{label}</span>
      <div className="min-w-0 px-1 py-0.5 break-words text-ink">{children ?? <span className="text-faint">—</span>}</div>
    </div>
  );
}

export type RelatedRow = { id: string; name: string; sub?: string | null; tag?: React.ReactNode; onOpen: () => void };

/** A short list of related records in the rail: a company, its people, its opportunities. */
export function RelatedList({ id, title, rows, extra }: { id: string; title: string; rows: RelatedRow[]; extra?: React.ReactNode }) {
  const [all, setAll] = useState(false);
  if (!rows.length) return null;
  const shown = all ? rows : rows.slice(0, 5);
  return (
    <FieldGroup id={`related:${id}`} title={`${title} [${rows.length}]`} action={extra}>
      <ul>
        {shown.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={r.onOpen} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-hover">
              <Avatar label={r.name} size={22} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{r.name}</span>
                {r.sub ? <span className="block truncate text-[12px] text-faint">{r.sub}</span> : null}
              </span>
              {r.tag}
            </button>
          </li>
        ))}
      </ul>
      {rows.length > 5 ? (
        <button type="button" onClick={() => setAll(!all)} className="mt-0.5 rounded-md px-2 py-1 text-[12px] font-medium text-muted hover:bg-hover hover:text-ink">
          {all ? "Show less" : `Show all ${rows.length}`}
        </button>
      ) : null}
    </FieldGroup>
  );
}
