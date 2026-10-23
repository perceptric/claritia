// Booking without signing in, on a real database (docs/meetings-scheduler.md 1.6 to 1.8b and Part 3): pages, races,
// reschedule and cancel by the guest's link, single-use and one-off links, group seats, polls and paid types with a
// fake Stripe whose events arrive late, out of order and twice.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";
import { checkGuest } from "../../src/lib/meetings/guest.ts";
import { handlePayEvent, startCheckout, type PayEvent, type PayStripe } from "../../src/lib/meetings/pay.ts";
import { bookOneOff, bookType, cancelByGuest, checkLink, guestSlots, loadLink, loadMeeting, loadTarget, oneOffSlots, pollBookWinner, pollVote, preferredSlots, reschedule, rescheduleSlots } from "../../src/lib/meetings/public.ts";
import { at } from "../../src/lib/meetings/time.ts";
import { DEFAULT_AVAILABILITY, DEFAULT_SETTINGS, type Kind, type MeetingType } from "../../src/lib/meetings/types.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 10 });
const rpc = pgRpc(pool);
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

// Monday 2 November 2026, 06:00 in New York.
const NOW = at("2026-11-02", "06:00", "America/New_York");
const NY = (time: string, date = "2026-11-02") => at(date, time, "America/New_York");
const none = async () => new Set<string>();
const guest = (email = `${randomUUID().slice(0, 8)}@lead.io`) => ({ email, name: "Dana Lee", tz: "America/New_York", answers: {} });

async function team(n: number) {
  const ws = randomUUID();
  const slug = `acme-${ws.slice(0, 6)}`;
  await q(`insert into workspaces (id, name, booking_slug) values ($1, 'Acme', $2)`, [ws, slug]);
  const users: string[] = [];
  for (let i = 0; i < n; i++) {
    const u = randomUUID();
    users.push(u);
    await q(`insert into auth.users (id, email) values ($1, $2)`, [u, `${u}@t.io`]);
    await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')`, [ws, u]);
    const acc = (await q(`insert into calendar_accounts (workspace_id, user_id, provider, account_email) values ($1, $2, 'fake', $3) returning id`, [ws, u, `${u}@t.io`]))[0].id;
    await q(`insert into calendar_lists (account_id, calendar_id, name, busy, write) values ($1, 'primary', 'Work', true, true)`, [acc]);
    const a = DEFAULT_AVAILABILITY("America/New_York");
    await q(`insert into availability (workspace_id, user_id, tz, weekly, overrides) values ($1, $2, $3, $4, $5)`, [ws, u, a.tz, a.weekly, JSON.stringify(a.overrides)]);
    await q(`insert into booking_profiles (workspace_id, user_id, slug, name, headline) values ($1, $2, $3, $4, 'Sales')`, [ws, u, `person-${i}`, `Person ${i}`]);
  }
  return { ws, slug, users };
}

async function meetingType(ws: string, kind: Kind, users: string[], settings: Partial<MeetingType["settings"]> = {}, extra: { secret?: boolean; owner?: string; slug?: string; active?: boolean } = {}): Promise<MeetingType> {
  const hosts = users.map((u, i) => ({ user_id: u, weight: 1, tier: 0, ...(kind === "double" ? { pool: i === 0 ? ("b" as const) : ("a" as const) } : {}) }));
  const s = { ...DEFAULT_SETTINGS, notice: 0, window: 1, ...settings };
  const slug = extra.slug ?? `d-${randomUUID().slice(0, 6)}`;
  const id = (await q(`insert into meeting_types (workspace_id, slug, name, kind, hosts, settings, secret, owner_user_id, active) values ($1, $2, 'Demo', $3, $4, $5, $6, $7, $8) returning id`, [ws, slug, kind, JSON.stringify(hosts), s, extra.secret ?? false, extra.owner ?? null, extra.active ?? true]))[0].id as string;
  return { id, workspace_id: ws, slug, name: "Demo", kind, hosts, settings: s, secret: extra.secret ?? false, active: true, owner_user_id: extra.owner ?? null, template_id: null, locked: [] };
}

const syncJobs = async (meeting: string, action: string) => (await q(`select count(*)::int n from jobs where kind = 'meeting_sync' and payload->>'meeting' = $1 and payload->>'action' = $2`, [meeting, action]))[0].n as number;

