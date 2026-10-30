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
import { enqueueJob, type Rpc } from "../jobs.ts";
import { siteAllowed } from "./notify.ts";
import type { Tokens } from "./brand.ts";
import { offerForFill, type Booking } from "./booking.ts";
import { bookingUrl, outside, routedBooks, showsMeeting, type RoutedAs } from "./schedule.ts";
import { regionOf } from "../web/policy.ts";
import { contactPolicy } from "./overwrite.ts";
import { regionsOf } from "./regions.ts";
import { allFields, hideKeyOf, utcDay, type Form, type Overwrite } from "./schema.ts";
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
  /** Field ids the form hid as known (fill before submit). The server checks them again before trusting them. */
  known?: unknown;
  /** The visitor's day (YYYY-MM-DD), for rules like "within 30 days". Taken only when it's within a day of ours. */
  today?: unknown;
};

/** The visitor's day when it's within a day of the server's (time zones), else the server's own. */
export function visitorDay(raw: unknown, now = Date.now()): string {
  if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) && [utcDay(now - 86_400_000), utcDay(now), utcDay(now + 86_400_000)].includes(raw)) return raw;
  return utcDay(now);
}

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
  opts: { country?: string | null; turnstileFailed?: boolean; known?: Set<string>; origin?: string | null; ownHost?: string | null; overLimit?: boolean } = {},
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
  // A page off the form's list of sites, or past its hourly limit, is held the same way (docs/forms-plan.md Part 6).
  const spam =
    typeof raw.trap === "string" && raw.trap.trim()
      ? "trap"
      : !form.capture && ms < form.spam.minSeconds * 1000
        ? "too_fast"
        : opts.turnstileFailed
          ? "turnstile"
          : !ownPage(opts.origin, opts.ownHost) && !siteAllowed(form.spam.sites, opts.origin ?? pageOnly(raw.page) ?? null)
            ? "site"
            : opts.overLimit
              ? "rate"
              : null;

  const checked = checkAnswers(form, answers, { hidden, known: opts.known, today: visitorDay(raw.today), regions: regionsOf });
  const errors = { ...checked.errors };
  const parts = contactParts(checked.values);
  const emailField = allFields(form).find((f) => f.key === "email");
  const e = cleanEmail(parts.email ?? "", ctx);
  if (emailField && !errors[emailField.id]) {
    if (isRejected(e)) errors[emailField.id] = e.rejected === "disposable" ? "Use an email address you'll keep." : "Enter a valid email.";
    else if ((emailField.check === "work_email" || form.spam.blockFree) && e.class === "free") errors[emailField.id] = "Use your work email.";
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
/** design: the kit's published design system (src/lib/design/model.ts), raw as stored. */
export type PublicForm = { id: string; workspace_id: string; version: number; status: "live" | "paused"; body: Form; tokens: Partial<Tokens>; logo_url: string | null; design?: unknown };

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
 * meeting on an outside scheduler, or the times and booking token when it books with Claritia calendar. Shared by the public route and the tests, so both run the same steps. Answers status and JSON body.
 */
export async function routeFill(rpc: Rpc, ws: string, contact: string, submission: string): Promise<RoutedAs> {
  const key = `form:${submission}`;
  const later = () => enqueueJob(rpc, { workspaceId: ws, kind: "route", key, payload: { contact, reason: "form", key } }).catch(() => undefined);
  try {
    const { route } = await import("../router/server.ts");
    const { qualifyContact } = await import("../enrich/server.ts");
    const done = route(rpc, { ws, contact, key, reason: "form", qualify: (c) => qualifyContact(rpc, c, { timeoutMs: 2900 }) });
    const r = await Promise.race([done, new Promise<null>((res) => setTimeout(() => res(null), 300))]);
    done.catch(() => undefined);
    if (!r) {
      await later();
      return null;
    }
    if (r.status !== "ok" && r.status !== "dup") return null;
    return r.result.kind === "owner" ? { kind: "owner", rule: r.result.rule ?? null, by: r.result.by } : { kind: r.result.kind };
  } catch {
    await later();
    return null;
  }
}

/**
 * The fields the browser hid as known, checked again against the team's records and the lookup caches (filled when
 * the visitor left the email field). Only fields the owner allowed, and only ones still known, are let off.
 */
async function knownIds(rpc: Rpc, f: PublicForm, raw: Incoming): Promise<Set<string> | undefined> {
  const e = f.body.enrich;
  if (!e?.hideKnown || !Array.isArray(raw.known) || !raw.known.length) return undefined;
  const fields = allFields(f.body);
  const byId = new Map(fields.map((x) => [x.id, x]));
  const ids = raw.known.filter((id): id is string => typeof id === "string" && !!byId.get(id) && e.fields.includes(hideKeyOf(byId.get(id)!.key))).slice(0, 20);
  const emailField = fields.find((x) => x.key === "email");
  const answers = raw.answers && typeof raw.answers === "object" ? (raw.answers as Record<string, unknown>) : {};
  const email = emailField && typeof answers[emailField.id] === "string" ? (answers[emailField.id] as string) : "";
  if (!ids.length || !email) return undefined;
  try {
    const { knownForEmail } = await import("../enrich/server.ts");
    const keys = await knownForEmail(rpc, f.workspace_id, email, ids.map((id) => hideKeyOf(byId.get(id)!.key)), { cacheOnly: true, budgetMs: 400 });
    return new Set(ids.filter((id) => keys.includes(hideKeyOf(byId.get(id)!.key))));
  } catch {
    return undefined;
  }
}

/** The cached lookup into the new contact, in under 300 ms or not at all (the background job finishes it). */
async function fillKnown(rpc: Rpc, contact: string): Promise<void> {
  try {
    const { enrichContact } = await import("../enrich/server.ts");
    const done = enrichContact(rpc, contact, { trigger: "form", cacheOnly: true, budgetMs: 300 });
    done.catch(() => undefined);
    await Promise.race([done, new Promise((r) => setTimeout(r, 300))]);
  } catch {
    // The enrich_contact job fills it a moment later.
  }
}

export async function acceptFill(
  rpc: Rpc,
  f: PublicForm,
  raw: Incoming,
  ctx: Ctx,
  o: { country?: string | null; turnstileFailed?: boolean; origin?: string | null; ownHost?: string | null; test?: boolean; secret?: string; now?: number } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const known = await knownIds(rpc, f, raw);
  const overLimit = f.body.spam.perHour && !o.test ? await pastHourly(rpc, f.id, f.body.spam.perHour) : false;
  const r = prepareSubmit(f.body, f.version, raw, ctx, { country: o.country, turnstileFailed: o.turnstileFailed, known, origin: o.origin, ownHost: o.ownHost, overLimit });
  if ("errors" in r) return { status: 400, body: { errors: r.errors } };
  if ("error" in r) return { status: r.status, body: { error: r.error } };
  const { data, error } = await rpc("form_submit", { p_form: f.id, ...r.args, p_test: o.test === true });
  if (error) {
    if (/isn't taking answers|Unknown form version/.test(error.message)) return { status: 409, body: { error: "This form changed. Refresh the page and try again." } };
    // Retryable: the browser keeps the fill and sends it again with the same key.
    return { status: 503, body: { error: "Try again in a moment." } };
  }
  const sid = (data as { id: string }).id;
  // The router picks the owner now (docs/router.md Part 7), so the calendar below shows that rep's times. It has
  // 300 ms; slower, or failing, the lead still books from the meeting type, and a job routes them with the same key.
  const cid = (data as { contact_id?: string | null }).contact_id;
  // Fields hidden as known are filled from the lookup the form already made, before the router reads the lead.
  if (cid && !r.args.p_spam && f.body.enrich?.hideKnown && !(data as { repeat?: boolean }).repeat) await fillKnown(rpc, cid);
  const routed = cid && !r.args.p_spam && !(data as { repeat?: boolean }).repeat ? await routeFill(rpc, f.workspace_id, cid, sid) : null;
  // Alerts and the auto-reply go after routing, so they name the rep. The key is the submission's, so a repeat
  // can't send twice; a queue hiccup costs the alert, never the fill.
  if (!r.args.p_spam && !o.test && !(data as { repeat?: boolean }).repeat) await queueNotify(rpc, f.workspace_id, f.body, sid);
  // Book a meeting next: the contact owner's link when the form says so and they have one, else the form's link.
  const sch = f.body.after.schedule;
  const lead = r.args.p_contact;
  let schedule: { tool: string; url: string } | null = null;
  // Who sees the calendar is decided here, on the checked answers (a field a rule hid or a skipped one has none) and
  // on the server's email class: a work email is anything but free mail.
  const byId: Record<string, unknown> = {};
  for (const x of allFields(f.body)) if (r.args.p_values[x.key] !== undefined) byId[x.id] = r.args.p_values[x.key];
  if (sch && lead && !r.args.p_spam && showsMeeting(sch, byId, !!lead.email_class && lead.email_class !== "free") && routedBooks(sch, routed)) {
    if (!outside(sch.tool)) {
      // Claritia calendar: times from the cache with a signed token, or the message when there are none to show. A
      // booking hiccup never loses the fill: it's saved, and the lead gets the message.
      let booking: Booking | null = null;
      if (sch.meetingTypeId && o.secret) {
        try {
          booking = await offerForFill(rpc, { submission: sid, typeId: sch.meetingTypeId, secret: o.secret, now: o.now });
        } catch {
          booking = null;
        }
      }
      return { status: 200, body: { id: sid, schedule: null, ...(booking ? { booking } : {}) } };
    }
    let base = sch.url;
    if (sch.perOwner) {
      const own = await rpc("scheduler_for", { p_submission: sid, p_tool: sch.tool });
      if (typeof own.data === "string" && own.data) base = own.data;
    }
    let host: string | undefined;
    try {
      host = new URL(o.origin ?? "").hostname || undefined;
    } catch {}
    const url = base && outside(sch.tool) ? bookingUrl(sch.tool, base, { first: lead.first_name, last: lead.last_name, email: lead.email }, sid, host, sch.prefill !== false) : null;
    if (url) schedule = { tool: sch.tool, url };
  }
  return { status: 200, body: { id: sid, schedule } };
}

/** The form's own hosted page (/f/<id>) is always allowed. */
function ownPage(origin: string | null | undefined, ownHost: string | null | undefined): boolean {
  if (!origin || !ownHost) return false;
  try {
    return new URL(origin).host.toLowerCase() === ownHost.toLowerCase();
  } catch {
    return false;
  }
}

/** Whether a form already took its hourly limit (submissions in the last hour, spam and tests aside). */
async function pastHourly(rpc: Rpc, form: string, perHour: number): Promise<boolean> {
  const { data, error } = await rpc("form_hour_count", { p_form: form });
  // Can't count: take it. A missing limit costs less than a lost lead.
  if (error || typeof data !== "number") return false;
  return data >= perHour;
}

/** One form_notify job per submission when the form alerts the team or replies (worker-intel/jobs/forms.ts). */
export async function queueNotify(rpc: Rpc, ws: string, body: Form, submission: string): Promise<void> {
  if (!body.notify?.on && !body.reply?.on) return;
  await enqueueJob(rpc, { workspaceId: ws, kind: "form_notify", key: `form_notify:${submission}`, payload: { submission } }).catch(() => undefined);
}

/** A saved fill as releaseFill reads it. */
export type HeldFill = {
  id: string;
  workspace_id: string;
  form_version: number;
  idem_key: string;
  values: Record<string, unknown>;
  consent: Record<string, unknown>;
  country: string | null;
  created_at: string;
  contact_id: string | null;
};

/**
 * Let a fill held as spam through (docs/forms-plan.md 1.1): its saved answers go through the same checks a fill takes
 * on the way in, against the version it was sent on, then submission_release gives it its contact, consent and
 * deliveries, and the router picks it up. A fill that was a lead before (marked spam by hand) only leaves Spam. A
 * fill whose answers can't make a lead (a disposable email, say) stays where it is, with the reason.
 */
export async function releaseFill(rpc: Rpc, s: HeldFill, body: Form, ctx: Ctx): Promise<{ contact: string | null } | { error: string }> {
  let args: SubmitArgs | null = null;
  if (!s.contact_id) {
    const answers: Record<string, unknown> = {};
    const hidden: Record<string, string> = {};
    for (const f of allFields(body)) {
      const v = s.values[f.key];
      if (v === undefined) continue;
      if (f.type === "hidden") {
        if (typeof v === "string") hidden[f.id] = v;
      } else answers[f.id] = v;
    }
    const consent = typeof s.consent.given === "boolean" ? { given: s.consent.given } : {};
    const raw: Incoming = { v: 1, version: s.form_version, key: s.idem_key, answers, hidden, consent, ms: 3_600_000, trap: "", today: s.created_at.slice(0, 10) };
    const r = prepareSubmit(body, s.form_version, raw, ctx, { country: s.country });
    if ("errors" in r) return { error: Object.values(r.errors)[0] ?? "Check the answers." };
    if ("error" in r) return { error: r.error };
    if (!r.args.p_contact) return { error: "This fill has no email to make a lead from." };
    args = r.args;
  }
  const { data, error } = await rpc("submission_release", { p_sid: s.id, p_contact: args?.p_contact ?? null, p_consent: args?.p_consent ?? s.consent });
  if (error) return { error: "Try again in a moment." };
  const contact = typeof data === "string" ? data : null;
  if (contact && args) await routeFill(rpc, s.workspace_id, contact, s.id);
  return { contact };
}
