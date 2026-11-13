// The meeting workflows on a real database (supabase/migrations/165_meeting_flows.sql; docs/workflows-plan.md, Part A):
// each workspace gets them live once, the older starting drafts they replace go, the ones with the invite can't be
// paused or deleted, the Reminders workflow sets when reminders go (and pausing it stops them), taking a step out of a
// workflow stops that email, a workspace's own reminder workflows still work as before, and a read that fails sends
// everything the way it went before.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import pg from "pg";
import { SendError } from "../../src/lib/email/provider.ts";
import type { Job, Rpc } from "../../src/lib/jobs.ts";
import { keepManageToken } from "../../src/lib/meetings/links.ts";
import { newToken, tokenHash } from "../../src/lib/meetings/server.ts";
import { systemEnsurePayload } from "../../src/lib/meetings/systemEmails.ts";
import { meetingFlow, meetingFlowsPayload, RETIRED_STARTING } from "../../src/lib/workflows/meetingFlows.ts";
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

type Flow = { id: string; kind: string; name: string; status: string };
const flows = (w: Ws, reminders?: number[]) => as(w.host, async (x) => (await x(`select meeting_flows_ensure($1, $2::jsonb, $3::text[]) r`, [w.ws, JSON.stringify(meetingFlowsPayload(reminders)), RETIRED_STARTING]))[0]!.r as Flow[]);
const remindJobs = (meeting: string) => q(`select payload->>'minutes' m from jobs where kind = 'meeting_remind' and status = 'queued' and payload->>'meeting' = $1 order by (payload->>'minutes')::int desc`, [meeting]);
/** Publish a new version of a meeting workflow with this body (as Publish does). */
async function publish(w: Ws, id: string, body: object) {
  await q(`select workflow_publish($1, $2, $3::jsonb, '[]'::jsonb, null)`, [id, w.host, JSON.stringify(body)]);
}

test("each workspace gets its meeting workflows live once, and the older starting drafts they replace go", async () => {
  const w = await workspace();
  // The older starting set: one never published, one published (it stays).
  const old1 = (await q(`insert into workflows (workspace_id, name, draft) values ($1, 'Meeting announcement', '{}') returning id`, [w.ws]))[0].id;
  const old2 = (await q(`insert into workflows (workspace_id, name, draft, live_version, status) values ($1, 'No-show follow-up', '{}', 1, 'live') returning id`, [w.ws]))[0].id;
  const a = await flows(w);
  assert.deepEqual(a.map((f) => [f.kind, f.status]), ["confirmed", "reminders", "moved", "canceled", "after", "no_show", "pick_time"].map((k) => [k, "live"]));
  const live = await q(`select w.name, v.version, f.name folder from workflows w join workflow_versions v on v.workflow_id = w.id and v.version = w.live_version join workflow_folders f on f.id = w.folder_id where w.workspace_id = $1 and w.meeting_kind is not null`, [w.ws]);
  assert.equal(live.length, 7);
  assert.ok(live.every((r) => r.version === 1 && r.folder === "Meetings"));
  assert.equal((await q(`select 1 from workflows where id = $1`, [old1])).length, 0, "the unpublished duplicate went");
  assert.equal((await q(`select 1 from workflows where id = $1`, [old2])).length, 1, "a published one stays");
  const b = await flows(w);
  assert.deepEqual(b.map((f) => f.id), a.map((f) => f.id), "calling again makes nothing new");
});

test("the workflows with the calendar invite can't be paused or deleted; the others can", async () => {
  const w = await workspace();
  const f = await flows(w);
  const id = (k: string) => f.find((x) => x.kind === k)!.id;
  await assert.rejects(as(w.host, (x) => x(`select workflow_set_status($1, 'paused')`, [id("confirmed")])), /calendar invite/);
  await assert.rejects(as(w.host, (x) => x(`select workflow_delete($1)`, [id("canceled")])), /calendar invite/);
  await as(w.host, (x) => x(`select workflow_set_status($1, 'paused')`, [id("reminders")]));
  await as(w.host, (x) => x(`select workflow_delete($1)`, [id("after")]));
  assert.equal((await q(`select status from workflows where id = $1`, [id("reminders")]))[0].status, "paused");
});

