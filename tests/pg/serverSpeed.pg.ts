// The batch functions of 088_server_speed.sql and the router actions that use them, on a real database: Route again
// for 5,000 leads is one call per 1,000 with each lead queued once (doubles joined, even from two calls at once);
// Let through routes up to 25 while the person waits (spam check off, fair turns under concurrency) and queues the
// rest with the spam check off; Allow domain lets through only that domain's held leads; Assign takes many leads in
// one call, each once, and two at once never fail; the meetings role is one row and kept; the other batches (hooks,
// journeys, nurture steps, the AI cache, test sends, fields, members, inbox pruning) do what the loops did.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";
import { heldAction, LET_INLINE, routeAgain, type Caller } from "../../src/lib/router/actions.ts";
import { emptyBody, type RouterBody } from "../../src/lib/router/types.ts";
import { roleOf, Refused } from "../../src/app/api/meetings/_lib/host.ts";
import { forgetRole } from "../../src/lib/roleCache.ts";
import { cachedStep } from "../../src/lib/ai/cache.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 20 });
const rpc = pgRpc(pool);
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

async function team(n: number) {
  const ws = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, 'Acme')`, [ws]);
  const users: string[] = [];
  for (let i = 0; i < n; i++) {
    const u = randomUUID();
    users.push(u);
    await q(`insert into auth.users (id, email) values ($1, $2)`, [u, `rep${i}-${u.slice(0, 6)}@acme.io`]);
    await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, $3)`, [ws, u, i === 0 ? "owner" : "member"]);
    await q(`insert into booking_profiles (workspace_id, user_id, slug, name) values ($1, $2, $3, $4)`, [ws, u, `rep-${i}-${u.slice(0, 4)}`, `Rep ${i}`]);
  }
  const owner: Caller = { ws, user: users[0]!, role: "owner" };
  return { ws, users, owner };
}

async function lead(ws: string, email: string) {
  return (await q(`insert into contacts (workspace_id, email, email_clean, email_class, first_name, last_name, country) values ($1, $2, $2, 'work', 'Dana', 'Lee', 'US') returning id`, [ws, email]))[0].id as string;
}

function rrBody(users: string[]): RouterBody {
  const b = emptyBody();
  b.account.on = false;
  b.queues = [{ id: "q1", name: "Everyone", method: "rr", strict: false, hoursOnly: false, members: users.map((user) => ({ user, weight: 1 })) }];
  b.rules.list = [{ id: "r1", name: "All", match: "all", conds: [{ field: "lead.source", op: "filled" }], queue: "q1" }];
  b.fallback = { kind: "queue", id: "q1" };
  return b;
}

/** A live router that holds every lead from blocked.io, and `n` held leads from there. */
async function heldTeam(n: number, reps = 2) {
  const t = await team(reps);
  await q(`select router_publish($1, $2, 'test', null)`, [t.ws, rrBody(t.users)]);
  await q(`select router_lists_save($1, null, '{blocked.io}')`, [t.ws]);
  const held: string[] = [];
  for (let i = 0; i < n; i++) {
    const c = await lead(t.ws, `p${i}-${randomUUID().slice(0, 6)}@blocked.io`);
    await q(`update contacts set route_status = 'held' where id = $1`, [c]);
    held.push(c);
  }
  return { ...t, held };
}

const jobsOf = async (ws: string, kind: string) => q(`select key, payload from jobs where workspace_id = $1 and kind = $2 and status = 'queued'`, [ws, kind]);

test("enqueue_jobs: one call for many, a key already waiting is joined (also from two calls at once), all or none", async () => {
  const { ws } = await team(1);
  const jobs = Array.from({ length: 300 }, (_, i) => ({ key: `k${i % 200}`, payload: { i } }));
  const [a, b] = await Promise.all([rpc("enqueue_jobs", { p_workspace: ws, p_kind: "speed_test", p_jobs: jobs }), rpc("enqueue_jobs", { p_workspace: ws, p_kind: "speed_test", p_jobs: jobs })]);
  assert.equal(a.error, null);
  assert.equal(b.error, null);
  assert.equal(a.data, 300);
  assert.equal((await jobsOf(ws, "speed_test")).length, 200, "200 keys, 200 jobs");
  const bad = await rpc("enqueue_jobs", { p_workspace: ws, p_kind: "speed_test2", p_jobs: [{ key: "a", payload: {} }, { key: "b", payload: {}, delay_s: "soon" }] });
  assert.ok(bad.error, "a bad element fails the call");
  assert.equal((await jobsOf(ws, "speed_test2")).length, 0, "and nothing of it is queued");
});

