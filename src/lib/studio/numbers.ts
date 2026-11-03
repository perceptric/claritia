// The numbers a studio page shows as it's filled (docs/forms-chat-plan.md, Part 3): each calc's result, a payment's
// total and a result's number, worked out the way the server does (withCalcs), so the Studio's preview shows the same
// numbers as the live form and the charge. Plain functions, no DOM: the Studio's preview and the tests both use them.

import { calcText } from "../forms/formula.ts";
import { numOf, withCalcs, type Field, type Form } from "../forms/schema.ts";
import type { Vals } from "./runtime.ts";
import { pageForm } from "./page.ts";

export type PageNumber = { value: number | null; text: string };

/** The page's calcs, payments and results by their page names, from the answers by name. */
export function pageNumbers(html: string, v: Vals): Record<string, PageNumber> {
  const { form: raw } = pageForm({ html, css: "", brand: "", after: { kind: "thanks" } });
  const form = raw as unknown as Form;
  const fields = form.steps.flatMap((s) => s.fields) as Field[];
  const ids = form.page!.ids;
  const nameOf = new Map(Object.entries(ids).map(([n, id]) => [id, n]));
  const byId = new Map(fields.map((f) => [f.id, f]));
  const answers: Record<string, unknown> = {};
  for (const [name, id] of Object.entries(ids)) {
    const f = byId.get(id);
    const x = v[name];
    if (!f || f.type === "calc" || x === undefined || (Array.isArray(x) ? !x.length : x === "")) continue;
    answers[id] = f.type === "checkbox" ? true : f.type === "multi" ? (Array.isArray(x) ? x : [x]) : f.type === "number" || f.type === "rating" ? Number(Array.isArray(x) ? x[0] : x) : Array.isArray(x) ? String(x[0]) : x;
  }
  let vals: Record<string, unknown> = {};
  try {
    vals = withCalcs(form, answers);
  } catch {
    vals = {};
  }
  const out: Record<string, PageNumber> = {};
  for (const f of fields) {
    const name = nameOf.get(f.id);
    if (!name) continue;
    if (f.type === "calc") {
      const n = numOf(vals[f.id]);
      out[name] = { value: n, text: calcText(f.calc, n) };
    } else if (f.type === "payment" && f.pay) {
      const n = f.pay.field ? numOf(vals[f.pay.field]) : (f.pay.amount ?? null);
      out[name] = { value: n, text: n === null ? "—" : money(n, f.pay.currency) };
    } else if (f.type === "result" && f.result) {
      const src = f.result.field ? byId.get(f.result.field) : undefined;
      const n = f.result.field ? numOf(vals[f.result.field]) : null;
      out[name] = { value: n, text: f.result.kind === "meter" && f.result.max ? `${calcText(src?.calc, n)} of ${f.result.max}` : calcText(src?.calc, n) };
    }
  }
  return out;
}

function money(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  } catch {
    return String(n);
  }
}
