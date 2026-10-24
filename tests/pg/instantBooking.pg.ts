// Instant booking on form submit on a real database (docs/meetings-scheduler.md Part 2 and Part 3): a lead who
// matches gets times and a signed token in the submit's answer, worked out from the cache only and fast; a retried
// send gets the same token and queues book-later once; the owner hosts when free and the pool when not; a lost race
// hands back fresh times; two clicks on one fill make one meeting; Results counts booked and not booked.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";
import { bookForClaim, readBooking, timesForClaim, type Booking, type Claim } from "../../src/lib/forms/booking.ts";
import { WORK_EMAIL, type Schedule } from "../../src/lib/forms/schedule.ts";
import { checkForm, emptyForm } from "../../src/lib/forms/schema.ts";
import { acceptFill, type PublicForm } from "../../src/lib/forms/submit.ts";
import type { Rpc } from "../../src/lib/jobs.ts";
import { at } from "../../src/lib/meetings/time.ts";
import { DEFAULT_AVAILABILITY, DEFAULT_SETTINGS, type Kind } from "../../src/lib/meetings/types.ts";
import { ctxFor } from "../../worker-intel/jobs/imports.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";

const SECRET = "instant-booking-test-secret-0123456789";
const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 8 });
const rpc = pgRpc(pool);
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

// Monday 2 November 2026, 06:00 in New York.
const NOW = at("2026-11-02", "06:00", "America/New_York");
const none = async () => new Set<string>();
const live = () => none;

async function team(n: number) {
  const ws = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, 'Acme')`, [ws]);
  const users: string[] = [];
  for (let i = 0; i < n; i++) {
    const u = randomUUID();
    users.push(u);
    await q(`insert into auth.users (id, email) values ($1, $2)`, [u, `${u}@t.io`]);
    await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, u]);
    const acc = (await q(`insert into calendar_accounts (workspace_id, user_id, provider, account_email) values ($1, $2, 'fake', $3) returning id`, [ws, u, `${u}@t.io`]))[0].id;
    await q(`insert into calendar_lists (account_id, calendar_id, name, busy, write) values ($1, 'primary', 'Work', true, true)`, [acc]);
    const a = DEFAULT_AVAILABILITY("America/New_York");
    await q(`insert into availability (workspace_id, user_id, tz, weekly, overrides) values ($1, $2, $3, $4, $5)`, [ws, u, a.tz, a.weekly, JSON.stringify(a.overrides)]);
    await q(`insert into booking_profiles (workspace_id, user_id, slug, name, photo_url) values ($1, $2, $3, $4, $5)`, [ws, u, `p${i}-${u.slice(0, 6)}`, `Host ${i}`, `https://img.acme.com/${i}.png`]);
  }
  return { ws, users };
}

async function meetingType(ws: string, kind: Kind, users: string[], settings: Partial<typeof DEFAULT_SETTINGS> = {}) {
  const hosts = users.map((u) => ({ user_id: u, weight: 1, tier: 0 }));
  const s = { ...DEFAULT_SETTINGS, notice: 0, window: 1, ...settings };
  return (await q(`insert into meeting_types (workspace_id, slug, name, kind, hosts, settings) values ($1, $2, 'Demo', $3, $4, $5) returning id`, [ws, `d-${randomUUID().slice(0, 6)}`, kind, JSON.stringify(hosts), s]))[0].id as string;
}

/** A live form that books with Claritia calendar: email and an optional team size. */
async function liveForm(ws: string, user: string, schedule: Partial<Schedule>): Promise<PublicForm> {
  const raw = {
    ...emptyForm(),
    steps: [
      {
        id: "s1",
        fields: [
          { id: "em", key: "email", type: "email", label: "Email", required: true },
          { id: "fn", key: "first_name", type: "text", label: "First name", required: false },
          { id: "size", key: "q.size", type: "number", label: "Team size", required: false },
        ],
      },
    ],
    spam: { minSeconds: 0, turnstile: false },
    after: { end: { kind: "message", title: "Thanks" }, schedule: { tool: "claritia", url: "", perOwner: false, ...schedule } },
  };
  const r = checkForm(raw);
  if ("errors" in r) throw new Error(r.errors.join(" "));
  const id = (await q(`insert into forms (workspace_id, name, draft) values ($1, 'Demo', $2) returning id`, [ws, r.form]))[0].id as string;
  await q(`select form_publish($1, $2, $3)`, [id, user, r.form]);
  return (await q(`select form_public($1) as f`, [id]))[0].f as PublicForm;
}

const key = () => `k${randomUUID().replace(/-/g, "")}`.slice(0, 32);

