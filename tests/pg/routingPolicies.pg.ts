// Routing policies on a real database (docs/routing-workflow.md Sections 4, 12, 17, 22 and 26): the Section 26
// fixtures through the production path (facts, the shared evaluator, routing_commit). Moving today's router over
// keeps its versions, draft and live body; drafts are durable and guarded; versions can't change; teams share one
// queue; the daily quota counts only committed new owners, across teams, even when two commits race; a retried or
// concurrent request commits once; a failed transaction leaves no count and no turn (T01-T12, O01-O14 at commit).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";
import { route, testRoute, type Inputs, type LiveRouter } from "../../src/lib/router/server.ts";
import { emptyBody, type RouterBody } from "../../src/lib/router/types.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";
import { ANA, KAI, LEE, policy, VIN } from "../fixtures/routingSpec.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 20 });
const rpc = pgRpc(pool);
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

const NAMES: Record<string, string> = { [ANA]: "Ana", [VIN]: "Vincent", [KAI]: "Kai", [LEE]: "Lee" };
const day = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

/** One workspace with the Section 26 people and teams: Ana 2/5, Vincent 1/5, Kai 3/5 and out of office. */
async function fixture(o: { body?: RouterBody } = {}) {
  const ws = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, 'Fixture')`, [ws]);
  for (const [u, name] of Object.entries(NAMES)) {
    await q(`insert into auth.users (id, email) values ($1, $2) on conflict do nothing`, [u, `${name.toLowerCase()}@claritia.test`]);
    await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, $3)`, [ws, u, u === VIN ? "owner" : "member"]);
    await q(`insert into booking_profiles (workspace_id, user_id, slug, name) values ($1, $2, $3, $4)`, [ws, u, `${name.toLowerCase()}-${ws.slice(0, 6)}`, name]);
    await q(`insert into router_reps (workspace_id, user_id, cap_day, out_dates) values ($1, $2, 5, $3)`, [ws, u, JSON.stringify(u === KAI ? [{ from: day(-1), to: day(2) }] : [])]);
  }
  for (const [u, n] of [[ANA, 2], [VIN, 1], [KAI, 3]] as const) await setCount(ws, u, n);
  const teams: Record<string, string> = {};
  for (const [key, name, members] of [["eus", "Enterprise US", [ANA, VIN]], ["eg", "Enterprise global", [KAI, ANA]], ["gs", "General sales", [VIN, KAI, ANA]], ["vn", "Vietnam sales", [VIN]]] as const) {
    const t = (await q(`select routing_team_save($1, null, $2, 'rr', $3, null, $4) t`, [ws, name, JSON.stringify(members.map((user) => ({ user }))), key]))[0].t;
    teams[key] = t.id;
  }
  const body = o.body ?? policy();
  const pid = await createAndPublish(ws, "Inbound sales", body);
  return { ws, pid, teams, live: await liveOf(ws, pid) };
}

async function setCount(ws: string, u: string, n: number) {
  const p = (await q(`select (routing_quota_current($1, $2)).period_start s`, [ws, u]))[0].s;
  await q(`update routing_quota set n = $4 where workspace_id = $1 and user_id = $2 and period_start = $3`, [ws, u, p, n]);
}

async function createAndPublish(ws: string, name: string, body: RouterBody) {
  const pid = (await q(`select routing_policy_create($1, $2, $3, $4, $5) r`, [ws, name, body, randomUUID(), VIN]))[0].r.id as string;
  await q(`select routing_publish($1, $2, $3, 'test', $4, $5, 1)`, [ws, pid, body, VIN, randomUUID()]);
  return pid;
}

const liveOf = async (ws: string, pid: string) => (await q(`select routing_live($1, $2) l`, [ws, pid]))[0].l as LiveRouter;
const count = async (ws: string, u: string) => (await q(`select coalesce((routing_quota_used($1, $2)->>'today')::int, 0) n`, [ws, u]))[0].n as number;
const next = async (team: string) => (await q(`select next_position from routing_teams where id = $1`, [team]))[0].next_position as number;
const ownerOf = async (c: string) => (await q(`select owner_user_id from contacts where id = $1`, [c]))[0].owner_user_id as string | null;

