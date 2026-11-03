// Response times on a real database (docs/router.md Part 17): a routed lead starts a timer; a note, a finished task,
// a meeting or Mark contacted meets it, even one second before the deadline; a missed one routes the lead again
// without the rep (once, even when two minute ticks run together), or gives it to the manager; a lead reassigned by
// hand closes the old timer; a rep is nudged once; and Slack's buttons and signatures are checked.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";
import { route } from "../../src/lib/router/server.ts";
import { emptyBody, type RouterBody, type Sla } from "../../src/lib/router/types.ts";
import { sealToken, slackSigned } from "../../src/lib/slack/app.ts";
import { slackBook } from "../../src/lib/slack/book.ts";
import { withDefaults } from "../../src/lib/meetings/public.ts";
import type { MeetingType } from "../../src/lib/meetings/types.ts";
import { createHmac } from "node:crypto";
import { pgRpc } from "../../worker-intel/rpc.ts";
import { routeJob, routerAlert, routerSla } from "../../worker-intel/jobs/router.ts";
import type { Job } from "../../src/lib/jobs.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 20 });
const rpc = pgRpc(pool);
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());
process.env.SECRETS_KEY ||= "router-test-secret-key-0123456789abcdef";

async function team(n: number) {
  const ws = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, 'Acme')`, [ws]);
  const users: string[] = [];
  for (let i = 0; i < n; i++) {
    const u = randomUUID();
    users.push(u);
    await q(`insert into auth.users (id, email) values ($1, $2)`, [u, `rep${i}-${u.slice(0, 4)}@acme.io`]);
    await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, $3)`, [ws, u, i === 0 ? "owner" : "member"]);
    await q(`insert into booking_profiles (workspace_id, user_id, slug, name) values ($1, $2, $3, $4)`, [ws, u, `rep-${i}`, `Rep ${i}`]);
  }
  return { ws, users };
}

let n = 0;
async function lead(ws: string) {
  n++;
  const email = `lead${n}-${randomUUID().slice(0, 6)}@client${n}.io`;
  return (await q(`insert into contacts (workspace_id, email, email_clean, email_class, first_name, last_name, country) values ($1, $2, $2, 'work', 'Dana', 'Lee', 'US') returning id`, [ws, email]))[0].id as string;
}

function body(users: string[], sla: Partial<Sla> = {}): RouterBody {
  const b = emptyBody();
  b.account.on = false;
  b.queues = [{ id: "q1", name: "Everyone", method: "rr", strict: false, hoursOnly: false, members: users.map((user) => ({ user, weight: 1 })) }];
  b.rules.list = [{ id: "r1", name: "All", match: "all", conds: [{ field: "lead.source", op: "filled" }], queue: "q1" }];
  b.fallback = { kind: "queue", id: "q1" };
  b.sla = { on: true, minutes: 30, nudge: 10, next: "route", manager: null, ...sla };
  return b;
}

const publish = async (ws: string, b: RouterBody) => (await q(`select router_publish($1, $2, 'test', null) v`, [ws, b]))[0].v as number;
const job = (ws: string, kind: string, key: string, payload: Record<string, unknown>): Job => ({ id: randomUUID(), workspace_id: ws, kind, key, payload, attempts: 1, max_attempts: 5 });
const signal = new AbortController().signal;
const timer = async (c: string) => (await q(`select * from router_slas where contact_id = $1 order by started_at desc limit 1`, [c]))[0];
const owner = async (c: string) => (await q(`select owner_user_id from contacts where id = $1`, [c]))[0].owner_user_id as string;

/** Move a timer's clock back: started `ago` minutes ago. */
async function age(run: string, ago: number) {
  await q(`update router_slas set started_at = now() - make_interval(mins => $2), nudge_at = case when nudge_at is not null then now() - make_interval(mins => $2) + (nudge_at - started_at) end,
           due_at = now() - make_interval(mins => $2) + (due_at - started_at) where run_id = $1`, [run, ago]);
}

/** Run the route jobs the minute tick queued for this workspace, as the worker would. */
async function runRouteJobs(ws: string) {
  const jobs = await q(`delete from jobs where workspace_id = $1 and kind = 'route' and status = 'queued' returning key, payload`, [ws]);
  for (const j of jobs) await routeJob(rpc)(job(ws, "route", j.key, j.payload), signal);
  return jobs.length;
}

