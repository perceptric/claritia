// Getting-started emails, the sender (docs/getting-started-emails.md). claritia-intel runs it every 15 minutes
// (worker-intel/index.ts) under an advisory lock, so one worker sends at a time. Each email goes to the person who
// made the workspace (its first owner), only for workspaces made on or after TIPS_START, and only when that person
// wasn't already in an older workspace. Which one goes out when: src/lib/tips/plan.ts. The words and look:
// src/lib/tips/mail.ts. Each send is claimed in tips_log (170) first, so two workers never send the same one; a send
// that fails is given back so a later run tries again, and one with no clear answer is kept, so nobody gets it twice.
//
// Settings (all optional):
//   TIPS_START       only workspaces made on or after this time get them (default 2026-11-19)
//   TIPS_FROM        the sender (default hello@mail.tryclaritia.com, on the verified sending domain)
//   TIPS_REPLY_TO    where replies go (default hello@tryclaritia.com)
//   TIPS_SIGN_NAME   a person shown on the help email ("Ana Lima"), with TIPS_SIGN_ROLE under it
//   TIPS_OFF=1       stops them
// The turn-off link is signed with SECRETS_KEY.

import { outcomeOf } from "../email/provider.ts";
import { mime, validAddress } from "../meetings/emails.ts";
import { planById, planFor } from "../plans.ts";
import { awayMail, calendarMail, followupMail, formMail, helpMail, limitMail, responsesMail, shareMail, teamMail, welcomeMail, type Foot, type Mail, type Sign } from "./mail.ts";
import { periodOf, pickStep, sentSteps, TEMPLATE_COUNT, type TipStep } from "./plan.ts";
import { tipsToken } from "./token.ts";
import { isUuid } from "../uuid.ts";

const HOUR = 36e5;
const DAY = 864e5;
const PER_RUN = 50;

/** Anything with pg's query: a Pool, a PoolClient, or a fake in tests. */
export type Db = { query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> };
type Outgoing = { from: string; to: string; raw: string; tags: Record<string, string> };
export type TipsMailer = { send(m: Outgoing): Promise<string> };
export type TipsOpts = {
  mailer: TipsMailer | null;
  /** The app's address for links (linkBase()). */
  base: string;
  secret?: string;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  /** Waits between tries; tests skip the wait. */
  wait?: (ms: number) => Promise<void>;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
};

export type TipsConfig = { off: boolean; start: string; from: string; replyTo: string | null; sign: Sign | null };

export function tipsConfig(env: NodeJS.ProcessEnv = process.env): TipsConfig {
  const start = env.TIPS_START?.trim();
  const from = env.TIPS_FROM?.trim().toLowerCase();
  const reply = env.TIPS_REPLY_TO?.trim().toLowerCase();
  const name = env.TIPS_SIGN_NAME?.trim();
  return {
    off: env.TIPS_OFF?.trim() === "1",
    start: start && Number.isFinite(Date.parse(start)) ? new Date(start).toISOString() : "2026-11-19T00:00:00.000Z",
    from: from && validAddress(from) ? from : "hello@mail.tryclaritia.com",
    replyTo: reply && validAddress(reply) ? reply : "hello@tryclaritia.com",
    sign: name ? { name, role: env.TIPS_SIGN_ROLE?.trim() || "Claritia" } : null,
  };
}

// ─────────────── who gets them ───────────────

/**
 * Workspaces whose maker gets getting-started emails: made on or after $1 (and $2 alone when it's given), the first
 * owner with tips on, who wasn't in an older workspace. `quiet` leaves out people emailed in the last 20 hours.
 */
const whoSql = (quiet: boolean) => `
select w.id::text as id, w.name, w.created_at, m.user_id::text as user_id, lower(u.email) as email,
  coalesce(nullif(btrim(u.raw_user_meta_data->>'full_name'), ''), nullif(btrim(u.raw_user_meta_data->>'name'), '')) as person
from public.workspaces w
join lateral (
  select o.user_id, o.created_at, o.tips from public.workspace_members o
  where o.workspace_id = w.id and o.role = 'owner' order by o.created_at, o.user_id limit 1
) m on true
join auth.users u on u.id = m.user_id
where w.created_at >= $1::timestamptz
  and ($2::uuid is null or w.id = $2::uuid)
  and m.tips
  and not exists (select 1 from public.workspace_members x where x.user_id = m.user_id and x.created_at < m.created_at)
  ${quiet ? "and not exists (select 1 from public.tips_log l where l.workspace_id = w.id and l.user_id = m.user_id and l.sent_at > now() - interval '20 hours')" : ""}
order by w.created_at
limit 5000`;