test("the Reminders workflow sets when reminders go, and pausing it stops them", async () => {
  const w = await workspace();
  await as(w.host, (x) => x(`select system_email_ensure($1, $2::jsonb)`, [w.ws, JSON.stringify(systemEnsurePayload())]));
  // The meeting type says a day before; the workflow says 2 hours and 30 minutes is not a step, so 2 hours.
  const f = await flows(w, [120]);
  const m = await meeting(w);
  await notify(w, m.id, "booked");
  assert.deepEqual((await remindJobs(m.id)).map((r) => r.m), ["120"], "the workflow's time, not the meeting type's");
  assert.ok(sent.some((x) => x.to === m.guest), "the confirmation went");
  // Pausing Reminders: a new booking gets none, and one already queued sends nothing.
  await as(w.host, (x) => x(`select workflow_set_status($1, 'paused')`, [f.find((x2) => x2.kind === "reminders")!.id]));
  const m2 = await meeting(w);
  await notify(w, m2.id, "booked");
  assert.equal((await remindJobs(m2.id)).length, 0);
  sent = [];
  await meetingRemind(rpc, opts)(job(w, "meeting_remind", { meeting: m.id, start: new Date(m.start).toISOString(), minutes: 120 }), signal);
  assert.equal(sent.length, 0, "a reminder queued before the pause doesn't go");
});

test("a Delay changed and published moves the reminders of new bookings", async () => {
  const w = await workspace();
  const f = await flows(w);
  const rem = f.find((x) => x.kind === "reminders")!;
  await publish(w, rem.id, meetingFlow("reminders", [2880, 180]).body);
  const m = await meeting(w);
  await notify(w, m.id, "booked");
  assert.deepEqual((await remindJobs(m.id)).map((r) => r.m), ["2880", "180"]);
});

test("taking the host's step out of Booking confirmed stops the host's note; the guest's confirmation still goes", async () => {
  const w = await workspace();
  const f = await flows(w);
  const conf = f.find((x) => x.kind === "confirmed")!;
  const body = meetingFlow("confirmed").body;
  await publish(w, conf.id, { ...body, steps: body.steps.filter((s) => !(s.kind === "meeting_email" && s.key === "host_booked")) });
  const m = await meeting(w);
  await notify(w, m.id, "booked");
  assert.equal(sent.filter((x) => x.to === m.guest).length, 1, "the guest's confirmation, with the invite");
  assert.equal(sent.filter((x) => x.to === `${w.host}@acme.test`).length, 0, "no host note");
  // Even with the workflow forced off in the database, the email with the invite goes.
  await q(`update workflows set status = 'paused' where id = $1`, [conf.id]);
  const m2 = await meeting(w);
  sent = [];
  await notify(w, m2.id, "booked");
  assert.equal(sent.filter((x) => x.to === m2.guest).length, 1);
});

test("a workspace's own reminder workflow still turns the built-in reminders off; the meeting workflows don't", async () => {
  const w = await workspace();
  await flows(w, [60]);
  const m = await meeting(w);
  await notify(w, m.id, "booked");
  assert.deepEqual((await remindJobs(m.id)).map((r) => r.m), ["60"], "the meeting workflows don't count as a workflow's own reminders");
  // Its own: a live meeting-triggered workflow with a Before the meeting wait.
  const own = (await q(`insert into workflows (workspace_id, name, draft) values ($1, 'My reminders', '{}') returning id`, [w.ws]))[0].id;
  await publish(w, own, { trigger: { kind: "meeting", events: ["booked"], types: [] }, steps: [{ id: "w1", kind: "wait", days: 0, hours: 3, before: "meeting" }], goals: [], entry: { mode: "once", gapDays: 30 } });
  const m2 = await meeting(w);
  await notify(w, m2.id, "booked");
  assert.equal((await remindJobs(m2.id)).length, 0, "its own reminders send them instead");
});

test("a read of the workflows that fails sends everything as before", async () => {
  const w = await workspace();
  const f = await flows(w, [120]);
  await as(w.host, (x) => x(`select workflow_set_status($1, 'paused')`, [f.find((x2) => x2.kind === "reminders")!.id]));
  const flaky: Rpc = (fn, args) => (fn === "meeting_system_emails" ? Promise.resolve({ data: null, error: { message: "timeout" } }) : rpc(fn, args));
  const m = await meeting(w);
  await notify(w, m.id, "booked", flaky);
  assert.equal(sent.filter((x) => x.to === m.guest).length, 1);
  assert.equal(sent.filter((x) => x.to === `${w.host}@acme.test`).length, 1);
  assert.deepEqual((await remindJobs(m.id)).map((r) => r.m), ["1440"], "the meeting type's reminders, as before");
});
