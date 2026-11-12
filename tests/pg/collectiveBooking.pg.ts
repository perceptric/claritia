// Collective team meetings from a form (supabase/migrations/147_collective_booking.sql), on a real database. A rule set
// to "Enterprise (Collective)" books everyone on the team: the lead sees only the times when every member is free, the
// meeting holds them all, a retried send and the booking page keep the same people even after the team changes, a
// routing team is read by its key, and two guests confirming the same start make one meeting.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";
import { bookForClaim, readBooking, timesForClaim, type Booking, type Claim } from "../../src/lib/forms/booking.ts";
import { checkForm, emptyForm } from "../../src/lib/forms/schema.ts";
import { acceptFill, type PublicForm } from "../../src/lib/forms/submit.ts";
import { offer } from "../../src/lib/meetings/server.ts";
import { at } from "../../src/lib/meetings/time.ts";
import { DEFAULT_AVAILABILITY, DEFAULT_SETTINGS, type MeetingType } from "../../src/lib/meetings/types.ts";
import { invalidateRouterLive } from "../../src/lib/router/server.ts";
import { emptyBody, type RouterBody } from "../../src/lib/router/types.ts";
import { ctxFor } from "../../worker-intel/jobs/ctx.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";

const SECRET = "collective-booking-test-secret-0123456";
const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 8 });
const rpc = pgRpc(pool);
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

const TZ = "America/New_York";
// Monday 2 November 2026, 06:00 in New York. Rep 1 is busy 10:00 to 11:00; the others are free all day.
const NOW = at("2026-11-02", "06:00", TZ);
const TEN = at("2026-11-02", "10:00", TZ);
const free = () => async () => new Set<string>();