test("a routed lead starts a timer from the live version; off or a version without it starts none", async () => {
  const { ws, users } = await team(2);
  await publish(ws, body(users));
  const c = await lead(ws);
  const r = await route(rpc, { ws, contact: c, key: `form:${c}`, reason: "form" });
  assert.equal(r.status, "ok");
  const t = await timer(c);
  assert.equal(t.status, "open");
  assert.equal(t.user_id, await owner(c));
  assert.equal(Math.round((Date.parse(t.due_at) - Date.parse(t.started_at)) / 60000), 30);
  assert.equal(Math.round((Date.parse(t.nudge_at) - Date.parse(t.started_at)) / 60000), 10);

  const old = body(users);
  delete old.sla;
  await publish(ws, old);
  const c2 = await lead(ws);
  await route(rpc, { ws, contact: c2, key: `form:${c2}`, reason: "form" });
  assert.equal(await timer(c2), undefined);
});

test("acting one second before the deadline meets it: no pass-on", async () => {
  const { ws, users } = await team(2);
  await publish(ws, body(users));
  for (const act of ["note", "task", "meeting", "marked"] as const) {
    const c = await lead(ws);
    await route(rpc, { ws, contact: c, key: `form:${c}`, reason: "form" });
    const t = await timer(c);
    const rep = t.user_id as string;
    await age(t.run_id, 29);
    if (act === "note") await q(`insert into notes (workspace_id, object, record_id, body, author) values ($1, 'contact', $2, 'Called', $3)`, [ws, c, rep]);
    if (act === "task") await q(`insert into tasks (workspace_id, object, record_id, title, assignee, done, done_at) values ($1, 'contact', $2, 'Call', $3, true, now())`, [ws, c, rep]);
    if (act === "meeting")
      await q(`insert into meetings (workspace_id, hosts, contact_id, guest_email, start_at, end_at, block_start, block_end, source, token_hash)
               values ($1, array[$2::uuid], $3, 'dana@client.io', now() + interval '1 day', now() + interval '1 day 30 min', now() + interval '1 day', now() + interval '1 day 30 min', 'page', $4)`, [ws, rep, c, randomUUID()]);
    if (act === "marked") assert.equal((await q(`select router_sla_mark($1, $2, $3) m`, [ws, c, rep]))[0].m, true);
    // The deadline passes a second later.
    await q(`update router_slas set due_at = now() - interval '1 second' where run_id = $1 and status = 'open'`, [t.run_id]);
    await q(`select router_sla_due()`);
    const after = await timer(c);
    assert.equal(after.status, "met", act);
    assert.equal(after.ended_by, act);
    assert.equal(await runRouteJobs(ws), 0, `${act}: nothing passed on`);
    assert.equal(await owner(c), rep);
  }
});

test("a note by someone else doesn't count; a missed timer routes the lead again without that rep", async () => {
  const { ws, users } = await team(2);
  await publish(ws, body(users));
  const c = await lead(ws);
  await route(rpc, { ws, contact: c, key: `form:${c}`, reason: "form" });
  const t = await timer(c);
  const first = t.user_id as string;
  const other = users.find((u) => u !== first)!;
  await q(`insert into notes (workspace_id, object, record_id, body, author) values ($1, 'contact', $2, 'Not mine', $3)`, [ws, c, other]);
  await age(t.run_id, 31);
  await q(`select router_sla_due()`);
  assert.equal((await q(`select status from router_slas where run_id = $1`, [t.run_id]))[0].status, "missed");
  assert.equal(await runRouteJobs(ws), 1);
  assert.equal(await owner(c), other);
  const run = (await q(`select reason, steps from router_runs where contact_id = $1 order by created_at desc limit 1`, [c]))[0];
  assert.equal(run.reason, "sla");
  assert.deepEqual(run.steps[0], { step: "sla", ok: false, user: first, minutes: 30 });
  // The new owner gets their own timer.
  const t2 = await timer(c);
  assert.equal(t2.user_id, other);
  assert.equal(t2.status, "open");
});

test("two minute ticks at once pass the lead on once", async () => {
  const { ws, users } = await team(3);
  await publish(ws, body(users));
  const c = await lead(ws);
  await route(rpc, { ws, contact: c, key: `form:${c}`, reason: "form" });
  const t = await timer(c);
  await age(t.run_id, 31);
  await Promise.all([q(`select router_sla_due()`), q(`select router_sla_due()`), q(`select router_sla_due()`)]);
  const queued = await q(`select key, payload from jobs where workspace_id = $1 and kind = 'route' and status = 'queued'`, [ws]);
  assert.equal(queued.length, 1);
  // The same job run twice (a worker retry) routes once.
  const j = job(ws, "route", queued[0].key, queued[0].payload);
  await routeJob(rpc)(j, signal);
  await routeJob(rpc)(j, signal);
  assert.equal((await q(`select count(*)::int n from router_runs where contact_id = $1 and reason = 'sla'`, [c]))[0].n, 1);
});

