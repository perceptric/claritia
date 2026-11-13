// Email groups on a real database (supabase/migrations/158_email_groups.sql): emails go in at a place and the rest
// close up; an email moves between groups; deleting a group keeps its emails; another workspace can't touch them.
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
    return await fn(async (sql, p = []) => (await c.query(sql, p)).rows);
  } finally {
    await c.query(`select set_config('request.jwt.claim.sub', '', false)`);
    c.release();
  }
}

async function setup() {
  const ws = randomUUID();
  const user = randomUUID();
  await pool.query(`insert into workspaces (id, name) values ($1, 'Juniper')`, [ws]);
  await pool.query(`insert into auth.users (id, email) values ($1, $2)`, [user, `${user}@t.io`]);
  await pool.query(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')`, [ws, user]);
  const email = async (name: string) => (await pool.query(`insert into emails (workspace_id, name, kind, subject, html, text, status) values ($1, $2, 'broadcast', '', '', '', 'draft') returning id`, [ws, name])).rows[0].id as string;
  return { ws, user, email };
}
const order = async (group: string) => (await pool.query(`select name, group_position from emails where group_id = $1 order by group_position`, [group])).rows.map((r) => `${r.group_position}:${r.name}`);

test("emails go in at a place, move, leave and close up; deleting the group keeps them", async () => {
  const s = await setup();
  const [welcome, reminder, news, promo] = [await s.email("Welcome"), await s.email("Reminder"), await s.email("News"), await s.email("Promo")];
  await as(s.user, async (q) => {
    const g = (await q(`select email_group_save($1, null, ' Welcome series ') id`, [s.ws]))[0]!.id as string;
    const place = (e: string, grp: string | null, pos: number | null) => q(`select email_group_place($1, $2, $3, $4)`, [s.ws, e, grp, pos]);
    for (const e of [welcome, reminder, news]) await place(e, g, null);
    assert.deepEqual(await order(g), ["0:Welcome", "1:Reminder", "2:News"]);
    await place(news, g, 0);
    assert.deepEqual(await order(g), ["0:News", "1:Welcome", "2:Reminder"]);
    await place(promo, g, 1);
    assert.deepEqual(await order(g), ["0:News", "1:Promo", "2:Welcome", "3:Reminder"]);
    // Move to another group: the first closes up.
    const g2 = (await q(`select email_group_save($1, null, 'Promotions') id`, [s.ws]))[0]!.id as string;
    await place(promo, g2, 0);
    assert.deepEqual(await order(g), ["0:News", "1:Welcome", "2:Reminder"]);
    assert.deepEqual(await order(g2), ["0:Promo"]);
    await place(welcome, null, null);
    assert.deepEqual(await order(g), ["0:News", "1:Reminder"]);
    await q(`select email_group_save($1, $2, 'Onboarding')`, [s.ws, g]);
    assert.equal((await pool.query(`select name from email_groups where id = $1`, [g])).rows[0].name, "Onboarding");
    await assert.rejects(q(`select email_group_save($1, null, '  ')`, [s.ws]), /Name the group/);
    await q(`select email_group_delete($1, $2)`, [s.ws, g]);
  });
  assert.equal((await pool.query(`select count(*)::int n from emails where workspace_id = $1`, [s.ws])).rows[0].n, 4, "the emails stay");
  assert.equal((await pool.query(`select count(*)::int n from emails where id = any($1) and group_id is null`, [[news, reminder]])).rows[0].n, 2);
});

test("another workspace can't place, rename or delete", async () => {
  const a = await setup();
  const b = await setup();
  const e = await a.email("Welcome");
  const g = await as(a.user, async (q) => (await q(`select email_group_save($1, null, 'Series') id`, [a.ws]))[0]!.id as string);
  await as(b.user, async (q) => {
    await assert.rejects(q(`select email_group_place($1, $2, $3, 0)`, [a.ws, e, g]), /Workspace not found/);
    await assert.rejects(q(`select email_group_place($1, $2, $3, 0)`, [b.ws, e, g]), /Email not found/);
    await assert.rejects(q(`select email_group_save($1, $2, 'Mine')`, [b.ws, g]), /Group not found/);
    assert.equal((await q(`select email_group_delete($1, $2) ok`, [b.ws, g]))[0]!.ok, false);
  });
  const other = await b.email("Other");
  await as(b.user, async (q) => {
    await assert.rejects(q(`select email_group_place($1, $2, $3, 0)`, [b.ws, other, g]), /Group not found/);
  });
});
