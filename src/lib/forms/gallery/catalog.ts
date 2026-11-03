// Every gallery template (docs/form-templates.md), with lookups for the gallery and its own style. Browser and server.

import { GENERAL } from "./templates/general.ts";
import { HEALTHCARE, WELLNESS, FITNESS } from "./templates/health.ts";
import { CONSTRUCTION, SOLAR } from "./templates/home.ts";
import { FINANCE, INSURANCE, REAL_ESTATE } from "./templates/money.ts";
import { EVENTS, HOSPITALITY, HR, IT, NONPROFIT } from "./templates/people.ts";
import { SAAS } from "./templates/saas.ts";
import { ACCOUNTING, AGENCY, CONSULTING, LEGAL } from "./templates/services.ts";
import { AUTOMOTIVE, ECOMMERCE, EDUCATION, LOGISTICS, MANUFACTURING } from "./templates/trade.ts";
import { defaultThemes } from "./themes.ts";
import { INDUSTRIES, type FormTemplate, type Industry, type UseCase } from "./types.ts";

export const TEMPLATES: FormTemplate[] = [
  ...GENERAL,
  ...SAAS,
  ...AGENCY,
  ...CONSULTING,
  ...LEGAL,
  ...ACCOUNTING,
  ...FINANCE,
  ...INSURANCE,
  ...REAL_ESTATE,
  ...CONSTRUCTION,
  ...SOLAR,
  ...HEALTHCARE,
  ...WELLNESS,
  ...FITNESS,
  ...EDUCATION,
  ...ECOMMERCE,
  ...MANUFACTURING,
  ...LOGISTICS,
  ...AUTOMOTIVE,
  ...HOSPITALITY,
  ...EVENTS,
  ...NONPROFIT,
  ...HR,
  ...IT,
];

const BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]));
const THEME_OF = defaultThemes(TEMPLATES);

/** A template's own style, so the gallery shows every look. */
export const templateTheme = (t: Pick<FormTemplate, "id">) => THEME_OF[t.id] ?? "paper";

export const templateById = (id: string): FormTemplate | undefined => BY_ID.get(id);

export const industryLabel = (i: Industry) => INDUSTRIES.find((x) => x.value === i)?.label ?? i;

export const industryCounts = (): Record<Industry, number> => {
  const out = Object.fromEntries(INDUSTRIES.map((i) => [i.value, 0])) as Record<Industry, number>;
  for (const t of TEMPLATES) out[t.industry]++;
  return out;
};

/** Templates that match the industry, use case and words. Featured ones come first. */
export function findTemplates(q: { industry?: Industry | "all" | "featured"; tag?: UseCase | "all"; text?: string }): FormTemplate[] {
  const words = (q.text ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const list = TEMPLATES.filter((t) => {
    if (q.industry === "featured" && !t.featured) return false;
    if (q.industry && q.industry !== "all" && q.industry !== "featured" && t.industry !== q.industry) return false;
    if (q.tag && q.tag !== "all" && !t.tags.includes(q.tag)) return false;
    if (!words.length) return true;
    const hay = `${t.name} ${t.blurb} ${industryLabel(t.industry)} ${t.tags.join(" ")} ${t.schema.pages.flatMap((p) => p.fields.map((f) => f.label)).join(" ")}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  return q.industry === "all" || !q.industry ? [...list.filter((t) => t.featured), ...list.filter((t) => !t.featured)] : list;
}

/** How many questions a template asks. */
export const questionCount = (t: FormTemplate) => t.schema.pages.reduce((n, p) => n + p.fields.filter((f) => f.kind !== "statement" && f.kind !== "hidden").length, 0);

/** A template's public page slug: "saas.demo-request" → "saas-demo-request". */
export const templateSlug = (t: Pick<FormTemplate, "id">) => t.id.replace(/[._]/g, "-");
export const templateBySlug = (slug: string) => TEMPLATES.find((t) => templateSlug(t) === slug);
