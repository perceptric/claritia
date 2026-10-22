// A fill as the server takes it (docs/form-builder.md Parts 2 and 6). Everything the browser sent is checked again:
// the shape, the spam signals, every answer against the published version, and the email through identity
// cleaning. What comes out is either errors to show on the form, or the arguments for form_submit. Server only
// (email cleaning reads the domain lists).

import { cleanDomain } from "../company/domains.ts";
import { cleanPhone, nameCase } from "../contacts/clean.ts";
import { countryCode, customValue, type CustomField } from "../contacts/fields.ts";
import type { ContactInput } from "../contacts/import.ts";
import { cleanEmail, isRejected } from "../identity/clean.ts";
import { regionOf } from "../web/policy.ts";
import { allFields, type Form } from "./schema.ts";
import { checkAnswers, contactParts } from "./values.ts";

export type Incoming = {
  v?: unknown;
  version?: unknown;
  key?: unknown;
  answers?: unknown;
  hidden?: unknown;
  consent?: unknown;
  page?: unknown;
  referrer?: unknown;
  utm?: unknown;
  ms?: unknown;
  trap?: unknown;
  turnstile?: unknown;
};

export type Ctx = { custom: CustomField[]; own_domains?: string[]; partner_domains?: string[] };

export type SubmitArgs = {
  p_version: number;
  p_idem: string;
  p_values: Record<string, unknown>;
  p_hidden: Record<string, string>;
  p_contact: ContactInput | null;
  p_consent: { given?: boolean; wording?: string };
  p_country: string | null;
  p_spam: string | null;
};

const KEY = /^[A-Za-z0-9_-]{16,64}$/;
const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

/** A page address with only its UTM parameters kept: anything else in a query string can hold someone's data. */
export function pageOnly(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw) return undefined;
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol)) return undefined;
    const keep = new URLSearchParams();
    for (const k of UTM) if (u.searchParams.get(k)) keep.set(k, u.searchParams.get(k)!.slice(0, 200));
    const q = keep.toString();
    return `${u.origin}${u.pathname}${q ? `?${q}` : ""}`.slice(0, 1000);
  } catch {
    return undefined;
  }
}

/**
 * Check a fill. `form` and `version` are the live published version; `country` is the visitor's country from the
 * edge, when known. Returns field errors (by field id), a general error, or the form_submit arguments.
 */
export function prepareSubmit(
  form: Form,
  version: number,
  raw: Incoming,
  ctx: Ctx,
  opts: { country?: string | null; turnstileFailed?: boolean } = {},
): { errors: Record<string, string> } | { error: string; status: number } | { args: SubmitArgs } {
  if (raw.v !== 1 || typeof raw.key !== "string" || !KEY.test(raw.key)) return { error: "Bad request.", status: 400 };
  if (raw.version !== version) return { error: "This form changed. Refresh the page and try again.", status: 409 };
  const answers = raw.answers && typeof raw.answers === "object" && !Array.isArray(raw.answers) ? (raw.answers as Record<string, unknown>) : {};
  if (Object.keys(answers).length > 60) return { error: "Bad request.", status: 400 };
  const hiddenIn = raw.hidden && typeof raw.hidden === "object" && !Array.isArray(raw.hidden) ? (raw.hidden as Record<string, unknown>) : {};
  const hidden: Record<string, string> = {};
  for (const f of allFields(form)) if (f.type === "hidden" && typeof hiddenIn[f.id] === "string") hidden[f.id] = (hiddenIn[f.id] as string).slice(0, 500);

  // Spam is kept (7 days, in its own tab) but never becomes a contact or a delivery.
  const ms = typeof raw.ms === "number" ? raw.ms : 0;
  // A captured form is the team's own, with its own spam checks, and its timer starts when our script loads, not
  // when the visitor starts typing: no timing check there.
  const spam =
    typeof raw.trap === "string" && raw.trap.trim() ? "trap" : !form.capture && ms < form.spam.minSeconds * 1000 ? "too_fast" : opts.turnstileFailed ? "turnstile" : null;

  const checked = checkAnswers(form, answers, { hidden });
  const errors = { ...checked.errors };
  const parts = contactParts(checked.values);
  const emailField = allFields(form).find((f) => f.key === "email");
  const e = cleanEmail(parts.email ?? "", ctx);
  if (emailField && !errors[emailField.id]) {
    if (isRejected(e)) errors[emailField.id] = e.rejected === "disposable" ? "Use an email address you'll keep." : "Enter a valid email.";
    else if (emailField.check === "work_email" && e.class === "free") errors[emailField.id] = "Use your work email.";
  }
  if (Object.keys(errors).length && !spam) return { errors };

  const utmIn = raw.utm && typeof raw.utm === "object" ? (raw.utm as Record<string, unknown>) : {};
  const meta: Record<string, string> = {};
  for (const k of UTM) if (typeof utmIn[k] === "string" && utmIn[k]) meta[k] = (utmIn[k] as string).slice(0, 200);
  const page = pageOnly(raw.page);
  const referrer = pageOnly(raw.referrer);
  if (page) meta.page = page;
  if (referrer) meta.referrer = referrer;
  for (const f of allFields(form)) if (f.type === "hidden" && typeof checked.values[f.key] === "string") meta[f.key] = checked.values[f.key] as string;

  const consentIn = raw.consent && typeof raw.consent === "object" ? (raw.consent as Record<string, unknown>) : {};
  // The wording saved is the form's own, never what the browser says it showed.
  const asked = form.consent.mode === "always" || (form.consent.mode === "by_region" && "given" in consentIn);
  const consent = asked ? { given: consentIn.given === true, wording: form.consent.label } : {};

  const country = (typeof parts.country === "string" && countryCode(parts.country)) || (opts.country && /^[A-Z]{2}$/.test(opts.country) ? opts.country : null);
  let contact: ContactInput | null = null;
  if (!spam && !isRejected(e)) {
    const fields: ContactInput["fields"] = {};
    for (const [k, v] of Object.entries(parts.fields)) {
      const def = ctx.custom.find((c) => c.key === k);
      if (!def) continue;
      const cv = customValue(def, Array.isArray(v) ? v.join(", ") : String(v));
      if (cv !== undefined && cv !== null) fields[k] = cv as string;
    }
    const site = parts.website ? cleanDomain(parts.website)?.domain : undefined;
    const fromEmail = e.class === "work" || e.class === "role" ? cleanDomain(e.domain ?? "")?.domain : undefined;
    contact = {
      email: e.raw,
      email_clean: e.clean,
      email_class: e.class,
      first_name: nameCase(parts.first_name),
      last_name: nameCase(parts.last_name),
      title: parts.title,
      phone: cleanPhone(parts.phone, country ?? undefined),
      country: country ?? undefined,
      region: parts.region,
      company_name: parts.company_name,
      company_domain: site ?? fromEmail,
      fields,
    };
    for (const k of Object.keys(contact) as (keyof ContactInput)[]) if (contact[k] === undefined) delete contact[k];
  }
  return {
    args: {
      p_version: version,
      p_idem: raw.key,
      p_values: checked.values,
      p_hidden: meta,
      p_contact: contact,
      p_consent: consent,
      p_country: country,
      p_spam: spam,
    },
  };
}

/** Whether the consent box shows for a visitor from this country (unknown counts as strict). */
export const consentShown = (form: Form, country: string | null | undefined) =>
  form.consent.mode === "always" || (form.consent.mode === "by_region" && regionOf(country ?? "", "") === "strict");
