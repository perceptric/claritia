"use client";

// The records table: a sticky name column, columns you drag to reorder and resize, click-to-sort headers, row
// selection and inline editing of every editable field.

import type { SupabaseClient } from "@supabase/supabase-js";
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { shown, valueOf, type AnyField } from "@/lib/records/fields";
import { Check, Plus } from "../../Icons";
import { Avatar, Badge, useKeptScroll } from "../ui";
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
  scrollKey,
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
  /** Where the scroll is kept, so opening a record and coming back finds the same place. */
  scrollKey?: string;
}) {
  const [editing, setEditing] = useState<{ id: string; key: string } | null>(null);
  const keepScroll = useKeptScroll(scrollKey ?? "");
  // Row handlers that keep one identity, so a row redraws only when its own data or state changes.
  const live = useRef({ onToggle, onOpen, onSave, nameExtra });
  useLayoutEffect(() => {
    live.current = { onToggle, onOpen, onSave, nameExtra };
  });
  const toggle = useCallback((id: string) => live.current.onToggle(id), []);
  const open = useCallback((r: Row) => live.current.onOpen(r), []);
  const save = useCallback((r: Row, f: AnyField, v: unknown) => live.current.onSave(r, f, v), []);
  const extra = useCallback((r: Row) => live.current.nameExtra?.(r), []);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const resizing = useRef<{ key: string; x: number; w: number } | null>(null);
  const byKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);
  const shown = useMemo(() => columns.filter((c) => byKey.has(c.key) && c.key !== "name" && !byKey.get(c.key)!.hidden), [columns, byKey]);
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
    <div ref={scrollKey ? keepScroll : undefined} className="min-h-0 flex-1 overflow-auto bg-card">
      <table className="w-max min-w-full table-fixed border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="sticky top-0 left-0 z-30 h-10 w-10 border-b border-line bg-card pl-3">
              <CheckBox on={pageAll || allMatching} label="Select this page" onClick={onTogglePage} />
            </th>
            <th className="sticky top-0 left-10 z-30 h-10 w-[280px] border-r border-b border-r-line-light border-b-line bg-card px-2 text-left text-[12px] font-medium whitespace-nowrap text-faint">
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
                  className={`sticky top-0 z-20 h-10 cursor-grab border-r border-b border-r-line-light border-b-line bg-card px-2 text-left text-[12px] font-medium whitespace-nowrap text-faint ${overKey === c.key && dragKey !== c.key ? "shadow-[inset_2px_0_0_var(--color-ink)]" : ""}`}
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
            <th className="sticky top-0 z-20 h-10 border-b border-line bg-card px-2 text-left">
              {onAddField ? (
                <button type="button" onClick={onAddField} aria-label="Add field" title="Add field" className="press flex size-7 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink">
                  <Plus size={14} />
                </button>
              ) : null}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <TableRow
              key={r.id}
              r={r}
              on={allMatching || selected.has(r.id)}
              cols={shown}
              byKey={byKey}
              editingKey={editing?.id === r.id ? editing.key : null}
              setEditing={setEditing}
              sb={sb}
              wsId={wsId}
              onToggle={toggle}
              onOpen={open}
              onSave={save}
              nameExtra={nameExtra ? extra : undefined}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One table row. Memoized: selecting, editing or saving one row redraws only that row. */
