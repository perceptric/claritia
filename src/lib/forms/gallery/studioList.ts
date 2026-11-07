// The templates the Form Studio shows on an empty canvas (docs/form-templates.md): every template, most used first,
// with its families, question count, the words search looks in, and what the card shows: the form's title, its first
// real questions and its button, filling the card in the style's own colors, font and corners. Browser.

import { industryLabel, questionCount, templateTheme } from "./catalog.ts";
import { filterTemplates, valuesIn } from "./filter.ts";
import { categoryLabel, FAMILIES } from "./taxonomy.ts";
import { themeById } from "./themes.ts";
import { FONTS } from "./themes.ts";
import { focusOf, sizedUrl, STARTER_PHOTOS } from "../media.ts";
import type { FieldKind, FormField, FormTemplate } from "./types.ts";

/** A question as its card shows it: the label, what kind of answer, and the first options. */
export type CardQuestion = { label: string; kind: FieldKind; opts?: string[]; lo?: number; hi?: number };

export type StudioTemplate = {
  id: string;
  name: string;
  blurb: string;
  fams: string[];
  n: number;
  words: string;
  /** The card: the form's title, its first questions and its button, in its style's colors, type and corners. */
  form: { title: string; qs: CardQuestion[]; button: string; photo?: { src: string; layout: string; focus: string }; font: string; head: string; headWeight: number; radius: number; btnRadius: number; accent: string; accentInk: string; card: string; text: string; muted: string; field: string; border: string };
};

/** How many questions a card shows. */
export const CARD_QUESTIONS = 3;

const cardQuestion = (f: FormField): CardQuestion => {
  const q: CardQuestion = { label: f.label, kind: f.kind };
  if (f.kind === "yes_no") q.opts = ["Yes", "No"];
  else if (f.options?.length) q.opts = f.options.slice(0, 3);
  if (f.kind === "nps") Object.assign(q, { lo: 0, hi: 10 });
  else if (f.kind === "scale") Object.assign(q, { lo: f.min ?? 1, hi: f.max ?? 5 });
  else if (f.kind === "rating") q.hi = f.max ?? 5;
  return q;
};

export function studioTemplate(t: FormTemplate): StudioTemplate {
  const s = themeById(templateTheme(t));
  const words = [t.name, t.blurb, industryLabel(t.industry), ...(t.categories ?? []).map(categoryLabel)].join(" ").toLowerCase();
  const first = t.schema.pages[0]!;
  const qs = first.fields.filter((f) => f.kind !== "hidden" && f.kind !== "statement" && f.kind !== "calc").slice(0, CARD_QUESTIONS).map(cardQuestion);
  return {
    id: t.id,
    name: t.name,
    blurb: t.blurb,
    fams: valuesIn(t, "family"),
    n: questionCount(t),
    words,
    form: {
      title: t.schema.title,
      qs,
      button: t.schema.cover?.photo ? (t.schema.cover.button ?? "Start") : t.schema.pages.length > 1 ? "Next" : t.schema.submit,
      // A template with a welcome photo shows its welcome screen, as it opens.
      ...(t.schema.cover?.photo ? { photo: { src: sizedUrl(`${STARTER_PHOTOS}${t.schema.cover.photo.name}.jpg`, 640), layout: t.schema.cover.photo.layout, focus: focusOf(t.schema.cover.photo.focus) } } : {}),
      font: FONTS[s.font].css,
      head: FONTS[s.head].css,
      headWeight: s.headWeight,
      radius: Math.min(s.radius, 10),
      btnRadius: Math.min(s.btnRadius, 999),
      accent: s.accent,
      accentInk: s.accentInk,
      card: s.card,
      text: s.text,
      muted: s.muted,
      field: /^#[0-9a-f]{6}$/i.test(s.field) ? s.field : s.card,
      border: s.border,
    },
  };
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
