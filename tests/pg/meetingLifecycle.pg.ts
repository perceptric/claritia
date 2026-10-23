// Meeting emails and timed steps on a real database (docs/meetings-scheduler.md 1.7, 2.4 and Part 3): reminders follow
// a moved meeting and stop for a canceled one, a notify delivered twice sends one email, flaky provider answers never
// double-send, the 24-hour auto-held never touches a marked meeting, outcome links work once and only for their
// meeting, the no-show follow-up goes once, and book-later stays quiet when the lead booked meanwhile.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import pg from "pg";
import { SesError } from "../../src/lib/email/ses.ts";
import type { Job } from "../../src/lib/jobs.ts";
import { meetingUid } from "../../src/lib/meetings/ics.ts";
import { keepManageToken, manageToken, readOutcomeToken } from "../../src/lib/meetings/links.ts";
import { newToken, tokenHash } from "../../src/lib/meetings/server.ts";
import { DEFAULT_AVAILABILITY, DEFAULT_SETTINGS } from "../../src/lib/meetings/types.ts";
import { calendarReconnect, meetingAfter, meetingBookLater, meetingNotify, meetingRemind, type Mail, type Mailer, type MeetingOpts } from "../../worker-intel/jobs/meetings.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 6 });
const rpc = pgRpc(pool);
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
const one = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await q(sql, p))[0] as T;
after(() => pool.end());

const SECRET = "m".repeat(40);
const H = 3_600_000;
const D = 24 * H;

// The fake provider: answers in order from `script` (then "ok"), and keeps every email it took.
let sent: Mail[] = [];
let script: ("ok" | "throttle" | "timeout" | "reject")[] = [];
const mailer: Mailer = {
  async send(m) {
    const next = script.shift() ?? "ok";
    if (next === "throttle") throw new SesError("SES 429", { status: 429, retry: true });
    if (next === "timeout") throw new SesError("SES didn't answer", { unknown: true });
    if (next === "reject") throw new SesError("SES 400 MessageRejected", { status: 400 });
    sent.push(m);
    return `ses-${randomUUID()}`;
  },
};
const opts: MeetingOpts = { mailer, base: "https://app.test", secret: SECRET, from: "meetings@tryclaritia.com" };
const job = (kind: string, payload: Record<string, unknown>): Job => ({ id: randomUUID(), workspace_id: ws, kind, key: "", payload, attempts: 1, max_attempts: 5 });
const signal = new AbortController().signal;
const notify = (meeting: string, event: string) => meetingNotify(rpc, opts)(job("meeting_notify", { meeting, event }), signal);

/** A raw message's parts, decoded: text, html, calendar. */
function parts(raw: string) {
  const out: Record<string, string> = {};
  for (const chunk of raw.split(/\r\n--[A-Za-z0-9_]+(?:--)?\r\n/)) {
    const [head, ...rest] = chunk.split("\r\n\r\n");
    const type = /Content-Type: ([a-z]+\/[a-z]+)/i.exec(head ?? "")?.[1]?.toLowerCase();
    if (!type || type.startsWith("multipart/") || !/base64/i.test(head ?? "")) continue;
    const key = type === "application/ics" ? "attachment" : type;
    out[key] = Buffer.from(rest.join("\r\n\r\n").replace(/\s+/g, ""), "base64").toString("utf8");
  }
  return out;
}
const to = (addr: string) => sent.filter((m) => m.to === addr);
const subjectOf = (m: Mail) => {
  const head = m.raw.split("\r\n\r\n")[0]!;
  const enc = [...head.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)];
  return enc.length ? enc.map((x) => Buffer.from(x[1]!, "base64").toString("utf8")).join("") : /^Subject: (.*)$/m.exec(head)![1]!;
};
const icsLine = (ics: string, name: string) => ics.replace(/\r\n /g, "").split("\r\n").find((l) => l.startsWith(`${name}:`));

let ws = "";
let host = "";
let host2 = "";
let typeId = "";
const HOST_EMAIL = () => `${host}@acme.test`.toLowerCase();

