// Starter kits (docs/form-templates-plan.md 5.2): 3 to 6 templates a kind of business needs first, made in one
// click. Each industry's kit takes its best template from each group in turn (leads, booking, intake, money,
// applications, feedback, consent), featured ones first, so a kit covers the whole path from first contact to
// feedback. A kit with fewer than 3 templates isn't offered. Collections are rows with a plain rule behind each.

import { TEMPLATES, industryLabel } from "./catalog.ts";
import { facets } from "./filter.ts";
import type { Family } from "./taxonomy.ts";
import { INDUSTRIES, type FormTemplate, type Industry } from "./types.ts";

export type Kit = { id: string; industry: Industry; name: string; templates: string[] };

const ORDER: Family[] = ["leads", "booking", "intake", "money", "apply", "feedback", "legal", "events", "quizzes", "operations"];
const MAX = 5;

function kitFor(industry: Industry, list: FormTemplate[]): Kit | null {
  const mine = list.filter((t) => t.industry === industry && !t.internal);
  const ranked = [...mine.filter((t) => t.featured), ...mine.filter((t) => !t.featured)];
  const picked: FormTemplate[] = [];
  for (const fam of ORDER) {
    if (picked.length >= MAX) break;
    const t = ranked.find((x) => !picked.includes(x) && facets(x).families[0] === fam) ?? ranked.find((x) => !picked.includes(x) && facets(x).families.includes(fam));
    if (t) picked.push(t);
  }
  if (picked.length < 3) return null;
  return { id: industry === "general" ? "any-business" : industry.replace(/_/g, "-"), industry, name: `${industryLabel(industry)} starter kit`, templates: picked.map((t) => t.id) };
}

export function buildKits(list: FormTemplate[] = TEMPLATES): Kit[] {
  return INDUSTRIES.map((i) => kitFor(i.value, list)).filter((k): k is Kit => !!k);
}

export const KITS = buildKits();
export const kitById = (id: string) => KITS.find((k) => k.id === id);

/** When a template is in season, for templates that don't set their own months: tax time, school starts, year-end. */
export const SEASONAL: Record<string, number[]> = {
  "accounting.tax-intake": [1, 2, 3, 4],
  "accounting.year-end": [11, 12, 1],
  "education.application": [9, 10, 11, 12, 1],
  "education.scholarship": [1, 2, 3, 4],
  "education.childcare-enrollment": [5, 6, 7, 8],
  "education.course-enrollment": [7, 8, 9, 12, 1],
  "hr.benefits-enrollment": [10, 11],
  "hr.360-feedback": [11, 12],
  "nonprofit.donation-pledge": [11, 12],
  "nonprofit.gala-tickets": [9, 10, 11],
  "nonprofit.charity-run": [3, 4, 5, 9],
  "ecommerce.custom-order": [10, 11, 12],
  "hospitality.catering": [11, 12],
  "fitness.membership": [12, 1, 2],
  "fitness.trial-class": [1, 2],
  "solar.savings-check": [3, 4, 5],
  "construction.remodel-planner": [2, 3, 4],
  "events.wedding-rsvp": [3, 4, 5, 6, 7, 8, 9],
  "personal.reunion": [4, 5, 6, 7],
  "sports.season-registration": [2, 3, 7, 8],
  "sports.tournament-registration": [4, 5, 6],
};

/** Templates featured in a month (1 to 12). */
export const inSeason = (month: number, list: FormTemplate[] = TEMPLATES) => list.filter((t) => (t.seasons ?? SEASONAL[t.id])?.includes(month));

/** Templates added in the 30 days before `today` (yyyy-mm-dd), newest first. */
export function newest(today: string, list: FormTemplate[] = TEMPLATES): FormTemplate[] {
  const from = new Date(new Date(`${today}T00:00:00Z`).getTime() - 30 * 86400000).toISOString().slice(0, 10);
  return list.filter((t) => t.added && t.added >= from && t.added <= today).sort((a, b) => (b.added ?? "").localeCompare(a.added ?? ""));
}
