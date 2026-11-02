// Contact fields a form needs (docs/form-templates.md Part 1, step 3). A form field mapped to f.<key> saves its
// answer in that custom contact field. On import the field is made when it's missing; a field of another type gets
// a new key instead, so answers never land as bad data; a pick list missing some options gets them added.

import { CONTACT_BUILTINS, optionsOf, type CustomField } from "../records/fields.ts";
import { allFields } from "./logic.ts";
import { CUSTOM_TYPE } from "./schema.ts";
import type { FormSchema } from "./types.ts";

export type FieldPlan = {
  create: { key: string; label: string; type: string; options: string[] }[];
  extend: { key: string; options: string[] }[];
  /** Old map key → new map key, for fields that had to move. */
  remap: Record<string, string>;
};

const BUILTIN_KEYS = new Set(CONTACT_BUILTINS.map((b) => b.key));

export function planFields(s: FormSchema, existing: Pick<CustomField, "key" | "label" | "type" | "options">[]): FieldPlan {
  const plan: FieldPlan = { create: [], extend: [], remap: {} };
  const byKey = new Map(existing.map((f) => [f.key, f]));
  const taken = new Set([...existing.map((f) => f.key), ...BUILTIN_KEYS]);
  for (const f of allFields(s)) {
    if (!f.map?.startsWith("f.")) continue;
    const type = CUSTOM_TYPE[f.kind];
    if (!type) continue;
    const want = f.map.slice(2);
    const options = f.kind === "yes_no" || f.kind === "agree" ? [] : (f.options ?? []);
    const have = byKey.get(want);
    if (have && have.type === type && !BUILTIN_KEYS.has(want)) {
      if (type === "select" || type === "multi_select") {
        const known = new Set(optionsOf(have).flatMap((o) => [o.value.toLowerCase(), o.label.toLowerCase()]));
        const add = options.filter((o) => !known.has(o.toLowerCase()));
        if (add.length && optionsOf(have).length + add.length <= 100) plan.extend.push({ key: want, options: add });
      }
      continue;
    }
    if (!have && !BUILTIN_KEYS.has(want) && !plan.create.some((c) => c.key === want)) {
      plan.create.push({ key: want, label: f.label.slice(0, 80), type, options });
      taken.add(want);
      continue;
    }
    if (plan.create.some((c) => c.key === want && c.type === type)) continue;
    // Taken by a field of another type: reuse an earlier moved field of the right type (budget_2), or a new key.
    let k = want;
    let reuse = false;
    for (let n = 2; taken.has(k); n++) {
      k = `${want.slice(0, 36)}_${n}`;
      const other = byKey.get(k);
      if (other?.type === type || plan.create.some((c) => c.key === k && c.type === type)) {
        reuse = true;
        if (other && (type === "select" || type === "multi_select")) {
          const known = new Set(optionsOf(other).flatMap((o) => [o.value.toLowerCase(), o.label.toLowerCase()]));
          const add = options.filter((o) => !known.has(o.toLowerCase()));
          if (add.length && optionsOf(other).length + add.length <= 100) plan.extend.push({ key: k, options: add });
        }
        break;
      }
    }
    if (!reuse) {
      taken.add(k);
      plan.create.push({ key: k, label: f.label.slice(0, 80), type, options });
    }
    plan.remap[`f.${want}`] = `f.${k}`;
  }
  return plan;
}

/** The schema with moved fields pointing at their new keys. */
export function applyRemap(s: FormSchema, remap: Record<string, string>): FormSchema {
  if (!Object.keys(remap).length) return s;
  return { ...s, pages: s.pages.map((p) => ({ ...p, fields: p.fields.map((f) => (f.map && remap[f.map] ? { ...f, map: remap[f.map] } : f)) })) };
}