before(async () => {
  process.env.SECRETS_KEY = SECRET;
  ws = randomUUID();
  host = randomUUID();
  host2 = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, 'Acme')`, [ws]);
  for (const [u, name] of [[host, "Sam Lee"], [host2, "Alex Kim"]] as const) {
    await q(`insert into auth.users (id, email) values ($1, $2)`, [u, `${u}@acme.test`]);
    await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')`, [ws, u]);
    await q(`insert into booking_profiles (workspace_id, user_id, slug, name) values ($1, $2, $3, $4)`, [ws, u, name.toLowerCase().replace(" ", "-"), name]);
    const acc = (await q(`insert into calendar_accounts (workspace_id, user_id, provider, account_email) values ($1, $2, 'fake', $3) returning id`, [ws, u, `${u}@acme.test`]))[0].id;
    await q(`insert into calendar_lists (account_id, calendar_id, name, busy, write) values ($1, 'primary', 'Work', true, true)`, [acc]);
    const a = DEFAULT_AVAILABILITY("UTC");
    a.weekly = { mon: [["00:00", "23:59"]], tue: [["00:00", "23:59"]], wed: [["00:00", "23:59"]], thu: [["00:00", "23:59"]], fri: [["00:00", "23:59"]], sat: [["00:00", "23:59"]], sun: [["00:00", "23:59"]] };
    await q(`insert into availability (workspace_id, user_id, tz, weekly, overrides) values ($1, $2, $3, $4, '[]')`, [ws, u, a.tz, a.weekly]);
  }
  const settings = { ...DEFAULT_SETTINGS, notice: 0, window: 7, reminders: [1440, 60], questions: [{ id: "size", label: "Team size", type: "text", required: false }] };
  typeId = (await one<{ id: string }>(`insert into meeting_types (workspace_id, slug, name, kind, hosts, settings) values ($1, 'demo', 'Demo', 'one', $2, $3) returning id`, [ws, JSON.stringify([{ user_id: host }]), settings])).id;
});

beforeEach(() => {
  sent = [];
  script = [];
});

/** A meeting written straight to the table, with its first event and a manage token (kept sealed unless told not to). */
async function meeting(o: { start: number; length?: number; guest?: string; hosts?: string[]; status?: string; keep?: boolean; submission?: string; contact?: string; tz?: string }) {
  const token = newToken();
  const start = new Date(o.start).toISOString();
  const end = new Date(o.start + (o.length ?? 30) * 60_000).toISOString();
  const id = (
    await one<{ id: string }>(
      `insert into meetings (workspace_id, type_id, hosts, guest_email, guest_name, guest_tz, answers, start_at, end_at, block_start, block_end, status, source, token_hash, location, submission_id, contact_id)
       values ($1, $2, $3, $4, 'Dana Lee', $5, '{"size":"12"}', $6, $7, $6, $7, $8, 'page', $9, '{"kind":"google_meet","url":"https://meet.google.com/abc-defg-hij"}', $10, $11) returning id`,
      [ws, typeId, o.hosts ?? [host], o.guest ?? `${randomUUID().slice(0, 8)}@lead.test`, o.tz ?? "America/New_York", start, end, o.status ?? "booked", tokenHash(token), o.submission ?? null, o.contact ?? null],
    )
  ).id;
  await q(`insert into meeting_events (meeting_id, kind) values ($1, 'booked')`, [id]);
  if (o.keep !== false) await keepManageToken(rpc, id, token, SECRET);
  const guest = (await one<{ guest_email: string }>(`select guest_email from meetings where id = $1`, [id])).guest_email;
  return { id, token, guest };
}

const queued = (id: string, kind: string) => q(`select key, payload, run_after from jobs where kind = $1 and status = 'queued' and payload->>'meeting' = $2 order by run_after`, [kind, id]);

test("booked: the guest gets the confirmation with the invite and a working manage link; hosts get a note; reminders are queued", async () => {
  const start = Date.now() + 3 * D;
  const m = await meeting({ start });
  await notify(m.id, "booked");
  const [c] = to(m.guest);
  assert.ok(c, "the guest got the confirmation");
  assert.match(subjectOf(c), /^Confirmed: Demo with Sam Lee on /);
  const p = parts(c.raw);
  assert.ok(p["text/plain"]!.includes(`https://app.test/book/m/${m.token}`), "the manage link is the guest's own token");
  assert.ok(p["text/plain"]!.includes("Team size: 12") && p["text/plain"]!.includes("https://meet.google.com/abc-defg-hij"));
  assert.equal(icsLine(p["text/calendar"]!, "UID"), `UID:${meetingUid(m.id)}`);
  assert.equal(icsLine(p["text/calendar"]!, "SEQUENCE"), "SEQUENCE:0");
  assert.equal(p["attachment"], p["text/calendar"]);
  assert.match(c.raw, /^Reply-To: .*@acme\.test$/m);
  assert.equal(to(HOST_EMAIL()).length, 1, "the host got a note");
  const rem = await queued(m.id, "meeting_remind");
  assert.deepEqual(rem.map((r) => r.payload.minutes), [1440, 60]);
  assert.ok(Math.abs(new Date(rem[0].run_after).getTime() - (start - D)) < 5_000);
  assert.equal((await queued(m.id, "meeting_after")).length, 1);
});