test("Route again for 5,000 leads (with doubles): one job per lead, undo on, in a handful of calls", async () => {
  const { ws, owner } = await team(1);
  const ids = Array.from({ length: 5000 }, () => randomUUID());
  const picked = [...ids, ...ids.slice(0, 250)];
  let calls = 0;
  const counted: typeof rpc = (fn, args) => (calls++, rpc(fn, args));
  const out = await routeAgain(counted, owner, picked);
  assert.deepEqual(out, { queued: 5000 });
  assert.equal(calls, 5, "five calls of 1,000, where it was 5,000");
  const rows = await jobsOf(ws, "route");
  assert.equal(rows.length, 5000);
  assert.equal(new Set(rows.map((r) => r.payload.contact)).size, 5000);
  assert.ok(rows.every((r) => r.payload.undo === true && r.payload.reason === "again" && r.payload.byUser === owner.user && r.key === r.payload.key));
  await assert.rejects(routeAgain(rpc, { ...owner, role: "member" }, ids.slice(0, 2)), /owners/);
});

test("Let through a few: routed while the person waits, spam check off, turns fair when routed side by side", async () => {
  const { ws, users, owner, held } = await heldTeam(LET_INLINE, 5);
  const out = await heldAction(rpc, dbOf(), owner, { op: "let_through", contacts: [...held, held[0]!] });
  const done = (out as { done: { contact: string; owner: string | null; kind: string }[] }).done;
  assert.equal(done.length, LET_INLINE, "the same lead picked twice is routed once");
  assert.ok(done.every((d) => d.kind === "owner" && d.owner && users.includes(d.owner)));
  assert.deepEqual(done.map((d) => d.contact), held, "answers in the order picked");
  const per = (await q(`select owner, count(*)::int n from router_runs where workspace_id = $1 and undone_at is null and kind = 'owner' group by owner`, [ws])).map((r) => r.n);
  assert.deepEqual(per.sort(), [5, 5, 5, 5, 5], "25 leads, 5 reps, 5 each: no turn taken twice");
  const still = await q(`select count(*)::int n from contacts where id = any($1) and route_status = 'held'`, [held]);
  assert.equal(still[0].n, 0);
});

test("Let through many: queued in one batch with the spam check off; nothing routed inline", async () => {
  const { ws, owner, held } = await heldTeam(LET_INLINE + 5);
  const out = (await heldAction(rpc, dbOf(), owner, { op: "let_through", contacts: held })) as { done: unknown[]; queued: number };
  assert.deepEqual(out.done, []);
  assert.equal(out.queued, LET_INLINE + 5);
  const rows = await jobsOf(ws, "route");
  assert.equal(rows.length, LET_INLINE + 5);
  assert.ok(rows.every((r) => r.payload.reason === "let_through" && r.payload.skipSpam === true && r.payload.undo === true));
  assert.equal((await q(`select count(*)::int n from router_runs where workspace_id = $1`, [ws]))[0].n, 0);
});

test("Allow a domain: only that domain's held leads (and its subdomains') go through", async () => {
  const { ws, owner } = await heldTeam(0);
  const a = await lead(ws, "dana@acme-held.io");
  const sub = await lead(ws, "lee@eu.acme-held.io");
  const other = await lead(ws, "sam@notacme-held.io");
  await q(`update contacts set route_status = 'held' where id = any($1)`, [[a, sub, other]]);
  const out = (await heldAction(rpc, dbOf(), owner, { op: "allow_domain", domain: "acme-held.io" })) as { done: { contact: string }[] };
  assert.deepEqual(out.done.map((d) => d.contact).sort(), [a, sub].sort());
  assert.equal((await q(`select route_status from contacts where id = $1`, [other]))[0].route_status, "held");
  assert.ok(((await q(`select allow from routers where workspace_id = $1`, [ws]))[0].allow as string[]).includes("acme-held.io"));
});

