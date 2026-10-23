"use client";

// The records table: a sticky name column, columns you drag to reorder and resize, click-to-sort headers, row
// selection and inline editing of every editable field.

import type { SupabaseClient } from "@supabase/supabase-js";
import { useRef, useState } from "react";
import { shown, valueOf, type AnyField } from "@/lib/records/fields";
import { Check, Plus } from "../../Icons";
import { Avatar, Badge } from "../ui";
import { FieldEditor, FieldValue, type Link } from "./FieldInput";

export type Row = Record<string, unknown> & { id: string };
export type Column = { key: string; width?: number };

const MIN = 80;
const MAX = 600;
export const DEFAULT_WIDTH = 170;

export function displayName(r: Row): string {
  const n = valueOf(r, "name");
  return (typeof n === "string" && n) || (r.email as string) || (r.domain as string) || "—";
}

export function CheckBox({ on, label, onClick, round = false }: { on: boolean; label: string; onClick: (e: React.MouseEvent) => void; round?: boolean }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`press flex shrink-0 items-center justify-center border transition-colors duration-[140ms] ${round ? "size-5 rounded-full" : "size-4 rounded-[5px]"} ${on ? "border-ink bg-ink text-paper" : "border-line-strong bg-card hover:border-ink"}`}
    >
      {on ? <Check size={round ? 12 : 11} className="anim-pop" /> : null}
    </button>
  );
}

