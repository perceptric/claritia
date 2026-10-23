// Calendars on a real database (docs/meetings-scheduler.md 1.1, 1.3, 1.6, 1.7 and Part 3), with fake Google, Microsoft
// and Zoom servers: a missed push caught by the 10-minute refresh, a revoked token turning the account to reconnect
// and taking the host out of offers, a create that fails then succeeds making one event, the last failure still
// sending the emails, a provider timing out on the live check falling back to the cache, and a duplicate push
// queuing one refresh.
process.env.SECRETS_KEY ||= "test-secret-key-0123456789-abcdefghijklmnop";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";
import { JobError, type Job } from "../../src/lib/jobs.ts";
import { liveBusyFor } from "../../src/lib/meetings/live.ts";
import { handleHook } from "../../src/lib/meetings/providers/hook.ts";
import { channelToken, sealToken, type Tok } from "../../src/lib/meetings/providers/index.ts";
import { book, offer } from "../../src/lib/meetings/server.ts";
import { DEFAULT_AVAILABILITY, DEFAULT_SETTINGS, type Kind, type Location, type MeetingType } from "../../src/lib/meetings/types.ts";
import { calendarRefresh, calendarWatch, meetingSync } from "../../worker-intel/jobs/calendars.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";
import { byHost, fakeGoogle, fakeMicrosoft, fakeZoom } from "../fakeCalendars.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 8 });
const rpc = pgRpc(pool);
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

const H = 3_600_000;
const DAY = 24 * H;
const tok = (o: Partial<Tok> = {}): Tok => ({ access: "access-1", refresh: "refresh-1", expiresAt: Date.now() + H, ...o });
const signal = new AbortController().signal;
const none = async () => new Set<string>();
const GOOGLE_CALS = [
  { id: "me@acme.io", name: "Me", primary: true, own: true },
  { id: "team@acme.io", name: "Team", primary: false, own: true },
  { id: "boss@acme.io", name: "Boss", primary: false, own: false },
];

function job(kind: string, key: string, payload: Record<string, unknown>, ws: string, attempts = 1, max = 5): Job {
  return { id: randomUUID(), workspace_id: ws, kind, key, payload, attempts, max_attempts: max };
}

async function team(n: number) {
  const ws = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, 'Acme')`, [ws]);
  const users: string[] = [];
  for (let i = 0; i < n; i++) {
    const u = randomUUID();
    users.push(u);
    await q(`insert into auth.users (id, email) values ($1, $2)`, [u, `rep${i}-${u.slice(0, 4)}@acme.io`]);
    await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, $3)`, [ws, u, i === 0 ? "owner" : "member"]);
    const a = DEFAULT_AVAILABILITY("UTC");
    a.weekly = { mon: [["00:00", "23:59"]], tue: [["00:00", "23:59"]], wed: [["00:00", "23:59"]], thu: [["00:00", "23:59"]], fri: [["00:00", "23:59"]], sat: [["00:00", "23:59"]], sun: [["00:00", "23:59"]] };
    await q(`insert into availability (workspace_id, user_id, tz, weekly, overrides) values ($1, $2, $3, $4, '[]')`, [ws, u, a.tz, a.weekly]);
  }
  return { ws, users };
}

async function connect(ws: string, user: string, provider: "google" | "microsoft" | "zoom", t: Tok = tok(), email = `${user.slice(0, 6)}@${provider}.io`) {
  const cals = provider === "google" ? GOOGLE_CALS : provider === "microsoft" ? [{ id: "AAMkDef", name: "Calendar", primary: true, own: true }] : [];
  const { data, error } = await rpc("calendar_connect", { p_ws: ws, p_user: user, p_provider: provider, p_email: email, p_sealed: sealToken(t), p_calendars: cals });
  assert.equal(error, null);
  return data as string;
}