test("Assign many: one call, each lead once, and two at once over the same leads both finish", async () => {
  const { ws, users, owner, held } = await heldTeam(40, 3);
  let calls = 0;
  const counted: typeof rpc = (fn, args) => (calls++, rpc(fn, args));
  const out = await heldAction(counted, dbOf(), owner, { op: "assign", contacts: [...held.slice(0, 30), ...held.slice(0, 5)], user: users[1] });
  assert.deepEqual(out, { done: 30 });
  assert.equal(calls, 1);
  assert.equal((await q(`select count(*)::int n from contacts where id = any($1) and owner_user_id = $2`, [held.slice(0, 30), users[1]]))[0].n, 30);
  assert.equal((await q(`select count(*)::int n from router_runs where workspace_id = $1 and by = 'hand'`, [ws]))[0].n, 30);
  const [x, y] = await Promise.all([
    heldAction(rpc, dbOf(), owner, { op: "assign", contacts: held.slice(10, 40), user: users[1] }),
    heldAction(rpc, dbOf(), owner, { op: "assign", contacts: [...held.slice(10, 40)].reverse(), user: users[2] }),
  ]);
  assert.deepEqual([x, y], [{ done: 30 }, { done: 30 }]);
  const owners = await q(`select owner_user_id from contacts where id = any($1)`, [held.slice(10, 40)]);
  assert.ok(owners.every((r) => r.owner_user_id === users[1] || r.owner_user_id === users[2]));
});

test("meetings role: one row, kept in this process, refused for anyone not in the workspace", async () => {
  const { ws, users } = await team(2);
  let calls = 0;
  const counted: typeof rpc = (fn, args) => (calls++, rpc(fn, args));
  assert.deepEqual(await roleOf(counted, { ws, user: users[0]! }), { role: "owner" });
  assert.deepEqual(await roleOf(counted, { ws, user: users[0]! }), { role: "owner" });
  assert.deepEqual(await roleOf(counted, { ws, user: users[1]! }), { role: "member" });
  assert.equal(calls, 2, "read once per person");
  const stranger = randomUUID();
  await assert.rejects(roleOf(counted, { ws, user: stranger }), (e) => e instanceof Refused && e.status === 404);
  await q(`delete from workspace_members where workspace_id = $1 and user_id = $2`, [ws, users[1]]);
  forgetRole(ws, users[1]);
  await assert.rejects(roleOf(counted, { ws, user: users[1]! }), (e) => e instanceof Refused && e.status === 404, "a change made here counts at once");
  assert.equal((await rpc("meetings_role", { p_ws: ws, p_user: users[0] })).data, "owner");
});

test("router_members and router_fields_src: the team in one call; fields, forms and only each form's latest body", async () => {
  const { ws, users } = await team(3);
  const people = (await rpc("router_members", { p_ws: ws })).data as { id: string; name: string }[];
  assert.deepEqual(people.map((p) => p.id), users);
  await q(`insert into fields (workspace_id, object, key, label, type) values ($1, 'contact', 'plan', 'Plan', 'text')`, [ws]);
  const f = (await q(`insert into forms (workspace_id, name, status, version) values ($1, 'Demo', 'live', 2) returning id`, [ws]))[0].id;
  await q(`insert into form_versions (form_id, workspace_id, version, body) values ($1, $2, 1, '{"v": 1}'), ($1, $2, 2, '{"v": 2}')`, [f, ws]);
  await q(`insert into forms (workspace_id, name) values ($1, 'Draft only')`, [ws]);
  const src = (await rpc("router_fields_src", { p_ws: ws })).data as { custom: { key: string; object: string }[]; forms: { name: string }[]; latest: { form_id: string; version: number; body: { v: number } }[] };
  assert.deepEqual(src.custom.filter((c) => c.object === "contact").map((c) => c.key), ["plan"]);
  assert.deepEqual(src.forms.map((x) => x.name).sort(), ["Demo", "Draft only"]);
  assert.deepEqual(src.latest, [{ form_id: f, version: 2, body: { v: 2 } }]);
});