/** Three reps on the Enterprise team. Leads over 499 people book the team collectively; the rest go to rep 0's queue. */
async function setup() {
  const ws = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, 'Acme')`, [ws]);
  const users: string[] = [];
  for (let i = 0; i < 3; i++) {
    const u = randomUUID();
    users.push(u);
    await q(`insert into auth.users (id, email) values ($1, $2)`, [u, `${u}@t.io`]);
    await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, u]);
    const acc = (await q(`insert into calendar_accounts (workspace_id, user_id, provider, account_email) values ($1, $2, 'fake', $3) returning id`, [ws, u, `${u}@t.io`]))[0].id;
    await q(`insert into calendar_lists (account_id, calendar_id, name, busy, write) values ($1, 'primary', 'Work', true, true)`, [acc]);
    const a = DEFAULT_AVAILABILITY(TZ);
    await q(`insert into availability (workspace_id, user_id, tz, weekly, overrides) values ($1, $2, $3, $4, $5)`, [ws, u, a.tz, a.weekly, JSON.stringify(a.overrides)]);
    await q(`insert into booking_profiles (workspace_id, user_id, slug, name) values ($1, $2, $3, $4)`, [ws, u, `p${i}-${u.slice(0, 6)}`, `Rep ${i}`]);
    if (i === 1) await q(`insert into busy_blocks (account_id, calendar_id, start_at, end_at) values ($1, 'primary', $2, $3)`, [acc, new Date(TEN).toISOString(), new Date(TEN + 3_600_000).toISOString()]);
  }
  const type = (await q(`insert into meeting_types (workspace_id, slug, name, kind, hosts, settings) values ($1, 'demo', 'Demo', 'one', $2, $3) returning id`, [ws, JSON.stringify([{ user_id: users[0] }]), { ...DEFAULT_SETTINGS, notice: 0, window: 1 }]))[0].id as string;
  const body: RouterBody = {
    ...emptyBody(),
    queues: [
      { id: "ent", name: "Enterprise", method: "rr", strict: false, hoursOnly: false, members: users.map((user) => ({ user, weight: 1 })) },
      { id: "solo", name: "Solo", method: "rr", strict: false, hoursOnly: false, members: [{ user: users[0]!, weight: 1 }] },
    ],
    rules: { on: true, list: [{ id: "ent", name: "Enterprise", match: "all", conds: [{ field: "answer.q.size", op: "gt", value: 499 }], queue: "ent", book: "all" }] },
    fallback: { kind: "queue", id: "solo" },
  };
  await q(`insert into routers (workspace_id, live_version) values ($1, 1)`, [ws]);
  await q(`insert into router_versions (workspace_id, version, body) values ($1, 1, $2)`, [ws, body]);
  invalidateRouterLive(ws);
  const raw = {
    ...emptyForm(),
    steps: [{ id: "s1", fields: [{ id: "em", key: "email", type: "email", label: "Email", required: true }, { id: "size", key: "q.size", type: "number", label: "Team size", required: false }] }],
    spam: { minSeconds: 0, turnstile: false },
    after: { end: { kind: "message", title: "Thanks" }, schedule: { tool: "claritia", url: "", perOwner: false, meetingTypeId: type } },
  };
  const r = checkForm(raw);
  if ("errors" in r) throw new Error(r.errors.join(" "));
  const id = (await q(`insert into forms (workspace_id, name, draft) values ($1, 'Demo', $2) returning id`, [ws, r.form]))[0].id as string;
  await q(`select form_publish($1, $2, $3)`, [id, users[0], r.form]);
  const form = (await q(`select form_public($1) as f`, [id]))[0].f as PublicForm;
  const typeRow = (await q(`select * from meeting_types where id = $1`, [type]))[0] as MeetingType;
  return { ws, users, type, form, typeRow, body };
}

async function fill(f: PublicForm, size: number, key = `k${randomUUID().replace(/-/g, "")}`.slice(0, 32), em = `lee-${randomUUID().slice(0, 8)}@globex.com`) {
  const r = await acceptFill(rpc, f, { v: 1, version: f.version, key, answers: { em, size }, ms: 5000, trap: "" }, await ctxFor(pool, f.workspace_id), { secret: SECRET, now: NOW });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body as { id: string; booking?: Booking };
}
const claimOf = (b: Booking) => {
  const c = readBooking(b.token, SECRET);
  assert.ok(c && c !== "expired");
  return c as Claim;
};

test("Collective: only times when everyone is free, and the meeting holds the whole team", async () => {
  const s = await setup();
  const b = await fill(s.form, 800);
  assert.ok(b.booking?.slots.length, "times shown");
  assert.ok(!b.booking!.slots.includes(TEN), "rep 1 is busy at 10:00: never shown, though reps 0 and 2 are free");
  const all = await offer(rpc, { ws: s.ws, type: { ...s.typeRow, kind: "collective", hosts: s.users.map((user_id) => ({ user_id })) }, length: 30, now: NOW });
  assert.deepEqual(b.booking!.slots, all.slots.map((x) => x.start), "the same times as a collective meeting of the three");
  assert.equal(b.booking!.host, undefined, "no single host named");
  const c = claimOf(b.booking!);
  assert.ok(!c.only);
  assert.deepEqual((await q(`select booking_hosts from submissions where id = $1`, [b.id]))[0].booking_hosts, s.users);
  // The lead's owner is still the team's turn: a CRM owner, while the meeting has everyone.
  const owner = (await q(`select c.owner_user_id from submissions x join contacts c on c.id = x.contact_id where x.id = $1`, [b.id]))[0].owner_user_id;
  assert.ok(s.users.includes(owner));
  const ok = await bookForClaim(rpc, b.booking!.token, c, { start: b.booking!.slots[0]!, now: NOW, liveBusyFor: free });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const m = await q(`select hosts from meetings where submission_id = $1`, [b.id]);
  assert.equal(m.length, 1);
  assert.deepEqual([...m[0].hosts].sort(), [...s.users].sort(), "everyone on the team is in the meeting");
});

test("a lead outside the Collective rule books one host as before", async () => {
  const s = await setup();
  const b = await fill(s.form, 20);
  const c = claimOf(b.booking!);
  assert.deepEqual([c.owner, c.only], [s.users[0], true]);
  assert.equal((await q(`select booking_hosts from submissions where id = $1`, [b.id]))[0].booking_hosts, null);
});

test("the same people after a retried send and after the team changes", async () => {
  const s = await setup();
  const key = `k${randomUUID().replace(/-/g, "")}`.slice(0, 32);
  const em = `same-${randomUUID().slice(0, 8)}@globex.com`;
  const b = await fill(s.form, 900, key, em);
  // Rep 1 leaves the team: a new version of the body.
  const body2: RouterBody = { ...s.body, queues: s.body.queues.map((x) => (x.id === "ent" ? { ...x, members: x.members.filter((m) => m.user !== s.users[1]) } : x)) };
  await q(`insert into router_versions (workspace_id, version, body) values ($1, 2, $2)`, [s.ws, body2]);
  await q(`update routers set live_version = 2 where workspace_id = $1`, [s.ws]);
  invalidateRouterLive(s.ws);
  const again = await fill(s.form, 900, key, em);
  assert.equal(again.id, b.id);
  assert.deepEqual(again.booking?.slots, b.booking!.slots, "the retried send shows the same times");
  const later = await timesForClaim(rpc, b.booking!.token, claimOf(b.booking!), { now: NOW });
  assert.deepEqual(later.body.booking?.slots, b.booking!.slots, "the booking page too");
  assert.deepEqual((await q(`select booking_hosts from submissions where id = $1`, [b.id]))[0].booking_hosts, s.users);
  // A start only rep 1 blocks stays refused for this fill.
  const busy = await bookForClaim(rpc, b.booking!.token, claimOf(b.booking!), { start: TEN, now: NOW, liveBusyFor: free });
  assert.equal(busy.status, 409);
});

test("a routing team is read by its key, in its order; the first list a fill gets is kept", async () => {
  const s = await setup();
  const team = (await q(`insert into routing_teams (workspace_id, name) values ($1, 'Partners') returning id`, [s.ws]))[0].id;
  await q(`insert into routing_team_keys (workspace_id, key, team_id) values ($1, 't_partners', $2)`, [s.ws, team]);
  for (const [i, u] of [s.users[2], s.users[0]].entries()) await q(`insert into routing_team_members (team_id, workspace_id, user_id, position) values ($1, $2, $3, $4)`, [team, s.ws, u, i]);
  const b = await fill(s.form, 20);
  await q(`update submissions set booking_hosts = null where id = $1`, [b.id]);
  const first = (await q(`select form_booking_hosts($1, null, 't_partners') h`, [b.id]))[0].h;
  assert.deepEqual(first, [s.users[2], s.users[0]]);
  await q(`delete from routing_team_members where team_id = $1 and user_id = $2`, [team, s.users[0]]);
  assert.deepEqual((await q(`select form_booking_hosts($1, null, 't_partners') h`, [b.id]))[0].h, first, "a repeat keeps the first list");
  const other = await fill(s.form, 20);
  await q(`update submissions set booking_hosts = null where id = $1`, [other.id]);
  assert.equal((await q(`select form_booking_hosts($1, null, 'no_such_team') h`, [other.id]))[0].h, null, "an unknown team gives no hosts");
});

test("two guests confirming the same start with the same team: one meeting", async () => {
  const s = await setup();
  const [a, b] = await Promise.all([fill(s.form, 600), fill(s.form, 650)]);
  const start = a.booking!.slots.find((x) => b.booking!.slots.includes(x))!;
  assert.ok(start);
  const [ra, rb] = await Promise.all([
    bookForClaim(rpc, a.booking!.token, claimOf(a.booking!), { start, now: NOW, liveBusyFor: free }),
    bookForClaim(rpc, b.booking!.token, claimOf(b.booking!), { start, now: NOW, liveBusyFor: free }),
  ]);
  assert.deepEqual([ra.status, rb.status].sort(), [200, 409]);
  assert.equal((await q(`select count(*)::int n from meetings where workspace_id = $1 and start_at = $2`, [s.ws, new Date(start).toISOString()]))[0].n, 1);
});
