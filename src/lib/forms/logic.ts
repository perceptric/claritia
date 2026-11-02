// Show-if logic and quiz scores. A field whose condition fails is hidden, and a hidden field's answer counts as
// empty for every field after it, so chains of conditions behave the way people expect. Browser and server.

import type { Answer, Answers, Cond, FormField, FormSchema } from "./types.ts";

export const allFields = (s: FormSchema): FormField[] => s.pages.flatMap((p) => p.fields);

export function hasValue(v: Answer | undefined | null): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "boolean") return true;
  if (Array.isArray(v)) return v.length > 0;
  return Object.values(v).some((x) => typeof x === "string" && x.trim() !== "");
}

const same = (a: unknown, b: unknown) =>
  typeof a === "string" && typeof b === "string" ? a.trim().toLowerCase() === b.trim().toLowerCase() : typeof a === "boolean" ? a === (b === true || b === "yes" || b === "Yes") : a === b;

function is(a: Answer | undefined, value: Cond["value"]): boolean {
  if (!hasValue(a)) return false;
  if (Array.isArray(a)) return (a as unknown[]).some((x) => same(x, value));
  if (typeof a === "number") return a === Number(value);
  return same(a, value);
}

export function meets(c: Cond, answers: Answers): boolean {
  const a = answers[c.key];
  switch (c.op) {
    case "answered":
      return hasValue(a);
    case "empty":
      return !hasValue(a);
    case "is":
      return is(a, c.value);
    case "not":
      return !is(a, c.value);
    case "any": {
      const list = Array.isArray(c.value) ? c.value : [c.value];
      return list.some((v) => is(a, v as string));
    }
    case "gte":
    case "lte": {
      const n = typeof a === "number" ? a : typeof a === "string" ? Number(a) : NaN;
      if (!Number.isFinite(n)) return false;
      return c.op === "gte" ? n >= Number(c.value) : n <= Number(c.value);
    }
    default:
      return true;
  }
}

/** The keys of the fields that show for these answers, in order, and the answers with hidden ones dropped. */
export function shown(s: FormSchema, answers: Answers): { keys: Set<string>; answers: Answers } {
  const keys = new Set<string>();
  const live: Answers = {};
  for (const f of allFields(s)) {
    if (f.show && !meets(f.show, live)) continue;
    keys.add(f.key);
    if (answers[f.key] !== undefined) live[f.key] = answers[f.key];
  }
  return { keys, answers: live };
}

/** Pages that have at least one field showing. A page with only hidden fields is skipped. */
export function shownPages(s: FormSchema, answers: Answers): number[] {
  const { keys } = shown(s, answers);
  const out: number[] = [];
  s.pages.forEach((p, i) => {
    if (p.fields.some((f) => keys.has(f.key) && f.kind !== "hidden")) out.push(i);
  });
  return out.length ? out : [0];
}

/** A quiz's score: the points of each picked option, over the fields that show. Null when the form has none. */
export function score(s: FormSchema, answers: Answers): number | null {
  const { keys, answers: live } = shown(s, answers);
  let total = 0;
  let any = false;
  for (const f of allFields(s)) {
    if (!f.points || !f.options || !keys.has(f.key)) continue;
    any = true;
    const a = live[f.key];
    const picked = Array.isArray(a) ? (a as string[]) : typeof a === "string" ? [a] : typeof a === "boolean" ? [a ? "Yes" : "No"] : [];
    for (const p of picked) {
      const i = f.options.findIndex((o) => o.toLowerCase() === String(p).toLowerCase());
      if (i >= 0) total += f.points[i] ?? 0;
    }
  }
  return any ? total : null;
}

/** The highest possible score, for "7 of 10". */
export function maxScore(s: FormSchema): number {
  let total = 0;
  for (const f of allFields(s)) {
    if (!f.points) continue;
    total += f.kind === "multi" ? f.points.filter((p) => p > 0).reduce((a, b) => a + b, 0) : Math.max(0, ...f.points);
  }
  return total;
}

export function bandFor(s: FormSchema, points: number | null) {
  if (points == null || !s.end.score?.length) return null;
  return [...s.end.score].sort((a, b) => b.min - a.min).find((b) => points >= b.min) ?? null;
}