test("hook_stage_many: a delivery's events in one call, a repeat staged once, one job", async () => {
  const { ws } = await team(1);
  const sid = (await q(`insert into sources (workspace_id, kind, name, status) values ($1, 'webhook', 'Hook', 'active') returning id`, [ws]))[0].id;
  const ev = (d: string) => ({ dedupe: d, body: { dedupe: d, kind: "contact" } });
  assert.equal((await rpc("hook_stage_many", { p_source: sid, p_events: [ev("a"), ev("b"), ev("a")] })).data, 2);
  assert.equal((await rpc("hook_stage_many", { p_source: sid, p_events: [ev("a"), ev("c")] })).data, 1);
  assert.equal((await q(`select count(*)::int n from hook_events where source_id = $1`, [sid]))[0].n, 3);
  assert.equal((await jobsOf(ws, "source_hook")).length, 1);
});

test("journeys_create: in order, one per journey key, a second build makes none", async () => {
  const { ws, users } = await team(1);
  const items = ["welcome", "trial"].map((k) => ({ name: k, stage: "trial", journey: k, draft: { trigger: { kind: "manual" }, steps: [] } }));
  const ids = (await rpc("journeys_create", { p_ws: ws, p_user: users[0], p_items: items })).data as string[];
  assert.equal(ids.length, 2);
  const again = (await rpc("journeys_create", { p_ws: ws, p_user: users[0], p_items: items })).data as string[];
  assert.deepEqual(again, ids);
  assert.ok((await rpc("journeys_create", { p_ws: ws, p_user: randomUUID(), p_items: items })).error, "only members");
});

test("nurture_steps_save: as the person, all or none", async () => {
  const { ws, users } = await team(1);
  const n = (await q(`insert into nurtures (workspace_id, name) values ($1, 'Trial') returning id`, [ws]))[0].id;
  const step = (subject: string) => ({ wait_days: 2, subject, preheader: "", html: "<p>x</p>", text: "x", links: [], notes: ["check"] });
  const c = await pool.connect();
  try {
    await c.query(`select set_config('request.jwt.claim.sub', $1, false)`, [users[0]]);
    const r = await c.query(`select nurture_steps_save($1, null, $2) ids`, [n, JSON.stringify([step("One"), step("Two")])]);
    assert.equal(r.rows[0].ids.length, 2);
    await assert.rejects(c.query(`select nurture_steps_save($1, null, $2)`, [n, JSON.stringify([step("Three"), step(" ")])]), /Add a subject/);
    await c.query(`select set_config('request.jwt.claim.sub', $1, false)`, [randomUUID()]);
    await assert.rejects(c.query(`select nurture_steps_save($1, null, $2)`, [n, JSON.stringify([step("Four")])]), /Nurture not found/);
  } finally {
    await c.query(`select set_config('request.jwt.claim.sub', '', false)`);
    c.release();
  }
  assert.equal((await q(`select count(*)::int n from nurture_steps where nurture_id = $1`, [n]))[0].n, 2, "the failed batch left nothing");
});

test("the AI step cache: a hit is one call and logged; a miss is run once, logged and kept", async () => {
  const { ws } = await team(1);
  let runs = 0;
  let calls = 0;
  const counted: typeof rpc = (fn, args) => (calls++, rpc(fn, args));
  const step = () => cachedStep(counted, ws, "speed_test", "a1".repeat(32), async () => (runs++, { result: { ok: 1 }, model: "claude-haiku-5-5", usage: { input: 10, output: 5, cache_read: 0, cache_write: 0 } }));
  const a = await step();
  assert.equal(a.cached, false);
  assert.equal(calls, 2, "a miss: the read, then the log and the save together");
  calls = 0;
  const b = await step();
  assert.equal(b.cached, true);
  assert.deepEqual(b.result, { ok: 1 });
  assert.equal(calls, 1, "a hit: one call");
  assert.equal(runs, 1);
  const logs = await q(`select model, cached from ai_calls where workspace_id = $1 order by cached`, [ws]);
  assert.deepEqual(logs.map((l) => [l.model, l.cached]), [["claude-haiku-5-5", false], ["cache", true]]);
});