/**
 * Whether the getting-started emails cover this workspace's welcome, so the guided setup's own welcome email
 * (welcome_email, 169) stays quiet and nobody gets two. False when they're off, before 170 has run, or on any error.
 */
export async function tipsCover(db: Db, ws: string, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const cfg = tipsConfig(env);
  if (cfg.off || !isUuid(ws)) return false;
  try {
    const { rows } = await db.query(whoSql(false), [cfg.start, ws]);
    return rows.length > 0;
  } catch {
    return false;
  }
}

// ─────────────── one workspace ───────────────

type Who = { id: string; name: string; created_at: Date | string; user_id: string; email: string; person: string | null };

const STATE_SQL = `
select
  exists (select 1 from public.audit_log a where a.workspace_id = w.id and a.action = 'setup.done') as setup_done,
  public.workspace_plan(w.id) as plan,
  w.booking_slug,
  (select count(*) from public.forms f where f.workspace_id = w.id)::int as forms,
  (select count(*) from public.forms f where f.workspace_id = w.id and f.status = 'live')::int as live,
  (select count(*) from public.submissions s where s.workspace_id = w.id and not s.spam and not s.test)::int as responses,
  (select count(*) from public.meetings t where t.workspace_id = w.id and t.status in ('booked', 'held', 'no_show'))::int as meetings,
  (select count(*) from public.calendar_accounts c where c.workspace_id = w.id)::int as calendars,
  ((select count(*) from public.workflows f where f.workspace_id = w.id and f.status = 'live' and f.meeting_kind is null)
    + (select count(*) from public.emails e where e.workspace_id = w.id and e.kind = 'broadcast' and e.status in ('scheduled', 'sending', 'sent')))::int as followups,
  (select count(*) from public.workspace_members x where x.workspace_id = w.id)::int as members,
  (select count(*) from public.invites i where i.workspace_id = w.id and i.accepted_at is null and (i.expires_at is null or i.expires_at > now()))::int as invites,
  coalesce((select p.submissions from public.plan_usage p where p.workspace_id = w.id and p.month = public.plan_month()), 0)::int as month_responses,
  public.last_seen($2::uuid) as last_seen,
  coalesce((select s.timezone from public.send_settings s where s.workspace_id = w.id and s.timezone is not null),
           (select a.tz from public.availability_schedules a where a.workspace_id = w.id and a.user_id = $2::uuid order by a.created_at limit 1),
           'UTC') as tz
from public.workspaces w where w.id = $1::uuid`;

const SINCE_SQL = `
select
  (select count(*) from public.submissions s where s.workspace_id = $1::uuid and not s.spam and not s.test and s.created_at > $2::timestamptz)::int as responses,
  (select count(*) from public.meetings t where t.workspace_id = $1::uuid and t.status in ('booked', 'held', 'no_show') and t.created_at > $2::timestamptz)::int as meetings,
  (select count(*) from public.meetings t where t.workspace_id = $1::uuid and t.status = 'booked' and t.start_at > now())::int as upcoming`;

const LATEST_SQL = `
select coalesce(f.name, 'A form') as form, s.created_at from public.submissions s left join public.forms f on f.id = s.form_id
where s.workspace_id = $1::uuid and not s.spam and not s.test and ($2::timestamptz is null or s.created_at > $2::timestamptz)
order by s.created_at desc limit 3`;

type State = {
  setup_done: boolean;
  plan: string | null;
  booking_slug: string | null;
  forms: number;
  live: number;
  responses: number;
  meetings: number;
  calendars: number;
  followups: number;
  members: number;
  invites: number;
  month_responses: number;
  last_seen: Date | string | null;
  tz: string;
};

