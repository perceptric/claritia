// System emails on a real database (supabase/migrations/164_system_emails.sql; docs/system-emails.md): each workspace
// gets one of each, made once and never overwritten; the meeting worker sends the team's design with the meeting's
// values and the calendar invite, leaves out parts with no value, honors Off (except for the emails with the invite),
// falls back to the built-in email when the design can't be built or the read fails, and a flaky provider still
// sends each email once.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import pg from "pg";
import { SendError } from "../../src/lib/email/provider.ts";
import type { Job, Rpc } from "../../src/lib/jobs.ts";
import { keepManageToken } from "../../src/lib/meetings/links.ts";
import { newToken, tokenHash } from "../../src/lib/meetings/server.ts";
import { SYSTEM_KEYS, systemEnsurePayload } from "../../src/lib/meetings/systemEmails.ts";
import { DEFAULT_SETTINGS } from "../../src/lib/meetings/types.ts";
import { meetingNotify, meetingRemind, type Mail, type Mailer, type MeetingOpts } from "../../worker-intel/jobs/meetings.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 6 });
const rpc = pgRpc(pool);
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

const SECRET = "s".repeat(40);
const D = 86_400_000;

let sent: Mail[] = [];
let script: ("ok" | "throttle" | "timeout")[] = [];
const mailer: Mailer = {
  async send(m) {
    const next = script.shift() ?? "ok";
    if (next === "throttle") throw new SendError("Resend 429", { status: 429, later: true });
    if (next === "timeout") throw new SendError("SMTP: the connection closed", { unknown: true });
    sent.push(m);
    return randomUUID();
  },
};
const opts: MeetingOpts = { mailer, base: "https://app.test", secret: SECRET, from: "meetings@tryclaritia.com" };
const signal = new AbortController().signal;

async function as<T>(user: string, fn: (q: (sql: string, p?: unknown[]) => Promise<Record<string, unknown>[]>) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user]);
    await c.query(`set role authenticated`);
    return await fn(async (sql, p = []) => (await c.query(sql, p)).rows);
  } finally {
    await c.query(`reset role`);
    await c.query(`select set_config('request.jwt.claim.sub', '', false)`);
    c.release();
  }
}

/** A raw message's decoded parts. */
function parts(raw: string) {
  const out: Record<string, string> = {};
  for (const chunk of raw.split(/\r\n--[A-Za-z0-9_]+(?:--)?\r\n/)) {
    const [head, ...rest] = chunk.split("\r\n\r\n");
    const type = /Content-Type: ([a-z]+\/[a-z]+)/i.exec(head ?? "")?.[1]?.toLowerCase();
    if (!type || type.startsWith("multipart/") || !/base64/i.test(head ?? "")) continue;
    out[type] = Buffer.from(rest.join("\r\n\r\n").replace(/\s+/g, ""), "base64").toString("utf8");
  }
  return out;
}
const subjectOf = (m: Mail) => {
  const head = m.raw.split("\r\n\r\n")[0]!;
  const enc = [...head.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)];
  return enc.length ? enc.map((x) => Buffer.from(x[1]!, "base64").toString("utf8")).join("") : /^Subject: (.*)$/m.exec(head)![1]!;
};

type Ws = { ws: string; host: string; type: string };
async function workspace(o: { location?: object } = {}): Promise<Ws> {
  const ws = randomUUID();
  const host = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, 'Acme')`, [ws]);
  await q(`insert into auth.users (id, email) values ($1, $2)`, [host, `${host}@acme.test`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')`, [ws, host]);
  await q(`insert into booking_profiles (workspace_id, user_id, slug, name) values ($1, $2, $3, 'Sam Lee')`, [ws, host, `sam-${host.slice(0, 6)}`]);
  const settings = { ...DEFAULT_SETTINGS, notice: 0, window: 7, reminders: [1440], questions: [{ id: "size", label: "Team size", type: "text", required: false }], ...(o.location ? { location: o.location } : {}) };
  const type = (await q(`insert into meeting_types (workspace_id, slug, name, kind, hosts, settings) values ($1, 'demo', 'Demo', 'one', $2, $3) returning id`, [ws, JSON.stringify([{ user_id: host }]), settings]))[0].id as string;
  return { ws, host, type };
}
const ensure = (w: Ws) => as(w.host, async (x) => (await x(`select system_email_ensure($1, $2::jsonb) r`, [w.ws, JSON.stringify(systemEnsurePayload())]))[0]!.r as { id: string; key: string; subject: string; off: boolean; made: boolean }[]);