const TableRow = memo(function TableRow({
  r,
  on,
  cols,
  byKey,
  editingKey,
  setEditing,
  sb,
  wsId,
  onToggle,
  onOpen,
  onSave,
  nameExtra,
}: {
  r: Row;
  on: boolean;
  cols: Column[];
  byKey: Map<string, AnyField>;
  editingKey: string | null;
  setEditing: (e: { id: string; key: string } | null) => void;
  sb: SupabaseClient;
  wsId: string;
  onToggle: (id: string) => void;
  onOpen: (r: Row) => void;
  onSave: (r: Row, f: AnyField, v: unknown) => Promise<void>;
  nameExtra?: (r: Row) => React.ReactNode;
}) {
  const links = (r.links ?? {}) as Record<string, Link[]>;
  return (
    <tr className={`group transition-colors duration-[120ms] ${on ? "bg-hover" : "hover:bg-hover"}`}>
      <td className={`sticky left-0 z-10 h-10 w-10 border-b border-line-light pl-3 ${on ? "bg-paper" : "bg-card group-hover:bg-paper"}`}>
        <CheckBox
          on={on}
          label="Select"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(r.id);
          }}
        />
      </td>
      <td onClick={() => onOpen(r)} className={`sticky left-10 z-10 h-10 w-[280px] cursor-pointer border-r border-b border-line-light px-2 text-[13px] ${on ? "bg-paper" : "bg-card group-hover:bg-paper"}`}>
        <span className="flex items-center gap-2">
          <Avatar label={displayName(r)} size={22} />
          <span className="min-w-0 truncate font-medium">{displayName(r)}</span>
          {nameExtra?.(r)}
        </span>
      </td>
      {cols.map((c) => {
        const f = byKey.get(c.key)!;
        const active = editingKey === c.key;
        const value = valueOf(r, c.key);
        return (
          <td
            key={c.key}
            onClick={() => (f.edit ? setEditing({ id: r.id, key: c.key }) : onOpen(r))}
            className={`h-10 overflow-hidden border-r border-b border-line-light px-2 text-[13px] whitespace-nowrap ${f.edit ? "cursor-text hover:outline hover:outline-1 hover:-outline-offset-1 hover:outline-line-strong" : "cursor-pointer"} ${active ? "px-1" : ""}`}
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
      <td className="h-10 border-b border-line-light" />
    </tr>
  );
});

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
  // Cards sorted into lanes in one pass, again only when the rows or the grouping change.
  const { lanes, byLane } = useMemo(() => {
    const known = new Set(group.options.map((o) => o.value));
    const byLane = new Map<string, Row[]>();
    for (const r of rows) {
      const v = String(valueOf(r, group.key) ?? "");
      const l = byLane.get(v);
      if (l) l.push(r);
      else byLane.set(v, [r]);
    }
    const extra = [...byLane.keys()].filter((v) => v && !known.has(v));
    return { lanes: [...group.options, ...extra.map((v) => ({ value: v, label: v })), { value: "", label: "No value" }], byLane };
  }, [rows, group]);
  const live = useRef({ onOpen });
  useLayoutEffect(() => {
    live.current = { onOpen };
  });
  const open = useCallback((r: Row) => live.current.onOpen(r), []);
  return (
    <div className="flex min-h-full gap-3 overflow-x-auto p-4 md:p-5">
      {lanes.map((lane) => {
        const items = byLane.get(lane.value) ?? [];
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
              {sum && total ? <span className="ml-auto text-[12px] text-body tabular-nums">{shown(sum, total)}</span> : null}
              <span className={`${sum && total ? "" : "ml-auto "}text-[12px] text-faint tabular-nums`}>{(counts[lane.value] ?? items.length).toLocaleString("en-US")}</span>
            </header>
            <ul className="flex min-h-16 flex-col gap-2 px-2 pb-2">
              {items.map((r) => (
                <BoardCard key={r.id} r={r} cardFields={cardFields} dragging={dragId === r.id} setDragId={setDragId} onOpen={open} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** One card on the board. Memoized: dragging one card doesn't redraw the other thousand. */
const BoardCard = memo(function BoardCard({ r, cardFields, dragging, setDragId, onOpen }: { r: Row; cardFields: AnyField[]; dragging: boolean; setDragId: (id: string | null) => void; onOpen: (r: Row) => void }) {
  return (
    <li
      draggable
      onDragStart={() => setDragId(r.id)}
      onDragEnd={() => setDragId(null)}
      onClick={() => onOpen(r)}
      className={`lift cursor-grab rounded-lg border border-line bg-card p-3.5 transition-[transform,rotate,box-shadow,opacity] duration-[320ms] ease-out [contain-intrinsic-size:auto_72px] [content-visibility:auto] active:cursor-grabbing ${dragging ? "rotate-2 opacity-90 shadow-float" : ""}`}
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
  );
});