let n = 0;
async function lead(ws: string, o: { owner?: string | null; company?: string | null; email?: string } = {}) {
  n++;
  return (
    await q(`insert into contacts (workspace_id, email, email_clean, email_class, first_name, last_name, company_id, owner_user_id) values ($1, $2, $2, $5, 'Maya', 'Chen', $3, $4) returning id`, [
      ws,
      o.email ?? `maya${n}-${randomUUID().slice(0, 6)}@globex${n}.com`,
      o.company ?? null,
      o.owner ?? null,
      /@gmail\.com$/.test(o.email ?? "") ? "free" : "work",
    ])
  )[0].id as string;
}

const inputs = (country: string | null, employees: number | string | null, issues: Inputs["issues"] = []): Inputs => ({
  values: { "lead.country": country, "company.employees": employees },
  provenance: { "lead.country": { source: "form", field: "f_country" }, "company.employees": { source: "form", field: "f_size" } },
  issues,
});

async function go(f: { ws: string; live: LiveRouter }, c: string, i: Inputs = inputs("US", 800), key = `form:${c}`) {
  const r = await route(rpc, { ws: f.ws, contact: c, key, reason: "form", live: f.live, inputs: i });
  const run = "run" in r ? (await q(`select * from router_runs where id = $1`, [r.run]))[0] : null;
  return { r, run };
}

// C: persistence -------------------------------------------------------------------------------------------------

test("C: today's router moves over as Inbound with the same versions, draft and live body; nothing is reassigned", async () => {
  const ws = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, 'Old')`, [ws]);
  await q(`insert into auth.users (id, email) values ($1, 'vincent@claritia.test') on conflict do nothing`, [VIN]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, VIN]);
  const v1 = { ...emptyBody(), queues: [{ id: "q_sales", name: "Sales", method: "rr", strict: false, hoursOnly: false, members: [{ user: VIN, weight: 1 }] }], fallback: { kind: "queue", id: "q_sales" } };
  const v2 = { ...v1, rules: { on: true, list: [{ id: "r_us", name: "US", match: "all", conds: [{ field: "lead.country", op: "not_one_of", value: ["DE"] }], queue: "q_sales" }] } };
  const draft = { ...v2, spam: { ...v2.spam, on: false } };
  await q(`insert into routers (workspace_id, live_version, draft, draft_base, draft_revision) values ($1, 2, $2, 2, 7)`, [ws, draft]);
  await q(`insert into router_versions (workspace_id, version, body, note) values ($1, 1, $2, 'one'), ($1, 2, $3, 'two')`, [ws, v1, v2]);
  const owned = await lead(ws, { owner: VIN });
  const before = await q(`select owner_user_id, updated_at from contacts where workspace_id = $1`, [ws]);
  const m1 = (await q(`select routing_migrate($1) m`, [ws]))[0].m;
  const m2 = (await q(`select routing_migrate($1) m`, [ws]))[0].m;
  assert.equal(m1.policy, m2.policy, "safe to run twice");
  const p = (await q(`select * from routing_policies where workspace_id = $1`, [ws]))[0];
  assert.deepEqual([p.name, p.is_default, p.active_version, p.draft_revision, p.draft_base], ["Inbound", true, 2, 7, 2]);
  assert.deepEqual(p.draft, draft);
  const vs = await q(`select version, config, note from routing_policy_versions where policy_id = $1 order by version`, [p.id]);
  assert.deepEqual(vs.map((v) => [v.version, v.note]), [[1, "one"], [2, "two"]]);
  assert.deepEqual(vs[1].config, v2, "the same body: v1 semantics kept");
  assert.deepEqual((await q(`select router_live($1) l`, [ws]))[0].l.body, v2);
  assert.deepEqual(await q(`select owner_user_id, updated_at from contacts where workspace_id = $1`, [ws]), before, "no contact touched");
  assert.equal(await ownerOf(owned), VIN);
  // Versions can't change; a stale draft save is refused; a reload reads the last saved draft.
  await assert.rejects(q(`update routing_policy_versions set note = 'x' where policy_id = $1`, [p.id]), /immutable/);
  await assert.rejects(q(`select router_draft_save($1, $2, 6, $3)`, [ws, draft, VIN]), /conflict/);
  const edited = { ...draft, spam: { ...draft.spam, on: true } };
  assert.equal((await q(`select router_draft_save($1, $2, 7, $3) r`, [ws, edited, VIN]))[0].r, 8);
  assert.deepEqual((await q(`select draft, draft_revision from routers where workspace_id = $1`, [ws]))[0], { draft: edited, draft_revision: 8 }, "the screens' mirror");
  assert.deepEqual((await q(`select draft from routing_policies where id = $1`, [p.id]))[0].draft, edited);
  assert.deepEqual((await q(`select router_live($1) l`, [ws]))[0].l.body, v2, "a draft never touches the live version");
});

test("C: identical per-rule copies fold into one team; different ones stay named teams; the queue starts where the old rule would go", async () => {
  const ws = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, 'Split')`, [ws]);
  for (const u of [ANA, VIN, KAI]) {
    await q(`insert into auth.users (id, email) values ($1, $2) on conflict do nothing`, [u, `${NAMES[u]}@claritia.test`]);
    await q(`insert into workspace_members (workspace_id, user_id) values ($1, $2)`, [ws, u]);
  }
  const members = [ANA, VIN, KAI].map((user) => ({ user, weight: 1 }));
  const body = {
    ...emptyBody(),
    queues: [
      { id: "q_sales", name: "Sales", method: "rr", strict: false, hoursOnly: false, members },
      { id: "q_r_us", name: "US", method: "rr", strict: false, hoursOnly: false, members },
      { id: "q_r_de", name: "DE", method: "load", strict: false, hoursOnly: false, members },
      { id: "q_default", name: "Default rule", method: "rr", strict: false, hoursOnly: false, members: [{ user: VIN, weight: 1 }] },
    ],
    rules: { on: true, list: [{ id: "r_us", name: "US", match: "all", conds: [], queue: "q_r_us" }, { id: "r_de", name: "DE", match: "all", conds: [], queue: "q_r_de" }] },
    fallback: { kind: "queue", id: "q_default" },
  };
  await q(`insert into routers (workspace_id, live_version) values ($1, 1)`, [ws]);
  await q(`insert into router_versions (workspace_id, version, body) values ($1, 1, $2)`, [ws, body]);
  // History: Ana had two leads from Sales and US, Vincent one, Kai none: Kai is next.
  const c = await lead(ws);
  for (const [u, k] of [[ANA, "q_sales"], [ANA, "q_r_us"], [VIN, "q_sales"]] as const)
    await q(`insert into router_runs (workspace_id, contact_id, key, reason, kind, owner, by, queue_id) values ($1, $2, $3, 'form', 'owner', $4, 'queue', $5)`, [ws, c, randomUUID(), u, k]);
  await q(`select routing_migrate($1)`, [ws]);
  const keys = Object.fromEntries((await q(`select key, team_id from routing_team_keys where workspace_id = $1`, [ws])).map((r) => [r.key, r.team_id]));
  assert.equal(keys.q_r_us, keys.q_sales, "the identical per-rule copy shares the team");
  assert.notEqual(keys.q_r_de, keys.q_sales, "a different method stays its own team");
  assert.notEqual(keys.q_default, keys.q_sales);
  const t = (await q(`select name, next_position from routing_teams where id = $1`, [keys.q_sales]))[0];
  const pos = (await q(`select position from routing_team_members where team_id = $1 and user_id = $2`, [keys.q_sales, KAI]))[0].position;
  assert.deepEqual([t.name, t.next_position], ["Sales", pos], "Kai, who had the fewest, is next");
});

