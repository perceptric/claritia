// What a form uses that sits on a higher plan (docs/pricing.md Part 4): a signature field and a payment block on
// Starter and up, routing by answer (the On Submission conditions) on Pro and up. Publishing checks them
// (/api/forms/publish and the MCP's publish): a form with a signature or a payment doesn't go live on a lower plan, and
// its routing goes live without its conditions, so everyone books the Default meeting. A form already live stays as
// it was published. Pure: runs in the browser and on the server.

import { allows, lockLine, type Feature } from "../plans.ts";
import { allFields, type Form } from "./schema.ts";

/** The plan features this form uses. */
export function formFeatures(form: Form): Feature[] {
  const out = new Set<Feature>();
  for (const f of allFields(form)) {
    if (f.type === "signature") out.add("signatures");
    if (f.type === "payment") out.add("form_payments");
  }
  const s = form.after?.schedule;
  if (s?.tool === "claritia" && s.routes?.length) out.add("routing");
  return [...out];
}

/**
 * What publishing does on this plan (null: unknown, everything goes): `refuse` holds the lines that stop the publish
 * (signatures, payments); `routing` is false when the conditions are left out, with `note` the line that says why.
 */
export function publishLocks(form: Form, plan: string | null): { refuse: string[]; routing: boolean; note: string | null } {
  const uses = formFeatures(form);
  const locked = plan === null ? [] : uses.filter((f) => !allows(plan, f));
  const refuse = locked.filter((f) => f !== "routing").map(lockLine);
  const routing = !locked.includes("routing");
  return { refuse, routing, note: routing ? null : lockLine("routing") };
}
