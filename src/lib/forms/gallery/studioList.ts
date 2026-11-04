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

/**
 * A template as it will look once used, for the Studio's preview before it's made: its page and its look (`css`, the
 * chat's brand or style; else the template's own style).
 */
export async function templatePreview(id: string, css?: string): Promise<{ html: string; css: string; brand: string }> {
  const [{ templateById }, { templateForm }, { checkForm }, { formToPage }, { styleCssById }] = await Promise.all([
    import("./catalog.ts"),
    import("./convert.ts"),
    import("../schema.ts"),
    import("../../studio/fromForm.ts"),
    import("../../studio/styleCss.ts"),
  ]);
  const t = templateById(id);
  if (!t) throw new Error("Template not found.");
  const checked = checkForm(templateForm(t));
  if ("errors" in checked) throw new Error("This template can't be shown right now.");
  const page = formToPage(checked.form);
  return { html: page.html, css: page.css, brand: css || styleCssById(templateTheme(t)) };
}