async function meeting(w: Ws, o: { start?: number; guestName?: string; location?: object } = {}) {
  const token = newToken();
  const start = new Date(o.start ?? Date.now() + 3 * D).toISOString();
  const end = new Date(Date.parse(start) + 30 * 60_000).toISOString();
  const guest = `${randomUUID().slice(0, 8)}@lead.test`;
  const location = o.location ?? { kind: "google_meet", url: "https://meet.google.com/abc-defg-hij" };
  const id = (
    await q(
      `insert into meetings (workspace_id, type_id, hosts, guest_email, guest_name, guest_tz, answers, start_at, end_at, block_start, block_end, status, source, token_hash, location)
       values ($1, $2, $3, $4, $5, 'America/New_York', '{"size":"12"}', $6, $7, $6, $7, 'booked', 'page', $8, $9) returning id`,
      [w.ws, w.type, [w.host], guest, o.guestName ?? "Dana Lee", start, end, tokenHash(token), JSON.stringify(location)],
    )
  )[0].id as string;
  await q(`insert into meeting_events (meeting_id, kind) values ($1, 'booked')`, [id]);
  await keepManageToken(rpc, id, token, SECRET);
  return { id, token, guest, start };
}
const job = (w: Ws, kind: string, payload: Record<string, unknown>): Job => ({ id: randomUUID(), workspace_id: w.ws, kind, key: "", payload, attempts: 1, max_attempts: 5 });
const notify = (w: Ws, meeting: string, event: string, r: Rpc = rpc) => meetingNotify(r, opts)(job(w, "meeting_notify", { meeting, event }), signal);

before(() => {
  process.env.SECRETS_KEY = SECRET;
});
beforeEach(() => {
  sent = [];
  script = [];
});

test("each workspace gets one of each System email, made once and never overwritten; outsiders can't", async () => {
  const w = await workspace();
  const a = await ensure(w);
  assert.deepEqual(a.map((e) => e.key), [...SYSTEM_KEYS]);
  assert.ok(a.every((e) => e.made && !e.off));
  // The team edits the confirmation on the canvas.
  const confirm = a.find((e) => e.key === "confirm")!;
  await as(w.host, (x) => x(`select email_draft_save($1, $2, 'Booking confirmed', 'You are in, {{first_name|there}}', '', (select doc from emails where id = $2))`, [w.ws, confirm.id]));
  const b = await ensure(w);
  assert.deepEqual(b.map((e) => [e.id, e.made]), a.map((e) => [e.id, false]), "calling again makes nothing new");
  assert.equal(b.find((e) => e.key === "confirm")!.subject, "You are in, {{first_name|there}}", "the team's words stay");
  // Campaign lists never see them.
  const loose = await q(`select count(*)::int n from emails where workspace_id = $1 and kind = 'broadcast'`, [w.ws]);
  assert.equal(loose[0].n, 0);
  const outsider = randomUUID();
  await q(`insert into auth.users (id, email) values ($1, $2)`, [outsider, `${outsider}@x.test`]);
  await assert.rejects(as(outsider, (x) => x(`select system_email_ensure($1, '[]'::jsonb)`, [w.ws])), /Workspace not found/);
  await assert.rejects(as(outsider, (x) => x(`select system_email_turn($1, $2, false)`, [w.ws, confirm.id])), /Workspace not found/);
});

test("without System emails the built-in confirmation goes, as before", async () => {
  const w = await workspace();
  const m = await meeting(w);
  await notify(w, m.id, "booked");
  const c = sent.find((x) => x.to === m.guest)!;
  assert.match(subjectOf(c), /^Confirmed: Demo with Sam Lee on /);
  assert.ok(parts(c.raw)["text/html"]!.includes("Scheduled with"), "the built-in layout");
});

test("the team's design goes with the meeting's values, its links and the calendar invite", async () => {
  const w = await workspace();
  const rows = await ensure(w);
  const confirm = rows.find((e) => e.key === "confirm")!;
  await as(w.host, (x) => x(`select email_draft_save($1, $2, 'Booking confirmed', 'See you soon, {{first_name|there}}: {{meeting_name}}', '', (select doc from emails where id = $2))`, [w.ws, confirm.id]));
  const m = await meeting(w, { guestName: "Dana <b>Lee</b>" });
  await notify(w, m.id, "booked");
  const c = sent.find((x) => x.to === m.guest)!;
  assert.equal(subjectOf(c), "See you soon, Dana: Demo");
  const p = parts(c.raw);
  const html = p["text/html"]!;
  assert.ok(html.includes("Your meeting is booked"));
  assert.ok(html.includes("https://meet.google.com/abc-defg-hij"), "the Join button has the meeting's link");
  assert.ok(html.includes(`https://test/book/m/${m.token}`), "the reschedule link is the guest's own");
  assert.ok(html.includes("<strong>Team size</strong>: 12"), "their answers");
  assert.ok(!html.includes("{{") && !p["text/plain"]!.includes("{{"), "every merge field is filled");
  assert.ok(!html.includes("<b>Lee</b>"), "a guest's words are escaped");
  assert.ok(p["text/calendar"]?.includes("BEGIN:VCALENDAR"), "the invite still goes with it");
  const host = sent.find((x) => x.to === `${w.host}@acme.test`)!;
  assert.match(subjectOf(host), /^New meeting: Dana <b>Lee<\/b> on /, "the host's note is the design too");
});

