// The Design tab's logic, kept apart from the screens so it can be tested (docs/form-studio.md Part 2): the element
// list, how fields sit in rows on the 6-column grid, what a drop or a move turns into (always ops from
// src/lib/forms/ops.ts, so undo and saving keep working), option presets, Google Fonts and theme presets.

import type { Tokens } from "../../../lib/forms/brand.ts";
import { COUNTRY_CODES } from "../../../lib/forms/countries.ts";
import type { FieldInput, Op } from "../../../lib/forms/ops.ts";
import { allFields, everyOption, isChoice, isContent, OP_KIND, opsFor, questionKey, type Cond, type Field, type FieldWidth, type Form, type Op as CondOp, type Rule } from "../../../lib/forms/schema.ts";

// Tabs ----------------------------------------------------------------------------------------------------------

export type Tab = "design" | "settings" | "share" | "results";
export const TABS: Tab[] = ["design", "settings", "share", "results"];

/** The tab to open, from the address (?tab=design|settings|share|results); old names still land; else Design. */
export function pickTab(search: string): Tab {
  const param = new URLSearchParams(search).get("tab") ?? "";
  const old: Record<string, Tab> = { build: "design", connect: "settings" };
  return (TABS as string[]).includes(param) ? (param as Tab) : (old[param] ?? "design");
}

// Devices -------------------------------------------------------------------------------------------------------

export type Device = "desktop" | "tablet" | "phone";
/** The form's own width: narrow 480, wide 720, or the custom px. */
export const formWidth = (layout: Form["layout"]) => layout.maxWidth ?? (layout.width === "wide" ? 720 : 480);
/** The frame each device draws on the stage. */
export const frameWidth = (device: Device, layout: Form["layout"]) => (device === "phone" ? 390 : device === "tablet" ? 768 : formWidth(layout) + 96);

// Rows ----------------------------------------------------------------------------------------------------------

export const SPAN: Record<FieldWidth, number> = { full: 6, half: 3, third: 2, two_thirds: 4 };
export const WIDTH_LABEL: Record<FieldWidth, string> = { full: "Full", half: "½", third: "⅓", two_thirds: "⅔" };
/** Hidden fields and content blocks are always a whole row; on a phone everything is. */
export const spanOf = (f: Field, phone = false) => (phone || isContent(f.type) || f.type === "hidden" ? 6 : SPAN[f.width ?? "full"]);

/** Rows of a step, as lists of field indexes, filled left to right like the grid does. */
export function rowsOf(spans: number[]): number[][] {
  const rows: number[][] = [];
  let used = 6;
  spans.forEach((s, i) => {
    if (used + s > 6) {
      rows.push([]);
      used = 0;
    }
    rows[rows.length - 1].push(i);
    used += s;
  });
  return rows;
}

export function where(form: Form, id: string): { step: number; index: number } | null {
  for (let s = 0; s < form.steps.length; s++) {
    const i = form.steps[s].fields.findIndex((f) => f.id === id);
    if (i >= 0) return { step: s, index: i };
  }
  return null;
}

// Drops and moves -----------------------------------------------------------------------------------------------

export type Dragged = { kind: "new"; id: string; input: FieldInput } | { kind: "move"; id: string };
/** Where a drop lands: at an index in a step, or beside a field (which makes a row). */
export type Target = { step: number; index: number } | { step: number; beside: string; side: "left" | "right" };

/** A field may sit beside another only when neither is a content block or hidden. */
export const canSit = (type: Field["type"]) => !isContent(type) && type !== "hidden";

