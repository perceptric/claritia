// AI qualify's settings (docs/enrich-workflows-reports.md 1.2 E): the outcomes, the rules and how they're cleaned.
// Plain data with no server code, so the Enrichment screen can use it; qualify.ts runs the rules and the model.

import type { Cond } from "../router/types.ts";

export type Outcome = { label: string; meaning: string };
export type QualifyRule = { id: string; outcome: string; match: "all" | "any"; conds: Cond[] };
export type QualifySettings = { on: boolean; outcomes: Outcome[]; rules: QualifyRule[] };

export const DEFAULT_QUALIFY: QualifySettings = {
  on: false,
  outcomes: [
    { label: "Qualified", meaning: "Works at a company like the ones we sell to and asked for something we do" },
    { label: "Not a fit", meaning: "A student, a job seeker, a vendor selling to us, or a company far outside who we sell to" },
    { label: "Needs a look", meaning: "Could be a fit, but the answers don't say enough to tell" },
  ],
  rules: [],
};

export type Decision = { outcome: string; reason: string; by: string; facts: string[] };

export const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Settings from storage, cleaned: 1 to 5 outcomes with unique names, rules that point at an outcome that exists. */
export function cleanQualify(raw: Partial<QualifySettings> | null | undefined): QualifySettings {
  const seen = new Set<string>();
  const outcomes = (Array.isArray(raw?.outcomes) ? raw!.outcomes : DEFAULT_QUALIFY.outcomes)
    .map((o) => ({ label: clean(o?.label, 40), meaning: clean(o?.meaning, 200) }))
    .filter((o) => o.label && !seen.has(o.label.toLowerCase()) && seen.add(o.label.toLowerCase()))
    .slice(0, 5);
  const names = new Set(outcomes.map((o) => o.label));
  const rules = (Array.isArray(raw?.rules) ? raw!.rules : [])
    .filter((r) => r && names.has(String(r.outcome)) && Array.isArray(r.conds) && r.conds.length)
    .slice(0, 20)
    .map((r, i) => ({ id: clean(r.id, 40) || `q${i + 1}`, outcome: String(r.outcome), match: r.match === "any" ? ("any" as const) : ("all" as const), conds: r.conds.slice(0, 10) }));
  return { on: !!raw?.on, outcomes: outcomes.length ? outcomes : DEFAULT_QUALIFY.outcomes, rules };
}
