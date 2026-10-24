// The new structure on a real database (docs/app-structure.md): a meeting type on a named schedule offers only those
// hours to every guest and refuses a time the schedule just dropped (edited while a guest was booking); a host with no
// schedule of that name keeps their working hours; Pause routing leaves new leads with the owner they came with; the
// calendar's busy times are yours to read (owners read anyone's); and schedule names stay unique per person.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";
import { book, offer } from "../../src/lib/meetings/server.ts";
import { at } from "../../src/lib/meetings/time.ts";
import { DEFAULT_AVAILABILITY, DEFAULT_SETTINGS, type MeetingType } from "../../src/lib/meetings/types.ts";
import { route } from "../../src/lib/router/server.ts";
import { emptyBody } from "../../src/lib/router/types.ts";
import { deleteSchedule, saveSchedule } from "../../src/app/api/meetings/_lib/host.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 8 });
const rpc = pgRpc(pool);
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

const NOW = at("2026-11-02", "06:00", "America/New_York");
const NY = (time: string, date = "2026-11-02") => at(date, time, "America/New_York");
const none = async () => new Set<string>();
const guest = () => ({ email: `${randomUUID().slice(0, 6)}@lead.io`, name: "Dana Lee", tz: "America/New_York" });

async function team(n: number) {
  const ws = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, 'Acme')`, [ws]);
  const users: string[] = [];
  for (let i = 0; i < n; i++) {
    const u = randomUUID();
    users.push(u);
    await q(`insert into auth.users (id, email) values ($1, $2)`, [u, `${u}@t.io`]);
    await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, $3)`, [ws, u, i === 0 ? "owner" : "member"]);
    const acc = (await q(`insert into calendar_accounts (workspace_id, user_id, provider, account_email) values ($1, $2, 'fake', $3) returning id`, [ws, u, `${u}@t.io`]))[0].id;
    await q(`insert into calendar_lists (account_id, calendar_id, name, busy, write) values ($1, 'primary', 'Work', true, true)`, [acc]);
    const a = DEFAULT_AVAILABILITY("America/New_York");
    await q(`insert into availability (workspace_id, user_id, tz, weekly, overrides) values ($1, $2, $3, $4, $5)`, [ws, u, a.tz, a.weekly, JSON.stringify(a.overrides)]);
  }
  return { ws, users };
}

async function meetingType(ws: string, kind: MeetingType["kind"], users: string[], settings: Partial<MeetingType["settings"]> = {}): Promise<MeetingType> {
  const hosts = users.map((u) => ({ user_id: u, weight: 1, tier: 0 }));
  const s = { ...DEFAULT_SETTINGS, notice: 0, window: 1, ...settings };
  const id = (await q(`insert into meeting_types (workspace_id, slug, name, kind, hosts, settings) values ($1, $2, 'Demo', $3, $4, $5) returning id`, [ws, `d-${randomUUID().slice(0, 6)}`, kind, JSON.stringify(hosts), s]))[0].id as string;
  return { id, workspace_id: ws, slug: "demo", name: "Demo", kind, hosts, settings: s, secret: false, active: true, owner_user_id: null, template_id: null, locked: [] };
}

const DEMO = { tz: "America/New_York", weekly: { mon: [["14:00", "16:00"]], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }, overrides: [] };

test("a type on a named schedule offers only those hours; a host without one keeps their working hours", async () => {
  const { ws, users } = await team(2);
  await saveSchedule(rpc, { ws, user: users[0]! }, null, null, "Demo hours", DEMO);
  const t = await meetingType(ws, "one", [users[0]!], { schedule: "demo hours" });
  const o = await offer(rpc, { ws, type: t, length: 30, now: NOW });
  assert.ok(o.slots.length > 0);
  assert.ok(o.slots.every((s) => s.start >= NY("14:00") && s.start < NY("16:00")), "only 14:00 to 16:00");
  // The same type without the schedule: the 9 to 5 working hours.
  const plain = await offer(rpc, { ws, type: { ...t, settings: { ...t.settings, schedule: undefined } }, length: 30, now: NOW });
  assert.equal(plain.slots[0]!.start, NY("09:00"));
  // A round robin where only one host has the schedule: the other offers their working hours.
  const rr = await meetingType(ws, "round_robin", users, { schedule: "Demo hours" });
  const both = await offer(rpc, { ws, type: rr, length: 30, now: NOW });
  const at9 = both.slots.find((s) => s.start === NY("09:00"));
  assert.deepEqual(at9?.hosts, [users[1]]);
});

