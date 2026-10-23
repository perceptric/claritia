"use client";

// Where a field's answer goes (docs/form-studio.md 2.1, "Data"): a contact field, a custom contact field, only the
// fill, or also a property on a connected CRM; and what the answer does to a value the contact already has.

import { CONTACT_KEYS, questionKey, type Field, type Form } from "@/lib/forms/schema";
import type { CustomField } from "@/lib/records/fields";
import { Select } from "../Select";
import type { SourceRow } from "./shared";

export type SavesToProps = {
  field: Field;
  form: Form;
  custom: CustomField[];
  sources: SourceRow[];
  onChange: (patch: Partial<Field>) => void;
};

export function SavesTo({ field, form, custom, onChange }: SavesToProps) {
  const taken = new Set(form.steps.flatMap((s) => s.fields).filter((f) => f.id !== field.id).map((f) => f.key as string));
  const own = field.key.startsWith("q.") ? field.key : questionKey(field.label || "answer", taken);
  const options = [
    ...CONTACT_KEYS.filter((c) => c.types.includes(field.type) && !taken.has(c.key)).map((c) => ({ value: c.key as string, label: c.label })),
    ...custom.filter((c) => !taken.has(`f.${c.key}`)).map((c) => ({ value: `f.${c.key}`, label: c.label })),
    { value: own as string, label: "Only on this fill" },
  ];
  return (
    <Select
      value={field.key as string}
      options={options}
      ariaLabel="Saves to"
      onChange={(v) => onChange({ key: v as Field["key"] })}
      className="h-9 w-full rounded-sm border border-line-strong bg-card px-3 text-[13px]"
    />
  );
}
