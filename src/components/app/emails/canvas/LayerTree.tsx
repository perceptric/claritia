"use client";

// The Layout tab of the canvas's panel (docs/email-canvas-b2.md section 4): the email as a tree, Body › Container ›
// Section › Column › blocks. Click picks on the canvas, hover outlines there. Drag a row to reorder it (a green line
// shows where it lands; sections only move among sections; Escape cancels). Keys: ↑ and ↓ through rows, ← and → close
// and open, Enter picks, Alt+Shift+↑ and ↓ move, Delete removes. Right-click or ⋯ for Duplicate, Delete and Hide.

import { useEffect, useMemo, useRef, useState } from "react";
import { KIND_LABEL, type Drop, type Layer, type LayerKind } from "@/lib/design/email/tree";
import { AlignLeft, Box, ChevronDown, CircleDot, Grid, Layers, ListIcon, Mail, Minus, MoreHorizontal, TypeIcon } from "../../../Icons";
import { Popover } from "../../FilterBar";

type Row = { layer: Layer; depth: number; key: string; parent: string | null; section: number; column?: string; index?: number; count?: number };

const ICON: Partial<Record<LayerKind, (p: { size: number }) => React.ReactNode>> = {
  body: Mail,
  container: Box,
  section: Layers,
  column: Grid,
  heading: TypeIcon,
  text: AlignLeft,
  list: ListIcon,
  quote: AlignLeft,
  button: CircleDot,
  meeting: CircleDot,
  divider: Minus,
  spacer: Minus,
};

/** The rows as shown: open layers list their children. Keys are unique even where Body and Container share an id. */
function flatten(root: Layer, open: (key: string) => boolean): Row[] {
  const out: Row[] = [];
  const walk = (l: Layer, depth: number, key: string, parent: string | null, section: number, column?: string, index?: number) => {
    const col = l.kind === "column" ? l.id : l.kind === "section" ? l.column : undefined;
    out.push({ layer: l, depth, key, parent, section, ...(column ? { column, index } : {}), ...(col ? { count: l.children.length } : {}) });
    if (!l.children.length || !open(key)) return;
    l.children.forEach((c, i) => {
      const sec = c.kind === "section" ? i : section;
      walk(c, depth + 1, `${key}/${c.kind === "container" ? "c" : c.id}`, l.id, sec, c.kind === "column" || c.kind === "section" ? undefined : (col ?? undefined), i);
    });
  };
  walk(root, 0, "b", null, -1);
  return out;
}