async function meetingType(ws: string, kind: Kind, users: string[], location: Location = { kind: "google_meet" }): Promise<MeetingType> {
  const hosts = users.map((u) => ({ user_id: u, weight: 1, tier: 0 }));
  const s = { ...DEFAULT_SETTINGS, notice: 60, window: 7, location };
  const id = (await q(`insert into meeting_types (workspace_id, slug, name, kind, hosts, settings) values ($1, $2, 'Intro call', $3, $4, $5) returning id`, [ws, `t-${randomUUID().slice(0, 6)}`, kind, JSON.stringify(hosts), s]))[0].id as string;
  return { id, workspace_id: ws, slug: "t", name: "Intro call", kind, hosts, settings: s, secret: false, active: true, owner_user_id: null, template_id: null, locked: [] };
}

async function booked(ws: string, t: MeetingType) {
  const o = await offer(rpc, { ws, type: t, length: 30 });
  assert.ok(o.slots.length, "times are offered");
  const r = await book(rpc, { ws, type: t, length: 30, start: o.slots[0]!.start, guest: { email: "dana@lead.io", name: "Dana Lee" }, source: "page", liveBusy: none });
  assert.ok(r.ok);
  return r;
}

const jobs = async (kind: string, extra = "") => q(`select key, payload, status from jobs where kind = $1 ${extra}`, [kind]);

test("connecting lists the calendars: primary busy and written to, the person's own busy, others' shared ones off", async () => {
  const { ws, users } = await team(1);
  const a = await connect(ws, users[0]!, "google");
  const lists = await q(`select calendar_id, busy, write from calendar_lists where account_id = $1 order by calendar_id`, [a]);
  assert.deepEqual(lists.map((l) => [l.calendar_id, l.busy, l.write]), [["boss@acme.io", false, false], ["me@acme.io", true, true], ["team@acme.io", true, false]]);
  // A second account: its calendars count, but new events still go to the first.
  const b = await connect(ws, users[0]!, "microsoft");
  assert.deepEqual((await q(`select busy, write from calendar_lists where account_id = $1`, [b])).map((l) => [l.busy, l.write]), [[true, false]]);
  // Choosing the Outlook calendar for new events turns the Google one off: one calendar per person is written to.
  await rpc("calendar_lists_save", { p_account: b, p_rows: [{ id: "AAMkDef", write: true }] });
  assert.deepEqual((await q(`select l.calendar_id from calendar_lists l join calendar_accounts a on a.id = l.account_id where a.user_id = $1 and l.write`, [users[0]])).map((r) => r.calendar_id), ["AAMkDef"]);
  // Reconnecting the same account turns it back to ok and keeps the choices.
  await q(`update calendar_accounts set status = 'reconnect' where id = $1`, [a]);
  assert.equal(await connect(ws, users[0]!, "google"), a);
  assert.equal((await q(`select status from calendar_accounts where id = $1`, [a]))[0].status, "ok");
  assert.equal((await q(`select write from calendar_lists where account_id = $1 and calendar_id = 'me@acme.io'`, [a]))[0].write, false);
  // Someone outside the workspace can't be connected into it.
  const { error } = await rpc("calendar_connect", { p_ws: ws, p_user: randomUUID(), p_provider: "google", p_email: "x@y.io", p_sealed: "x", p_calendars: [] });
  assert.match(error?.message ?? "", /not_member/);
});