test("C: every form gets an explicit connection matching what it does today", async () => {
  const f = await fixture();
  const type = (await q(`insert into meeting_types (workspace_id, slug, name, kind, hosts, settings) values ($1, 'intro', 'Intro call', 'one', '[]', '{}') returning id`, [f.ws]))[0].id;
  const book = (await q(`insert into forms (workspace_id, name, version) values ($1, 'Demo request', 1) returning id`, [f.ws]))[0].id;
  await q(`insert into form_versions (form_id, workspace_id, version, body) values ($1, $2, 1, $3)`, [book, f.ws, { after: { schedule: { tool: "claritia", url: "", perOwner: false, meetingTypeId: type } } }]);
  const plain = (await q(`insert into forms (workspace_id, name, version) values ($1, 'Contact sales', 1) returning id`, [f.ws]))[0].id;
  await q(`insert into form_versions (form_id, workspace_id, version, body) values ($1, $2, 1, $3)`, [plain, f.ws, { after: { end: { kind: "message" } } }]);
  await q(`select routing_migrate($1)`, [f.ws]);
  const s = await q(`select form_id, outcome, meeting_type_id, follows_default, enabled from routing_sources where workspace_id = $1 order by outcome`, [f.ws]);
  assert.deepEqual(s.map((x) => [x.form_id, x.outcome, x.meeting_type_id, x.follows_default, x.enabled]), [
    [book, "assign_and_calendar", type, true, true],
    [plain, "assign_only", null, true, true],
  ]);
  // A staged connection to a policy is live only after the release that includes it.
  const staged = (await q(`select routing_source_stage($1, $2, $3, null, $4) s`, [f.ws, plain, { policy_id: f.pid, enabled: true, outcome: "assign_only" }, VIN]))[0].s;
  assert.equal((await q(`select routing_source_resolve($1) r`, [plain]))[0].r.source.follows_default, true, "staged, not live");
  await assert.rejects(q(`select routing_source_stage($1, $2, $3, null, $4)`, [f.ws, plain, { policy_id: randomUUID() }, VIN]), /not_found/);
  const v = (await q(`select draft_revision from routing_policies where id = $1`, [f.pid]))[0].draft_revision;
  await q(`select routing_draft_save($1, $2, $3, $4, $5)`, [f.ws, f.pid, policy(), v, VIN]);
  await q(`select routing_publish($1, $2, $3, 'with source', $4, $5, $6, true, $7)`, [f.ws, f.pid, policy(), VIN, randomUUID(), v + 1, JSON.stringify([{ id: staged.id, revision: staged.revision }])]);
  const r = (await q(`select routing_source_resolve($1) r`, [plain]))[0].r;
  assert.deepEqual([r.source.follows_default, r.source.policy_id, r.live.policy_id, r.live.version], [false, f.pid, f.pid, 2]);
});

