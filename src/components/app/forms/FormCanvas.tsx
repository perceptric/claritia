"use client";

// The editing canvas (docs/design-system.md Part 3.3): a gray stage with one real <claritia-form> per step, drawn in
// edit mode at the device's width with the draft's compiled styles, so the builder shows exactly what visitors get.
// A clear layer on top mirrors where each field sits and does the editing: hover outlines, a 2px accent outline and
// name tag on the selected field, the selected part (label, input...) picked from under the pointer, a floating
// toolbar, text edited in place on double-click, and drag handles for the Editor's drop logic (which reads the
// layer's `data-step-frame`, `data-grid` and `data-fid` boxes). The editor's own chrome keeps its size at any zoom.

import { useDraggable } from "@dnd-kit/core";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Tokens } from "@/lib/forms/brand";
import type { Op } from "@/lib/forms/ops";
import { allRegions, usesRegions } from "@/lib/forms/regions";
import { isContent, WIDTHS, type Field, type FieldWidth, type Form } from "@/lib/forms/schema";
import type { State } from "@/lib/design/model";
import { fieldParts, FORM_PARTS, partAt, partDef, type PartKey } from "@/lib/design/parts";
import { partSelector } from "@/lib/design/web";
import { ArrowDown, ArrowUp, Branch, Copy, Plus, Trash } from "../../Icons";
import { Popover, Seg } from "./controls";
import { frameWidth, iconFor, nameOf, WIDTH_LABEL, type Device } from "./editorModel";
import { Columns, ElementIcon, EyeOff, PhoneOff } from "./icons";

export type Editing = { kind: "field"; id: string } | { kind: "title" | "intro" | "submit" } | null;
/** What the style panel edits: an element ("form" for the form's own parts) and one of its parts. */
export type Picked = { id: string; part: PartKey } | null;

export type CanvasProps = {
  form: Form;
  t: Tokens;
  device: Device;
  zoom: "fit" | number;
  /** The draft's compiled styles for this device (src/lib/design/form.ts with `device` and `preview`). */
  css: string;
  /** Font stylesheets the styles need. */
  fonts?: string[];
  selected: string[];
  hovered: string | null;
  dragging: string | null;
  editing: Editing;
  part: Picked;
  /** The state the style panel edits, shown on the selected part. */
  state?: State;
  onPick: (id: string, part: PartKey, add: boolean) => void;
  onClear: () => void;
  onHover: (id: string | null) => void;
  onEdit: (e: Editing) => void;
  onCommit: (e: NonNullable<Editing>, text: string) => void;
  onNudge: (id: string, dir: -1 | 1) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  apply: (op: Op | Op[]) => void;
  /** Tells the editor the zoom in use, for the zoom menu. */
  onZoom?: (z: number) => void;
  /** The style guide: parts can be picked, nothing else changes. */
  locked?: boolean;
};

/** Edit mode only: empty steps and hidden fields keep a size, and fields hidden on phones show faded. */
const EDIT_CSS = `.g:empty{min-height:80px;border:1px dashed var(--clr-border);border-radius:var(--clr-radius)}
[data-hidden]{min-height:32px}
@container (max-width:400px){.np{display:flex;opacity:.35}}`;

