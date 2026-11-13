// Automation emails on the Emails canvas, on a real database (supabase/migrations/163_automation_emails.sql;
// docs/email-unify-plan.md, E3): each email step gets one editing copy, calling twice is the same as once, a copy
// keeps newer words from the canvas, a removed step's copy goes, the canvas saves them, and campaigns never see them.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 4 });
after(() => pool.end());

async function as<T>(user: string, fn: (q: (sql: string, p?: unknown[]) => Promise<Record<string, unknown>[]>) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user]);
    await c.query(`set role authenticated`);
    return await fn(async (sql, p = []) => (await c.query(sql, p)).rows);
  } finally {
    await c.query(`reset role`);
    await c.query(`select set_config('request.jwt.claim.sub', '', false)`);
    c.release();
  }
}
async function setup() {
  const ws = randomUUID();
  const [member, outsider] = [randomUUID(), randomUUID()];
  await pool.query(`insert into workspaces (id, name) values ($1, 'Juniper')`, [ws]);
  for (const u of [member, outsider]) await pool.query(`insert into auth.users (id, email) values ($1, $2)`, [u, `${u}@t.io`]);
  await pool.query(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')`, [ws, member]);
  const wf = (await pool.query(`insert into workflows (workspace_id, name) values ($1, 'Demo follow-up') returning id`, [ws])).rows[0].id as string;
  return { ws, member, outsider, wf };
}
const doc = (n: number) => ({ v: 1, settings: { preheader: "" }, sections: [], n });
const steps = (...xs: [string, string][]) => JSON.stringify(xs.map(([step, subject], i) => ({ step, subject, preheader: "", doc: doc(i) })));
type Copy = { id: string; step: string; subject: string; made: boolean; doc: { n: number } };
const ensure = (s: { ws: string; wf: string; member: string }, body: string) => as(s.member, async (q) => (await q(`select workflow_email_ensure($1, $2, $3::jsonb) r`, [s.ws, s.wf, body]))[0]!.r as Copy[]);

test("each email step gets one copy, and calling twice is the same as once", async () => {
  const s = await setup();
  const a = await ensure(s, steps(["s1", "Thanks"], ["s2", "Still there?"]));
  assert.deepEqual(a.map((c) => [c.step, c.subject, c.made]), [["s1", "Thanks", true], ["s2", "Still there?", true]]);
  const b = await ensure(s, steps(["s1", "Thanks"], ["s2", "Still there?"]));
  assert.deepEqual(b.map((c) => [c.id, c.made]), a.map((c) => [c.id, false]));
  const rows = (await pool.query(`select kind, status, name from emails where workflow_id = $1 order by group_position`, [s.wf])).rows;
  assert.deepEqual(rows, [{ kind: "journey", status: "draft", name: "Thanks" }, { kind: "journey", status: "draft", name: "Still there?" }]);
});

test("a copy keeps newer words from the canvas, follows its step's place, and goes with its step", async () => {
  const s = await setup();
  const [first] = await ensure(s, steps(["s1", "Thanks"], ["s2", "Later"]));
  // The canvas saves new words.
  await as(s.member, (q) => q(`select email_draft_save($1, $2, 'Thanks', 'Thanks a lot', '', $3::jsonb)`, [s.ws, first!.id, JSON.stringify(doc(9))]));
  const again = await ensure(s, steps(["s2", "Later"], ["s1", "Thanks"]));
  assert.deepEqual(again.map((c) => c.step), ["s2", "s1"], "copies follow the steps' order");
  const s1 = again.find((c) => c.step === "s1")!;
  assert.equal(s1.subject, "Thanks a lot");
  assert.equal(s1.doc.n, 9, "the canvas's words stay");
  // The step is removed: its copy goes.
  assert.deepEqual((await ensure(s, steps(["s2", "Later"]))).map((c) => c.step), ["s2"]);
  assert.equal((await pool.query(`select count(*)::int n from emails where workflow_id = $1`, [s.wf])).rows[0].n, 1);
});

test("outsiders can't make copies, a copy can't be sent, and campaigns don't list them", async () => {
  const s = await setup();
  await assert.rejects(as(s.outsider, (q) => q(`select workflow_email_ensure($1, $2, $3::jsonb)`, [s.ws, s.wf, steps(["s1", "x"])])), /Workspace not found/);
  const other = await setup();
  await assert.rejects(ensure({ ...s, wf: other.wf }, steps(["s1", "x"])), /Automation not found/);
  const [c] = await ensure(s, steps(["s1", "Thanks"]));
  await assert.rejects(pool.query(`update emails set status = 'sent' where id = $1`, [c!.id]), /emails_workflow_step/);
  const camp = await as(s.member, (q) => q(`select * from email_campaigns($1)`, [s.ws]));
  assert.equal(camp.length, 0);
  // Deleting the automation takes its copies.
  await pool.query(`delete from workflows where id = $1`, [s.wf]);
  assert.equal((await pool.query(`select count(*)::int n from emails where id = $1`, [c!.id])).rows[0].n, 0);
});