/** The ops a drop turns into. An empty list means nothing changes. */
export function planDrop(form: Form, item: Dragged, target: Target): Op[] {
  const step = form.steps[target.step];
  if (!step) return [];
  const place = (index: number): Op[] => {
    if (item.kind === "new") {
      const add: Op = { op: "add_field", step: target.step, id: item.id, field: item.input };
      return index >= step.fields.length ? [add] : [add, { op: "move_field", id: item.id, step: target.step, index }];
    }
    const from = where(form, item.id);
    if (!from) return [];
    // move_field takes the field out first, so a later index in the same step moves up by one.
    const to = from.step === target.step && from.index < index ? index - 1 : index;
    if (from.step === target.step && from.index === to) return [];
    return [{ op: "move_field", id: item.id, step: target.step, index: to }];
  };
  if ("index" in target) return place(Math.max(0, Math.min(target.index, step.fields.length)));

  const tIndex = step.fields.findIndex((f) => f.id === target.beside);
  if (tIndex < 0 || target.beside === item.id) return [];
  const rows = rowsOf(step.fields.map((f) => spanOf(f)));
  const row = rows.find((r) => r.includes(tIndex))!;
  const members = row.map((i) => step.fields[i].id).filter((id) => id !== item.id);
  const n = members.length + 1;
  // A fourth field won't fit beside the others: it goes under the row instead.
  if (n > 3) return place(row[row.length - 1] + 1);
  const list = step.fields.map((f) => f.id).filter((id) => id !== item.id);
  const at = list.indexOf(target.beside) + (target.side === "right" ? 1 : 0);
  const width: FieldWidth = n === 2 ? "half" : "third";
  let ops: Op[];
  if (item.kind === "new") {
    ops = [{ op: "add_field", step: target.step, id: item.id, field: { ...item.input, width } }];
    if (at < list.length) ops.push({ op: "move_field", id: item.id, step: target.step, index: at });
  } else {
    const from = where(form, item.id);
    if (!from) return [];
    ops = from.step === target.step && step.fields.findIndex((f) => f.id === item.id) === at ? [] : [{ op: "move_field", id: item.id, step: target.step, index: at }];
  }
  for (const id of [...members, ...(item.kind === "move" ? [item.id] : [])]) {
    const f = allFields(form).find((x) => x.id === id);
    if (f && (f.width ?? "full") !== width) ops.push({ op: "update_field", id, patch: { width } });
  }
  return ops;
}

/** Cmd+Up and Cmd+Down: one place up or down, across into the next step at the ends. */
export function nudge(form: Form, id: string, dir: -1 | 1): Op | null {
  const at = where(form, id);
  if (!at) return null;
  const n = form.steps[at.step].fields.length;
  if (dir < 0 && at.index > 0) return { op: "move_field", id, step: at.step, index: at.index - 1 };
  if (dir > 0 && at.index < n - 1) return { op: "move_field", id, step: at.step, index: at.index + 1 };
  if (dir < 0 && at.step > 0) return { op: "move_field", id, step: at.step - 1, index: form.steps[at.step - 1].fields.length };
  if (dir > 0 && at.step < form.steps.length - 1) return { op: "move_field", id, step: at.step + 1, index: 0 };
  return null;
}

/** A copy of a field right after it. Content keeps its words; a question gets "copy" so its key stays its own. */
export function duplicateOp(field: Field, id: string): Op {
  const rest: Partial<Field> = { ...field };
  delete rest.id;
  delete rest.key;
  delete rest.crm;
  const label = isContent(field.type) || !field.label ? field.label : `${field.label} copy`;
  return { op: "add_field", after: field.id, id, field: { ...(rest as FieldInput), label } };
}

/** A new element goes under the selected field, else at the end of the last step. */
export function addOp(form: Form, input: FieldInput, id: string, after: string | null): Op {
  return after && where(form, after) ? { op: "add_field", after, id, field: input } : { op: "add_field", step: form.steps.length - 1, id, field: input };
}

// Elements ------------------------------------------------------------------------------------------------------

export type ElementGroup = "Contact" | "Questions" | "Content" | "Advanced";
export type ElementDef = { id: string; name: string; group: ElementGroup; icon: string; make: (form: Form) => FieldInput };

const opts = (...l: string[]) => l.map((v) => ({ value: v, label: v }));
const OPT3 = opts("Option 1", "Option 2", "Option 3");
const own = (form: Form, label: string) => questionKey(label, new Set(allFields(form).map((f) => f.key as string)));