test("a push that never arrives: the 10-minute refresh picks up the new event", async () => {
  const { ws, users } = await team(1);
  const a = await connect(ws, users[0]!, "google");
  const g = fakeGoogle();
  const refresh = calendarRefresh(rpc, { http: { fetcher: g.fetcher } });
  await refresh(job("calendar_refresh", a, { account: a }, ws), signal);
  assert.equal((await q(`select count(*)::int n from busy_blocks where account_id = $1`, [a]))[0].n, 0);

  // A new event lands on the calendar and the push is lost. Inside 10 minutes nothing is due.
  const start = Math.ceil((Date.now() + 2 * DAY) / H) * H;
  g.s.busy["team@acme.io"] = [{ start, end: start + H }];
  await rpc("calendars_due", {});
  assert.equal((await jobs("calendar_refresh", `and key = '${a}'`)).length, 0);

  // Ten minutes on, the safety net queues one refresh (not two, however often the tick runs).
  await q(`update calendar_accounts set refreshed_at = now() - interval '11 minutes' where id = $1`, [a]);
  await rpc("calendars_due", {});
  await rpc("calendars_due", {});
  const due = await jobs("calendar_refresh", `and key = '${a}' and status = 'queued'`);
  assert.equal(due.length, 1);
  await refresh(job("calendar_refresh", a, due[0].payload, ws), signal);
  const blocks = await q(`select calendar_id, start_at, end_at from busy_blocks where account_id = $1`, [a]);
  assert.deepEqual(blocks.map((b) => [b.calendar_id, b.start_at.getTime(), b.end_at.getTime()]), [["team@acme.io", start, start + H]]);
  // The busy time now keeps that hour out of the offer.
  const t = await meetingType(ws, "one", users);
  const o = await offer(rpc, { ws, type: t, length: 30 });
  assert.ok(o.slots.length && !o.slots.some((s) => s.start > start - 30 * 60_000 && s.start < start + H) && o.slots.some((s) => s.start === start + H));
  // Free/busy only: nothing about the event but its times.
  assert.deepEqual(Object.keys((await q(`select * from busy_blocks where account_id = $1`, [a]))[0]).sort(), ["account_id", "calendar_id", "end_at", "ooo", "start_at"]);
});

test("a revoked token turns the account to reconnect once, and the host leaves the offer while the others stay", async () => {
  const { ws, users } = await team(2);
  const gone = await connect(ws, users[0]!, "google", tok({ expiresAt: 0 }));
  await connect(ws, users[1]!, "google");
  const g = fakeGoogle();
  g.s.token = { status: 400, body: { error: "invalid_grant", error_description: "Token has been expired or revoked." } };
  const refresh = calendarRefresh(rpc, { http: { fetcher: g.fetcher } });
  await assert.rejects(refresh(job("calendar_refresh", gone, { account: gone }, ws), signal), (e) => e instanceof JobError && !e.retry);
  const acc = (await q(`select status, reconnect_reason from calendar_accounts where id = $1`, [gone]))[0];
  assert.equal(acc.status, "reconnect");
  assert.match(acc.reconnect_reason, /revoked/);
  await refresh(job("calendar_refresh", gone, { account: gone }, ws), signal);
  await rpc("calendar_reconnect", { p_account: gone, p_reason: "again" });
  const told = await jobs("calendar_reconnect", `and key = '${gone}'`);
  assert.equal(told.length, 1, "the person is told once");
  assert.equal(told[0].payload.user, users[0]);

  const t = await meetingType(ws, "round_robin", users);
  const o = await offer(rpc, { ws, type: t, length: 30 });
  assert.deepEqual(o.out, [{ id: users[0], why: "reconnect" }]);
  assert.ok(o.slots.length > 0 && o.slots.every((s) => s.hosts.join() === users[1]), "never an empty calendar while someone is free");
  // The safety net leaves it alone until it's reconnected.
  await q(`update calendar_accounts set refreshed_at = now() - interval '1 hour' where id = $1`, [gone]);
  await rpc("calendars_due", {});
  assert.equal((await jobs("calendar_refresh", `and key = '${gone}' and status = 'queued'`)).length, 0);
});

test("the live check: a 401 after a fresh token turns the account to reconnect, and the host isn't counted busy", async () => {
  const { ws, users } = await team(1);
  const a = await connect(ws, users[0]!, "google");
  const g = fakeGoogle();
  g.s.unauthorized = 2;
  const busy = await liveBusyFor(rpc, ws, { fetcher: g.fetcher })([users[0]!], Date.now() + DAY, Date.now() + DAY + H);
  assert.equal(busy.size, 0);
  assert.equal((await q(`select status from calendar_accounts where id = $1`, [a]))[0].status, "reconnect");
});

