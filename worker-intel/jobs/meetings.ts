// Meeting emails and timed steps on claritia-intel (docs/meetings-scheduler.md 1.7 and 2.4).
//   meeting_notify {meeting, event}: booked → confirmation with the invite to the guest, a note to each host, and the
//       reminder and after-meeting jobs; moved → the updated invite, notes, and new jobs; canceled → cancel notices and
//       the jobs dropped; no_show → one follow-up with the host's next times (when the type allows); held → nothing.
//   meeting_remind {meeting, start, minutes}: a reminder to the guest, only if the meeting is still booked at that start.
//   meeting_after {meeting, end}: "How did it go?" to each host with one-time Held and No-show links.
//   meeting_book_later {submission, type, host?, owner?}: the lead saw times and didn't book: the submission is marked
//       not booked and the lead gets "Pick a time with <host>", unless a meeting for it exists by now.
// Every email is started in meeting_mails under a dedupe key before it's handed to SES, and one that may have gone out
// is never sent again, so a job delivered twice sends one email. Emails go from the workspace's From address when its
// domain is verified, else from MEETINGS_FROM (default meetings@tryclaritia.com, which must be verified in SES).

import { slackNote } from "../../src/lib/delivery/send.ts";
import { outcomeOf, SendError } from "../../src/lib/email/provider.ts";
import { smtpFromEnv, smtpSend, smtpSession, type SmtpOpts } from "../../src/lib/email/smtp.ts";
import { enqueueJob, enqueueJobs, JobError, type Handler, type Job, type Rpc } from "../../src/lib/jobs.ts";
import {
  afterEmail,
  bookLaterEmail,
  cancelEmail,
  confirmEmail,
  hostBookedEmail,
  hostCanceledEmail,
  hostMovedEmail,
  mime,
  noShowEmail,
  reconnectEmail,
  reminderEmail,
  updateEmail,
  validAddress,
  whereLine,
  whereOf,
  type MailParts,
  type MeetingView,
} from "../../src/lib/meetings/emails.ts";
import { buildIcs } from "../../src/lib/meetings/ics.ts";
import { bookingUrl, bookRef, keptManageToken, manageUrl, newNonce, outcomeToken, outcomeUrl } from "../../src/lib/meetings/links.ts";
import { offer } from "../../src/lib/meetings/server.ts";
import { validZone } from "../../src/lib/meetings/time.ts";
import { DEFAULT_SETTINGS, type MeetingType, type TypeSettings } from "../../src/lib/meetings/types.ts";

const MIN = 60_000;
const NOT_SET = "Resend isn't set up on the worker (RESEND_API_KEY).";

// Sending ---------------------------------------------------------------------------------------------------------

export type Mail = { from: string; to: string; raw: string; tags: Record<string, string> };
/**
 * Sends one raw message; returns the provider's id ("" when it gave none). Throws SendError: retry (not now) or
 * unknown (may have gone). `session` sends several over one connection; close it when done.
 */
export type Mailer = { send(m: Mail): Promise<string>; session?(): { send(m: Mail): Promise<string>; close(): void } };

/** Raw sends through Resend's SMTP relay (the calendar invite needs its own MIME part). */
export function smtpMailer(o: SmtpOpts): Mailer {
  return { send: (m) => smtpSend(o, m), session: () => smtpSession(o) };
}

export function mailerFromEnv(env: NodeJS.ProcessEnv = process.env): Mailer | null {
  const o = smtpFromEnv(env);
  return o ? smtpMailer(o) : null;
}

/** The Claritia address meeting emails use when the workspace has no verified domain. */
export const systemFrom = (env: NodeJS.ProcessEnv = process.env) => {
  const v = env.MEETINGS_FROM?.trim().toLowerCase();
  return v && validAddress(v) ? v : "meetings@tryclaritia.com";
};

export type MeetingOpts = {
  mailer: Mailer | null;
  /** The app's address for links (linkBase()). */
  base: string;
  /** SECRETS_KEY, for the sealed manage token and signed links; defaults to the environment. */
  secret?: string;
  /** MEETINGS_FROM. */
  from?: string;
  now?: () => number;
  /** Set for one job by inJob: the provider's wait after a rate limit. */
  retryAfterS?: number;
  /** Set for one job by inJob: the answers to record in one call at the end, and the lease's signal. */
  pending?: { id: string; outcome: string; provider_id: string | null; error: string | null }[];
  signal?: AbortSignal;
};