test("a notify delivered twice, or run again after a crash, sends each email once", async () => {
  const m = await meeting({ start: Date.now() + 2 * D });
  await notify(m.id, "booked");
  await notify(m.id, "booked");
  await Promise.all([notify(m.id, "booked"), notify(m.id, "booked")]);
  assert.equal(to(m.guest).length, 1);
  assert.equal(to(HOST_EMAIL()).length, 1);
  assert.equal((await one<{ n: number }>(`select count(*)::int n from meeting_mails where meeting_id = $1`, [m.id])).n, 2);
});

test("a provider timeout is never resent; a 'not now' is retried by the job and sends once", async () => {
  const m = await meeting({ start: Date.now() + 2 * D });
  script = ["timeout", "throttle"];
  await assert.rejects(notify(m.id, "booked"), /not now/);
  assert.equal(sent.length, 0);
  const rows = await q(`select kind, status from meeting_mails where meeting_id = $1 order by kind`, [m.id]);
  assert.deepEqual(rows.map((r) => `${r.kind}:${r.status}`), ["confirm:unknown", "host_booked:retry"]);
  await notify(m.id, "booked");
  assert.equal(to(m.guest).length, 0, "the email that may have gone out isn't sent again");
  assert.equal(to(HOST_EMAIL()).length, 1, "the throttled one goes on the retry");
  await notify(m.id, "booked");
  assert.equal(sent.length, 1);
});

test("a reminder for a meeting moved after it was scheduled sends at the new time only", async () => {
  const start = Date.now() + 3 * D;
  const m = await meeting({ start });
  await notify(m.id, "booked");
  const old = await queued(m.id, "meeting_remind");
  assert.equal(old.length, 2);
  const moved = start + D;
  await q(`select meeting_move($1, $2, $3, $4, $3, $4)`, [m.id, [host], new Date(moved).toISOString(), new Date(moved + 1_800_000).toISOString()]);
  sent = [];
  await notify(m.id, "moved");
  const [u] = to(m.guest);
  assert.match(subjectOf(u!), /^Updated: Demo with Sam Lee is now /);
  const cal = parts(u!.raw)["text/calendar"]!;
  assert.equal(icsLine(cal, "UID"), `UID:${meetingUid(m.id)}`, "the same calendar entry");
  assert.equal(icsLine(cal, "SEQUENCE"), "SEQUENCE:1", "a newer version");
  assert.ok(parts(u!.raw)["text/plain"]!.includes(`https://app.test/book/m/${m.token}`), "the manage link stays the same");
  const now = await queued(m.id, "meeting_remind");
  assert.deepEqual(now.map((r) => new Date(r.payload.start).getTime()), [moved, moved], "only reminders for the new time wait");
  assert.equal((await one<{ n: number }>(`select count(*)::int n from jobs where kind = 'meeting_remind' and payload->>'meeting' = $1 and error = 'The meeting changed'`, [m.id])).n, 2);
  // The old reminders, had they slipped through and run at their time: nothing.
  sent = [];
  const remind = meetingRemind(rpc, { ...opts, now: () => start - D });
  for (const r of old) await remind(job("meeting_remind", r.payload), signal);
  assert.equal(sent.length, 0);
  // The new one at its time: one reminder, for the new start.
  await meetingRemind(rpc, { ...opts, now: () => moved - D })(job("meeting_remind", now[0].payload), signal);
  await meetingRemind(rpc, { ...opts, now: () => moved - D })(job("meeting_remind", now[0].payload), signal);
  assert.equal(sent.length, 1);
  assert.match(subjectOf(sent[0]!), /^Reminder: Demo with Sam Lee tomorrow$/);
  assert.equal((await one<{ n: number }>(`select count(*)::int n from meeting_events where meeting_id = $1 and kind = 'reminder_sent'`, [m.id])).n, 1);
});

