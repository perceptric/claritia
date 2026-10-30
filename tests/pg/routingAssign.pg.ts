// Routing's amber dot comes with app_counts (094_routing_assignment.sql): what Assignment lists under Action required,
// on the draft when there is one, else the live version: reps who get leads with no working calendar (Zoom and one to
// sign in again don't count), rules with no reps, and a Default rule with no reps. Rules that are off, hold, or go to
// the owner don't count, nor do their reps; with the rules off only the Default rule's reps count. Members only.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import pg from "pg";
import { uuid7 } from "../../collect/ids.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 2 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

test("app_counts: routing_action counts Assignment's Action required", async () => {
  const ws = uuid7();
  const [a, b, c, d, stranger] = [uuid7(), uuid7(), uuid7(), uuid7(), uuid7()];
  await q(`insert into workspaces (id, name) values ($1, 'routing action')`, [ws]);
  for (const u of [a, b, c, d, stranger]) await q(`insert into auth.users (id, email) values ($1, $2)`, [u, `${u}@t.io`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'member'), ($1, $4, 'member'), ($1, $5, 'member')`, [ws, a, b, c, d]);
  // a: a working calendar. b: only Zoom. c: a calendar to sign in again. d: none, and not on any rule.
  await q(`insert into calendar_accounts (workspace_id, user_id, provider, account_email, status) values ($1, $2, 'google', 'a@t.io', 'ok'), ($1, $3, 'zoom', 'b@t.io', 'ok'), ($1, $4, 'microsoft', 'c@t.io', 'reconnect')`, [ws, a, b, c]);

  const m = (u: string) => ({ user: u, weight: 1 });
  const live = {
    v: 1,
    rules: {
      on: true,
      list: [
        { id: "r1", name: "Enterprise", match: "all", conds: [], queue: "q1" },
        { id: "r2", name: "Empty", match: "all", conds: [], queue: "q_empty" },
        { id: "r3", name: "Off", match: "all", conds: [], queue: "q_off", on: false },
        { id: "r4", name: "Hold", match: "all", conds: [], queue: "q_off", then: "hold" },
      ],
    },
    queues: [
      { id: "q1", name: "Enterprise", members: [m(a), m(b)] },
      { id: "q_empty", name: "Empty", members: [] },
      { id: "q_off", name: "Off", members: [m(d)] },
      { id: "q_def", name: "Default rule", members: [m(a), m(c)] },
    ],
    fallback: { kind: "queue", id: "q_def" },
  };

  const c1 = await pool.connect();
  const counts = async (user: string) => {
    await c1.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user]);
    return (await c1.query(`select app_counts($1, now() - interval '1 day', now()) as r`, [ws])).rows[0].r;
  };
  try {
    assert.equal((await counts(a)).routing_action, 0, "no router yet: nothing to act on");

    await q(`insert into router_versions (workspace_id, version, body) values ($1, 1, $2)`, [ws, JSON.stringify(live)]);
    await q(`insert into routers (workspace_id, live_version) values ($1, 1)`, [ws]);
    // b (Zoom only) and c (sign in again) get leads; d's rule is off and the other one holds; "Empty" has no reps.
    assert.equal((await counts(a)).routing_action, 3);

    // A draft is what's being worked on: rules off, the Default rule's reps only (a has a calendar).
    await q(`update routers set draft = $2 where workspace_id = $1`, [ws, JSON.stringify({ ...live, rules: { ...live.rules, on: false } })]);
    assert.equal((await counts(b)).routing_action, 1, "only c, on the Default rule");

    // A Default rule with nobody, and one that's a single rep.
    await q(`update routers set draft = $2 where workspace_id = $1`, [ws, JSON.stringify({ ...live, rules: { on: false, list: [] }, fallback: null })]);
    assert.equal((await counts(a)).routing_action, 1, "no Default rule reps");
    await q(`update routers set draft = $2 where workspace_id = $1`, [ws, JSON.stringify({ ...live, rules: { on: false, list: [] }, fallback: { kind: "user", id: a } })]);
    assert.equal((await counts(a)).routing_action, 0);
    await q(`update calendar_accounts set status = 'ok' where workspace_id = $1 and user_id = $2`, [ws, c]);
    await q(`update routers set draft = null where workspace_id = $1`, [ws]);
    assert.equal((await counts(c)).routing_action, 2, "c's calendar works now: b and the empty rule are left");

    // A body that's odd in shape counts what it can and never errors.
    await q(`update routers set draft = '{"v":1,"rules":{"list":"nope"},"queues":{}}'::jsonb where workspace_id = $1`, [ws]);
    assert.equal((await counts(a)).routing_action, 1, "nothing to read but a missing Default rule");

    await assert.rejects(() => counts(stranger), /Workspace not found/, "not a member: nothing");
  } finally {
    c1.release();
  }
});
