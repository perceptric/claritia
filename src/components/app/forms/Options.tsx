"use client";

// A choice field's options: drag handles, edit in place, paste one per line, presets (countries, US states,
// company sizes, industries), an "Other" choice, shuffle, and min and max picks for "pick many".

import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Choice, Field, Form } from "@/lib/forms/schema";
import { Grip, Plus, X } from "../../Icons";
import { askLines } from "../Dialogs";
import { Select } from "../Select";
import { INPUT, NumRow, PICK, Switch } from "./controls";
import { linesToOptions, nextOption, PRESETS } from "./editorModel";

export function Options({ field: f, form, patch }: { field: Field; form: Form; patch: (p: Partial<Field>) => void }) {
  const list = f.options ?? [];
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 3 } }));
  const used = new Set(form.rules.filter((r) => r.when.field === f.id).map((r) => r.when.value));
  const set = (next: Choice[]) => patch({ options: next, ...(f.default && !next.some((o) => o.value === f.default) ? { default: undefined } : {}) });
  const rename = (i: number, label: string) =>
    set(list.map((o, j) => (j !== i ? o : { label, value: o.value === o.label && !used.has(o.value) && !list.some((x, k) => k !== i && x.value === label) ? label : o.value })));
  const onEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = Number(String(e.active.id).slice(2));
    const to = Number(String(e.over.id).slice(2));
    if (list[from] && list[to]) set(arrayMove(list, from, to));
  };
  return (
    <div className="flex flex-col gap-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onEnd}>
        <SortableContext items={list.map((_, i) => `o:${i}`)} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-1" aria-label="Options">
            {list.map((o, i) => (
              <OptionRow
                key={i}
                o={o}
                i={i}
                only={list.length === 1}
                onLabel={(v) => rename(i, v)}
                onRemove={() => set(list.filter((_, j) => j !== i))}
                onEnter={() => set([...list.slice(0, i + 1), { value: nextOption(list), label: nextOption(list) }, ...list.slice(i + 1)])}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => set([...list, { value: nextOption(list), label: nextOption(list) }])}
          disabled={list.length >= 100}
          className="press inline-flex h-7 items-center gap-1 rounded-full px-2 text-[12px] font-medium text-ink hover:bg-hover disabled:opacity-40"
        >
          <Plus size={12} />
          Add option
        </button>
        <button
          type="button"
          onClick={async () => {
            const text = await askLines("Paste options", { initial: list.map((o) => o.label).join("\n"), ok: "Use these" });
            if (text) set(linesToOptions(text, list));
          }}
          className="press inline-flex h-7 items-center rounded-full px-2 text-[12px] font-medium text-ink hover:bg-hover"
        >
          Paste
        </button>
        <span className="ml-auto w-[104px]">
          <Select<string>
            value=""
            options={PRESETS.map((p) => ({ value: p.id, label: p.label }))}
            onChange={(id) => set(linesToOptions((PRESETS.find((p) => p.id === id)?.list() ?? []).join("\n"), []))}
            ariaLabel="Presets"
            placeholder="Presets"
            plainPlaceholder
            className={PICK}
          />
        </span>
      </div>
      <Switch label="Other option" on={!!f.other} onChange={(v) => patch({ other: v || undefined })} />
      <Switch label="Shuffle" on={!!f.shuffle} onChange={(v) => patch({ shuffle: v || undefined })} />
      {f.type === "multi" ? (
        <>
          <NumRow label="Min picks" value={f.valid?.min} empty min={0} max={list.length} onChange={(v) => patch({ valid: { ...f.valid, min: v } })} />
          <NumRow label="Max picks" value={f.valid?.max} empty min={1} max={list.length} onChange={(v) => patch({ valid: { ...f.valid, max: v } })} />
        </>
      ) : null}
    </div>
  );
}

function OptionRow({ o, i, only, onLabel, onRemove, onEnter }: { o: Choice; i: number; only: boolean; onLabel: (v: string) => void; onRemove: () => void; onEnter: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `o:${i}` });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`group flex items-center gap-1 ${isDragging ? "relative z-10 opacity-80" : ""}`}>
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Drag option ${i + 1}`}
        className="flex h-7 w-4 shrink-0 cursor-grab items-center justify-center text-faint hover:text-ink active:cursor-grabbing"
      >
        <Grip size={12} />
      </button>
      <input
        value={o.label}
        aria-label={`Option ${i + 1}`}
        onChange={(e) => onLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter();
            requestAnimationFrame(() => (e.currentTarget.closest("ul")?.querySelectorAll("input")[i + 1] as HTMLInputElement | undefined)?.focus());
          }
        }}
        className={INPUT}
      />
      <button
        type="button"
        aria-label={`Remove option ${i + 1}`}
        title="Remove"
        disabled={only}
        onClick={onRemove}
        className="flex size-6 shrink-0 items-center justify-center rounded-full text-faint opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-rose-wash hover:text-rose disabled:hidden"
      >
        <X size={11} />
      </button>
    </li>
  );
}
