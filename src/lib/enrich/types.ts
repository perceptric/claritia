// Enrichment's shapes (docs/enrich-workflows-reports.md Part 1).

import type { Department, Seniority } from "../contacts/clean.ts";

/** The waterfall's steps after a team's own records and the shared caches, which always run first. */
export type StepId = "email_check" | "coresignal" | "pdl";
export const STEPS: { id: StepId; label: string; gives: string; paid: boolean; byok: boolean; timeoutMs: number }[] = [
  { id: "email_check", label: "Email check", gives: "Real and work address", paid: false, byok: false, timeoutMs: 1500 },
  { id: "coresignal", label: "Coresignal", gives: "Company: size, industry, country, founded", paid: true, byok: true, timeoutMs: 4000 },
  { id: "pdl", label: "People Data Labs", gives: "Person: title, seniority, department, LinkedIn", paid: true, byok: true, timeoutMs: 4000 },
];
export const stepOf = (id: string) => STEPS.find((s) => s.id === id);

/** One step as a workspace set it: on or off, its place, and its own key when the team brought one. */
export type Source = { step: StepId; on: boolean; position: number; key: string | null; timeoutMs: number };

export const DEFAULT_SOURCES: Source[] = STEPS.map((s, i) => ({ step: s.id, on: true, position: i, key: null, timeoutMs: s.timeoutMs }));

/** Sources in order, every step present once (missing ones added, off ones kept so they show). */
export function orderSources(saved: Partial<Source>[] | null | undefined): Source[] {
  const by = new Map<string, Source>();
  for (const s of saved ?? []) {
    const d = stepOf(String(s.step ?? ""));
    if (!d || by.has(d.id)) continue;
    by.set(d.id, { step: d.id, on: s.on !== false, position: Number.isFinite(s.position) ? Number(s.position) : 99, key: typeof s.key === "string" && s.key ? s.key : null, timeoutMs: clampTimeout(s.timeoutMs, d.timeoutMs) });
  }
  for (const d of DEFAULT_SOURCES) if (!by.has(d.step)) by.set(d.step, { ...d, position: 100 + d.position });
  return [...by.values()].sort((a, b) => a.position - b.position).map((s, i) => ({ ...s, position: i }));
}

const clampTimeout = (v: unknown, dflt: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), 300), 10_000) : dflt;
};

export type Person = {
  first_name?: string;
  last_name?: string;
  title?: string;
  seniority?: Seniority;
  department?: Department;
  linkedin_url?: string;
  country?: string;
  phone?: string;
};

export type Company = {
  name?: string;
  domain?: string;
  employees?: number;
  size?: string;
  industry?: string;
  country?: string;
  founded?: number;
  type?: string;
};

export type EmailCheck = { ok: boolean; reason: "ok" | "invalid" | "disposable" | "no_mail_server" | "unknown"; class: "work" | "free" | "role" | "own" | "partner" | null; domain: string | null };

export type StepResult = { step: "records" | "cache" | StepId; result: "hit" | "miss" | "skipped" | "error" | "cap" | "time"; ms: number; note?: string };

export type Enriched = {
  person: Person;
  company: Company | null;
  /** Where each side came from: a vendor step, the cache, or the team's records. */
  personFrom: string | null;
  companyFrom: string | null;
  check: EmailCheck | null;
  steps: StepResult[];
  credits: number;
};

/** The plan's enrichment credits a month (docs/pricing.md). */
export const PLAN_CREDITS: Record<string, number> = { free: 0, starter: 250, team: 2000, business: 5000 };

/** Fields a form can hide when they're known, and what fills each. */
export const HIDEABLE: { key: string; label: string; from: (p: Person, c: Company | null) => unknown }[] = [
  { key: "company", label: "Company", from: (_p, c) => c?.name },
  { key: "website", label: "Website", from: (_p, c) => c?.domain },
  { key: "title", label: "Job title", from: (p) => p.title },
  { key: "country", label: "Country", from: (p, c) => p.country ?? c?.country },
  { key: "phone", label: "Phone", from: (p) => p.phone },
  { key: "size", label: "Company size", from: (_p, c) => c?.size },
  { key: "industry", label: "Industry", from: (_p, c) => c?.industry },
  { key: "seniority", label: "Seniority", from: (p) => p.seniority },
  { key: "department", label: "Department", from: (p) => p.department },
];

/** The keys among `want` that the data fills. Never values: the form only learns which questions to skip. */
export function knownKeys(want: string[], p: Person, c: Company | null): string[] {
  return HIDEABLE.filter((h) => want.includes(h.key)).filter((h) => {
    const v = h.from(p, c);
    return v !== undefined && v !== null && v !== "";
  }).map((h) => h.key);
}
