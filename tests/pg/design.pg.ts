// The design system on a real database (docs/design-system.md Parts 8 and 11.3): two people saving the same design at
// once never overwrite each other unseen; a draft reaches live forms only when published; only members publish; and
// the live form carries the published design.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import pg from "pg";
import { uuid7 } from "../../collect/ids.ts";
import { checkForm } from "../../src/lib/forms/schema.ts";
import { TEMPLATES } from "../../src/lib/forms/templates.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 6 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

async function workspace() {
  const ws = uuid7();
  const user = uuid7();
  await q(`insert into workspaces (id, name) values ($1, 'Design')`, [ws]);
  await q(`insert into auth.users (id, email) values ($1, $2)`, [user, `${user}@t.io`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, user]);
  const kit = (await q(`select brand_kit_save($1, $2, null, 'Acme', '{}') as id`, [user, ws]))[0].id as string;
  return { ws, user, kit };
}

async function asUser<T>(user: string, sql: string, params: unknown[]): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user]);
    return (await c.query(sql, params)).rows[0]?.r as T;
  } finally {
    await c.query(`select set_config('request.jwt.claim.sub', '', false)`);
    c.release();
  }
}

const save = (user: string, kit: string, design: object, rev: number) => q(`select brand_kit_design_save($1, $2, $3, $4) as r`, [user, kit, design, rev]).then((r) => r[0].r as number);

test("two saves from the same rev at once: one lands, the other is refused, nothing is lost unseen", async () => {
  const { user, kit } = await workspace();
  const a = { globals: { label: { base: { color: "#111111" } } } };
  const b = { globals: { label: { base: { color: "#222222" } } } };
  const results = await Promise.allSettled([save(user, kit, a, 0), save(user, kit, b, 0)]);
  const ok = results.filter((r) => r.status === "fulfilled");
  const refused = results.filter((r) => r.status === "rejected");
  assert.equal(ok.length, 1);
  assert.equal(refused.length, 1);
  assert.match(String((refused[0] as PromiseRejectedResult).reason), /Changed elsewhere/);
  const row = (await q(`select design, design_rev from brand_kits where id = $1`, [kit]))[0];
  assert.equal(row.design_rev, 1);
  // The one that landed is whole, not a mix of the two.
  assert.ok(JSON.stringify(row.design) === JSON.stringify(a) || JSON.stringify(row.design) === JSON.stringify(b));
  // Saving again from the new rev works.
  assert.equal(await save(user, kit, a, 1), 2);
  // Someone outside the workspace can't save.
  const other = await workspace();
  await assert.rejects(save(other.user, kit, a, 2), /not found/);
});

test("a draft reaches the live form only when published, and only a member publishes", async () => {
  const { ws, user, kit } = await workspace();
  const r = checkForm(TEMPLATES.find((t) => t.key === "demo")!.form());
  assert.ok("form" in r);
  const id = (await q(`insert into forms (workspace_id, name, draft, brand_kit_id) values ($1, 'Demo', $2, $3) returning id`, [ws, r.form, kit]))[0].id as string;
  await q(`select form_publish($1, $2, $3)`, [id, user, r.form]);
  const draft = { globals: { button: { base: { "border-top-left-radius": "999px" } } } };
  await save(user, kit, draft, 0);
  const live = async () => (await q(`select form_public($1) as f`, [id]))[0].f.design;
  assert.deepEqual(await live(), {}, "saving the draft doesn't change the live form");
  const uses = await asUser<{ live_forms: number; changed: boolean }>(user, `select brand_kit_design_uses($1) as r`, [kit]);
  assert.equal(uses.live_forms, 1);
  assert.equal(uses.changed, true);
  const other = await workspace();
  await assert.rejects(asUser(other.user, `select brand_kit_design_publish($1) as r`, [kit]), /not found/);
  await asUser(user, `select brand_kit_design_publish($1) as r`, [kit]);
  assert.deepEqual(await live(), draft);
  assert.equal((await asUser<{ changed: boolean }>(user, `select brand_kit_design_uses($1) as r`, [kit])).changed, false);
});

test("images: only members add or delete them, and only their workspace's", async () => {
  const { ws, user } = await workspace();
  const other = await workspace();
  const add = (u: string, w: string) => q(`select design_asset_add($1, $2, $3, $4, 'logo.png', 'image/png', 10, 20, 300) as id`, [w, u, `${w}/a.png`, `https://cdn.test/${w}/a.png`]).then((r) => r[0].id as string);
  const id = await add(user, ws);
  await assert.rejects(add(other.user, ws), /not found/, "someone outside the workspace can't add to it");
  await assert.rejects(asUser(other.user, `select design_asset_delete($1) as r`, [id]), /not found/);
  assert.equal(await asUser<string>(user, `select design_asset_delete($1) as r`, [id]), `${ws}/a.png`, "deleting hands back the file to remove");
  assert.equal((await q(`select count(*)::int n from design_assets where id = $1`, [id]))[0].n, 0);
  await assert.rejects(q(`insert into design_assets (workspace_id, path, url, type, width, height, bytes) values ($1, 'x', 'y', 'image/svg+xml', 1, 1, 1)`, [ws]), /check/, "only the four image types");
});

test("email versions: only members add them, members read their own, and the last 50 are kept", async () => {
  const { ws, user } = await workspace();
  const other = await workspace();
  const add = (u: string, n: number) => q(`select email_version_add($1, $2, 'tpl:0190f5a2-1c3b-7d4e-8f90-123456789abc', $3, 'Subject', $4, true) as id`, [ws, u, { v: 1, n }, `v${n}`]);
  await assert.rejects(add(other.user, 0), /not found/);
  for (let n = 1; n <= 52; n++) await add(user, n);
  const rows = await q(`select note from email_versions where workspace_id = $1 order by created_at desc, note desc`, [ws]);
  assert.equal(rows.length, 50);
  assert.ok(!rows.some((r) => r.note === "v1" || r.note === "v2"), "the oldest go");
  // Read as a signed-in person, through row level security.
  const seen = async (u: string) => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("set local role authenticated");
      await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [u]);
      return (await c.query(`select count(*)::int as n from email_versions where workspace_id = $1`, [ws])).rows[0].n as number;
    } finally {
      await c.query("rollback");
      c.release();
    }
  };
  assert.equal(await seen(other.user), 0, "another workspace sees none");
  assert.equal(await seen(user), 50);
});
