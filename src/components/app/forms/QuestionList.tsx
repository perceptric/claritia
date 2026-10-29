"use client";

// The form's questions, as the visitor reads them, edited in place (docs/form-builder.md 4.4). Click a question and
// it drops down: its wording, type, answers to pick from, required, move and delete. "Add a question" puts a new one
// at the end. Every change is an op on the form, so undo and the assistant see the same edits.

import { useState } from "react";
import type { Op } from "@/lib/forms/ops";
import { FIELD_TYPES, isChoice, isContent, newId, type Field, type FieldType, type Form } from "@/lib/forms/schema";
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash } from "../../Icons";
import { Select } from "../Select";
import { Button, IconButton, Input, Toggle } from "../ui";

const TYPES = FIELD_TYPES.filter((t) => !["hidden", "calc", "heading", "paragraph", "divider", "image"].includes(t.value));
const typeLabel = (t: FieldType) => FIELD_TYPES.find((x) => x.value === t)?.label ?? "Question";

export function QuestionList({ form, apply }: { form: Form; apply: (op: Op | Op[]) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const multi = form.steps.length > 1;
  const add = () => {
    const id = newId();
    apply({ op: "add_field", id, field: { type: "text", label: "New question", required: false } });
    setOpen(id);
  };
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-5 rounded-[16px] border border-line bg-card p-6 shadow-[0_12px_32px_-16px_rgb(10_10_10/0.18)] md:p-8">
      {form.title ? <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">{form.title}</h2> : null}
      {form.steps.map((s, si) => (
        <div key={s.id} className="flex flex-col gap-2">
          {multi ? <span className="font-mono text-[10.5px] tracking-[0.06em] text-faint uppercase">{s.title || `Step ${si + 1}`}</span> : null}
          {s.fields.map((f, fi) =>
            isContent(f.type) ? null : (
              <Question
                key={f.id}
                f={f}
                open={open === f.id}
                toggle={() => setOpen(open === f.id ? null : f.id)}
                apply={apply}
                move={(d) => apply({ op: "move_field", id: f.id, step: si, index: fi + d })}
                first={fi === 0}
                last={fi === s.fields.length - 1}
              />
            ),
          )}
        </div>
      ))}
      <button type="button" onClick={add} className="press flex h-10 items-center justify-center gap-1.5 rounded-sm border border-dashed border-line-strong text-[13px] font-medium text-muted transition-colors duration-[120ms] hover:border-ink hover:text-ink">
        <Plus size={14} />
        Add a question
      </button>
      <div className="pointer-events-none flex h-11 items-center justify-center rounded-full bg-ink text-[14px] font-medium text-paper">{form.submit.label}</div>
    </div>
  );
}

function Question({ f, open, toggle, apply, move, first, last }: { f: Field; open: boolean; toggle: () => void; apply: (op: Op | Op[]) => void; move: (d: number) => void; first: boolean; last: boolean }) {
  const set = (patch: Partial<Omit<Field, "id">>) => apply({ op: "update_field", id: f.id, patch });
  const choices = f.options ?? [];
  return (
    <div className={`rounded-[10px] border transition-colors duration-[120ms] ${open ? "border-ink" : "border-transparent hover:border-line-strong"}`}>
      <button type="button" aria-expanded={open} onClick={toggle} className="flex w-full flex-col gap-1.5 px-3 py-2.5 text-left">
        <span className="flex items-center gap-2 text-[13.5px] font-medium text-ink">
          <span className="min-w-0 flex-1 truncate">
            {f.label}
            {f.required ? <span className="text-faint"> *</span> : null}
          </span>
          <span className="text-[12px] font-normal text-muted">{typeLabel(f.type)}</span>
          <ChevronDown size={13} className={`text-faint transition-transform duration-[200ms] ${open ? "rotate-180" : ""}`} />
        </span>
        {isChoice(f.type) && !open ? (
          <span className="flex flex-wrap gap-1.5">
            {choices.slice(0, 6).map((c) => (
              <span key={c.value} className="rounded-sm border border-line px-2 py-1 text-[12px] text-body">
                {c.label}
              </span>
            ))}
          </span>
        ) : !open ? (
          <span className={`block rounded-sm border border-line-strong ${f.type === "textarea" ? "h-16" : "h-9"}`} />
        ) : null}
      </button>
      {open ? (
        <div className="anim-rise-sm flex flex-col gap-3 border-t border-line px-3 pt-3 pb-3">
          <Input aria-label="Question" value={f.label} onChange={(e) => set({ label: e.target.value })} />
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-44">
              <Select<FieldType> value={f.type} options={TYPES} onChange={(t) => set({ type: t, ...(isChoice(t) && !choices.length ? { options: [{ value: "Option 1", label: "Option 1" }] } : {}) })} ariaLabel="Type" />
            </span>
            <span className="flex items-center gap-2 text-[13px] text-body">
              Required
              <Toggle label="Required" on={f.required} onChange={(v) => set({ required: v })} />
            </span>
            <span className="ml-auto flex items-center gap-1">
              <IconButton label="Move up" disabled={first} onClick={() => move(-1)}>
                <ArrowUp size={14} />
              </IconButton>
              <IconButton label="Move down" disabled={last} onClick={() => move(1)}>
                <ArrowDown size={14} />
              </IconButton>
              <IconButton label="Delete question" onClick={() => apply({ op: "remove_field", id: f.id })}>
                <Trash size={14} />
              </IconButton>
            </span>
          </div>
          {isChoice(f.type) ? (
            <div className="flex flex-col gap-1.5">
              {choices.map((c, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <Input
                    aria-label={`Answer ${i + 1}`}
                    value={c.label}
                    onChange={(e) => set({ options: choices.map((x, j) => (j === i ? { value: e.target.value, label: e.target.value } : x)) })}
                  />
                  <IconButton label="Remove answer" disabled={choices.length < 2} onClick={() => set({ options: choices.filter((_, j) => j !== i) })}>
                    <Trash size={13} />
                  </IconButton>
                </span>
              ))}
              <span>
                <Button size="sm" variant="ghost" onClick={() => set({ options: [...choices, { value: `Option ${choices.length + 1}`, label: `Option ${choices.length + 1}` }] })}>
                  <Plus size={13} />
                  Add an answer
                </Button>
              </span>
            </div>
          ) : (
            <Input aria-label="Placeholder" placeholder="Placeholder" value={f.placeholder ?? ""} onChange={(e) => set({ placeholder: e.target.value || undefined })} />
          )}
        </div>
      ) : null}
    </div>
  );
}