/**
 * One job's emails: one connection to the relay for all of them, the answers recorded in one call at the end (also
 * when the job throws), and no new email started once the lease is lost (another worker may hold the job; the
 * meeting_mails dedupe keeps it from sending what this one did).
 */
async function inJob(rpc: Rpc, o: MeetingOpts, signal: AbortSignal | undefined, body: (o: MeetingOpts) => Promise<void>) {
  const session = o.mailer?.session?.();
  // One message at a time on the connection, even when a handler starts several at once.
  let line: Promise<unknown> = Promise.resolve();
  const send = (m: Mail) => {
    const next = line.then(() => session!.send(m));
    line = next.catch(() => undefined);
    return next;
  };
  const x: MeetingOpts = { ...o, mailer: session && o.mailer ? { send } : o.mailer, pending: [], signal };
  try {
    await body(x);
  } finally {
    session?.close();
    if (x.pending!.length) await call(rpc, "meeting_mail_done_many", { p_rows: x.pending });
  }
}

async function call<T>(rpc: Rpc, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

type Sending = { from_name: string | null; from_email: string | null; reply_to: string | null; paused: boolean };
type Outcome = "sent" | "skipped" | "retry" | "failed" | "unknown";

type Send = {
  ws: string;
  meeting?: string | null;
  submission?: string | null;
  kind: "confirm" | "host_booked" | "update" | "host_moved" | "cancel" | "host_canceled" | "reminder" | "after" | "no_show" | "book_later" | "reconnect";
  to: string;
  dedupe: string;
  /** Respects suppressions, erasures and paused sending. */
  optional?: boolean;
  fromName: string | null;
  replyTo?: string | null;
  parts: () => MailParts;
  ics?: () => { method: "REQUEST" | "CANCEL"; body: string };
};

/** Start the email in meeting_mails (once per dedupe key), send it, and record the answer. */
async function sendOne(rpc: Rpc, o: MeetingOpts, sending: Sending, s: Send): Promise<Outcome> {
  if (!o.mailer) throw new JobError(NOT_SET, { retry: false });
  if (o.signal?.aborted) throw new Error("Stopped: the job's lease is gone");
  const to = s.to.trim().toLowerCase();
  if (!validAddress(to)) return "skipped";
  const id = await call<string | null>(rpc, "meeting_mail_start", {
    p_ws: s.ws,
    p_meeting: s.meeting ?? null,
    p_submission: s.submission ?? null,
    p_kind: s.kind,
    p_to: to,
    p_dedupe: s.dedupe.slice(0, 300),
    p_optional: !!s.optional,
  });
  if (!id) return "skipped";
  const fromEmail = sending.from_email ?? o.from ?? systemFrom();
  let outcome: "ok" | "retry" | "unknown" | "failed" = "ok";
  let providerId: string | null = null;
  let error: string | null = null;
  try {
    const parts = s.parts();
    const raw = mime({ from: { name: s.fromName, email: fromEmail }, to, replyTo: s.replyTo && validAddress(s.replyTo) ? s.replyTo : null, subject: parts.subject, html: parts.html, text: parts.text, ics: s.ics?.() ?? null });
    providerId = await o.mailer.send({ from: fromEmail, to, raw, tags: { meeting_mail: id, kind: s.kind } });
  } catch (e) {
    const out = outcomeOf(e);
    outcome = out === "later" ? "retry" : out === "ok" ? "failed" : out;
    error = (e as Error).message;
    // A rate limit that said how long to wait.
    if (e instanceof SendError && e.later && e.retryAfterS) o.retryAfterS = Math.max(o.retryAfterS ?? 0, e.retryAfterS);
  }
  if (o.pending) o.pending.push({ id, outcome, provider_id: providerId || null, error });
  else await call(rpc, "meeting_mail_done", { p_id: id, p_outcome: outcome, p_provider_id: providerId || null, p_error: error });
  return outcome === "ok" ? "sent" : outcome;
}

/** A "not now" waits what the provider asked, else 30 seconds doubling each try (up to 30 minutes), with jitter. */
export function notNowWait(attempts: number, asked?: number, rand: () => number = Math.random): number {
  if (asked && asked > 0) return Math.min(asked, 3600);
  return Math.round(Math.min(1800, 30 * 2 ** Math.max(0, attempts - 1)) * (0.8 + 0.4 * rand()));
}

/** After a job's emails: a "not now" from the provider sends the job round again (sent ones are skipped then). */
function settle(results: Outcome[], job?: Pick<Job, "attempts">, o?: MeetingOpts) {
  if (results.includes("retry")) throw new JobError("The email provider said not now; trying again", { retryAfterS: notNowWait(job?.attempts ?? 1, o?.retryAfterS) });
}
const settleFor = (job: Pick<Job, "attempts">, o: MeetingOpts, results: Outcome[]) => settle(results, job, o);

// Reading a meeting -----------------------------------------------------------------------------------------------

type Person = { id: string; name: string; email: string; tz: string };
type MeetingRow = {
  id: string;
  workspace_id: string;
  type_id: string | null;
  hosts: string[];
  guest_email: string;
  guest_name: string | null;
  guest_tz: string | null;
  answers: Record<string, unknown>;
  start_at: string;
  end_at: string;
  status: string;
  location: Record<string, unknown>;
  events: Record<string, Record<string, unknown>>;
  token_hash: string;
  token_sealed: string | null;
  cancel_reason: string | null;
};
type TypeRow = Omit<MeetingType, "settings"> & { settings: Partial<TypeSettings> & { noShowFollowUp?: boolean } };
type Info = {
  meeting: MeetingRow;
  type: TypeRow | null;
  hosts: Person[];
  workspace: { id: string; name: string; slug: string };
  sending: Sending;
  sequence: number;
  moved_from: string | null;
  canceled_by: string | null;
};

const ms = (s: string) => new Date(s).getTime();
const tzOr = (...zones: (string | null | undefined)[]) => zones.find((z) => z && validZone(z)) ?? "UTC";
const settingsOf = (t: TypeRow | null): TypeSettings & { noShowFollowUp?: boolean } => ({ ...DEFAULT_SETTINGS, ...(t?.settings ?? {}) });
const typeOf = (t: TypeRow): MeetingType => ({ ...t, settings: settingsOf(t) });

/** The video link made with the calendar event: on the meeting's location, or on any host's event. */
function joinUrl(m: MeetingRow): string | null {
  const l = m.location ?? {};
  const pick = (v: unknown) => (typeof v === "string" && /^https:\/\//.test(v) ? v : null);
  // meeting_sync keeps the Meet, Teams or Zoom link as location.url (a custom-link type's url is the same field).
  const direct = pick(l.url) ?? pick(l.join_url) ?? pick(l.joinUrl);
  if (direct) return direct;
  for (const e of Object.values(m.events ?? {})) {
    const zoom = e?.zoom as { url?: unknown } | undefined;
    const u = pick(zoom?.url) ?? pick(e?.join_url) ?? pick(e?.joinUrl);
    if (u) return u;
  }
  return null;
}

/** A poll's other voters: the guests besides the one the meeting is under (answers.guests, comma-separated). */
export function otherGuests(m: Pick<MeetingRow, "guest_email" | "answers">): string[] {
  const raw = typeof m.answers?.guests === "string" ? m.answers.guests : "";
  const main = m.guest_email.toLowerCase();
  return [...new Set(raw.split(",").map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e !== main))].slice(0, 50);
}

function answersOf(m: MeetingRow, t: TypeRow | null): { label: string; value: string }[] {
  const qs = settingsOf(t).questions ?? [];
  return Object.entries(m.answers ?? {})
    .map(([k, v]) => ({ label: qs.find((q) => q.id === k)?.label ?? k, value: Array.isArray(v) ? v.join(", ") : String(v ?? "") }))
    .filter((a) => a.value.trim())
    .slice(0, 30)
    .map((a) => ({ label: a.label.slice(0, 120), value: a.value.slice(0, 2000) }));
}

const guestPhone = (m: MeetingRow) => {
  const v = Object.entries(m.answers ?? {}).find(([k]) => /phone/i.test(k))?.[1];
  return typeof v === "string" ? v : null;
};

function view(info: Info, reader: "guest" | Person, now: number, manage?: string | null): MeetingView {
  const m = info.meeting;
  const forHost = reader !== "guest";
  const host = info.hosts[0]?.name ?? info.workspace.name;
  return {
    typeName: info.type?.name ?? "Meeting",
    start: ms(m.start_at),
    end: ms(m.end_at),
    guestName: m.guest_name,
    guestEmail: m.guest_email,
    hosts: info.hosts.map((h) => ({ name: h.name, email: h.email })),
    answers: answersOf(m, info.type),
    tz: forHost ? tzOr(reader.tz) : tzOr(m.guest_tz, info.hosts[0]?.tz),
    where: whereOf(m.location?.kind ? m.location : info.type?.settings?.location, { joinUrl: joinUrl(m), host, guest: m.guest_name || m.guest_email, guestPhone: guestPhone(m), forHost }),
    manage: manage ?? null,
    now,
  };
}

function ics(info: Info, method: "REQUEST" | "CANCEL", now: number) {
  const m = info.meeting;
  const v = view(info, "guest", now);
  const organizer = info.hosts[0] ? { name: info.hosts[0].name, email: info.hosts[0].email } : { name: info.workspace.name, email: info.sending.from_email ?? "meetings@tryclaritia.com" };
  return {
    method,
    body: buildIcs({
      meetingId: m.id,
      sequence: info.sequence,
      method,
      start: ms(m.start_at),
      end: ms(m.end_at),
      stamp: now,
      summary: `${v.typeName} with ${info.hosts.map((h) => h.name).join(", ") || info.workspace.name}`,
      description: [v.where.url ? `Join: ${v.where.url}` : "", ...v.answers.map((a) => `${a.label}: ${a.value}`)].filter(Boolean).join("\n"),
      location: whereLine(v.where),
      url: v.where.url,
      organizer,
      attendees: [{ name: m.guest_name, email: m.guest_email }, ...otherGuests(m).map((email) => ({ name: null, email })), ...info.hosts.slice(1).map((h) => ({ name: h.name, email: h.email }))],
    }),
  };
}

async function load(rpc: Rpc, meeting: string): Promise<Info | null> {
  return await call<Info | null>(rpc, "meeting_mail_info", { p_meeting: meeting });
}

/** The guest's reschedule and cancel page, when a sealed copy of their token is kept (links.ts). */
const manageLink = (o: MeetingOpts, m: MeetingRow) => {
  const t = keptManageToken(m, o.secret);
  return t ? manageUrl(o.base, t) : null;
};

const fromHost = (info: Info) => info.hosts[0]?.name ?? info.sending.from_name ?? info.workspace.name;
const fromTeam = (info: Info) => info.sending.from_name ?? info.workspace.name;

// Timed steps -----------------------------------------------------------------------------------------------------

/** Reminder and after-meeting jobs for the meeting's time now; any waiting for an earlier time are dropped. */
async function schedule(rpc: Rpc, info: Info, now: number) {
  const m = info.meeting;
  const start = ms(m.start_at);
  const end = ms(m.end_at);
  const startIso = new Date(start).toISOString();
  const endIso = new Date(end).toISOString();
  const jobs: { key: string; kind: string; payload: object; at: number }[] = [];
  for (const min of [...new Set(settingsOf(info.type).reminders ?? [])]) {
    if (!Number.isInteger(min) || min <= 0) continue;
    const at = start - min * MIN;
    if (at > now) jobs.push({ key: `remind:${m.id}:${startIso}:${min}`, kind: "meeting_remind", payload: { meeting: m.id, start: startIso, minutes: min }, at });
  }
  jobs.push({ key: `after:${m.id}:${endIso}`, kind: "meeting_after", payload: { meeting: m.id, end: endIso }, at: end });
  await call(rpc, "meeting_jobs_drop", { p_meeting: m.id, p_keep: jobs.map((j) => j.key) });
  await enqueueJobs(rpc, jobs.map((j) => ({ workspaceId: m.workspace_id, kind: j.kind, key: j.key, payload: j.payload, delayS: Math.max(0, Math.ceil((j.at - now) / 1000)), maxAttempts: 5 })));
}

// Handlers --------------------------------------------------------------------------------------------------------

const EVENTS = ["booked", "moved", "canceled", "held", "no_show"] as const;
type Event = (typeof EVENTS)[number];

export const meetingNotify =
  (rpc: Rpc, base: MeetingOpts): Handler =>
  (job, signal) =>
    inJob(rpc, base, signal, async (o) => {
      const meeting = String(job.payload.meeting ?? "");
      const event = String(job.payload.event ?? "") as Event;
      if (!/^[0-9a-f-]{36}$/.test(meeting) || !EVENTS.includes(event)) throw new JobError("meeting_notify needs a meeting and an event", { retry: false });
      if (event === "held") return;
      const info = await load(rpc, meeting);
      if (!info) return;
      const now = o.now?.() ?? Date.now();
      const m = info.meeting;
      const ws = m.workspace_id;
      const results: Outcome[] = [];

      if (event === "booked" || event === "moved") {
        // A notify that arrives after the meeting changed again sends nothing old: a canceled meeting gets its cancel.
        if (m.status !== "booked") return;
        const manage = manageLink(o, m);
        const moved = event === "moved";
        const from = info.moved_from ? ms(info.moved_from) : null;
        results.push(
          await sendOne(rpc, o, info.sending, {
            ws,
            meeting: m.id,
            kind: moved ? "update" : "confirm",
            to: m.guest_email,
            dedupe: moved ? `update:${m.id}:${info.sequence}` : `confirm:${m.id}`,
            fromName: fromHost(info),
            replyTo: info.hosts[0]?.email,
            parts: () => (moved ? updateEmail(view(info, "guest", now, manage), from) : confirmEmail(view(info, "guest", now, manage))),
            ics: () => ics(info, "REQUEST", now),
          }),
        );
        // A poll's other voters get the same invite, without the manage link (it changes the meeting for everyone).
        for (const g of otherGuests(m)) {
          results.push(
            await sendOne(rpc, o, info.sending, {
              ws,
              meeting: m.id,
              kind: moved ? "update" : "confirm",
              to: g,
              dedupe: moved ? `update:${m.id}:${info.sequence}:${g}` : `confirm:${m.id}:${g}`,
              fromName: fromHost(info),
              replyTo: info.hosts[0]?.email,
              parts: () => (moved ? updateEmail(view(info, "guest", now, null), from) : confirmEmail(view(info, "guest", now, null))),
              ics: () => ics(info, "REQUEST", now),
            }),
          );
        }
        for (const h of info.hosts) {
          results.push(
            await sendOne(rpc, o, info.sending, {
              ws,
              meeting: m.id,
              kind: moved ? "host_moved" : "host_booked",
              to: h.email,
              dedupe: moved ? `host_moved:${m.id}:${info.sequence}:${h.id}` : `host_booked:${m.id}:${h.id}`,
              fromName: fromTeam(info),
              replyTo: m.guest_email,
              parts: () => (moved ? hostMovedEmail(view(info, h, now), from) : hostBookedEmail(view(info, h, now))),
            }),
          );
        }
        await schedule(rpc, info, now);
        settle(results, job, o);
        return;
      }

      if (event === "canceled") {
        if (m.status !== "canceled") return;
        await call(rpc, "meeting_jobs_drop", { p_meeting: m.id, p_keep: [] });
        const t = info.type;
        const bookAgain = t && t.active && !t.secret ? bookingUrl(o.base, { workspace: info.workspace.slug, type: t.slug, name: m.guest_name, email: m.guest_email }) : null;
        // The guest who canceled still gets the cancel, so their calendar drops the invite.
        results.push(
          await sendOne(rpc, o, info.sending, {
            ws,
            meeting: m.id,
            kind: "cancel",
            to: m.guest_email,
            dedupe: `cancel:${m.id}`,
            fromName: fromHost(info),
            replyTo: info.hosts[0]?.email,
            parts: () => cancelEmail(view(info, "guest", now), { reason: m.cancel_reason, bookAgain }),
            ics: () => ics(info, "CANCEL", now),
          }),
        );
        for (const g of otherGuests(m)) {
          results.push(
            await sendOne(rpc, o, info.sending, {
              ws,
              meeting: m.id,
              kind: "cancel",
              to: g,
              dedupe: `cancel:${m.id}:${g}`,
              fromName: fromHost(info),
              replyTo: info.hosts[0]?.email,
              parts: () => cancelEmail(view(info, "guest", now), { reason: m.cancel_reason, bookAgain: null }),
              ics: () => ics(info, "CANCEL", now),
            }),
          );
        }
        for (const h of info.hosts) {
          results.push(
            await sendOne(rpc, o, info.sending, {
              ws,
              meeting: m.id,
              kind: "host_canceled",
              to: h.email,
              dedupe: `host_canceled:${m.id}:${h.id}`,
              fromName: fromTeam(info),
              replyTo: m.guest_email,
              parts: () => hostCanceledEmail(view(info, h, now), m.cancel_reason),
            }),
          );
        }
        settle(results, job, o);
        return;
      }

      // no_show: one follow-up per meeting, with the host's next times, when the type allows it.
      if (m.status !== "no_show" || !info.type || settingsOf(info.type).noShowFollowUp === false) return;
      const t = typeOf(info.type);
      const host = info.hosts[0];
      let times: number[] = [];
      try {
        const got = await offer(rpc, { ws, type: t, length: t.settings.lengths[0] ?? 30, now });
        times = got.slots.filter((s) => !host || s.hosts.includes(host.id)).slice(0, 5).map((s) => s.start);
      } catch {
        times = [];
      }
      const link = bookingUrl(o.base, { workspace: info.workspace.slug, type: t.slug, name: m.guest_name, email: m.guest_email, host: t.hosts.length > 1 ? host?.id : null });
      const tz = tzOr(m.guest_tz, host?.tz);
      results.push(
        await sendOne(rpc, o, info.sending, {
          ws,
          meeting: m.id,
          kind: "no_show",
          to: m.guest_email,
          dedupe: `no_show:${m.id}`,
          optional: true,
          fromName: fromHost(info),
          replyTo: host?.email,
          parts: () => noShowEmail({ name: m.guest_name, host: host?.name ?? info.workspace.name, typeName: t.name, times, tz, link, now }),
        }),
      );
      settle(results, job, o);
    });

export const meetingRemind =
  (rpc: Rpc, base: MeetingOpts): Handler =>
  (job, signal) =>
    inJob(rpc, base, signal, async (o) => {
      const meeting = String(job.payload.meeting ?? "");
      const start = ms(String(job.payload.start ?? ""));
      const min = Number(job.payload.minutes);
      if (!/^[0-9a-f-]{36}$/.test(meeting) || !Number.isFinite(start) || !Number.isInteger(min)) throw new JobError("meeting_remind needs a meeting, a start and minutes", { retry: false });
      const info = await load(rpc, meeting);
      const now = o.now?.() ?? Date.now();
      // Only for the time it was scheduled for: a moved meeting has its own reminders, a canceled one none.
      if (!info || info.meeting.status !== "booked" || ms(info.meeting.start_at) !== start || now >= start) return;
      const m = info.meeting;
      const manage = manageLink(o, m);
      const left = Math.max(1, Math.round((start - now) / MIN));
      settleFor(job, o, [
        await sendOne(rpc, o, info.sending, {
          ws: m.workspace_id,
          meeting: m.id,
          kind: "reminder",
          to: m.guest_email,
          dedupe: `remind:${m.id}:${new Date(start).toISOString()}:${min}`,
          fromName: fromHost(info),
          replyTo: info.hosts[0]?.email,
          // The subject says how long is left now, in case the job ran late.
          parts: () => reminderEmail(view(info, "guest", now, manage), Math.abs(left - min) <= 5 ? min : left),
        }),
        ...(await Promise.all(
          otherGuests(m).map((g) =>
            sendOne(rpc, o, info.sending, {
              ws: m.workspace_id,
              meeting: m.id,
              kind: "reminder",
              to: g,
              dedupe: `remind:${m.id}:${new Date(start).toISOString()}:${min}:${g}`,
              fromName: fromHost(info),
              replyTo: info.hosts[0]?.email,
              parts: () => reminderEmail(view(info, "guest", now, null), Math.abs(left - min) <= 5 ? min : left),
            }),
          ),
        )),
      ]);
    });

export const meetingAfter =
  (rpc: Rpc, base: MeetingOpts): Handler =>
  (job, signal) =>
    inJob(rpc, base, signal, async (o) => {
      const meeting = String(job.payload.meeting ?? "");
      const end = ms(String(job.payload.end ?? ""));
      if (!/^[0-9a-f-]{36}$/.test(meeting) || !Number.isFinite(end)) throw new JobError("meeting_after needs a meeting and an end", { retry: false });
      const info = await load(rpc, meeting);
      if (!info || info.meeting.status !== "booked" || ms(info.meeting.end_at) !== end) return;
      const now = o.now?.() ?? Date.now();
      const m = info.meeting;
      const results: Outcome[] = [];
      for (const h of info.hosts) {
        const nonce = newNonce();
        const link = (outcome: "held" | "no_show") => outcomeUrl(o.base, outcomeToken({ meeting: m.id, outcome, nonce }, o.secret));
        results.push(
          await sendOne(rpc, o, info.sending, {
            ws: m.workspace_id,
            meeting: m.id,
            kind: "after",
            to: h.email,
            dedupe: `after:${m.id}:${new Date(end).toISOString()}:${h.id}`,
            fromName: fromTeam(info),
            parts: () => afterEmail(view(info, h, now), { held: link("held"), noShow: link("no_show") }),
          }),
        );
      }
      settle(results, job, o);
    });

type LaterInfo = {
  submission: { id: string; workspace_id: string; contact_id: string | null; spam: boolean; test: boolean };
  booked: boolean;
  contact: { email: string | null; first_name: string | null; last_name: string | null; timezone: string | null } | null;
  type: TypeRow | null;
  people: Person[];
  workspace: { id: string; name: string; slug: string };
  sending: Sending;
};

export const meetingBookLater =
  (rpc: Rpc, base: MeetingOpts): Handler =>
  (job, signal) =>
    inJob(rpc, base, signal, async (o) => {
      const submission = String(job.payload.submission ?? "");
      const typeId = String(job.payload.type ?? "");
      const uuid = /^[0-9a-f-]{36}$/;
      const hostId = typeof job.payload.host === "string" && uuid.test(job.payload.host) ? job.payload.host : null;
      const ownerId = typeof job.payload.owner === "string" && uuid.test(job.payload.owner) ? job.payload.owner : null;
      // The rep Routing gave the lead: the email offers their times alone (src/lib/forms/schedule.ts claritiaPlan).
      const only = job.payload.only === true && ownerId ? ownerId : null;
      if (!uuid.test(submission) || !uuid.test(typeId)) throw new JobError("meeting_book_later needs a submission and a type", { retry: false });
      const info = await call<LaterInfo | null>(rpc, "meeting_book_later_info", { p_submission: submission, p_type: typeId });
      // The lead booked meanwhile (in the form, or from another link): nothing to do.
      if (!info || info.booked || info.submission.spam) return;
      // The mark and the timeline line (056_instant_booking.sql); it skips fills that never saw times. A new mark tells
      // the form's Slack channels, one job each (062_not_booked_note.sql).
      if (await call<boolean>(rpc, "submission_not_booked", { p_submission: submission })) {
        for (const destination of await call<string[]>(rpc, "form_not_booked_targets", { p_submission: submission }))
          await enqueueJob(rpc, { workspaceId: info.submission.workspace_id, kind: "form_not_booked", key: `not_booked:${submission}:${destination}`, payload: { submission, destination, type: typeId, host: hostId ?? ownerId } });
      }
      // One nudge (docs/scheduling-plan.md Part 13.1): a live "Didn't book" journey for this form sends the follow-up.
      if (await call<boolean>(rpc, "form_journey_follows", { p_submission: submission }).catch(() => false)) return;
      const c = info.contact;
      const t = info.type ? typeOf(info.type) : null;
      if (!c?.email || !t || !t.active) return;
      const now = o.now?.() ?? Date.now();
      let slots: { start: number; hosts: string[] }[] = [];
      let owner: string | undefined;
      let next: string | undefined;
      try {
        const got = await offer(rpc, { ws: info.submission.workspace_id, type: t, length: t.settings.lengths[0] ?? 30, now, owner: ownerId, only });
        slots = got.slots;
        owner = got.owner;
        next = got.next;
      } catch {
        slots = [];
      }
      // The same host the lead saw, when there was one.
      const who = only ?? hostId ?? owner ?? next ?? (t.hosts.length === 1 ? t.hosts[0]!.user_id : null);
      // Their rep still has no free times: nothing to offer, so no email.
      if (only && !slots.length) return;
      const person = who ? info.people.find((p) => p.id === who) : undefined;
      const times = slots.filter((s) => !who || s.hosts.includes(who)).slice(0, 5).map((s) => s.start);
      const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || null;
      const link = bookingUrl(o.base, { workspace: info.workspace.slug, type: t.slug, name, email: c.email, host: who && (only || t.hosts.length > 1) ? who : null, ref: bookRef(submission, now, o.secret) });
      settleFor(job, o, [
        await sendOne(rpc, o, info.sending, {
          ws: info.submission.workspace_id,
          submission,
          kind: "book_later",
          to: c.email,
          dedupe: `book_later:${submission}`,
          optional: true,
          fromName: person?.name ?? info.sending.from_name ?? info.workspace.name,
          replyTo: person?.email,
          parts: () => bookLaterEmail({ name, host: person?.name ?? info.workspace.name, typeName: t.name, times, tz: tzOr(c.timezone, person?.tz), link, now }),
        }),
      ]);
    });

// Reconnect -------------------------------------------------------------------------------------------------------

type ReconnectInfo = {
  account: { id: string; workspace_id: string; user_id: string; provider: string; account_email: string; status: string; reconnect_at: string | null };
  person: Person | null;
  upcoming: number;
  workspace: { id: string; name: string };
  sending: Sending;
};

const PROVIDER_NAMES: Record<string, string> = { google: "Google", microsoft: "Microsoft", zoom: "Zoom" };

/**
 * calendar_reconnect: one email to the person whose calendar sign-in stopped working (queued by calendar_reconnect in
 * 054_calendars.sql). Nothing is sent once they've reconnected; each break sends at most one email.
 */
export const calendarReconnect =
  (rpc: Rpc, base: MeetingOpts): Handler =>
  (job, signal) =>
    inJob(rpc, base, signal, async (o) => {
      const account = String(job.payload.account ?? "");
      if (!/^[0-9a-f-]{36}$/.test(account)) throw new JobError("calendar_reconnect needs an account", { retry: false });
      const info = await call<ReconnectInfo | null>(rpc, "calendar_reconnect_info", { p_account: account });
      if (!info || info.account.status !== "reconnect" || !info.person) return;
      const a = info.account;
      const provider = PROVIDER_NAMES[a.provider] ?? a.provider;
      settleFor(job, o, [
        await sendOne(rpc, o, info.sending, {
          ws: a.workspace_id,
          kind: "reconnect",
          to: info.person.email,
          dedupe: `reconnect:${a.id}:${a.reconnect_at ?? ""}`,
          fromName: "Claritia",
          parts: () => reconnectEmail({ name: info.person!.name, provider, account: a.account_email, upcoming: info.upcoming, link: `${o.base.replace(/\/$/, "")}/scheduling/availability/calendars` }),
        }),
      ]);
    });

// Not booked, in Slack ----------------------------------------------------------------------------------------------

type NoteInfo = {
  form: string;
  test: boolean;
  not_booked: boolean;
  booked: boolean;
  contact: { email: string | null; first_name: string | null; last_name: string | null } | null;
  type: string | null;
  host: string | null;
  paused: boolean;
  sealed: string | null;
};

/** form_not_booked: one message to one of the form's Slack channels about a lead who saw times and didn't book. */
export const formNotBooked =
  (rpc: Rpc, o: { fetcher?: typeof fetch } = {}): Handler =>
  async (job) => {
    const uuid = /^[0-9a-f-]{36}$/;
    const p = job.payload;
    const id = (k: string) => (typeof p[k] === "string" && uuid.test(p[k] as string) ? (p[k] as string) : null);
    if (!id("submission") || !id("destination")) throw new JobError("form_not_booked needs a submission and a destination", { retry: false });
    const n = await call<NoteInfo | null>(rpc, "form_not_booked_note", { p_submission: id("submission"), p_destination: id("destination"), p_type: id("type"), p_host: id("host") });
    // Gone, paused, or the lead booked since: nothing to say.
    if (!n || n.paused || !n.not_booked || n.booked) return;
    const c = n.contact;
    const who = (c && ([c.first_name, c.last_name].filter(Boolean).join(" ") || c.email)) || "A lead";
    const rows = [
      { label: "Email", value: c?.email ?? "" },
      { label: "Meeting", value: n.type ?? "" },
      { label: "Host", value: n.host ?? "" },
    ].filter((r) => r.value);
    const r = await slackNote(n.sealed, `${n.test ? "[Test] " : ""}${who} saw times on ${n.form} and didn't book`, rows, o.fetcher);
    if (r.status === "retry") throw new JobError(r.error, { retryAfterS: r.retryAfterS ?? 60 });
    if (r.status === "failed") throw new JobError(r.error, { retry: false });
  };
