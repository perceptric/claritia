// Forms made from chat before signing up, on a real database (142_guest_forms.sql): a guest form is live at once in
// a workspace with no members; only its key changes it; it closes after 14 days; 20 a day per address; claiming makes
// the person its owner, drops the empty workspace their sign-in just made, and works once. Flaky cases: a wrong key,
// a second claim, a person who already has a real workspace (kept), and a closed form claimed late (opens again).
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 4 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

const h = (s: string) => createHash("sha256").update(s).digest("hex");
const BODY = { steps: [], page: { html: "<form></form>" } };

async function user(withWorkspace: "none" | "fresh" | "real") {
  const id = randomUUID();
  await q(`insert into auth.users (id, email) values ($1, $2)`, [id, `${id.slice(0, 8)}@t.io`]);
  if (withWorkspace === "none") return { id, ws: null as string | null };
  const ws = (await q(`insert into workspaces (name, named) values ('x', $1) returning id`, [withWorkspace === "real"]))[0].id as string;
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, id]);
  return { id, ws };
}

test("a guest form is live at once, held by its key, in a workspace nobody is in", async () => {
  const key = h(randomUUID()), ip = h(randomUUID());
  const fid = (await q(`select guest_form_make('Yoga sign-up', $1, $2, $3) as x`, [key, ip, BODY]))[0].x as string;
  const f = (await q(`select f.status, f.version, f.name, f.workspace_id, w.named, w.guest_until > now() + interval '13 days' as long from forms f join workspaces w on w.id = f.workspace_id where f.id = $1`, [fid]))[0];
  assert.deepEqual([f.status, f.version, f.name, f.named, f.long], ["live", 1, "Yoga sign-up", false, true]);
  assert.equal((await q(`select count(*)::int as n from workspace_members where workspace_id = $1`, [f.workspace_id]))[0].n, 0);
  assert.ok((await q(`select form_public($1) as x`, [fid]))[0].x, "the public read finds it");
  assert.equal((await q(`select guest_form_update($1, $2, 'Yoga', $3) as x`, [fid, key, BODY]))[0].x, 2);
  await assert.rejects(q(`select guest_form_update($1, $2, '', $3)`, [fid, h("wrong"), BODY]), /guest_form_not_found/);
  assert.deepEqual((await q(`select guest_state($1) as x`, [f.workspace_id]))[0].x.open, true);
  // Closed after 14 days: no more changes, and the public read shows it closed.
  await q(`update workspaces set guest_until = now() - interval '1 minute' where id = $1`, [f.workspace_id]);
  assert.equal((await q(`select guest_state($1) as x`, [f.workspace_id]))[0].x.open, false);
  await assert.rejects(q(`select guest_form_update($1, $2, '', $3)`, [fid, key, BODY]), /guest_form_not_found/);
});

test("one address makes at most 20 a day", async () => {
  const ip = h(randomUUID());
  for (let i = 0; i < 20; i++) await q(`select guest_form_make('f', $1, $2, $3)`, [h(randomUUID()), ip, BODY]);
  await assert.rejects(q(`select guest_form_make('f', $1, $2, $3)`, [h(randomUUID()), ip, BODY]), /too_many_guest_forms/);
  await q(`select guest_form_make('f', $1, $2, $3)`, [h(randomUUID()), h(randomUUID()), BODY]);
});

test("a new account claims it: owner of its workspace, the empty one from sign-in dropped, once only", async () => {
  const key = h(randomUUID());
  const fid = (await q(`select guest_form_make('Trial', $1, $2, $3) as x`, [key, h(randomUUID()), BODY]))[0].x as string;
  const u = await user("fresh");
  const r = (await q(`select guest_claim($1, $2) as x`, [key, u.id]))[0].x;
  assert.equal(r.form_id, fid);
  assert.equal((await q(`select role from workspace_members where workspace_id = $1 and user_id = $2`, [r.workspace_id, u.id]))[0].role, "owner");
  assert.equal((await q(`select count(*)::int as n from workspaces where id = $1`, [u.ws]))[0].n, 0, "the empty sign-in workspace is gone");
  assert.equal((await q(`select guest_state($1) as x`, [r.workspace_id]))[0].x, null, "no longer a guest workspace");
  assert.equal((await q(`select guest_claim($1, $2) as x`, [key, (await user("none")).id]))[0].x, null, "a second claim gets nothing");
  await assert.rejects(q(`select guest_form_update($1, $2, '', $3)`, [fid, key, BODY]), /guest_form_not_found/, "the key no longer changes it");
});

test("someone with a real workspace keeps it; a closed form claimed late opens again", async () => {
  const key = h(randomUUID());
  const fid = (await q(`select guest_form_make('Late', $1, $2, $3) as x`, [key, h(randomUUID()), BODY]))[0].x as string;
  const ws = (await q(`select workspace_id from forms where id = $1`, [fid]))[0].workspace_id;
  await q(`update workspaces set guest_until = now() - interval '1 day' where id = $1`, [ws]);
  const u = await user("real");
  const r = (await q(`select guest_claim($1, $2) as x`, [key, u.id]))[0].x;
  assert.equal(r.workspace_id, ws);
  assert.equal((await q(`select count(*)::int as n from workspaces where id = $1`, [u.ws]))[0].n, 1, "a named workspace is kept");
  assert.equal((await q(`select guest_state($1) as x`, [ws]))[0].x, null, "open again");
  // An unnamed one with a form in it is kept too.
  const k2 = h(randomUUID());
  await q(`select guest_form_make('Two', $1, $2, $3)`, [k2, h(randomUUID()), BODY]);
  const v = await user("fresh");
  await q(`insert into forms (workspace_id, name) values ($1, 'Mine')`, [v.ws]);
  await q(`select guest_claim($1, $2)`, [k2, v.id]);
  assert.equal((await q(`select count(*)::int as n from workspaces where id = $1`, [v.ws]))[0].n, 1);
});

test("only the server runs them", async () => {
  for (const role of ["anon", "authenticated"]) {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query(`set local role ${role}`);
      await assert.rejects(c.query(`select guest_claim($1, $2)`, [h("x"), randomUUID()]), /permission denied/);
    } finally {
      await c.query("rollback").catch(() => {});
      c.release();
    }
  }
});