export const ELEMENTS: ElementDef[] = [
  { id: "email", name: "Email", group: "Contact", icon: "at", make: () => ({ key: "email", type: "email", label: "Work email" }) },
  { id: "first_name", name: "First name", group: "Contact", icon: "user", make: () => ({ key: "first_name", type: "text", label: "First name", width: "half" }) },
  { id: "last_name", name: "Last name", group: "Contact", icon: "user", make: () => ({ key: "last_name", type: "text", label: "Last name", width: "half" }) },
  { id: "full_name", name: "Full name", group: "Contact", icon: "id", make: () => ({ key: "name", type: "text", label: "Full name" }) },
  { id: "phone", name: "Phone", group: "Contact", icon: "phone", make: () => ({ key: "phone", type: "phone", label: "Phone" }) },
  { id: "company", name: "Company", group: "Contact", icon: "building", make: () => ({ key: "company", type: "text", label: "Company" }) },
  { id: "job_title", name: "Job title", group: "Contact", icon: "briefcase", make: () => ({ key: "title", type: "text", label: "Job title" }) },
  { id: "website", name: "Website", group: "Contact", icon: "globe", make: () => ({ key: "website", type: "url", label: "Company website" }) },
  { id: "country", name: "Country", group: "Contact", icon: "flag", make: () => ({ key: "country", type: "country", label: "Country" }) },
  { id: "state", name: "State", group: "Contact", icon: "pin", make: () => ({ key: "region", type: "text", label: "State" }) },
  { id: "short", name: "Short answer", group: "Questions", icon: "short", make: (f) => ({ key: own(f, "Question"), type: "text", label: "Question" }) },
  { id: "long", name: "Long answer", group: "Questions", icon: "long", make: (f) => ({ key: own(f, "Tell us more"), type: "textarea", label: "Tell us more" }) },
  { id: "dropdown", name: "Dropdown", group: "Questions", icon: "dropdown", make: (f) => ({ key: own(f, "Choose one"), type: "dropdown", label: "Choose one", options: OPT3 }) },
  { id: "choice", name: "Single choice", group: "Questions", icon: "radio", make: (f) => ({ key: own(f, "Pick one"), type: "choice", label: "Pick one", options: OPT3 }) },
  { id: "multi", name: "Multiple choice", group: "Questions", icon: "checklist", make: (f) => ({ key: own(f, "Pick any"), type: "multi", label: "Pick any", options: OPT3 }) },
  { id: "checkbox", name: "Checkbox", group: "Questions", icon: "check", make: (f) => ({ key: own(f, "I agree"), type: "checkbox", label: "I agree" }) },
  { id: "number", name: "Number", group: "Questions", icon: "hash", make: (f) => ({ key: own(f, "How many"), type: "number", label: "How many?" }) },
  { id: "date", name: "Date", group: "Questions", icon: "calendar", make: (f) => ({ key: own(f, "Date"), type: "date", label: "Date" }) },
  {
    id: "rating",
    name: "Rating",
    group: "Questions",
    icon: "star",
    make: (f) => ({ key: own(f, "Rating"), type: "rating", label: "How likely are you to recommend us?", rating: { scale: 5, style: "stars" } }),
  },
  { id: "link", name: "Link", group: "Questions", icon: "link", make: (f) => ({ key: own(f, "Link"), type: "url", label: "Link" }) },
  { id: "calc", name: "Calculation", group: "Questions", icon: "calc", make: (f) => ({ key: own(f, "Total"), type: "calc", label: "Total", calc: { formula: "0" } }) },
  { id: "heading", name: "Heading", group: "Content", icon: "heading", make: () => ({ type: "heading", label: "Heading", content: { text: "Heading", level: 2 } }) },
  { id: "text", name: "Text", group: "Content", icon: "text", make: () => ({ type: "paragraph", label: "Text", content: { text: "Write something here." } }) },
  { id: "divider", name: "Divider", group: "Content", icon: "divider", make: () => ({ type: "divider", label: "Divider" }) },
  { id: "image", name: "Image", group: "Content", icon: "image", make: () => ({ type: "image", label: "Image", content: { src: "", alt: "" } }) },
  {
    id: "hidden",
    name: "Hidden field",
    group: "Advanced",
    icon: "hidden",
    make: (f) => ({ key: own(f, "utm source"), type: "hidden", label: "UTM source", hidden: { from: "param", name: "utm_source" } }),
  },
];
export const ELEMENT_GROUPS: ElementGroup[] = ["Contact", "Questions", "Content", "Advanced"];

