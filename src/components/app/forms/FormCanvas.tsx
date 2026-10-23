"use client";

// Build by hand (docs/form-builder-v2.md Part 4): fields on the left, the form in the middle, the selected field's
// settings on the right. Drag a field onto the form or click it to add it at the end; drag the handle to move one,
// between steps too; click a field to select it and edit its label in place. Every change is an op
// (src/lib/forms/ops.ts), so the history and the checks are the same as everywhere else.

import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useMemo, useState } from "react";
import { cleanTokens, type Tokens } from "@/lib/forms/brand";
import type { FieldInput, Op } from "@/lib/forms/ops";
import { allFields, newId, type Field, type Form } from "@/lib/forms/schema";
import type { CustomField } from "@/lib/records/fields";
import { Copy, Grip, Lock, Plus, Trash } from "../../Icons";
import { Button, Field as Labeled, Input, Segmented } from "../ui";
import { FieldSettings, keyLabel } from "./FormBuild";
import { IconButton } from "./shared";

const OPT3 = ["Option 1", "Option 2", "Option 3"].map((v) => ({ value: v, label: v }));
type PaletteItem = { id: string; label: string; field: FieldInput };
const PALETTE: { group: string; items: PaletteItem[] }[] = [
  {
    group: "Contact",
    items: [
      { id: "p-first", label: "First name", field: { key: "first_name", type: "text", label: "First name", width: "half" } },
      { id: "p-last", label: "Last name", field: { key: "last_name", type: "text", label: "Last name", width: "half" } },
      { id: "p-name", label: "Full name", field: { key: "name", type: "text", label: "Full name" } },
      { id: "p-company", label: "Company", field: { key: "company", type: "text", label: "Company" } },
      { id: "p-title", label: "Job title", field: { key: "title", type: "text", label: "Job title" } },
      { id: "p-phone", label: "Phone", field: { key: "phone", type: "phone", label: "Phone" } },
      { id: "p-website", label: "Website", field: { key: "website", type: "url", label: "Company website" } },
      { id: "p-country", label: "Country", field: { key: "country", type: "country", label: "Country" } },
    ],
  },
  {
    group: "Questions",
    items: [
      { id: "p-text", label: "Short answer", field: { type: "text", label: "Question" } },
      { id: "p-textarea", label: "Long answer", field: { type: "textarea", label: "Tell us more" } },
      { id: "p-choice", label: "Pick one", field: { type: "choice", label: "Pick one", options: OPT3 } },
      { id: "p-multi", label: "Pick many", field: { type: "multi", label: "Pick any", options: OPT3 } },
      { id: "p-checkbox", label: "Checkbox", field: { type: "checkbox", label: "I agree" } },
      { id: "p-number", label: "Number", field: { type: "number", label: "How many?" } },
      { id: "p-date", label: "Date", field: { type: "date", label: "Date" } },
    ],
  },
  { group: "Hidden", items: [{ id: "p-hidden", label: "UTM source", field: { type: "hidden", label: "Source", hidden: { from: "param", name: "utm_source" } } }] },
];
const PALETTE_BY_ID = new Map(PALETTE.flatMap((g) => g.items).map((i) => [i.id, i]));