test("pages: a type first, then a person; secret types only by their own link; team and personal lists", async () => {
  const { ws, slug, users } = await team(2);
  const teamType = await meetingType(ws, "round_robin", users, {}, { slug: "intro" });
  await meetingType(ws, "one", [users[0]!], {}, { slug: "hidden", secret: true, owner: users[0] });
  await meetingType(ws, "one", [users[0]!], {}, { slug: "sam-30", owner: users[0] });
  await meetingType(ws, "one", [users[1]!], {}, { slug: "off", active: false });
  const teamPage = await loadTarget(rpc, slug, null);
  assert.deepEqual(teamPage!.types.map((t) => t.slug), ["intro"]);
  const typePage = await loadTarget(rpc, slug, "intro");
  assert.equal(typePage!.type!.id, teamType.id);
  assert.equal(typePage!.profiles.length, 2);
  const person = await loadTarget(rpc, slug, "person-0");
  assert.equal(person!.profile!.name, "Person 0");
  assert.deepEqual(person!.types.map((t) => t.slug).sort(), ["sam-30"]);
  assert.equal((await loadTarget(rpc, slug, "hidden"))!.type!.slug, "hidden", "a secret type opens by its own address");
  assert.equal(await loadTarget(rpc, slug, "off"), null, "an inactive type isn't there");
  assert.equal(await loadTarget(rpc, slug, "nobody"), null);
  assert.equal(await loadTarget(rpc, "no-such-team", null), null);
});

test("two guests race for one time on the page: one meeting; the other hears it was taken, with fresh times", async () => {
  const { ws, users } = await team(1);
  const t = await meetingType(ws, "one", users);
  const results = await Promise.all(
    Array.from({ length: 4 }, () => bookType(rpc, { ws, type: t, length: 30, start: NY("10:00"), guest: guest(), source: "page", payReady: false, liveBusy: none, now: NOW })),
  );
  assert.equal(results.filter((r) => r.ok).length, 1);
  for (const r of results) if (!r.ok) {
    assert.ok(r.error === "slot_taken" || r.error === "not_offered");
    assert.ok(r.slots.length > 0 && !r.slots.some((s) => s.start === NY("10:00")));
  }
  assert.equal((await q(`select count(*)::int n from meetings where type_id = $1 and status = 'booked'`, [t.id]))[0].n, 1);
});

test("a booking link that names a host shows and books that host first, and falls back to the team", async () => {
  const { ws, users } = await team(2);
  const t = await meetingType(ws, "round_robin", users);
  const profiles = (await loadTarget(rpc, (await q(`select booking_slug from workspaces where id = $1`, [ws]))[0].booking_slug, t.slug))!.profiles;
  // users[1] has the morning off.
  await q(`update availability set overrides = $2 where user_id = $1`, [users[1], JSON.stringify([{ date: "2026-11-02", ranges: [["13:00", "17:00"]] }])]);
  const mine = await preferredSlots(rpc, { ws, type: t, length: 30, host: users[1], profiles, now: NOW });
  assert.equal(mine[0]!.start, NY("13:00"), "only the named host's times");
  const r = await bookType(rpc, { ws, type: t, length: 30, start: NY("13:00"), guest: guest(), source: "page", prefer: { host: "person-1", profiles }, payReady: false, liveBusy: none, now: NOW });
  assert.ok(r.ok && r.hosts[0] === users[1], "the named host gets it (by page slug too)");
  const early = await bookType(rpc, { ws, type: t, length: 30, start: NY("09:00"), guest: guest(), source: "page", prefer: { host: users[1]!, profiles }, payReady: false, liveBusy: none, now: NOW });
  assert.ok(early.ok && early.hosts[0] === users[0], "a time only the team has still books");
});

test("a booking lands on the contact the CRM already has", async () => {
  const { ws, users } = await team(1);
  const contact = (await q(`insert into contacts (workspace_id, email, email_clean) values ($1, 'Dana@Lead.io', 'dana@lead.io') returning id`, [ws]))[0].id;
  const t = await meetingType(ws, "one", users);
  const r = await bookType(rpc, { ws, type: t, length: 30, start: NY("09:00"), guest: guest("dana@lead.io"), source: "page", payReady: false, liveBusy: none, now: NOW });
  assert.ok(r.ok);
  assert.equal((await q(`select contact_id from meetings where id = $1`, [r.meetingId]))[0].contact_id, contact);
});

