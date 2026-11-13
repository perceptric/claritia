// A System email for one meeting (docs/system-emails.md): the workspace's design, built with its brand kit, its merge
// fields filled for the reader, parts without a value left out, and the preheader. When the design can't be read or
// built, the email Claritia sent before goes instead, so a meeting email is never lost to an edit. Server only.

import { applyConditions } from "../design/email/compile.ts";
import { readEmailDoc } from "../design/email/doc.ts";
import { compileWithKit, type KitRow } from "../design/email/server.ts";
import { MERGE } from "../workflows/merge.ts";
import { addToCalendar, fmtDay, fmtRange, fmtShort, fmtWhen, names, type MailParts, type MeetingView, type TimesView } from "./emails.ts";
import { keyOn, type FlowState } from "../workflows/meetingFlows.ts";
import { HTML_FIELDS, isSystemKey, SYSTEM_FIELDS, SYSTEM_META, type SystemField, type SystemKey } from "./systemEmails.ts";

/** A workspace's System emails as meeting_system_emails gives them, with its brand kits. */
export type SystemRow = { key: string; subject: string; preheader: string; doc: unknown; off: boolean };
export type SystemSet = { emails: SystemRow[]; kits: KitRow[]; /** The meeting workflows (165): which emails are on, and when reminders go. */ flows?: FlowState[] };
/** Each field's value as typed (subject, plain text, conditions) and, for the HTML fields, as HTML. */
export type Vars = { text: Partial<Record<SystemField, string | null>>; html: Partial<Record<SystemField, string>> };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();
const FIELDS = new Set(Object.keys(SYSTEM_FIELDS));

/** Reads what the database gave; anything else is no set (the built-in emails go). */
export function readSystemSet(raw: unknown): SystemSet | null {
  const r = raw && typeof raw === "object" ? (raw as { emails?: unknown; kits?: unknown; flows?: unknown }) : null;
  if (!r || !Array.isArray(r.emails)) return null;
  const emails = r.emails
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object" && isSystemKey((e as { key?: unknown }).key))
    .map((e) => ({ key: String(e.key), subject: typeof e.subject === "string" ? e.subject : "", preheader: typeof e.preheader === "string" ? e.preheader : "", doc: e.doc, off: e.off === true }));
  const flows = (Array.isArray(r.flows) ? r.flows : [])
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object" && typeof (f as { kind?: unknown }).kind === "string")
    .map((f) => ({ kind: String(f.kind), status: String(f.status ?? ""), body: f.body }));
  return { emails, kits: (Array.isArray(r.kits) ? r.kits : []) as KitRow[], flows };
}

/**
 * Whether the team turned this email off: on the email itself, or by pausing its workflow or taking its step out
 * (src/lib/workflows/meetingFlows.ts). The emails that carry the calendar invite always go.
 */
export function systemOff(set: SystemSet | null, key: SystemKey): boolean {
  if (SYSTEM_META[key].required) return false;
  return !!set?.emails.find((e) => e.key === key)?.off || !keyOn(set?.flows, key);
}

/** Fills the merge fields: known ones with their value (escaped in HTML), else the fallback after "|". */
export function fillFields(s: string, vars: Vars, html: boolean): string {
  return s.replace(MERGE, (_, k: string, fallback?: string) => {
    if (!FIELDS.has(k)) return html ? esc((fallback ?? "").trim()) : (fallback ?? "").trim();
    const f = k as SystemField;
    const raw = vars.text[f];
    if (!raw || !raw.trim()) return html ? esc((fallback ?? "").trim()) : (fallback ?? "").trim();
    return html ? (HTML_FIELDS.includes(f) && vars.html[f] !== undefined ? vars.html[f]! : esc(raw.trim())) : raw.trim();
  });
}