const zone = (tz: string | null | undefined) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz || "UTC" });
    return tz || "UTC";
  } catch {
    return "UTC";
  }
};
const fmt = (d: Date, tz: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: tz, ...o }).format(d);
const hourIn = (d: Date, tz: string) => Number(fmt(d, tz, { hour: "numeric", hourCycle: "h23" })) % 24;
/** "Tue 3:12 PM" in the workspace's zone. */
const when = (at: Date | string, tz: string) => fmt(new Date(at), tz, { weekday: "short", hour: "numeric", minute: "2-digit" }).replace(",", "");

/** Tomorrow, or Monday when tomorrow is a weekend day: "Tuesday, Nov 24". */
function nextWorkday(now: Date, tz: string): string {
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getTime() + i * DAY);
    const wd = fmt(d, tz, { weekday: "short" });
    if (wd !== "Sat" && wd !== "Sun") return fmt(d, tz, { weekday: "long", month: "short", day: "numeric" });
  }
  return fmt(new Date(now.getTime() + DAY), tz, { weekday: "long", month: "short", day: "numeric" });
}

/** The 1st of next month, as the plan counts reset: "Dec 1". */
const nextMonth = (now: Date) => fmt(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 12)), "UTC", { month: "short", day: "numeric" });

/** What one step's email needs from the database, or null when there's nothing worth sending. */
async function builder(db: Db, step: TipStep, who: Who, s: State, base: string, cfg: TipsConfig, now: Date, tz: string): Promise<((f: Foot) => Mail) | null> {
  const app = base.replace(/\/+$/, "");
  const latestForm = async () => {
    const { rows } = await db.query(`select id::text as id, name, slug, status from public.forms where workspace_id = $1::uuid order by (status = 'live') desc, updated_at desc limit 1`, [who.id]);
    return (rows[0] as { id: string; name: string; slug: string | null; status: string } | undefined) ?? null;
  };
  const latest = async (since: Date | null) => ((await db.query(LATEST_SQL, [who.id, since?.toISOString() ?? null])).rows as { form: string; created_at: string }[]).map((r) => ({ form: r.form, when: when(r.created_at, tz) }));
  switch (step) {
    case "welcome": {
      const steps = [
        { title: "Set up your workspace", done: true },
        { title: "Build your first form", line: "Describe it in a sentence or pick a template", done: s.forms > 0, url: `${app}/forms/new` },
        { title: "Share it or add it to your site", line: "Send the link or paste it on a page", done: s.live > 0, url: `${app}/forms` },
        { title: "Connect your calendar", line: "So people only book times you're free", done: s.calendars > 0, url: `${app}/scheduling/availability/calendars` },
        { title: "Turn on a follow-up email", line: "A workflow writes to every new lead", done: s.followups > 0, url: `${app}/emails/automations` },
        { title: "Invite your team", line: "Teammates who build forms are free", done: s.members > 1 || s.invites > 0, url: `${app}/settings/team` },
      ];
      const next = steps.find((x) => !x.done && x.url)?.url ?? `${app}/forms`;
      return (f) => welcomeMail({ name: who.person, workspace: who.name, steps: steps.map(({ title, line, done }) => ({ title, line, done })), url: next }, f);
    }
    case "form":
      return (f) => formMail({ templates: TEMPLATE_COUNT, url: `${app}/forms/new`, templatesUrl: `${app}/forms/templates` }, f);
    case "share": {
      const form = await latestForm();
      if (!form || !isUuid(form.id)) return null;
      const link = form.slug && s.booking_slug ? `${app}/f/${encodeURIComponent(s.booking_slug)}/${encodeURIComponent(form.slug)}` : `${app}/f/${form.id}`;
      return (f) => shareMail({ form: form.name || "Your form", live: form.status === "live", link, url: `${app}/forms/${form.id}` }, f);
    }
    case "responses": {
      const [rows, form] = await Promise.all([latest(null), latestForm()]);
      const url = form && isUuid(form.id) ? `${app}/forms/${form.id}` : `${app}/forms`;
      return (f) => responsesMail({ responses: s.responses, meetings: s.meetings, live: s.live, latest: rows, url }, f);
    }
    case "calendar":
      return (f) => calendarMail({ day: nextWorkday(now, tz), url: `${app}/scheduling/availability/calendars` }, f);
    case "followup": {
      // The workflows every workspace starts with as drafts (workflow_defaults, 119), ready to turn on.
      const { rows } = await db.query(`select name from public.workflows where workspace_id = $1::uuid and status = 'draft' and meeting_kind is null and journey is not null order by created_at limit 3`, [who.id]);
      const ready = (rows as { name: string }[]).map((r) => r.name).filter(Boolean);
      return (f) => followupMail({ ready, url: `${app}/emails/automations` }, f);
    }
    case "team": {
      const perks = [
        { main: "Build and edit forms together", plan: "Free" },
        { main: "Group meetings and polls", plan: planFor("group").name },
        { main: "Round robin across the team", plan: planFor("round_robin").name },
      ];
      return (f) => teamMail({ you: who.person || who.email, workspace: who.name, perks, url: `${app}/settings/team` }, f);
    }
    case "limit": {
      const cols = [planById("free"), planById("starter"), planById("pro")];
      const amount = (v: number | null) => (v === null ? "Unlimited" : v.toLocaleString("en-US"));
      const cap = planById(s.plan).submissions;
      if (cap === null) return null;
      const pick = cols[1]!;
      return (f) =>
        limitMail(
          {
            used: s.month_responses,
            cap,
            resets: nextMonth(now),
            cols: cols.map((p) => p.name),
            rows: [
              { label: "Responses a month", values: cols.map((p) => amount(p.submissions)) },
              { label: "Meeting types", values: cols.map((p) => amount(p.meetingTypes)) },
              { label: "Calendars per seat", values: cols.map((p) => amount(p.calendars)) },
              { label: "Price per seat", values: cols.map((p) => `$${p.monthly}`) },
            ],
            pick: 1,
            price: pick.monthly,
            yearlyOff: Math.round((1 - pick.yearly / pick.monthly) * 100),
            url: `${app}/settings/billing`,
          },
          f,
        );
    }
    case "help":
      return (f) => helpMail({ url: `${app}/forms`, sign: cfg.sign }, f);
    case "away": {
      if (!s.last_seen) return null;
      const seen = new Date(s.last_seen);
      const [{ rows }, rows3] = await Promise.all([db.query(SINCE_SQL, [who.id, seen.toISOString()]), latest(seen)]);
      const c = rows[0] as { responses: number; meetings: number; upcoming: number } | undefined;
      if (!c || c.responses + c.meetings === 0) return null;
      return (f) => awayMail({ responses: c.responses, meetings: c.meetings, upcoming: c.upcoming, since: fmt(seen, tz, { month: "short", day: "numeric" }), latest: rows3, url: c.responses ? `${app}/forms` : `${app}/scheduling/upcoming` }, f);
    }
  }
}

