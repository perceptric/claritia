// The choices in a field's "Saves to" picker (docs/form-studio.md 2.1, "Data"): which Claritia contact fields and
// custom fields a form field can fill, which custom field types a new one can take, and whether a dropdown's options
// match a CRM pick list. The CRM side is in src/lib/sources/properties.ts. Runs in the browser and on the server.

import type { CustomField, FieldKind } from "../records/fields.ts";
import { CONTACT_KEYS, type Choice, type Field, type FieldType, type Form } from "./schema.ts";

/** Custom field types each form field type can fill, best first (customValue in src/lib/records/fields.ts). */
const CUSTOM_ACCEPTS: Partial<Record<FieldType, FieldKind[]>> = {
  text: ["text", "long_text"],
  textarea: ["long_text", "text"],
  email: ["email", "text"],
  phone: ["phone", "text"],
  url: ["url", "text"],
  country: ["text", "select"],
  hidden: ["text", "long_text", "select"],
  number: ["number", "currency", "percent", "text"],
  rating: ["rating", "number", "text"],
  date: ["date", "datetime", "text"],
  checkbox: ["checkbox", "text"],
  choice: ["select", "text"],
  dropdown: ["select", "text"],
  multi: ["multi_select", "text", "long_text"],
};

const TAKES: Partial<Record<FieldKind, string>> = {
  number: "Takes a number",
  currency: "Takes a number",
  percent: "Takes a number",
  rating: "Takes 1 to 5",
  date: "Takes a date",
  datetime: "Takes a date",
  checkbox: "Takes yes or no",
  select: "Takes one of its options",
  multi_select: "Takes several options",
  email: "Takes an email",
  phone: "Takes a phone number",
  url: "Takes a link",
  user: "Takes a teammate",
  relation: "Takes a linked record",
};

/** The custom field types a new field for this form field can take, best first. */
export const customKindsFor = (type: FieldType): FieldKind[] => CUSTOM_ACCEPTS[type] ?? ["text"];

/** Why a field of this type can't fill the custom field, or null when it can. */
export function customFit(field: Pick<Field, "type" | "rating">, c: Pick<CustomField, "type">): string | null {
  const ok = CUSTOM_ACCEPTS[field.type];
  if (!ok) return "Saves nothing";
  if (!ok.includes(c.type)) return TAKES[c.type] ?? "Takes text";
  if (c.type === "rating" && (field.rating?.scale ?? 5) > 5) return "Takes 1 to 5";
  return null;
}

/** Keys other fields on the form already save to. */
export const takenKeys = (form: Pick<Form, "steps">, self: string) => new Set(form.steps.flatMap((s) => s.fields).filter((f) => f.id !== self).map((f) => f.key as string));

/** Built-in contact fields this field can fill: the right type, and not taken by another field. */
export const contactChoices = (field: Pick<Field, "id" | "type">, form: Pick<Form, "steps">) => {
  const taken = takenKeys(form, field.id);
  return CONTACT_KEYS.filter((c) => c.types.includes(field.type) && !taken.has(c.key));
};

/** CRM properties other fields on the form send to, by "<source>:<property>", with that field's label. */
export function takenCrm(form: Pick<Form, "steps">, self: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of form.steps)
    for (const f of s.fields) if (f.id !== self && f.crm && !out.has(`${f.crm.source}:${f.crm.property}`)) out.set(`${f.crm.source}:${f.crm.property}`, f.label || "Another field");
  return out;
}

/** Whether a field's options are already the CRM pick list's (same values and labels, in order). */
export const sameOptions = (a: Choice[] | undefined, b: Choice[] | undefined) =>
  (a ?? []).length === (b ?? []).length && (a ?? []).every((o, i) => o.value === b![i].value && o.label === b![i].label);
