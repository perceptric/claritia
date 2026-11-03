// Describe your form (docs/form-templates-plan.md 5.5): the words someone types are matched to the catalog before
// anything is built, so a template that fits is offered first. Words that hit a template's name, menus or questions
// match here for free; only words that hit nothing go to Claude Haiku, through the step cache, with the catalog as one
// line per template. The model only picks ids, and an id that isn't in the catalog is dropped.

import { TEMPLATES, industryLabel, templateById } from "./catalog.ts";
import { facets, filterTemplates, matchesText } from "./filter.ts";
import { categoryLabel } from "./taxonomy.ts";
import type { FormTemplate } from "./types.ts";

export const MATCH_MODEL = "claude-haiku-5-5";

const STOP = new Set(["a", "an", "the", "for", "and", "or", "to", "of", "my", "our", "we", "i", "need", "want", "form", "forms", "that", "with", "from", "in", "on", "is", "are", "be", "can", "people", "who", "where", "when", "they", "their", "it", "so", "like", "some", "get", "let", "make"]);

/** The words that matter in what someone typed. */
export const keyWords = (text: string) => text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

/** Templates that share the most words with the description, best first. Every word counts once. */
export function localMatch(text: string, n = 3, list: FormTemplate[] = TEMPLATES): FormTemplate[] {
  const all = filterTemplates({}, text, "popular", {}, list);
  if (all.length) return all.slice(0, n);
  const words = keyWords(text);
  if (!words.length) return [];
  return list
    .map((t, i) => ({ t, i, hits: words.filter((w) => matchesText(t, w)).length }))
    .filter((x) => x.hits >= Math.min(2, words.length))
    .sort((a, b) => b.hits - a.hits || a.i - b.i)
    .slice(0, n)
    .map((x) => x.t);
}

export const MATCH_SYSTEM =
  "You match a short description of a form to a catalog of form templates. Answer with up to 3 template ids from the catalog, best first, one per line, and nothing else. Only pick a template that would serve the described form with small changes. If none would, answer NONE.";

/** The catalog as one line per template: id, name, industry, categories. */
export function catalogLines(list: FormTemplate[] = TEMPLATES): string {
  return list.map((t) => `${t.id} | ${t.name} | ${industryLabel(t.industry)} | ${facets(t).categories.map(categoryLabel).join(", ")}`).join("\n");
}

/** The ids in the model's answer that are in the catalog, at most 3. */
export function readMatch(answer: string): string[] {
  const ids = answer.match(/[a-z_]+\.[a-z0-9-]+/g) ?? [];
  return [...new Set(ids)].filter((id) => !!templateById(id)).slice(0, 3);
}