test("a canceled meeting sends no reminders, and both sides get the cancel", async () => {
  const start = Date.now() + 3 * D;
  const m = await meeting({ start });
  await notify(m.id, "booked");
  const rem = await queued(m.id, "meeting_remind");
  await q(`select meeting_status($1, 'canceled', 'Out sick', null)`, [m.id]);
  sent = [];
  await notify(m.id, "canceled");
  await notify(m.id, "canceled");
  const [c] = to(m.guest);
  assert.equal(to(m.guest).length, 1);
  const cal = parts(c!.raw)["text/calendar"]!;
  assert.equal(icsLine(cal, "METHOD"), "METHOD:CANCEL");
  assert.equal(icsLine(cal, "UID"), `UID:${meetingUid(m.id)}`);
  assert.equal(icsLine(cal, "SEQUENCE"), "SEQUENCE:1");
  assert.ok(parts(c!.raw)["text/plain"]!.includes("Reason: Out sick"));
  assert.equal(to(HOST_EMAIL()).length, 1);
  assert.equal((await queued(m.id, "meeting_remind")).length, 0);
  assert.equal((await queued(m.id, "meeting_after")).length, 0);
  sent = [];
  for (const r of rem) await meetingRemind(rpc, { ...opts, now: () => new Date(r.run_after).getTime() })(job("meeting_remind", r.payload), signal);
  await meetingAfter(rpc, { ...opts, now: () => start + H })(job("meeting_after", { meeting: m.id, end: new Date(start + 1_800_000).toISOString() }), signal);
  // A late "booked" notify (the calendar retry finished after the cancel) sends no confirmation either.
  await notify(m.id, "booked");
  assert.equal(sent.length, 0);
});

test("with no kept copy of the guest's token, emails go without a manage link and the guest's link keeps working", async () => {
  const m = await meeting({ start: Date.now() + 2 * D, keep: false });
  await notify(m.id, "booked");
  const text = parts(to(m.guest)[0]!.raw)["text/plain"]!;
  assert.ok(!text.includes("/book/m/"), "no link rather than a wrong one");
  assert.ok(text.includes("Demo") && text.includes("https://meet.google.com/abc-defg-hij"));
  const row = await one<{ token_hash: string; token_sealed: string | null }>(`select token_hash, token_sealed from meetings where id = $1`, [m.id]);
  assert.equal(row.token_hash, tokenHash(m.token), "the token the guest already has is untouched");
  // A copy kept with the wrong token is refused, so it can't point emails at someone else's meeting.
  await keepManageToken(rpc, m.id, newToken(), SECRET);
  assert.equal((await one<{ token_sealed: string | null }>(`select token_sealed from meetings where id = $1`, [m.id])).token_sealed, null);
  // A host's explicit "send the link again" makes one new token, even when asked twice at once.
  const [a, b] = await Promise.all([manageToken(rpc, { id: m.id, ...row }, SECRET), manageToken(rpc, { id: m.id, ...row }, SECRET)]);
  assert.equal(a, b);
  const now = await one<{ token_hash: string; token_sealed: string | null }>(`select token_hash, token_sealed from meetings where id = $1`, [m.id]);
  assert.equal(now.token_hash, tokenHash(a));
  assert.ok(now.token_sealed && !now.token_sealed.includes(a), "only a sealed copy is stored");
  sent = [];
  await meetingRemind(rpc, { ...opts, now: () => Date.now() })(job("meeting_remind", { meeting: m.id, start: (await one<{ s: Date }>(`select start_at s from meetings where id = $1`, [m.id])).s.toISOString(), minutes: 1440 }), signal);
  assert.ok(parts(sent[0]!.raw)["text/plain"]!.includes(`https://app.test/book/m/${a}`), "later emails carry the kept link");
});

