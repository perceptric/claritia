// Signup on a real database (133_signup.sql): a new workspace waits for its name, the owner names it, an invite queues
// its email (again when sent again, and never for an old send), and a person in two workspaces opens the one they just
// joined first, then the one they picked.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import pg from "pg";
import { uuid7 } from "./ids.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 4 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

/** Runs one statement as a signed-in person. */
async function as<T = Record<string, unknown>>(user: string, sql: string, p: unknown[] = []): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [user]);
    await c.query("set local role authenticated");
    const r = (await c.query(sql, p)).rows[0] as T;
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
const TAG = uuid7().slice(-8);
const user = async (name: string) => {
  const id = uuid7();
  await q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `${name}-${TAG}@acme.com`, { full_name: name === "ada" ? "Ada Park" : "" }]);
  return id;
};
type Start = { workspace: { id: string; name: string; named: boolean }; role: string; workspaces: { id: string; name: string; role: string }[] };
const start = (u: string, ws: string | null = null) => as<{ s: Start }>(u, `select app_start($1) s`, [ws]).then((r) => r.s);

test("a new workspace waits for its name; the owner names it, a member can't", async () => {
  const ada = await user("ada");
  const s = await start(ada);
  assert.equal(s.workspace.name, `ada-${TAG}'s workspace`);
  assert.equal(s.workspace.named, false);
  assert.equal(s.role, "owner");
  assert.equal(s.workspaces.length, 1);
  await as(ada, `select workspace_name_set($1, $2)`, [s.workspace.id, "  Acme   Studio "]);
  const again = await start(ada);
  assert.deepEqual([again.workspace.name, again.workspace.named], ["Acme Studio", true]);
  await assert.rejects(as(ada, `select workspace_name_set($1, '')`, [s.workspace.id]), /1 to 80/);
  const old = (await q(`insert into workspaces (name) values ('Old') returning id, named`))[0];
  assert.equal(old.named, true, "workspaces made before stay named");
});

test("an invite queues its email; sending again queues another and the old one sends nothing", async () => {
  const ada = await user("ada");
  const ws = (await start(ada)).workspace.id;
  const email = `bo-${TAG}@lead.io`;
  await as(ada, `select invite_member($1, $2)`, [ws, email.toUpperCase()]);
  const jobs = await q(`select key, payload from jobs where workspace_id = $1 and kind = 'invite_email' order by created_at`, [ws]);
  assert.equal(jobs.length, 1);
  const first = jobs[0]!.payload as { invite: string; sent_for: string };
  const info = (await q(`select invite_info($1, $2) i`, [first.invite, first.sent_for]))[0].i;
  assert.deepEqual(info, { email, workspace: `ada-${TAG}'s workspace`, inviter: "Ada Park", inviter_email: `ada-${TAG}@acme.com` });
  await q(`update invites set created_at = created_at - interval '1 minute' where id = $1`, [first.invite]);
  await as(ada, `select invite_member($1, $2)`, [ws, email]);
  const both = await q(`select payload from jobs where workspace_id = $1 and kind = 'invite_email' order by created_at`, [ws]);
  assert.equal(both.length, 2, "a second send is its own job");
  assert.equal((await q(`select invite_info($1, $2) i`, [first.invite, first.sent_for]))[0].i, null, "the first send is stale");
  const second = both[1]!.payload as { invite: string; sent_for: string };
  assert.ok((await q(`select invite_info($1, $2) i`, [second.invite, second.sent_for]))[0].i);
  await as(ada, `select cancel_invite($1)`, [second.invite]);
  assert.equal((await q(`select invite_info($1, $2) i`, [second.invite, second.sent_for]))[0].i, null, "a canceled invite sends nothing");
  await assert.rejects(as(ada, `select invite_info($1, null)`, [second.invite]));
});

test("someone with their own workspace opens the one they just joined, then the one they pick", async () => {
  const ada = await user("ada");
  const team = (await start(ada)).workspace.id;
  await as(ada, `select workspace_name_set($1, 'Acme')`, [team]);
  const bo = await user("bo");
  const own = (await start(bo)).workspace.id;
  await as(ada, `select invite_member($1, $2)`, [team, `bo-${TAG}@acme.com`]);
  const joined = await start(bo);
  assert.equal(joined.workspace.id, team);
  assert.equal(joined.role, "member");
  assert.deepEqual(joined.workspaces.map((w) => w.id).sort(), [own, team].sort());
  await q(`update invites set accepted_at = now() - interval '1 hour' where workspace_id = $1`, [team]);
  assert.equal((await start(bo, own)).workspace.id, own, "the picked one");
  assert.equal((await start(bo, team)).workspace.id, team);
  const stranger = (await q(`insert into workspaces (name) values ('Not mine') returning id`))[0].id;
  assert.equal((await start(bo, stranger)).workspace.id, own, "never one they aren't in");
});