async function fill(f: PublicForm, answers: Record<string, unknown>, o: { key?: string; rpc?: Rpc } = {}) {
  const r = await acceptFill(o.rpc ?? rpc, f, { v: 1, version: f.version, key: o.key ?? key(), answers, ms: 5000, trap: "" }, await ctxFor(pool, f.workspace_id), { secret: SECRET, now: NOW });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body as { id: string; schedule: null; booking?: Booking };
}

const claimOf = (b: Booking) => {
  const c = readBooking(b.token, SECRET);
  assert.ok(c && c !== "expired");
  return c as Claim;
};

test("a lead who matches the rules sees times, with the host, from the cache only and well under a second", async () => {
  const { ws, users } = await team(1);
  const type = await meetingType(ws, "one", users);
  const f = await liveForm(ws, users[0]!, { meetingTypeId: type, who: "match", rules: [{ field: "size", op: "gte", value: "50" }] });
  const plain = await liveForm(ws, users[0]!, { meetingTypeId: type, who: "match", rules: [{ field: WORK_EMAIL, op: "is_not" }] });
  // Warm both paths, then time the same fill with and without the calendar.
  await fill(f, { em: "warm@acme.com", size: "100" });
  await fill(plain, { em: "warm2@acme.com" });
  const calls: string[] = [];
  const counted: Rpc = (fn, args) => (calls.push(fn), rpc(fn, args));
  const median = (xs: number[]) => xs.sort((x, y) => x - y)[xs.length >> 1]!;
  const timed = async (go: () => Promise<unknown>) => {
    const t0 = performance.now();
    await go();
    return performance.now() - t0;
  };
  const without: number[] = [];
  const withTimes: number[] = [];
  for (let i = 0; i < 7; i++) {
    without.push(await timed(() => fill(plain, { em: `p${i}@acme.com` })));
    withTimes.push(await timed(() => fill(f, { em: `t${i}@acme.com`, size: "120" })));
  }
  const added = median(withTimes) - median(without);
  console.log(`# instant booking adds ${Math.round(added)} ms to the submit (median ${Math.round(median(without))} ms without, ${Math.round(median(withTimes))} ms with)`);
  assert.ok(Math.max(...withTimes) < 1000, "every submit with times under a second");
  assert.ok(added < 300, `the times took ${Math.round(added)} ms`);
  const small = await fill(plain, { em: "bo@acme.com" });
  const big = await fill(f, { em: "ana@acme.com", size: "120" }, { rpc: counted });
  assert.equal(small.booking, undefined, "the rule says no: the message");
  assert.ok(big.booking && big.booking.slots.length > 0);
  assert.deepEqual(big.booking.lengths, [30]);
  assert.deepEqual(big.booking.host, { name: "Host 0", photo: "https://img.acme.com/0.png" });
  // Only the database on this path: no calendar provider, no live check.
  assert.deepEqual([...new Set(calls)].sort(), ["form_booking_ctx", "form_booking_shown", "form_submit", "meeting_inputs", "router_live"]);
  const no = await fill(f, { em: "cy@acme.com", size: "10" });
  assert.equal(no.booking, undefined, "too small: the message");
  const skipped = await fill(f, { em: "di@acme.com" });
  assert.equal(skipped.booking, undefined, "a skipped answer never books");
  const shown = (await q(`select booking_shown_at from submissions where id = any($1::uuid[])`, [[no.id, skipped.id]])).filter((r) => r.booking_shown_at);
  assert.equal(shown.length, 0);
});

test("a send retried with the same key gets the same token, and book later is queued once, 10 minutes out", async () => {
  const { ws, users } = await team(1);
  const type = await meetingType(ws, "one", users);
  const f = await liveForm(ws, users[0]!, { meetingTypeId: type });
  const k = key();
  const all = await Promise.all([1, 2, 3].map(() => fill(f, { em: "ana@acme.com" }, { key: k })));
  const again = await fill(f, { em: "ana@acme.com" }, { key: k });
  const tokens = new Set([...all, again].map((r) => r.booking?.token));
  assert.equal(tokens.size, 1);
  assert.ok([...tokens][0]);
  const sid = again.id;
  const jobs = await q(`select payload, extract(epoch from run_after - now())::int s from jobs where kind = 'meeting_book_later' and payload->>'submission' = $1`, [sid]);
  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0].payload, { submission: sid, type });
  assert.ok(jobs[0].s > 590 && jobs[0].s <= 600);
  assert.equal((await q(`select count(*)::int n from contact_events where kind = 'meeting.offered' and data->>'submission_id' = $1`, [sid]))[0].n, 1);
  // The token stands for this fill, this type and its owner (none here).
  assert.deepEqual(claimOf(again.booking!), { ...claimOf(again.booking!), submission: sid, type, owner: null });
});