export function LayerTree({
  tree,
  picked,
  readOnly,
  dot,
  onPick,
  onHover,
  onDrop,
  onStep,
  onDelete,
  onDuplicate,
  onHide,
}: {
  tree: Layer;
  picked: { id: string; part: string | null } | null;
  readOnly: boolean;
  /** A button's fill, for its dot. */
  dot: (id: string) => string | undefined;
  onPick: (id: string, part: "body" | "content" | null) => void;
  onHover: (id: string | null) => void;
  onDrop: (id: string, drop: Drop) => void;
  onStep: (id: string, dir: 1 | -1) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onHide: (id: string, on: "phone" | "desktop") => void;
}) {
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const rows = useMemo(() => flatten(tree, (k) => !closed.has(k)), [tree, closed]);
  const isPicked = (r: Row) => !!picked && picked.id === r.layer.id && (r.layer.id !== "email" || (picked.part ?? "content") === r.layer.part);
  const [focus, setFocus] = useState<string | null>(null);
  const focusKey = focus && rows.some((r) => r.key === focus) ? focus : (rows.find(isPicked)?.key ?? rows[0]?.key ?? null);
  const list = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; row: Row } | null>(null);
  const [drag, setDrag] = useState<{ row: Row; y0: number; on: boolean; drop: Drop | null; lineY: number; lineX: number } | null>(null);

  // The picked row scrolls into view.
  const pickedKey = rows.find(isPicked)?.key;
  useEffect(() => {
    if (!pickedKey) return;
    list.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(pickedKey)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [pickedKey]);

  const toggle = (k: string, open?: boolean) =>
    setClosed((s) => {
      const n = new Set(s);
      const shut = open === undefined ? !n.has(k) : !open;
      if (shut) n.add(k);
      else n.delete(k);
      return n;
    });
  const focusRow = (k: string) => {
    setFocus(k);
    list.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(k)}"]`)?.focus();
  };
  const movable = (r: Row) => !readOnly && (r.layer.kind === "section" || !!r.column);

  const onKey = (e: React.KeyboardEvent, r: Row) => {
    const i = rows.findIndex((x) => x.key === r.key);
    if (e.altKey && e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      if (movable(r)) onStep(r.layer.id, e.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = rows[i + (e.key === "ArrowDown" ? 1 : -1)];
      if (n) focusRow(n.key);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (r.layer.children.length && closed.has(r.key)) toggle(r.key, true);
      else if (rows[i + 1]?.parent === r.layer.id) focusRow(rows[i + 1]!.key);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (r.layer.children.length && !closed.has(r.key)) toggle(r.key, false);
      else {
        const up = rows.slice(0, i).reverse().find((x) => x.depth === r.depth - 1);
        if (up) focusRow(up.key);
      }
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onPick(r.layer.id, r.layer.part);
    } else if ((e.key === "Delete" || e.key === "Backspace") && movable(r)) {
      e.preventDefault();
      onDelete(r.layer.id);
    }
    e.stopPropagation();
  };

  // Dragging a row: past 4 px it starts; the row under the pointer says where it lands.
  useEffect(() => {
    if (!drag) return;
    const host = list.current;
    const move = (e: PointerEvent) => {
      if (!host) return;
      if (!drag.on && Math.abs(e.clientY - drag.y0) < 4) return;
      const box = host.getBoundingClientRect();
      const els = [...host.querySelectorAll<HTMLElement>("[data-key]")];
      const el = els.find((x) => {
        const b = x.getBoundingClientRect();
        return e.clientY >= b.top && e.clientY < b.bottom;
      });
      const over = el ? rows.find((x) => x.key === el.dataset.key) : undefined;
      let drop: Drop | null = null;
      let lineY = 0;
      let lineX = 0;
      if (el && over) {
        const b = el.getBoundingClientRect();
        const below = e.clientY > b.top + b.height / 2;
        if (drag.row.layer.kind === "section" && over.section >= 0) {
          // Sections land before or after the section the pointer is in.
          const mine = rows.filter((x) => x.section === over.section && x.depth >= 2);
          const first = host.querySelector<HTMLElement>(`[data-key="${CSS.escape(mine[0]!.key)}"]`)!.getBoundingClientRect();
          const last = host.querySelector<HTMLElement>(`[data-key="${CSS.escape(mine[mine.length - 1]!.key)}"]`)!.getBoundingClientRect();
          const after = e.clientY > (first.top + last.bottom) / 2;
          drop = { section: over.section + (after ? 1 : 0) };
          lineY = (after ? last.bottom : first.top) - box.top + host.scrollTop;
          lineX = 2 * 14;
        } else if (drag.row.layer.kind !== "section") {
          if (over.column && over.index !== undefined) {
            drop = { column: over.column, index: over.index + (below ? 1 : 0) };
            lineY = (below ? b.bottom : b.top) - box.top + host.scrollTop;
            lineX = over.depth * 14;
          } else if (over.count !== undefined) {
            const col = over.layer.kind === "column" ? over.layer.id : over.layer.column!;
            drop = { column: col, index: over.count };
            lineY = b.bottom - box.top + host.scrollTop;
            lineX = (over.depth + 1) * 14;
          }
        }
      }
      setDrag({ ...drag, on: true, drop, lineY, lineX });
    };
    const up = () => {
      const d = drag;
      setDrag(null);
      if (d.on && d.drop) onDrop(d.row.layer.id, d.drop);
      else if (!d.on) onPick(d.row.layer.id, d.row.layer.part);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setDrag(null);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", key, true);
    };
  });

  const items = (r: Row) => {
    const id = r.layer.id;
    const hide = r.layer.only;
    return [
      { label: "Duplicate", run: () => onDuplicate(id) },
      { label: hide === "desktop" ? "Show on phones" : "Hide on phones", run: () => onHide(id, "phone") },
      { label: hide === "phone" ? "Show on desktop" : "Hide on desktop", run: () => onHide(id, "desktop") },
      { label: "Delete", danger: true, run: () => onDelete(id) },
    ];
  };

  return (
    <div ref={list} role="tree" aria-label="Layers" className="relative flex flex-col p-2" onPointerLeave={() => onHover(null)}>
      {rows.map((r) => {
        const l = r.layer;
        const Icon = ICON[l.kind] ?? Box;
        const on = isPicked(r);
        const open = !closed.has(r.key);
        const fill = l.kind === "button" || l.kind === "meeting" ? dot(l.id) : undefined;
        const name = l.kind === "column" ? `Column ${l.words}` : l.component ? `${l.component} (component)` : KIND_LABEL[l.kind];
        const words = l.kind === "column" || l.component ? "" : l.words;
        return (
          <div
            key={r.key}
            data-key={r.key}
            role="treeitem"
            aria-level={r.depth + 1}
            aria-selected={on}
            aria-expanded={l.children.length ? open : undefined}
            tabIndex={focusKey === r.key ? 0 : -1}
            onFocus={() => setFocus(r.key)}
            onKeyDown={(e) => onKey(e, r)}
            onPointerEnter={() => onHover(l.id === "email" ? null : l.id)}
            onPointerDown={(e) => {
              if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
              if (movable(r)) setDrag({ row: r, y0: e.clientY, on: false, drop: null, lineY: 0, lineX: 0 });
              else onPick(l.id, l.part);
            }}
            onContextMenu={(e) => {
              if (!movable(r)) return;
              e.preventDefault();
              setMenu({ anchor: e.currentTarget, row: r });
            }}
            className={`group flex min-h-7 min-w-0 cursor-default items-start gap-1.5 rounded-md py-1 pr-1 text-[12.5px] outline-none select-none focus-visible:shadow-focus ${on ? "bg-signal-pale text-ink" : "text-body hover:bg-hover"} ${drag?.on && drag.row.key === r.key ? "opacity-50" : ""}`}
            style={{ paddingLeft: 4 + r.depth * 14 }}
          >
            {l.children.length ? (
              <button type="button" tabIndex={-1} aria-label={open ? `Close ${name}` : `Open ${name}`} onClick={() => toggle(r.key)} className="flex size-5 shrink-0 items-center justify-center rounded text-muted hover:text-ink">
                <ChevronDown size={11} className={`transition-transform duration-[140ms] motion-reduce:transition-none ${open ? "" : "-rotate-90"}`} />
              </button>
            ) : (
              <span className="size-5 shrink-0" />
            )}
            <span className="mt-0.5 shrink-0 text-muted">
              <Icon size={13} />
            </span>
            <span className="shrink-0 font-medium text-ink">{name}</span>
            {words ? (
              <span title={words} className="line-clamp-2 min-w-0 flex-1 break-words text-muted">
                {words}
              </span>
            ) : (
              <span className="flex-1" />
            )}
            {l.only ? <span className="mt-0.5 shrink-0 rounded-sm bg-paper-deep px-1 text-[11px] text-muted">{l.only === "phone" ? "Phone" : "Desktop"}</span> : null}
            {l.when ? <span className="mt-0.5 shrink-0 rounded-sm bg-paper-deep px-1 text-[11px] text-muted">If</span> : null}
            {fill ? <span aria-hidden="true" className="mt-1 size-2.5 shrink-0 rounded-full shadow-chip" style={{ background: fill }} /> : null}
            {movable(r) ? (
              <button type="button" tabIndex={-1} aria-label={`More for ${name}`} onClick={(e) => setMenu({ anchor: e.currentTarget, row: r })} className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 hover:text-ink">
                <MoreHorizontal size={12} />
              </button>
            ) : null}
          </div>
        );
      })}
      {drag?.on && drag.drop ? <div aria-hidden="true" className="pointer-events-none absolute right-2 h-0.5 rounded-full bg-signal" style={{ top: drag.lineY - 1, left: 8 + drag.lineX }} /> : null}
      {menu ? (
        <Popover anchor={menu.anchor} onClose={() => setMenu(null)} width={200}>
          <div role="menu" className="flex flex-col p-1">
            {items(menu.row).map((i) => (
              <button
                key={i.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(null);
                  i.run();
                }}
                className={`flex min-h-8 items-center rounded-md px-2.5 text-left text-[13px] hover:bg-hover ${i.danger ? "text-rose" : "text-ink"}`}
              >
                {i.label}
              </button>
            ))}
          </div>
        </Popover>
      ) : null}
    </div>
  );
}