export function FormCanvas({
  form,
  apply,
  custom,
  tokens,
  name,
  setName,
  look,
}: {
  form: Form;
  apply: (op: Op) => void;
  custom: CustomField[];
  tokens: Partial<Tokens>;
  name: string;
  setName: (n: string) => void;
  /** The Look panel (brand kit and tokens), shown when nothing is selected. */
  look: React.ReactNode;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const fields = allFields(form);
  const where = (id: string) => {
    for (let s = 0; s < form.steps.length; s++) {
      const i = form.steps[s].fields.findIndex((f) => f.id === id);
      if (i >= 0) return { step: s, index: i };
    }
    return null;
  };
  const sel = fields.find((f) => f.id === selected) ?? null;
  const add = (item: PaletteItem, step = form.steps.length - 1, index?: number) => {
    const id = newId();
    apply({ op: "add_field", step, id, field: item.field });
    if (index !== undefined) apply({ op: "move_field", id, step, index });
    setSelected(id);
  };
  const duplicate = (f: Field) => {
    const id = newId();
    const { id: _id, key: _key, ...rest } = f;
    void _id;
    void _key;
    apply({ op: "add_field", after: f.id, id, field: { ...rest, label: `${f.label} copy` } });
    setSelected(id);
  };

  // Backspace removes, Cmd+D copies, arrows move the selection, Escape lets go. Not while typing.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea, [contenteditable], [role=listbox]")) return;
      if (!sel) return;
      if ((e.key === "Backspace" || e.key === "Delete") && sel.key !== "email") {
        e.preventDefault();
        apply({ op: "remove_field", id: sel.id });
        setSelected(null);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicate(sel);
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const i = fields.findIndex((f) => f.id === sel.id) + (e.key === "ArrowDown" ? 1 : -1);
        if (fields[i]) setSelected(fields[i].id);
      } else if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  });

  const onStart = (e: DragStartEvent) => setDragging(String(e.active.id));
  const onEnd = (e: DragEndEvent) => {
    setDragging(null);
    const over = e.over ? String(e.over.id) : null;
    if (!over) return;
    const target = over.startsWith("step:") ? { step: Number(over.slice(5)), index: form.steps[Number(over.slice(5))]?.fields.length ?? 0 } : where(over);
    if (!target) return;
    const active = String(e.active.id);
    const item = PALETTE_BY_ID.get(active);
    if (item) return add(item, target.step, target.index);
    const from = where(active);
    if (!from || active === over) return;
    apply({ op: "move_field", id: active, step: target.step, index: target.index });
  };

  const t = useMemo(() => cleanTokens(tokens).tokens, [tokens]);
  const ghost = dragging ? (PALETTE_BY_ID.get(dragging)?.label ?? fields.find((f) => f.id === dragging)?.label ?? "") : "";

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onStart} onDragEnd={onEnd} onDragCancel={() => setDragging(null)}>
      <div className="grid h-full min-h-0 md:grid-cols-[200px_1fr] xl:grid-cols-[200px_1fr_340px]">
        <aside className="hidden min-h-0 overflow-auto border-r border-line bg-panel p-3 md:block">
          {PALETTE.map((g) => (
            <div key={g.group} className="mb-4">
              <p className="label-mono mb-1.5 px-1">{g.group}</p>
              <div className="flex flex-col gap-1">
                {g.items.map((i) => (
                  <PaletteRow key={i.id} item={i} onAdd={() => add(i)} />
                ))}
              </div>
            </div>
          ))}
        </aside>

        <div className="paper min-h-0 overflow-auto p-4 md:p-8" onClick={() => setSelected(null)}>
          <div className="mx-auto flex flex-col gap-4" style={{ maxWidth: form.layout.width === "wide" ? 760 : 540 }}>
            {form.steps.map((s, si) => (
              <StepBox key={s.id} index={si} count={form.steps.length} title={s.title ?? ""} onTitle={(title) => apply({ op: "update_step", index: si, title })} onRemove={() => apply({ op: "remove_step", index: si })} bg={t.background}>
                <SortableContext items={s.fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                  <div className="grid grid-cols-2" style={{ gap: t.gap }}>
                    {s.fields.map((f) => (
                      <FieldCard
                        key={f.id}
                        field={f}
                        t={t}
                        labels={form.layout.labels}
                        selected={selected === f.id}
                        onSelect={() => setSelected(f.id)}
                        onLabel={(label) => apply({ op: "update_field", id: f.id, patch: { label } })}
                        onRemove={() => {
                          apply({ op: "remove_field", id: f.id });
                          setSelected(null);
                        }}
                        onCopy={() => duplicate(f)}
                        hint={keyLabel(f.key, custom)}
                      />
                    ))}
                  </div>
                </SortableContext>
                {si === form.steps.length - 1 ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected(null);
                    }}
                    className="mt-1 self-start"
                    style={{ background: t.buttonBg, color: t.buttonText, borderRadius: t.buttonRadius, fontWeight: t.buttonWeight, padding: "10px 18px", textTransform: t.buttonCase === "uppercase" ? "uppercase" : "none", fontFamily: t.font, fontSize: t.fontSize }}
                  >
                    {form.submit.label}
                  </button>
                ) : null}
              </StepBox>
            ))}
            <div>
              <Button
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  apply({ op: "add_step" });
                }}
              >
                <Plus size={14} />
                Add step
              </Button>
            </div>
          </div>
        </div>

        <aside className="hidden min-h-0 overflow-auto border-l border-line bg-panel p-4 xl:block">
          {sel ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <p className="label-mono flex-1">Field</p>
                <IconButton label="Copy field" onClick={() => duplicate(sel)}>
                  <Copy size={14} />
                </IconButton>
                <IconButton label="Remove field" disabled={sel.key === "email"} onClick={() => (apply({ op: "remove_field", id: sel.id }), setSelected(null))} danger>
                  <Trash size={14} />
                </IconButton>
              </div>
              <div className="-mx-4 border-y border-line">
                <FieldSettings key={sel.id} form={form} field={sel} apply={apply} custom={custom} />
              </div>
            </div>
          ) : (
            <FormPanel form={form} apply={apply} name={name} setName={setName} look={look} />
          )}
        </aside>
      </div>
      <DragOverlay dropAnimation={null}>{ghost ? <div className="border border-ink bg-panel px-3 py-2 text-[13px] font-medium shadow-[0_8px_24px_rgba(0,0,0,0.12)]">{ghost}</div> : null}</DragOverlay>
    </DndContext>
  );
}

