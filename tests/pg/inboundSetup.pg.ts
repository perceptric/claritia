// The sidebar's dots come with app_counts (093_inbound_setup.sql): teammates with no working calendar (Zoom and one
// to sign in again don't count), and whether Routing has a draft or is paused. Members only.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import pg from "pg";
import { uuid7 } from "../../collect/ids.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 2 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

test("app_counts: no_calendar, routing_draft and routing_paused, for members only", async () => {
  const ws = uuid7();
  const [a, b, c, stranger] = [uuid7(), uuid7(), uuid7(), uuid7()];
  await q(`insert into workspaces (id, name) values ($1, 'inbound dots')`, [ws]);
  for (const u of [a, b, c, stranger]) await q(`insert into auth.users (id, email) values ($1, $2)`, [u, `${u}@t.io`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'member'), ($1, $4, 'member')`, [ws, a, b, c]);
  // a: a working calendar. b: only Zoom. c: a calendar to sign in again.
  await q(`insert into calendar_accounts (workspace_id, user_id, provider, account_email, status) values ($1, $2, 'google', 'a@t.io', 'ok'), ($1, $3, 'zoom', 'b@t.io', 'ok'), ($1, $4, 'microsoft', 'c@t.io', 'reconnect')`, [ws, a, b, c]);

  const c1 = await pool.connect();
  const counts = async (user: string) => {
    await c1.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user]);
    return (await c1.query(`select app_counts($1, now() - interval '1 day', now()) as r`, [ws])).rows[0].r;
  };
  try {
    let r = await counts(a);
    assert.equal(r.no_calendar, 2, "Zoom isn't a calendar; one to sign in again doesn't work yet");
    assert.equal(r.routing, false);
    assert.equal(r.routing_draft, false, "no router yet");
    assert.equal(r.routing_paused, false);
    for (const k of ["review", "meetings_today", "calendars", "types", "live_forms", "members", "invites", "sources"]) assert.ok(k in r, `still has ${k}`);

    await q(`insert into routers (workspace_id, live_version, draft) values ($1, 1, '{"v":1}'::jsonb)`, [ws]);
    r = await counts(b);
    assert.deepEqual([r.routing, r.routing_draft, r.routing_paused], [true, true, false]);
    await q(`update routers set draft = null, paused_at = now() where workspace_id = $1`, [ws]);
    await q(`update calendar_accounts set status = 'ok' where workspace_id = $1 and user_id = $2`, [ws, c]);
    r = await counts(c);
    assert.deepEqual([r.no_calendar, r.routing_draft, r.routing_paused], [1, false, true]);

    await assert.rejects(() => counts(stranger), /Workspace not found/, "not a member: nothing");
  } finally {
    c1.release();
  }
});