test("G05/G07 publish: a stale revision is a conflict; the same operation id returns the version it made", async () => {
  const f = await fixture();
  const rev = (await q(`select draft_revision from routing_policies where id = $1`, [f.pid]))[0].draft_revision;
  await q(`select routing_draft_save($1, $2, $3, $4, $5)`, [f.ws, f.pid, policy(), rev, VIN]);
  await assert.rejects(q(`select routing_publish($1, $2, $3, 'old', $4, 'k1', $5)`, [f.ws, f.pid, policy(), VIN, rev]), /draft_conflict/);
  const a = (await q(`select routing_publish($1, $2, $3, 'once', $4, 'k2', $5) r`, [f.ws, f.pid, policy(), VIN, rev + 1]))[0].r;
  const b = (await q(`select routing_publish($1, $2, $3, 'once', $4, 'k2', $5) r`, [f.ws, f.pid, policy(), VIN, rev + 1]))[0].r;
  assert.deepEqual([a.version, a.repeat, b.version, b.repeat], [2, false, 2, true]);
  assert.equal((await q(`select count(*)::int n from routing_policy_versions where policy_id = $1`, [f.pid]))[0].n, 2);
  // P02: the same create key makes one policy.
  const key = randomUUID();
  const [x, y] = await Promise.all([1, 2].map(() => q(`select routing_policy_create($1, 'Partners', null, $2, $3) r`, [f.ws, key, VIN])));
  assert.equal(x[0].r.id, y[0].r.id);
  await assert.rejects(q(`select routing_policy_create($1, '   ', null, null, $2)`, [f.ws, VIN]), /name/);
});

test("P06 and B13: a reordered draft changes nothing live; after publish new runs use v2 and old runs keep v1", async () => {
  const f = await fixture();
  const first = await lead(f.ws);
  const a = await go(f, first, inputs("VN", 800));
  assert.deepEqual([a.run.owner, a.run.policy_version, a.run.rule_id], [ANA, 1, "r_ent"]);
  const reordered = policy();
  reordered.rules.list = [reordered.rules.list[2]!, reordered.rules.list[0]!, reordered.rules.list[1]!];
  const rev = (await q(`select draft_revision from routing_policies where id = $1`, [f.pid]))[0].draft_revision;
  await q(`select routing_draft_save($1, $2, $3, $4, $5)`, [f.ws, f.pid, reordered, rev, VIN]);
  const b = await go(f, await lead(f.ws), inputs("VN", 800));
  assert.equal(b.run.rule_id, "r_ent", "the draft isn't live");
  await q(`select routing_publish($1, $2, $3, 'Vietnam first', $4, $5, $6)`, [f.ws, f.pid, reordered, VIN, randomUUID(), rev + 1]);
  const live = await liveOf(f.ws, f.pid);
  const c = await go({ ...f, live }, await lead(f.ws), inputs("VN", 800));
  assert.deepEqual([c.run.rule_id, c.run.owner, c.run.policy_version], ["r_vn", VIN, 2]);
  const old = (await q(`select policy_version, owner from router_runs where id = $1`, [a.run.id]))[0];
  assert.deepEqual([old.policy_version, old.owner], [1, ANA], "B13: the accepted run keeps its version and owner");
  assert.equal(await ownerOf(first), ANA);
});

