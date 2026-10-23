// What a form answer does to a value the contact already has (docs/form-studio.md 2.1, "Data"). Each contact or
// custom field carries Overwrite, Only fill if empty or Never; a field that doesn't say takes the default: names and
// email always (the person typed their own), everything else only fills a blank. The fill sends the policy for each
// contact value with the contact (p_contact.overwrite), and form_contact_write in
// supabase/migrations/051_form_data.sql applies it. Runs in the browser and on the server.

import { allFields, type Field, type FieldKey, type Form, type Overwrite } from "./schema.ts";

export const OVERWRITES: { value: Overwrite; label: string }[] = [
  { value: "always", label: "Overwrite" },
  { value: "if_empty", label: "Only fill if empty" },
  { value: "never", label: "Never" },
];

const ALWAYS = new Set<string>(["email", "name", "first_name", "last_name"]);

/** The policy a field has when it doesn't set one. Null for answers kept on the fill and for content blocks. */
export function defaultOverwrite(key: FieldKey | string): Overwrite | null {
  if (key.startsWith("q.") || key.startsWith("c.")) return null;
  return ALWAYS.has(key) ? "always" : "if_empty";
}

/** A field's policy for the contact, set or default. */
export const overwriteOf = (f: Pick<Field, "key" | "overwrite">): Overwrite | null => (defaultOverwrite(f.key) ? (f.overwrite ?? defaultOverwrite(f.key)) : null);

/** The contact values a form key writes, named as contact_vals names them (supabase/migrations/034_records.sql). */
export function mergeKeys(key: string): string[] {
  switch (key) {
    case "name":
      return ["first_name", "last_name"];
    case "company":
    case "website":
      return ["company"];
    case "email":
    case "first_name":
    case "last_name":
    case "title":
    case "phone":
    case "country":
    case "region":
      return [key];
    default:
      return /^f\.[a-z][a-z0-9_]{0,39}$/.test(key) ? [key] : [];
  }
}

const RANK: Record<Overwrite, number> = { never: 0, if_empty: 1, always: 2 };
const answered = (v: unknown) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length);

/**
 * For each contact value this fill writes, what it may do to a value that's already there. Only answered fields
 * count, so a value the fill doesn't carry (a country from the visitor's location) merges as before. When two fields
 * write one value (Company and Company website), the stricter policy holds.
 */
export function contactPolicy(form: Pick<Form, "steps">, values: Record<string, unknown>): Record<string, Overwrite> {
  const out: Record<string, Overwrite> = {};
  for (const f of allFields(form)) {
    const p = overwriteOf(f);
    if (!p || !answered(values[f.key])) continue;
    for (const k of mergeKeys(f.key)) out[k] = out[k] !== undefined && RANK[out[k]] <= RANK[p] ? out[k] : p;
  }
  return out;
}
