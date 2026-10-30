// Rule conditions (docs/router.md 3.5): the fields a rule can test, the tests each type allows, and the one function
// that decides whether a condition holds. The rule editor and the engine both use this file, so what a person sees in
// the editor is what runs.

import type { Cond, Op, Rule, Segment, Territory } from "./types.ts";

export type FieldType = "text" | "number" | "country" | "choice" | "bool";

export type FieldDef = { key: string; label: string; group: "Contact" | "Company" | "Form answers" | "Source" | "Score"; type: FieldType; options?: string[] };

/** The fields every workspace has. Custom fields and form answers are added from the workspace (`fieldsFor`). */
export const BASE_FIELDS: FieldDef[] = [
  { key: "lead.country", label: "Country", group: "Contact", type: "country" },
  { key: "contact.email_domain", label: "Email domain", group: "Contact", type: "text" },
  { key: "contact.email_class", label: "Email type", group: "Contact", type: "choice", options: ["work", "free", "role"] },
  { key: "contact.title", label: "Job title", group: "Contact", type: "text" },
  { key: "contact.seniority", label: "Seniority", group: "Contact", type: "choice", options: ["C-level", "VP", "Director", "Manager", "Individual"] },
  { key: "contact.department", label: "Department", group: "Contact", type: "choice", options: ["Marketing", "Sales", "Engineering", "Product", "Finance", "HR", "Operations", "Other"] },
  { key: "contact.country", label: "Contact country", group: "Contact", type: "country" },
  { key: "contact.region", label: "State or region", group: "Contact", type: "text" },
  { key: "contact.lifecycle", label: "Lifecycle stage", group: "Contact", type: "choice", options: ["subscriber", "lead", "mql", "sql", "opportunity", "customer", "evangelist", "other"] },
  { key: "contact.lead_status", label: "Lead status", group: "Contact", type: "text" },
  { key: "company.name", label: "Company name", group: "Company", type: "text" },
  { key: "company.domain", label: "Company domain", group: "Company", type: "text" },
  { key: "company.country", label: "Company country", group: "Company", type: "country" },
  { key: "company.industry", label: "Industry", group: "Company", type: "text" },
  { key: "company.size", label: "Company size", group: "Company", type: "number" },
  { key: "company.employees", label: "Employees", group: "Company", type: "number" },
  { key: "company.type", label: "Company type", group: "Company", type: "choice" },
  { key: "lead.form", label: "Form", group: "Source", type: "choice" },
  { key: "lead.source", label: "Came from", group: "Source", type: "choice", options: ["form", "import", "crm", "api"] },
  { key: "utm.source", label: "UTM source", group: "Source", type: "text" },
  { key: "utm.medium", label: "UTM medium", group: "Source", type: "text" },
  { key: "utm.campaign", label: "UTM campaign", group: "Source", type: "text" },
  { key: "lead.score", label: "Lead score", group: "Score", type: "number" },
  { key: "lead.band", label: "Score band", group: "Score", type: "text" },
  { key: "lead.qualify", label: "Qualify outcome", group: "Score", type: "choice" },
];

/** The tests that fit a field's type. */
export function opsFor(type: FieldType): Op[] {
  switch (type) {
    case "number":
      return ["is", "is_not", "gt", "gte", "lt", "between", "filled", "empty"];
    case "country":
    case "choice":
      return ["one_of", "not_one_of", "filled", "empty"];
    case "bool":
      return ["is", "filled", "empty"];
    default:
      return ["is", "is_not", "one_of", "not_one_of", "contains", "starts_with", "filled", "empty"];
  }
}

export const needsValue = (op: Op) => op !== "filled" && op !== "empty";

const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : typeof v === "number" || typeof v === "boolean" ? String(v).toLowerCase() : "");

const blank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);

/**
 * A number from a value: 250, "250", "1,200", a size range like "51-200" or "51 to 200" (its low end) and "10,000+"
 * (10000). Null when there's none.
 */
