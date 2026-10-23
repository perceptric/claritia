"use client";

// The editing canvas (docs/form-studio.md Part 2): a gray stage with the form drawn at the device's width, one frame
// per step. It draws the form the way <claritia-form> does (the brand kit's tokens, the 6-column grid, labels above
// or inside, sizes, content blocks, steps), with editing on top: hover outlines, a 2px accent outline and name tag on
// the selected field, a floating toolbar, labels edited in place on double-click, and drag handles for the
// Editor's drop logic. The editor's own chrome keeps its size at any zoom.

import { useDraggable } from "@dnd-kit/core";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Tokens } from "@/lib/forms/brand";
import type { Op } from "@/lib/forms/ops";
import { isContent, WIDTHS, type Field, type FieldWidth, type Form } from "@/lib/forms/schema";
import { ArrowDown, ArrowUp, Branch, Copy, Plus, Trash } from "../../Icons";
import { Popover, Seg } from "./controls";
import { frameWidth, formWidth, iconFor, nameOf, spanOf, WIDTH_LABEL, type Device } from "./editorModel";
import { Calendar, ChevronDown, Columns, ElementIcon, EyeOff, ImageIcon, PhoneOff } from "./icons";

export type Editing = { kind: "field"; id: string } | { kind: "title" | "intro" | "submit" } | null;

export type CanvasProps = {
  form: Form;
  t: Tokens;
  device: Device;
  zoom: "fit" | number;
  selected: string[];
  hovered: string | null;
  dragging: string | null;
  editing: Editing;
  onSelect: (id: string, add: boolean) => void;
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
};