test("reschedule: into a time someone just took is refused and nothing moves; a free time moves it and queues the calendar move", async () => {
  const { ws, users } = await team(1);
  const t = await meetingType(ws, "one", users);
  const mine = await bookType(rpc, { ws, type: t, length: 30, start: NY("09:00"), guest: guest(), source: "page", payReady: false, liveBusy: none, now: NOW });
  assert.ok(mine.ok);
  const view = (await loadMeeting(rpc, { token: mine.token }))!;
  const offered = await rescheduleSlots(rpc, view, NOW);
  assert.ok(offered.some((s) => s.start === NY("09:30")), "right next to where it is now is offered (the meeting leaves itself out)");
  // Another guest takes 11:00 after the page showed it.
  const other = await bookType(rpc, { ws, type: t, length: 30, start: NY("11:00"), guest: guest(), source: "page", payReady: false, liveBusy: none, now: NOW });
  assert.ok(other.ok);
  const lost = await reschedule(rpc, { view, start: NY("11:00"), liveBusy: none, now: NOW });
  assert.ok(!lost.ok && (lost.error === "not_offered" || lost.error === "slot_taken") && lost.slots.length > 0 && !lost.slots.some((s) => s.start === NY("11:00")));
  assert.equal(new Date((await q(`select start_at from meetings where id = $1`, [mine.meetingId]))[0].start_at).getTime(), NY("09:00"));
  // Busy on the live check: refused too.
  const live = await reschedule(rpc, { view, start: NY("13:00"), liveBusy: async (h) => new Set(h), now: NOW });
  assert.ok(!live.ok && live.error === "slot_taken");
  const moved = await reschedule(rpc, { view, start: NY("09:30"), liveBusy: none, now: NOW });
  assert.ok(moved.ok);
  assert.equal(new Date((await q(`select start_at from meetings where id = $1`, [mine.meetingId]))[0].start_at).getTime(), NY("09:30"));
  assert.equal(await syncJobs(mine.meetingId, "move"), 1);
});

test("reschedule onto part of its own old time: the meeting's own calendar event doesn't count as busy, other events still do", async () => {
  const { ws, users } = await team(1);
  const t = await meetingType(ws, "one", users, { lengths: [60] });
  const r = await bookType(rpc, { ws, type: t, length: 60, start: NY("09:00"), guest: guest(), source: "page", payReady: false, liveBusy: none, now: NOW });
  assert.ok(r.ok);
  // The calendar sync brings the meeting's own event back as busy, merged with a call right after it.
  const acc = (await q(`select id from calendar_accounts where user_id = $1`, [users[0]]))[0].id;
  await q(`insert into busy_blocks (account_id, calendar_id, start_at, end_at) values ($1, 'primary', $2, $3)`, [acc, new Date(NY("09:00")).toISOString(), new Date(NY("11:00")).toISOString()]);
  const view = (await loadMeeting(rpc, { token: r.token }))!;
  const offered = (await rescheduleSlots(rpc, view, NOW)).map((s) => s.start);
  assert.ok(offered.includes(NY("11:00")), "right after the call");
  assert.ok(!offered.includes(NY("09:30")), "the call from 10:00 to 11:00 is still busy");
  await q(`update busy_blocks set end_at = $2 where account_id = $1`, [acc, new Date(NY("10:00")).toISOString()]);
  assert.ok((await rescheduleSlots(rpc, view, NOW)).some((s) => s.start === NY("09:30")), "half an hour later, over its own old time");
  // The providers also report the old event live; only the part outside the old time is asked about.
  const asked: [number, number][] = [];
  const live = async (h: string[], from: number, to: number) => (asked.push([from, to]), new Set(from < NY("10:00") && to > NY("09:00") ? h : []));
  const moved = await reschedule(rpc, { view, start: NY("09:30"), liveBusy: live, now: NOW });
  assert.ok(moved.ok, "moved over its own old time");
  assert.deepEqual(asked, [[NY("10:00"), NY("10:30")]]);
  assert.equal(new Date((await q(`select start_at from meetings where id = $1`, [r.meetingId]))[0].start_at).getTime(), NY("09:30"));
});

test("reschedule into the pool picks someone free when the host isn't; same-host types keep the host", async () => {
  const { ws, users } = await team(2);
  const t = await meetingType(ws, "round_robin", users, { reschedule: "pool" });
  const r = await bookType(rpc, { ws, type: t, length: 30, start: NY("09:00"), guest: guest(), source: "page", payReady: false, liveBusy: none, now: NOW });
  assert.ok(r.ok);
  const host = r.hosts[0]!;
  const other = users.find((u) => u !== host)!;
  const view = (await loadMeeting(rpc, { token: r.token }))!;
  const moved = await reschedule(rpc, { view, start: NY("14:00"), liveBusy: async () => new Set([host]), now: NOW });
  assert.ok(moved.ok && moved.hosts[0] === other);
  const same = await meetingType(ws, "round_robin", users, { reschedule: "same_host" });
  const r2 = await bookType(rpc, { ws, type: same, length: 30, start: NY("15:00"), guest: guest(), source: "page", payReady: false, liveBusy: none, now: NOW });
  assert.ok(r2.ok);
  const v2 = (await loadMeeting(rpc, { token: r2.token }))!;
  const stuck = await reschedule(rpc, { view: v2, start: NY("16:00"), liveBusy: async () => new Set([r2.hosts[0]!]), now: NOW });
  assert.ok(!stuck.ok && stuck.error === "slot_taken");
});

