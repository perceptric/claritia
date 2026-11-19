// The templates' starter photos (docs/template-pictures-plan.md, docs/form-templates.md Pictures). One template in five
// keeps them (kept.ts, written by scripts/template-pictures.ts from the picks in leads.ts and rest.ts); the rest are
// plain forms. A template with a welcome photo opens on a welcome screen (its own words, or its title and line); a
// question with a photo per answer shows picture cards.
import type { FormTemplate, GalleryPhoto } from "../types.ts";
import { KEPT } from "./kept.ts";

export type TemplatePhotos = Record<string, { cover?: GalleryPhoto; images?: Record<string, string[]>; one?: true }>;

/** The share of the catalog that keeps its photos. */
export const PICTURE_SHARE = 0.2;

/** The ids of the templates that keep their photos. */
export const PICTURE_IDS = new Set(Object.keys(KEPT));

/** A template with its photos, when it's one that keeps them. */
export function withPhotos(t: FormTemplate): FormTemplate {
  const p = KEPT[t.id];
  if (!p) return t;
  const s = t.schema;
  const cover = p.cover ? { title: s.cover?.title ?? s.title, ...((s.cover?.text ?? s.intro ?? t.blurb) ? { text: s.cover?.text ?? s.intro ?? t.blurb } : {}), button: s.cover?.button ?? "Start", photo: p.cover } : s.cover;
  const pages = p.images ? s.pages.map((pg) => ({ ...pg, fields: pg.fields.map((f) => (p.images![f.label] && (f.kind === "single" || f.kind === "multi") && p.images![f.label]!.length === (f.options?.length ?? 0) ? { ...f, images: p.images![f.label] } : f)) })) : s.pages;
  return { ...t, schema: { ...s, ...(cover ? { cover } : {}), ...(p.one ? { one: true as const } : {}), pages } };
}
