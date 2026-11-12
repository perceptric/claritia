// Campaign drafts on a real database (supabase/migrations/150_campaign_drafts.sql): a member makes and saves a draft
// with no subject yet; someone outside the workspace can't; a sent email never changes through the draft save; a
// draft that sent nothing can be deleted and one that did can't; past draft, a subject is required; and the
// Campaigns list shows the draft.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import pg from "pg";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 2 });
let c: pg.PoolClient;
const q = async (sql: string, p: unknown[] = []) => (await c.query(sql, p)).rows;
before(async () => {
  c = await pool.connect();
});
after(async () => {
  c.release();
  await pool.end();
});
const as = (user: string) => q(`select set_config('request.jwt.claim.sub', $1, false)`, [user]);

async function workspace() {
  const ws = randomUUID();
  const user = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, 'Juniper')`, [ws]);
  await q(`insert into auth.users (id, email) values ($1, $2)`, [user, `${user}@t.io`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')`, [ws, user]);
  return { ws, user };
}
const doc = { v: 1, sections: [] };
const save = (ws: string, id: string | null, subject = "", name = "Untitled email") => q(`select email_draft_save($1, $2, $3, $4, '', $5) id`, [ws, id, name, subject, doc]).then((r) => r[0].id as string);

test("a member makes a draft with no subject, saves it, and it lists as a draft", async () => {
  const { ws, user } = await workspace();
  await as(user);
  const id = await save(ws, null);
  assert.equal(await save(ws, id, "Spring reset", "Spring reset"), id);
  const row = (await q(`select name, subject, status, kind, doc from emails where id = $1`, [id]))[0];
  assert.deepEqual([row.name, row.subject, row.status, row.kind, row.doc], ["Spring reset", "Spring reset", "draft", "broadcast", doc]);
  assert.deepEqual((await q(`select name, status, sent from email_campaigns($1)`, [ws])).map((r) => [r.name, r.status, r.sent]), [["Spring reset", "draft", 0]]);
  await as("");
});

test("someone outside the workspace can't make or save a draft", async () => {
  const { ws, user } = await workspace();
  await as(user);
  const id = await save(ws, null);
  const other = await workspace();
  await as(other.user);
  await assert.rejects(save(ws, null), /Workspace not found/);
  await assert.rejects(save(ws, id, "Hijack"), /Workspace not found/);
  await as("");
});

test("a sent email never changes through the draft save, and past draft it needs a subject", async () => {
  const { ws, user } = await workspace();
  await as(user);
  const id = await save(ws, null, "Hi");
  await q(`update emails set status = 'sent' where id = $1`, [id]);
  await assert.rejects(save(ws, id, "Changed"), /not a draft anymore/);
  assert.equal((await q(`select subject from emails where id = $1`, [id]))[0].subject, "Hi");
  const blank = await save(ws, null);
  await assert.rejects(q(`update emails set status = 'scheduled' where id = $1`, [blank]), /emails_subject_check/);
  await as("");
});

test("a draft that sent nothing is deleted; one with messages stays", async () => {
  const { ws, user } = await workspace();
  await as(user);
  const a = await save(ws, null);
  const b = await save(ws, null, "Test");
  await q(`insert into email_messages (workspace_id, email_id, to_email, dedupe, status) values ($1, $2, 'x@t.io', $3, 'sent')`, [ws, b, randomUUID()]);
  assert.equal((await q(`select email_draft_delete($1, $2) ok`, [ws, a]))[0].ok, true);
  assert.equal((await q(`select email_draft_delete($1, $2) ok`, [ws, b]))[0].ok, false);
  assert.deepEqual((await q(`select id from emails where workspace_id = $1`, [ws])).map((r) => r.id), [b]);
  await as("");
});