test("a part with no value is left out: no Join button without a video link", async () => {
  const w = await workspace();
  await ensure(w);
  const m = await meeting(w, { location: { kind: "phone_host", phone: "+1 555 0100" } });
  await notify(w, m.id, "booked");
  const html = parts(sent.find((x) => x.to === m.guest)!.raw)["text/html"]!;
  assert.ok(html.includes("Your meeting is booked"));
  assert.ok(!html.includes("Join the meeting"), "no button that goes nowhere");
});

test("Off stops reminders and the host's notes; the emails with the invite always go", async () => {
  const w = await workspace();
  const rows = await ensure(w);
  for (const key of ["reminder", "host_booked", "confirm"]) await as(w.host, (x) => x(`select system_email_turn($1, $2, false)`, [w.ws, rows.find((e) => e.key === key)!.id]));
  const m = await meeting(w, { start: Date.now() + D + 60_000 });
  await notify(w, m.id, "booked");
  assert.equal(sent.filter((x) => x.to === m.guest).length, 1, "the confirmation still went");
  assert.equal(sent.filter((x) => x.to === `${w.host}@acme.test`).length, 0, "the host's note is off");
  sent = [];
  await meetingRemind(rpc, opts)(job(w, "meeting_remind", { meeting: m.id, start: new Date(m.start).toISOString(), minutes: 1440 }), signal);
  assert.equal(sent.length, 0, "no reminder");
  // On again: the reminder goes, in the design, with the time left.
  await as(w.host, (x) => x(`select system_email_turn($1, $2, true)`, [w.ws, rows.find((e) => e.key === "reminder")!.id]));
  await meetingRemind(rpc, opts)(job(w, "meeting_remind", { meeting: m.id, start: new Date(m.start).toISOString(), minutes: 1440 }), signal);
  assert.equal(sent.length, 1);
  assert.match(subjectOf(sent[0]!), /^Reminder: Demo with Sam Lee tomorrow$/);
});

test("a design that can't be built, or a read that fails, sends the built-in email", async () => {
  const w = await workspace();
  const rows = await ensure(w);
  await q(`update emails set doc = '{"v":1,"sections":[]}'::jsonb where id = $1`, [rows.find((e) => e.key === "confirm")!.id]);
  const m = await meeting(w);
  await notify(w, m.id, "booked");
  assert.match(subjectOf(sent.find((x) => x.to === m.guest)!), /^Confirmed: Demo with Sam Lee on /);
  assert.ok(parts(sent.find((x) => x.to === m.guest)!.raw)["text/html"]!.includes("Scheduled with"));
  // The read itself fails (a hiccup): the built-in emails go, and nothing is lost.
  sent = [];
  const flaky: Rpc = (fn, args) => (fn === "meeting_system_emails" ? Promise.resolve({ data: null, error: { message: "timeout" } }) : rpc(fn, args));
  const m2 = await meeting(w);
  await notify(w, m2.id, "booked", flaky);
  assert.equal(sent.filter((x) => x.to === m2.guest).length, 1);
  assert.match(subjectOf(sent.find((x) => x.to === m2.guest)!), /^Confirmed: Demo with Sam Lee on /);
});

test("with a flaky provider each System email still goes once", async () => {
  const w = await workspace();
  await ensure(w);
  const m = await meeting(w);
  script = ["throttle"];
  await assert.rejects(notify(w, m.id, "booked"), /not now/);
  await notify(w, m.id, "booked");
  await notify(w, m.id, "booked");
  assert.equal(sent.filter((x) => x.to === m.guest).length, 1, "one confirmation");
  assert.equal(sent.filter((x) => x.to === `${w.host}@acme.test`).length, 1, "one note");
  // A timeout may have gone out: never sent again.
  const m2 = await meeting(w);
  sent = [];
  script = ["timeout"];
  await notify(w, m2.id, "booked");
  await notify(w, m2.id, "booked");
  assert.equal(sent.filter((x) => x.to === m2.guest).length, 0);
});