test("every rep let it wait: the lead ends Unassigned instead of going round again", async () => {
  const { ws, users } = await team(2);
  await publish(ws, body(users));
  const c = await lead(ws);
  await route(rpc, { ws, contact: c, key: `form:${c}`, reason: "form" });
  for (let i = 0; i < 2; i++) {
    const t = await timer(c);
    await age(t.run_id, 31);
    await q(`select router_sla_due()`);
    await runRouteJobs(ws);
  }
  const last = (await q(`select kind from router_runs where contact_id = $1 order by created_at desc limit 1`, [c]))[0];
  assert.equal(last.kind, "unassigned");
  assert.equal((await q(`select route_status from contacts where id = $1`, [c]))[0].route_status, "unassigned");
});

test("manager: a missed timer goes to the manager, who gets no timer of their own", async () => {
  const { ws, users } = await team(3);
  const [mgr, a, b] = users as [string, string, string];
  await publish(ws, body([a, b], { next: "manager", manager: mgr }));
  const c = await lead(ws);
  await route(rpc, { ws, contact: c, key: `form:${c}`, reason: "form" });
  const t = await timer(c);
  await age(t.run_id, 31);
  await q(`select router_sla_due()`);
  await runRouteJobs(ws);
  assert.equal(await owner(c), mgr);
  const run = (await q(`select "by", steps from router_runs where contact_id = $1 order by created_at desc limit 1`, [c]))[0];
  assert.equal(run.by, "hand");
  assert.equal(run.steps[0].step, "sla");
  assert.equal((await timer(c)).run_id, t.run_id, "no new timer for the manager");
});

test("reassigned by hand before the deadline: the old timer closes and nothing moves", async () => {
  const { ws, users } = await team(2);
  await publish(ws, body(users));
  const c = await lead(ws);
  await route(rpc, { ws, contact: c, key: `form:${c}`, reason: "form" });
  const t = await timer(c);
  const other = users.find((u) => u !== t.user_id)!;
  await q(`update contacts set owner_user_id = $2 where id = $1`, [c, other]);
  await age(t.run_id, 31);
  await q(`select router_sla_due()`);
  const after = (await q(`select status, ended_by from router_slas where run_id = $1`, [t.run_id]))[0];
  assert.deepEqual(after, { status: "closed", ended_by: "owner_changed" });
  assert.equal(await runRouteJobs(ws), 0);
  assert.equal(await owner(c), other);
});

test("the nudge goes once, by Slack app message with a Mark contacted button, else by email", async () => {
  const { ws, users } = await team(2);
  await publish(ws, body(users));
  const c = await lead(ws);
  await route(rpc, { ws, contact: c, key: `form:${c}`, reason: "form" });
  const t = await timer(c);
  await age(t.run_id, 11);
  await q(`select router_sla_due()`);
  await q(`select router_sla_due()`);
  const nudges = await q(`select key, payload from jobs where workspace_id = $1 and kind = 'router_sla'`, [ws]);
  assert.equal(nudges.length, 1);
  assert.equal((await timer(c)).status, "open");

  const sent: { to: string }[] = [];
  const mailer = { send: async (m: { to: string }) => (sent.push(m), "ses-1") };
  const nudge = job(ws, "router_sla", nudges[0].key, nudges[0].payload);
  await routerSla(rpc, { mailer, base: "https://app.test", from: "meetings@tryclaritia.com" })(nudge, signal);
  assert.equal(sent.length, 1);

  await q(`insert into slack_installs (workspace_id, team_id, team_name, sealed) values ($1, $2, 'Acme', $3)`, [ws, `T${n}${Date.now()}`, sealToken("xoxb-test")]);
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetcher = (async (u: string, init: RequestInit) => {
    const b = JSON.parse(String(init.body));
    calls.push({ url: u, body: b });
    if (u.endsWith("users.lookupByEmail")) return Response.json({ ok: true, user: { id: "U1" } });
    return Response.json({ ok: true });
  }) as unknown as typeof fetch;
  await routerSla(rpc, { mailer, base: "https://app.test", from: "meetings@tryclaritia.com", fetcher })(nudge, signal);
  assert.equal(sent.length, 1, "no email when Slack took it");
  const post = calls.find((x) => x.url.endsWith("chat.postMessage"))!;
  assert.equal(post.body.channel, "U1");
  assert.match(String(post.body.text), /left to reach out/);
  assert.ok(JSON.stringify(post.body.blocks).includes('"action_id":"sla_done"'));

  // Acted on since: the nudge says nothing.
  await q(`select router_sla_mark($1, $2, $3)`, [ws, c, t.user_id]);
  calls.length = 0;
  await routerSla(rpc, { mailer, base: "https://app.test", from: "meetings@tryclaritia.com", fetcher })(nudge, signal);
  assert.equal(calls.length, 0);

  // The new-lead alert also goes as a direct message.
  const c2 = await lead(ws);
  const r = await route(rpc, { ws, contact: c2, key: `form:${c2}`, reason: "form" });
  assert.equal(r.status, "ok");
  const run = (r as { run: string }).run;
  await routerAlert(rpc, { mailer, base: "https://app.test", from: "meetings@tryclaritia.com", fetcher })(job(ws, "router_alert", run, { run }), signal);
  assert.ok(calls.some((x) => x.url.endsWith("chat.postMessage") && /^New lead for Rep/.test(String(x.body.text))));
});