test("the 24-hour auto-held turns only unmarked meetings held, and never one already marked or being marked", async () => {
  const past = Date.now() - 3 * D;
  const unmarked = await meeting({ start: past });
  const noShow = await meeting({ start: past + H });
  await q(`select meeting_status($1, 'no_show', null, $2)`, [noShow.id, host]);
  const held = await meeting({ start: past + 2 * H });
  await q(`select meeting_status($1, 'held', null, $2)`, [held.id, host]);
  const recent = await meeting({ start: Date.now() - 2 * H });
  const busy = await meeting({ start: past + 3 * H });
  // A host is marking this one right now: the sweep must not wait for it or overwrite it.
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(`select 1 from meetings where id = $1 for update`, [busy.id]);
    await q(`select meetings_auto_held(5000)`);
    await c.query(`select meeting_status($1, 'no_show', null, $2)`, [busy.id, host]);
    await c.query("commit");
  } finally {
    c.release();
  }
  await q(`select meetings_tick()`);
  const status = async (id: string) => (await one<{ status: string }>(`select status from meetings where id = $1`, [id])).status;
  assert.equal(await status(unmarked.id), "held");
  assert.equal(await status(noShow.id), "no_show");
  assert.equal(await status(held.id), "held");
  assert.equal(await status(recent.id), "booked");
  assert.equal(await status(busy.id), "no_show");
  const events = async (id: string) => (await q(`select kind, detail from meeting_events where meeting_id = $1 and kind in ('held', 'no_show') order by id`, [id])).map((e) => `${e.kind}:${e.detail.reason ?? ""}`);
  assert.deepEqual(await events(unmarked.id), ["held:auto"]);
  assert.deepEqual(await events(noShow.id), ["no_show:"]);
  assert.deepEqual(await events(held.id), ["held:"], "a host's mark is never written over");
  assert.deepEqual(await events(busy.id), ["no_show:"]);
});

test("the after-meeting links work once, only for their meeting, and never over a status someone set", async () => {
  const end = Date.now() - H;
  const a = await meeting({ start: end - 1_800_000, hosts: [host, host2] });
  const b = await meeting({ start: end - 1_800_000 - D });
  const runAfter = (id: string, e: number) => meetingAfter(rpc, opts)(job("meeting_after", { meeting: id, end: new Date(e).toISOString() }), signal);
  await runAfter(a.id, end);
  await runAfter(a.id, end);
  assert.equal(sent.length, 2, "one email per host, once");
  const links = (m: Mail) => [...parts(m.raw)["text/plain"]!.matchAll(/https:\/\/app\.test\/api\/meetings\/outcome\/([A-Za-z0-9_.-]+)/g)].map((x) => readOutcomeToken(x[1]!, SECRET)!);
  const [held1, noShow1] = links(to(HOST_EMAIL())[0]!);
  const [held2] = links(to(`${host2}@acme.test`)[0]!);
  assert.equal(held1!.meeting, a.id);
  assert.equal(noShow1!.outcome, "no_show");
  assert.equal(held1!.nonce, noShow1!.nonce, "one email's links share a nonce");
  const use = async (t: { meeting: string; outcome: string; nonce: string }) => (await rpc("meeting_outcome", { p_meeting: t.meeting, p_status: t.outcome, p_nonce: t.nonce })).data as { result: string; status: string };
  assert.deepEqual(await use(noShow1!), { result: "ok", status: "no_show" });
  assert.equal((await use(noShow1!)).result, "used");
  assert.equal((await use(held1!)).result, "used", "the other button in the same email is spent too");
  assert.deepEqual(await use(held2!), { result: "marked", status: "no_show" }, "a co-host's link can't overwrite it");
  assert.equal((await one<{ status: string }>(`select status from meetings where id = $1`, [a.id])).status, "no_show");
  assert.equal((await one<{ n: number }>(`select count(*)::int n from jobs where kind = 'meeting_notify' and payload->>'meeting' = $1 and payload->>'event' = 'no_show'`, [a.id])).n, 1);
  assert.equal((await one<{ status: string }>(`select status from meetings where id = $1`, [b.id])).status, "booked", "the other meeting is untouched");
  // An auto-held meeting can still be marked from its email (the host's word beats the 24-hour rule), once.
  sent = [];
  await runAfter(b.id, end - D);
  const [, bNoShow] = links(sent[0]!);
  await q(`select meetings_auto_held(5000)`);
  assert.equal((await one<{ status: string }>(`select status from meetings where id = $1`, [b.id])).status, "held");
  assert.equal((await use(bNoShow!)).result, "ok");
  assert.equal((await one<{ status: string }>(`select status from meetings where id = $1`, [b.id])).status, "no_show");
  // A moved meeting's old after-meeting job sends nothing.
  sent = [];
  const c = await meeting({ start: Date.now() + D });
  await runAfter(c.id, Date.now());
  assert.equal(sent.length, 0);
});

