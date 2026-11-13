// Versions and comments on the email canvas, on a real database (supabase/migrations/160_canvas_versions_comments.sql;
// docs/email-canvas-b5.md sections 4, 5 and 9).
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
  const [owner, member, outsider] = [randomUUID(), randomUUID(), randomUUID()];
  await pool.query(`insert into workspaces (id, name) values ($1, 'Juniper')`, [ws]);
  for (const u of [owner, member, outsider]) await pool.query(`insert into auth.users (id, email) values ($1, $2)`, [u, `${u}@t.io`]);
  await pool.query(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'member')`, [ws, owner, member]);
  return { ws, owner, member, outsider };
}
const doc = (n: number) => JSON.stringify({ v: 1, sections: [], n });

test("email_draft_save records who saved last", async () => {
  const s = await setup();
  const id = await as(s.member, async (q) => (await q(`select email_draft_save($1, null, 'A', 'S', '', $2::jsonb) id`, [s.ws, doc(1)]))[0]!.id as string);
  assert.equal((await pool.query(`select updated_by from emails where id = $1`, [id])).rows[0].updated_by, s.member);
  await as(s.owner, (q) => q(`select email_draft_save($1, $2, 'A', 'S', '', $3::jsonb)`, [s.ws, id, doc(2)]));
  assert.equal((await pool.query(`select updated_by from emails where id = $1`, [id])).rows[0].updated_by, s.owner);
});

test("versions: saved from the row, an unchanged save is skipped, 50 kept, outsiders refused", async () => {
  const s = await setup();
  const id = await as(s.member, async (q) => (await q(`select email_draft_save($1, null, 'A', 'S', '', $2::jsonb) id`, [s.ws, doc(1)]))[0]!.id as string);
  const save = (note: string) => as(s.member, async (q) => (await q(`select email_version_save($1, $2, $3) v`, [s.ws, id, note]))[0]!.v);
  assert.ok(await save("Edited"));
  assert.equal(await save("Edited"), null, "nothing changed since the last version");
  const v = (await pool.query(`select doc, note, created_by from email_versions where ref = $1`, [`em:${id}`])).rows;
  assert.equal(v.length, 1);
  assert.deepEqual(v[0].doc, JSON.parse(doc(1)));
  assert.equal(v[0].created_by, s.member);
  for (let i = 2; i <= 53; i++) {
    await as(s.member, (q) => q(`select email_draft_save($1, $2, 'A', 'S', '', $3::jsonb)`, [s.ws, id, doc(i)]));
    await save(`v${i}`);
  }
  assert.equal(Number((await pool.query(`select count(*) n from email_versions where ref = $1`, [`em:${id}`])).rows[0].n), 50);
  await assert.rejects(as(s.outsider, (q) => q(`select email_version_save($1, $2, 'x')`, [s.ws, id])), /Workspace not found/);
});

test("comments: members add, reply and resolve; only the author or an owner deletes; outsiders see nothing; deleting the email deletes them", async () => {
  const s = await setup();
  const id = await as(s.member, async (q) => (await q(`select email_draft_save($1, null, 'A', 'S', '', $2::jsonb) id`, [s.ws, doc(1)]))[0]!.id as string);
  const thread = await as(s.member, async (q) => (await q(`select email_comment_add($1, $2, 'h1', null, ' Shorter? ') c`, [s.ws, id]))[0]!.c as string);
  const reply = await as(s.owner, async (q) => (await q(`select email_comment_add($1, $2, null, $3, 'Agreed') c`, [s.ws, id, thread]))[0]!.c as string);
  const rows = (await pool.query(`select id, element_id, thread_id, body from email_comments where email_id = $1 order by created_at`, [id])).rows;
  assert.deepEqual(rows.map((r) => [r.element_id, r.thread_id === thread, r.body]), [["h1", true, "Shorter?"], ["h1", true, "Agreed"]], "a reply keeps the thread's part");
  await assert.rejects(as(s.member, (q) => q(`select email_comment_add($1, $2, null, null, '  ')`, [s.ws, id])), /2,000/);
  await as(s.member, (q) => q(`select email_comment_resolve($1, $2, true)`, [s.ws, thread]));
  assert.equal((await pool.query(`select count(*) n from email_comments where thread_id = $1 and resolved_at is not null`, [thread])).rows[0].n, "2");
  await assert.rejects(as(s.member, (q) => q(`select email_comment_delete($1, $2)`, [s.ws, reply])), /Only the author/);
  const seen = await as(s.outsider, async (q) => {
    await q(`set role authenticated`);
    const r = await q(`select count(*) n from email_comments where email_id = $1`, [id]);
    await q(`reset role`);
    return r;
  });
  assert.equal(seen[0]!.n, "0", "row security hides them from outsiders");
  await as(s.owner, (q) => q(`select email_comment_delete($1, $2)`, [s.ws, reply]));
  assert.equal((await pool.query(`select count(*) n from email_comments where email_id = $1`, [id])).rows[0].n, "1");
  const t2 = await as(s.member, async (q) => (await q(`select email_comment_add($1, $2, null, null, 'Second') c`, [s.ws, id]))[0]!.c as string);
  await as(s.member, (q) => q(`select email_comment_add($1, $2, null, $3, 'Reply')`, [s.ws, id, t2]));
  await as(s.member, (q) => q(`select email_comment_delete($1, $2)`, [s.ws, t2]));
  assert.equal((await pool.query(`select count(*) n from email_comments where thread_id = $1`, [t2])).rows[0].n, "0", "a thread's first comment takes its replies");
  await pool.query(`delete from emails where id = $1`, [id]);
  assert.equal((await pool.query(`select count(*) n from email_comments where email_id = $1`, [id])).rows[0].n, "0");
});