export function FormCanvas(props: CanvasProps) {
  const { form, device, zoom, onClear, apply, onZoom, locked } = props;
  const stage = useRef<HTMLDivElement>(null);
  const [stageW, setStageW] = useState(800);
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStageW(el.clientWidth));
    ro.observe(el);
    setStageW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const fw = frameWidth(device, form.layout);
  const z = zoom === "fit" ? Math.min(1, Math.max(0.25, (stageW - 64) / fw)) : zoom / 100;
  useEffect(() => onZoom?.(z), [z, onZoom]);

  const n = form.steps.length;
  return (
    <div ref={stage} className="relative min-h-0 min-w-0 overflow-auto bg-paper-deep" onClick={onClear} data-stage="">
      <div className="flex min-w-fit flex-col items-center gap-10 px-8 pt-8 pb-16">
        {form.steps.map((s, si) => (
          <div key={s.id} className="flex flex-col gap-2">
            <div className="flex h-7 items-center gap-2" style={{ width: fw * z }} onClick={(e) => e.stopPropagation()}>
              <span className="shrink-0 text-[12px] font-medium text-muted">{n > 1 ? `Step ${si + 1} of ${n}` : device === "desktop" ? "Desktop" : device === "tablet" ? "Tablet" : "Phone"}</span>
              {n > 1 && !locked ? (
                <input
                  value={s.title ?? ""}
                  placeholder="Title"
                  aria-label={`Step ${si + 1} title`}
                  onChange={(e) => apply({ op: "update_step", index: si, title: e.target.value })}
                  className="h-6 min-w-0 flex-1 rounded-sm border border-transparent bg-transparent px-1.5 text-[12px] text-ink outline-none placeholder:text-faint hover:border-line-strong focus:border-ink focus:bg-card"
                />
              ) : (
                <span className="flex-1 text-[11.5px] text-faint tabular-nums">{fw}</span>
              )}
              {n > 1 && !locked ? (
                <button
                  type="button"
                  aria-label={`Remove step ${si + 1}`}
                  title="Remove step"
                  onClick={() => apply({ op: "remove_step", index: si })}
                  className="press flex size-6 items-center justify-center rounded-full text-muted hover:bg-rose-wash hover:text-rose"
                >
                  <Trash size={12} />
                </button>
              ) : null}
            </div>
            <div style={{ zoom: z }}>
              <StepFrame {...props} si={si} z={z} fw={fw} />
            </div>
          </div>
        ))}
        {locked ? null : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              apply({ op: "add_step" });
              onClear();
            }}
            className="press inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong bg-card px-3.5 text-[12.5px] font-medium text-ink hover:border-ink"
          >
            <Plus size={13} />
            Add step
          </button>
        )}
      </div>
    </div>
  );
}

// Where things sit, in the frame's own pixels (zoom taken out).
type R = { x: number; y: number; w: number; h: number };
type Layout = { fields: Record<string, R>; grid: R | null; title: R | null; intro: R | null; submit: R | null; part: R | null; edit: React.CSSProperties | null };
const NO_LAYOUT: Layout = { fields: {}, grid: null, title: null, intro: null, submit: null, part: null, edit: null };

/** The selector for a picked part inside the form; null for parts that can't be found in the page (placeholders). */
function pickedSelector(p: NonNullable<Picked>): string | null {
  const sel = partSelector(p.part, p.id === "form" ? "" : `.fl[data-id="${p.id}"]`);
  return sel && !sel.includes("::") ? sel : null;
}

/** The text a double-click edits, inside the form. */
function editTarget(root: ShadowRoot, e: NonNullable<Editing>): HTMLElement | null {
  if (e.kind !== "field") return root.querySelector(e.kind === "title" ? ".f > .h" : e.kind === "intro" ? ".f > .i:not(.nt)" : ".ac .bt:not(.bk)");
  const box = root.querySelector(`.fl[data-id="${e.id}"]`);
  return box?.querySelector<HTMLElement>(".lb, .ck span, .k1, .k2, .k3, .tx, .in, .bx") ?? null;
}

