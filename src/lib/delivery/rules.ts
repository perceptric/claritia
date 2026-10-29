// Sync rules for one CRM destination (docs/form-builder.md 7.4), kept in form_destinations.config.rules. They decide
// what a submission does to a record the CRM already has, who owns it, what a new one is, whether consent goes along,
// and whether a possible duplicate is checked first. A field's own "When the contact already has a value" setting
// wins over `exists`. A destination with no rules keeps the behavior it had (answers overwrite, the owner is written).

import type { Overwrite } from "../forms/schema.ts";
import type { PushOptions } from "../sources/types.ts";

export type SyncRules = {
  exists: Overwrite;
  /** Find existing records by email only, or also flag one with the same name at the same company domain. */
  match: "email" | "email_name";
  /** A record the CRM already has keeps its owner, or takes the one routing picked. */
  owner: "keep" | "route";
  /** Who assigns new records: Claritia's routing, or the CRM's own assignment rules (never both). */
  assign: "claritia" | "crm";
  /** Send the consent box to the CRM's opt-in field. */
  consent: boolean;
  /** Salesforce: what a new record is. */
  create: "Lead" | "Contact";
};

/** What a new CRM destination starts with: the choices that protect what's already in the CRM. */
export const NEW_RULES: SyncRules = { exists: "if_empty", match: "email", owner: "keep", assign: "claritia", consent: true, create: "Lead" };

const pick = <T extends string>(v: unknown, ok: readonly T[], fallback: T): T => (ok.includes(v as T) ? (v as T) : fallback);

/** The rules saved on a destination, or null when it has none. Anything unknown takes the safe default. */
export function rulesOf(config: unknown): SyncRules | null {
  const r = (config && typeof config === "object" ? (config as { rules?: unknown }).rules : null) as Record<string, unknown> | null;
  if (!r || typeof r !== "object") return null;
  if (!["always", "if_empty", "never"].includes(r.exists as string)) return null;
  return {
    exists: r.exists as Overwrite,
    match: pick(r.match, ["email", "email_name"], NEW_RULES.match),
    owner: pick(r.owner, ["keep", "route"], NEW_RULES.owner),
    assign: pick(r.assign, ["claritia", "crm"], NEW_RULES.assign),
    consent: r.consent !== false,
    create: pick(r.create, ["Lead", "Contact"], NEW_RULES.create),
  };
}

/** The policy one linked answer goes out with: the field's own setting, else the destination's rule, else the old default. */
export function policyFor(field: { overwrite?: Overwrite }, rules: SyncRules | null, fallback: Overwrite | null): Overwrite {
  if (!rules) return fallback ?? "always";
  return field.overwrite ?? rules.exists;
}

/** The connector options a submission's push takes from the rules. No rules: none, so the push is as it was. */
export function pushOptions(rules: SyncRules | null, consentGiven: boolean): PushOptions | undefined {
  if (!rules) return undefined;
  return {
    owner: rules.assign === "crm" ? "none" : rules.owner === "keep" ? "keep" : "set",
    autoAssign: rules.assign === "crm",
    create: rules.create,
    optIn: rules.consent && consentGiven,
  };
}

/** Text a delivery stopped on a possible duplicate starts with, so the screen can offer Create anyway. */
export const DUPLICATE = "Possible duplicate";
