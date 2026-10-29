"use client";

// The Design tab (docs/form-studio.md Part 2): the left rail (Elements, Layers, Theme), the canvas and the
// inspector. It owns the selection, the keys and dragging. Every change is an op through `apply`, so undo, redo and
// saving work the same as everywhere else; a drop or a nudge is one step on the undo stack.

import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragMoveEvent, type DragStartEvent } from "@dnd-kit/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cleanTokens, type Tokens } from "@/lib/forms/brand";
import type { Op } from "@/lib/forms/ops";
import { allFields, newId, type Form } from "@/lib/forms/schema";
import type { CustomField } from "@/lib/records/fields";
import { designFonts, formCss } from "@/lib/design/form";
import { readSystem, type DesignSystem, type State } from "@/lib/design/model";
import type { PartKey } from "@/lib/design/parts";
import type { Edit } from "@/lib/design/edit";
import { FormCanvas, type Editing, type Picked } from "./FormCanvas";
import { StylePanel } from "./StylePanel";
import { StyleGuide } from "./StyleGuide";
import { StylesPanel, VariablesPanel, type StylesLive } from "./DesignPanels";
import type { DesignDraft } from "./useDesignDraft";
import { FormDesign, type ThemeProps } from "./FormDesign";
import { Elements } from "./Elements";
import { Inspector, type InspectorProps } from "./Inspector";
import { Layers as LayersPanel } from "./Layers";
import { addOp, canSit, fontUrl, duplicateOp, iconFor, nameOf, nudge, planDrop, type Device, type Dragged, type ElementDef, type Target } from "./editorModel";
import { CheckSquare, Diamond, ElementIcon, Hash, Layers, Palette, PlusSquare } from "./icons";
import { CheckList } from "../email/CheckList";
import { checkFormDesign } from "@/lib/design/check";
import type { SourceRow } from "./shared";

export type Panel = "elements" | "layers" | "theme" | "styles" | "variables" | "checks";
type DragData = { kind: "element"; def: ElementDef } | { kind: "field"; id: string };
type Line = { left: number; top: number; width: number; height: number };
type Drop = { target: Target; line: Line } | null;

export type EditorProps = {
  form: Form;
  apply: (op: Op | Op[]) => void;
  custom: CustomField[];
  sources: SourceRow[];
  tokens: Partial<Tokens>;
  device: Device;
  zoom: "fit" | number;
  theme: ThemeProps;
  link?: InspectorProps["link"];
  /** The design system's draft (the brand kit's), which the canvas draws with and the Style panel edits. */
  draft: DesignDraft;
  hasKit: boolean;
  applyStyles: (e: Edit, merge?: string) => void;
  applySystem: (system: DesignSystem, merge?: string) => void;
  styles: Omit<StylesLive, "openGuide">;
  /** The rail panel open at first (Elements unless set), and a panel to open from outside (the Style button). */
  startPanel?: Panel | null;
  openPanel?: { id: Panel; n: number };
};

const BP = { desktop: "base", tablet: "tablet", phone: "phone" } as const;

