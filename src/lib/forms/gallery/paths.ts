// Page paths in a form template (docs/multipage-forms-plan.md, Step 1): the same rules the form check holds a saved
// form to (../schema.ts, skip and jumps), checked on the template itself so a bad path names its page and question,
// plus two the form check can't see: every page can be reached, and so can the end.
import type { FormTemplate, PageJump } from "./types.ts";

/** What's wrong with a template's page paths, in words; [] when they're all sound. */
export function pathProblems(t: FormTemplate): string[] {
  const pages = t.schema.pages;
  const n = pages.length;
  const out: string[] = [];
  const keysUpTo = (i: number) => new Map(pages.slice(0, i + 1).flatMap((p) => p.fields.map((f) => [f.key, f] as const)));
  pages.forEach((p, i) => {
    const known = keysUpTo(i);
    const look = (j: PageJump, what: string) => {
      const f = known.get(j.when.key);
      if (!f) return out.push(`page ${i + 1}: ${what} on "${j.when.key}", which isn't on this page or one before it`);
      if (f.kind === "statement" || f.kind === "calc" || f.kind === "payment" || f.kind === "hidden") out.push(`page ${i + 1}: ${what} on "${f.key}", which takes no answer`);
      const vals = Array.isArray(j.when.value) ? j.when.value : j.when.value === undefined ? [] : [j.when.value];
      const choices = f.kind === "yes_no" ? (f.options?.length === 2 ? f.options : ["Yes", "No"]) : f.options;
      if ((j.when.op === "is" || j.when.op === "not" || j.when.op === "any") && choices?.length)
        for (const v of vals) if (typeof v === "string" && !choices.includes(v)) out.push(`page ${i + 1}: ${what} on "${f.key}" = "${v}", which isn't one of its choices`);
    };
    if (p.skip) {
      look(p.skip, "a skip");
      if (!(p.skip.to > i + 1 && p.skip.to < n)) out.push(`page ${i + 1}: a skip goes to page ${p.skip.to + 1}, which isn't after the next one`);
    }
    for (const j of p.jumps ?? []) {
      look(j, "a path");
      if (j.to <= i || j.to > n || (j.to === i + 1 && j.to < n)) out.push(`page ${i + 1}: a path goes to ${j.to === n ? "the end" : `page ${j.to + 1}`}, which isn't after the next page`);
    }
    if ((p.jumps?.length ?? 0) > 10) out.push(`page ${i + 1}: up to 10 paths`);
  });
  // Paths only go forward, so walking from the first page finds every page someone can see.
  const seen = new Set<number>([0]);
  for (let i = 0; i < n; i++) {
    if (!seen.has(i)) continue;
    const p = pages[i]!;
    seen.add(i + 1);
    if (p.skip) seen.add(p.skip.to);
    for (const j of p.jumps ?? []) seen.add(j.to);
  }
  for (let i = 0; i < n; i++) if (!seen.has(i)) out.push(`page ${i + 1} can't be reached`);
  if (!seen.has(n)) out.push("the end can't be reached");
  return out;
}

/** True when the template moves between pages by more than Next: a skip or a path by answer. */
export const hasPaths = (t: FormTemplate) => t.schema.pages.some((p) => !!p.skip || !!p.jumps?.length);