test("a no-show gets one follow-up with the host's next times, unless suppressed or turned off", async () => {
  const m = await meeting({ start: Date.now() - 2 * H });
  await q(`select meeting_status($1, 'no_show', null, $2)`, [m.id, host]);
  await notify(m.id, "no_show");
  await notify(m.id, "no_show");
  assert.equal(sent.length, 1);
  assert.equal(subjectOf(sent[0]!), "Pick a new time with Sam Lee");
  const text = parts(sent[0]!.raw)["text/plain"]!;
  assert.ok(/^- \w{3}, \w{3} \d+, /m.test(text), "lists open times");
  assert.ok(text.includes(`https://app.test/book/`) && text.includes("/demo?") && text.includes(encodeURIComponent(m.guest)));
  assert.equal((await one<{ n: number }>(`select count(*)::int n from meeting_events where meeting_id = $1 and kind = 'follow_up_sent'`, [m.id])).n, 1);
  // Held: nothing goes to the guest.
  sent = [];
  const h = await meeting({ start: Date.now() - 2 * H });
  await q(`select meeting_status($1, 'held', null, $2)`, [h.id, host]);
  await notify(h.id, "held");
  assert.equal(sent.length, 0);
  // A suppressed guest is skipped.
  const s = await meeting({ start: Date.now() - 2 * H });
  await q(`insert into suppressions (workspace_id, email_clean, reason, source) values ($1, $2, 'unsubscribed', 'test')`, [ws, s.guest]);
  await q(`select meeting_status($1, 'no_show', null, $2)`, [s.id, host]);
  await notify(s.id, "no_show");
  assert.equal(sent.length, 0);
  assert.equal((await one<{ skip_reason: string }>(`select skip_reason from meeting_mails where meeting_id = $1`, [s.id])).skip_reason, "suppressed");
  // A suppressed guest still gets their confirmation (it's the meeting they booked).
  const t = await meeting({ start: Date.now() + 2 * D, guest: s.guest });
  await notify(t.id, "booked");
  assert.equal(to(s.guest).length, 1);
  // Turned off on the type.
  sent = [];
  await q(`update meeting_types set settings = settings || '{"noShowFollowUp": false}' where id = $1`, [typeId]);
  const off = await meeting({ start: Date.now() - 2 * H });
  await q(`select meeting_status($1, 'no_show', null, $2)`, [off.id, host]);
  await notify(off.id, "no_show");
  assert.equal(sent.length, 0);
  await q(`update meeting_types set settings = settings - 'noShowFollowUp' where id = $1`, [typeId]);
});

async function submission() {
  const email = `${randomUUID().slice(0, 8)}@lead.test`;
  const contact = (await one<{ id: string }>(`insert into contacts (workspace_id, email, email_clean, first_name, last_name, source, timezone) values ($1, $2, $2, 'Dana', 'Lee', 'form', 'Europe/Berlin') returning id`, [ws, email])).id;
  const id = (await one<{ id: string }>(`insert into submissions (workspace_id, form_version, contact_id, idem_key, booking_shown_at, booking_type_id) values ($1, 1, $2, $3, now(), $4) returning id`, [ws, contact, randomUUID().replace(/-/g, ""), typeId])).id;
  return { id, contact, email };
}
const bookLater = (sub: string, extra: Record<string, unknown> = {}) => meetingBookLater(rpc, opts)(job("meeting_book_later", { submission: sub, type: typeId, ...extra }), signal);

