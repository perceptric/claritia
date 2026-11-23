// source_hook_secret_save (172): after setup, a tool that hands back a signing secret for its hooks (Omniscient) has
// it saved on its own. It replaces the old secret and leaves the source's settings as they were.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import pg from "pg";
import { uuid7 } from "./ids.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 2 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());
const rpc = pgRpc(pool);

test("a hook secret saved after setup replaces the old one and leaves the settings alone", async () => {
  const ws = uuid7();
  const user = uuid7();
  await q(`insert into workspaces (id, name) values ($1, 'hooks')`, [ws]);
  await q(`insert into auth.users (id, email) values ($1, $2)`, [user, `${user.slice(0, 8)}@t.io`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, user]);
  await q(`insert into workspace_billing (workspace_id, plan) values ($1, 'starter')`, [ws]);
  const source = (await q(`insert into sources (workspace_id, kind, name, settings, created_by, status) values ($1, 'omniscient', 'Omniscient', $2, $3, 'active') returning id`, [ws, JSON.stringify({ every_min: 30 }), user]))[0].id as string;
  await q(`insert into source_secrets (source_id, sealed, hook_sealed) values ($1, 'v1:creds', 'v1:first')`, [source]);

  const { error } = await rpc("source_hook_secret_save", { p_id: source, p_hook_sealed: "v1:second" });
  assert.equal(error, null);
  assert.equal((await q(`select hook_sealed from source_secrets where source_id = $1`, [source]))[0].hook_sealed, "v1:second");
  assert.equal((await q(`select settings->>'every_min' as m from sources where id = $1`, [source]))[0].m, "30");
});

test("people can't call it", async () => {
  const [{ ok }] = await q(`select has_function_privilege('authenticated', 'public.source_hook_secret_save(uuid, text)', 'execute') as ok`);
  assert.equal(ok, false);
});
