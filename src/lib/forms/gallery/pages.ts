// One page or multi-page (docs/form-templates.md, Pages): every template can be used either way. One page puts every
// question on one screen: page titles become headings and a page skip hides that page's questions when its answer
// holds, so the same people see the same questions. Multi-page splits a one-page form into pages of about four
// questions, keeping the order, the keys and the show-if rules. Browser and server.

import { questionCount } from "./catalog.ts";
import type { Cond, FormField, FormPage, FormTemplate, PageJump } from "./types.ts";

export type PagesMode = "one" | "multi";

/** The fewest questions a form needs before it splits into pages. */
export const MIN_SPLIT = 4;
/** Questions per page when a one-page form splits. */
const PER_PAGE = 4;
/** The most pages a split makes. */
const MAX_PAGES = 6;

/** How a template comes: on one page, or in pages (one question at a time counts as pages). */
export const pagesOf = (t: FormTemplate): PagesMode => (t.schema.pages.length > 1 || t.schema.one || t.mode === "screens" ? "multi" : "one");

/** Whether a template can be used the other way: a multi-page form can always go on one page; a short form stays one. */
export const canSwitch = (t: FormTemplate): boolean => pagesOf(t) === "multi" || questionCount(t) >= MIN_SPLIT;

/** The template as `mode` asks, or as it is when it already is that way or can't be. */
export function withPages(t: FormTemplate, mode: PagesMode | null | undefined): FormTemplate {
  if (!mode || mode === pagesOf(t) || !canSwitch(t)) return t;
  return mode === "one" ? onePage(t) : multiPage(t);
}

const isQuestion = (f: FormField) => f.kind !== "statement" && f.kind !== "hidden";

/** Every page on one screen. */
function onePage(t: FormTemplate): FormTemplate {
  const s = t.schema;
  const pages = s.pages;
  // The answers that skip each page: a page's skip and paths jump past the pages between it and where they land.
  const skippedBy = pages.map(() => [] as Cond[]);
  pages.forEach((p, i) => {
    const past = (j: PageJump) => {
      for (let k = i + 1; k < Math.min(j.to, pages.length); k++) skippedBy[k]!.push(j.when);
    };
    for (const j of p.jumps ?? []) past(j);
    if (p.skip) past(p.skip);
  });
  const keys = new Set(pages.flatMap((p) => p.fields.map((f) => f.key)));
  const free = (base: string) => {
    let k = base;
    for (let n = 2; keys.has(k); n++) k = `${base}_${n}`;
    keys.add(k);
    return k;
  };
  const fields: FormField[] = [];
  pages.forEach((p, i) => {
    const hide = skippedBy[i]!;
    const extra = (f: FormField): FormField => (hide.length && f.map !== "email" ? { ...f, hide: [...(f.hide ?? []), ...hide] } : f);
    // A page's title stays as a heading over its questions, except over the first questions of the form.
    if (p.title && fields.some(isQuestion)) fields.push(extra({ key: free(`part_${i + 1}`), kind: "statement", label: p.title }));
    fields.push(...p.fields.map(extra));
  });
  const schema = { ...s, pages: [{ fields }] };
  delete schema.one;
  const out = { ...t, schema };
  delete out.mode;
  return out;
}

/** Pieces that stay together on a page: a heading and the question under it, two half-width questions side by side. */
function pieces(fields: FormField[]): FormField[][] {
  const out: FormField[][] = [];
  let open: FormField[] = [];
  const close = () => {
    if (open.length) out.push(open);
    open = [];
  };
  for (const f of fields) {
    const last = open[open.length - 1];
    if (f.kind === "statement") {
      close();
      open.push(f);
      continue;
    }
    // Hidden fields ride along with whatever comes next; a total shows under the questions that set it.
    if (last && (last.kind === "statement" || last.kind === "hidden" || f.kind === "calc" || f.kind === "payment" || (f.half && last.half && open.filter((x) => x.half).length % 2 === 1))) {
      open.push(f);
      continue;
    }
    close();
    open.push(f);
  }
  close();
  return out;
}

/** A one-page form in pages of about four questions. */
function multiPage(t: FormTemplate): FormTemplate {
  const s = t.schema;
  const all = s.pages[0]!.fields;
  const total = all.filter(isQuestion).length;
  const count = Math.min(MAX_PAGES, Math.max(2, Math.round(total / PER_PAGE)));
  const parts = pieces(all);
  const pages: FormPage[] = [];
  let open: FormField[] = [];
  let asked = 0;
  for (const [i, part] of parts.entries()) {
    open.push(...part);
    asked += part.filter(isQuestion).length;
    const left = parts.slice(i + 1).some((x) => x.some(isQuestion));
    // Cut when this page has its share, so the pages come out about even.
    if (left && pages.length < count - 1 && asked >= (total * (pages.length + 1)) / count) {
      pages.push({ fields: open });
      open = [];
    }
  }
  if (open.length) pages.push({ fields: open });
  if (pages.length < 2) return t;
  return { ...t, schema: { ...s, pages } };
}
