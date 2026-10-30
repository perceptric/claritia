// Calendar and Routing as one system on a real database (docs/scheduling-plan.md Parts 12 and 13): a team meeting type
// takes its people from the live queue; two guests confirming the same start at once make one meeting and one run; the
// queue's turn moves on after a booking; a paused rep and a rep's days off take no team times; the CRM moving a lead
// leaves the meeting and gives the new owner one task; a workflow's Route step sees a lead routed moments ago.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";
import { book, offer } from "../../src/lib/meetings/server.ts";
import { at } from "../../src/lib/meetings/time.ts";
import { DEFAULT_AVAILABILITY, DEFAULT_SETTINGS, type MeetingType } from "../../src/lib/meetings/types.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 8 });
const rpc = pgRpc(pool);
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

const TZ = "America/New_York";
const NOW = at("2026-11-02", "06:00", TZ);
const TEN = at("2026-11-02", "10:00", TZ);
const free = async () => new Set<string>();

async function setup(n = 3) {
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
    const a = DEFAULT_AVAILABILITY(TZ);
    await q(`insert into availability (workspace_id, user_id, tz, weekly, overrides) values ($1, $2, $3, $4, $5)`, [ws, u, a.tz, a.weekly, JSON.stringify(a.overrides)]);
  }
  const body = { v: 1, queues: [{ id: "sales", name: "Sales", method: "rr", strict: false, hoursOnly: false, members: users.map((user) => ({ user, weight: 1 })) }], rules: { on: true, list: [] }, fallback: { kind: "queue", id: "sales" } };
  await q(`insert into routers (workspace_id, live_version) values ($1, 1)`, [ws]);
  await q(`insert into router_versions (workspace_id, version, body) values ($1, 1, $2)`, [ws, body]);
  const settings = { ...DEFAULT_SETTINGS, notice: 0, window: 2, team: "sales" };
  // Saved with one stale host: the live queue is what counts.
  const id = (await q(`insert into meeting_types (workspace_id, slug, name, kind, hosts, settings) values ($1, 'demo', 'Demo', 'round_robin', $2, $3) returning id`, [ws, JSON.stringify([{ user_id: users[0], weight: 1 }]), settings]))[0].id as string;
  const type = (await q(`select * from meeting_types where id = $1`, [id]))[0] as MeetingType;
  return { ws, users, type };
}

const guest = (n: number) => ({ email: `lead${n}-${randomUUID().slice(0, 6)}@globex.com`, name: `Lead ${n}` });

test("two guests confirming one start at once: one meeting, one run, the other gets fresh times", async () => {
  const s = await setup(1);
  const go = (n: number) => book(rpc, { ws: s.ws, type: s.type, length: 30, start: TEN, guest: guest(n), source: "page", now: NOW, liveBusy: free });
  const [a, b] = await Promise.all([go(1), go(2)]);
  assert.equal([a, b].filter((r) => r.ok).length, 1);
  const lost = [a, b].find((r) => !r.ok)!;
  assert.ok(!lost.ok && lost.error === "slot_taken" && lost.slots.every((x) => x.start !== TEN));
  // Written at once, or (when the database is slow) by the job with the meeting's key: one either way.
  const runs = await q(`select reason, queue_id, owner from router_runs where workspace_id = $1`, [s.ws]);
  const queued = await q(`select payload from jobs where workspace_id = $1 and kind = 'meeting_team_run'`, [s.ws]);
  assert.equal(runs.length + queued.length, 1);
  if (runs.length) assert.deepEqual([runs[0].reason, runs[0].queue_id], ["booking", "sales"]);
  else assert.equal(queued[0].payload.p_queue, "sales");
});