export function RecordTable({
  sb,
  wsId,
  fields,
  columns,
  rows,
  sort,
  onSort,
  selected,
  allMatching,
  onToggle,
  onTogglePage,
  onOpen,
  onSave,
  onColumns,
  nameExtra,
  onAddField,
}: {
  sb: SupabaseClient;
  wsId: string;
  fields: AnyField[];
  columns: Column[];
  rows: Row[];
  sort: { key: string; desc: boolean };
  onSort: (key: string) => void;
  selected: Set<string>;
  allMatching: boolean;
  onToggle: (id: string) => void;
  onTogglePage: () => void;
  onOpen: (r: Row) => void;
  onSave: (r: Row, f: AnyField, v: unknown) => Promise<void>;
  onColumns: (c: Column[]) => void;
  nameExtra?: (r: Row) => React.ReactNode;
  /** The + at the end of the header: a new field, which joins the table as a column. */
  onAddField?: () => void;
}) {
  const [editing, setEditing] = useState<{ id: string; key: string } | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const resizing = useRef<{ key: string; x: number; w: number } | null>(null);
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const shown = columns.filter((c) => byKey.has(c.key) && c.key !== "name" && !byKey.get(c.key)!.hidden);
  const pageAll = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const startResize = (e: React.MouseEvent, key: string, w: number) => {
    e.preventDefault();
    e.stopPropagation();
    resizing.current = { key, x: e.clientX, w };
    let last = w;
    const move = (ev: MouseEvent) => {
      if (!resizing.current) return;
      last = Math.min(MAX, Math.max(MIN, resizing.current.w + ev.clientX - resizing.current.x));
      const th = document.querySelector<HTMLElement>(`[data-col="${CSS.escape(key)}"]`);
      if (th) th.style.width = `${last}px`;
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      resizing.current = null;
      onColumns(columns.map((c) => (c.key === key ? { ...c, width: last } : c)));
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const drop = (target: string) => {
    if (!dragKey || dragKey === target) return;
    const keys = columns.map((c) => c.key);
    const from = keys.indexOf(dragKey);
    const to = keys.indexOf(target);
    if (from < 0 || to < 0) return;
    const next = [...columns];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onColumns(next);
  };

  const sortable = (f: AnyField) => !!f.sort;
  const arrow = (f: AnyField) => (sort.key === f.sort ? (sort.desc ? " ↓" : " ↑") : "");
  const nameField = byKey.get("name");

  return (
    <div className="min-h-0 overflow-auto rounded-2xl border border-line bg-card">
      <table className="w-max min-w-full table-fixed border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="sticky top-0 left-0 z-30 h-11 w-10 border-b border-line bg-card pl-4">
              <CheckBox on={pageAll || allMatching} label="Select this page" onClick={onTogglePage} />
            </th>
            <th className="sticky top-0 left-10 z-30 h-11 w-[280px] border-r border-b border-line bg-card px-4 text-left font-mono text-[11.5px] font-normal whitespace-nowrap text-muted">
              <button type="button" onClick={() => onSort("name")} className="hover:text-ink">
                {nameField?.label ?? "Name"}
                {sort.key === "name" ? (sort.desc ? " ↓" : " ↑") : ""}
              </button>
            </th>
            {shown.map((c) => {
              const f = byKey.get(c.key)!;
              const w = c.width ?? DEFAULT_WIDTH;
              return (
                <th
                  key={c.key}
                  data-col={c.key}
                  draggable
                  onDragStart={(e) => {
                    setDragKey(c.key);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOverKey(c.key);
                  }}
                  onDragLeave={() => setOverKey(null)}
                  onDrop={() => {
                    drop(c.key);
                    setDragKey(null);
                    setOverKey(null);
                  }}
                  onDragEnd={() => {
                    setDragKey(null);
                    setOverKey(null);
                  }}
                  style={{ width: w }}
                  className={`sticky top-0 z-20 h-11 cursor-grab border-b border-line bg-card px-4 text-left font-mono text-[11.5px] font-normal whitespace-nowrap text-muted ${overKey === c.key && dragKey !== c.key ? "shadow-[inset_2px_0_0_var(--color-ink)]" : ""}`}
                >
                  {sortable(f) ? (
                    <button type="button" onClick={() => onSort(f.sort!)} title={f.config.description || undefined} className="max-w-full truncate hover:text-ink">
                      {f.label}
                      {arrow(f)}
                    </button>
                  ) : (
                    <span className="block truncate" title={f.config.description || undefined}>
                      {f.label}
                    </span>
                  )}
                  <span
                    role="separator"
                    aria-label={`Resize ${f.label}`}
                    onMouseDown={(e) => startResize(e, c.key, w)}
                    className="absolute inset-y-2 right-0 w-1.5 cursor-col-resize rounded-full hover:bg-line-strong"
                  />
                </th>
              );
            })}
            <th className="sticky top-0 z-20 h-11 w-full border-b border-line bg-card px-2 text-left">
              {onAddField ? (
                <button type="button" onClick={onAddField} aria-label="Add field" title="Add field" className="press flex size-8 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink">
                  <Plus size={14} />
                </button>
              ) : null}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const on = allMatching || selected.has(r.id);
            const links = (r.links ?? {}) as Record<string, Link[]>;
            return (
              <tr key={r.id} className={`group transition-colors duration-[140ms] ${on ? "bg-brand-pale" : "hover:bg-paper"}`}>
                <td className={`sticky left-0 z-10 h-14 w-10 border-b border-line pl-4 group-last:border-b-0 ${on ? "bg-brand-pale" : "bg-card group-hover:bg-paper"}`}>
                  <CheckBox
                    on={on}
                    label="Select"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggle(r.id);
                    }}
                  />
                </td>
                <td
                  onClick={() => onOpen(r)}
                  className={`sticky left-10 z-10 h-14 w-[280px] cursor-pointer border-r border-b border-line px-4 text-[13.5px] group-last:border-b-0 ${on ? "bg-brand-pale" : "bg-card group-hover:bg-paper"}`}
                >
                  <span className="flex items-center gap-3">
                    <Avatar label={displayName(r)} size={28} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{displayName(r)}</span>
                      {r.email && displayName(r) !== r.email ? <span className="truncate text-[12px] text-faint">{String(r.email)}</span> : null}
                    </span>
                    {nameExtra?.(r)}
                  </span>
                </td>
                {shown.map((c) => {
                  const f = byKey.get(c.key)!;
                  const active = editing?.id === r.id && editing.key === c.key;
                  const value = valueOf(r, c.key);
                  return (
                    <td
                      key={c.key}
                      onClick={() => (f.edit ? setEditing({ id: r.id, key: c.key }) : onOpen(r))}
                      className={`h-14 overflow-hidden border-b border-line px-4 text-[13.5px] whitespace-nowrap group-last:border-b-0 ${f.edit ? "cursor-text" : "cursor-pointer"} ${active ? "px-1.5" : ""}`}
                    >
                      {active ? (
                        <FieldEditor
                          sb={sb}
                          wsId={wsId}
                          field={f}
                          value={value}
                          links={links[c.key.slice(2)]}
                          compact
                          onCancel={() => setEditing(null)}
                          onSave={(v) => {
                            setEditing(null);
                            void onSave(r, f, v);
                          }}
                        />
                      ) : (
                        <span className="block truncate">
                          <FieldValue field={f} value={value} links={links[c.key.slice(2)]} />
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className="h-14 border-b border-line group-last:border-b-0" />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** A board: one column per pick list value, cards you drag between them. */
export function RecordBoard({
  group,
  rows,
  counts,
  cardFields,
  onOpen,
  onMove,
  sum,
}: {
  group: { key: string; label: string; options: { value: string; label: string; kind?: string }[] };
  rows: Row[];
  counts: Record<string, number>;
  cardFields: AnyField[];
  /** A currency or number field to total in each lane's header, like a pipeline's amount per stage. */
  sum?: AnyField;
  onOpen: (r: Row) => void;
  onMove: (r: Row, value: string | null) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const known = new Set(group.options.map((o) => o.value));
  const extra = [...new Set(rows.map((r) => String(valueOf(r, group.key) ?? "")).filter((v) => v && !known.has(v)))];
  const lanes = [...group.options, ...extra.map((v) => ({ value: v, label: v })), { value: "", label: "No value" }];
  return (
    <div className="flex min-h-full gap-3 overflow-x-auto p-4 md:p-5">
      {lanes.map((lane) => {
        const items = rows.filter((r) => String(valueOf(r, group.key) ?? "") === lane.value);
        const total = sum ? items.reduce((t, r) => t + (Number(valueOf(r, sum.key)) || 0), 0) : 0;
        return (
          <section
            key={lane.value || "__none"}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(lane.value);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={() => {
              const r = rows.find((x) => x.id === dragId);
              if (r && String(valueOf(r, group.key) ?? "") !== lane.value) onMove(r, lane.value || null);
              setDragId(null);
              setOver(null);
            }}
            className={`flex w-72 shrink-0 flex-col rounded-2xl transition-colors duration-[140ms] ${over === lane.value && dragId ? "bg-paper ring-1 ring-line-strong" : "bg-paper-deep"}`}
          >
            <header className="flex h-12 items-center gap-2 px-3.5 pt-1">
              <Badge tone={"kind" in lane && lane.kind === "won" ? "green" : "kind" in lane && lane.kind === "lost" ? "red" : "gray"}>{lane.label}</Badge>
              {sum && total ? <span className="ml-auto font-mono text-[11.5px] text-body tabular-nums">{shown(sum, total)}</span> : null}
              <span className={`${sum && total ? "" : "ml-auto "}font-mono text-[11px] text-faint tabular-nums`}>{(counts[lane.value] ?? items.length).toLocaleString("en-US")}</span>
            </header>
            <ul className="flex min-h-16 flex-col gap-2 px-2 pb-2">
              {items.map((r) => (
                <li
                  key={r.id}
                  draggable
                  onDragStart={() => setDragId(r.id)}
                  onDragEnd={() => setDragId(null)}
                  onClick={() => onOpen(r)}
                  className={`lift cursor-grab rounded-lg border border-line bg-card p-3.5 transition-[transform,rotate,box-shadow,opacity] duration-[320ms] ease-out active:cursor-grabbing ${dragId === r.id ? "rotate-2 opacity-90 shadow-float" : ""}`}
                >
                  <p className="flex items-center gap-2 text-[13px] font-medium">
                    <Avatar label={displayName(r)} size={22} />
                    <span className="min-w-0 truncate">{displayName(r)}</span>
                  </p>
                  {cardFields.map((f) => {
                    const v = valueOf(r, f.key);
                    if (v == null || v === "" || (Array.isArray(v) && !v.length)) return null;
                    return (
                      <p key={f.key} className="mt-1.5 truncate text-[12px] text-muted">
                        <FieldValue field={f} value={v} links={((r.links ?? {}) as Record<string, Link[]>)[f.key.slice(2)]} />
                      </p>
                    );
                  })}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