// D: allocation --------------------------------------------------------------------------------------------------

test("T01 two fresh US enterprise contacts in turn: Ana then Vincent, one count and one turn each", async () => {
  const f = await fixture();
  const a = await go(f, await lead(f.ws));
  const b = await go(f, await lead(f.ws));
  assert.deepEqual([a.run.owner, b.run.owner], [ANA, VIN]);
  assert.deepEqual([await count(f.ws, ANA), await count(f.ws, VIN)], [3, 2]);
  assert.equal(await next(f.teams.eus!), 2, "past Vincent's position (1)");
  const ev = await q(`select user_id, counted, advanced from routing_assignments where workspace_id = $1 order by created_at`, [f.ws]);
  assert.deepEqual(ev.map((e) => [e.user_id, e.counted, e.advanced]), [[ANA, true, true], [VIN, true, true]]);
  assert.deepEqual([a.run.assignment_state, a.run.effect, a.run.policy_id, a.run.trace.rules.matched.name, a.run.trace.assignment.recipient], ["assigned", "new", f.pid, "US enterprise", ANA]);
});

test("T02 previewing the same contact again and again changes no count and no queue", async () => {
  const f = await fixture();
  const c = await lead(f.ws);
  for (let i = 0; i < 5; i++) {
    const t = await testRoute(rpc, { ws: f.ws, contact: c, body: f.live.body, changes: { "lead.country": "US", "company.employees": 800 } });
    assert.ok(t?.decision.result.kind === "owner" && t.decision.result.user === ANA);
  }
  assert.deepEqual([await count(f.ws, ANA), await next(f.teams.eus!), (await q(`select count(*)::int n from router_runs where workspace_id = $1`, [f.ws]))[0].n], [2, 0, 0]);
});

test("T03 Ana paused before a fresh US commit: Vincent, with Ana's reason in the trace", async () => {
  const f = await fixture();
  await q(`update router_reps set paused_until = 'infinity' where workspace_id = $1 and user_id = $2`, [f.ws, ANA]);
  const a = await go(f, await lead(f.ws));
  assert.equal(a.run.owner, VIN);
  assert.deepEqual(a.run.trace.distribution.excluded, [{ user: ANA, reason: "paused" }]);
});

test("T04 both US members unavailable: the backup once, then a monitored review", async () => {
  const body = policy();
  body.backup = { kind: "user", id: KAI };
  const f = await fixture({ body });
  await q(`update router_reps set paused_until = 'infinity' where workspace_id = $1 and user_id = any($2)`, [f.ws, [ANA, VIN]]);
  await q(`update router_reps set out_dates = '[]' where workspace_id = $1 and user_id = $2`, [f.ws, KAI]);
  const a = await go(f, await lead(f.ws));
  assert.deepEqual([a.run.owner, a.run.by], [KAI, "backup"]);
  await q(`update router_reps set out_dates = $3 where workspace_id = $1 and user_id = $2`, [f.ws, KAI, JSON.stringify([{ from: day(-1), to: day(1) }])]);
  const c = await lead(f.ws);
  const b = await go(f, c);
  assert.deepEqual([b.run.kind, b.run.assignment_state, b.run.owner], ["unassigned", "unassigned_needs_review", null]);
  const rv = await q(`select reason, state, reviewer, policy_id from routing_reviews where run_id = $1`, [b.run.id]);
  assert.deepEqual(rv, [{ reason: "no_eligible_recipient", state: "open", reviewer: VIN, policy_id: f.pid }], "one item, named reviewer");
  assert.deepEqual([await count(f.ws, ANA), await count(f.ws, VIN), await next(f.teams.eus!)], [2, 1, 0], "no count, no turn");
  assert.equal(await ownerOf(c), null);
});