test("no calendar to check, or no type: the lead gets the message and nothing is queued", async () => {
  const { ws, users } = await team(1);
  const type = await meetingType(ws, "one", users);
  await q(`update calendar_accounts set status = 'reconnect' where workspace_id = $1`, [ws]);
  const f = await liveForm(ws, users[0]!, { meetingTypeId: type });
  const r = await fill(f, { em: "ana@acme.com" });
  assert.equal(r.booking, undefined);
  const gone = await liveForm(ws, users[0]!, { meetingTypeId: randomUUID() });
  assert.equal((await fill(gone, { em: "bo@acme.com" })).booking, undefined);
  assert.equal((await q(`select count(*)::int n from jobs where kind = 'meeting_book_later' and workspace_id = $1`, [ws]))[0].n, 0);
});

test("owner first: the owner gets the meeting when free, the pool when not", async () => {
  const { ws, users } = await team(3);
  const type = await meetingType(ws, "owner_first", users);
  const f = await liveForm(ws, users[0]!, { meetingTypeId: type });
  const first = await fill(f, { em: "ana@acme.com" });
  const cid = (await q(`select contact_id from submissions where id = $1`, [first.id]))[0].contact_id;
  await q(`update contacts set owner_user_id = $1 where id = $2`, [users[1], cid]);
  const own = await fill(f, { em: "ana@acme.com" });
  const claim = claimOf(own.booking!);
  assert.equal(claim.owner, users[1]);
  assert.equal(own.booking!.host?.name, "Host 1");
  const r = await bookForClaim(rpc, own.booking!.token, claim, { start: own.booking!.slots[0]!, tz: "Europe/Paris", now: NOW, base: "https://app.tryclaritia.com", liveBusyFor: live });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const m = (await q(`select hosts, source, submission_id, contact_id, guest_email, guest_tz from meetings where submission_id = $1`, [own.id]))[0];
  assert.deepEqual(m, { hosts: [users[1]], source: "form", submission_id: own.id, contact_id: cid, guest_email: "ana@acme.com", guest_tz: "Europe/Paris" });
  assert.equal(r.body.booked?.host?.name, "Host 1");
  assert.match(r.body.booked?.manage ?? "", /^https:\/\/.+\/book\/m\/[A-Za-z0-9_-]+$/);
  // The owner has no hours left: the pool's times, and the pool hosts it.
  await q(`update availability set weekly = '{"mon":[],"tue":[],"wed":[],"thu":[],"fri":[],"sat":[],"sun":[]}' where user_id = $1`, [users[1]]);
  const pool2 = await fill(f, { em: "ana@acme.com" });
  assert.equal(claimOf(pool2.booking!).owner, users[1]);
  assert.equal(pool2.booking!.host, undefined, "several hosts: no one face");
  const r2 = await bookForClaim(rpc, pool2.booking!.token, claimOf(pool2.booking!), { start: pool2.booking!.slots[0]!, now: NOW, liveBusyFor: live });
  assert.equal(r2.status, 200);
  const m2 = (await q(`select hosts from meetings where submission_id = $1`, [pool2.id]))[0];
  assert.notEqual(m2.hosts[0], users[1]);
});

test("a lost race returns fresh times; two clicks on one fill make one meeting", async () => {
  const { ws, users } = await team(1);
  const type = await meetingType(ws, "one", users);
  const f = await liveForm(ws, users[0]!, { meetingTypeId: type });
  const a = (await fill(f, { em: "ana@acme.com" })).booking!;
  const b = (await fill(f, { em: "bo@acme.com" })).booking!;
  const start = a.slots[2]!;
  assert.ok(b.slots.includes(start));
  const [ra, rb] = await Promise.all([bookForClaim(rpc, a.token, claimOf(a), { start, now: NOW, liveBusyFor: live }), bookForClaim(rpc, b.token, claimOf(b), { start, now: NOW, liveBusyFor: live })]);
  const lost = [ra, rb].find((r) => r.status === 409)!;
  assert.ok(lost, "one of them loses");
  assert.equal([ra, rb].filter((r) => r.status === 200).length, 1);
  assert.ok(lost.body.taken && lost.body.booking!.slots.length > 0 && !lost.body.booking!.slots.includes(start));
  assert.equal(lost.body.booking!.token, (lost === ra ? a : b).token, "the same token books from the fresh times");
  // The live check says busy: fresh times, no meeting.
  const c = (await fill(f, { em: "cy@acme.com" })).booking!;
  const busy = await bookForClaim(rpc, c.token, claimOf(c), { start: c.slots[0]!, now: NOW, liveBusyFor: () => async (hosts) => new Set(hosts) });
  assert.equal(busy.status, 409);
  assert.ok(busy.body.taken && !busy.body.booking!.slots.includes(c.slots[0]!));
  // Two clicks at once on different times: one meeting, and both answers show it.
  const d = (await fill(f, { em: "di@acme.com" })).booking!;
  const two = await Promise.all([d.slots[0]!, d.slots[d.slots.length - 1]!].map((start) => bookForClaim(rpc, d.token, claimOf(d), { start, now: NOW, liveBusyFor: live })));
  assert.deepEqual(two.map((r) => r.status), [200, 200]);
  assert.equal(two[0]!.body.booked!.start, two[1]!.body.booked!.start);
  assert.equal((await q(`select count(*)::int n from meetings where submission_id = $1 and status = 'booked'`, [claimOf(d).submission]))[0].n, 1);
  // Reopened later (a thank-you page): the booked meeting, not times.
  const reopen = await timesForClaim(rpc, d.token, claimOf(d), { now: NOW });
  assert.equal(reopen.body.booked?.start, two[0]!.body.booked!.start);
});