test("a test send: whether it can go, then made and queued as one", async () => {
  const { ws, users } = await team(1);
  assert.deepEqual((await rpc("email_test_ready", { p_ws: ws })).data, { from_email: null, paused: false, verified: false });
  const d = `m${ws.slice(-8)}.acme.com`;
  await q(`insert into send_settings (workspace_id, from_name, from_email, address) values ($1, 'Acme', $2, '1 Main St')`, [ws, `news@${d}`]);
  assert.deepEqual((await rpc("email_test_ready", { p_ws: ws })).data, { from_email: `news@${d}`, paused: false, verified: false });
  await q(`insert into sending_domains (workspace_id, domain, mail_from, tracking_host, status) values ($1, $2, $3, $4, 'verified')`, [ws, d, `bounce.${d}`, `t.${d}`]);
  assert.equal(((await rpc("email_test_ready", { p_ws: ws })).data as { verified: boolean }).verified, true);
  const values = { kind: "test", name: "Test", subject: "Hi", preheader: "", html: "<p>Hi</p>", text: "Hi", links: [], marketing: true };
  const m = await rpc("email_test_send", { p_ws: ws, p_user: users[0], p_values: values });
  assert.equal(m.error, null);
  assert.equal((await q(`select to_email from email_messages where id = $1`, [m.data]))[0].to_email, (await q(`select email from auth.users where id = $1`, [users[0]]))[0].email);
  const stranger = await rpc("email_test_send", { p_ws: ws, p_user: randomUUID(), p_values: values });
  assert.match(String(stranger.error?.message), /Only members get tests/);
  assert.equal((await q(`select count(*)::int n from emails where workspace_id = $1`, [ws]))[0].n, 1, "the refused one left no email behind");
});

test("inbox_prune: mail older than a week goes, newer stays", async () => {
  const { ws } = await team(1);
  const p = (await q(`insert into projects (workspace_id, name) values ($1, 'App') returning id`, [ws]))[0].id;
  await q(`insert into inbox_messages (workspace_id, project_id, external_id, to_address, received_at) values ($1, $2, $3, 'a@x', now() - interval '8 days'), ($1, $2, $4, 'a@x', now())`, [ws, p, randomUUID(), randomUUID()]);
  assert.ok(((await rpc("inbox_prune", {})).data as number) >= 1);
  assert.equal((await q(`select count(*)::int n from inbox_messages where project_id = $1`, [p]))[0].n, 1);
});

/** A Supabase-like query builder over the pool, for the few table reads heldAction makes (routers, contacts). */
function dbOf() {
  type Cond = { col: string; op: string; val: unknown };
  const from = (table: string) => {
    const conds: Cond[] = [];
    let cols = "*";
    let limit: number | null = null;
    const run = async (single: boolean) => {
      const params: unknown[] = [];
      const where = conds.map((c) => {
        if (c.op === "or") {
          const parts = String(c.val).split(",").map((p) => {
            const [col, , ...rest] = p.split(".");
            params.push(rest.join(".").replace(/\*/g, "%"));
            return `${col} like $${params.length}`;
          });
          return `(${parts.join(" or ")})`;
        }
        params.push(c.val);
        return `${c.col} = $${params.length}`;
      });
      const sql = `select ${cols} from ${table}${where.length ? ` where ${where.join(" and ")}` : ""}${limit ? ` limit ${limit}` : ""}`;
      const rows = (await pool.query(sql, params)).rows;
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    };
    const b = {
      select: (c: string) => ((cols = c), b),
      eq: (col: string, val: unknown) => (conds.push({ col, op: "eq", val }), b),
      or: (val: string) => (conds.push({ col: "", op: "or", val }), b),
      limit: (n: number) => ((limit = n), b),
      maybeSingle: () => run(true),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => run(false).then(res, rej),
    };
    return b;
  };
  return { from } as never;
}
