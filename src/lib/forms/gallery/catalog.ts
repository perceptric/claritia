// Every gallery template (docs/form-templates.md), with lookups for the gallery and its own style. Browser and server.

import { GENERAL } from "./templates/general.ts";
import { HEALTHCARE, WELLNESS, FITNESS } from "./templates/health.ts";
import { CONSTRUCTION, SOLAR } from "./templates/home.ts";
import { FINANCE, INSURANCE, REAL_ESTATE } from "./templates/money.ts";
import { EVENTS, HOSPITALITY, HR, IT, NONPROFIT } from "./templates/people.ts";
import { SAAS } from "./templates/saas.ts";
import { ACCOUNTING, AGENCY, CONSULTING, LEGAL } from "./templates/services.ts";
import { AUTOMOTIVE, ECOMMERCE, EDUCATION, LOGISTICS, MANUFACTURING } from "./templates/trade.ts";
import { FIRST_TAGS } from "./tags.ts";
import { WAVE1_BOOKING } from "./templates/wave1-booking.ts";
import { WAVE1_EVENTS } from "./templates/wave1-events.ts";
import { WAVE1_APPLY } from "./templates/wave1-apply.ts";
import { WAVE1_FEEDBACK } from "./templates/wave1-feedback.ts";
import { WAVE1_HOME } from "./templates/wave1-home.ts";
import { WAVE1_LEADS } from "./templates/wave1-leads.ts";
import { WAVE1_MONEY } from "./templates/wave1-money.ts";
import { WAVE1_LEGAL } from "./templates/wave1-legal.ts";
import { WAVE1_OPS } from "./templates/wave1-ops.ts";
import { WAVE1_QUIZZES } from "./templates/wave1-quizzes.ts";
import { WAVE2_MULTIPAGE } from "./templates/wave2-multipage.ts";
import { WAVE3_LEADS } from "./templates/wave3-leads.ts";
import { WAVE3_MULTIPAGE_B } from "./templates/wave3-multipage-b.ts";
import { WAVE3_MULTIPAGE_A } from "./templates/wave3-multipage-a.ts";
import { WAVE3_INTAKE, WAVE3_OPS, WAVE3_LEGAL } from "./templates/wave3-ops.ts";
import { WAVE3_FEEDBACK, WAVE3_QUIZZES } from "./templates/wave3-feedback.ts";
import { WAVE3_APPLY, WAVE3_EVENTS } from "./templates/wave3-apply.ts";
import { WAVE3_BOOKING, WAVE3_MONEY } from "./templates/wave3-booking.ts";
import { WAVE4_CALC_HOME } from "./templates/wave4-calc-home.ts";
import { WAVE4_CALC_MORE } from "./templates/wave4-calc-more.ts";
import { defaultThemes } from "./themes.ts";
import { withPhotos } from "./photos/index.ts";
import { INDUSTRIES, type FormTemplate, type Industry, type UseCase } from "./types.ts";

const RAW: FormTemplate[] = [
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
  // Wave 1 (docs/form-templates-plan.md Part 9).
  ...WAVE1_BOOKING,
  ...WAVE1_EVENTS,
  ...WAVE1_FEEDBACK,
  ...WAVE1_HOME,
  ...WAVE1_LEADS,
  ...WAVE1_LEGAL,
  ...WAVE1_OPS,
  ...WAVE1_QUIZZES,
  ...WAVE1_APPLY,
  ...WAVE1_MONEY,
  // Wave 2: long multi-page form templates (docs/multipage-forms-plan.md).
  ...WAVE2_MULTIPAGE,
  // Wave 3: simple one-page forms and plain multi-page forms (docs/template-wave3-plan.md).
  ...WAVE3_LEADS,
  ...WAVE3_MULTIPAGE_B,
  ...WAVE3_MULTIPAGE_A,
  ...WAVE3_INTAKE,
  ...WAVE3_OPS,
  ...WAVE3_LEGAL,
  ...WAVE3_FEEDBACK,
  ...WAVE3_QUIZZES,
  ...WAVE3_APPLY,
  ...WAVE3_EVENTS,
  ...WAVE3_BOOKING,
  ...WAVE3_MONEY,
  // Wave 4: 100 price and savings calculators (docs/form-templates.md).
  ...WAVE4_CALC_HOME,
  ...WAVE4_CALC_MORE,
];

/** A template with its menus: the first 150 take theirs from tags.ts unless they set their own. */
export function withMenus(t: FormTemplate): FormTemplate {
  const tag = FIRST_TAGS[t.id];
  if (!tag || t.categories) return t;
  const words = (x?: string) => (x ?? "").split(/\s+/).filter(Boolean);
  return {
    ...t,
    categories: words(tag[0]),
    teams: words(tag[1]),
    ...(tag[2] ? { subs: words(tag[2]) } : {}),
  };
}

/** Every template, with its menus. */
export const TEMPLATES: FormTemplate[] = RAW.map(withMenus).map(withPhotos);

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
