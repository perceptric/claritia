// offer() and book() on a real database (docs/meetings-scheduler.md 1.5, 1.6 and Part 3): only hosts whose calendar
// can be checked are offered, the live check and the round robin pick among those still free, and losing a race
// hands back fresh times. The worker's job for the calendar event is queued with the meeting.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";
import { book, offer, tokenHash } from "../../src/lib/meetings/server.ts";
import { at } from "../../src/lib/meetings/time.ts";
import { DEFAULT_AVAILABILITY, DEFAULT_SETTINGS, type Kind, type MeetingType } from "../../src/lib/meetings/types.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 8 });
const rpc = pgRpc(pool);
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

// Monday 2 November 2026, 06:00 in New York (after the clocks went back).
const NOW = at("2026-11-02", "06:00", "America/New_York");
const NY = (time: string, date = "2026-11-02") => at(date, time, "America/New_York");
const none = async () => new Set<string>();

async function team(n: number, opts: { calendar?: boolean[]; hours?: boolean[] } = {}) {
  const ws = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, 'Acme')`, [ws]);
  const users: string[] = [];
  for (let i = 0; i < n; i++) {
    const u = randomUUID();
    users.push(u);
    await q(`insert into auth.users (id, email) values ($1, $2)`, [u, `${u}@t.io`]);
    await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')`, [ws, u]);
    if (opts.calendar?.[i] !== false) {
      const acc = (await q(`insert into calendar_accounts (workspace_id, user_id, provider, account_email) values ($1, $2, 'fake', $3) returning id`, [ws, u, `${u}@t.io`]))[0].id;
      await q(`insert into calendar_lists (account_id, calendar_id, name, busy, write) values ($1, 'primary', 'Work', true, true)`, [acc]);
    }
    if (opts.hours?.[i] !== false) {
      const a = DEFAULT_AVAILABILITY("America/New_York");
      await q(`insert into availability (workspace_id, user_id, tz, weekly, overrides) values ($1, $2, $3, $4, $5)`, [ws, u, a.tz, a.weekly, JSON.stringify(a.overrides)]);
    }
  }
  return { ws, users };
}

async function meetingType(ws: string, kind: Kind, users: string[], settings: Partial<MeetingType["settings"]> = {}): Promise<MeetingType> {
  const hosts = users.map((u, i) => ({ user_id: u, weight: 1, tier: 0, ...(kind === "double" ? { pool: i === 0 ? ("b" as const) : ("a" as const) } : {}) }));
  const s = { ...DEFAULT_SETTINGS, notice: 0, window: 1, ...settings };
  const id = (await q(`insert into meeting_types (workspace_id, slug, name, kind, hosts, settings) values ($1, $2, 'Demo', $3, $4, $5) returning id`, [ws, `d-${randomUUID().slice(0, 6)}`, kind, JSON.stringify(hosts), s]))[0].id as string;
  return { id, workspace_id: ws, slug: "demo", name: "Demo", kind, hosts, settings: s, secret: false, active: true, owner_user_id: null, template_id: null, locked: [] };
}

const guest = (email = `${randomUUID().slice(0, 6)}@lead.io`) => ({ email, name: "Dana Lee", tz: "America/New_York" });

test("only hosts with a working calendar and hours are offered, and the screens learn why the rest are out", async () => {
  const { ws, users } = await team(4, { calendar: [true, false, true, true], hours: [true, true, false, true] });
  await q(`update calendar_accounts set status = 'reconnect' where user_id = $1`, [users[3]]);
  const t = await meetingType(ws, "round_robin", users);
  const o = await offer(rpc, { ws, type: t, length: 30, now: NOW });
  assert.ok(o.slots.length > 0 && o.slots.every((s) => s.hosts.join() === users[0]));
  assert.deepEqual(o.out.map((x) => x.why).sort(), ["no_calendar", "no_hours", "reconnect"]);
});

test("cached busy times and held meetings shape the offer; a booking queues its calendar event", async () => {
  const { ws, users } = await team(1);
  const acc = (await q(`select id from calendar_accounts where user_id = $1`, [users[0]]))[0].id;
  await q(`select busy_replace($1, 'primary', $2, $3, $4)`, [acc, new Date(NOW).toISOString(), new Date(NOW + 86_400_000).toISOString(), JSON.stringify([{ start: new Date(NY("09:00")).toISOString(), end: new Date(NY("10:00")).toISOString() }])]);
  const t = await meetingType(ws, "one", users);
  const o = await offer(rpc, { ws, type: t, length: 30, now: NOW });
  assert.equal(o.slots[0]!.start, NY("10:00"));
  const r = await book(rpc, { ws, type: t, length: 30, start: NY("10:00"), guest: guest(), source: "page", now: NOW, liveBusy: none });
  assert.ok(r.ok);
  const m = (await q(`select status, hosts, token_hash from meetings where id = $1`, [r.meetingId]))[0];
  assert.equal(m.status, "booked");
  assert.equal(m.token_hash, tokenHash(r.token), "only the hash of the guest's link is kept");
  assert.equal((await q(`select count(*)::int n from jobs where kind = 'meeting_sync' and payload->>'meeting' = $1`, [r.meetingId]))[0].n, 1);
  const again = await offer(rpc, { ws, type: t, length: 30, now: NOW });
  assert.ok(!again.slots.some((s) => s.start === NY("10:00")), "the booked time is gone");
});

