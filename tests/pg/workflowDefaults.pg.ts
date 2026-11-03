// The starting workflows (migration 119): Notification and Follow-up, filed once per workspace ahead of older folders,
// as drafts, against a real database built from every migration (scripts/test-db.sh).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import pg from "pg";
import { startingItems } from "../../src/lib/workflows/templates.ts";
import { uuid7 } from "./ids.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 4 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

async function asUser<T>(who: string, sql: string, params: unknown[]): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query(`select set_config('request.jwt.claim.sub', $1, false)`, [who]);
    return (await c.query(sql, params)).rows[0].r as T;
  } finally {
    await c.query(`select set_config('request.jwt.claim.sub', '', false)`);
    c.release();
  }
}

async function workspace(name: string) {
  const ws = uuid7();
  const user = uuid7();
  await q(`insert into workspaces (id, name) values ($1, $2)`, [ws, name]);
  await q(`insert into auth.users (id, email) values ($1, $2)`, [user, `${user}@t.io`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, user]);
  return { ws, user };
}

const items = JSON.stringify(startingItems());
const tree = async (ws: string) =>
  (await q(`select f.name folder, w.name, w.status from workflow_folders f left join workflows w on w.folder_id = f.id where f.workspace_id = $1 order by f.position, w.created_at, w.name`, [ws])).map(
    (r) => `${r.folder}: ${r.name ?? "-"} (${r.status ?? "-"})`,
  );

let a = { ws: "", user: "" };
before(async () => {
  a = await workspace("starting set");
});

test("a new workspace: no empty Workflows folder, then Notification and Follow-up as drafts, only the first time", async () => {
  assert.equal(await asUser(a.user, `select workflow_folders_start($1) as r`, [a.ws]), 0, "nothing to file, so no folder");
  assert.equal(await asUser(a.user, `select workflow_defaults($1, $2::jsonb) as r`, [a.ws, items]), 5);
  assert.deepEqual(await tree(a.ws), [
    "Notification: Form announcement (draft)",
    "Notification: Meeting announcement (draft)",
    "Follow-up: Form follow-up (draft)",
    "Follow-up: Meeting follow-up (draft)",
    "Follow-up: No-show follow-up (draft)",
  ]);
  assert.equal(await asUser(a.user, `select workflow_defaults($1, $2::jsonb) as r`, [a.ws, items]), 0, "only once");
  assert.equal(await asUser(a.user, `select workflow_folders_start($1) as r`, [a.ws]), 0);
  const drafts = await q(`select draft from workflows where workspace_id = $1`, [a.ws]);
  assert.ok(drafts.every((d) => d.draft.steps.filter((s: { kind: string }) => s.kind === "email").every((s: { approved: boolean }) => !s.approved)), "emails start unapproved");

  // Deleting one keeps it deleted: the next visit makes nothing.
  const one = (await q(`select id from workflows where workspace_id = $1 and name = 'Meeting follow-up'`, [a.ws]))[0].id;
  await asUser(a.user, `select workflow_delete($1) as r`, [one]);
  assert.equal(await asUser(a.user, `select workflow_defaults($1, $2::jsonb) as r`, [a.ws, items]), 0);
  assert.equal((await q(`select count(*)::int n from workflows where workspace_id = $1`, [a.ws]))[0].n, 4);
});

test("an older workspace keeps its workflows; the starting folders go first", async () => {
  const b = await workspace("older");
  await q(`insert into workflows (workspace_id, name, stage) values ($1, 'Missed demo', 'pipeline')`, [b.ws]);
  await q(`insert into workflows (workspace_id, name) values ($1, 'Broadcast')`, [b.ws]);
  assert.equal(await asUser(b.user, `select workflow_folders_start($1) as r`, [b.ws]), 2);
  assert.equal(await asUser(b.user, `select workflow_defaults($1, $2::jsonb) as r`, [b.ws, items]), 5);
  const folders = (await q(`select name, position from workflow_folders where workspace_id = $1 order by position`, [b.ws])).map((f) => `${f.position} ${f.name}`);
  assert.deepEqual(folders, ["0 Notification", "1 Follow-up", "2 Pipeline", "3 Workflows"]);
  assert.equal((await q(`select count(*)::int n from workflows where workspace_id = $1`, [b.ws]))[0].n, 7);
});

test("only members, and only a sane list", async () => {
  const c = await workspace("other");
  await assert.rejects(asUser(c.user, `select workflow_defaults($1, $2::jsonb) as r`, [a.ws, items]), /Workspace not found/);
  await assert.rejects(asUser(c.user, `select workflow_defaults($1, '{}'::jsonb) as r`, [c.ws]), /Bad starting workflows/);
  await assert.rejects(asUser(c.user, `select workflow_defaults($1, '[{"folder":"A","name":"","draft":{}}]'::jsonb) as r`, [c.ws]), /Bad starting workflows/);
});
