// Tailor to my business (docs/form-templates.md Part 1, step 4): Claude rewrites a form's words to fit what the
// business does. Field kinds, keys, order, logic, points and contact mapping never change: only words are taken
// from the answer, and an option renamed by Claude renames the show-if conditions that point at it.

import { createHash } from "node:crypto";
import { allFields } from "./logic.ts";
import { checkSchema, cloneSchema } from "./schema.ts";
import type { FormSchema } from "./types.ts";

export const TAILOR_MODEL = "claude-haiku-5-5";
const VERSION = 1;

export const TAILOR_SYSTEM = `You adapt web form templates to one business. You get the business description and the form as JSON.

Rewrite only the words so the form fits that business and its customers: the title, intro, submit button, end screen, and each field's label, help, placeholder and options.

Rules:
- Keep every field, in the same order, with the same key. Never add or remove fields or options.
- Options: keep the same number, in the same order, with the same meaning. Rename only when the business's own words fit better (a dental clinic says "Cleaning", not "Service A").
- Plain words, short sentences, sentence case. Speak to the visitor as "you".
- Never invent prices, facts, guarantees or claims about the business. If something is unknown, keep the template's neutral words.
- Keep labels under 80 characters and button text under 25.
- Return only the JSON that matches the schema.`;

export const TAILOR_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    intro: { type: "string" },
    submit: { type: "string" },
    end_title: { type: "string" },
    end_text: { type: "string" },
    fields: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          help: { type: "string" },
          placeholder: { type: "string" },
          options: { type: "array", items: { type: "string" } },
        },
        required: ["key", "label"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "submit", "end_title", "end_text", "fields"],
  additionalProperties: false,
};

export type TailorOut = { title: string; intro?: string; submit: string; end_title: string; end_text: string; fields: { key: string; label: string; help?: string; placeholder?: string; options?: string[] }[] };

/** What Claude sees: the words only, never logic or mapping. */
export function tailorPrompt(s: FormSchema, about: string): string {
  const form = {
    title: s.title,
    intro: s.intro ?? "",
    submit: s.submit,
    end_title: s.end.title,
    end_text: s.end.text,
    fields: allFields(s)
      .filter((f) => f.kind !== "hidden")
      .map((f) => ({ key: f.key, kind: f.kind, label: f.label, ...(f.help ? { help: f.help } : {}), ...(f.placeholder ? { placeholder: f.placeholder } : {}), ...(f.options?.length ? { options: f.options } : {}) })),
  };
  return `# The business\n${about.trim().slice(0, 2000)}\n\n# The form\n${JSON.stringify(form, null, 1)}`;
}

/** The cache key: same model, prompt version, form and description replay the saved answer. */
export function tailorKey(s: FormSchema, about: string): string {
  return createHash("sha256").update(JSON.stringify([TAILOR_MODEL, VERSION, TAILOR_SYSTEM, tailorPrompt(s, about)])).digest("hex");
}

const clip = (v: unknown, max: number): string | undefined => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

/** The form with Claude's words, or the original wherever an answer doesn't fit. Throws when the result breaks. */
export function applyTailor(s: FormSchema, out: TailorOut): FormSchema {
  const next = cloneSchema(s);
  next.title = clip(out.title, 200) ?? next.title;
  if (out.intro !== undefined) next.intro = clip(out.intro, 2000) ?? next.intro;
  next.submit = clip(out.submit, 40) ?? next.submit;
  next.end.title = clip(out.end_title, 200) ?? next.end.title;
  next.end.text = clip(out.end_text, 2000) ?? next.end.text;
  const by = new Map((Array.isArray(out.fields) ? out.fields : []).map((f) => [f.key, f]));
  const renamed = new Map<string, Map<string, string>>();
  for (const f of allFields(next)) {
    const o = by.get(f.key);
    if (!o) continue;
    f.label = clip(o.label, 300) ?? f.label;
    if (f.help !== undefined || o.help) f.help = clip(o.help, 1000) ?? f.help;
    if (f.placeholder !== undefined || o.placeholder) f.placeholder = clip(o.placeholder, 200) ?? f.placeholder;
    const opts = Array.isArray(o.options) ? o.options.map((x) => clip(x, 200)).filter((x): x is string => !!x) : null;
    if (f.options?.length && opts && opts.length === f.options.length && new Set(opts.map((x) => x.toLowerCase())).size === opts.length) {
      const map = new Map<string, string>();
      f.options.forEach((old, i) => map.set(old, opts[i]!));
      renamed.set(f.key, map);
      f.options = opts;
    }
  }
  // Conditions follow their options' new names.
  for (const f of allFields(next)) {
    const map = f.show ? renamed.get(f.show.key) : undefined;
    if (!f.show || !map) continue;
    const v = f.show.value;
    if (typeof v === "string") f.show.value = map.get(v) ?? v;
    else if (Array.isArray(v)) f.show.value = v.map((x) => map.get(x) ?? x);
  }
  const errs = checkSchema(next);
  if (errs.length) throw new Error(errs[0]);
  return next;
}