export type TipResult = "sent" | "skipped" | "failed" | "unknown";

/** The next getting-started email for one workspace, if one is due: claimed, built and sent. */
export async function tipOne(db: Db, who: Who, o: TipsOpts & { cfg: TipsConfig }): Promise<TipResult> {
  const now = o.now?.() ?? new Date();
  if (!isUuid(who.id) || !isUuid(who.user_id) || !validAddress(who.email)) return "skipped";
  const [{ rows: log }, { rows: st }] = await Promise.all([
    db.query(`select step, period, sent_at from public.tips_log where workspace_id = $1::uuid and user_id = $2::uuid`, [who.id, who.user_id]),
    db.query(STATE_SQL, [who.id, who.user_id]),
  ]);
  const s = st[0] as State | undefined;
  if (!s) return "skipped";
  const logged = log as { step: string; period: string; sent_at: string }[];
  const tz = zone(s.tz);
  const seen = s.last_seen ? new Date(s.last_seen).getTime() : null;
  const idleDays = seen ? (now.getTime() - seen) / DAY : null;
  const ageHours = (now.getTime() - new Date(who.created_at).getTime()) / HOUR;
  const paid = planById(s.plan).id !== "free";
  // What came in since they were last here: only looked up when the away email could be due.
  let newSinceSeen = 0;
  if (!paid && ageHours >= 21 * 24 && idleDays !== null && idleDays >= 14 && seen) {
    const { rows } = await db.query(SINCE_SQL, [who.id, new Date(seen).toISOString()]);
    const c = rows[0] as { responses: number; meetings: number } | undefined;
    newSinceSeen = (c?.responses ?? 0) + (c?.meetings ?? 0);
  }
  const step = pickStep({
    ageHours,
    setupDone: !!s.setup_done,
    paid,
    forms: s.forms,
    responses: s.responses,
    calendars: s.calendars,
    followups: s.followups,
    members: s.members,
    invites: s.invites,
    monthResponses: s.month_responses,
    cap: planById(s.plan).submissions,
    idleDays,
    newSinceSeen,
    localHour: hourIn(now, tz),
    sent: sentSteps(logged, now),
    sentRecently: logged.some((r) => now.getTime() - new Date(r.sent_at).getTime() < 20 * HOUR),
  });
  if (!step) return "skipped";
  const build = await builder(db, step, who, s, o.base, o.cfg, now, tz);
  if (!build) return "skipped";

  const app = o.base.replace(/\/+$/, "");
  const token = tipsToken(who.id, who.user_id, o.secret ?? o.env?.SECRETS_KEY ?? process.env.SECRETS_KEY);
  const unsubscribe = `${app}/api/email/tips?t=${encodeURIComponent(token)}`;
  const m = build({ unsubscribe, settings: `${app}/settings/profile` });
  const raw = mime({
    from: { name: "Claritia", email: o.cfg.from },
    to: who.email,
    replyTo: o.cfg.replyTo,
    subject: m.subject,
    html: m.html,
    text: m.text,
    extra: [
      { name: "List-Unsubscribe", value: `<${unsubscribe}>` },
      { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
    ],
  });

  // Claimed before sending, so a second worker or a slow run can't send it too.
  const period = periodOf(step, now);
  const claim = await db.query(`insert into public.tips_log (workspace_id, user_id, step, period) values ($1::uuid, $2::uuid, $3, $4) on conflict do nothing returning step`, [who.id, who.user_id, step, period]);
  if (!claim.rows.length) return "skipped";
  const giveBack = () => db.query(`delete from public.tips_log where workspace_id = $1::uuid and user_id = $2::uuid and step = $3 and period = $4`, [who.id, who.user_id, step, period]).catch(() => undefined);
  const wait = o.wait ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt++) {
    try {
      await o.mailer!.send({ from: o.cfg.from, to: who.email, raw, tags: { tips: step } });
      return "sent";
    } catch (e) {
      const out = outcomeOf(e);
      // It may have gone: keep the claim, so nobody gets it twice.
      if (out === "unknown") return "unknown";
      // A hiccup (busy, rate limit, a dropped connection) is tried again with growing waits.
      if ((out === "later" || out === "retry") && attempt < 2) {
        await wait(2000 * 2 ** attempt);
        continue;
      }
      o.log?.("tips send failed", { workspace: who.id, step, error: e instanceof Error ? e.message : String(e) });
      await giveBack();
      return "failed";
    }
  }
}