test("another length gives that length's times; a token for a type that's gone is refused", async () => {
  const { ws, users } = await team(1);
  const type = await meetingType(ws, "one", users, { lengths: [15, 60] });
  const f = await liveForm(ws, users[0]!, { meetingTypeId: type });
  const b = (await fill(f, { em: "ana@acme.com" })).booking!;
  assert.deepEqual([b.lengths, b.length], [[15, 60], 15]);
  const long = await timesForClaim(rpc, b.token, claimOf(b), { length: 60, now: NOW });
  assert.equal(long.body.booking?.length, 60);
  assert.ok(long.body.booking!.slots.length < b.slots.length);
  await q(`update meeting_types set active = false where id = $1`, [type]);
  assert.equal((await bookForClaim(rpc, b.token, claimOf(b), { start: b.slots[0]!, now: NOW, liveBusyFor: live })).status, 410);
});

test("Results: booked, not booked once, and the booking rate", async () => {
  const { ws, users } = await team(1);
  const type = await meetingType(ws, "one", users);
  const f = await liveForm(ws, users[0]!, { meetingTypeId: type });
  const a = await fill(f, { em: "ana@acme.com" });
  const b = await fill(f, { em: "bo@acme.com" });
  await fill(f, { em: "cy@acme.com" });
  assert.equal((await bookForClaim(rpc, a.booking!.token, claimOf(a.booking!), { start: a.booking!.slots[0]!, now: NOW, liveBusyFor: live })).status, 200);
  const mark = async (id: string) => (await q(`select submission_not_booked($1) as r`, [id]))[0].r as boolean;
  assert.equal(await mark(a.id), false, "it booked");
  assert.equal(await mark(b.id), true);
  assert.equal(await mark(b.id), false, "marked once");
  assert.equal((await q(`select count(*)::int n from contact_events where kind = 'meeting.not_booked' and data->>'submission_id' = $1`, [b.id]))[0].n, 1);
  const stats = (await q(`select form_booking_stats($1) as s`, [f.id]))[0].s;
  assert.deepEqual(stats, { shown: 3, booked: 1, not_booked: 1 });
});

test("with a live router, a fill is routed in the send and the routed rep's times show first, even when they aren't a host", async () => {
  const { ws, users } = await team(2);
  // The meeting type's only host is rep 0; the router gives every lead to rep 1.
  const type = await meetingType(ws, "owner_first", [users[0]!]);
  const body = {
    ...(await import("../../src/lib/router/types.ts")).emptyBody(),
    account: { on: false, oppFirst: true, setCompanyOwner: false },
    queues: [{ id: "q", name: "Rep 1", method: "rr", strict: false, hoursOnly: false, members: [{ user: users[1]!, weight: 1 }] }],
    fallback: { kind: "queue", id: "q" },
  };
  await q(`select router_publish($1, $2, 'test', null)`, [ws, body]);
  const f = await liveForm(ws, users[0]!, { meetingTypeId: type });
  const t0 = performance.now();
  const out = await fill(f, { em: "routed@acme.com" });
  const ms = performance.now() - t0;
  assert.ok(ms < 1000, `the send took ${Math.round(ms)} ms`);
  const c = (await q(`select owner_user_id from contacts where id = (select contact_id from submissions where id = $1)`, [out.id]))[0];
  assert.equal(c.owner_user_id, users[1], "the router set the owner in the send");
  assert.equal((await q(`select reason, key from router_runs where workspace_id = $1`, [ws]))[0].key, `form:${out.id}`);
  assert.ok(out.booking, "times show");
  assert.deepEqual(out.booking!.host, { name: "Host 1", photo: "https://img.acme.com/1.png" }, "the routed rep's times, though only rep 0 is a host");
  // The same send again (a browser retry) doesn't route twice.
  const k = key();
  await fill(f, { em: "routed@acme.com" }, { key: k });
  await fill(f, { em: "routed@acme.com" }, { key: k });
  assert.equal((await q(`select count(*)::int n from router_runs where workspace_id = $1`, [ws]))[0].n, 2);
});
