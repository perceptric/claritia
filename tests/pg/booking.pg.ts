// Booking on a real database (docs/meetings-scheduler.md 1.6 and Part 3): meeting_book never lets two meetings of
// the same host overlap, even when two leads book at the same instant; group seats, one-time links, payment holds,
// moves, status changes and round-robin turns behave as the plan says.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 8 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

const T = (iso: string) => new Date(iso).toISOString();
const M = 60_000;

async function workspace() {
  const ws = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, 'Acme')`, [ws]);
  const users = [randomUUID(), randomUUID(), randomUUID()];
  for (const u of users) {
    await q(`insert into auth.users (id, email) values ($1, $2)`, [u, `${u}@t.io`]);
    await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')`, [ws, u]);
  }
  return { ws, users };
}

async function type(ws: string, kind: string, hosts: string[], seats = 0) {
  const slug = `t-${randomUUID().slice(0, 8)}`;
  return (await q(`insert into meeting_types (workspace_id, slug, name, kind, hosts, settings) values ($1, $2, 'Demo', $3, $4, $5) returning id`, [ws, slug, kind, JSON.stringify(hosts.map((h) => ({ user_id: h }))), JSON.stringify({ seats })]))[0].id as string;
}

type Book = { ws: string; type: string | null; hosts: string[]; start: string; minutes?: number; buffer?: number; seats?: number; link?: string | null; status?: string; email?: string };
const book = async (b: Book, client: pg.Pool | pg.PoolClient = pool) => {
  const start = new Date(b.start).getTime();
  const end = start + (b.minutes ?? 30) * M;
  const buf = (b.buffer ?? 0) * M;
  const r = await client.query(`select meeting_book($1, $2, $3, $4, $5, $6, $7, $8, 'page', $9, $10, null, null, $11, $12, true) as id`, [
    b.ws, b.type, b.hosts, T(new Date(start).toISOString()), T(new Date(end).toISOString()), T(new Date(start - buf).toISOString()), T(new Date(end + buf).toISOString()),
    JSON.stringify({ email: b.email ?? `${randomUUID().slice(0, 6)}@lead.io`, name: "Lead" }), randomUUID(), b.status ?? "booked", b.link ?? null, b.seats ?? 0,
  ]);
  return r.rows[0].id as string;
};
const fails = async (p: Promise<unknown>, code: string) => assert.rejects(p, (e: Error) => e.message.includes(code));

test("two leads booking the same host at the same instant: exactly one wins", async () => {
  const { ws, users } = await workspace();
  const t = await type(ws, "one", [users[0]!]);
  for (let round = 0; round < 10; round++) {
    const start = `2026-11-0${(round % 9) + 1}T15:00:00Z`;
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => book({ ws, type: t, hosts: [users[0]!], start: start.replace("15:00", `${10 + round}:00`) })));
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1, `round ${round}`);
    assert.ok(results.filter((r) => r.status === "rejected").every((r) => String((r as PromiseRejectedResult).reason).includes("slot_taken")));
  }
});

test("buffers keep the span around a meeting free, for any of the hosts", async () => {
  const { ws, users } = await workspace();
  const t = await type(ws, "collective", users.slice(0, 2));
  await book({ ws, type: t, hosts: users.slice(0, 2), start: "2026-11-10T15:00:00Z", buffer: 15 });
  await fails(book({ ws, type: null, hosts: [users[1]!], start: "2026-11-10T15:40:00Z" }), "slot_taken");
  await book({ ws, type: null, hosts: [users[1]!], start: "2026-11-10T15:45:00Z" });
  await book({ ws, type: null, hosts: [users[2]!], start: "2026-11-10T15:00:00Z" });
});

test("a group start fills up seat by seat, even with guests racing for the last one", async () => {
  const { ws, users } = await workspace();
  const t = await type(ws, "group", [users[0]!], 3);
  await book({ ws, type: t, hosts: [users[0]!], start: "2026-11-11T16:00:00Z", seats: 3 });
  const race = await Promise.allSettled(Array.from({ length: 5 }, () => book({ ws, type: t, hosts: [users[0]!], start: "2026-11-11T16:00:00Z", seats: 3 })));
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 2);
  assert.ok(race.filter((r) => r.status === "rejected").every((r) => /full|slot_taken/.test(String((r as PromiseRejectedResult).reason))));
  await fails(book({ ws, type: null, hosts: [users[0]!], start: "2026-11-11T16:10:00Z" }), "slot_taken");
});

test("a single-use link books once, even when opened twice at once", async () => {
  const { ws, users } = await workspace();
  const t = await type(ws, "one", [users[0]!]);
  const link = (await q(`insert into meeting_links (workspace_id, kind, type_id, owner_user_id, token_hash) values ($1, 'single_use', $2, $3, $4) returning id`, [ws, t, users[0], randomUUID()]))[0].id as string;
  const race = await Promise.allSettled([
    book({ ws, type: t, hosts: [users[0]!], start: "2026-11-12T15:00:00Z", link }),
    book({ ws, type: t, hosts: [users[0]!], start: "2026-11-12T17:00:00Z", link }),
  ]);
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  assert.match(String((race.find((r) => r.status === "rejected") as PromiseRejectedResult).reason), /link_used/);
  assert.ok((await q(`select used_at, meeting_id from meeting_links where id = $1`, [link]))[0].meeting_id);
});

