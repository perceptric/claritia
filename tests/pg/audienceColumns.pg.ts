// Audiences' columns on a real database (supabase/migrations/162_audience_columns.sql; docs/email-unify-plan.md, E2):
// phone, title, country and lists come back, every column sorts with empty ones last, search matches phone numbers,
// and members edit a person's name and phone while outsiders can't.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 4 });
after(() => pool.end());

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

async function setup() {
  const ws = randomUUID();
  const [member, outsider] = [randomUUID(), randomUUID()];
  await pool.query(`insert into workspaces (id, name) values ($1, 'Juniper')`, [ws]);
  for (const u of [member, outsider]) await pool.query(`insert into auth.users (id, email) values ($1, $2)`, [u, `${u}@t.io`]);
  await pool.query(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')`, [ws, member]);
  const add = async (email: string, first: string | null, last: string | null, phone: string | null, at: string) =>
    (await pool.query(`insert into contacts (workspace_id, email, email_clean, first_name, last_name, phone, created_at) values ($1, $2, $2, $3, $4, $5, $6) returning id`, [ws, email, first, last, phone, at])).rows[0].id as string;
  const lee = await add("lee@acme.com", "Lee", "Park", "+1 415 555 0142", "2026-11-01");
  const ana = await add("ana@northwind.io", "Ana", "Diaz", null, "2026-11-03");
  const ben = await add("ben@ortiz.dev", null, "Ortiz", "+52 55 1234 5678", "2026-11-02");
  const list = (await pool.query(`insert into lists (workspace_id, name) values ($1, 'Webinar') returning id`, [ws])).rows[0].id as string;
  const list2 = (await pool.query(`insert into lists (workspace_id, name) values ($1, 'Test') returning id`, [ws])).rows[0].id as string;
  await pool.query(`insert into list_members (list_id, contact_id, workspace_id) values ($1, $2, $4), ($3, $2, $4)`, [list, lee, list2, ws]);
  return { ws, member, outsider, lee, ana, ben, list };
}

type Row = { id: string; first_name: string | null; phone: string | null; lists: string[] };
const people = (ws: string, user: string, o: { q?: string; sort?: string; desc?: boolean; list?: string } = {}) =>
  as(user, async (q) => (await q(`select * from audience_people($1, $2, null, 50, $3, $4, $5)`, [ws, o.q ?? null, o.list ?? null, o.sort ?? "added", o.desc ?? true])) as unknown as Row[]);

test("people come back with phone and lists, newest first by default", async () => {
  const s = await setup();
  const rows = await people(s.ws, s.member);
  assert.deepEqual(rows.map((r) => r.id), [s.ana, s.ben, s.lee]);
  const lee = rows.find((r) => r.id === s.lee)!;
  assert.equal(lee.phone, "+1 415 555 0142");
  assert.deepEqual(lee.lists, ["Test", "Webinar"]);
  assert.deepEqual(rows.find((r) => r.id === s.ana)!.lists, []);
});

test("every column sorts, and empty values go last both ways", async () => {
  const s = await setup();
  assert.deepEqual((await people(s.ws, s.member, { sort: "first", desc: false })).map((r) => r.first_name), ["Ana", "Lee", null]);
  assert.deepEqual((await people(s.ws, s.member, { sort: "first", desc: true })).map((r) => r.first_name), ["Lee", "Ana", null]);
  assert.deepEqual((await people(s.ws, s.member, { sort: "phone", desc: false })).map((r) => r.id), [s.lee, s.ben, s.ana]);
  assert.deepEqual((await people(s.ws, s.member, { sort: "added", desc: false })).map((r) => r.id), [s.lee, s.ben, s.ana]);
});

test("search matches a phone number written any way, and lists narrow it", async () => {
  const s = await setup();
  assert.deepEqual((await people(s.ws, s.member, { q: "(415) 555" })).map((r) => r.id), [s.lee]);
  assert.deepEqual((await people(s.ws, s.member, { q: "ortiz" })).map((r) => r.id), [s.ben]);
  assert.deepEqual((await people(s.ws, s.member, { list: s.list })).map((r) => r.id), [s.lee]);
  // Two digits aren't a phone search.
  assert.equal((await people(s.ws, s.member, { q: "55" })).length, 0);
});

test("a member edits a name, phone and country; empty clears; outsiders can't", async () => {
  const s = await setup();
  await as(s.member, (q) => q(`select audience_person_update($1, $2, $3)`, [s.ws, s.ben, JSON.stringify({ first_name: "  Ben ", phone: "", country: "mx" })]));
  const ben = (await pool.query(`select first_name, last_name, phone, country from contacts where id = $1`, [s.ben])).rows[0];
  assert.deepEqual(ben, { first_name: "Ben", last_name: "Ortiz", phone: null, country: "MX" });
  await assert.rejects(as(s.member, (q) => q(`select audience_person_update($1, $2, $3)`, [s.ws, s.ben, JSON.stringify({ country: "Mexico" })])), /two-letter/);
  await assert.rejects(as(s.outsider, (q) => q(`select audience_person_update($1, $2, $3)`, [s.ws, s.ben, JSON.stringify({ first_name: "X" })])), /not a member/);
  // Another workspace's person isn't found.
  const other = await setup();
  await assert.rejects(as(s.member, (q) => q(`select audience_person_update($1, $2, $3)`, [s.ws, other.lee, JSON.stringify({ first_name: "X" })])), /not found/);
});