function StepFrame(props: CanvasProps & { si: number; z: number; fw: number }) {
  const { form, t, device, si, z, fw, css, fonts, editing, part, state, dragging, onPick, onClear, onEdit, onCommit } = props;
  const host = useRef<HTMLElement>(null);
  const [layout, setLayout] = useState<Layout>(NO_LAYOUT);
  const step = form.steps[si];
  const phone = device === "phone";
  const pad = phone ? 20 : 48;
  const rootOf = () => host.current?.shadowRoot ?? null;

  // The real form, in edit mode, for this step.
  const fullCss = `${css}\n${EDIT_CSS}${dragging ? `\n.fl[data-id="${dragging}"]{opacity:.3}` : ""}`;
  useEffect(() => {
    let live = true;
    void import("@/lib/forms/element").then(() => {
      if (live && host.current) (host.current as unknown as { preview: unknown }).preview = { form, tokens: t, step: si, css: fullCss, fonts, edit: true, ...(usesRegions(form) ? { regions: allRegions() } : {}) };
    });
    return () => {
      live = false;
    };
  }, [form, t, si, fullCss, fonts]);

  // After every draw: the picked part shows the state being styled, and the layer measures the form again.
  const measure = useCallback(() => {
    const h = host.current;
    const root = h?.shadowRoot;
    if (!h || !root) return;
    for (const n of root.querySelectorAll("[class*=clr-force-]")) n.classList.forEach((c) => c.startsWith("clr-force-") && n.classList.remove(c));
    const sel = part ? pickedSelector(part) : null;
    let partEl: Element | null = null;
    try {
      partEl = sel ? root.querySelector(sel) : null;
      if (sel && state && state !== "dark") for (const n of root.querySelectorAll(sel)) n.classList.add(`clr-force-${state}`);
    } catch {
      partEl = null;
    }
    const box = h.getBoundingClientRect();
    // Some browsers measure zoomed pages in zoomed pixels and some don't: the host's own width tells which.
    const s = box.width / (h.offsetWidth || 1) || 1;
    const loc = (n: Element | null): R | null => {
      if (!n) return null;
      const r = n.getBoundingClientRect();
      if (!r.width && !r.height) return null;
      return { x: (r.left - box.left) / s, y: (r.top - box.top) / s, w: r.width / s, h: r.height / s };
    };
    const fields: Record<string, R> = {};
    for (const n of root.querySelectorAll(".g > .fl[data-id]")) {
      const r = loc(n);
      if (r) fields[(n as HTMLElement).dataset.id!] = r;
    }
    // The text being edited: where it sits and its font, so the box over it looks the same.
    let edit: React.CSSProperties | null = null;
    const el = editing ? editTarget(root, editing) : null;
    const er = loc(el);
    if (el && er) {
      const cs = getComputedStyle(el);
      edit = {
        left: er.x,
        top: er.y,
        width: Math.max(120, er.w),
        minHeight: er.h,
        fontFamily: cs.fontFamily,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        lineHeight: cs.lineHeight,
        letterSpacing: cs.letterSpacing,
        textTransform: cs.textTransform as React.CSSProperties["textTransform"],
        textAlign: cs.textAlign as React.CSSProperties["textAlign"],
        color: el.matches(".in, .bx, .bt") ? undefined : cs.color,
      };
    }
    setLayout({ fields, grid: loc(root.querySelector(".g")), title: loc(root.querySelector(".f > .h")), intro: loc(root.querySelector(".f > .i:not(.nt)")), submit: loc(root.querySelector(".ac .bt:not(.bk)")), part: loc(partEl), edit });
  }, [part, state, editing]);
  useEffect(() => {
    const h = host.current;
    if (!h) return;
    let frame = 0;
    const soon = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    let mo: MutationObserver | null = null;
    const watch = () => {
      if (mo || !h.shadowRoot) return;
      mo = new MutationObserver(soon);
      mo.observe(h.shadowRoot, { childList: true, subtree: true, characterData: true });
    };
    const ro = new ResizeObserver(() => {
      watch();
      soon();
    });
    ro.observe(h);
    watch();
    soon();
    void document.fonts?.ready.then(soon);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      mo?.disconnect();
    };
  }, [measure]);

  /** The form's own part under the pointer (title, button, progress...), seen through the layer. */
  const formPartAt = (x: number, y: number): PartKey | null => {
    const root = rootOf();
    const f = root?.querySelector(".f") ?? null;
    if (!root || !f) return null;
    const hit = root.elementsFromPoint(x, y).find((n) => root.contains(n) && !n.closest(".fl"));
    return hit ? partAt(hit, f, FORM_PARTS) : null;
  };
  /** The part of one field under the pointer. */
  const fieldPartAt = (f: Field, x: number, y: number): PartKey => {
    const root = rootOf();
    const box = root?.querySelector(`.fl[data-id="${f.id}"]`) ?? null;
    const hit = root?.elementsFromPoint(x, y).find((n) => box?.contains(n)) ?? null;
    return partAt(hit, box, fieldParts(f.type)) ?? "field";
  };

  const textZone = (kind: "title" | "intro" | "submit", r: R | null, label: string) =>
    r && editing?.kind !== kind ? (
      <div
        role="button"
        tabIndex={-1}
        aria-label={label}
        className="absolute cursor-text rounded-[2px] hover:outline hover:outline-1 hover:outline-clay/60"
        style={{ left: r.x, top: r.y, width: r.w, height: r.h, outlineOffset: 4 / z }}
        onClick={(e) => {
          e.stopPropagation();
          onPick("form", kind === "submit" ? "button" : kind, false);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (!props.locked) onEdit({ kind });
        }}
      />
    ) : null;

  return (
    <section
      data-step-frame={si}
      onClick={(e) => {
        e.stopPropagation();
        onClear();
      }}
      className="rounded-sm border border-line shadow-soft"
      style={{ width: fw, background: t.background, padding: pad }}
    >
      <div className="relative">
        <claritia-form ref={host} />
        {/* The layer: it takes every pointer event, so nothing in the form below reacts while editing. */}
        <div
          className="absolute inset-0"
          onClick={(e) => {
            e.stopPropagation();
            const p = formPartAt(e.clientX, e.clientY);
            if (p) onPick("form", p, false);
            else onClear();
          }}
        >
          <div data-grid="" className="pointer-events-none absolute" style={layout.grid ? { left: layout.grid.x, top: layout.grid.y, width: layout.grid.w, height: layout.grid.h } : { left: 0, top: 0, width: 0, height: 0 }} />
          {!step.fields.length && layout.grid ? (
            <span className="pointer-events-none absolute flex items-center justify-center" style={{ left: layout.grid.x, top: layout.grid.y, width: layout.grid.w, height: layout.grid.h, color: t.muted }} aria-label="Empty step">
              <Plus size={18} />
            </span>
          ) : null}
          {si === 0 ? textZone("title", layout.title, "Form title") : null}
          {si === 0 ? textZone("intro", layout.intro, "Intro") : null}
          {si === form.steps.length - 1 ? textZone("submit", layout.submit, "Button text") : null}
          {step.fields.map((f) => (layout.fields[f.id] ? <FieldBox key={f.id} {...props} f={f} si={si} phone={phone} z={z} r={layout.fields[f.id]} partAt={fieldPartAt} /> : null))}
          {part && layout.part && (part.id === "form" || layout.fields[part.id]) && part.part !== "field" && part.part !== "form" ? (
            <span className="pointer-events-none absolute rounded-[2px] outline-dashed outline-clay" style={{ left: layout.part.x, top: layout.part.y, width: layout.part.w, height: layout.part.h, outlineWidth: 1 / z, outlineOffset: 2 / z }}>
              <span className="absolute top-full left-0" style={{ zoom: 1 / z, marginTop: 4 }}>
                <span className="inline-flex h-5 items-center rounded-full bg-ink px-2 text-[11px] font-medium text-paper">{partDef(part.part).label}</span>
              </span>
            </span>
          ) : null}
          {editing && layout.edit && (editing.kind === "field" ? !!layout.fields[editing.id] : si === 0 || editing.kind === "submit") ? (
            <InlineEdit key={JSON.stringify(editing)} {...props} place={layout.edit} editing={editing} onDone={(v) => onCommit(editing, v)} onCancel={() => onEdit(null)} />
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** A box over the text being edited, in the text's own font: Enter saves (Cmd+Enter for several lines), Escape puts it back. */
function InlineEdit({ form, place, editing, onDone, onCancel }: CanvasProps & { place: React.CSSProperties; editing: NonNullable<Editing>; onDone: (v: string) => void; onCancel: () => void }) {
  const field = editing.kind === "field" ? form.steps.flatMap((s) => s.fields).find((f) => f.id === editing.id) : undefined;
  const value =
    editing.kind === "title" ? (form.title ?? "") : editing.kind === "intro" ? (form.intro ?? "") : editing.kind === "submit" ? form.submit.label : field && (field.type === "heading" || field.type === "paragraph") ? (field.content?.text ?? "") : (field?.label ?? "");
  const multiline = editing.kind === "intro" || field?.type === "paragraph";
  const [text, setText] = useState(value);
  const done = useRef(false);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    if (save) onDone(text);
    else onCancel();
  };
  const label = editing.kind === "title" ? "Form title" : editing.kind === "intro" ? "Intro" : editing.kind === "submit" ? "Button text" : field?.type === "heading" ? "Heading text" : field?.type === "paragraph" ? "Text" : "Label";
  const common = {
    autoFocus: true,
    value: text,
    "aria-label": label,
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => e.currentTarget.select(),
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    onDoubleClick: (e: React.MouseEvent) => e.stopPropagation(),
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onBlur: () => finish(true),
    onKeyDown: (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Escape") finish(false);
      else if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        finish(true);
      }
    },
    className: "absolute z-30 rounded-[2px] border-0 bg-card p-0 text-ink outline outline-2 outline-offset-2 outline-clay",
  };
  return multiline ? (
    <textarea {...common} rows={Math.max(2, text.split("\n").length)} onChange={(e) => setText(e.target.value)} style={{ ...place, resize: "none" }} />
  ) : (
    <input {...common} onChange={(e) => setText(e.target.value)} style={place} />
  );
}

function FieldBox(props: CanvasProps & { f: Field; si: number; phone: boolean; z: number; r: R; partAt: (f: Field, x: number, y: number) => PartKey }) {
  const { f, si, phone, z, r, form, selected, hovered, editing, onPick, onHover, onEdit } = props;
  const { attributes, listeners, setNodeRef } = useDraggable({ id: `f:${f.id}`, data: { kind: "field", id: f.id }, disabled: props.locked });
  const isSel = selected.includes(f.id);
  const primary = isSel && selected.length === 1;
  const isHover = hovered === f.id && !isSel;
  const ghost = phone && f.hideOnPhone;
  const ruled = form.rules.some((x) => x.then.field === f.id);
  const editingThis = editing?.kind === "field" && editing.id === f.id;
  const outline = isSel ? `${2 / z}px solid var(--color-clay)` : isHover ? `${1 / z}px solid var(--color-clay)` : undefined;
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-fid={f.id}
      data-step={si}
      role="button"
      tabIndex={-1}
      aria-label={`${nameOf(f)}`}
      aria-pressed={isSel}
      onClick={(e) => {
        e.stopPropagation();
        onPick(f.id, props.partAt(f, e.clientX, e.clientY), e.shiftKey || e.metaKey || e.ctrlKey);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (f.type !== "divider" && f.type !== "image" && f.type !== "hidden" && !props.locked) onEdit({ kind: "field", id: f.id });
      }}
      onMouseEnter={() => onHover(f.id)}
      onMouseLeave={() => onHover(null)}
      className="absolute cursor-default rounded-[2px]"
      style={{ left: r.x, top: r.y, width: r.w, height: r.h, outline, outlineOffset: `${4 / z}px` }}
    >
      {f.type === "hidden" ? (
        <div className="flex h-full items-center gap-2 rounded-sm border border-dashed border-line-strong bg-card px-2.5 font-sans text-[12px] text-muted">
          <EyeOff size={13} />
          <span className="truncate text-ink">{f.label || "Hidden"}</span>
          <span className="ml-auto truncate font-mono text-[11px]">{f.hidden?.from === "param" ? `?${f.hidden.name ?? ""}` : f.hidden?.from === "static" ? f.hidden.value || "fixed" : f.hidden?.from}</span>
        </div>
      ) : null}
      {ruled && !isSel ? (
        <span className="absolute top-0 right-0 flex size-5 items-center justify-center rounded-full bg-lilac-wash text-lilac" style={{ zoom: 1 / z }} title="Has logic">
          <Branch size={11} />
        </span>
      ) : null}
      {ghost ? (
        <span className="absolute top-0 right-0 flex size-5 items-center justify-center rounded-full bg-paper-deep text-muted" style={{ zoom: 1 / z }} title="Hidden on phone">
          <PhoneOff size={11} />
        </span>
      ) : null}
      {isSel ? (
        <span className="pointer-events-none absolute bottom-full left-0 z-10" style={{ zoom: 1 / z, marginBottom: 6 }}>
          <span className="inline-flex h-5 max-w-[220px] items-center gap-1 truncate rounded-full bg-clay px-2 text-[11px] font-medium text-paper">
            <ElementIcon name={iconFor(f)} size={11} />
            <span className="truncate">{nameOf(f)}</span>
          </span>
        </span>
      ) : null}
      {primary && !editingThis && !props.locked ? <Toolbar {...props} /> : null}
    </div>
  );
}

