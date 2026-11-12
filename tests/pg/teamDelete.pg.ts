// Deleting a team on a real database (supabase/migrations/148_team_delete.sql): refused, with names, while a routing
// policy (draft or live), a meeting type or a form still sends to it; the starting team stays; a stale revision is
// refused; once nothing uses it the team is gone from every list, and deleting it again says so.
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
  const u = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, 'Acme')`, [ws]);
  await q(`insert into auth.users (id, email) values ($1, $2)`, [u, `${u}@t.io`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, u]);
  const make = async (name: string, key?: string) => (await q(`select routing_team_save($1, null, $2, 'rr', $3, null, $4) r`, [ws, name, JSON.stringify([{ user: u, weight: 1 }]), key ?? null]))[0].r as { id: string; key: string; revision: number };
  return { ws, u, make };
}
const del = async (ws: string, team: string, revision: number | null = null) => (await q(`select routing_team_delete($1, $2, $3) r`, [ws, team, revision]))[0].r as { deleted: boolean; used_by?: { kind: string; name: string }[] };
const listed = async (ws: string) => Object.keys((await q(`select routing_team_list($1) r`, [ws]))[0].r);

test("a team nothing sends to is deleted and leaves every list; again says it's gone", async () => {
  const s = await setup();
  const t = await s.make("Enterprise 2");
  assert.ok((await listed(s.ws)).includes(t.key));
  assert.deepEqual(await del(s.ws, t.id, t.revision), { deleted: true });
  assert.ok(!(await listed(s.ws)).includes(t.key));
  await assert.rejects(del(s.ws, t.id), /not_found/);
});

test("refused while a policy draft, a live policy, a meeting type or a form sends to it, with their names", async () => {
  const s = await setup();
  const t = await s.make("Enterprise");
  const body = { v: 2, rules: { on: true, list: [{ id: "r1", queue: t.key, conds: [] }] } };
  const pol = (await q(`insert into routing_policies (workspace_id, name, draft) values ($1, 'Inbound', $2) returning id`, [s.ws, body]))[0].id;
  assert.deepEqual((await del(s.ws, t.id)).used_by, [{ kind: "policy", name: "Inbound" }]);
  // Live only: the draft is cleared, the published version still names the team.
  await q(`insert into routing_policy_versions (policy_id, workspace_id, version, config) values ($1, $2, 1, $3)`, [pol, s.ws, body]);
  await q(`update routing_policies set draft = null, active_version = 1 where id = $1`, [pol]);
  assert.deepEqual((await del(s.ws, t.id)).used_by, [{ kind: "policy", name: "Inbound" }]);
  await q(`update routing_policies set archived_at = now() where id = $1`, [pol]);
  // A meeting type hosted by the team, and a form whose rule books with it.
  await q(`insert into meeting_types (workspace_id, slug, name, kind, hosts, settings) values ($1, 'demo', 'Demo', 'round_robin', '[]', $2)`, [s.ws, { team: t.key }]);
  await q(`insert into forms (workspace_id, name, draft) values ($1, 'Demo request', $2)`, [s.ws, { after: { schedule: { routes: [{ id: "r1", with: { kind: "team", id: t.key } }] } } }]);
  const r = await del(s.ws, t.id);
  assert.equal(r.deleted, false);
  assert.deepEqual(r.used_by, [{ kind: "form", name: "Demo request" }, { kind: "meeting", name: "Demo" }]);
  assert.ok((await listed(s.ws)).includes(t.key), "still there");
  // Moved off it: deleted.
  await q(`update meeting_types set settings = '{}' where workspace_id = $1`, [s.ws]);
  await q(`update forms set draft = '{}' where workspace_id = $1`, [s.ws]);
  assert.equal((await del(s.ws, t.id)).deleted, true);
});

test("the starting team stays, and a stale revision is refused", async () => {
  const s = await setup();
  const whole = await s.make("Whole team", "q_everyone");
  await assert.rejects(del(s.ws, whole.id), /starting team/);
  const t = await s.make("Partners");
  await assert.rejects(del(s.ws, t.id, t.revision + 5), /draft_conflict/);
  // A team with a key that only starts the same ("t_x" vs "t_x2") is not a use.
  const other = await s.make("Other", `${t.key}2`);
  await q(`insert into meeting_types (workspace_id, slug, name, kind, hosts, settings) values ($1, 'other-team', 'X', 'round_robin', '[]', $2)`, [s.ws, { team: other.key }]);
  assert.equal((await del(s.ws, t.id)).deleted, true);
});