export function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const m = v.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** The list a condition's value stands for, with territories opened up into their countries. */
export function listOf(value: Cond["value"], territories: Territory[]): string[] {
  const raw = Array.isArray(value) ? value : value === undefined || value === null || value === "" ? [] : [value];
  const out: string[] = [];
  for (const x of raw) {
    const s = String(x);
    if (s.startsWith("t:")) out.push(...(territories.find((t) => t.id === s.slice(2))?.countries ?? []));
    else out.push(s);
  }
  return out.map(norm).filter(Boolean);
}

/** Whether one condition holds for a value. A list value (a multi-choice answer) holds when any item does. */
export function holds(c: Cond, actual: unknown, territories: Territory[] = []): boolean {
  if (c.op === "filled") return !blank(actual);
  if (c.op === "empty") return blank(actual);
  if (Array.isArray(actual)) {
    if (c.op === "is_not" || c.op === "not_one_of") return actual.every((a) => holds(c, a, territories));
    return actual.some((a) => holds(c, a, territories));
  }
  if (blank(actual)) return c.op === "is_not" || c.op === "not_one_of";
  const a = norm(actual);
  switch (c.op) {
    case "is": {
      const n = toNumber(c.value);
      const an = toNumber(actual);
      return typeof c.value === "number" && n !== null && an !== null ? an === n : a === norm(c.value);
    }
    case "is_not":
      return !holds({ ...c, op: "is" }, actual, territories);
    case "one_of":
      return listOf(c.value, territories).includes(a);
    case "not_one_of":
      return !listOf(c.value, territories).includes(a);
    case "contains":
      return listOf(c.value, territories).some((v) => a.includes(v));
    case "starts_with":
      return listOf(c.value, territories).some((v) => a.startsWith(v));
    case "gt":
    case "gte":
    case "lt": {
      const n = toNumber(actual);
      const lim = toNumber(Array.isArray(c.value) ? c.value[0] : c.value);
      if (n === null || lim === null) return false;
      return c.op === "gt" ? n > lim : c.op === "gte" ? n >= lim : n < lim;
    }
    case "between": {
      const n = toNumber(actual);
      const [lo, hi] = Array.isArray(c.value) ? c.value.map(toNumber) : [null, null];
      if (n === null || lo === null || lo === undefined || hi === null || hi === undefined) return false;
      return n >= Math.min(lo, hi) && n <= Math.max(lo, hi);
    }
  }
  return false;
}

/** Whether a rule matches the lead's values; when it doesn't, the first condition that failed and its value. */
export function ruleMatches(r: Rule, values: Record<string, unknown>, territories: Territory[]): { ok: boolean; failed: { cond: Cond; actual: unknown } | null } {
  if (!r.conds.length) return { ok: false, failed: null };
  const results = r.conds.map((c) => ({ cond: c, actual: values[c.field], ok: holds(c, values[c.field], territories) }));
  const ok = r.match === "any" ? results.some((x) => x.ok) : results.every((x) => x.ok);
  if (ok) return { ok, failed: null };
  const f = results.find((x) => !x.ok)!;
  return { ok, failed: { cond: f.cond, actual: f.actual ?? null } };
}

/** The company types a lead's company is, by name, from the other values (a type's conditions can't use types). */
export function segmentsOf(segments: Segment[] | undefined, values: Record<string, unknown>, territories: Territory[]): string[] {
  return (segments ?? []).filter((s) => ruleMatches({ id: s.id, name: s.name, match: s.match, conds: s.conds.filter((c) => c.field !== "company.type"), queue: "" }, values, territories).ok).map((s) => s.name);
}

/** The fields with Company type's choices filled in from a body's types. */
export const withSegments = (fields: FieldDef[], segments: Segment[] | undefined): FieldDef[] =>
  fields.map((f) => (f.key === "company.type" ? { ...f, options: (segments ?? []).map((s) => s.name) } : f));