test("the guest cancels with a reason: the calendar cancel is queued once, and a second cancel is refused", async () => {
  const { ws, users } = await team(1);
  const t = await meetingType(ws, "one", users);
  const r = await bookType(rpc, { ws, type: t, length: 30, start: NY("10:00"), guest: guest(), source: "page", payReady: false, liveBusy: none, now: NOW });
  assert.ok(r.ok);
  const view = (await loadMeeting(rpc, { token: r.token }))!;
  assert.deepEqual(await cancelByGuest(rpc, { view, reason: "Found a time with the team", now: NOW }), { ok: true });
  const m = (await q(`select status, cancel_reason from meetings where id = $1`, [r.meetingId]))[0];
  assert.equal(m.status, "canceled");
  assert.equal(m.cancel_reason, "Found a time with the team");
  assert.equal(await syncJobs(r.meetingId, "cancel"), 1);
  const again = await cancelByGuest(rpc, { view: (await loadMeeting(rpc, { token: r.token }))!, now: NOW });
  assert.deepEqual(again, { ok: false, error: "not_cancelable" });
  assert.equal(await loadMeeting(rpc, { token: "x".repeat(32) }), null, "a wrong token finds nothing");
});

test("a single-use link opened twice: the first books, the second is told it's used", async () => {
  const { ws, users } = await team(1);
  const t = await meetingType(ws, "one", users, {}, { secret: true });
  const made = checkLink({ kind: "single_use" }, { owner: users[0]!, type: t, now: NOW });
  assert.ok("row" in made);
  await q(`insert into meeting_links (workspace_id, kind, type_id, owner_user_id, token_hash) values ($1, 'single_use', $2, $3, $4)`, [ws, t.id, users[0], made.row.token_hash]);
  const view = (await loadLink(rpc, { token: made.token }))!;
  assert.equal(view.link.kind, "single_use");
  const [a, b] = await Promise.all([
    bookType(rpc, { ws, type: view.type!, length: 30, start: NY("09:00"), guest: guest(), source: "page", linkId: view.link.id, payReady: false, liveBusy: none, now: NOW }),
    bookType(rpc, { ws, type: view.type!, length: 30, start: NY("13:00"), guest: guest(), source: "page", linkId: view.link.id, payReady: false, liveBusy: none, now: NOW }),
  ]);
  assert.equal([a, b].filter((r) => r.ok).length, 1, "two tabs at once still book once");
  assert.ok([a, b].some((r) => !r.ok && r.error === "link_used"));
  assert.equal((await loadLink(rpc, { token: made.token }))!.link.used, true);
});

test("a one-off link offers only its times (even outside working hours), books once, then closes", async () => {
  const { ws, users } = await team(1);
  const made = checkLink({ kind: "one_off", offered: [{ start: NY("07:00") }, { start: NY("18:00") }], length: 45, location: { kind: "zoom" } }, { owner: users[0]!, type: null, now: NOW });
  assert.ok("row" in made);
  await q(`insert into meeting_links (workspace_id, kind, owner_user_id, offered, length_min, location, token_hash) values ($1, 'one_off', $2, $3, $4, $5, $6)`, [ws, users[0], JSON.stringify(made.row.offered), 45, made.row.location, made.row.token_hash]);
  const view = (await loadLink(rpc, { token: made.token }))!;
  assert.deepEqual((await oneOffSlots(rpc, view, NOW)).map((s) => s.start), [NY("07:00"), NY("18:00")]);
  const odd = await bookOneOff(rpc, { view, start: NY("09:00"), guest: guest(), liveBusy: none, now: NOW });
  assert.ok(!odd.ok && odd.error === "not_offered");
  const live = await bookOneOff(rpc, { view, start: NY("07:00"), guest: guest(), liveBusy: async (h) => new Set(h), now: NOW });
  assert.ok(!live.ok && live.error === "slot_taken" && live.slots.map((s) => s.start).join() === String(NY("18:00")));
  const ok = await bookOneOff(rpc, { view, start: NY("18:00"), guest: guest(), liveBusy: none, now: NOW });
  assert.ok(ok.ok && ok.end - ok.start === 45 * 60_000);
  const m = (await q(`select source, location from meetings where id = $1`, [ok.meetingId]))[0];
  assert.equal(m.source, "one_off");
  assert.deepEqual(m.location, { kind: "zoom" });
  assert.equal(await syncJobs(ok.meetingId, "create"), 1);
  const second = await bookOneOff(rpc, { view: (await loadLink(rpc, { token: made.token }))!, start: NY("07:00"), guest: guest(), liveBusy: none, now: NOW });
  assert.ok(!second.ok && second.error === "link_used");
  // A stale page that still thinks the link is open is stopped by meeting_book.
  const stale = await bookOneOff(rpc, { view, start: NY("07:00"), guest: guest(), liveBusy: none, now: NOW });
  assert.ok(!stale.ok && stale.error === "link_used");
});