test("a provider timing out on the live check falls back to the cache, and the booking goes through", async () => {
  const { ws, users } = await team(1);
  const a = await connect(ws, users[0]!, "google");
  const t = await meetingType(ws, "one", users);
  const first = (await offer(rpc, { ws, type: t, length: 30 })).slots[0]!.start;
  // The cache knows the first slot is busy; the provider hangs.
  await rpc("busy_replace", { p_account: a, p_calendar: "me@acme.io", p_from: new Date(Date.now()).toISOString(), p_to: new Date(Date.now() + 8 * DAY).toISOString(), p_rows: JSON.stringify([{ start: new Date(first).toISOString(), end: new Date(first + 30 * 60_000).toISOString() }]) });
  const g = fakeGoogle();
  g.s.hang = true;
  const liveBusy = liveBusyFor(rpc, ws, { fetcher: g.fetcher, timeoutMs: 300 });
  const slots = (await offer(rpc, { ws, type: t, length: 30 })).slots;
  assert.ok(!slots.some((s) => s.start === first), "the cached busy time is still kept out");
  const t0 = Date.now();
  const r = await book(rpc, { ws, type: t, length: 30, start: slots[0]!.start, guest: { email: "dana@lead.io" }, source: "page", liveBusy });
  assert.ok(r.ok);
  assert.ok(Date.now() - t0 < 1500, "the guest doesn't wait on the provider");
  assert.equal((await q(`select status from calendar_accounts where id = $1`, [a]))[0].status, "ok", "slow isn't revoked");
});

test("a create that fails then succeeds makes exactly one event, with the Meet link kept and one confirmation", async () => {
  const { ws, users } = await team(1);
  await connect(ws, users[0]!, "google", tok(), "rep@acme.io");
  const r = await booked(ws, await meetingType(ws, "one", users));
  const g = fakeGoogle();
  g.s.loseCreate = 1;
  const sync = meetingSync(rpc, { http: { fetcher: g.fetcher } });
  const payload = { meeting: r.meetingId, action: "create" };
  await assert.rejects(sync(job("meeting_sync", `create:${r.meetingId}`, payload, ws, 1), signal), (e) => e instanceof JobError && e.retry && e.retryAfterS === 20);
  assert.equal(g.s.events.size, 1, "the provider made it, but the answer was lost");
  assert.equal((await jobs("meeting_notify", `and payload->>'meeting' = '${r.meetingId}'`)).length, 0, "no email until the calendar side is done");

  await sync(job("meeting_sync", `create:${r.meetingId}`, payload, ws, 2), signal);
  await sync(job("meeting_sync", `create:${r.meetingId}`, payload, ws, 1), signal);
  assert.equal(g.s.events.size, 1, "exactly one event");
  const e = [...g.s.events.values()][0]!;
  assert.equal(e.summary, "Intro call with Dana Lee");
  assert.deepEqual(e.attendees, [{ email: "dana@lead.io", displayName: "Dana Lee" }]);
  assert.ok(g.s.calls.filter((c) => c.method === "POST" && c.url.pathname.endsWith("/events")).every((c) => c.url.searchParams.get("sendUpdates") === "none"));
  const m = (await q(`select events, location from meetings where id = $1`, [r.meetingId]))[0];
  assert.equal(m.events[users[0]!].event, e.id);
  assert.equal(m.events[users[0]!].calendar, "me@acme.io");
  assert.equal(m.location.kind, "google_meet");
  assert.match(m.location.url, /^https:\/\/meet\.google\.com\//);
  const n = await jobs("meeting_notify", `and payload->>'meeting' = '${r.meetingId}'`);
  assert.deepEqual(n.map((x) => x.payload.event), ["booked"]);
  assert.equal((await q(`select count(*)::int n from meeting_sync_leases`))[0].n, 0, "the lease is given back");
});

test("the last try failing keeps the meeting, records calendar_failed and still sends the emails", async () => {
  const { ws, users } = await team(1);
  await connect(ws, users[0]!, "google");
  const r = await booked(ws, await meetingType(ws, "one", users));
  const g = fakeGoogle();
  g.s.failCreate = 99;
  const sync = meetingSync(rpc, { http: { fetcher: g.fetcher } });
  const payload = { meeting: r.meetingId, action: "create" };
  await assert.rejects(sync(job("meeting_sync", `create:${r.meetingId}`, payload, ws, 4), signal), (e) => e instanceof JobError && e.retry && e.retryAfterS === 600);
  await assert.rejects(sync(job("meeting_sync", `create:${r.meetingId}`, payload, ws, 5), signal), (e) => e instanceof JobError && !e.retry);
  assert.equal((await q(`select status from meetings where id = $1`, [r.meetingId]))[0].status, "booked");
  const ev = await q(`select detail from meeting_events where meeting_id = $1 and kind = 'calendar_failed'`, [r.meetingId]);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].detail.action, "create");
  assert.deepEqual((await jobs("meeting_notify", `and payload->>'meeting' = '${r.meetingId}'`)).map((x) => x.payload.event), ["booked"]);
});

