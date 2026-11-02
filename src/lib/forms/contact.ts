// From a submission to a contact (docs/form-templates.md Part 1): the mapped answers become one contacts_upsert
// row with the source "form", and the consent the visitor saw decides the email basis. Server only in practice,
// but pure, so tests run it directly.

import { cleanDomain } from "../company/domains.ts";
import type { Basis } from "../contacts/consent.ts";
import { basisFor } from "../contacts/consent.ts";
import { countryCode, customValue, type CustomField } from "../contacts/fields.ts";
import type { ContactInput } from "../contacts/import.ts";
import { cleanEmail, isRejected } from "../identity/clean.ts";
import { allFields } from "./logic.ts";
import { DEFAULT_CONSENT, DEFAULT_NOTICE } from "./schema.ts";
import type { Answer, Answers, FormSchema, FormSettings } from "./types.ts";

export type Ctx = { custom: Pick<CustomField, "key" | "label" | "type" | "options">[]; own_domains?: string[]; partner_domains?: string[] };

const asText = (v: Answer | undefined): string => {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number" || typeof v === "string") return String(v);
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : "")).filter(Boolean).join(";");
  return "";
};

/** The email field: the one mapped to the contact's email, or else the first email question. */
export function emailField(s: FormSchema) {
  const fields = allFields(s);
  return fields.find((f) => f.map === "email") ?? fields.find((f) => f.kind === "email");
}

/**
 * The contact these answers describe, or null when the form asks for no email (an anonymous survey). An email
 * that can't be used comes back as an error on its field.
 */
export function toContact(s: FormSchema, answers: Answers, ctx: Ctx): { contact: ContactInput } | { field: string; error: string } | null {
  const ef = emailField(s);
  if (!ef) return null;
  const raw = answers[ef.key];
  if (typeof raw !== "string" || !raw) return null;
  const e = cleanEmail(raw, ctx);
  if (isRejected(e)) return { field: ef.key, error: e.rejected === "disposable" ? "Use an email you'll keep. Temporary addresses can't be used." : "Enter a valid email." };

  const c: ContactInput = { email: e.raw, email_clean: e.clean, email_class: e.class, fields: {} };
  const set = (k: keyof ContactInput, v: string | undefined, max: number) => {
    const t = v?.trim();
    if (t) (c as Record<string, unknown>)[k] = t.slice(0, max);
  };
  for (const f of allFields(s)) {
    const v = answers[f.key];
    if (!f.map || v === undefined) continue;
    if (f.map === "name" && typeof v === "object" && !Array.isArray(v)) {
      set("first_name", (v as Record<string, string>).first, 100);
      set("last_name", (v as Record<string, string>).last, 100);
    } else if (f.map === "first_name" || f.map === "last_name") set(f.map, asText(v), 100);
    else if (f.map === "phone") set("phone", asText(v), 50);
    else if (f.map === "title") set("title", asText(v), 200);
    else if (f.map === "company") set("company_name", asText(v), 200);
    else if (f.map === "website") {
      const d = cleanDomain(asText(v))?.domain;
      if (d) c.company_domain = d;
    } else if (f.map === "country") {
      const cc = countryCode(asText(v));
      if (cc) c.country = cc;
    } else if (f.map === "region") set("region", asText(v), 100);
    else if (f.map === "address" && typeof v === "object" && !Array.isArray(v)) {
      const a = v as Record<string, string>;
      const cc = a.country ? countryCode(a.country) : undefined;
      if (cc) c.country = cc;
      set("region", a.region, 100);
    } else if (f.map.startsWith("f.")) {
      const def = ctx.custom.find((x) => x.key === f.map!.slice(2));
      if (!def) continue;
      const val = customValue(def, asText(v));
      if (val !== undefined) c.fields[def.key] = val;
    }
  }
  // A work email names the company when the form didn't ask for its website.
  if (!c.company_domain && (e.class === "work" || e.class === "role") && e.domain) {
    const d = cleanDomain(e.domain)?.domain;
    if (d) c.company_domain = d;
  }
  return { contact: c };
}

export type Consent = { basis: Basis; wording: string; explicit: boolean };

/**
 * The email basis a submission records. In strict regions only a ticked box counts (opt-in); elsewhere the notice
 * under the button gives legitimate interest. `country` is the contact's own country when the form asked, else the
 * visit's; basisFor turns a basis that doesn't count there into none. Null when the form has consent turned off.
 */
export function consentFor(st: FormSettings, region: "strict" | "notice", ticked: boolean, country?: string | null): Consent | null {
  if (st.consent_off) return null;
  if (region === "strict" || ticked) {
    const basis: Basis = ticked ? "opt_in" : "none";
    return { basis: basisFor(country ?? null, basis), wording: (st.consent_text || DEFAULT_CONSENT).slice(0, 2000), explicit: ticked };
  }
  return { basis: basisFor(country ?? null, "legitimate_interest"), wording: (st.notice_text || DEFAULT_NOTICE).slice(0, 2000), explicit: false };
}