/** The email for this meeting from the team's design; `fallback` (the built-in email) when there's none or it fails. */
export function systemParts(set: SystemSet | null, key: SystemKey, values: Vars | (() => Vars), fallback: () => MailParts): MailParts {
  const row = set?.emails.find((e) => e.key === key);
  if (!row || !row.doc || typeof row.doc !== "object") return fallback();
  try {
    const vars = typeof values === "function" ? values() : values;
    const doc = readEmailDoc(row.doc, { allowHtml: true });
    if (!doc.sections.length) return fallback();
    const built = compileWithKit(doc, set!.kits, "live");
    const conds = Object.fromEntries(Object.entries(vars.text).map(([k, v]) => [k, v ?? null]));
    let html = applyConditions(built.html, conds);
    let text = applyConditions(built.text, conds);
    // System emails aren't marketing: a footer block's unsubscribe link and address have nothing to point at.
    html = html.replace(/<a [^>]*href="\{\{unsubscribe_url\}\}"[^>]*>[^<]*<\/a>/g, "").replace(/\{\{(unsubscribe_url|company_address)\}\}/g, "");
    text = text.replace(/^.*\{\{unsubscribe_url\}\}.*$/gm, "").replace(/\{\{company_address\}\}/g, "");
    html = fillFields(html, vars, true);
    text = fillFields(text, vars, false).replace(/\n{3,}/g, "\n\n").trim() + "\n";
    const subject = oneLine(fillFields(row.subject, vars, false));
    if (!subject || !html.trim()) return fallback();
    const pre = oneLine(fillFields(row.preheader || doc.settings.preheader || "", vars, false));
    if (pre) {
      const div = `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(pre)}</div>`;
      html = /<body[^>]*>/i.test(html) ? html.replace(/<body[^>]*>/i, (b) => `${b}${div}`) : `${div}${html}`;
    }
    return { subject, html, text };
  } catch {
    return fallback();
  }
}

// Values -------------------------------------------------------------------------------------------------------------

const lengthOf = (start: number, end: number) => {
  const m = Math.round((end - start) / 60_000);
  return m % 60 === 0 && m >= 60 ? `${m / 60} hour${m === 60 ? "" : "s"}` : `${m} min`;
};
const zoneOf = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
};
const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] ?? "";

/** A meeting email's values for one reader (the guest, or a host with `forHost`). */
export function meetingFields(
  v: MeetingView,
  o: { forHost?: boolean; oldTime?: number | null; reason?: string | null; bookLink?: string | null; timeLeft?: string | null; held?: string | null; noShow?: string | null } = {},
): Vars {
  const host = names(v.hosts.map((h) => h.name));
  const where = v.where.url ? v.where.label : v.where.detail ? `${v.where.label}: ${v.where.detail}` : v.where.label;
  const cal = addToCalendar({ title: `${v.typeName} with ${host}`, start: v.start, end: v.end, details: [v.where.url ? `Join: ${v.where.url}` : "", v.manage ? `Reschedule or cancel: ${v.manage}` : ""].filter(Boolean).join("\n"), location: v.where.url ?? where });
  const answers = v.answers.filter((a) => a.value.trim());
  const about = v.about?.trim() ?? "";
  return {
    text: {
      first_name: firstName(v.guestName) || null,
      guest_name: v.guestName?.trim() || v.guestEmail,
      guest_email: v.guestEmail,
      host_name: host,
      meeting_name: v.typeName,
      meeting_time: fmtWhen(v.start, v.tz, v.now),
      meeting_date: fmtDay(v.start, v.tz, v.now),
      meeting_clock: fmtRange(v.start, v.end, v.tz),
      meeting_month: new Intl.DateTimeFormat("en-US", { timeZone: zoneOf(v.tz), month: "short" }).format(v.start),
      meeting_day: new Intl.DateTimeFormat("en-US", { timeZone: zoneOf(v.tz), day: "numeric" }).format(v.start),
      meeting_length: lengthOf(v.start, v.end),
      meeting_where: where,
      meeting_link: v.where.url ?? null,
      reschedule_link: o.forHost ? null : (v.manage ?? null),
      calendar_google: cal.google,
      calendar_outlook: cal.outlook,
      about: about || null,
      answers: answers.length ? answers.map((a) => `${a.label}: ${a.value}`).join("\n") : null,
      old_time: o.oldTime ? fmtWhen(o.oldTime, v.tz, v.now) : null,
      cancel_reason: o.reason?.trim() || null,
      book_link: o.bookLink ?? null,
      time_left: o.timeLeft ?? null,
      held_link: o.held ?? null,
      no_show_link: o.noShow ?? null,
      workspace: v.brand?.trim() || null,
    },
    html: {
      about: esc(about).replace(/\n/g, "<br>"),
      answers: answers.map((a) => `<strong>${esc(a.label)}</strong>: ${esc(a.value).replace(/\n/g, "<br>")}`).join("<br>"),
    },
  };
}

/** The values of "pick a time" emails (no-show and book later). */
export function timesFields(v: TimesView, brand?: string | null): Vars {
  const times = v.times.map((t) => fmtShort(t, v.tz));
  return {
    text: {
      first_name: firstName(v.name) || null,
      guest_name: v.name?.trim() || null,
      host_name: v.host,
      meeting_name: v.typeName,
      book_link: v.link,
      open_times: times.length ? times.join("\n") : null,
      workspace: brand?.trim() || null,
    },
    html: { open_times: times.map(esc).join("<br>") },
  };
}