export function findElements(q: string): ElementDef[] {
  const s = q.trim().toLowerCase();
  return s ? ELEMENTS.filter((e) => e.name.toLowerCase().includes(s) || e.group.toLowerCase().includes(s)) : ELEMENTS;
}

/** Which icon a field shows in layers and on its name tag. */
export function iconFor(f: Field): string {
  const byKey: Record<string, string> = {
    email: "at",
    first_name: "user",
    last_name: "user",
    name: "id",
    phone: "phone",
    company: "building",
    title: "briefcase",
    website: "globe",
    country: "flag",
    region: "pin",
  };
  if (byKey[f.key]) return byKey[f.key];
  const byType: Partial<Record<Field["type"], string>> = {
    text: "short",
    email: "at",
    phone: "phone",
    textarea: "long",
    number: "hash",
    choice: "radio",
    multi: "checklist",
    dropdown: "dropdown",
    checkbox: "check",
    country: "flag",
    date: "calendar",
    url: "link",
    rating: "star",
    hidden: "hidden",
    calc: "calc",
    heading: "heading",
    paragraph: "text",
    divider: "divider",
    image: "image",
  };
  return byType[f.type] ?? "short";
}

/** A short name for a field in layers and name tags. */
export function nameOf(f: Field): string {
  if (f.type === "heading" || f.type === "paragraph") return f.content?.text?.split("\n")[0]?.slice(0, 60) || (f.type === "heading" ? "Heading" : "Text");
  if (f.type === "divider") return "Divider";
  if (f.type === "image") return f.content?.alt || "Image";
  return f.label || "No label";
}

// Options -------------------------------------------------------------------------------------------------------

export const US_STATES = [
  "Alabama",
  "Alaska",
  "Arizona",
  "Arkansas",
  "California",
  "Colorado",
  "Connecticut",
  "Delaware",
  "District of Columbia",
  "Florida",
  "Georgia",
  "Hawaii",
  "Idaho",
  "Illinois",
  "Indiana",
  "Iowa",
  "Kansas",
  "Kentucky",
  "Louisiana",
  "Maine",
  "Maryland",
  "Massachusetts",
  "Michigan",
  "Minnesota",
  "Mississippi",
  "Missouri",
  "Montana",
  "Nebraska",
  "Nevada",
  "New Hampshire",
  "New Jersey",
  "New Mexico",
  "New York",
  "North Carolina",
  "North Dakota",
  "Ohio",
  "Oklahoma",
  "Oregon",
  "Pennsylvania",
  "Rhode Island",
  "South Carolina",
  "South Dakota",
  "Tennessee",
  "Texas",
  "Utah",
  "Vermont",
  "Virginia",
  "Washington",
  "West Virginia",
  "Wisconsin",
  "Wyoming",
];
export const COMPANY_SIZES = ["1–10", "11–50", "51–200", "201–500", "501–1,000", "1,001–5,000", "5,001+"];
export const INDUSTRIES = [
  "Software",
  "Financial services",
  "Healthcare",
  "Education",
  "Retail and ecommerce",
  "Manufacturing",
  "Media and entertainment",
  "Professional services",
  "Real estate",
  "Travel and hospitality",
  "Logistics",
  "Energy",
  "Government",
  "Nonprofit",
  "Telecommunications",
  "Agriculture",
  "Construction",
  "Other",
];
export function countryOptions(): string[] {
  let dn: Intl.DisplayNames | null = null;
  try {
    dn = new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    dn = null;
  }
  return COUNTRY_CODES.map((c) => dn?.of(c) ?? c).sort((a, b) => a.localeCompare(b));
}
export const PRESETS: { id: string; label: string; list: () => string[] }[] = [
  { id: "countries", label: "Countries", list: countryOptions },
  { id: "states", label: "US states", list: () => US_STATES },
  { id: "sizes", label: "Company sizes", list: () => COMPANY_SIZES },
  { id: "industries", label: "Industries", list: () => INDUSTRIES },
];