test("book later: the lead gets one 'Pick a time' email with the host's times, and the submission is marked not booked", async () => {
  const s = await submission();
  await bookLater(s.id, { host });
  await bookLater(s.id, { host });
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.to, s.email);
  assert.equal(subjectOf(sent[0]!), "Pick a time with Sam Lee");
  const text = parts(sent[0]!.raw)["text/plain"]!;
  assert.ok(/^- \w{3}, \w{3} \d+, .*GMT\+[12]$/m.test(text), "times in the lead's zone (Berlin)");
  const link = new URL(/Pick a time: (\S+)/.exec(text)![1]!);
  assert.equal(link.searchParams.get("email"), s.email);
  assert.equal(link.searchParams.get("name"), "Dana Lee");
  assert.ok(link.searchParams.get("ref"));
  const marks = await q(`select data from contact_events where contact_id = $1 and kind = 'meeting.not_booked'`, [s.contact]);
  assert.equal(marks.length, 1);
  assert.equal(marks[0].data.submission_id, s.id);
  assert.ok((await one<{ not_booked_at: Date | null }>(`select not_booked_at from submissions where id = $1`, [s.id])).not_booked_at);
});

test("book later does nothing when the lead booked meanwhile", async () => {
  const s = await submission();
  await meeting({ start: Date.now() + 2 * D, guest: s.email, submission: s.id, contact: s.contact });
  await bookLater(s.id, { host });
  assert.equal(sent.length, 0);
  assert.equal((await q(`select 1 from contact_events where contact_id = $1 and kind = 'meeting.not_booked'`, [s.contact])).length, 0);
  assert.equal((await one<{ not_booked_at: Date | null }>(`select not_booked_at from submissions where id = $1`, [s.id])).not_booked_at, null);
  // Suppressed leads are marked but not emailed.
  const t = await submission();
  await q(`insert into suppressions (workspace_id, email_clean, reason, source) values ($1, $2, 'bounced', 'test')`, [ws, t.email]);
  await bookLater(t.id, {});
  assert.equal(sent.length, 0);
  assert.equal((await q(`select 1 from contact_events where contact_id = $1 and kind = 'meeting.not_booked'`, [t.contact])).length, 1);
});

test("a calendar that needs reconnecting sends its person one email per break, and none once reconnected", async () => {
  const u = randomUUID();
  await q(`insert into auth.users (id, email) values ($1, $2)`, [u, `${u}@acme.test`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')`, [ws, u]);
  await q(`insert into booking_profiles (workspace_id, user_id, slug, name) values ($1, $2, $3, 'Rio Park')`, [ws, u, `rio-${u.slice(0, 6)}`]);
  const acc = (await one<{ id: string }>(`insert into calendar_accounts (workspace_id, user_id, provider, account_email) values ($1, $2, 'google', 'rio@gmail.test') returning id`, [ws, u])).id;
  await meeting({ start: Date.now() + 2 * D, hosts: [u] });
  const run = async () => {
    for (const j of await q(`select id, payload from jobs where kind = 'calendar_reconnect' and key = $1 and status = 'queued'`, [acc])) {
      await calendarReconnect(rpc, opts)(job("calendar_reconnect", j.payload), signal);
      await q(`update jobs set status = 'done' where id = $1`, [j.id]);
    }
  };

  // Two refusals in a row queue one job; running the job twice still sends one email.
  assert.equal((await one<{ r: boolean }>(`select calendar_reconnect($1, 'invalid_grant') r`, [acc])).r, true);
  assert.equal((await one<{ r: boolean }>(`select calendar_reconnect($1, 'invalid_grant') r`, [acc])).r, false);
  const [j] = await q(`select payload from jobs where kind = 'calendar_reconnect' and key = $1 and status = 'queued'`, [acc]);
  await run();
  await calendarReconnect(rpc, opts)(job("calendar_reconnect", j.payload), signal);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.to, `${u}@acme.test`);
  assert.equal(subjectOf(sent[0]!), "Reconnect your Google calendar");
  const text = parts(sent[0]!.raw)["text/plain"]!;
  assert.ok(text.includes("rio@gmail.test"));
  assert.ok(text.includes("Your 1 meeting in the next two weeks stays booked."));
  assert.ok(text.includes("https://app.test/settings/calendar"));

  // Reconnected before the job ran: nothing goes.
  sent = [];
  await q(`update calendar_accounts set status = 'ok' where id = $1`, [acc]);
  await q(`select calendar_reconnect($1, 'invalid_grant')`, [acc]);
  await q(`update calendar_accounts set status = 'ok' where id = $1`, [acc]);
  await run();
  assert.equal(sent.length, 0);

  // A later break is a new email.
  await q(`select calendar_reconnect($1, 'invalid_grant')`, [acc]);
  await run();
  assert.equal(sent.length, 1);
});