function PaletteRow({ item, onAdd }: { item: PaletteItem; onAdd: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id });
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={onAdd}
      className={`flex h-8 items-center gap-2 border border-line bg-panel px-2 text-left text-[12.5px] text-ink hover:border-ink ${isDragging ? "opacity-40" : ""}`}
    >
      <Grip size={12} className="text-faint" />
      {item.label}
    </button>
  );
}

function StepBox({ index, count, title, onTitle, onRemove, bg, children }: { index: number; count: number; title: string; onTitle: (t: string) => void; onRemove: () => void; bg: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `step:${index}` });
  return (
    <section ref={setNodeRef} className={`flex flex-col border ${isOver ? "border-ink" : "border-line"}`} style={{ background: bg }}>
      {count > 1 ? (
        <div className="flex items-center gap-2 border-b border-line bg-panel px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
          <span className="label-mono shrink-0">Step {index + 1}</span>
          <input value={title} placeholder="Title" onChange={(e) => onTitle(e.target.value)} aria-label={`Step ${index + 1} title`} className="h-7 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint" />
          <IconButton label="Remove step" onClick={onRemove} danger>
            <Trash size={14} />
          </IconButton>
        </div>
      ) : null}
      <div className="flex flex-col gap-4 p-6">{children}</div>
    </section>
  );
}

function FieldCard({
  field: f,
  t,
  labels,
  selected,
  onSelect,
  onLabel,
  onRemove,
  onCopy,
  hint,
}: {
  field: Field;
  t: Tokens;
  labels: Form["layout"]["labels"];
  selected: boolean;
  onSelect: () => void;
  onLabel: (l: string) => void;
  onRemove: () => void;
  onCopy: () => void;
  hint: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: f.id });
  const box = { background: t.inputBg, border: `${t.borderWidth}px solid ${t.border}`, borderRadius: t.radius, minHeight: f.type === "textarea" ? t.inputHeight * 2.2 : t.inputHeight };
  const label = { fontSize: t.labelSize, fontWeight: t.labelWeight, color: t.text, fontFamily: t.font };
  const choices = f.type === "choice" || f.type === "multi";
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group relative ${f.width === "half" ? "col-span-1" : "col-span-2"} ${isDragging ? "z-10 opacity-40" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <div className={`-m-2 flex flex-col gap-1.5 p-2 outline-offset-2 ${selected ? "outline-2 outline-brand" : "hover:outline-1 hover:outline-dashed hover:outline-line-strong"}`}>
        {f.type === "hidden" ? (
          <div className="flex h-9 items-center gap-2 border border-dashed border-line-strong px-3 font-mono text-[11px] text-muted">
            <Lock size={12} />
            Hidden · {f.label} · {f.hidden?.from === "param" ? `?${f.hidden.name}` : f.hidden?.from}
          </div>
        ) : f.type === "checkbox" ? (
          <div className="flex items-center gap-2" style={label}>
            <span className="size-4 shrink-0" style={{ border: `${Math.max(1, t.borderWidth)}px solid ${t.border}`, background: t.inputBg }} />
            <LabelText f={f} selected={selected} onLabel={onLabel} style={{ ...label, fontWeight: 400 }} />
          </div>
        ) : (
          <>
            {labels === "above" || choices ? <LabelText f={f} selected={selected} onLabel={onLabel} style={label} /> : null}
            {choices ? (
              f.type === "choice" ? (
                <div className="flex items-center justify-between px-3" style={{ ...box, color: t.muted, fontFamily: t.font, fontSize: t.fontSize }}>
                  {f.placeholder || "Choose…"}
                  <span aria-hidden="true">▾</span>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {(f.options ?? []).slice(0, 4).map((o) => (
                    <span key={o.value} className="flex items-center gap-2" style={{ fontFamily: t.font, fontSize: t.fontSize, color: t.text }}>
                      <span className="size-4 shrink-0" style={{ border: `${Math.max(1, t.borderWidth)}px solid ${t.border}`, background: t.inputBg }} />
                      {o.label}
                    </span>
                  ))}
                </div>
              )
            ) : (
              <div className="flex items-start px-3 py-2.5" style={{ ...box, color: t.muted, fontFamily: t.font, fontSize: t.fontSize }}>
                {labels === "inside" ? `${f.label}${f.required ? " *" : ""}` : f.placeholder || ""}
              </div>
            )}
          </>
        )}
      </div>
      <div className={`absolute -top-3 right-1 flex items-center gap-0.5 border border-line bg-panel ${selected ? "" : "opacity-0 group-hover:opacity-100"}`}>
        <span className="hidden px-1.5 font-mono text-[10px] text-faint sm:inline">{hint}</span>
        <button type="button" {...attributes} {...listeners} aria-label="Drag to move" title="Drag to move" className="flex size-6 cursor-grab items-center justify-center text-muted hover:text-ink active:cursor-grabbing">
          <Grip size={13} />
        </button>
        <IconButton label="Copy field" onClick={onCopy}>
          <Copy size={13} />
        </IconButton>
        <IconButton label="Remove field" disabled={f.key === "email"} onClick={onRemove} danger>
          <Trash size={13} />
        </IconButton>
      </div>
    </div>
  );
}

