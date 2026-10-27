// The Results tab's logic, shared by the screen and the export route (docs/forms-plan.md 1.1): the filters a page of
// fills is read with, the columns the table and the CSV show across every version of a form, and one fill as a row.
// Runs in the browser and on the server.

import { calcText } from "./formula.ts";
import { allFields, everyOption, isContent, type Field, type Form } from "./schema.ts";

export type FillKind = "leads" | "tests" | "spam";
export type FillStatus = "sent" | "waiting" | "failed";

/** What form_fill_ids and form_fill_count read (supabase/migrations/071_form_results.sql). */
export type FillFilters = { kind?: FillKind; q?: string; from?: string; to?: string; status?: FillStatus; booked?: boolean; key?: string; value?: string };

const KEY = /^[a-z][a-z0-9_.]{0,59}$/;

/** Filters from anywhere (an address, a request), with anything unknown dropped. */
export function cleanFilters(raw: unknown): FillFilters {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: FillFilters = {};
  if (r.kind === "tests" || r.kind === "spam" || r.kind === "leads") out.kind = r.kind;
  if (typeof r.q === "string" && r.q.trim()) out.q = r.q.trim().slice(0, 200);
  for (const k of ["from", "to"] as const) if (typeof r[k] === "string" && !Number.isNaN(Date.parse(r[k] as string))) out[k] = new Date(r[k] as string).toISOString();
  if (r.status === "sent" || r.status === "waiting" || r.status === "failed") out.status = r.status;
  if (typeof r.booked === "boolean") out.booked = r.booked;
  if (typeof r.key === "string" && KEY.test(r.key) && typeof r.value === "string") {
    out.key = r.key;
    out.value = r.value.slice(0, 200);
  }
  return out;
}

/** Date presets for the range filter: the start of the range, in days back from now. */
export const RANGES = [
  { value: "all", label: "Any time", days: 0 },
  { value: "7", label: "Last 7 days", days: 7 },
  { value: "30", label: "Last 30 days", days: 30 },
  { value: "90", label: "Last 90 days", days: 90 },
  { value: "365", label: "Last 12 months", days: 365 },
] as const;

export const fromFor = (range: string, now = Date.now()) => {
  const days = RANGES.find((r) => r.value === range)?.days ?? 0;
  return days ? new Date(now - days * 86_400_000).toISOString() : undefined;
};

/** Page, referrer and the UTMs and click ids a fill keeps beside its answers (src/lib/forms/submit.ts). */
const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
const CLICK = ["gclid", "fbclid", "li_fat_id", "msclkid"];
export const META_KEYS = ["page", "referrer", ...UTM, ...CLICK, ...[...UTM, ...CLICK].map((k) => `first_${k}`)];

export type Column = { key: string; label: string; field?: Field };

/**
 * One column per place an answer saves to, across all of a form's versions: the newest version's fields in its order,
 * then fields only older versions had. Each takes its label from the newest version that has it.
 */
export function fillColumns(versions: { version: number; body: Form }[]): Column[] {
  const seen = new Map<string, Column>();
  for (const v of [...versions].sort((a, b) => b.version - a.version))
    for (const f of allFields(v.body)) if (!isContent(f.type) && !seen.has(f.key)) seen.set(f.key, { key: f.key, label: f.label || f.key, field: f });
  return [...seen.values()];
}

/** An answer as text: a choice by its label, many picks joined, yes or no for a box. */
export function answerText(col: Column | undefined, v: unknown): string {
  if (v === undefined || v === null || v === "") return "";
  if (col?.field?.type === "calc" && typeof v === "number") return calcText(col.field.calc, v);
  const label = (x: string) => (col?.field ? everyOption(col.field).find((o) => o.value === x)?.label : undefined) ?? x;
  if (Array.isArray(v)) return v.map((x) => label(String(x))).join(", ");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return label(String(v));
}

export type ExportFill = { id: string; created_at: string; values: Record<string, unknown>; hidden: Record<string, string> };

/** The CSV's two header rows (labels, then the keys, for importing back) and one fill's cells. */
export function csvHead(cols: Column[]): string[][] {
  return [
    ["Sent at", "Fill", ...cols.map((c) => c.label), ...META_KEYS],
    ["created_at", "id", ...cols.map((c) => c.key), ...META_KEYS],
  ];
}

export function csvRow(cols: Column[], s: ExportFill): unknown[] {
  return [s.created_at, s.id, ...cols.map((c) => answerText(c, s.values[c.key])), ...META_KEYS.map((k) => s.hidden?.[k] ?? "")];
}