test("Mark contacted: only the owner or a workspace owner", async () => {
  const { ws, users } = await team(3);
  await publish(ws, body([users[1]!]));
  const c = await lead(ws);
  await route(rpc, { ws, contact: c, key: `form:${c}`, reason: "form" });
  await assert.rejects(q(`select router_sla_mark($1, $2, $3)`, [ws, c, users[2]]), /not_owner/);
  assert.equal((await q(`select router_sla_mark($1, $2, $3) m`, [ws, c, users[0]]))[0].m, true);
});

test("Slack signatures: right one passes; wrong, old or missing ones fail", () => {
  const secret = "slack-signing-secret";
  const body = "command=%2Fbook&text=dana%40client.io";
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = `v0=${createHmac("sha256", secret).update(`v0:${ts}:${body}`).digest("hex")}`;
  assert.equal(slackSigned({ body, timestamp: ts, signature: sig, secret }), true);
  assert.equal(slackSigned({ body: body + "x", timestamp: ts, signature: sig, secret }), false);
  assert.equal(slackSigned({ body, timestamp: String(Number(ts) - 600), signature: sig, secret }), false);
  assert.equal(slackSigned({ body, timestamp: ts, signature: null, secret }), false);
  assert.equal(slackSigned({ body, timestamp: ts, signature: sig, secret: "" }), false);
});

test("/book: a single-use link with the lead's owner as host, picked by type name; the caller hosts a new lead", async () => {
  const { ws, users } = await team(2);
  const [me, ownerRep] = users as [string, string];
  const type = async (name: string, host: string) =>
    (await q(`insert into meeting_types (workspace_id, slug, name, kind, hosts, settings) values ($1, $2, $3, 'one', $4, '{}') returning id`, [ws, `t-${randomUUID().slice(0, 6)}`, name, JSON.stringify([{ user_id: host }])]))[0].id as string;
  await type("Intro call", ownerRep);
  const demo = await type("Demo", ownerRep);
  await type("Mine", me);
  const c = await lead(ws);
  await q(`update contacts set owner_user_id = $2 where id = $1`, [c, ownerRep]);
  const email = (await q(`select email from contacts where id = $1`, [c]))[0].email as string;
  const saved: Record<string, unknown>[] = [];
  const deps = {
    rpc,
    ws,
    user: me,
    base: "https://app.test",
    loadType: async (id: string) => {
      const r = (await q(`select * from meeting_types where id = $1 and active`, [id]))[0];
      return r ? withDefaults(r as MeetingType) : null;
    },
    saveLink: async (row: Record<string, unknown>) => {
      saved.push(row);
      await q(`insert into meeting_links (workspace_id, kind, type_id, owner_user_id, token_hash) values ($1, $2, $3, $4, $5)`, [row.workspace_id, row.kind, row.type_id, row.owner_user_id, row.token_hash]);
    },
  };
  const r = await slackBook({ ...deps, text: `<mailto:${email}|${email}> demo` });
  assert.equal(saved.length, 1);
  assert.equal(saved[0]!.type_id, demo);
  assert.equal(saved[0]!.owner_user_id, ownerRep);
  assert.match(r.text, /^Dana Lee can book Demo with Rep 1\. The link works once\. https:\/\/app\.test\/book\/l\/[A-Za-z0-9_-]+\?email=/);
  // A lead not in Claritia yet: the caller hosts with their own type.
  const r2 = await slackBook({ ...deps, text: "new.person@else.io" });
  assert.match(r2.text, /^new\.person@else\.io can book Mine with Rep 0\./);
  // No email: how to use it.
  assert.match((await slackBook({ ...deps, text: "demo" })).text, /^Type \/book/);
  assert.match((await slackBook({ ...deps, text: `${email} pricing` })).text, /^No meeting type matches "pricing"/);
});