export function FormCanvas(props: CanvasProps) {
  const { form, t, device, zoom, onClear, apply, onZoom } = props;
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

  // The fonts the canvas draws in.
  useEffect(() => {
    const url = t.fontUrl;
    if (!url || document.querySelector(`link[data-form-font="${CSS.escape(url)}"]`)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = url;
    l.dataset.formFont = url;
    document.head.append(l);
  }, [t.fontUrl]);

  const n = form.steps.length;
  return (
    <div ref={stage} className="relative min-h-0 min-w-0 overflow-auto bg-paper-deep" onClick={onClear} data-stage="">
      <div className="flex min-w-fit flex-col items-center gap-10 px-8 pt-8 pb-16">
        {form.steps.map((s, si) => (
          <div key={s.id} className="flex flex-col gap-2">
            <div className="flex h-7 items-center gap-2" style={{ width: fw * z }} onClick={(e) => e.stopPropagation()}>
              <span className="shrink-0 text-[12px] font-medium text-muted">{n > 1 ? `Step ${si + 1} of ${n}` : device === "desktop" ? "Desktop" : device === "tablet" ? "Tablet" : "Phone"}</span>
              {n > 1 ? (
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
              {n > 1 ? (
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
      </div>
    </div>
  );
}

// As <claritia-form> draws them (src/lib/forms/element.ts): small and large change the box, not the label.
const heightOf = (f: Field) => (f.size === "sm" ? 0.82 : f.size === "lg" ? 1.2 : 1);
const fontOf = (f: Field) => (f.size === "sm" ? 0.92 : f.size === "lg" ? 1.08 : 1);
const INSIDE = ["text", "email", "phone", "number", "url", "textarea", "date", "dropdown", "country"];

function StepFrame(props: CanvasProps & { si: number; z: number; fw: number }) {
  const { form, t, device, si, z, fw, editing, onEdit, onCommit, onClear } = props;
  const step = form.steps[si];
  const n = form.steps.length;
  const last = si === n - 1;
  const phone = device === "phone";
  const progress = form.layout.progress ?? "bar";
  const pad = phone ? 20 : 48;
  return (
    <section
      data-step-frame={si}
      onClick={(e) => {
        e.stopPropagation();
        onClear();
      }}
      className="rounded-sm border border-line shadow-soft"
      style={{ width: fw, background: t.background, padding: pad, fontFamily: t.font, fontSize: t.fontSize, color: t.text, lineHeight: 1.45, fontVariantNumeric: "normal", letterSpacing: "normal" }}
    >
      <div className="mx-auto flex flex-col" style={{ maxWidth: formWidth(form.layout), gap: t.gap }}>
        {si === 0 && (form.title || editing?.kind === "title") ? (
          <Editable
            as="h2"
            value={form.title ?? ""}
            editing={editing?.kind === "title"}
            onStart={() => onEdit({ kind: "title" })}
            onDone={(v) => onCommit({ kind: "title" }, v)}
            onCancel={() => onEdit(null)}
            style={{ fontFamily: t.headingFont || t.font, fontSize: "1.45em", fontWeight: 600, lineHeight: 1.2, margin: 0 }}
            label="Form title"
          />
        ) : null}
        {si === 0 && (form.intro || editing?.kind === "intro") ? (
          <Editable
            as="p"
            multiline
            value={form.intro ?? ""}
            editing={editing?.kind === "intro"}
            onStart={() => onEdit({ kind: "intro" })}
            onDone={(v) => onCommit({ kind: "intro" }, v)}
            onCancel={() => onEdit(null)}
            style={{ color: t.muted, margin: 0 }}
            label="Intro"
          />
        ) : null}
        {n > 1 && progress !== "none" ? <Progress kind={progress} at={si} n={n} t={t} title={step.title} /> : null}
        <div data-grid="" className="grid grid-cols-6" style={{ gap: t.gap }}>
          {step.fields.map((f) => (
            <FieldBox key={f.id} {...props} f={f} si={si} phone={phone} z={z} />
          ))}
          {!step.fields.length ? (
            <div className="col-span-6 flex h-20 items-center justify-center rounded-sm border border-dashed text-muted" style={{ borderColor: t.border, color: t.muted }} aria-label="Empty step">
              <Plus size={18} />
            </div>
          ) : null}
        </div>
        {last && (form.consent.mode === "always" || form.consent.mode === "by_region") ? (
          <label className="flex items-start gap-2.5">
            <span className="mt-0.5 size-[18px] shrink-0" style={{ border: `${Math.max(1, t.borderWidth)}px solid ${t.border}`, borderRadius: Math.min(4, t.radius), background: t.inputBg }} />
            <span>{form.consent.label}</span>
          </label>
        ) : null}
        {last && form.consent.mode === "notice" ? <p style={{ color: t.muted, fontSize: "0.85em", margin: 0 }}>{form.consent.label}</p> : null}
        <div className="flex items-center gap-2.5">
          {si > 0 ? (
            <span
              className="inline-flex items-center px-[22px]"
              style={{ minHeight: t.inputHeight, border: `${t.borderWidth}px solid ${t.border}`, borderRadius: t.buttonRadius, fontWeight: t.buttonWeight, textTransform: t.buttonCase }}
            >
              Back
            </span>
          ) : null}
          {last ? (
            <Editable
              as="span"
              value={form.submit.label}
              editing={editing?.kind === "submit"}
              onStart={() => onEdit({ kind: "submit" })}
              onDone={(v) => onCommit({ kind: "submit" }, v)}
              onCancel={() => onEdit(null)}
              label="Button text"
              className={`inline-flex items-center px-[22px] ${form.submit.full ? "flex-1 justify-center" : ""}`}
              style={{ minHeight: t.inputHeight, background: t.buttonBg, color: t.buttonText, borderRadius: t.buttonRadius, fontWeight: t.buttonWeight, textTransform: t.buttonCase }}
            />
          ) : (
            <span
              className={`inline-flex items-center px-[22px] ${form.submit.full ? "flex-1 justify-center" : ""}`}
              style={{ minHeight: t.inputHeight, background: t.buttonBg, color: t.buttonText, borderRadius: t.buttonRadius, fontWeight: t.buttonWeight, textTransform: t.buttonCase }}
            >
              Next
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

/** Where a visitor is: words over a bar, or dots alone (as element.ts draws them). */
function Progress({ kind, at, n, t, title }: { kind: "bar" | "dots"; at: number; n: number; t: Tokens; title?: string }) {
  const off = `color-mix(in srgb, ${t.muted} 22%, transparent)`;
  return (
    <div className="flex flex-col gap-2">
      {kind === "bar" ? (
        <>
          <p style={{ margin: 0, fontSize: "0.85em", color: t.muted }}>{`Step ${at + 1} of ${n}${title ? ` · ${title}` : ""}`}</p>
          <span className="block h-1 overflow-hidden rounded-[4px]" style={{ background: off }}>
            <span className="block h-full" style={{ width: `${((at + 1) / n) * 100}%`, background: t.accent }} />
          </span>
        </>
      ) : (
        <span className="flex gap-1.5">
          {Array.from({ length: n }, (_, i) => (
            <span key={i} className="size-2 rounded-full" style={{ background: i <= at ? t.accent : `color-mix(in srgb, ${t.muted} 30%, transparent)` }} />
          ))}
        </span>
      )}
    </div>
  );
}

/** Text that turns into a box in place: Enter saves (Cmd+Enter for several lines), Escape puts it back. */
function Editable({
  as,
  value,
  editing,
  onStart,
  onDone,
  onCancel,
  style,
  className = "",
  multiline = false,
  label,
}: {
  as: "h2" | "p" | "span";
  value: string;
  editing: boolean;
  onStart: () => void;
  onDone: (v: string) => void;
  onCancel: () => void;
  style: React.CSSProperties;
  className?: string;
  multiline?: boolean;
  label: string;
}) {
  const Tag = as;
  if (editing) return <InlineBox value={value} multiline={multiline} onDone={onDone} onCancel={onCancel} style={style} className={className} label={label} />;
  return (
    <Tag
      className={`${className} cursor-text rounded-[2px] outline-offset-4 hover:outline hover:outline-1 hover:outline-clay/60`}
      style={{ ...style, whiteSpace: multiline ? "pre-wrap" : undefined }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onStart();
      }}
    >
      {value}
    </Tag>
  );
}

function InlineBox({
  value,
  multiline,
  onDone,
  onCancel,
  style,
  className = "",
  label,
}: {
  value: string;
  multiline?: boolean;
  onDone: (v: string) => void;
  onCancel: () => void;
  style: React.CSSProperties;
  className?: string;
  label: string;
}) {
  const [text, setText] = useState(value);
  const done = useRef(false);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    if (save) onDone(text);
    else onCancel();
  };
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
    className: `${className} w-full min-w-0 rounded-[2px] bg-transparent outline outline-2 outline-offset-2 outline-clay`,
    style: { ...style, font: "inherit", ...pick(style) },
  };
  return multiline ? (
    <textarea {...common} rows={Math.max(2, text.split("\n").length)} onChange={(e) => setText(e.target.value)} style={{ ...common.style, resize: "none" }} />
  ) : (
    <input {...common} onChange={(e) => setText(e.target.value)} />
  );
}
const pick = (s: React.CSSProperties): React.CSSProperties => ({
  fontFamily: s.fontFamily,
  fontSize: s.fontSize,
  fontWeight: s.fontWeight,
  lineHeight: s.lineHeight,
  color: s.color,
  textTransform: s.textTransform,
});

function FieldBox(props: CanvasProps & { f: Field; si: number; phone: boolean; z: number }) {
  const { f, si, phone, z, form, t, selected, hovered, dragging, editing, onSelect, onHover, onEdit, onCommit } = props;
  const { attributes, listeners, setNodeRef } = useDraggable({ id: `f:${f.id}`, data: { kind: "field", id: f.id } });
  const isSel = selected.includes(f.id);
  const primary = isSel && selected.length === 1;
  const isHover = hovered === f.id && !isSel;
  const span = spanOf(f, phone);
  const ghost = phone && f.hideOnPhone;
  const ruled = form.rules.some((r) => r.then.field === f.id);
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
        onSelect(f.id, e.shiftKey || e.metaKey || e.ctrlKey);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (f.type !== "divider" && f.type !== "image") onEdit({ kind: "field", id: f.id });
      }}
      onMouseEnter={() => onHover(f.id)}
      onMouseLeave={() => onHover(null)}
      className={`relative min-w-0 cursor-default rounded-[2px] outline-offset-[4px] ${dragging === f.id ? "opacity-30" : ghost ? "opacity-35" : ""}`}
      style={{ gridColumn: `span ${span} / span ${span}`, outline, outlineOffset: `${4 / z}px` }}
    >
      <FieldLook f={f} form={form} t={t} editing={editingThis} onDone={(v) => onCommit({ kind: "field", id: f.id }, v)} onCancel={() => onEdit(null)} />
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
      {primary && !editingThis ? <Toolbar {...props} /> : null}
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

/** One field, drawn like the published form draws it. */
function FieldLook({ f, form, t, editing, onDone, onCancel }: { f: Field; form: Form; t: Tokens; editing: boolean; onDone: (v: string) => void; onCancel: () => void }) {
  const fs = t.fontSize * fontOf(f);
  const h = Math.round(t.inputHeight * heightOf(f));
  const label: React.CSSProperties = { fontSize: t.labelSize, fontWeight: t.labelWeight };
  const box: React.CSSProperties = { minHeight: h, background: t.inputBg, border: `${t.borderWidth}px solid ${t.border}`, borderRadius: t.radius, fontSize: fs, paddingLeft: 12, paddingRight: 12 };
  const muted: React.CSSProperties = { color: t.muted };
  const req = f.required ? <span style={{ color: t.muted, marginLeft: 2 }}>*</span> : null;
  const align = f.content?.align === "center" ? "center" : "left";

  if (f.type === "hidden")
    return (
      <div className="flex h-8 items-center gap-2 rounded-sm border border-dashed border-line-strong bg-card px-2.5 font-sans text-[12px] text-muted">
        <EyeOff size={13} />
        <span className="truncate text-ink">{f.label || "Hidden"}</span>
        <span className="ml-auto truncate font-mono text-[11px]">
          {f.hidden?.from === "param" ? `?${f.hidden.name ?? ""}` : f.hidden?.from === "static" ? f.hidden.value || "fixed" : f.hidden?.from}
        </span>
      </div>
    );
  if (f.type === "heading") {
    const size = f.content?.level === 1 ? "1.45em" : f.content?.level === 3 ? "1.05em" : "1.2em";
    const style: React.CSSProperties = { fontFamily: t.headingFont || t.font, fontSize: size, fontWeight: 600, lineHeight: 1.2, margin: 0, textAlign: align };
    return editing ? <InlineBox value={f.content?.text ?? ""} onDone={onDone} onCancel={onCancel} style={style} label="Heading text" /> : <p style={style}>{f.content?.text || "Heading"}</p>;
  }
  if (f.type === "paragraph") {
    const style: React.CSSProperties = { margin: 0, textAlign: align, whiteSpace: "pre-line" };
    return editing ? <InlineBox multiline value={f.content?.text ?? ""} onDone={onDone} onCancel={onCancel} style={style} label="Text" /> : <p style={style}>{f.content?.text || "Text"}</p>;
  }
  if (f.type === "divider") return <hr style={{ border: 0, borderTop: `${t.borderWidth}px solid ${t.border}`, margin: "4px 0" }} />;
  if (f.type === "image")
    return f.content?.src ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={f.content.src} alt={f.content.alt ?? ""} draggable={false} style={{ display: "block", maxWidth: "100%", borderRadius: t.radius, margin: align === "center" ? "0 auto" : undefined }} />
    ) : (
      <div className="flex h-28 items-center justify-center" style={{ border: `1px dashed ${t.border}`, borderRadius: t.radius, color: t.muted }}>
        <ImageIcon size={22} />
      </div>
    );

  const inside = (f.labels ?? form.layout.labels) === "inside" && INSIDE.includes(f.type);
  const labelText = editing ? (
    <InlineBox value={f.label} onDone={onDone} onCancel={onCancel} style={{ ...label, color: t.text }} label="Label" />
  ) : (
    <span style={label}>
      {f.label}
      {req}
    </span>
  );
  const top = f.hideLabel && !editing ? null : labelText;
  const help = f.help ? <p style={{ margin: 0, fontSize: "0.85em", color: t.muted }}>{f.help}</p> : null;
  const value = f.default;
  let control: React.ReactNode;
  let showTop = !inside;

  if (f.type === "checkbox") {
    showTop = false;
    control = (
      <span className="flex items-start gap-2.5">
        <span className="mt-0.5 size-[18px] shrink-0" style={{ border: `${Math.max(1, t.borderWidth)}px solid ${t.border}`, borderRadius: Math.min(4, t.radius), background: t.inputBg }} />
        {editing ? (
          <InlineBox value={f.label} onDone={onDone} onCancel={onCancel} style={{ color: t.text }} label="Label" />
        ) : (
          <span>
            {f.label}
            {req}
          </span>
        )}
      </span>
    );
  } else if (f.type === "choice" || f.type === "multi") {
    const list = [...(f.options ?? []), ...(f.other ? [{ value: "__other", label: "Other" }] : [])];
    control = (
      <span className="flex flex-col gap-2">
        {list.map((o) => (
          <span key={o.value} className="flex items-center gap-2.5">
            <span
              className="size-[18px] shrink-0"
              style={{
                border: `${Math.max(1, t.borderWidth)}px solid ${t.border}`,
                borderRadius: f.type === "choice" ? 999 : Math.min(4, t.radius),
                background: value === o.value ? t.accent : t.inputBg,
              }}
            />
            <span>{o.label}</span>
          </span>
        ))}
      </span>
    );
  } else if (f.type === "dropdown" || f.type === "country") {
    const picked = f.options?.find((o) => o.value === value)?.label ?? (f.type === "country" && value ? value : "");
    control = (
      <span className="flex items-center justify-between gap-2" style={box}>
        {inside && editing ? (
          <InlineBox value={f.label} onDone={onDone} onCancel={onCancel} style={{ color: t.text }} label="Label" />
        ) : (
          <span style={picked ? undefined : muted}>{picked || (inside ? f.label : f.placeholder) || "Choose…"}</span>
        )}
        <ChevronDown size={14} />
      </span>
    );
  } else if (f.type === "rating") {
    const scale = f.rating?.scale ?? 5;
    const stars = f.rating?.style !== "numbers";
    const at = Number(value) || 0;
    control = (
      <span className="flex flex-col gap-2">
        <span className="flex flex-wrap gap-1.5">
          {Array.from({ length: scale }, (_, i) =>
            stars ? (
              <span key={i} style={{ fontSize: "1.7em", lineHeight: 1, color: i < at ? t.accent : `color-mix(in srgb, ${t.muted} 40%, transparent)` }}>
                ★
              </span>
            ) : (
              <span
                key={i}
                className="flex items-center justify-center px-2"
                style={{
                  minWidth: t.inputHeight,
                  height: t.inputHeight,
                  background: i + 1 === at ? t.accent : t.inputBg,
                  color: i + 1 === at ? t.buttonText : t.text,
                  border: `${t.borderWidth}px solid ${i + 1 === at ? t.accent : t.border}`,
                  borderRadius: t.radius,
                }}
              >
                {i + 1}
              </span>
            ),
          )}
        </span>
        {f.rating?.low || f.rating?.high ? (
          <span className="flex justify-between gap-3" style={{ fontSize: "0.85em", color: t.muted }}>
            <span>{f.rating?.low}</span>
            <span>{f.rating?.high}</span>
          </span>
        ) : null}
      </span>
    );
  } else {
    const ph = inside ? `${f.label}${f.required ? " *" : ""}` : f.placeholder || (f.type === "date" ? "mm/dd/yyyy" : "");
    control = (
      <span className={`flex justify-between gap-2 ${f.type === "textarea" ? "items-start py-2.5" : "items-center"}`} style={{ ...box, minHeight: f.type === "textarea" ? h * 2.4 : h }}>
        {inside && editing ? (
          <InlineBox value={f.label} onDone={onDone} onCancel={onCancel} style={{ color: t.text }} label="Label" />
        ) : (
          <span className="truncate" style={value ? undefined : muted}>
            {value || ph}
          </span>
        )}
        {f.type === "date" ? <Calendar size={14} /> : null}
      </span>
    );
  }
  return (
    <div className="flex flex-col gap-1.5" style={{ fontSize: fs }}>
      {showTop ? top : null}
      {control}
      {help}
    </div>
  );
}