test("an unpaid hold keeps the time for 10 minutes, then lets it go", async () => {
  const { ws, users } = await workspace();
  const id = await book({ ws, type: null, hosts: [users[0]!], start: "2026-11-13T15:00:00Z", status: "pending_payment" });
  await fails(book({ ws, type: null, hosts: [users[0]!], start: "2026-11-13T15:00:00Z" }), "slot_taken");
  await q(`update meetings set created_at = now() - interval '11 minutes' where id = $1`, [id]);
  await book({ ws, type: null, hosts: [users[0]!], start: "2026-11-13T15:00:00Z" });
  // The late payment can no longer turn into a booking over the new meeting: the server checks before calling it.
  await q(`select meeting_status($1, 'canceled', 'payment too late')`, [id]);
});

test("moving a meeting checks the new time and leaves its own old time out", async () => {
  const { ws, users } = await workspace();
  const a = await book({ ws, type: null, hosts: [users[0]!], start: "2026-11-16T15:00:00Z" });
  await book({ ws, type: null, hosts: [users[0]!], start: "2026-11-16T17:00:00Z" });
  await q(`select meeting_move($1, $2, '2026-11-16T15:15:00Z', '2026-11-16T15:45:00Z', '2026-11-16T15:15:00Z', '2026-11-16T15:45:00Z')`, [a, [users[0]]]);
  await fails(q(`select meeting_move($1, $2, '2026-11-16T17:15:00Z', '2026-11-16T17:45:00Z', '2026-11-16T17:15:00Z', '2026-11-16T17:45:00Z')`, [a, [users[0]]]), "slot_taken");
  await q(`select meeting_move($1, $2, '2026-11-16T17:15:00Z', '2026-11-16T17:45:00Z', '2026-11-16T17:15:00Z', '2026-11-16T17:45:00Z')`, [a, [users[1]]]);
  const kinds = (await q(`select kind from meeting_events where meeting_id = $1 order by id`, [a])).map((r) => r.kind);
  assert.deepEqual(kinds, ["booked", "moved", "moved"]);
});

test("status changes follow the rules, and canceled or no-show meetings give the round-robin turn back", async () => {
  const { ws, users } = await workspace();
  const t = await type(ws, "round_robin", users.slice(0, 2));
  const past = await book({ ws, type: t, hosts: [users[0]!], start: "2020-01-06T15:00:00Z" });
  const future = await book({ ws, type: t, hosts: [users[0]!], start: "2030-01-07T15:00:00Z" });
  await book({ ws, type: t, hosts: [users[1]!], start: "2030-01-07T15:00:00Z" });
  const turns = async () => Object.fromEntries((await q(`select user_id, n from rr_turns($1)`, [t])).map((r) => [r.user_id, r.n]));
  assert.deepEqual(await turns(), { [users[0]!]: 2, [users[1]!]: 1 });
  await fails(q(`select meeting_status($1, 'held')`, [future]), "not_started");
  await q(`select meeting_status($1, 'no_show')`, [past]);
  await q(`select meeting_status($1, 'held')`, [past]);
  await q(`select meeting_status($1, 'no_show')`, [past]);
  await q(`select meeting_status($1, 'canceled', 'Out sick')`, [future]);
  await fails(q(`select meeting_status($1, 'booked')`, [future]), "bad_change");
  assert.deepEqual(await turns(), { [users[1]!]: 1 });
  // A canceled meeting frees its time.
  await book({ ws, type: t, hosts: [users[0]!], start: "2030-01-07T15:00:00Z" });
});

test("members read their workspace's meetings, the public reads nothing, and busy times stay server-only", async () => {
  const { ws, users } = await workspace();
  const other = await workspace();
  await book({ ws, type: null, hosts: [users[0]!], start: "2026-11-20T15:00:00Z" });
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [other.users[0]]);
    await c.query("set local role authenticated");
    assert.equal((await c.query(`select count(*)::int n from meetings where workspace_id = $1`, [ws])).rows[0].n, 0);
    await assert.rejects(c.query(`select * from busy_blocks limit 1`));
    await c.query("rollback");
    await c.query("begin");
    await c.query("set local role anon");
    await assert.rejects(c.query(`select * from meetings limit 1`));
    await c.query("rollback");
    await c.query("begin");
    await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [users[1]]);
    await c.query("set local role authenticated");
    assert.equal((await c.query(`select count(*)::int n from meetings where workspace_id = $1`, [ws])).rows[0].n, 1);
    await assert.rejects(c.query(`select meeting_book($1, null, $2, now(), now() + interval '1 hour', now(), now() + interval '1 hour', '{}', 'page', 'x')`, [ws, [users[1]]]));
    await c.query("rollback");
  } finally {
    c.release();
  }
});