test("the queue's turn moves on after each booking, and a booking counts toward the rep's day", async () => {
  const s = await setup(3);
  const hosts: string[] = [];
  for (const [i, time] of ["10:00", "11:00", "12:00"].entries()) {
    const r = await book(rpc, { ws: s.ws, type: s.type, length: 30, start: at("2026-11-02", time, TZ), guest: guest(i), source: "page", now: NOW, liveBusy: free });
    assert.ok(r.ok, JSON.stringify(r));
    hosts.push(r.hosts[0]!);
  }
  assert.equal(new Set(hosts).size, 3, "three bookings, three reps");
  const today = (await q(`select (router_rep_facts($1, $2)->>'today')::int as n`, [s.ws, hosts[0]]))[0].n;
  assert.equal(today, 1);
});

test("a paused rep and a rep on a day off get no team times", async () => {
  const s = await setup(3);
  await q(`insert into router_reps (workspace_id, user_id, paused_until) values ($1, $2, now() + interval '30 days')`, [s.ws, s.users[1]]);
  await q(`insert into router_reps (workspace_id, user_id, out_dates) values ($1, $2, '[{"from":"2026-11-02","to":"2026-11-02"}]')`, [s.ws, s.users[2]]);
  const o = await offer(rpc, { ws: s.ws, type: s.type, length: 30, now: NOW });
  assert.deepEqual(o.slots.find((x) => x.start === TEN)?.hosts, [s.users[0]]);
  const tue = o.slots.find((x) => x.start === at("2026-11-03", "10:00", TZ));
  assert.deepEqual(tue?.hosts.sort(), [s.users[0], s.users[2]].sort(), "back from the day off; still paused");
});

test("the CRM moving a lead: the meeting stays, the new owner gets one task", async () => {
  const s = await setup(2);
  const src = (await q(`insert into sources (workspace_id, kind, name) values ($1, 'hubspot', 'HubSpot') returning id`, [s.ws]))[0].id;
  await q(`insert into crm_owner_links (workspace_id, source_id, crm_owner_id, user_id) values ($1, $2, 'hs-2', $3)`, [s.ws, src, s.users[1]]);
  const c = (await q(`insert into contacts (workspace_id, email, email_clean, first_name, last_name, owner_user_id) values ($1, 'maya@globex.com', 'maya@globex.com', 'Maya', 'Chen', $2) returning id`, [s.ws, s.users[0]]))[0].id;
  const r = await book(rpc, { ws: s.ws, type: { ...s.type, settings: { ...s.type.settings, team: undefined }, hosts: [{ user_id: s.users[0]! }], kind: "one" }, length: 30, start: TEN, guest: { email: "maya@globex.com" }, contactId: c, source: "page", now: NOW, liveBusy: free });
  assert.ok(r.ok);
  await q(`update contacts set owner_crm_id = 'hs-2' where id = $1`, [c]);
  await q(`update contacts set owner_crm_id = 'hs-2', updated_at = now() where id = $1`, [c]);
  assert.equal((await q(`select owner_user_id from contacts where id = $1`, [c]))[0].owner_user_id, s.users[1]);
  assert.deepEqual((await q(`select hosts from meetings where id = $1`, [r.ok ? r.meetingId : ""]))[0].hosts, [s.users[0]]);
  const tasks = await q(`select title, assignee from tasks where record_id = $1`, [c]);
  assert.equal(tasks.length, 1);
  assert.match(tasks[0].title, /^Take over Maya Chen's Demo on Mon, Nov 2\?$/);
  assert.equal(tasks[0].assignee, s.users[1]);
});

test("a workflow sees a lead routed moments ago, or waiting on a route job", async () => {
  const s = await setup(1);
  const c = (await q(`insert into contacts (workspace_id, email, email_clean) values ($1, 'lee@globex.com', 'lee@globex.com') returning id`, [s.ws]))[0].id;
  assert.equal((await q(`select router_recent($1, $2, 10) as r`, [s.ws, c]))[0].r, false);
  await q(`select enqueue_job($1, 'route', $2, $3, 0, 5)`, [s.ws, `form:${randomUUID()}`, { contact: c }]);
  assert.equal((await q(`select router_recent($1, $2, 10) as r`, [s.ws, c]))[0].r, true);
});
