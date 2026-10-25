// Workflows on a real database (docs/enrich-workflows-reports.md 2.7): runs start once per event, even one that
// commits late; a step is never repeated after a crash; a webhook with no answer isn't sent again; Wait until takes
// one path, never both; a new version leaves running people on theirs; a goal ends a run before its next email;
// pausing stops a run after its current step; merged contacts leave one run; suppressed contacts skip emails; and Try a
// contact takes the same path as the worker.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";
import type { Job } from "../../src/lib/jobs.ts";
import { stepEmail } from "../../src/lib/nurture/email.ts";
import { tracePath } from "../../src/lib/workflows/engine.ts";
import { valuesOf, type Facts } from "../../src/lib/workflows/facts.ts";
import { walk } from "../../src/lib/workflows/tree.ts";
import { emptyBody, type Body, type Step } from "../../src/lib/workflows/types.ts";
import { workflowRun, type WorkflowDeps } from "../../worker-intel/jobs/workflows.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 8 });
const rpc = pgRpc(pool);
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

async function workspace() {
  const ws = randomUUID();
  const user = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, 'Acme')`, [ws]);
  await q(`insert into auth.users (id, email) values ($1, $2)`, [user, `${user}@acme.com`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, user]);
  return { ws, user };
}

async function contact(ws: string, o: { seniority?: string; owner?: string } = {}) {
  const email = `p${randomUUID().slice(0, 8)}@acme.com`;
  const r = await q(`select contacts_upsert($1, 'csv', $2) r`, [ws, JSON.stringify([{ email, email_clean: email, email_class: "work", first_name: "Dana" }])]);
  const id = r[0].r.ids[0] as string;
  if (o.seniority || o.owner) await q(`update contacts set seniority = $2, owner_user_id = $3 where id = $1`, [id, o.seniority ?? null, o.owner ?? null]);
  return id;
}

/** A live workflow from a body: saved, its emails rendered, published. */
async function live(ws: string, user: string, body: Body): Promise<string> {
  const id = (await q(`insert into workflows (workspace_id, name, draft) values ($1, 'Test', $2) returning id`, [ws, body]))[0].id as string;
  await publish(id, user, body);
  return id;
}

async function publish(id: string, user: string, body: Body) {
  const emails: object[] = [];
  walk(body.steps, (s) => {
    if (s.kind === "email") emails.push({ step: s.id, subject: s.email.subject, preheader: "", ...stepEmail({ paragraphs: s.email.paragraphs, cta_label: "", cta_url: "" }) });
  });
  return (await q(`select workflow_publish($1, $2, $3, $4) v`, [id, user, JSON.stringify(body), JSON.stringify(emails)]))[0].v as number;
}

const email = (id: string): Step => ({ id, kind: "email", from: "team", approved: true, email: { subject: `Subject ${id}`, preheader: "", paragraphs: ["Hi {{first_name|there}}"], cta_label: "", cta_url: "" } });
const task = (id: string, title = id): Step => ({ id, kind: "task", title, assignee: "owner", dueDays: 1 });
const manual = (steps: Step[], o: Partial<Body> = {}): Body => ({ ...emptyBody(), trigger: { kind: "manual" }, steps, ...o });

async function start(ws: string, wf: string, c: string, key = `t:${c}`) {
  const v = (await q(`select live_version from workflows where id = $1`, [wf]))[0].live_version;
  return (await q(`insert into workflow_runs (workspace_id, workflow_id, version, contact_id, key) values ($1, $2, $3, $4, $5) returning id`, [ws, wf, v, c, key]))[0].id as string;
}

const job = (ws: string): Job => ({ id: randomUUID(), workspace_id: ws, kind: "workflow_run", key: ws, payload: {}, attempts: 1, max_attempts: 3 });
const runAll = (ws: string, d: WorkflowDeps = {}) => workflowRun(rpc, { roundMs: 5_000, secret: "s".repeat(40), resolve: (async () => [{ address: "93.184.216.34", family: 4 }]) as never, ...d })(job(ws), new AbortController().signal);
const run = async (id: string) => (await q(`select * from workflow_runs where id = $1`, [id]))[0];
const ledger = async (id: string) => Object.fromEntries((await q(`select step_id, status from workflow_steps_done where run_id = $1`, [id])).map((r) => [r.step_id, r.status]));
const due = (id: string) => q(`update workflow_runs set next_at = now() - interval '1 second', claimed_at = null where id = $1`, [id]);

test("a trigger event read twice starts one run, and one that commits late is still picked up", async () => {
  const { ws, user } = await workspace();
  const form = randomUUID();
  const wf = await live(ws, user, { ...emptyBody(), trigger: { kind: "form", forms: [form] }, steps: [task("t1")] });
  const c = await contact(ws);
  // Written after the workflow went live, but stamped 5 minutes back: a slow transaction that committed late.
  await q(`update workflows set live_at = now() - interval '1 hour' where id = $1`, [wf]);
  await q(`insert into contact_events (workspace_id, contact_id, kind, data, source, at) values ($1, $2, 'form.submitted', $3, 'form', now() - interval '5 minutes')`, [ws, c, { form_id: form }]);
  await q(`insert into contact_events (workspace_id, contact_id, kind, data, source) values ($1, $2, 'form.submitted', $3, 'form')`, [ws, c, { form_id: randomUUID() }]);
  await q(`select workflow_scan()`);
  await q(`select workflow_scan()`);
  assert.equal((await q(`select count(*)::int n from workflow_runs where workflow_id = $1`, [wf]))[0].n, 1);
});

test("a worker stopped after queueing an email, before marking it done: on restart the email isn't sent twice and the run moves on", async () => {
  const { ws, user } = await workspace();
  const wf = await live(ws, user, manual([email("e1"), task("t1")]));
  const c = await contact(ws, { owner: user });
  const r = await start(ws, wf, c);
  // What the first worker did before it died: claimed, began the email, queued it. Nothing recorded.
  await q(`select workflow_claim($1, 10)`, [ws]);
  await q(`select workflow_step_begin($1, 'e1', 1)`, [r]);
  await q(`select workflow_email($1, 'e1', '{}', null, null)`, [r]);
  await q(`update workflow_runs set claimed_at = now() - interval '3 minutes' where id = $1`, [r]);
  await runAll(ws);
  assert.equal((await q(`select count(*)::int n from email_messages where dedupe like $1`, [`wf:${r}:%`]))[0].n, 1, "one email");
  assert.deepEqual(await ledger(r), { e1: "done", t1: "done" });
  assert.equal((await run(r)).status, "done");
  assert.equal((await q(`select count(*)::int n from tasks where record_id = $1`, [c]))[0].n, 1);
});

test("a webhook with no answer is marked unknown and not sent again; one found half-sent after a crash isn't sent at all", async () => {
  const { ws, user } = await workspace();
  const wf = await live(ws, user, manual([{ id: "h1", kind: "webhook", url: "https://hooks.example.com/x" }, task("t1")]));
  let calls = 0;
  const hang = (async () => {
    calls++;
    throw new Error("The operation was aborted due to timeout");
  }) as unknown as typeof fetch;
  const r1 = await start(ws, wf, await contact(ws, { owner: user }));
  await runAll(ws, { fetcher: hang });
  assert.deepEqual(await ledger(r1), { h1: "unknown", t1: "done" });
  assert.equal((await run(r1)).status, "done");
  await runAll(ws, { fetcher: hang });
  assert.equal(calls, 1);

  const r2 = await start(ws, wf, await contact(ws, { owner: user }));
  await q(`select workflow_step_begin($1, 'h1', 1)`, [r2]);
  await runAll(ws, { fetcher: hang });
  assert.equal(calls, 1, "not sent from the restarted worker");
  assert.deepEqual(await ledger(r2), { h1: "unknown", t1: "done" });
});

test("Wait until a meeting is booked: yes when it happens during the wait, no at the end, never both", async () => {
  const { ws, user } = await workspace();
  const wf = await live(ws, user, manual([{ id: "wu", kind: "wait_until", event: "meeting.booked", days: 3, yes: [task("yes")], no: [task("no")] }]));
  const c1 = await contact(ws, { owner: user });
  const c2 = await contact(ws, { owner: user });
  const r1 = await start(ws, wf, c1);
  const r2 = await start(ws, wf, c2);
  await runAll(ws);
  assert.equal((await run(r1)).status, "waiting");
  await q(`insert into contact_events (workspace_id, contact_id, kind, data, source) values ($1, $2, 'meeting.booked', '{}', 'meetings')`, [ws, c1]);
  await due(r1);
  await q(`update workflow_runs set wait = jsonb_set(wait, '{until}', to_jsonb((now() - interval '1 minute')::text)) where id = $1`, [r2]);
  await due(r2);
  await runAll(ws);
  assert.deepEqual(await ledger(r1), { wu: "done", yes: "done" });
  assert.deepEqual(await ledger(r2), { wu: "done", no: "done" });
  // Even if the meeting lands now, the run that already went "no" doesn't go back.
  await q(`insert into contact_events (workspace_id, contact_id, kind, data, source) values ($1, $2, 'meeting.booked', '{}', 'meetings')`, [ws, c2]);
  await runAll(ws);
  assert.equal((await q(`select count(*)::int n from tasks where record_id = $1`, [c2]))[0].n, 1);
});

test("a new version while people wait: each run finishes on the version it started on", async () => {
  const { ws, user } = await workspace();
  const v1 = manual([{ id: "w", kind: "wait", days: 1, hours: 0 }, email("old")]);
  const wf = await live(ws, user, v1);
  const r = await start(ws, wf, await contact(ws));
  await runAll(ws);
  assert.equal((await run(r)).status, "waiting");
  assert.equal(await publish(wf, user, manual([email("new")])), 2);
  await due(r);
  await runAll(ws);
  const sent = await q(`select e.subject from email_messages m join emails e on e.id = m.email_id where m.dedupe like $1`, [`wf:${r}:%`]);
  assert.deepEqual(sent.map((x) => x.subject), ["Subject old"]);
  assert.equal((await run(r)).version, 1);
});

test("a goal met during a wait ends the run before its next email", async () => {
  const { ws, user } = await workspace();
  const wf = await live(ws, user, manual([{ id: "w", kind: "wait", days: 2, hours: 0 }, email("e1")], { goals: [{ kind: "lifecycle", stages: ["customer"] }] }));
  const c = await contact(ws);
  const r = await start(ws, wf, c);
  await runAll(ws);
  await q(`update contacts set lifecycle = 'customer' where id = $1`, [c]);
  await due(r);
  await runAll(ws);
  assert.equal((await run(r)).status, "exited");
  assert.equal((await q(`select count(*)::int n from email_messages where dedupe like $1`, [`wf:${r}:%`]))[0].n, 0);
});

test("pausing a workflow mid-run stops it after the current step; live again finishes it", async () => {
  const { ws, user } = await workspace();
  const wf = await live(ws, user, manual([{ id: "h", kind: "webhook", url: "https://hooks.example.com/pause" }, task("t2")]));
  const c = await contact(ws, { owner: user });
  const r = await start(ws, wf, c);
  // The webhook's receiver: someone presses Pause while it runs.
  const pausing = (async () => {
    await q(`update workflows set status = 'paused' where id = $1`, [wf]);
    return new Response("ok", { status: 200 });
  }) as unknown as typeof fetch;
  await runAll(ws, { fetcher: pausing });
  assert.deepEqual(await ledger(r), { h: "done" });
  assert.equal((await run(r)).at_step, "t2");
  await runAll(ws, { fetcher: pausing });
  assert.equal((await q(`select count(*)::int n from tasks where record_id = $1`, [c]))[0].n, 0, "nothing runs while paused");
  await q(`update workflows set status = 'live' where id = $1`, [wf]);
  await runAll(ws, { fetcher: pausing });
  assert.equal((await run(r)).status, "done");
});

test("two contacts merged mid-run leave one run; a suppressed contact skips the email and goes on", async () => {
  const { ws, user } = await workspace();
  const wf = await live(ws, user, manual([{ id: "w", kind: "wait", days: 1, hours: 0 }, email("e1"), task("t1")]));
  const keep = await contact(ws, { owner: user });
  const drop = await contact(ws, { owner: user });
  const rk = await start(ws, wf, keep);
  const rd = await start(ws, wf, drop);
  await runAll(ws);
  await q(`update contacts set deleted_at = now(), merged_into = $1 where id = $2`, [keep, drop]);
  await q(`insert into suppressions (workspace_id, email_clean, reason, source) select workspace_id, email_clean, 'unsubscribed', 'test' from contacts where id = $1`, [keep]);
  await due(rk);
  await due(rd);
  await runAll(ws);
  const runs = await q(`select status, exit_reason from workflow_runs where workflow_id = $1 order by status`, [wf]);
  assert.deepEqual(runs.map((x) => x.status).sort(), ["done", "exited"]);
  assert.equal(runs.find((x) => x.status === "exited")?.exit_reason, "merged into another run");
  const done = (await q(`select id from workflow_runs where workflow_id = $1 and status = 'done'`, [wf]))[0].id;
  assert.deepEqual(await ledger(done), { w: "done", e1: "skipped", t1: "done" });
  assert.equal((await q(`select count(*)::int n from tasks where record_id = $1`, [keep]))[0].n, 1);
});

test("Try a contact and the worker take the same path on 40 contacts", async () => {
  const { ws, user } = await workspace();
  const body = manual([
    { id: "br", kind: "branch", match: "any", conds: [{ field: "contact.seniority", op: "one_of", value: ["VP", "C-level"] }], yes: [task("big")], no: [{ id: "sp", kind: "split", percent: 40, a: [task("a")], b: [task("b")] }] },
  ]);
  const wf = await live(ws, user, body);
  const levels = ["VP", "C-level", "Manager", "Individual", ""];
  const runs: { id: string; c: string }[] = [];
  for (let i = 0; i < 40; i++) {
    const c = await contact(ws, { seniority: levels[i % levels.length] || undefined, owner: user });
    runs.push({ id: await start(ws, wf, c), c });
  }
  await runAll(ws);
  for (const r of runs) {
    const f = (await q(`select workflow_facts($1) f`, [r.id]))[0].f as Facts;
    const t = tracePath(body, { values: valuesOf(f), lifecycle: null, outcome: null, booked: false, timezone: null }, r.id);
    const want = t.lines.map((l) => l.step.id).sort();
    assert.deepEqual(Object.keys(await ledger(r.id)).sort(), want, `run ${r.id}`);
  }
});

test("a nurture moves into a draft workflow with its waits, emails and approvals", async () => {
  const { ws, user } = await workspace();
  const seg = (await q(`insert into segments (workspace_id, name, kind) values ($1, 'Trials', 'static') returning id`, [ws]))[0].id;
  const n = (await q(`insert into nurtures (workspace_id, name, trigger, exit_stages, created_by) values ($1, 'Trial follow-up', $2, '{customer}', $3) returning id`, [ws, { kind: "segment", segment_id: seg }, user]))[0].id;
  const e1 = (await q(`insert into emails (workspace_id, name, kind, subject, html, text) values ($1, 'One', 'journey', 'One', '<p>1</p>', 'First') returning id`, [ws]))[0].id;
  const e2 = (await q(`insert into emails (workspace_id, name, kind, subject, html, text) values ($1, 'Two', 'journey', 'Two', '<p>2</p>', 'Second') returning id`, [ws]))[0].id;
  await q(`insert into nurture_steps (workspace_id, nurture_id, position, wait_days, email_id, approved_at) values ($1, $2, 0, 0, $3, now()), ($1, $2, 1, 3, $4, null)`, [ws, n, e1, e2]);
  await q(`select nurture_to_workflow($1)`, [n]);
  const w = (await q(`select status, draft from workflows where id = $1`, [n]))[0];
  assert.equal(w.status, "draft");
  assert.deepEqual(w.draft.trigger, { kind: "segment", segment: seg, on: "entered" });
  assert.deepEqual(w.draft.goals, [{ kind: "lifecycle", stages: ["customer"] }]);
  assert.deepEqual(w.draft.steps.map((s: Step) => `${s.kind}:${s.kind === "email" ? s.approved : s.kind === "wait" ? s.days : ""}`), ["email:true", "wait:3", "email:false"]);
});

test("new events: a watched field's change, a score band change, and joining a list", async () => {
  const { ws, user } = await workspace();
  await live(ws, user, { ...emptyBody(), trigger: { kind: "field", key: "lifecycle", to: "customer" }, steps: [task("t")] });
  const c = await contact(ws);
  await q(`select contact_update($1, 'manual', '{"lifecycle":"customer"}')`, [c]);
  await q(`select contact_update($1, 'manual', '{"title":"CEO"}')`, [c]);
  const kinds = async () => (await q(`select kind, data from contact_events where contact_id = $1 and kind in ('field.changed', 'lead.band', 'segment.entered') order by at`, [c])).map((r) => `${r.kind}:${r.data.key ?? r.data.to ?? r.data.name}`);
  assert.deepEqual(await kinds(), ["field.changed:lifecycle"], "only the watched field");
  await q(`update contacts set score_band = 'hot' where id = $1`, [c]);
  const seg = (await q(`insert into segments (workspace_id, name, kind) values ($1, 'VIP', 'static') returning id`, [ws]))[0].id;
  await q(`insert into segment_members (workspace_id, segment_id, contact_id) values ($1, $2, $3)`, [ws, seg, c]);
  assert.deepEqual(await kinds(), ["field.changed:lifecycle", "lead.band:hot", "segment.entered:VIP"]);
});

test("the screens' counts: entered and done per step in 7 days, people in it now, and 30 days of entries", async () => {
  const { ws, user } = await workspace();
  const wf = await live(ws, user, manual([task("t1"), { id: "w1", kind: "wait", days: 2, hours: 0 }, task("t2")]));
  const a = await start(ws, wf, await contact(ws));
  await start(ws, wf, await contact(ws));
  const old = await start(ws, wf, await contact(ws));
  await q(`update workflow_runs set started_at = now() - interval '10 days' where id = $1`, [old]);
  await runAll(ws);
  // A skipped step isn't counted as done.
  await q(`update workflow_steps_done set status = 'skipped' where run_id = $1 and step_id = 't1'`, [a]);
  await q(`select set_config('request.jwt.claim.sub', $1, false)`, [user]);
  const s = (await q(`select workflow_stats($1) s`, [wf]))[0].s;
  assert.equal(s.entered, 2);
  assert.equal(s.active, 3);
  assert.equal(s.steps.t1, 2);
  assert.equal(s.steps.t2, undefined);
  const o = (await q(`select workflows_overview($1) o`, [ws]))[0].o[wf];
  assert.equal(o.active, 3);
  assert.equal(o.days.length, 30);
  assert.equal(o.days[29], 2);
  assert.equal(o.days.reduce((x: number, y: number) => x + y, 0), 3);
  await q(`select set_config('request.jwt.claim.sub', '', false)`);
});
