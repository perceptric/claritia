"use client";

// The Layers panel: steps and their fields as an outline. Click selects (Shift or Cmd adds to the selection), drag
// reorders or moves a field to another step, and each row has hide on phone, duplicate and delete on hover.

import { useDraggable } from "@dnd-kit/core";
import { useState } from "react";
import type { Op } from "@/lib/forms/ops";
import type { Field, Form } from "@/lib/forms/schema";
import { ChevronRight, Copy, Trash } from "../../Icons";
import { iconFor, nameOf } from "./editorModel";
import { ElementIcon, PhoneOff } from "./icons";

export function Layers({
  form,
  selected,
  hovered,
  dragging,
  onSelect,
  onHover,
  onDuplicate,
  onRemove,
  apply,
}: {
  form: Form;
  selected: string[];
  hovered: string | null;
  dragging: string | null;
  onSelect: (id: string, add: boolean) => void;
  onHover: (id: string | null) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  apply: (op: Op | Op[]) => void;
}) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  return (
    <div data-layers="" className="flex flex-col py-2" role="tree" aria-label="Layers">
      {form.steps.map((s, si) => {
        const open = !closed.has(s.id);
        return (
          <div key={s.id} role="treeitem" aria-expanded={open} aria-selected={false}>
            <div data-layer-step={si} className="flex h-7 items-center gap-1 px-2 text-[12px] font-medium text-ink">
              <button
                type="button"
                aria-label={open ? `Collapse step ${si + 1}` : `Expand step ${si + 1}`}
                onClick={() => setClosed((c) => (c.has(s.id) ? new Set([...c].filter((x) => x !== s.id)) : new Set([...c, s.id])))}
                className="flex size-5 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink"
              >
                <ChevronRight size={12} className={`transition-transform duration-[140ms] ${open ? "rotate-90" : ""}`} />
              </button>
              <span className="truncate">{`Step ${si + 1}`}</span>
              {s.title ? <span className="truncate font-normal text-muted">{s.title}</span> : null}
              <span className="ml-auto pr-1 text-[11px] font-normal text-faint tabular-nums">{s.fields.length}</span>
            </div>
            {open ? (
              <div role="group">
                {s.fields.map((f, i) => (
                  <LayerRow
                    key={f.id}
                    f={f}
                    si={si}
                    index={i}
                    on={selected.includes(f.id)}
                    hover={hovered === f.id}
                    dragging={dragging === f.id}
                    onSelect={onSelect}
                    onHover={onHover}
                    onDuplicate={onDuplicate}
                    onRemove={onRemove}
                    apply={apply}
                  />
                ))}
                {!s.fields.length ? <div className="h-6" /> : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function LayerRow({
  f,
  si,
  index,
  on,
  hover,
  dragging,
  onSelect,
  onHover,
  onDuplicate,
  onRemove,
  apply,
}: {
  f: Field;
  si: number;
  index: number;
  on: boolean;
  hover: boolean;
  dragging: boolean;
  onSelect: (id: string, add: boolean) => void;
  onHover: (id: string | null) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  apply: (op: Op | Op[]) => void;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: `l:${f.id}`, data: { kind: "field", id: f.id } });
  const show = on || hover ? "" : "opacity-0 group-focus-within:opacity-100";
  const act = "flex size-6 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink";
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-layer-row=""
      data-layer-id={f.id}
      data-step={si}
      data-index={index}
      role="treeitem"
      aria-selected={on}
      aria-label={nameOf(f)}
      tabIndex={0}
      onClick={(e) => onSelect(f.id, e.shiftKey || e.metaKey || e.ctrlKey)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onSelect(f.id, e.shiftKey);
        }
      }}
      onMouseEnter={() => onHover(f.id)}
      onMouseLeave={() => onHover(null)}
      className={`group mx-1.5 flex h-7 cursor-default items-center gap-2 rounded-sm pr-1 pl-7 text-[12.5px] outline-none ${dragging ? "opacity-40" : ""} ${on ? "bg-clay-wash text-ink" : hover ? "bg-hover text-ink" : "text-body"} focus-visible:ring-1 focus-visible:ring-ink`}
    >
      <ElementIcon name={iconFor(f)} size={13} className={on ? "text-clay" : "text-muted"} />
      <span className="min-w-0 flex-1 truncate">
        {nameOf(f)}
        {f.required ? <span className="text-muted">*</span> : null}
      </span>
      <span className="flex items-center" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        <button
          type="button"
          aria-label={f.hideOnPhone ? "Show on phone" : "Hide on phone"}
          title={f.hideOnPhone ? "Show on phone" : "Hide on phone"}
          aria-pressed={!!f.hideOnPhone}
          onClick={() => apply({ op: "update_field", id: f.id, patch: { hideOnPhone: f.hideOnPhone ? undefined : true } })}
          className={`${act} ${f.hideOnPhone ? "text-clay" : show}`}
        >
          <PhoneOff size={12} />
        </button>
        <button type="button" aria-label="Duplicate" title="Duplicate" onClick={() => onDuplicate(f.id)} className={`${act} ${show}`}>
          <Copy size={12} />
        </button>
        <button
          type="button"
          aria-label="Delete"
          title="Delete"
          disabled={f.key === "email"}
          onClick={() => onRemove(f.id)}
          className={`${act} ${show} hover:bg-rose-wash hover:text-rose disabled:opacity-35`}
        >
          <Trash size={12} />
        </button>
      </span>
    </div>
  );
}