function Toolbar({ f, z, form, onNudge, onDuplicate, onRemove, apply }: CanvasProps & { f: Field; z: number }) {
  const widthBtn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const all = form.steps.flatMap((s) => s.fields);
  const i = all.findIndex((x) => x.id === f.id);
  const btn = "press flex size-[26px] items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink disabled:opacity-35";
  return (
    <span
      className="absolute right-0 bottom-full z-20"
      style={{ zoom: 1 / z, marginBottom: 4 }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <span role="toolbar" aria-label="Field actions" className="flex items-center gap-0.5 rounded-full bg-card p-0.5 shadow-float">
        <button type="button" aria-label="Move up" title="Move up" disabled={i <= 0} onClick={() => onNudge(f.id, -1)} className={btn}>
          <ArrowUp size={13} />
        </button>
        <button type="button" aria-label="Move down" title="Move down" disabled={i >= all.length - 1} onClick={() => onNudge(f.id, 1)} className={btn}>
          <ArrowDown size={13} />
        </button>
        <button type="button" aria-label="Duplicate" title="Duplicate" onClick={() => onDuplicate(f.id)} className={btn}>
          <Copy size={13} />
        </button>
        {!isContent(f.type) && f.type !== "hidden" ? (
          <button ref={widthBtn} type="button" aria-label="Width" title="Width" aria-haspopup="dialog" onClick={() => setOpen((o) => !o)} className={btn}>
            <Columns size={13} />
          </button>
        ) : null}
        <button type="button" aria-label="Delete" title="Delete" disabled={f.key === "email"} onClick={() => onRemove(f.id)} className={`${btn} hover:bg-rose-wash hover:text-rose`}>
          <Trash size={13} />
        </button>
      </span>
      <Popover anchor={widthBtn} open={open} onClose={() => setOpen(false)} label="Width" width={196}>
        <Seg<FieldWidth>
          label="Width"
          value={f.width ?? "full"}
          options={WIDTHS.map((w) => ({ value: w, label: WIDTH_LABEL[w], title: w === "full" ? "Full width" : w === "half" ? "Half width" : w === "third" ? "One third" : "Two thirds" }))}
          onChange={(w) => {
            apply({ op: "update_field", id: f.id, patch: { width: w === "full" ? undefined : w } });
            setOpen(false);
          }}
        />
      </Popover>
    </span>
  );
}