test("T06 a member in two teams with one slot left: two commits at once never take her past her cap", async () => {
  for (let round = 0; round < 5; round++) {
    const f = await fixture();
    await q(`update router_reps set cap_day = 3 where workspace_id = $1 and user_id = $2`, [f.ws, ANA]);
    const [a, b] = await Promise.all([go(f, await lead(f.ws), inputs("US", 800)), go(f, await lead(f.ws), inputs("DE", 800))]);
    assert.equal(await count(f.ws, ANA), 3, "one new lead for Ana at most");
    const owners = [a.run.owner, b.run.owner];
    assert.equal(owners.filter((x) => x === ANA).length, 1);
    // The US lead goes to Ana or Vincent; the global one to Ana or (Kai out, Ana full) review.
    if (a.run.owner !== ANA) assert.equal(a.run.owner, VIN);
    if (b.run.owner !== ANA) assert.equal(b.run.assignment_state, "unassigned_needs_review");
  }
});

test("T07 the same submission processed twice at once: one result, one owner write, one count, one turn", async () => {
  const f = await fixture();
  const c = await lead(f.ws);
  const rs = await Promise.all([1, 2, 3].map(() => route(rpc, { ws: f.ws, contact: c, key: `form:${c}`, reason: "form", live: f.live, inputs: inputs("US", 800) })));
  assert.deepEqual(rs.map((r) => r.status).sort(), ["dup", "dup", "ok"]);
  assert.deepEqual((await q(`select count(*)::int n from router_runs where workspace_id = $1`, [f.ws]))[0].n, 1);
  assert.deepEqual([await count(f.ws, ANA), await next(f.teams.eus!)], [3, 1]);
  assert.equal((await q(`select count(*)::int n from field_history where record_id = $1 and key = 'owner'`, [c]))[0].n, 1);
  const owners = rs.map((r) => ("result" in r && r.result.kind === "owner" ? r.result.user : null));
  assert.deepEqual(owners, [ANA, ANA, ANA]);
});

test("T08 a commit that fails before it ends leaves no run, no count and no turn", async () => {
  const f = await fixture();
  await q(`create or replace function public.t08_fail() returns trigger language plpgsql as $$ begin raise exception 't08: forced failure'; end $$`);
  await q(`create trigger t08_fail after insert on public.routing_assignments for each row when (new.workspace_id = '${f.ws}') execute function public.t08_fail()`);
  try {
    await assert.rejects(go(f, await lead(f.ws)), /t08/);
  } finally {
    await q(`drop trigger if exists t08_fail on public.routing_assignments`);
  }
  assert.deepEqual([await count(f.ws, ANA), await next(f.teams.eus!), (await q(`select count(*)::int n from router_runs where workspace_id = $1`, [f.ws]))[0].n], [2, 0, 0]);
  const a = await go(f, await lead(f.ws));
  assert.equal(a.run.owner, ANA, "the next try takes the same turn");
});

test("T09 another policy pointing at Enterprise US takes turns from the same queue", async () => {
  const f = await fixture();
  const other = policy();
  other.rules.list = [other.rules.list[0]!];
  const pid2 = await createAndPublish(f.ws, "Partners", other);
  const live2 = await liveOf(f.ws, pid2);
  const a = await go(f, await lead(f.ws));
  const b = await go({ ws: f.ws, live: live2 }, await lead(f.ws));
  assert.deepEqual([a.run.owner, b.run.owner, b.run.policy_id], [ANA, VIN, pid2]);
  assert.equal(await next(f.teams.eus!), 2);
});

test("T10 removing and adding a member keeps the order and never restarts the queue", async () => {
  const f = await fixture();
  await go(f, await lead(f.ws), inputs("DE", 50));
  assert.equal(await next(f.teams.gs!), 1, "Vincent took the first turn");
  const rev = (await q(`select revision from routing_teams where id = $1`, [f.teams.gs]))[0].revision;
  await q(`select routing_team_save($1, $2, 'General sales', 'rr', $3, $4)`, [f.ws, f.teams.gs, JSON.stringify([{ user: VIN }, { user: ANA }]), rev]);
  await assert.rejects(q(`select routing_team_save($1, $2, 'General sales', 'rr', $3, $4)`, [f.ws, f.teams.gs, JSON.stringify([{ user: VIN }]), rev]), /draft_conflict/);
  const t = await q(`select user_id, position from routing_team_members where team_id = $1 order by position`, [f.teams.gs]);
  assert.deepEqual(t.map((x) => [x.user_id, x.position]), [[VIN, 0], [ANA, 2]], "Kai's position left; nobody renumbered");
  assert.equal(await next(f.teams.gs!), 1, "not reset");
  const b = await go(f, await lead(f.ws), inputs("DE", 50));
  assert.equal(b.run.owner, ANA, "the turn after Vincent");
  await q(`select routing_team_save($1, $2, 'General sales', 'rr', $3)`, [f.ws, f.teams.gs, JSON.stringify([{ user: VIN }, { user: ANA }, { user: KAI }])]);
  assert.equal((await q(`select position from routing_team_members where team_id = $1 and user_id = $2`, [f.teams.gs, KAI]))[0].position, 3, "added at the end");
});

