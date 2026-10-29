// Sync rules for one CRM destination (docs/form-builder.md 7.4), kept in form_destinations.config.rules. They decide
// what a submission does to a record the CRM already has. A field's own "When the contact already has a value"
// setting wins over them. A destination with no rules keeps the behavior it had (answers overwrite).

import type { Overwrite } from "../forms/schema.ts";

export type SyncRules = { exists: Overwrite };

/** What a new CRM destination starts with: fill empty fields only. */
export const NEW_RULES: SyncRules = { exists: "if_empty" };

/** The rules saved on a destination, or null when it has none. Anything unknown is dropped. */
export function rulesOf(config: unknown): SyncRules | null {
  const r = (config && typeof config === "object" ? (config as { rules?: unknown }).rules : null) as { exists?: unknown } | null;
  if (!r || typeof r !== "object") return null;
  return r.exists === "always" || r.exists === "if_empty" || r.exists === "never" ? { exists: r.exists } : null;
}

/** The policy one linked answer goes out with: the field's own setting, else the destination's rule, else the old default. */
export function policyFor(field: { overwrite?: Overwrite }, rules: SyncRules | null, fallback: Overwrite | null): Overwrite {
  if (!rules) return fallback ?? "always";
  return field.overwrite ?? rules.exists;
}
