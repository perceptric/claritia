// A scoring rule in plain words: "Company size is between 51 and 1000", "Filled in the Demo request form",
// "Visited /pricing". Made from the rule itself, so the words always match what runs.

import { condWords as routerCondWords, type FieldDef } from "../router/conditions.ts";
import type { Cond } from "../router/types.ts";
import { eventField, isEventField, type ScoreRule } from "./model.ts";

export type WordsCtx = { fields: FieldDef[]; forms?: Record<string, string> };

const or = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`);
const vals = (c: Cond) => (Array.isArray(c.value) ? c.value.map(String) : c.value === undefined || c.value === "" ? [] : [String(c.value)]);

export function condWords(c: Cond, ctx: WordsCtx): string {
  if (!isEventField(c.field)) {
    const w = routerCondWords(c, ctx.fields, []);
    return w.charAt(0).toUpperCase() + w.slice(1);
  }
  const f = eventField(c.field);
  const v = c.op === "filled" ? [] : vals(c);
  switch (f?.event) {
    case "form":
      return v.length ? `Filled in the ${or(v.map((id) => ctx.forms?.[id] ?? "a removed"))} form` : "Filled in any form";
    case "page":
      return v.length ? `Visited ${or(v)}` : "Visited any page";
    case "product":
      return v.length ? `Did in the product: ${or(v)}` : "Used the product";
    default:
      return f?.label ?? "Did something";
  }
}

export function ruleWords(r: ScoreRule, ctx: WordsCtx): string {
  if (r.name) return r.name;
  if (!r.conds.length) return "New rule";
  const parts = r.conds.map((c, i) => (i ? lowerFirst(condWords(c, ctx)) : condWords(c, ctx)));
  return parts.join(r.match === "any" ? " or " : " and ");
}

const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** The small note beside an event rule: how it counts and fades, when that differs from the model. */
export function ruleNote(r: ScoreRule): string {
  if (r.remove || !r.conds.some((c) => isEventField(c.field))) return "";
  return [r.count === "each" ? `up to ${r.cap}×` : "", r.fade === "never" ? "no fade" : typeof r.fade === "number" ? `fades ${r.fade}d` : ""].filter(Boolean).join(", ");
}

export const pointsWords = (r: ScoreRule) => (r.remove ? "Remove" : `${r.points > 0 ? "+" : ""}${r.points}`);
