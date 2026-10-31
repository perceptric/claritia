// Source field mappings (docs/routing-workflow.md Section 8): a form field, by its stable id, to a canonical routing
// field and type. One shared adapter for every source: numbers stay numbers, a range stays a range (never a made-up
// midpoint), countries are ISO codes whatever label came in, and a value that doesn't fit its mapping is an input
// problem the run is held for, never a guess. Pure: runs in the browser and on the server.

import { numberOrRange } from "../router/conditions.ts";
import type { InputIssue, Provenance } from "../router/types.ts";
import { COUNTRY_CODES } from "../forms/countries.ts";

export type MapType = "email" | "integer" | "range" | "country" | "text" | "enum";

/** `field`: the form field's id (never its label). `target`: the routing field rules test (`company.employees`...). */
export type Mapping = { field: string; target: string; type: MapType; required?: boolean };

/** The form field types each mapping type can read. A range or choice question can't feed a whole-number field. */
const READS: Record<MapType, string[]> = {
  email: ["email"],
  integer: ["number", "calc", "hidden", "text"],
  range: ["choice", "dropdown", "text", "hidden"],
  country: ["country", "dropdown", "choice", "text", "hidden"],
  text: ["text", "textarea", "email", "phone", "url", "hidden", "dropdown", "choice", "number", "date", "calc"],
  enum: ["choice", "dropdown", "multi", "hidden", "text"],
};

/** Why a mapping can't be published, or null (blocking, Section 17): a range question mapped to a whole number, etc. */
export function mappingProblem(m: Mapping, field: { id: string; type: string; label: string } | undefined): string | null {
  if (!field) return "The form field is gone";
  if (!READS[m.type]?.includes(field.type)) return `${field.label} can't fill a ${m.type === "integer" ? "whole number" : m.type} field`;
  return null;
}

const CODES = new Set<string>(COUNTRY_CODES);
const NAMES = (() => {
  const out = new Map<string, string>();
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "region" });
    for (const c of CODES) {
      const n = dn.of(c);
      if (n) out.set(n.toLowerCase(), c);
    }
  } catch {}
  for (const [k, v] of Object.entries({ usa: "US", "united states of america": "US", uk: "GB", "great britain": "GB", "viet nam": "VN" })) out.set(k, v);
  return out;
})();

/** A country code from a code or an English name, or null. */
export function countryCode(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (/^[A-Za-z]{2}$/.test(t) && CODES.has(t.toUpperCase())) return t.toUpperCase();
  return NAMES.get(t.toLowerCase()) ?? null;
}

const blank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);

/**
 * The routing values a submission's answers give through its mappings, each with where it came from, and the answers
 * that don't fit. A blank optional answer is simply unknown; a missing required one, or one of the wrong type, is an
 * issue (and the value is left out rather than guessed).
 */
export function applyMappings(mappings: Mapping[], answers: Record<string, unknown>): { values: Record<string, unknown>; provenance: Record<string, Provenance>; issues: InputIssue[] } {
  const values: Record<string, unknown> = {};
  const provenance: Record<string, Provenance> = {};
  const issues: InputIssue[] = [];
  for (const m of mappings) {
    const raw = answers[m.field];
    if (blank(raw)) {
      if (m.required) issues.push({ code: "source_mapping_mismatch", field: m.target, detail: "missing" });
      continue;
    }
    let v: unknown = null;
    switch (m.type) {
      case "integer": {
        const r = numberOrRange(raw);
        v = r && r.lo === r.hi && Number.isInteger(r.lo) && r.lo >= 0 ? r.lo : null;
        break;
      }
      case "range": {
        const r = numberOrRange(raw);
        v = r ? String(raw).trim() : null;
        break;
      }
      case "country":
        v = countryCode(raw);
        break;
      case "email":
        v = typeof raw === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw.trim()) ? raw.trim().toLowerCase() : null;
        break;
      case "enum":
        v = Array.isArray(raw) ? raw.map(String) : String(raw).trim();
        break;
      default:
        v = typeof raw === "string" || typeof raw === "number" ? String(raw).trim() : null;
    }
    if (v === null) {
      issues.push({ code: "source_mapping_mismatch", field: m.target, detail: m.type });
      continue;
    }
    values[m.target] = v;
    provenance[m.target] = { source: "form", field: m.field };
  }
  return { values, provenance, issues };
}
