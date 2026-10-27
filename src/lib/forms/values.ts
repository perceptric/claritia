// Checking a visitor's answers against the form (docs/form-builder.md Part 6). The browser runs this to show errors
// as people type; the server runs it again on every submit and trusts nothing the browser sent. Answers to fields
// that rules hid are dropped. Runs in the browser and on the server.

import { allFields, isChoice, isContent, nextStep, optionsFor, visibility, withCalcs, type Choice, type Field, type FieldKey, type Form, type RunCtx } from "./schema.ts";

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

/** An "Other" answer: the visitor's own words after the prefix. */
export const OTHER = "Other: ";
const isOther = (f: Field, v: string) => !!f.other && v.startsWith(OTHER) && v.length > OTHER.length && v.length <= OTHER.length + 200;

function one(f: Field, raw: unknown, opts: Choice[]): { value?: string | number | boolean | string[]; error?: string } {
  const r = base(f, raw, opts);
  // A field's own words for a failed check win over the default ones.
  return r.error && f.valid?.message ? { error: f.valid.message } : r;
}

function base(f: Field, raw: unknown, opts: Choice[]): { value?: string | number | boolean | string[]; error?: string } {
  const c = f.valid ?? {};
  if (f.type === "checkbox") return { value: raw === true || raw === "true" || raw === "on" };
  if (f.type === "multi") {
    const list = (Array.isArray(raw) ? raw : raw === undefined || raw === null || raw === "" ? [] : [raw]).map(String);
    const ok = new Set(opts.map((o) => o.value));
    if (list.some((v) => !ok.has(v) && !isOther(f, v))) return { error: "Pick from the list." };
    const value = [...new Set(list)];
    if (value.length && c.min !== undefined && value.length < c.min) return { error: `Pick at least ${c.min}.` };
    if (c.max !== undefined && value.length > c.max) return { error: `Pick up to ${c.max}.` };
    return { value };
  }
  const v = typeof raw === "string" ? raw.trim().slice(0, MAX) : typeof raw === "number" ? String(raw) : "";
  if (!v) return {};
  const chars = (out: string) => {
    if (c.min !== undefined && out.length < c.min) return { error: `Use at least ${c.min} characters.` };
    if (c.max !== undefined && out.length > c.max) return { error: `Use up to ${c.max} characters.` };
    return { value: out };
  };
  switch (f.type) {
    case "email": {
      if (!EMAIL.test(v) || v.length > 320) return { error: "Enter a valid email." };
      const domain = v.split("@")[1]!.toLowerCase();
      if (c.domains?.length && !c.domains.some((d) => domain === d || domain.endsWith(`.${d}`))) return { error: "Use an email at an allowed company domain." };
      return { value: v };
    }
    case "phone": {
      const digits = v.replace(/\D/g, "");
      return digits.length >= 6 && digits.length <= 16 && /^[+\d\s().-]+$/.test(v) ? { value: v.slice(0, 50) } : { error: "Enter a valid phone number." };
    }
    case "number":
    case "rating": {
      const n = Number(v.replace(/,/g, ""));
      if (!Number.isFinite(n)) return { error: "Enter a number." };
      if (f.type === "rating") {
        const scale = f.rating?.scale ?? 5;
        return Number.isInteger(n) && n >= 1 && n <= scale ? { value: n } : { error: `Pick 1 to ${scale}.` };
      }
      if (c.min !== undefined && n < c.min) return { error: `Enter ${c.min} or more.` };
      if (c.max !== undefined && n > c.max) return { error: `Enter ${c.max} or less.` };
      if (c.step && Math.abs(n / c.step - Math.round(n / c.step)) > 1e-9) return { error: `Use steps of ${c.step}.` };
      return { value: n };
    }
    case "date": {
      if (!DATE.test(v) || Number.isNaN(Date.parse(v))) return { error: "Enter a date." };
      if (c.earliest && v < c.earliest) return { error: `Pick ${c.earliest} or later.` };
      if (c.latest && v > c.latest) return { error: `Pick ${c.latest} or earlier.` };
      const day = new Date(`${v}T00:00:00Z`).getUTCDay();
      if (c.weekdays && (day === 0 || day === 6)) return { error: "Pick a weekday." };
      return { value: v };
    }
    case "url": {
      const u = cleanWebsite(v);
      if (u && c.https && !u.startsWith("https://")) return { error: "Use a link that starts with https://." };
      return u ? chars(u) : { error: "Enter a website like acme.com." };
    }
    case "choice":
    case "dropdown":
      return opts.some((o) => o.value === v) || isOther(f, v) ? { value: v } : { error: "Pick from the list." };
    case "country":
      return /^[A-Za-z]{2}$/.test(v) ? { value: v.toUpperCase() } : { error: "Pick a country." };
    case "textarea":
      return chars(v);
    default:
      return chars(v.slice(0, 1000));
  }
}

/**
 * Check answers keyed by field id. `hidden` holds the values hidden fields picked up on the page (by field id).
 * Only fields on the given steps are checked; pass every step for a whole submit.
 */
/**
 * Check answers. `known`: field ids the form hid because enrichment already knows them (fill before submit); they
 * count as not shown, so they're neither required nor kept.
 */
export function checkAnswers(form: Form, answers: Answers, opts: { hidden?: Record<string, string>; steps?: number[]; known?: Set<string> } & RunCtx = {}): Checked {
  const ctx: RunCtx = { today: opts.today, regions: opts.regions };
  // Calcs are worked out here from the answers; whatever the browser sent for one is never read.
  const all = withCalcs(form, answers, ctx);
  const { shown, required } = visibility(form, answers, ctx);
  const onSteps = new Set((opts.steps ? opts.steps.map((i) => form.steps[i]).filter(Boolean) : form.steps).flatMap((s) => s.fields.map((f) => f.id)));
  // Steps a skip jumped over count as not shown: nothing on them is required or kept.
  const path = stepPath(form, answers, ctx);
  const skipped = new Set(form.steps.filter((_, i) => !path.includes(i)).flatMap((s) => s.fields.map((f) => f.id)));
  const out: Checked = { values: {}, errors: {} };
  for (const f of allFields(form)) {
    if (isContent(f.type)) continue;
    if (f.type === "hidden") {
      const hv = opts.hidden?.[f.id];
      if (typeof hv === "string" && hv.trim()) out.values[f.key] = hv.trim().slice(0, 500);
      continue;
    }
    if (!shown.has(f.id) || skipped.has(f.id) || opts.known?.has(f.id)) continue;
    if (f.type === "calc") {
      if (typeof all[f.id] === "number") out.values[f.key] = all[f.id] as number;
      continue;
    }
    const r = one(f, answers[f.id], optionsFor(f, answers, ctx));
    if (onSteps.has(f.id)) {
      if (r.error) out.errors[f.id] = r.error;
      else if (required.has(f.id) && (r.value === undefined || r.value === false || (Array.isArray(r.value) && !r.value.length)))
        out.errors[f.id] = f.valid?.requiredMessage ?? (f.type === "checkbox" ? "Tick this to go on." : isChoice(f.type) || f.type === "country" || f.type === "rating" ? "Pick one." : "Fill this in.");
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

/** The steps a visitor goes through given the answers, following each step's skip. */
export function stepPath(form: Form, answers: Answers, ctx: RunCtx = {}): number[] {
  const path: number[] = [];
  for (let i = 0; i < form.steps.length && path.length <= form.steps.length; i = nextStep(form, i, answers, ctx)) path.push(i);
  return path;
}
