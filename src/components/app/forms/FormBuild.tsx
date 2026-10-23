"use client";

// The Build tab (docs/form-builder.md Part 4): steps and fields, each field's settings, and the rules that show,
// hide or require it. Every change is an op (src/lib/forms/ops.ts), so the chat and clicks share one history.

import { useState } from "react";
import type { Op } from "@/lib/forms/ops";
import { allFields, CONTACT_KEYS, FIELD_TYPES, newId, questionKey, type Field, type FieldKey, type FieldType, type Form, type Rule } from "@/lib/forms/schema";
import type { CustomField } from "@/lib/records/fields";
import { ArrowDown, ArrowUp, Plus, Trash } from "../../Icons";
import { Select } from "../Select";
import { Badge, Button, Field as Labeled, Input, Segmented } from "../ui";
import { IconButton, Toggle } from "./shared";

const SEL = "h-9 w-full rounded-sm border border-line-strong bg-card px-3 text-[13px] hover:border-ink";
const typeLabel = (t: FieldType) => FIELD_TYPES.find((x) => x.value === t)?.label ?? t;

/** Where a field saves, in words: "Contact · Email", "Custom · Budget", "Answer". */
export function keyLabel(key: string, custom: CustomField[]): string {
  const c = CONTACT_KEYS.find((x) => x.key === key);
  if (c) return `Contact · ${c.label}`;
  if (key.startsWith("f.")) return `Field · ${custom.find((x) => x.key === key.slice(2))?.label ?? key.slice(2)}`;
  return "Answer";
}

