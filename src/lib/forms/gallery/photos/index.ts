// The templates' starter photos (docs/template-pictures-plan.md): by family, written by scripts/template-photos.ts
// once a person has picked them from the contact sheets. A template with a welcome photo opens on a welcome screen
// (its own words, or its title and line); a question with a photo per answer shows picture cards.
import type { FormTemplate, GalleryPhoto } from "../types.ts";
import { PHOTOS as LEADS } from "./leads.ts";
import { PHOTOS as REST } from "./rest.ts";

export type TemplatePhotos = Record<string, { cover?: GalleryPhoto; images?: Record<string, string[]>; one?: true }>;

const ALL: TemplatePhotos = { ...LEADS, ...REST };

/** A template with its photos, if it has any. */
export function withPhotos(t: FormTemplate): FormTemplate {
  const p = ALL[t.id];
  if (!p) return t;
  const s = t.schema;
  const cover = p.cover ? { title: s.cover?.title ?? s.title, ...((s.cover?.text ?? s.intro ?? t.blurb) ? { text: s.cover?.text ?? s.intro ?? t.blurb } : {}), button: s.cover?.button ?? "Start", photo: p.cover } : s.cover;
  const pages = p.images ? s.pages.map((pg) => ({ ...pg, fields: pg.fields.map((f) => (p.images![f.label] && (f.kind === "single" || f.kind === "multi") && p.images![f.label]!.length === (f.options?.length ?? 0) ? { ...f, images: p.images![f.label] } : f)) })) : s.pages;
  return { ...t, schema: { ...s, ...(cover ? { cover } : {}), ...(p.one ? { one: true as const } : {}), pages } };
}
