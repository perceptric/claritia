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
import type { LiveRouter } from "../router/server.ts";
import { within } from "../meetings/team.ts";
import { callNewer } from "./newer.ts";
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
  // A throwaway address on a form that holds them: kept in Spam with its reason, never a contact or a delivery.
  const throwaway = form.spam.throwaway === "hold" && isRejected(e) && e.rejected === "disposable";
  if (emailField && !errors[emailField.id] && !throwaway) {
    if (isRejected(e)) errors[emailField.id] = e.rejected === "disposable" ? "Use an email address you'll keep." : "Enter a valid email.";
    else if ((emailField.check === "work_email" || form.spam.blockFree) && e.class === "free") errors[emailField.id] = "Use your work email.";
  }
  const held = spam ?? (throwaway ? "throwaway" : null);
  if (Object.keys(errors).length && !held) return { errors };

  const consentIn = raw.consent && typeof raw.consent === "object" ? (raw.consent as Record<string, unknown>) : {};
  // A required box that shows for this visitor (an unknown country counts as strict) must come back ticked.
  if (!held && form.consent.required && consentIn.given !== true && (form.consent.mode === "always" || (form.consent.mode === "by_region" && ("given" in consentIn || consentShown(form, opts.country)))))
    return { error: "Tick the box to send the form.", status: 400 };

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

  // The wording saved is the form's own, never what the browser says it showed.
  const asked = form.consent.mode === "always" || (form.consent.mode === "by_region" && "given" in consentIn);
  const consent = form.consent.mode === "notice" ? { notice: true, wording: form.consent.label } : asked ? { given: consentIn.given === true, wording: form.consent.label } : {};

  const country = (typeof parts.country === "string" && countryCode(parts.country)) || (opts.country && /^[A-Z]{2}$/.test(opts.country) ? opts.country : null);
  let contact: SubmitArgs["p_contact"] = null;
  if (!held && !isRejected(e)) {
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
      p_spam: held,
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
/** How long the send waits on routing before a job takes the lead. */
export const ROUTE_BUDGET_MS = 300;
/** Once the send's own router_commit has started, how long it may still take before the job is queued as well. */
export const COMMIT_GRACE_MS = 2000;

export type FillRouting = { routed: RoutedAs; live: LiveRouter | null | undefined };

/**
 * Route a fill: here within the budget, or by a route job (same key, `form:<submission>`), never both. Whichever side
 * claims the lead first owns it: the inline run asks `gate` just before router_commit, and once the budget is over
 * the job is queued only if the inline run hadn't claimed it yet. A commit already under way gets COMMIT_GRACE_MS;
 * past that the job is queued too, and the key makes its run a repeat that writes nothing. A router whose rules test
 * the qualify outcome always goes to the job: the send never waits on qualify (Claude). `before` runs first inside
 * the budget (the cached lookup for fields hidden as known). `live` is the router already read, when there is one.
 */
export async function routeFillWith(
  rpc: Rpc,
  ws: string,
  contact: string,
  submission: string,
  o: { live?: LiveRouter | null; before?: () => Promise<unknown>; budgetMs?: number; graceMs?: number } = {},
): Promise<FillRouting> {
  const key = `form:${submission}`;
  const later = () => enqueueJob(rpc, { workspaceId: ws, kind: "route", key, payload: { contact, reason: "form", key } }).catch(() => undefined);
  let owner: "inline" | "job" | null = null;
  const gate = () => {
    if (owner === null) owner = "inline";
    return owner === "inline";
  };
  const toJob = async (live?: LiveRouter | null): Promise<FillRouting> => {
    owner = "job";
    await later();
    return { routed: null, live };
  };
  let live: LiveRouter | null | undefined = o.live;
  try {
    const { liveRouterCached, route, usesQualify } = await import("../router/server.ts");
    const done = (async () => {
      if (live === undefined) live = await liveRouterCached(rpc, ws);
      if (live && !live.paused && usesQualify(live.body)) return { handOff: true as const };
      if (o.before) await o.before().catch(() => undefined);
      return { r: await route(rpc, { ws, contact, key, reason: "form", live, gate }) };
    })();
    done.catch(() => undefined);
    let got = await within(done, o.budgetMs ?? ROUTE_BUDGET_MS);
    if (!got) {
      // Out of time. Not claimed yet: the job takes it, and the inline run stops at its gate.
      if (owner === null) return await toJob(live);
      // The inline run's commit is under way: it finishes, or the job (a repeat by key) makes sure.
      got = await within(done, o.graceMs ?? COMMIT_GRACE_MS);
      if (!got) {
        await later();
        return { routed: null, live };
      }
    }
    const v = got.value;
    if ("handOff" in v) return await toJob(live);
    const r = v.r;
    if (r.status === "late") return { routed: null, live };
    if (r.status !== "ok" && r.status !== "dup") return { routed: null, live };
    const res = r.result;
    if (res.kind !== "owner") return { routed: { kind: res.kind }, live };
    // The meeting the rule names (docs/scheduling-plan.md 12.5); a lead no rule matched takes the fallback's.
    const body = live?.body;
    const rule = res.rule ? body?.rules.list.find((x) => x.id === res.rule) : undefined;
    const meet = rule ? rule.meet : res.by === "fallback" ? body?.fallback?.meet : undefined;
    return { routed: { kind: "owner", rule: res.rule ?? null, by: res.by, ...(meet ? { meet } : {}) }, live };
  } catch {
    // Failed before it claimed the lead, or while committing: the job routes it (a repeat by key writes nothing).
    if (owner !== "job") await later();
    owner = "job";
    return { routed: null, live };
  }
}

export async function routeFill(rpc: Rpc, ws: string, contact: string, submission: string): Promise<RoutedAs> {
  return (await routeFillWith(rpc, ws, contact, submission)).routed;
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

/**
 * The cached lookup into the new contact. It runs first inside the routing budget (so the router reads the lead
 * with it), never as a wait of its own; slower, the enrich_contact job fills it a moment later.
 */
async function fillKnown(rpc: Rpc, contact: string): Promise<void> {
  const { enrichContact } = await import("../enrich/server.ts");
  await enrichContact(rpc, contact, { trigger: "form", cacheOnly: true, budgetMs: ROUTE_BUDGET_MS });
}

/**
 * Take a fill. `ctx` (the workspace's cleaning lists) and `turnstileFailed` may come as promises started with the
 * form's load, so they run alongside the known-fields check. form_submit_all saves the fill, applies the hourly limit
 * and queues the alerts in one call (090); before that migration, the old calls in order.
 */
export async function acceptFill(
  rpc: Rpc,
  f: PublicForm,
  raw: Incoming,
  ctx: Ctx | Promise<Ctx>,
  o: { country?: string | null; turnstileFailed?: boolean | Promise<boolean>; origin?: string | null; ownHost?: string | null; test?: boolean; secret?: string; now?: number } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const [known, c, turnstileFailed] = await Promise.all([knownIds(rpc, f, raw), ctx, o.turnstileFailed]);
  const prepare = (overLimit: boolean) => prepareSubmit(f.body, f.version, raw, c, { country: o.country, turnstileFailed, known, origin: o.origin, ownHost: o.ownHost, overLimit });
  let r = prepare(false);
  if ("errors" in r) return { status: 400, body: { errors: r.errors } };
  if ("error" in r) return { status: r.status, body: { error: r.error } };
  let res = await callNewer(rpc, "form_submit_all", { p_form: f.id, ...r.args, p_test: o.test === true });
  const inOne = !!res;
  if (!res) {
    // Before 090: the hourly count first (a fill past it is held as spam), then the save.
    if (f.body.spam.perHour && !o.test && !r.args.p_spam && (await pastHourly(rpc, f.id, f.body.spam.perHour))) {
      const held = prepare(true);
      if ("args" in held) r = held;
    }
    res = await rpc("form_submit", { p_form: f.id, ...r.args, p_test: o.test === true });
  }
  const { data, error } = res;
  if (error) {
    if (/isn't taking answers|Unknown form version/.test(error.message)) return { status: 409, body: { error: "This form changed. Refresh the page and try again." } };
    // Retryable: the browser keeps the fill and sends it again with the same key.
    return { status: 503, body: { error: "Try again in a moment." } };
  }
  const saved = data as { id: string; contact_id?: string | null; repeat?: boolean; spam?: string | null };
  const sid = saved.id;
  const repeat = !!saved.repeat;
  // The database may hold it for the hourly limit ('rate'): then it's spam, with no contact.
  const spam = inOne ? (saved.spam ?? null) : r.args.p_spam;
  const cid = saved.contact_id;
  // Alerts and the auto-reply (their job waits for routing, so they name the rep). form_submit_all queued them; the
  // old way queues them here. The key is the submission's, so a repeat can't send twice.
  if (!inOne && !spam && !o.test && !repeat) await queueNotify(rpc, f.workspace_id, f.body, sid);
  // The router picks the owner now (docs/router.md Part 7), so the calendar below shows that rep's times. It has
  // ROUTE_BUDGET_MS; slower, or failing, the lead still books from the meeting type, and a job routes them with the
  // same key. Fields hidden as known are filled from the lookup the form already made, before the router reads them.
  const routing =
    cid && !spam && !repeat
      ? await routeFillWith(rpc, f.workspace_id, cid, sid, { before: f.body.enrich?.hideKnown ? () => fillKnown(rpc, cid) : undefined })
      : null;
  const routed = routing?.routed ?? null;
  // Book a meeting next: the contact owner's link when the form says so and they have one, else the form's link.
  const sch = f.body.after.schedule;
  const lead = spam ? null : r.args.p_contact;
  let schedule: { tool: string; url: string } | null = null;
  // Who sees the calendar is decided here, on the checked answers (a field a rule hid or a skipped one has none) and
  // on the server's email class: a work email is anything but free mail.
  const byId: Record<string, unknown> = {};
  for (const x of allFields(f.body)) if (r.args.p_values[x.key] !== undefined) byId[x.id] = r.args.p_values[x.key];
  if (sch && lead && !spam && showsMeeting(sch, byId, !!lead.email_class && lead.email_class !== "free") && routedBooks(sch, routed)) {
    if (!outside(sch.tool)) {
      // Claritia calendar: times from the cache with a signed token, or the message when there are none to show. A
      // booking hiccup never loses the fill: it's saved, and the lead gets the message.
      let booking: Booking | null = null;
      const typeId = routed?.meet ?? sch.meetingTypeId;
      if (typeId && o.secret) {
        try {
          booking = await offerForFill(rpc, { submission: sid, typeId, secret: o.secret, now: o.now, live: routing?.live });
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
/**
 * The alerts go now (they wait for routing in the job); the auto-reply goes 5 minutes later, so a lead who books in
 * the meantime gets it without a booking link (docs/scheduling-plan.md Part 13.1).
 */
export const REPLY_DELAY_S = 300;

export async function queueNotify(rpc: Rpc, ws: string, body: Form, submission: string): Promise<void> {
  // Both at once: a queue hiccup costs the alert, never the fill.
  await Promise.all([
    body.notify?.on ? enqueueJob(rpc, { workspaceId: ws, kind: "form_notify", key: `form_notify:${submission}`, payload: { submission, only: "alerts" } }).catch(() => undefined) : null,
    body.reply?.on ? enqueueJob(rpc, { workspaceId: ws, kind: "form_notify", key: `form_reply:${submission}`, payload: { submission, only: "reply" }, delayS: REPLY_DELAY_S }).catch(() => undefined) : null,
  ]);
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