test("move keeps the same event; a new lead host gets a new one and the old is canceled; cancel cancels", async () => {
  const { ws, users } = await team(2);
  await connect(ws, users[0]!, "google", tok(), "a@acme.io");
  await connect(ws, users[1]!, "google", tok(), "b@acme.io");
  const r = await booked(ws, await meetingType(ws, "one", [users[0]!]));
  const g = fakeGoogle();
  const sync = meetingSync(rpc, { http: { fetcher: g.fetcher } });
  await sync(job("meeting_sync", `create:${r.meetingId}`, { meeting: r.meetingId, action: "create" }, ws), signal);
  const first = [...g.s.events.keys()][0]!;

  const to = r.start + DAY;
  await rpc("meeting_move", { p_id: r.meetingId, p_hosts: [users[0]], p_start: new Date(to).toISOString(), p_end: new Date(to + 30 * 60_000).toISOString(), p_block_start: new Date(to).toISOString(), p_block_end: new Date(to + 30 * 60_000).toISOString() });
  await sync(job("meeting_sync", `move:${r.meetingId}:1`, { meeting: r.meetingId, action: "move" }, ws), signal);
  assert.equal(g.s.events.size, 1, "moved, not made again");
  assert.equal((g.s.events.get(first)!.start as { dateTime: string }).dateTime, new Date(to).toISOString());

  // Another host takes it: the old event is canceled (its own notice goes out) and the new host's is made.
  await rpc("meeting_move", { p_id: r.meetingId, p_hosts: [users[1]], p_start: new Date(to).toISOString(), p_end: new Date(to + 30 * 60_000).toISOString(), p_block_start: new Date(to).toISOString(), p_block_end: new Date(to + 30 * 60_000).toISOString() });
  await sync(job("meeting_sync", `move:${r.meetingId}:2`, { meeting: r.meetingId, action: "move" }, ws), signal);
  assert.equal(g.s.events.get(first)!.status, "cancelled");
  const second = [...g.s.events.values()].find((e) => e.id !== first)!;
  assert.equal(second.status, "confirmed");
  const m = (await q(`select events from meetings where id = $1`, [r.meetingId]))[0];
  assert.deepEqual(Object.keys(m.events), [users[1]]);

  await rpc("meeting_status", { p_id: r.meetingId, p_status: "canceled", p_reason: "Can't make it" });
  await sync(job("meeting_sync", `cancel:${r.meetingId}:3`, { meeting: r.meetingId, action: "cancel" }, ws), signal);
  assert.equal(second.status, "cancelled");
  assert.deepEqual((await jobs("meeting_notify", `and payload->>'meeting' = '${r.meetingId}'`)).map((x) => x.payload.event).sort(), ["booked", "canceled", "moved", "moved"]);
});