/** The label: plain text, and a text box in place once the field is selected. */
function LabelText({ f, selected, onLabel, style }: { f: Field; selected: boolean; onLabel: (l: string) => void; style: React.CSSProperties }) {
  if (selected)
    return (
      <span className="flex items-center gap-0.5">
        <input value={f.label} onChange={(e) => onLabel(e.target.value)} onClick={(e) => e.stopPropagation()} aria-label="Label" className="min-w-0 flex-1 bg-transparent outline-none" style={style} />
        {f.required ? <span style={{ ...style, color: t0(style) }}>*</span> : null}
      </span>
    );
  return (
    <span style={style}>
      {f.label || <span className="text-faint">No label</span>}
      {f.required ? " *" : ""}
    </span>
  );
}
const t0 = (s: React.CSSProperties) => (s.color as string) ?? "inherit";

function FormPanel({ form, apply, name, setName, look }: { form: Form; apply: (op: Op) => void; name: string; setName: (n: string) => void; look: React.ReactNode }) {
  const [tab, setTab] = useState<"form" | "look">("form");
  return (
    <div className="flex flex-col gap-4">
      <Segmented
        label="Panel"
        value={tab}
        options={[
          { value: "form", label: "Form" },
          { value: "look", label: "Look" },
        ]}
        onChange={setTab}
      />
      {tab === "look" ? (
        look
      ) : (
        <div className="flex flex-col gap-3">
          <Labeled label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Labeled>
          <Labeled label="Title">
            <Input value={form.title ?? ""} onChange={(e) => apply({ op: "set_copy", title: e.target.value })} />
          </Labeled>
          <Labeled label="Intro">
            <Input value={form.intro ?? ""} onChange={(e) => apply({ op: "set_copy", intro: e.target.value })} />
          </Labeled>
          <Labeled label="Button">
            <Input value={form.submit.label} onChange={(e) => apply({ op: "set_copy", submit: e.target.value })} />
          </Labeled>
          <Segmented
            label="Labels"
            value={form.layout.labels}
            options={[
              { value: "above", label: "Labels above" },
              { value: "inside", label: "Inside" },
            ]}
            onChange={(labels) => apply({ op: "set_layout", labels })}
          />
          <Segmented
            label="Width"
            value={form.layout.width}
            options={[
              { value: "narrow", label: "Narrow" },
              { value: "wide", label: "Wide" },
            ]}
            onChange={(width) => apply({ op: "set_layout", width })}
          />
        </div>
      )}
    </div>
  );
}
