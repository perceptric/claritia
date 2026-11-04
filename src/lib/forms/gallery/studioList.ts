// The templates the Form Studio shows on an empty canvas (docs/form-templates.md): every template, most used first,
// with its families, question count, the words search looks in, and its style's colors for the card. Browser.

import { industryLabel, questionCount, templateTheme } from "./catalog.ts";
import { filterTemplates, valuesIn } from "./filter.ts";
import { categoryLabel, FAMILIES } from "./taxonomy.ts";
import { themeById } from "./themes.ts";
import type { FormTemplate } from "./types.ts";

export type StudioTemplate = { id: string; name: string; blurb: string; fams: string[]; n: number; words: string; art: { bg: string; card: string; ink: string; accent: string; line: string } };

export function studioTemplate(t: FormTemplate): StudioTemplate {
  const s = themeById(templateTheme(t));
  const words = [t.name, t.blurb, industryLabel(t.industry), ...(t.categories ?? []).map(categoryLabel)].join(" ").toLowerCase();
  return { id: t.id, name: t.name, blurb: t.blurb, fams: valuesIn(t, "family"), n: questionCount(t), words, art: { bg: s.bg, card: s.card, ink: s.text, accent: s.accent, line: s.border } };
}

export function studioTemplates(): { list: StudioTemplate[]; families: { id: string; label: string }[] } {
  return { list: filterTemplates({}, "", "popular").map(studioTemplate), families: FAMILIES.map((f) => ({ id: f.id, label: f.label })) };
}