/** Send the getting-started emails that are due, at most 50 a run. Never throws. */
export async function sendTips(db: Db, o: TipsOpts): Promise<{ sent: number; failed: number }> {
  const cfg = tipsConfig(o.env);
  const out = { sent: 0, failed: 0 };
  if (cfg.off || !o.mailer) return out;
  let list: Who[];
  try {
    list = (await db.query(whoSql(true), [cfg.start, null])).rows as Who[];
  } catch (e) {
    // Before 170_getting_started.sql has run, the table and column aren't there yet.
    o.log?.("tips skipped", { error: e instanceof Error ? e.message : String(e) });
    return out;
  }
  for (const who of list) {
    if (out.sent >= PER_RUN) break;
    try {
      const r = await tipOne(db, who, { ...o, cfg });
      if (r === "sent" || r === "unknown") out.sent++;
      else if (r === "failed") out.failed++;
    } catch (e) {
      out.failed++;
      o.log?.("tips failed", { workspace: who.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

type Pool = { connect(): Promise<Db & { release(): void }> };

/** sendTips on one worker at a time: the others find the lock taken and skip this run. */
export async function runTips(pool: Pool, o: TipsOpts): Promise<{ sent: number; failed: number } | null> {
  const c = await pool.connect();
  try {
    const { rows } = await c.query(`select pg_try_advisory_lock(hashtext('claritia:tips')) as ok`);
    if (!rows[0]?.ok) return null;
    try {
      return await sendTips(c, o);
    } finally {
      await c.query(`select pg_advisory_unlock(hashtext('claritia:tips'))`).catch(() => undefined);
    }
  } finally {
    c.release();
  }
}