// Words ----------------------------------------------------------------------------------------------------------

const COUNTRY_NAMES = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();

export const countryName = (code: string) => {
  try {
    return COUNTRY_NAMES?.of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
};

/** "US, Canada or Mexico", "DACH" for a territory. */
function listWords(value: Cond["value"], field: FieldDef | undefined, territories: Territory[]): string {
  const raw = Array.isArray(value) ? value : value === undefined ? [] : [value];
  const words = raw.map((x) => {
    const s = String(x);
    if (s.startsWith("t:")) return territories.find((t) => t.id === s.slice(2))?.name ?? "a removed territory";
    return field?.type === "country" ? countryName(s) : s;
  });
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}

/** A condition as a sentence part: "country is US or Canada", "size is between 51 and 200". */
export function condWords(c: Cond, fields: FieldDef[], territories: Territory[]): string {
  const f = fields.find((x) => x.key === c.field);
  const name = (f?.label ?? c.field.replace(/^[a-z]+\./, "").replace(/_/g, " ")).toLowerCase();
  const op = OPS_WORDS[c.op];
  if (!needsValue(c.op)) return `${name} ${op}`;
  if (c.op === "between" && Array.isArray(c.value)) return `${name} is between ${c.value[0]} and ${c.value[1]}`;
  if (c.value === undefined || c.value === "" || (Array.isArray(c.value) && !c.value.length)) return `${name} ${c.op === "one_of" ? "is" : c.op === "not_one_of" ? "is not" : op} (no value yet)`;
  if (c.op === "one_of" || c.op === "not_one_of") return `${name} ${c.op === "one_of" ? "is" : "is not"} ${listWords(c.value, f, territories)}`;
  return `${name} ${op} ${listWords(c.value, f, territories)}`;
}

const OPS_WORDS: Record<Op, string> = {
  is: "is",
  is_not: "is not",
  one_of: "is one of",
  not_one_of: "is not one of",
  contains: "contains",
  starts_with: "starts with",
  filled: "is filled",
  empty: "is empty",
  gt: "is more than",
  gte: "is at least",
  lt: "is less than",
  between: "is between",
};

/** A rule as one line: "Country is US or Canada, and size is between 51 and 200". */
export function ruleWords(r: Rule, fields: FieldDef[], territories: Territory[]): string {
  if (!r.conds.length) return "No conditions";
  const parts = r.conds.map((c) => condWords(c, fields, territories));
  const joined = parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(", ")}, ${r.match === "any" ? "or" : "and"} ${parts[parts.length - 1]}`;
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

// Regions for the territory picker ----------------------------------------------------------------------------------

export const REGIONS: { name: string; countries: string[] }[] = [
  { name: "North America", countries: ["US", "CA", "MX"] },
  { name: "LATAM", countries: ["AR", "BO", "BR", "CL", "CO", "CR", "DO", "EC", "GT", "HN", "MX", "NI", "PA", "PE", "PY", "SV", "UY", "VE"] },
  { name: "UK and Ireland", countries: ["GB", "IE"] },
  { name: "DACH", countries: ["DE", "AT", "CH"] },
  { name: "Nordics", countries: ["DK", "FI", "IS", "NO", "SE"] },
  {
    name: "EMEA",
    countries: [
      "AE", "AT", "BE", "BG", "CH", "CY", "CZ", "DE", "DK", "EE", "EG", "ES", "FI", "FR", "GB", "GR", "HR", "HU", "IE", "IL", "IS", "IT", "KE", "LT", "LU", "LV",
      "MA", "MT", "NG", "NL", "NO", "PL", "PT", "QA", "RO", "RS", "SA", "SE", "SI", "SK", "TR", "UA", "ZA",
    ],
  },
  { name: "APAC", countries: ["AU", "CN", "HK", "ID", "IN", "JP", "KR", "MY", "NZ", "PH", "SG", "TH", "TW", "VN"] },
];