export function FormBuild({ form, apply, custom, selected, select }: { form: Form; apply: (op: Op) => void; custom: CustomField[]; selected: string | null; select: (id: string | null) => void }) {
  const add = (step: number, type: FieldType) => {
    const id = newId();
    const label = FIELD_TYPES.find((t) => t.value === type)?.label ?? "Question";
    apply({ op: "add_field", step, id, field: { type, label, required: false, ...(type === "hidden" ? { hidden: { from: "param", name: "utm_source" } } : {}) } });
    select(id);
  };
  return (
    <div className="flex flex-col gap-4">
      {form.steps.map((s, si) => (
        <section key={s.id} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-card">
          {form.steps.length > 1 ? (
            <div className="flex items-center gap-2 border-b border-line bg-paper py-1.5 pr-1.5 pl-4">
              <span className="label-mono shrink-0">Step {si + 1}</span>
              <input
                value={s.title ?? ""}
                placeholder="Title"
                onChange={(e) => apply({ op: "update_step", index: si, title: e.target.value })}
                className="h-7 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint"
                aria-label={`Step ${si + 1} title`}
              />
              <IconButton label="Remove step" onClick={() => apply({ op: "remove_step", index: si })} danger>
                <Trash size={14} />
              </IconButton>
            </div>
          ) : null}
          <ul className="divide-y divide-line">
            {s.fields.map((f, fi) => (
              <li key={f.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => select(selected === f.id ? null : f.id)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), select(selected === f.id ? null : f.id))}
                  aria-expanded={selected === f.id}
                  className={`flex items-center gap-2 py-2 pr-2 pl-4 text-[13px] transition-colors duration-[140ms] ${selected === f.id ? "bg-hover" : "hover:bg-hover"} cursor-pointer`}
                >
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {f.label || <span className="text-faint">No label</span>}
                    {f.required ? <span className="ml-0.5 text-muted">*</span> : null}
                  </span>
                  <span className="hidden truncate font-mono text-[11.5px] text-muted sm:inline">{keyLabel(f.key, custom)}</span>
                  <Badge>{typeLabel(f.type)}</Badge>
                  <IconButton label="Move up" disabled={si === 0 && fi === 0} onClick={() => apply(fi > 0 ? { op: "move_field", id: f.id, step: si, index: fi - 1 } : { op: "move_field", id: f.id, step: si - 1, index: 999 })}>
                    <ArrowUp size={14} />
                  </IconButton>
                  <IconButton
                    label="Move down"
                    disabled={si === form.steps.length - 1 && fi === s.fields.length - 1}
                    onClick={() => apply(fi < s.fields.length - 1 ? { op: "move_field", id: f.id, step: si, index: fi + 1 } : { op: "move_field", id: f.id, step: si + 1, index: 0 })}
                  >
                    <ArrowDown size={14} />
                  </IconButton>
                  <IconButton label="Remove field" disabled={f.key === "email"} onClick={() => apply({ op: "remove_field", id: f.id })} danger>
                    <Trash size={14} />
                  </IconButton>
                </div>
                {selected === f.id ? <FieldSettings form={form} field={f} apply={apply} custom={custom} /> : null}
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2 border-t border-line px-4 py-2.5">
            <div className="w-44">
              <Select<string> value="" options={FIELD_TYPES} onChange={(t) => add(si, t as FieldType)} ariaLabel="Add field" placeholder="Add field" plainPlaceholder className="h-9 w-full rounded-sm border border-line-strong bg-card px-3 text-[13px] font-medium hover:border-ink" />
            </div>
          </div>
        </section>
      ))}
      <div>
        <Button variant="ghost" onClick={() => apply({ op: "add_step" })}>
          <Plus size={14} />
          Add step
        </Button>
      </div>
    </div>
  );
}

export function FieldSettings({ form, field: f, apply, custom }: { form: Form; field: Field; apply: (op: Op) => void; custom: CustomField[] }) {
  const patch = (p: Partial<Omit<Field, "id">>) => apply({ op: "update_field", id: f.id, patch: p });
  const taken = new Set(allFields(form).filter((x) => x.id !== f.id).map((x) => x.key as string));
  const keyOptions: { value: string; label: string }[] = [
    { value: "q", label: "Its own answer" },
    ...CONTACT_KEYS.filter((c) => c.types.includes(f.type) && !taken.has(c.key)).map((c) => ({ value: c.key, label: `Contact · ${c.label}` })),
    ...custom.filter((c) => !taken.has(`f.${c.key}`) && ["text", "long_text", "number", "select", "multi_select", "checkbox", "date", "url", "email", "phone"].includes(c.type)).map((c) => ({ value: `f.${c.key}`, label: `Field · ${c.label}` })),
  ];
  const keyValue = f.key.startsWith("q.") ? "q" : f.key;
  const setType = (t: FieldType) => {
    const contact = CONTACT_KEYS.find((c) => c.key === f.key);
    const key: FieldKey = contact && !contact.types.includes(t) ? questionKey(f.label, taken) : f.key;
    patch({ type: t, key });
  };
  const [lines, setLines] = useState((f.options ?? []).map((o) => o.label).join("\n"));
  return (
    <div className="anim-rise-sm grid grid-cols-2 gap-3 border-t border-line bg-paper px-4 py-4">
      <div className={form.capture ? "" : "col-span-2"}>
        <Labeled label="Label">
          <Input value={f.label} onChange={(e) => patch({ label: e.target.value })} />
        </Labeled>
      </div>
      {form.capture ? (
        <Labeled label="Name on your form">
          <Input value={f.source ?? ""} onChange={(e) => patch({ source: e.target.value.trim() || undefined })} placeholder="email" />
        </Labeled>
      ) : null}
      <Labeled label="Type">
        <Select<string> value={f.type} options={FIELD_TYPES} onChange={(t) => setType(t as FieldType)} ariaLabel="Type" className={SEL} />
      </Labeled>
      <Labeled label="Saves to">
        <Select<string>
          value={keyValue}
          options={keyOptions}
          onChange={(k) => patch({ key: k === "q" ? (f.key.startsWith("q.") ? f.key : questionKey(f.label, taken)) : (k as FieldKey) })}
          ariaLabel="Saves to"
          className={SEL}
        />
      </Labeled>
      {f.type !== "hidden" && f.type !== "checkbox" && f.type !== "multi" ? (
        <Labeled label="Placeholder">
          <Input value={f.placeholder ?? ""} onChange={(e) => patch({ placeholder: e.target.value || undefined })} />
        </Labeled>
      ) : null}
      {f.type !== "hidden" ? (
        <Labeled label="Help">
          <Input value={f.help ?? ""} onChange={(e) => patch({ help: e.target.value || undefined })} />
        </Labeled>
      ) : null}
      {f.type === "choice" || f.type === "multi" ? (
        <div className="col-span-2">
          <Labeled label="Options">
            <textarea
              value={lines}
              rows={Math.min(8, Math.max(3, lines.split("\n").length))}
              onChange={(e) => {
                setLines(e.target.value);
                const opts = e.target.value
                  .split("\n")
                  .map((l) => l.trim())
                  .filter(Boolean)
                  .map((l) => ({ value: f.options?.find((o) => o.label === l)?.value ?? l, label: l }));
                if (opts.length) patch({ options: opts });
              }}
              className="w-full rounded-sm border border-line-strong bg-card px-3 py-2 text-[13px] text-ink outline-none focus:border-ink focus:ring-1 focus:ring-ink"
            />
          </Labeled>
        </div>
      ) : null}
      {f.type === "hidden" ? (
        <div className="col-span-2 flex flex-col gap-2">
          <Segmented
            label="Value from"
            value={f.hidden?.from ?? "param"}
            options={[
              { value: "param", label: "URL parameter" },
              { value: "page", label: "Page" },
              { value: "referrer", label: "Referrer" },
              { value: "static", label: "Fixed" },
            ]}
            onChange={(from) => patch({ hidden: { from, ...(from === "param" ? { name: f.hidden?.name || "utm_source" } : {}), ...(from === "static" ? { value: f.hidden?.value ?? "" } : {}) } })}
          />
          {f.hidden?.from === "param" ? (
            <Labeled label="Parameter">
              <Input value={f.hidden.name ?? ""} onChange={(e) => patch({ hidden: { from: "param", name: e.target.value } })} placeholder="utm_source" />
            </Labeled>
          ) : f.hidden?.from === "static" ? (
            <Labeled label="Value">
              <Input value={f.hidden.value ?? ""} onChange={(e) => patch({ hidden: { from: "static", value: e.target.value } })} />
            </Labeled>
          ) : null}
        </div>
      ) : null}
      <div className="col-span-2 flex flex-wrap gap-x-5 gap-y-2">
        {f.type !== "hidden" ? <Toggle label="Required" checked={f.required} disabled={f.key === "email"} onChange={(v) => patch({ required: v })} /> : null}
        {f.type !== "hidden" ? <Toggle label="Half width" checked={f.width === "half"} onChange={(v) => patch({ width: v ? "half" : undefined })} /> : null}
        {f.type === "email" ? <Toggle label="Work emails only" checked={f.check === "work_email"} onChange={(v) => patch({ check: v ? "work_email" : undefined })} /> : null}
        {f.type !== "hidden" ? <Toggle label="Fill from the URL" checked={!!f.prefill} onChange={(v) => patch({ prefill: v || undefined })} /> : null}
      </div>
      {f.key !== "email" && f.type !== "hidden" ? <Rules form={form} field={f} apply={apply} /> : null}
    </div>
  );
}

/** Rules that change this field, in one line each: [Show] when [Company size] [is] [1,000+]. */
function Rules({ form, field, apply }: { form: Form; field: Field; apply: (op: Op) => void }) {
  const mine = form.rules.filter((r) => r.then.field === field.id);
  const others = allFields(form).filter((x) => x.id !== field.id);
  if (!others.length) return null;
  const set = (r: Rule) => apply({ op: "set_rule", rule: r });
  return (
    <div className="col-span-2 flex flex-col gap-2">
      {mine.map((r) => {
        const src = others.find((x) => x.id === r.when.field);
        const pick = src?.type === "choice" || src?.type === "multi";
        return (
          <div key={r.id} className="flex flex-wrap items-center gap-1.5 text-[13px]">
            <div className="w-24">
              <Select<string>
                value={r.then.action}
                options={[
                  { value: "show", label: "Show" },
                  { value: "hide", label: "Hide" },
                  { value: "require", label: "Require" },
                ]}
                onChange={(a) => set({ ...r, then: { ...r.then, action: a as Rule["then"]["action"] } })}
                ariaLabel="Action"
                className={SEL}
              />
            </div>
            <span className="text-muted">when</span>
            <div className="w-40">
              <Select<string> value={r.when.field} options={others.map((x) => ({ value: x.id, label: x.label || x.key }))} onChange={(id) => set({ ...r, when: { ...r.when, field: id } })} ariaLabel="Field" className={SEL} />
            </div>
            <div className="w-28">
              <Select<string>
                value={r.when.op}
                options={[
                  { value: "is", label: "is" },
                  { value: "is_not", label: "isn't" },
                  { value: "filled", label: "is filled" },
                  { value: "empty", label: "is empty" },
                ]}
                onChange={(op) => set({ ...r, when: { field: r.when.field, op: op as Rule["when"]["op"], ...(op === "is" || op === "is_not" ? { value: r.when.value ?? "" } : {}) } })}
                ariaLabel="Condition"
                className={SEL}
              />
            </div>
            {r.when.op === "is" || r.when.op === "is_not" ? (
              <div className="w-36">
                {pick ? (
                  <Select<string> value={r.when.value ?? ""} options={(src?.options ?? []).map((o) => ({ value: o.value, label: o.label }))} onChange={(v) => set({ ...r, when: { ...r.when, value: v } })} ariaLabel="Value" className={SEL} />
                ) : (
                  <Input value={r.when.value ?? ""} onChange={(e) => set({ ...r, when: { ...r.when, value: e.target.value } })} aria-label="Value" />
                )}
              </div>
            ) : null}
            <IconButton label="Remove rule" onClick={() => apply({ op: "remove_rule", id: r.id })} danger>
              <Trash size={14} />
            </IconButton>
          </div>
        );
      })}
      <div>
        <Button variant="plain" onClick={() => set({ id: Math.random().toString(36).slice(2, 10), when: { field: others[0].id, op: "filled" }, then: { action: "show", field: field.id } })}>
          <Plus size={14} />
          Add rule
        </Button>
      </div>
    </div>
  );
}
