// A fill as the server takes it (docs/form-builder.md Parts 2 and 6). Everything the browser sent is checked again:
// the shape, the spam signals, every answer against the published version, and the email through identity
// cleaning. What comes out is either errors to show on the form, or the arguments for form_submit. Server only
// (email cleaning reads the domain lists).

import { createHmac } from "node:crypto";
import { cleanDomain } from "../company/domains.ts";
import { cleanPhone, nameCase } from "../contacts/clean.ts";
import { countryCode, customValue, type CustomField } from "../contacts/fields.ts";
import type { ContactInput } from "../contacts/import.ts";
import { cleanEmail, isRejected } from "../identity/clean.ts";
import type { Rpc } from "../jobs.ts";
import type { Tokens } from "./brand.ts";
import { bookingUrl, showsMeeting } from "./schedule.ts";
import { regionOf } from "../web/policy.ts";
import { contactPolicy } from "./overwrite.ts";
import { allFields, type Form, type Overwrite } from "./schema.ts";
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
  /** The visitor's first-touch UTMs and click ids, kept by the embed. */
  first?: unknown;
  ms?: unknown;
  trap?: unknown;
  turnstile?: unknown;
  /** The daily form check's token: its fills are marked as tests. */
  qa?: unknown;
};

export type Ctx = { custom: CustomField[]; own_domains?: string[]; partner_domains?: string[] };

export type SubmitArgs = {
  p_version: number;
  p_idem: string;
  p_values: Record<string, unknown>;
  p_hidden: Record<string, string>;
  /** overwrite: what each contact value may do to one already there (src/lib/forms/overwrite.ts). */
  p_contact: (ContactInput & { overwrite?: Record<string, Overwrite> }) | null;
  p_consent: { given?: boolean; notice?: boolean; wording?: string };
  p_country: string | null;
  p_spam: string | null;
};

const KEY = /^[A-Za-z0-9_-]{16,64}$/;
const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
// Ad click ids, kept with the UTMs (latest and first touch).
const CLICK = ["gclid", "fbclid", "li_fat_id", "msclkid"];

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
  const firstIn = raw.first && typeof raw.first === "object" ? (raw.first as Record<string, unknown>) : {};
  for (const k of [...UTM, ...CLICK]) {
    if (typeof utmIn[k] === "string" && utmIn[k]) meta[k] = (utmIn[k] as string).slice(0, 200);
    if (typeof firstIn[k] === "string" && firstIn[k]) meta[`first_${k}`] = (firstIn[k] as string).slice(0, 200);
  }
  const page = pageOnly(raw.page);
  const referrer = pageOnly(raw.referrer);
  if (page) meta.page = page;
  if (referrer) meta.referrer = referrer;
  for (const f of allFields(form)) if (f.type === "hidden" && typeof checked.values[f.key] === "string") meta[f.key] = checked.values[f.key] as string;

  const consentIn = raw.consent && typeof raw.consent === "object" ? (raw.consent as Record<string, unknown>) : {};
  // The wording saved is the form's own, never what the browser says it showed.
  const asked = form.consent.mode === "always" || (form.consent.mode === "by_region" && "given" in consentIn);
  const consent = form.consent.mode === "notice" ? { notice: true, wording: form.consent.label } : asked ? { given: consentIn.given === true, wording: form.consent.label } : {};

  const country = (typeof parts.country === "string" && countryCode(parts.country)) || (opts.country && /^[A-Z]{2}$/.test(opts.country) ? opts.country : null);
  let contact: SubmitArgs["p_contact"] = null;
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
    const overwrite = contactPolicy(form, checked.values);
    if (Object.keys(overwrite).length) contact.overwrite = overwrite;
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

/** The live form as the public routes load it (form_public). */
export type PublicForm = { id: string; workspace_id: string; version: number; status: "live" | "paused"; body: Form; tokens: Partial<Tokens>; logo_url: string | null };

/** The daily form check's token for a form, good for the day it was made and the next (src/app/api/forms). */
export function qaToken(formId: string, day: string, secret: string): string {
  return createHmac("sha256", secret).update(`form-qa:${formId}:${day}`).digest("hex").slice(0, 32);
}

export function qaOk(formId: string, token: unknown, secret: string | undefined, now = Date.now()): boolean {
  if (!secret || typeof token !== "string" || token.length !== 32) return false;
  const day = (t: number) => new Date(t).toISOString().slice(0, 10);
  return [day(now), day(now - 86_400_000)].some((d) => qaToken(formId, d, secret) === token);
}

/**
 * Take a fill for a live form: check it, save it (form_submit), and work out the booking link when the form books a
 * meeting. Shared by the public route and the tests, so both run the same steps. Answers status and JSON body.
 */
export async function acceptFill(
  rpc: Rpc,
  f: PublicForm,
  raw: Incoming,
  ctx: Ctx,
  o: { country?: string | null; turnstileFailed?: boolean; origin?: string | null; test?: boolean } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = prepareSubmit(f.body, f.version, raw, ctx, { country: o.country, turnstileFailed: o.turnstileFailed });
  if ("errors" in r) return { status: 400, body: { errors: r.errors } };
  if ("error" in r) return { status: r.status, body: { error: r.error } };
  const { data, error } = await rpc("form_submit", { p_form: f.id, ...r.args, p_test: o.test === true });
  if (error) {
    if (/isn't taking answers|Unknown form version/.test(error.message)) return { status: 409, body: { error: "This form changed. Refresh the page and try again." } };
    // Retryable: the browser keeps the fill and sends it again with the same key.
    return { status: 503, body: { error: "Try again in a moment." } };
  }
  const sid = (data as { id: string }).id;
  // Book a meeting next: the contact owner's link when the form says so and they have one, else the form's link.
  const sch = f.body.after.schedule;
  const lead = r.args.p_contact;
  let schedule: { tool: string; url: string } | null = null;
  // Who sees the calendar is decided here, on the checked answers (a field a rule hid or a skipped one has none) and
  // on the server's email class: a work email is anything but free mail.
  const byId: Record<string, unknown> = {};
  for (const x of allFields(f.body)) if (r.args.p_values[x.key] !== undefined) byId[x.id] = r.args.p_values[x.key];
  if (sch && lead && !r.args.p_spam && showsMeeting(sch, byId, !!lead.email_class && lead.email_class !== "free")) {
    let base = sch.url;
    if (sch.perOwner) {
      const own = await rpc("scheduler_for", { p_submission: sid, p_tool: sch.tool });
      if (typeof own.data === "string" && own.data) base = own.data;
    }
    let host: string | undefined;
    try {
      host = new URL(o.origin ?? "").hostname || undefined;
    } catch {}
    const url = base ? bookingUrl(sch.tool, base, { first: lead.first_name, last: lead.last_name, email: lead.email }, sid, host, sch.prefill !== false) : null;
    if (url) schedule = { tool: sch.tool, url };
  }
  return { status: 200, body: { id: sid, schedule } };
}