/** Options from pasted lines: trimmed, no repeats, at most 100. A label that was there keeps its value. */
export function linesToOptions(text: string, existing: { value: string; label: string }[] = []): { value: string; label: string }[] {
  const seen = new Set<string>();
  const out: { value: string; label: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const label = raw
      .replace(/^[-*•]\s+/, "")
      .trim()
      .slice(0, 200);
    if (!label) continue;
    const value = existing.find((o) => o.label === label)?.value ?? label;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push({ value, label });
    if (out.length === 100) break;
  }
  return out;
}

/** A label for a new option that isn't taken: Option 4, Option 5… */
export function nextOption(list: { value: string }[]): string {
  const taken = new Set(list.map((o) => o.value));
  let i = list.length + 1;
  while (taken.has(`Option ${i}`)) i++;
  return `Option ${i}`;
}

// Logic ---------------------------------------------------------------------------------------------------------

export type Shown = "always" | "show" | "hide";
export function shownMode(form: Form, id: string): Shown {
  const mine = form.rules.filter((r) => r.then.field === id && r.then.action !== "require");
  return mine.length ? (mine[0].then.action as Shown) : "always";
}

/** Switching "Show this field": Always drops its rules; Show when and Hide when turn them over, or add a first one. */
export function setShownOps(form: Form, id: string, mode: Shown, newRuleId: string): Op[] {
  const mine = form.rules.filter((r) => r.then.field === id && r.then.action !== "require");
  if (mode === "always") return mine.map((r) => ({ op: "remove_rule", id: r.id }));
  if (mine.length) return mine.filter((r) => r.then.action !== mode).map((r) => ({ op: "set_rule", rule: { ...r, then: { action: mode, field: id } } }));
  const src = ruleSources(form, id)[0];
  if (!src) return [];
  return [{ op: "set_rule", rule: { id: newRuleId, when: { field: src.id, op: "filled" }, then: { action: mode, field: id } } }];
}

/** Fields a rule can listen to: any other field that takes an answer. */
export const ruleSources = (form: Form, id: string) => allFields(form).filter((f) => f.id !== id && !isContent(f.type));

/** The values a rule can compare with, when the field has a fixed list. */
export function ruleValues(f: Field | undefined): { value: string; label: string }[] | null {
  if (!f) return null;
  if (isChoice(f.type)) return everyOption(f).map((o) => ({ value: o.value, label: o.label }));
  if (f.type === "checkbox") return [{ value: "true", label: "Checked" }];
  if (f.type === "rating") return Array.from({ length: f.rating?.scale ?? 5 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));
  return null;
}