test("a collective meeting: one event on the lead host's calendar; providers never email the guest", async () => {
  // Claritia sends the guest its own invite (.ics). Google keeps them on the event but sends nothing; Outlook, which
  // emails every attendee, names them in the body and invites only the co-host.
  for (const leadProvider of ["google", "microsoft"] as const) {
    const { ws, users } = await team(2);
    const other = leadProvider === "google" ? "microsoft" : "google";
    await connect(ws, users[0]!, leadProvider, tok(), leadProvider === "google" ? "a@acme.io" : "a@contoso.com");
    await connect(ws, users[1]!, other, tok(), other === "google" ? "b@acme.io" : "b@contoso.com");
    const r = await booked(ws, await meetingType(ws, "collective", users));
    assert.deepEqual(r.hosts, users, "the first host leads");
    const g = fakeGoogle();
    const ms = fakeMicrosoft();
    await meetingSync(rpc, { http: { fetcher: byHost({ google: g.fetcher, microsoft: ms.fetcher }) } })(job("meeting_sync", `create:${r.meetingId}`, { meeting: r.meetingId, action: "create" }, ws), signal);
    assert.equal(g.s.events.size + ms.s.events.size, 1);
    if (leadProvider === "google") {
      const e = [...g.s.events.values()][0]!;
      assert.deepEqual(e.attendees, [{ email: "dana@lead.io", displayName: "Dana Lee" }, { email: "b@contoso.com" }]);
      assert.equal(g.s.calls.find((c) => c.method === "POST" && c.url.pathname.endsWith("/events"))!.url.searchParams.get("sendUpdates"), "none");
    } else {
      const e = [...ms.s.events.values()][0]!;
      assert.deepEqual(e.attendees, [{ emailAddress: { address: "b@acme.io" }, type: "required" }]);
      assert.match((e.body as { content: string }).content, /Guest: Dana Lee <dana@lead\.io>/);
    }
  }
});

test("Zoom: one Zoom meeting even when the calendar event fails after it, and its link goes on the event", async () => {
  const { ws, users } = await team(1);
  await connect(ws, users[0]!, "google");
  await connect(ws, users[0]!, "zoom");
  const r = await booked(ws, await meetingType(ws, "one", users, { kind: "zoom" }));
  const g = fakeGoogle();
  g.s.failCreate = 1;
  const z = fakeZoom();
  const sync = meetingSync(rpc, { http: { fetcher: byHost({ google: g.fetcher, zoom: z.fetcher }) } });
  const payload = { meeting: r.meetingId, action: "create" };
  await assert.rejects(sync(job("meeting_sync", `create:${r.meetingId}`, payload, ws, 1), signal), JobError);
  await sync(job("meeting_sync", `create:${r.meetingId}`, payload, ws, 2), signal);
  assert.equal(z.s.meetings.size, 1, "one Zoom meeting");
  const e = [...g.s.events.values()][0]!;
  const zoomUrl = [...z.s.meetings.values()][0]!.join_url;
  assert.equal(e.location, zoomUrl);
  assert.equal(e.conferenceData, undefined, "no Meet link beside the Zoom one");
  assert.equal((await q(`select location from meetings where id = $1`, [r.meetingId]))[0].location.url, zoomUrl);

  await rpc("meeting_status", { p_id: r.meetingId, p_status: "canceled" });
  await sync(job("meeting_sync", `cancel:${r.meetingId}:1`, { meeting: r.meetingId, action: "cancel" }, ws), signal);
  assert.equal(z.s.meetings.size, 0, "the Zoom meeting is deleted with the event");
});

test("one sync per meeting at a time: a second waits its turn without using up a try", async () => {
  const { ws, users } = await team(1);
  await connect(ws, users[0]!, "google");
  const r = await booked(ws, await meetingType(ws, "one", users));
  await rpc("meeting_sync_lease", { p_meeting: r.meetingId, p_job: "someone-else", p_s: 60 });
  const g = fakeGoogle();
  await q(`delete from jobs where kind = 'meeting_sync' and payload->>'meeting' = $1`, [r.meetingId]);
  await meetingSync(rpc, { http: { fetcher: g.fetcher } })(job("meeting_sync", `create:${r.meetingId}`, { meeting: r.meetingId, action: "create" }, ws, 3), signal);
  assert.equal(g.s.events.size, 0);
  const again = await q(`select key, attempts, run_after > now() later from jobs where kind = 'meeting_sync' and payload->>'meeting' = $1`, [r.meetingId]);
  assert.deepEqual(again, [{ key: `create:${r.meetingId}`, attempts: 0, later: true }]);
});