export function Editor({ form, apply, custom, sources, tokens, device, zoom, theme, link, draft, hasKit, applyStyles, applySystem, styles, startPanel, openPanel }: EditorProps) {
  const [guide, setGuide] = useState(false);
  const live: StylesLive = { ...styles, openGuide: () => setGuide(true) };
  const system = draft.system;
  const [side, setSide] = useState<"settings" | "style">("settings");
  const [panel, setPanel] = useState<Panel | null>(startPanel === undefined ? "elements" : startPanel);
  const [opened, setOpened] = useState(openPanel?.n ?? 0);
  if (openPanel && openPanel.n !== opened) {
    setOpened(openPanel.n);
    setPanel(openPanel.id);
  }
  const [picked, setPicked] = useState<string[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [part, setPart] = useState<Picked>(null);
  const [state, setState] = useState<State | undefined>(undefined);
  const [drag, setDrag] = useState<{ data: DragData; id: string } | null>(null);
  const [drop, setDropState] = useState<Drop>(null);
  // dnd-kit calls the handlers it was given when the drag began, so the drag and its target also live in refs.
  const dragRef = useRef<{ data: DragData; id: string } | null>(null);
  const dropRef = useRef<Drop>(null);
  const setDrop = (d: Drop) => {
    dropRef.current = d;
    setDropState(d);
  };
  const start = useRef({ x: 0, y: 0 });
  const t = useMemo(() => cleanTokens(tokens).tokens, [tokens]);
  const css = useMemo(() => {
    try {
      return formCss(form, t, system, { device: BP[device], preview: true });
    } catch {
      return "";
    }
  }, [form, t, system, device]);
  const checks = useMemo(() => {
    try {
      return checkFormDesign(readSystem(system, t), form, t);
    } catch {
      return [];
    }
  }, [system, form, t]);
  const fontKey = fontUrl(designFonts(system, form.design));
  const fonts = useMemo(() => (fontKey ? [fontKey] : []), [fontKey]);
  const fields = allFields(form);
  // A selection the form no longer has (after an undo) falls away.
  const selected = picked.filter((id) => fields.some((f) => f.id === id));
  const primary = selected.length === 1 ? selected[0] : null;
  const shownPart = part && (part.id === "form" || selected.includes(part.id)) ? part : null;

  const select = useCallback((id: string, add: boolean) => {
    setEditing(null);
    setPart(add ? null : { id, part: "field" });
    setPicked((cur) => (add ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : [id]));
  }, []);
  const pick = useCallback(
    (id: string, p: PartKey, add: boolean) => {
      if (id !== "form") {
        select(id, add);
        if (!add) setPart({ id, part: p });
        return;
      }
      setEditing(null);
      setPicked([]);
      setPart({ id, part: p });
    },
    [select],
  );
  const clear = useCallback(() => {
    setEditing(null);
    setPicked([]);
    setPart(null);
  }, []);

  const latest = useRef(form);
  useEffect(() => {
    latest.current = form;
  }, [form]);
  const duplicate = useCallback(
    (id: string) => {
      const f = allFields(latest.current).find((x) => x.id === id);
      if (!f) return;
      const nid = newId();
      apply(duplicateOp(f, nid));
      setPicked([nid]);
    },
    [apply],
  );
  const remove = useCallback(
    (ids: string[]) => {
      const ok = ids.filter((id) => allFields(latest.current).find((f) => f.id === id)?.key !== "email");
      if (!ok.length) return;
      apply(ok.map((id) => ({ op: "remove_field", id })));
      setPicked((cur) => cur.filter((x) => !ok.includes(x)));
    },
    [apply],
  );
  const move = useCallback(
    (id: string, dir: -1 | 1) => {
      const op = nudge(latest.current, id, dir);
      if (op) apply(op);
    },
    [apply],
  );
  const add = (def: ElementDef) => {
    const id = newId();
    apply(addOp(form, def.make(form), id, selected[selected.length - 1] ?? null));
    setPicked([id]);
  };
  const commit = (e: NonNullable<Editing>, text: string) => {
    setEditing(null);
    if (e.kind !== "field") {
      if (e.kind === "title") apply({ op: "set_copy", title: text });
      else if (e.kind === "intro") apply({ op: "set_copy", intro: text });
      else if (text.trim()) apply({ op: "set_copy", submit: text.trim() });
      return;
    }
    const f = fields.find((x) => x.id === e.id);
    if (!f) return;
    if (f.type === "heading" || f.type === "paragraph") {
      if (text !== (f.content?.text ?? "")) apply({ op: "update_field", id: f.id, patch: { content: { ...f.content, text } } });
    } else if (text.trim() && text !== f.label) apply({ op: "update_field", id: f.id, patch: { label: text.trim() } });
  };

  // A field just added or picked in Layers comes into view.
  useEffect(() => {
    if (!primary) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.querySelector(`[data-fid="${primary}"]`)?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [primary]);

  // Keys: Backspace and Delete remove, Cmd+D copies, Cmd+Up and Cmd+Down move, Up and Down pick the next field,
  // Enter edits the label, Escape lets go. Never while typing or while a dialog is open.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("input, textarea, select, [contenteditable], [role=listbox], [role=dialog], [role=slider]")) return;
      if (document.querySelector("[aria-modal=true]")) return;
      const mod = e.metaKey || e.ctrlKey;
      const list = allFields(latest.current);
      if (e.key === "Escape") {
        if (selected.length || part) {
          e.preventDefault();
          clear();
        }
        return;
      }
      if (!selected.length) return;
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        remove(selected);
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (primary) duplicate(primary);
      } else if (mod && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        if (primary) move(primary, e.key === "ArrowUp" ? -1 : 1);
      } else if (!mod && (e.key === "ArrowUp" || e.key === "ArrowDown") && primary) {
        e.preventDefault();
        const i = list.findIndex((f) => f.id === primary) + (e.key === "ArrowDown" ? 1 : -1);
        if (list[i]) setPicked([list[i].id]);
      } else if (e.key === "Enter" && primary) {
        const f = list.find((x) => x.id === primary);
        if (f && f.type !== "divider" && f.type !== "image" && f.type !== "hidden") {
          e.preventDefault();
          setEditing({ kind: "field", id: primary });
        }
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [selected, primary, part, clear, remove, duplicate, move]);

  // Dragging ------------------------------------------------------------------------------------------------------
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const dragged = (d: DragData, id: string): Dragged => (d.kind === "element" ? { kind: "new", id, input: d.def.make(latest.current) } : { kind: "move", id: d.id });
  const onStart = (e: DragStartEvent) => {
    const data = e.active.data.current as DragData;
    const ev = e.activatorEvent as PointerEvent;
    start.current = { x: ev.clientX ?? 0, y: ev.clientY ?? 0 };
    setEditing(null);
    dragRef.current = { data, id: data.kind === "element" ? newId() : data.id };
    setDrag(dragRef.current);
  };
  const onMove = (e: DragMoveEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const p = { x: start.current.x + e.delta.x, y: start.current.y + e.delta.y };
    const type = drag.data.kind === "element" ? drag.data.def.make(latest.current).type : allFields(latest.current).find((f) => f.id === drag.id)?.type;
    setDrop(hitCanvas(p, latest.current, drag.id, !!type && canSit(type)) ?? hitLayers(p, latest.current));
  };
  const onEnd = () => {
    const d = dragRef.current;
    const target = dropRef.current?.target;
    dragRef.current = null;
    setDrag(null);
    setDrop(null);
    if (!d || !target) return;
    const item = dragged(d.data, d.id);
    const ops = planDrop(latest.current, item, target);
    if (!ops.length) return;
    apply(ops);
    setPicked([item.id]);
  };
  const ghost = drag
    ? drag.data.kind === "element"
      ? { icon: drag.data.def.icon, name: drag.data.def.name }
      : (() => {
          const f = fields.find((x) => x.id === drag.id);
          return f ? { icon: iconFor(f), name: nameOf(f) } : null;
        })()
    : null;

  const rail: { id: Panel; label: string; icon: React.ReactNode }[] = [
    { id: "elements", label: "Elements", icon: <PlusSquare size={16} /> },
    { id: "layers", label: "Layers", icon: <Layers size={16} /> },
    { id: "theme", label: "Theme", icon: <Palette size={16} /> },
    { id: "styles", label: "Styles", icon: <Hash size={16} /> },
    { id: "variables", label: "Variables", icon: <Diamond size={16} /> },
    { id: "checks", label: "Checks", icon: <CheckSquare size={16} /> },
  ];

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onStart}
      onDragMove={onMove}
      onDragEnd={onEnd}
      onDragCancel={() => {
        dragRef.current = null;
        setDrag(null);
        setDrop(null);
      }}
      autoScroll={{ threshold: { x: 0, y: 0.15 } }}
    >
      <div className={`grid h-full min-h-0 grid-rows-[minmax(0,1fr)] ${panel ? "grid-cols-[44px_264px_minmax(0,1fr)_280px]" : "grid-cols-[44px_minmax(0,1fr)_280px]"}`}>
        <nav aria-label="Panels" className="flex flex-col items-center gap-1 border-r border-line bg-card py-2">
          {rail.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-label={r.label}
              title={r.label}
              aria-pressed={panel === r.id}
              onClick={() => setPanel((p) => (p === r.id ? null : r.id))}
              className={`press flex size-8 items-center justify-center rounded-full transition-colors duration-[140ms] ${panel === r.id ? "bg-ink text-paper" : "text-muted hover:bg-hover hover:text-ink"}`}
            >
              {r.icon}
            </button>
          ))}
        </nav>
        {panel ? (
          <aside aria-label={rail.find((r) => r.id === panel)?.label} className="anim-fade flex min-h-0 flex-col border-r border-line bg-card">
            <div className="flex h-11 shrink-0 items-center border-b border-line px-3">
              <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-ink">{rail.find((r) => r.id === panel)?.label}</h2>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {panel === "elements" ? <Elements onAdd={add} /> : null}
              {panel === "layers" ? (
                <LayersPanel
                  form={form}
                  selected={selected}
                  hovered={hovered}
                  dragging={drag?.data.kind === "field" ? drag.id : null}
                  onSelect={select}
                  onHover={setHovered}
                  onDuplicate={duplicate}
                  onRemove={(id) => remove([id])}
                  apply={apply}
                />
              ) : null}
              {panel === "theme" ? <FormDesign {...theme} /> : null}
              {panel === "styles" ? (
                <StylesPanel
                  e={{ system, design: form.design ?? {} }}
                  hasKit={hasKit}
                  onEdit={(e) => applyStyles(e)}
                  onPick={(cid) => {
                    // The first element with the class, styled at the class.
                    const el = Object.entries(form.design?.classes ?? {}).find(([, l]) => l.includes(cid))?.[0];
                    if (el) {
                      setPicked([el]);
                      setPart({ id: el, part: "field" });
                      setSide("style");
                    }
                  }}
                  live={live}
                />
              ) : null}
              {panel === "checks" ? (
                <CheckList
                  notes={checks}
                  onPick={(id) => {
                    if (id && id !== "form") select(id, false);
                    else if (id === "form") pick("form", "button", false);
                    setSide("style");
                  }}
                />
              ) : null}
              {panel === "variables" ? (
                <VariablesPanel e={{ system, design: form.design ?? {} }} tokens={tokens} hasKit={hasKit} onEdit={(e, m) => applyStyles(e, m)} onTheme={() => setPanel("theme")} live={live} />
              ) : null}
            </div>
          </aside>
        ) : null}
        <FormCanvas
          form={form}
          t={t}
          device={device}
          zoom={zoom}
          css={css}
          fonts={fonts}
          selected={selected}
          hovered={hovered}
          dragging={drag?.data.kind === "field" ? drag.id : null}
          editing={editing}
          part={shownPart}
          state={side === "style" ? state : undefined}
          onPick={pick}
          onClear={clear}
          onHover={setHovered}
          onEdit={setEditing}
          onCommit={commit}
          onNudge={move}
          onDuplicate={duplicate}
          onRemove={(id) => remove([id])}
          apply={apply}
        />
        <aside aria-label="Inspector" className="flex min-h-0 flex-col border-l border-line bg-card">
          <div role="tablist" aria-label="Inspector" className="flex h-11 shrink-0 items-center gap-1 border-b border-line px-2">
            {(["settings", "style"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={side === k}
                onClick={() => setSide(k)}
                className={`press h-7 rounded-full px-3 text-[12.5px] font-medium transition-colors duration-[140ms] ${side === k ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
              >
                {k === "settings" ? "Settings" : "Style"}
              </button>
            ))}
            <span className="flex-1" />
          </div>
          <div className={`min-h-0 flex-1 ${side === "style" ? "overflow-y-auto" : ""}`}>
            {side === "settings" ? (
              <Inspector form={form} apply={apply} custom={custom} sources={sources} selected={selected} onDuplicate={duplicate} onRemove={remove} link={link} />
            ) : (
              <StylePanel
                form={form}
                system={system}
                tokens={t}
                bp={BP[device]}
                hasKit={hasKit}
                part={shownPart}
                onPart={setPart}
                state={state}
                onState={setState}
                onEdit={applyStyles}
              />
            )}
          </div>
        </aside>
      </div>
      {drop
        ? createPortal(
            <span
              aria-hidden="true"
              className="pointer-events-none fixed z-[95] rounded-full bg-clay"
              style={{ left: drop.line.left, top: drop.line.top, width: drop.line.width, height: drop.line.height }}
            />,
            document.body,
          )
        : null}
      {guide ? <StyleGuide system={system} tokens={tokens} hasKit={hasKit} bp={BP[device]} onEdit={applySystem} onClose={() => setGuide(false)} /> : null}
      <DragOverlay dropAnimation={null}>
        {ghost ? (
          <div className="anim-pop inline-flex rotate-[1.5deg] items-center gap-2 rounded-full bg-card px-3 py-1.5 text-[12.5px] font-medium text-ink shadow-float">
            <ElementIcon name={ghost.icon} size={13} className="text-muted" />
            {ghost.name}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// Where a drag would land -----------------------------------------------------------------------------------------

type P = { x: number; y: number };
const inside = (p: P, r: DOMRect, pad = 0) => p.x >= r.left - pad && p.x <= r.right + pad && p.y >= r.top - pad && p.y <= r.bottom + pad;
const THICK = 3;

/** Over the canvas: a line between rows, or beside a field to make a row. */
function hitCanvas(p: P, form: Form, dragId: string, sits: boolean): Drop {
  for (const frame of document.querySelectorAll<HTMLElement>("[data-step-frame]")) {
    const fr = frame.getBoundingClientRect();
    if (!inside(p, fr, 24)) continue;
    const si = Number(frame.dataset.stepFrame);
    const grid = frame.querySelector<HTMLElement>("[data-grid]")!.getBoundingClientRect();
    const els = [...frame.querySelectorAll<HTMLElement>("[data-fid]")];
    const ids = els.map((e) => e.dataset.fid!);
    const rects = els.map((e) => e.getBoundingClientRect());
    const hline = (y: number): Line => ({ left: grid.left, top: y - THICK / 2, width: grid.width, height: THICK });
    if (!els.length) return { target: { step: si, index: 0 }, line: hline(grid.top + 4) };
    // Rows as drawn: fields that share a top.
    const rows: number[][] = [];
    rects.forEach((r, i) => {
      const last = rows[rows.length - 1];
      if (last && Math.abs(rects[last[0]].top - r.top) < 4) last.push(i);
      else rows.push([i]);
    });
    const rowTop = (row: number[]) => Math.min(...row.map((i) => rects[i].top));
    const rowBottom = (row: number[]) => Math.max(...row.map((i) => rects[i].bottom));
    const before = (k: number): Drop => ({ target: { step: si, index: rows[k][0] }, line: hline(k === 0 ? rowTop(rows[0]) - 6 : (rowBottom(rows[k - 1]) + rowTop(rows[k])) / 2) });
    const after = (k: number): Drop => ({
      target: { step: si, index: rows[k][rows[k].length - 1] + 1 },
      line: hline(k === rows.length - 1 ? rowBottom(rows[k]) + 6 : (rowBottom(rows[k]) + rowTop(rows[k + 1])) / 2),
    });
    const hit = rects.findIndex((r) => inside(p, r));
    if (hit >= 0) {
      const k = rows.findIndex((row) => row.includes(hit));
      const r = rects[hit];
      const x = (p.x - r.left) / r.width;
      const f = form.steps[si]?.fields.find((ff) => ff.id === ids[hit]);
      const mates = rows[k].filter((i) => ids[i] !== dragId).length;
      if (sits && f && canSit(f.type) && ids[hit] !== dragId && mates < 3 && (x < 0.25 || x > 0.75)) {
        const right = x > 0.75;
        return { target: { step: si, beside: ids[hit], side: right ? "right" : "left" }, line: { left: (right ? r.right + 6 : r.left - 6) - THICK / 2, top: r.top, width: THICK, height: r.height } };
      }
      return p.y < r.top + r.height / 2 ? before(k) : after(k);
    }
    const k = rows.findIndex((row) => p.y < (rowTop(row) + rowBottom(row)) / 2);
    return k >= 0 ? before(k) : after(rows.length - 1);
  }
  return null;
}

/** Over the layers list: between rows, or at the top of a step. */
function hitLayers(p: P, form: Form): Drop {
  const box = document.querySelector<HTMLElement>("[data-layers]");
  if (!box || !inside(p, box.getBoundingClientRect())) return null;
  const rows = [...box.querySelectorAll<HTMLElement>("[data-layer-row]")];
  const line = (r: DOMRect, y: number): Line => ({ left: r.left + 20, top: y - 1, width: r.width - 20, height: 2 });
  for (const head of box.querySelectorAll<HTMLElement>("[data-layer-step]")) {
    const r = head.getBoundingClientRect();
    if (inside(p, r)) return { target: { step: Number(head.dataset.layerStep), index: 0 }, line: line(r, r.bottom) };
  }
  for (const row of rows) {
    const r = row.getBoundingClientRect();
    if (p.y < r.top || p.y > r.bottom) continue;
    const step = Number(row.dataset.step);
    const index = Number(row.dataset.index) + (p.y > r.top + r.height / 2 ? 1 : 0);
    return { target: { step, index }, line: line(r, p.y > r.top + r.height / 2 ? r.bottom : r.top) };
  }
  const last = rows[rows.length - 1];
  if (last && p.y > last.getBoundingClientRect().bottom) {
    const r = last.getBoundingClientRect();
    const step = form.steps.length - 1;
    return { target: { step, index: form.steps[step].fields.length }, line: line(r, r.bottom) };
  }
  return null;
}