test("T11 a member outside working hours can still own a lead", async () => {
  const f = await fixture();
  // Ana works only on Sundays 01:00 to 02:00, so she's outside her hours now.
  await q(`insert into availability (workspace_id, user_id, tz, weekly) values ($1, $2, 'UTC', $3)`, [f.ws, ANA, { sun: [["01:00", "02:00"]] }]);
  const a = await go(f, await lead(f.ws));
  assert.equal(a.run.owner, ANA);
});

test("T12 a member back from PTO takes ordinary turns, with no catch-up", async () => {
  const f = await fixture();
  await q(`update router_reps set out_dates = '[]' where workspace_id = $1 and user_id = $2`, [f.ws, KAI]);
  const owners = [];
  for (let i = 0; i < 4; i++) owners.push((await go(f, await lead(f.ws), inputs("DE", 800))).run.owner);
  assert.deepEqual(owners, [KAI, ANA, KAI, ANA]);
});

// O: ownership at commit -------------------------------------------------------------------------------------------

async function company(ws: string, owner: string | null, domain = `acme-${randomUUID().slice(0, 6)}.com`) {
  return (await q(`insert into companies (workspace_id, name, domain, owner_user_id) values ($1, 'Acme', $2, $3) returning id`, [ws, domain, owner]))[0].id as string;
}

test("O01/O02/O03 kept owners cost nothing; a company owner who is new costs one count and no turn", async () => {
  const f = await fixture();
  const kept = await go(f, await lead(f.ws, { owner: VIN }));
  assert.deepEqual([kept.run.owner, kept.run.effect, kept.run.by], [VIN, "retained", "keep"]);
  const ev = (await q(`select counted, advanced from routing_assignments where run_id = $1`, [kept.run.id]))[0];
  assert.deepEqual([ev.counted, ev.advanced, await count(f.ws, VIN), await next(f.teams.eus!)], [false, false, 1, 0]);
  const co = await company(f.ws, ANA);
  const moved = await go(f, await lead(f.ws, { owner: VIN, company: co }));
  assert.deepEqual([moved.run.owner, moved.run.effect, moved.run.previous_owner, await count(f.ws, ANA), await next(f.teams.eus!)], [ANA, "new", VIN, 3, 0]);
  const body = policy();
  body.ownership = { order: ["contact", "company"], capBlocksNew: true };
  const g = await fixture({ body });
  const co2 = await company(g.ws, ANA);
  const rev = await go(g, await lead(g.ws, { owner: VIN, company: co2 }));
  assert.deepEqual([rev.run.owner, rev.run.effect, await count(g.ws, ANA)], [VIN, "retained", 2]);
});

test("O04/O05/O12 caps: a company owner at cap is skipped; a contact owner at cap is kept; a lowered cap blocks new owners only", async () => {
  const f = await fixture();
  await setCount(f.ws, ANA, 5);
  const co = await company(f.ws, ANA);
  const a = await go(f, await lead(f.ws, { owner: VIN, company: co }));
  assert.deepEqual([a.run.owner, a.run.effect], [VIN, "retained"]);
  const b = await go(f, await lead(f.ws, { owner: ANA }));
  assert.deepEqual([b.run.owner, b.run.effect, await count(f.ws, ANA)], [ANA, "retained", 5]);
  await setCount(f.ws, ANA, 2);
  await q(`update router_reps set cap_day = 1 where workspace_id = $1 and user_id = $2`, [f.ws, ANA]);
  const c = await go(f, await lead(f.ws));
  assert.deepEqual([c.run.owner, await count(f.ws, ANA)], [VIN, 2], "blocked from new leads; the count stays as it was");
});

test("O06/O09 an owner outside the scope is skipped for the rules; O10 company and opportunity owners stay as they were", async () => {
  const f = await fixture();
  const co = await company(f.ws, LEE);
  const c = await lead(f.ws, { owner: LEE, company: co });
  const a = await go(f, c);
  assert.deepEqual([a.run.owner, a.run.previous_owner], [ANA, LEE]);
  assert.deepEqual(a.run.trace.ownership.candidates.map((x: { reason?: string }) => x.reason), ["out_of_scope", "same_person"], "the company's owner, then the same person as the contact's");
  assert.equal((await q(`select owner_user_id from companies where id = $1`, [co]))[0].owner_user_id, LEE, "the company keeps its owner");
});

