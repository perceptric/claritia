// Automations that start when someone joins a list (supabase/migrations/153_list_trigger.sql): joining by any way in
// leaves one event; the workflow starts once per join, for that list only (or any list), never for a repeat add, never
// twice when scans overlap, and only for joins after it went live.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 4 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

async function setup() {
  const ws = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, 'Juniper')`, [ws]);
  const ids: string[] = [];
  for (let i = 0; i < 4; i++) ids.push((await q(`insert into contacts (workspace_id, email, email_clean) values ($1, $2, $2) returning id`, [ws, `p${i}-${ws.slice(0, 6)}@x.io`]))[0].id);
  const list = async (name: string) => (await q(`insert into lists (workspace_id, name) values ($1, $2) returning id`, [ws, name]))[0].id as string;
  return { ws, ids, a: await list("Workshop"), b: await list("Retreat") };
}
async function live(ws: string, lists: string[]) {
  const id = (await q(`insert into workflows (workspace_id, name, status, live_version, trigger_kind, live_at) values ($1, 'On join', 'live', 1, 'list', now() - interval '1 minute') returning id`, [ws]))[0].id as string;
  await q(`insert into workflow_versions (workflow_id, workspace_id, version, body) values ($1, $2, 1, $3)`, [id, ws, { trigger: { kind: "list", lists }, steps: [], entry: { mode: "once" } }]);
  return id;
}
const join = (s: Awaited<ReturnType<typeof setup>>, list: string, who: string[]) => q(`insert into list_members (list_id, contact_id, workspace_id) select $1, c, $2 from unnest($3::uuid[]) c on conflict do nothing`, [list, s.ws, who]);
const runs = async (wf: string) => (await q(`select contact_id from workflow_runs where workflow_id = $1 order by contact_id`, [wf])).map((r) => r.contact_id as string);

test("one start per join, for that list only; a repeat add and overlapping scans start nothing more", async () => {
  const s = await setup();
  const wf = await live(s.ws, [s.a]);
  const any = await live(s.ws, []);
  await join(s, s.a, [s.ids[0]!, s.ids[1]!]);
  await join(s, s.b, [s.ids[2]!]);
  await join(s, s.a, [s.ids[0]!]); // already in: no new event
  assert.equal((await q(`select count(*)::int n from contact_events where workspace_id = $1 and kind = 'list.joined'`, [s.ws]))[0].n, 3);
  await Promise.all([q(`select workflow_scan()`), q(`select workflow_scan()`)]);
  await q(`select workflow_scan()`);
  assert.deepEqual(await runs(wf), [s.ids[0], s.ids[1]].sort());
  assert.deepEqual(await runs(any), [s.ids[0], s.ids[1], s.ids[2]].sort(), "any list");
});

test("joins before the workflow went live don't start it", async () => {
  const s = await setup();
  await join(s, s.a, [s.ids[3]!]);
  await q(`update contact_events set at = now() - interval '2 hours' where workspace_id = $1 and kind = 'list.joined'`, [s.ws]);
  const wf = await live(s.ws, [s.a]);
  await q(`select workflow_scan()`);
  assert.deepEqual(await runs(wf), []);
});

test("the brand voice: a member saves it, trimmed; someone outside can't; blank clears it", async () => {
  const ws = randomUUID();
  const user = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, 'Juniper')`, [ws]);
  await q(`insert into auth.users (id, email) values ($1, $2)`, [user, `${user}@t.io`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')`, [ws, user]);
  const kit = (await q(`insert into brand_kits (workspace_id, name) values ($1, 'Juniper') returning id`, [ws]))[0].id;
  const save = (who: string, brief: string) => q(`select set_config('request.jwt.claim.sub', $4, true), brand_brief_save($1, $2, $3) ok`, [ws, kit, brief, who]);
  await save(user, "  Warm and calm.  ");
  assert.equal((await q(`select brief from brand_kits where id = $1`, [kit]))[0].brief, "Warm and calm.");
  await assert.rejects(save(randomUUID(), "Hijack"), /Workspace not found/);
  await save(user, "   ");
  assert.equal((await q(`select brief from brand_kits where id = $1`, [kit]))[0].brief, null);
});