test("a host busy on the live check is skipped, and the round robin picks among the others", async () => {
  const { ws, users } = await team(3);
  const t = await meetingType(ws, "round_robin", users);
  let busy = new Set<string>();
  const r = await book(rpc, {
    ws, type: t, length: 30, start: NY("11:00"), guest: guest(), source: "page", now: NOW,
    liveBusy: async (hosts) => (busy = new Set(hosts.slice(0, 2))),
  });
  assert.ok(r.ok);
  assert.equal(busy.size, 2);
  assert.equal(r.hosts.length, 1);
  assert.ok(!busy.has(r.hosts[0]!), "the host still free on the live check gets it");
  // Everyone busy live: the guest gets the other times back at once.
  const all = await book(rpc, { ws, type: t, length: 30, start: NY("12:00"), guest: guest(), source: "page", now: NOW, liveBusy: async (hosts) => new Set(hosts) });
  assert.ok(!all.ok && all.error === "slot_taken" && all.slots.length > 0 && !all.slots.some((s) => s.start === NY("12:00")));
});

test("racing guests on a one-person type: one meeting, the rest get fresh times", async () => {
  const { ws, users } = await team(1);
  const t = await meetingType(ws, "one", users);
  const results = await Promise.all(Array.from({ length: 5 }, () => book(rpc, { ws, type: t, length: 30, start: NY("13:00"), guest: guest(), source: "page", now: NOW, liveBusy: none })));
  assert.equal(results.filter((r) => r.ok).length, 1);
  for (const r of results.filter((x) => !x.ok)) assert.ok(!r.ok && (r.error === "slot_taken" || r.error === "not_offered") && r.slots.length > 0);
});

test("round robin spreads bookings across the team over many guests", async () => {
  const { ws, users } = await team(3);
  const t = await meetingType(ws, "round_robin", users, { window: 3 });
  const count: Record<string, number> = {};
  for (let i = 0; i < 12; i++) {
    const o = await offer(rpc, { ws, type: t, length: 30, now: NOW });
    const r = await book(rpc, { ws, type: t, length: 30, start: o.slots[0]!.start, guest: guest(), source: "page", now: NOW, liveBusy: none });
    assert.ok(r.ok);
    count[r.hosts[0]!] = (count[r.hosts[0]!] ?? 0) + 1;
  }
  assert.deepEqual(Object.values(count).sort(), [4, 4, 4]);
});

test("owner first offers the owner's times when they have any, and the pool's when they don't", async () => {
  const { ws, users } = await team(3);
  const t = await meetingType(ws, "owner_first", users);
  const mine = await offer(rpc, { ws, type: t, length: 30, now: NOW, owner: users[1] });
  assert.equal(mine.owner, users[1]);
  assert.ok(mine.slots.every((s) => s.hosts.join() === users[1]));
  await q(`update availability set weekly = '{"mon":[],"tue":[],"wed":[],"thu":[],"fri":[],"sat":[],"sun":[]}' where user_id = $1`, [users[1]]);
  const pool = await offer(rpc, { ws, type: t, length: 30, now: NOW, owner: users[1] });
  assert.equal(pool.owner, undefined);
  assert.ok(pool.slots.some((s) => s.hosts.length === 2));
  const r = await book(rpc, { ws, type: t, length: 30, start: pool.slots[0]!.start, guest: guest(), source: "form", owner: users[1], now: NOW, liveBusy: none });
  assert.ok(r.ok && r.hosts[0] !== users[1]);
});

test("a strict round robin shows only the next host's times", async () => {
  const { ws, users } = await team(2);
  const t = await meetingType(ws, "round_robin", users, { rrMode: "strict" });
  const first = await offer(rpc, { ws, type: t, length: 30, now: NOW });
  assert.ok(first.next && first.slots.every((s) => s.hosts.join() === first.next));
  const r = await book(rpc, { ws, type: t, length: 30, start: first.slots[0]!.start, guest: guest(), source: "page", now: NOW, liveBusy: none });
  assert.ok(r.ok && r.hosts[0] === first.next);
  const second = await offer(rpc, { ws, type: t, length: 30, now: NOW });
  assert.notEqual(second.next, first.next);
});

test("a time that isn't offered (wrong length, past notice) is refused before anything is written", async () => {
  const { ws, users } = await team(1);
  const t = await meetingType(ws, "one", users, { notice: 6 * 60 });
  const early = await book(rpc, { ws, type: t, length: 30, start: NY("09:00"), guest: guest(), source: "page", now: NOW, liveBusy: none });
  assert.ok(!early.ok && early.error === "not_offered");
  const odd = await book(rpc, { ws, type: t, length: 25, start: NY("13:00"), guest: guest(), source: "page", now: NOW, liveBusy: none });
  assert.ok(!odd.ok && odd.error === "not_offered");
  assert.equal((await q(`select count(*)::int n from meetings where workspace_id = $1`, [ws]))[0].n, 0);
});