test("push channels: made for the busy calendars and renewed a day before they end; a duplicate push queues one refresh", async () => {
  const { ws, users } = await team(1);
  const a = await connect(ws, users[0]!, "google");
  const g = fakeGoogle();
  const hook = "https://app.example.com/api/calendar/hook";
  await calendarWatch(rpc, { http: { fetcher: g.fetcher }, hook })(job("calendar_watch", a, { account: a }, ws), signal);
  const acc = (await q(`select channels, watch_due from calendar_accounts where id = $1`, [a]))[0];
  assert.deepEqual(Object.keys(acc.channels).sort(), ["me@acme.io", "team@acme.io"]);
  assert.ok(g.s.channels.every((c) => c.address === hook && c.token === channelToken(a)));
  const ends = Math.min(...Object.values(acc.channels as Record<string, { expires: number }>).map((c) => c.expires));
  assert.ok(Math.abs(acc.watch_due.getTime() - (ends - DAY)) < 1000);

  // Renewal: a channel ending within a day is replaced, and the old one stopped.
  const old = acc.channels["me@acme.io"];
  await rpc("calendar_channels_save", { p_account: a, p_channels: { ...acc.channels, "me@acme.io": { ...old, expires: Date.now() + H } }, p_watch_due: new Date(Date.now() - 1000).toISOString() });
  await rpc("calendars_due", {});
  assert.equal((await jobs("calendar_watch", `and key = '${a}' and status = 'queued'`)).length, 1);
  await calendarWatch(rpc, { http: { fetcher: g.fetcher }, hook })(job("calendar_watch", a, { account: a }, ws), signal);
  assert.deepEqual(g.s.stopped, [old.id]);
  const now = (await q(`select channels from calendar_accounts where id = $1`, [a]))[0].channels;
  assert.notEqual(now["me@acme.io"].id, old.id);

  // The same push delivered twice (and a stale channel's): one refresh waits.
  await q(`delete from jobs where kind = 'calendar_refresh'`);
  const push = (channel: string) =>
    handleHook(new Request(hook, { method: "POST", headers: { "x-goog-channel-id": channel, "x-goog-resource-state": "exists", "x-goog-channel-token": channelToken(a) } }), rpc);
  assert.equal((await push(now["me@acme.io"].id)).status, 200);
  assert.equal((await push(now["me@acme.io"].id)).status, 200);
  assert.equal((await push(old.id)).status, 200);
  const waiting = await jobs("calendar_refresh", `and key = '${a}'`);
  assert.equal(waiting.length, 1);

  // Without a public address (a local run), no channels: the refresh covers it, and watching waits 6 hours.
  const b = await connect(ws, users[0]!, "microsoft");
  await calendarWatch(rpc, { hook: null })(job("calendar_watch", b, { account: b }, ws), signal);
  const due = (await q(`select watch_due from calendar_accounts where id = $1`, [b]))[0].watch_due.getTime();
  assert.ok(due > Date.now() + 5 * H);
});

test("the fake calendar books end to end with no provider at all, and disconnecting removes it", async () => {
  const { ws, users } = await team(1);
  const a = (await rpc("calendar_connect", { p_ws: ws, p_user: users[0], p_provider: "fake", p_email: "rep@fake.io", p_sealed: sealToken(tok()), p_calendars: [{ id: "primary", name: "Work", primary: true }] })).data as string;
  const r = await booked(ws, await meetingType(ws, "one", users));
  await calendarRefresh(rpc)(job("calendar_refresh", a, { account: a }, ws), signal);
  await meetingSync(rpc)(job("meeting_sync", `create:${r.meetingId}`, { meeting: r.meetingId, action: "create" }, ws), signal);
  const m = (await q(`select events, location from meetings where id = $1`, [r.meetingId]))[0];
  assert.equal(m.events[users[0]!].provider, "fake");
  assert.match(m.location.url, /^https:\/\/meet\.example\//);
  await rpc("calendar_disconnect", { p_account: a });
  assert.equal((await q(`select count(*)::int n from calendar_lists where account_id = $1`, [a]))[0].n, 0);
});