test("group seats: the page shows seats left, and two guests racing for the last seat get one seat between them", async () => {
  const { ws, users } = await team(1);
  const t = await meetingType(ws, "group", users, { seats: 3 });
  for (let i = 0; i < 2; i++) assert.ok((await bookType(rpc, { ws, type: t, length: 30, start: NY("10:00"), guest: guest(), source: "page", payReady: false, liveBusy: none, now: NOW })).ok);
  const slots = await guestSlots(rpc, { ws, type: t, length: 30, now: NOW });
  assert.equal(slots.find((s) => s.start === NY("10:00"))!.seats, 1);
  assert.equal(slots.find((s) => s.start === NY("11:00"))!.seats, 3);
  const race = await Promise.all([0, 1, 2].map(() => bookType(rpc, { ws, type: t, length: 30, start: NY("10:00"), guest: guest(), source: "page", payReady: false, liveBusy: none, now: NOW })));
  assert.equal(race.filter((r) => r.ok).length, 1);
  for (const r of race) if (!r.ok) assert.ok(r.error === "full" || r.error === "not_offered");
  assert.ok(!(await guestSlots(rpc, { ws, type: t, length: 30, now: NOW })).some((s) => s.start === NY("10:00")), "a full start is gone");
});

test("a group seat moves to another start with seats left, past that start's own event; a full start is refused", async () => {
  const { ws, users } = await team(1);
  const t = await meetingType(ws, "group", users, { seats: 2 });
  const acc = (await q(`select id from calendar_accounts where user_id = $1`, [users[0]]))[0].id;
  const take = async (start: number) => {
    const r = await bookType(rpc, { ws, type: t, length: 30, start, guest: guest(), source: "page", payReady: false, liveBusy: none, now: NOW });
    assert.ok(r.ok);
    return r;
  };
  await take(NY("11:00"));
  // The 11:00 event is on the host's calendar, in the cache and live.
  await q(`insert into busy_blocks (account_id, calendar_id, start_at, end_at) values ($1, 'primary', $2, $3)`, [acc, new Date(NY("11:00")).toISOString(), new Date(NY("11:30")).toISOString()]);
  const live = async (h: string[], from: number, to: number) => new Set(from < NY("11:30") && to > NY("11:00") ? h : []);
  const second = await bookType(rpc, { ws, type: t, length: 30, start: NY("11:00"), guest: guest(), source: "page", payReady: false, liveBusy: live, now: NOW });
  assert.ok(second.ok, "a second seat books past the start's own event");
  const mine = await take(NY("09:00"));
  const view = (await loadMeeting(rpc, { token: mine.token }))!;
  assert.ok(!(await rescheduleSlots(rpc, view, NOW)).some((s) => s.start === NY("11:00")), "11:00 is full");
  const full = await reschedule(rpc, { view, start: NY("11:00"), liveBusy: live, now: NOW });
  assert.ok(!full.ok);
  await q(`update meetings set status = 'canceled' where id = $1`, [second.meetingId]);
  assert.ok((await rescheduleSlots(rpc, view, NOW)).some((s) => s.start === NY("11:00")), "a seat came free");
  const moved = await reschedule(rpc, { view, start: NY("11:00"), liveBusy: live, now: NOW });
  assert.ok(moved.ok, "moved into the start past its own event");
  assert.equal((await q(`select count(*)::int n from meetings where type_id = $1 and start_at = $2 and status = 'booked'`, [t.id, new Date(NY("11:00")).toISOString()]))[0].n, 2);
});