export const RULE_OPS: { value: Rule["when"]["op"]; label: string }[] = [
  { value: "is", label: "is" },
  { value: "is_not", label: "is not" },
  { value: "filled", label: "is filled" },
  { value: "empty", label: "is empty" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "doesn't contain" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with", label: "ends with" },
  { value: "gt", label: "is over" },
  { value: "gte", label: "is at least" },
  { value: "lt", label: "is under" },
  { value: "lte", label: "is at most" },
  { value: "between", label: "is between" },
  { value: "before", label: "is before" },
  { value: "after", label: "is after" },
  { value: "within_days", label: "is within days" },
  { value: "any_of", label: "is any of" },
  { value: "none_of", label: "is none of" },
];

/** The ops a condition on this field can use, with their words. */
export const opsOf = (f: Field | undefined) => (f ? RULE_OPS.filter((o) => opsFor(f.type).includes(o.value)) : RULE_OPS.slice(0, 4));

/** A condition moved to another op: keeps what still fits, and starts the value the new op needs. */
export function condFor(c: Cond, op: CondOp, src: Field | undefined): Cond {
  const kind = OP_KIND[op];
  const values = ruleValues(src);
  if (op === "filled" || op === "empty") return { field: c.field, op };
  if (op === "is" || op === "is_not") return { field: c.field, op, value: OP_KIND[c.op] === "any" ? (c.value ?? values?.[0]?.value ?? "") : (values?.[0]?.value ?? "") };
  if (kind === "list") return { field: c.field, op, values: c.values?.length ? c.values : values?.[0] ? [values[0].value] : [] };
  if (op === "between") return { field: c.field, op, value: OP_KIND[c.op] === "number" ? (c.value ?? "0") : "0", value2: c.value2 ?? "100" };
  if (op === "within_days") return { field: c.field, op, value: "30" };
  const keep = OP_KIND[c.op] === kind ? c.value : undefined;
  return { field: c.field, op, value: keep ?? (kind === "number" ? "0" : kind === "date" ? new Date().toISOString().slice(0, 10) : "") };
}

// Fonts ---------------------------------------------------------------------------------------------------------

export type FontDef = { name: string; cat: "sans" | "serif" | "mono" | "display"; weights: number[] };
const V = [400, 500, 600, 700];
const RB = [400, 700];
/** Popular Google Fonts. Weights are the ones each family has, so the stylesheet link never asks for one it lacks. */
export const FONTS: FontDef[] = [
  { name: "Inter", cat: "sans", weights: V },
  { name: "Roboto", cat: "sans", weights: V },
  { name: "Open Sans", cat: "sans", weights: V },
  { name: "Montserrat", cat: "sans", weights: V },
  { name: "Poppins", cat: "sans", weights: V },
  { name: "Lato", cat: "sans", weights: RB },
  { name: "Raleway", cat: "sans", weights: V },
  { name: "Nunito", cat: "sans", weights: V },
  { name: "Source Sans 3", cat: "sans", weights: V },
  { name: "Work Sans", cat: "sans", weights: V },
  { name: "DM Sans", cat: "sans", weights: V },
  { name: "Manrope", cat: "sans", weights: V },
  { name: "Plus Jakarta Sans", cat: "sans", weights: V },
  { name: "Outfit", cat: "sans", weights: V },
  { name: "Figtree", cat: "sans", weights: V },
  { name: "Rubik", cat: "sans", weights: V },
  { name: "Karla", cat: "sans", weights: V },
  { name: "Mulish", cat: "sans", weights: V },
  { name: "IBM Plex Sans", cat: "sans", weights: V },
  { name: "Space Grotesk", cat: "sans", weights: V },
  { name: "Sora", cat: "sans", weights: V },
  { name: "Lexend", cat: "sans", weights: V },
  { name: "Urbanist", cat: "sans", weights: V },
  { name: "Barlow", cat: "sans", weights: V },
  { name: "Archivo", cat: "sans", weights: V },
  { name: "Public Sans", cat: "sans", weights: V },
  { name: "Noto Sans", cat: "sans", weights: V },
  { name: "PT Sans", cat: "sans", weights: RB },
  { name: "Geist", cat: "sans", weights: V },
  { name: "Playfair Display", cat: "serif", weights: V },
  { name: "Merriweather", cat: "serif", weights: RB },
  { name: "Lora", cat: "serif", weights: V },
  { name: "Libre Baskerville", cat: "serif", weights: RB },
  { name: "EB Garamond", cat: "serif", weights: V },
  { name: "Crimson Pro", cat: "serif", weights: V },
  { name: "Fraunces", cat: "serif", weights: V },
  { name: "Source Serif 4", cat: "serif", weights: V },
  { name: "DM Serif Display", cat: "display", weights: [400] },
  { name: "Bricolage Grotesque", cat: "display", weights: V },
  { name: "Space Mono", cat: "mono", weights: RB },
  { name: "JetBrains Mono", cat: "mono", weights: V },
  { name: "IBM Plex Mono", cat: "mono", weights: V },
];
const FALLBACK: Record<FontDef["cat"], string> = { sans: "sans-serif", serif: "serif", mono: "monospace", display: "sans-serif" };
export const SYSTEM_FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";

/** The first family named in a font stack, without quotes. */
export const familyOf = (stack: string) => (stack.split(",")[0] ?? "").trim().replace(/^['"]|['"]$/g, "");
export const fontDef = (name: string) => FONTS.find((f) => f.name.toLowerCase() === name.toLowerCase());
/** A CSS stack for a family, in the shape the brand checker accepts. */
export function fontStack(name: string): string {
  const def = fontDef(name);
  const fam = /\s/.test(name) ? `'${name}'` : name;
  return `${fam}, ${def ? FALLBACK[def.cat] : "sans-serif"}`;
}
/** One Google Fonts stylesheet for the families picked; "" when none come from Google. */
export function fontUrl(names: string[]): string {
  const defs = [...new Set(names.map((n) => fontDef(n)).filter((d): d is FontDef => !!d))];
  if (!defs.length) return "";
  const fam = defs.map((d) => `family=${d.name.replace(/ /g, "+")}:wght@${d.weights.join(";")}`).join("&");
  return `https://fonts.googleapis.com/css2?${fam}&display=swap`;
}
/** A tiny stylesheet with just the letters of each name, so the picker can show every font in itself. */
export function previewFontsUrl(): string {
  const letters = [
    ...new Set(
      FONTS.map((f) => f.name)
        .join("")
        .replace(/\s/g, ""),
    ),
  ]
    .sort()
    .join("");
  return `https://fonts.googleapis.com/css2?${FONTS.map((f) => `family=${f.name.replace(/ /g, "+")}`).join("&")}&text=${encodeURIComponent(letters)}&display=swap`;
}

// Theme presets -------------------------------------------------------------------------------------------------

export const THEME_PRESETS: { id: string; label: string; tokens: (t: Tokens) => Partial<Tokens> }[] = [
  { id: "clean", label: "Clean", tokens: () => ({ radius: 6, buttonRadius: 6, borderWidth: 1, inputHeight: 42, gap: 16, buttonWeight: 500, buttonCase: "none", labelWeight: 500 }) },
  { id: "rounded", label: "Rounded", tokens: () => ({ radius: 14, buttonRadius: 60, borderWidth: 1, inputHeight: 46, gap: 16, buttonWeight: 600, buttonCase: "none", labelWeight: 500 }) },
  { id: "bold", label: "Bold", tokens: () => ({ radius: 4, buttonRadius: 4, borderWidth: 2, inputHeight: 48, gap: 18, buttonWeight: 700, buttonCase: "uppercase", labelWeight: 600 }) },
  {
    id: "minimal",
    label: "Minimal",
    tokens: (t) => ({ radius: 0, buttonRadius: 0, borderWidth: 1, inputHeight: 40, gap: 20, buttonWeight: 500, buttonCase: "none", labelWeight: 400, inputBg: t.background }),
  },
];

// Contrast ------------------------------------------------------------------------------------------------------

/** The color each color is read against, and the ratio it needs (WCAG AA: 4.5 for text). */
export const CONTRAST_PAIRS: Partial<Record<keyof Tokens, [keyof Tokens, number]>> = {
  text: ["background", 4.5],
  muted: ["background", 4.5],
  error: ["background", 4.5],
  buttonText: ["buttonBg", 4.5],
  inputBg: ["text", 4.5],
};
export function grade(ratio: number, need: number): { label: string; ok: boolean } {
  if (ratio >= 7) return { label: "AAA", ok: true };
  if (ratio >= need) return { label: "AA", ok: true };
  if (ratio >= 3) return { label: "Large only", ok: false };
  return { label: "Low", ok: false };
}

// Undo ----------------------------------------------------------------------------------------------------------

const TEXT_KEYS = new Set(["label", "placeholder", "help", "default", "content", "valid", "hidden", "options", "rating", "source", "calc", "optionsBy"]);
/**
 * Typing in one box is one step on the undo stack: ops with the same key, a second apart or less, join. Text and
 * number edits have a key; picks, toggles and moves don't, so each one is its own step.
 */
export function mergeKey(op: Op): string {
  if (op.op === "update_field") {
    const keys = Object.keys(op.patch);
    return keys.length && keys.every((k) => TEXT_KEYS.has(k)) ? `f:${op.id}:${keys.sort().join()}` : "";
  }
  if (op.op === "set_copy")
    return `c:${Object.keys(op)
      .filter((k) => k !== "op")
      .sort()
      .join()}`;
  if (op.op === "update_step") return `s:${op.index}`;
  if (op.op === "set_rule" && op.rule.id) return `r:${op.rule.id}:${op.rule.when.field}:${op.rule.when.op}`;
  if (op.op === "set_layout" && typeof op.maxWidth === "number" && !op.width && !op.labels && !op.progress) return "l:max";
  return "";
}
