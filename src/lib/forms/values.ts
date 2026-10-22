// Checking a visitor's answers against the form (docs/form-builder.md Part 6). The browser runs this to show errors
// as people type; the server runs it again on every submit and trusts nothing the browser sent. Answers to fields
// that rules hid are dropped. Runs in the browser and on the server.

import { allFields, visibility, type Field, type FieldKey, type Form } from "./schema.ts";

export type Answers = Record<string, unknown>;
export type Checked = {
  /** Clean answers by field key, ready to save on the submission. */
  values: Partial<Record<FieldKey, string | number | boolean | string[]>>;
  /** Errors by field id. */
  errors: Record<string, string>;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX = 5000;

/** A website someone typed, as a full https address, or null. */
export function cleanWebsite(raw: string): string | null {
  const v = raw.trim();
  if (!v || /\s/.test(v)) return null;
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(v) ? v : `https://${v}`);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) return null;
    return u.href.slice(0, 1000);
  } catch {
    return null;
  }
}

function one(f: Field, raw: unknown): { value?: string | number | boolean | string[]; error?: string } {
  if (f.type === "checkbox") return { value: raw === true || raw === "true" || raw === "on" };
  if (f.type === "multi") {
    const list = (Array.isArray(raw) ? raw : raw === undefined || raw === null || raw === "" ? [] : [raw]).map(String);
    const ok = new Set((f.options ?? []).map((o) => o.value));
    if (list.some((v) => !ok.has(v))) return { error: "Pick from the list." };
    return { value: [...new Set(list)] };
  }
  const v = typeof raw === "string" ? raw.trim().slice(0, MAX) : typeof raw === "number" ? String(raw) : "";
  if (!v) return {};
  switch (f.type) {
    case "email":
      return EMAIL.test(v) && v.length <= 320 ? { value: v } : { error: "Enter a valid email." };
    case "phone": {
      const digits = v.replace(/\D/g, "");
      return digits.length >= 6 && digits.length <= 16 && /^[+\d\s().-]+$/.test(v) ? { value: v.slice(0, 50) } : { error: "Enter a valid phone number." };
    }
    case "number": {
      const n = Number(v.replace(/,/g, ""));
      return Number.isFinite(n) ? { value: n } : { error: "Enter a number." };
    }
    case "date":
      return DATE.test(v) && !Number.isNaN(Date.parse(v)) ? { value: v } : { error: "Enter a date." };
    case "url": {
      const u = cleanWebsite(v);
      return u ? { value: u } : { error: "Enter a website like acme.com." };
    }
    case "choice":
      return (f.options ?? []).some((o) => o.value === v) ? { value: v } : { error: "Pick from the list." };
    case "country":
      return /^[A-Za-z]{2}$/.test(v) ? { value: v.toUpperCase() } : { error: "Pick a country." };
    case "textarea":
      return { value: v };
    default:
      return { value: v.slice(0, 1000) };
  }
}

/**
 * Check answers keyed by field id. `hidden` holds the values hidden fields picked up on the page (by field id).
 * Only fields on the given steps are checked; pass every step for a whole submit.
 */
export function checkAnswers(form: Form, answers: Answers, opts: { hidden?: Record<string, string>; steps?: number[] } = {}): Checked {
  const { shown, required } = visibility(form, answers);
  const onSteps = new Set((opts.steps ? opts.steps.map((i) => form.steps[i]).filter(Boolean) : form.steps).flatMap((s) => s.fields.map((f) => f.id)));
  const out: Checked = { values: {}, errors: {} };
  for (const f of allFields(form)) {
    if (f.type === "hidden") {
      const hv = opts.hidden?.[f.id];
      if (typeof hv === "string" && hv.trim()) out.values[f.key] = hv.trim().slice(0, 500);
      continue;
    }
    if (!shown.has(f.id)) continue;
    const r = one(f, answers[f.id]);
    if (onSteps.has(f.id)) {
      if (r.error) out.errors[f.id] = r.error;
      else if (required.has(f.id) && (r.value === undefined || r.value === false || (Array.isArray(r.value) && !r.value.length)))
        out.errors[f.id] = f.type === "checkbox" ? "Tick this to go on." : f.type === "choice" || f.type === "multi" || f.type === "country" ? "Pick one." : "Fill this in.";
    }
    if (r.value !== undefined && !r.error && !(Array.isArray(r.value) && !r.value.length)) out.values[f.key] = r.value;
  }
  return out;
}

/** The contact fields in a set of clean answers (before the server cleans the email, phone and website). */
export function contactParts(values: Checked["values"]) {
  const s = (k: FieldKey) => (typeof values[k] === "string" ? (values[k] as string) : undefined);
  let first = s("first_name");
  let last = s("last_name");
  const full = s("name");
  if (full && !first && !last) {
    const parts = full.split(/\s+/);
    first = parts[0];
    last = parts.length > 1 ? parts.slice(1).join(" ") : undefined;
  }
  const fields: Record<string, string | number | boolean | string[]> = {};
  for (const [k, v] of Object.entries(values)) if (k.startsWith("f.") && v !== undefined) fields[k.slice(2)] = v as string;
  return {
    email: s("email"),
    first_name: first?.slice(0, 100),
    last_name: last?.slice(0, 100),
    title: s("title")?.slice(0, 200),
    phone: s("phone"),
    company_name: s("company")?.slice(0, 200),
    website: s("website"),
    country: s("country"),
    region: s("region")?.slice(0, 100),
    fields,
  };
}