test("polls: guests vote on several times; a winner that's no longer free is refused with what's left; the next books every voter", async () => {
  const { ws, users } = await team(1);
  const made = checkLink({ kind: "poll", title: "Planning", offered: [{ start: NY("09:00") }, { start: NY("10:00") }, { start: NY("14:00") }], length: 30 }, { owner: users[0]!, type: null, now: NOW });
  assert.ok("row" in made);
  const linkId = (await q(`insert into meeting_links (workspace_id, kind, owner_user_id, title, offered, length_min, token_hash) values ($1, 'poll', $2, 'Planning', $3, 30, $4) returning id`, [ws, users[0], JSON.stringify(made.row.offered), made.row.token_hash]))[0].id;
  assert.deepEqual(await pollVote(rpc, made.token, { email: "a@x.io", name: "Ana", picks: [NY("09:00"), NY("10:00")] }), { ok: true });
  assert.deepEqual(await pollVote(rpc, made.token, { email: "b@x.io", name: "Ben", picks: [NY("10:00")] }), { ok: true });
  assert.deepEqual(await pollVote(rpc, made.token, { email: "b@x.io", name: "Ben", picks: [NY("10:00"), NY("14:00")] }), { ok: true }, "voting again replaces the vote");
  assert.deepEqual(await pollVote(rpc, made.token, { email: "c@x.io", name: "Cy", picks: [NY("12:00")] }), { ok: false, error: "bad_pick" });
  const guestView = (await loadLink(rpc, { token: made.token }))!;
  assert.equal(guestView.voters, 2, "guests see a count, not who voted");
  assert.equal(guestView.votes.find((v) => Date.parse(v.start) === NY("10:00"))!.n, 2);
  // The host's calendar fills 10:00 after the votes came in.
  const acc = (await q(`select id from calendar_accounts where user_id = $1`, [users[0]]))[0].id;
  await q(`select busy_replace($1, 'primary', $2, $3, $4)`, [acc, new Date(NOW).toISOString(), new Date(NOW + 86_400_000).toISOString(), JSON.stringify([{ start: new Date(NY("10:00")).toISOString(), end: new Date(NY("11:00")).toISOString() }])]);
  const hostView = (await loadLink(rpc, { id: linkId }))!;
  const lost = await pollBookWinner(rpc, { view: hostView, start: NY("10:00"), bookedBy: users[0]!, liveBusy: none, now: NOW });
  assert.ok(!lost.ok && lost.error === "slot_taken");
  assert.deepEqual(lost.free, [NY("09:00"), NY("14:00")]);
  assert.equal((await q(`select count(*)::int n from meetings where link_id = $1`, [linkId]))[0].n, 0, "nothing is written for a busy time");
  // Busy only on the live check: refused too.
  const live = await pollBookWinner(rpc, { view: hostView, start: NY("14:00"), bookedBy: users[0]!, liveBusy: async (h) => new Set(h), now: NOW });
  assert.ok(!live.ok && live.error === "slot_taken");
  const [won, twice] = await Promise.all([
    pollBookWinner(rpc, { view: hostView, start: NY("14:00"), bookedBy: users[0]!, liveBusy: none, now: NOW }),
    pollBookWinner(rpc, { view: hostView, start: NY("09:00"), bookedBy: users[0]!, liveBusy: none, now: NOW }),
  ]);
  assert.equal([won, twice].filter((r) => r.ok).length, 1, "two clicks book the poll once");
  const ok = [won, twice].find((r) => r.ok)!;
  assert.ok(ok.ok);
  assert.deepEqual(ok.guests.sort(), ["a@x.io", "b@x.io"]);
  const m = (await q(`select source, guest_email, answers from meetings where id = $1`, [ok.meetingId]))[0];
  assert.equal(m.source, "poll");
  assert.equal(m.answers.guests.split(", ").sort().join(), "a@x.io,b@x.io");
  assert.equal(await syncJobs(ok.meetingId, "create"), 1);
  assert.deepEqual(await pollVote(rpc, made.token, { email: "d@x.io", name: "Di", picks: [NY("09:00")] }), { ok: false, error: "link_closed" });
});

// Paid types ----------------------------------------------------------------------------------------------------

function fakeStripe() {
  const refunds: { account: string; intent: string; key: string }[] = [];
  const keys = new Map<string, string>();
  const s: PayStripe & { refunds: typeof refunds; down?: boolean } = {
    refunds,
    async checkout(_account, p) {
      if (s.down) throw new Error("Stripe is down");
      return { id: `cs_${p.meetingId.slice(0, 8)}`, url: `https://checkout.stripe.test/${p.meetingId}` };
    },
    async refund(account, intent, key) {
      // Stripe's idempotency key: the same key is the same refund.
      if (!keys.has(key)) {
        keys.set(key, `re_${keys.size + 1}`);
        refunds.push({ account, intent, key });
      }
      return keys.get(key)!;
    },
  };
  return s;
}