test("O11 a cap reached through another team blocks a new allocation anywhere", async () => {
  const f = await fixture();
  await q(`update router_reps set cap_day = 3 where workspace_id = $1 and user_id = $2`, [f.ws, ANA]);
  const a = await go(f, await lead(f.ws), inputs("DE", 800));
  assert.equal(a.run.owner, ANA, "Kai is out: Ana, now 3 of 3");
  const b = await go(f, await lead(f.ws), inputs("US", 800));
  assert.equal(b.run.owner, VIN, "Enterprise US skips Ana: she's full");
});

test("O13 changing time zone mid-day keeps today's count; the new zone starts at the next period", async () => {
  const f = await fixture();
  const before = (await q(`select (routing_quota_current($1, $2)).* `, [f.ws, ANA]))[0];
  await q(`insert into availability (workspace_id, user_id, tz, weekly) values ($1, $2, 'Asia/Ho_Chi_Minh', '{}') on conflict (workspace_id, user_id) do update set tz = excluded.tz`, [f.ws, ANA]);
  const after = (await q(`select (routing_quota_current($1, $2)).* `, [f.ws, ANA]))[0];
  assert.deepEqual([after.period_start, after.tz, after.n], [before.period_start, before.tz, 2]);
  // The next period (simulated by ending this one) starts in the new zone, never before this one ended.
  await q(`update routing_quota set period_end = now() - interval '1 second', period_start = now() - interval '1 day' where workspace_id = $1 and user_id = $2`, [f.ws, ANA]);
  const nxt = (await q(`select (routing_quota_current($1, $2)).* `, [f.ws, ANA]))[0];
  assert.deepEqual([nxt.tz, nxt.n], ["Asia/Ho_Chi_Minh", 0]);
  assert.ok(new Date(nxt.period_start) >= new Date(Date.now() - 2000), "it starts where the last one ended");
});

test("O14 a held run on an owned contact keeps the owner; one review item names the reviewer", async () => {
  const f = await fixture();
  const c = await lead(f.ws, { owner: LEE });
  const a = await go(f, c, inputs("US", null, [{ code: "source_mapping_mismatch", field: "company.employees" }]));
  assert.deepEqual([a.run.kind, a.run.assignment_state, a.run.previous_owner], ["held", "held_for_review", LEE]);
  assert.equal(await ownerOf(c), LEE, "the owner isn't cleared");
  assert.deepEqual(await q(`select reason, reviewer, state from routing_reviews where run_id = $1`, [a.run.id]), [{ reason: "source_mapping_mismatch", reviewer: VIN, state: "open" }]);
  assert.deepEqual([await count(f.ws, ANA), await next(f.teams.eus!)], [2, 0]);
});

test("R11/R12/R13 company facts: the contact's own link is trusted, free mail infers nothing, two possible matches go to review", async () => {
  const f = await fixture();
  const dom = `globex-${randomUUID().slice(0, 6)}.com`;
  const linked = await company(f.ws, VIN, `linked-${dom}`);
  await company(f.ws, ANA, dom);
  await company(f.ws, KAI, `eu.${dom}`);
  const a = await go(f, await lead(f.ws, { company: linked, email: `maya@${dom}` }));
  assert.deepEqual([a.run.owner, a.run.trace.input.company.match], [VIN, "linked"], "R11: the linked company, not the domain's");
  const b = await go(f, await lead(f.ws, { email: `maya.${randomUUID().slice(0, 4)}@gmail.com` }));
  assert.deepEqual([b.run.trace.input.company, b.run.owner], [null, ANA], "R12: no company from a free email");
  const exact = await go(f, await lead(f.ws, { email: `kai@eu.${dom}` }));
  assert.equal(exact.run.trace.input.company.match, "domain", "the email's own domain is one match");
  const c = await go(f, await lead(f.ws, { email: `lee@sales.eu.${dom}` }));
  assert.deepEqual([c.run.kind, c.run.trace.checks.reason, c.run.owner], ["held", "multiple_companies", null], "R13: two parent domains could be it");
  assert.equal((await q(`select reason from routing_reviews where run_id = $1`, [c.run.id]))[0].reason, "multiple_companies");
});