test("a schedule edited while a guest books: the dropped time is refused with fresh times, never booked", async () => {
  const { ws, users } = await team(1);
  const id = await saveSchedule(rpc, { ws, user: users[0]! }, null, null, "Demo hours", DEMO);
  const t = await meetingType(ws, "one", users, { schedule: "Demo hours" });
  const shown = await offer(rpc, { ws, type: t, length: 30, now: NOW });
  assert.ok(shown.slots.some((s) => s.start === NY("14:00")));
  // The host moves their demo hours to 15:00 while the guest is still picking.
  await saveSchedule(rpc, { ws, user: users[0]! }, null, id, "Demo hours", { ...DEMO, weekly: { ...DEMO.weekly, mon: [["15:00", "16:00"]] } });
  const r = await book(rpc, { ws, type: t, length: 30, start: NY("14:00"), guest: guest(), source: "page", now: NOW, liveBusy: none });
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.slots.every((s) => s.start >= NY("15:00")), "the fresh times are the new hours");
  assert.equal((await q(`select count(*)::int n from meetings where workspace_id = $1`, [ws]))[0].n, 0);
  // Deleting the schedule sends the type back to working hours.
  await deleteSchedule(rpc, { ws, user: users[0]! }, null, id);
  const back = await offer(rpc, { ws, type: t, length: 30, now: NOW });
  assert.equal(back.slots[0]!.start, NY("09:00"));
});

test("schedule names are unique per person, Working hours is the default's name, and members change only their own", async () => {
  const { ws, users } = await team(2);
  await saveSchedule(rpc, { ws, user: users[1]! }, null, null, "Demo hours", DEMO);
  await assert.rejects(saveSchedule(rpc, { ws, user: users[1]! }, null, null, "demo HOURS", DEMO), /already have a schedule/);
  await assert.rejects(saveSchedule(rpc, { ws, user: users[1]! }, null, null, "Working hours", DEMO), /default schedule/);
  await assert.rejects(saveSchedule(rpc, { ws, user: users[1]! }, users[0], null, "Mine", DEMO), /Only owners/);
  // An owner can set a teammate's.
  await saveSchedule(rpc, { ws, user: users[0]! }, users[1], null, "Fridays", DEMO);
  assert.equal((await q(`select count(*)::int n from availability_schedules where workspace_id = $1 and user_id = $2`, [ws, users[1]]))[0].n, 2);
});

test("Pause routing: new leads keep the owner they came with; turning it on routes again", async () => {
  const { ws, users } = await team(2);
  const b = emptyBody();
  b.account.on = false;
  b.keep.on = false;
  b.queues = [{ id: "q", name: "All", method: "rr", strict: false, hoursOnly: false, members: [{ user: users[1]!, weight: 1 }] }];
  b.fallback = { kind: "queue", id: "q" };
  await q(`select router_publish($1, $2, 'test', null)`, [ws, b]);
  const lead = async () => (await q(`insert into contacts (workspace_id, email, email_clean, email_class, first_name, last_name, owner_user_id) values ($1, $2, $2, 'work', 'Dana', 'Lee', $3) returning id`, [ws, `${randomUUID().slice(0, 6)}@acme.io`, users[0]]))[0].id as string;
  await q(`select router_pause($1, true, $2)`, [ws, users[0]]);
  const c = await lead();
  const r = await route(rpc, { ws, contact: c, key: `form:${c}`, reason: "form" });
  assert.equal(r.status, "paused");
  assert.equal((await q(`select owner_user_id from contacts where id = $1`, [c]))[0].owner_user_id, users[0]);
  assert.equal((await q(`select count(*)::int n from router_runs where workspace_id = $1`, [ws]))[0].n, 0);
  await q(`select router_pause($1, false, $2)`, [ws, users[0]]);
  const again = await route(rpc, { ws, contact: c, key: `form:${c}`, reason: "form" });
  assert.equal(again.status, "ok");
  assert.equal((await q(`select owner_user_id from contacts where id = $1`, [c]))[0].owner_user_id, users[1]);
});

test("calendar busy times: yours to read, owners read anyone's, a member can't read a teammate's", async () => {
  const { ws, users } = await team(2);
  const [owner, member] = users as [string, string];
  const acc = (await q(`select id from calendar_accounts where user_id = $1`, [member]))[0].id;
  await q(`select busy_replace($1, 'primary', $2, $3, $4)`, [acc, new Date(NOW).toISOString(), new Date(NOW + 86_400_000).toISOString(), JSON.stringify([{ start: new Date(NY("12:00")).toISOString(), end: new Date(NY("13:00")).toISOString() }])]);
  const read = async (as: string, whose: string) => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [as]);
      await c.query("set local role authenticated");
      const r = await c.query(`select meeting_calendar_busy($1, $2, $3, $4) b`, [ws, whose, new Date(NOW).toISOString(), new Date(NOW + 86_400_000).toISOString()]);
      return r.rows[0].b as { start: string }[] | null;
    } finally {
      await c.query("rollback");
      c.release();
    }
  };
  assert.equal((await read(member, member))?.length, 1);
  assert.equal((await read(owner, member))?.length, 1);
  assert.equal(await read(member, owner), null);
});