async function paidSetup(seats = 0) {
  const { ws, users } = await team(1);
  const account = `acct_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  await q(`select payment_account_set($1, $2, true)`, [ws, account]);
  const t = await meetingType(ws, seats ? "group" : "one", users, { price: { amount: 5000, currency: "usd" }, ...(seats ? { seats } : {}) });
  return { ws, users, account, t };
}

const event = (type: string, account: string, meeting: string, ws: string, extra: Partial<PayEvent["data"]["object"]> = {}): PayEvent => ({
  type,
  account,
  data: { object: { id: `cs_${meeting.slice(0, 8)}`, metadata: { meeting_id: meeting, workspace_id: ws }, payment_intent: `pi_${meeting.slice(0, 8)}`, payment_status: "paid", ...extra } },
});

test("a paid type holds the time while the guest pays; the payment books it once even when the webhook comes twice", async () => {
  const { ws, account, t } = await paidSetup();
  const stripe = fakeStripe();
  const noPay = await bookType(rpc, { ws, type: t, length: 30, start: NY("09:00"), guest: guest(), source: "page", payReady: false, liveBusy: none, now: NOW });
  assert.ok(!noPay.ok && noPay.error === "no_payments", "a paid type can't book before the workspace takes payments");
  const r = await bookType(rpc, { ws, type: t, length: 30, start: NY("09:00"), guest: guest(), source: "page", payReady: true, liveBusy: none, now: NOW });
  assert.ok(r.ok && r.pending);
  assert.equal(await syncJobs(r.meetingId, "create"), 0, "no calendar event before payment");
  const co = await startCheckout(rpc, stripe, { meetingId: r.meetingId, token: r.token, base: "https://app.test", now: NOW });
  assert.ok(co.ok);
  // Held: another guest can't take it meanwhile.
  const other = await bookType(rpc, { ws, type: t, length: 30, start: NY("09:00"), guest: guest(), source: "page", payReady: true, liveBusy: none, now: NOW });
  assert.ok(!other.ok);
  const e = event("checkout.session.completed", account, r.meetingId, ws);
  assert.deepEqual(await handlePayEvent(rpc, stripe, e), { ok: true, did: "booked" });
  assert.deepEqual(await handlePayEvent(rpc, stripe, e), { ok: true, did: "already" });
  const m = (await q(`select status, payment from meetings where id = $1`, [r.meetingId]))[0];
  assert.equal(m.status, "booked");
  assert.equal(m.payment.intent, `pi_${r.meetingId.slice(0, 8)}`);
  assert.equal(await syncJobs(r.meetingId, "create"), 1);
  assert.equal(stripe.refunds.length, 0);
  // An expired event arriving late (out of order) changes nothing.
  assert.deepEqual(await handlePayEvent(rpc, stripe, event("checkout.session.expired", account, r.meetingId, ws)), { ok: true, did: "skipped" });
  assert.equal((await q(`select status from meetings where id = $1`, [r.meetingId]))[0].status, "booked");
});

test("a payment that finishes after the hold ran out and someone took the time is refunded at once, once", async () => {
  const { ws, account, t } = await paidSetup();
  const stripe = fakeStripe();
  const r = await bookType(rpc, { ws, type: t, length: 30, start: NY("10:00"), guest: guest(), source: "page", payReady: true, liveBusy: none, now: NOW });
  assert.ok(r.ok);
  await startCheckout(rpc, stripe, { meetingId: r.meetingId, token: r.token, base: "https://app.test", now: NOW });
  await q(`update meetings set created_at = now() - interval '11 minutes' where id = $1`, [r.meetingId]);
  const taker = await bookType(rpc, { ws, type: t, length: 30, start: NY("10:00"), guest: guest(), source: "page", payReady: true, liveBusy: none, now: NOW });
  assert.ok(taker.ok, "the hold is over, so the time is free again");
  const late = event("checkout.session.completed", account, r.meetingId, ws);
  const [x, y] = await Promise.all([handlePayEvent(rpc, stripe, late), handlePayEvent(rpc, stripe, late)]);
  assert.ok(x.ok && y.ok);
  assert.equal(stripe.refunds.length, 1, "refunded exactly once, even with the event delivered twice at once");
  assert.equal(stripe.refunds[0]!.account, account);
  const m = (await q(`select status, payment from meetings where id = $1`, [r.meetingId]))[0];
  assert.equal(m.status, "canceled");
  assert.ok(m.payment.refund);
  assert.equal(await syncJobs(r.meetingId, "create"), 0, "no event for a refunded meeting");
  assert.deepEqual(await handlePayEvent(rpc, stripe, late), { ok: true, did: "already" });
  assert.equal(stripe.refunds.length, 1);
});

test("a late payment for a time still free books it; an expired checkout lets the time go; a payment after that is refunded", async () => {
  const { ws, account, t } = await paidSetup();
  const stripe = fakeStripe();
  const r = await bookType(rpc, { ws, type: t, length: 30, start: NY("11:00"), guest: guest(), source: "page", payReady: true, liveBusy: none, now: NOW });
  assert.ok(r.ok);
  await q(`update meetings set created_at = now() - interval '20 minutes' where id = $1`, [r.meetingId]);
  assert.deepEqual(await handlePayEvent(rpc, stripe, event("checkout.session.completed", account, r.meetingId, ws)), { ok: true, did: "booked" });
  const r2 = await bookType(rpc, { ws, type: t, length: 30, start: NY("12:00"), guest: guest(), source: "page", payReady: true, liveBusy: none, now: NOW });
  assert.ok(r2.ok);
  await startCheckout(rpc, stripe, { meetingId: r2.meetingId, token: r2.token, base: "https://app.test", now: NOW });
  assert.deepEqual(await handlePayEvent(rpc, stripe, event("checkout.session.expired", account, r2.meetingId, ws, { payment_status: "unpaid", payment_intent: null })), { ok: true, did: "released" });
  assert.equal((await q(`select status from meetings where id = $1`, [r2.meetingId]))[0].status, "canceled");
  // Out of order: the completed event shows up after the expired one.
  assert.deepEqual(await handlePayEvent(rpc, stripe, event("checkout.session.completed", account, r2.meetingId, ws)), { ok: true, did: "refunded" });
  // Another account's event for this meeting is refused.
  const spoof = await handlePayEvent(rpc, stripe, event("checkout.session.completed", "acct_someoneelse", r.meetingId, ws));
  assert.ok(!spoof.ok);
});

test("the last paid group seat: two guests pay for it; the one whose time was lost is refunded", async () => {
  const { ws, account, t } = await paidSetup(2);
  const stripe = fakeStripe();
  const first = await bookType(rpc, { ws, type: t, length: 30, start: NY("13:00"), guest: guest(), source: "page", payReady: true, liveBusy: none, now: NOW });
  assert.ok(first.ok);
  await handlePayEvent(rpc, stripe, event("checkout.session.completed", account, first.meetingId, ws));
  const a = await bookType(rpc, { ws, type: t, length: 30, start: NY("13:00"), guest: guest(), source: "page", payReady: true, liveBusy: none, now: NOW });
  assert.ok(a.ok);
  const b = await bookType(rpc, { ws, type: t, length: 30, start: NY("13:00"), guest: guest(), source: "page", payReady: true, liveBusy: none, now: NOW });
  assert.ok(!b.ok && (b.error === "full" || b.error === "not_offered"), "the held seat counts while its guest pays");
  // a's hold runs out; c takes the seat and pays; a's payment then arrives.
  await q(`update meetings set created_at = now() - interval '11 minutes' where id = $1`, [a.meetingId]);
  const c = await bookType(rpc, { ws, type: t, length: 30, start: NY("13:00"), guest: guest(), source: "page", payReady: true, liveBusy: none, now: NOW });
  assert.ok(c.ok);
  assert.equal((await handlePayEvent(rpc, stripe, event("checkout.session.completed", account, c.meetingId, ws))).ok, true);
  assert.deepEqual(await handlePayEvent(rpc, stripe, event("checkout.session.completed", account, a.meetingId, ws)), { ok: true, did: "refunded" });
  assert.equal((await q(`select count(*)::int n from meetings where type_id = $1 and status = 'booked'`, [t.id]))[0].n, 2);
});

test("Stripe down at checkout: the hold is let go at once", async () => {
  const { ws, t } = await paidSetup();
  const stripe = fakeStripe();
  stripe.down = true;
  const r = await bookType(rpc, { ws, type: t, length: 30, start: NY("14:00"), guest: guest(), source: "page", payReady: true, liveBusy: none, now: NOW });
  assert.ok(r.ok);
  assert.deepEqual(await startCheckout(rpc, stripe, { meetingId: r.meetingId, token: r.token, base: "https://app.test", now: NOW }), { ok: false });
  assert.equal((await q(`select status from meetings where id = $1`, [r.meetingId]))[0].status, "canceled");
  assert.ok((await bookType(rpc, { ws, type: t, length: 30, start: NY("14:00"), guest: guest(), source: "page", payReady: true, liveBusy: none, now: NOW })).ok);
});

test("guest details are checked against the type's questions", () => {
  const qs = [{ id: "size", label: "Team size", type: "choice" as const, required: true, options: ["1-10", "11-50"] }, { id: "notes", label: "Notes", type: "textarea" as const, required: false }];
  assert.ok("error" in checkGuest({ name: "", email: "a@b.io" }, qs));
  assert.ok("error" in checkGuest({ name: "A", email: "nope" }, qs));
  assert.deepEqual(checkGuest({ name: "A", email: "a@b.io", answers: { size: "500" } }, qs), { error: "Pick an answer for Team size.", field: "size" });
  const ok = checkGuest({ name: " A ", email: "A@B.io", tz: "Europe/Paris", answers: { size: "1-10", other: "x" } }, qs);
  assert.ok("guest" in ok && ok.guest.email === "a@b.io" && ok.guest.tz === "Europe/Paris" && JSON.stringify(ok.guest.answers) === '{"size":"1-10"}');
  assert.ok("error" in checkGuest({ name: "A", email: "a@b.io", answers: { size: "1-10" } }, qs, { kind: "phone_guest" }));
});
