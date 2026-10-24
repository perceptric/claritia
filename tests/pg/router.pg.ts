// The router on a real database (docs/router.md Part 12): 50 leads at once share a queue fairly with no turn taken
// twice, a retried send routes once, a cap race never goes over, a rep who left is skipped, out of office follows the
// rep's own midnight, the account and opportunity owners win, Test writes nothing, spam is held and the allow list
// wins, nobody available ends Unassigned, and today's routing moves over with the same owners.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";
import { fromLeadSettings } from "../../src/lib/router/templates.ts";
import { liveRouter, route, testRoute } from "../../src/lib/router/server.ts";
import { emptyBody, type RouterBody } from "../../src/lib/router/types.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";
import { routeJob, routerAlert } from "../../worker-intel/jobs/router.ts";
import { seal } from "../../src/lib/seal.ts";
import type { Job } from "../../src/lib/jobs.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 20 });
const rpc = pgRpc(pool);
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

async function team(n: number, o: { tz?: string } = {}) {
  const ws = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, 'Acme')`, [ws]);
  const users: string[] = [];
  for (let i = 0; i < n; i++) {
    const u = randomUUID();
    users.push(u);
    await q(`insert into auth.users (id, email) values ($1, $2)`, [u, `rep${i}-${u.slice(0, 4)}@acme.io`]);
    await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, $3)`, [ws, u, i === 0 ? "owner" : "member"]);
    await q(`insert into booking_profiles (workspace_id, user_id, slug, name) values ($1, $2, $3, $4)`, [ws, u, `rep-${i}`, `Rep ${i}`]);
    if (o.tz) await q(`insert into availability (workspace_id, user_id, tz, weekly) values ($1, $2, $3, '{}')`, [ws, u, o.tz]);
  }
  return { ws, users };
}

let n = 0;
async function lead(ws: string, o: { email?: string; country?: string; first?: string; last?: string; company?: string | null; owner?: string | null } = {}) {
  n++;
  const email = o.email ?? `lead${n}-${randomUUID().slice(0, 6)}@client${n}.io`;
  const id = (
    await q(`insert into contacts (workspace_id, email, email_clean, email_class, first_name, last_name, country, company_id, owner_user_id) values ($1, $2, $2, 'work', $3, $4, $5, $6, $7) returning id`, [
      ws,
      email,
      o.first ?? "Dana",
      o.last ?? "Lee",
      o.country ?? "US",
      o.company ?? null,
      o.owner ?? null,
    ])
  )[0].id as string;
  return id;
}

async function publish(ws: string, body: RouterBody) {
  const v = (await q(`select router_publish($1, $2, 'test', null) v`, [ws, body]))[0].v as number;
  return v;
}

function rrBody(users: string[], o: Partial<RouterBody> = {}): RouterBody {
  const b = emptyBody();
  b.account.on = false;
  b.queues = [{ id: "q1", name: "Everyone", method: "rr", strict: false, hoursOnly: false, members: users.map((user) => ({ user, weight: 1 })) }];
  b.rules.list = [{ id: "r1", name: "All", match: "all", conds: [{ field: "lead.source", op: "filled" }], queue: "q1" }];
  b.fallback = { kind: "queue", id: "q1" };
  return { ...b, ...o };
}

test("50 leads at once into a queue of 5: 10 each, no turn taken twice", async () => {
  const { ws, users } = await team(5);
  await publish(ws, rrBody(users));
  const live = await liveRouter(rpc, ws);
  const leads = [];
  for (let i = 0; i < 50; i++) leads.push(await lead(ws));
  const results = await Promise.all(leads.map((c) => route(rpc, { ws, contact: c, key: `form:${c}`, reason: "form", live })));
  assert.ok(results.every((r) => r.status === "ok"));
  const counts = await q(`select owner, count(*)::int n from router_runs where workspace_id = $1 group by owner`, [ws]);
  assert.deepEqual(counts.map((r) => r.n).sort(), [10, 10, 10, 10, 10]);
  // The owner on each contact is the run's.
  const mismatch = await q(`select 1 from router_runs r join contacts c on c.id = r.contact_id where r.workspace_id = $1 and c.owner_user_id is distinct from r.owner`, [ws]);
  assert.equal(mismatch.length, 0);
  // Each run's queue line names its own owner.
  const lines = await q(`select owner, (select e->>'picked' from jsonb_array_elements(steps) e where e->>'step' = 'queue') picked from router_runs where workspace_id = $1`, [ws]);
  assert.ok(lines.every((l) => l.owner === l.picked));
});

test("the same fill sent twice: one run, one turn, the same owner", async () => {
  const { ws, users } = await team(3);
  await publish(ws, rrBody(users));
  const c = await lead(ws);
  const [a, b] = await Promise.all([route(rpc, { ws, contact: c, key: `form:${c}`, reason: "form" }), route(rpc, { ws, contact: c, key: `form:${c}`, reason: "form" })]);
  assert.equal((await q(`select count(*)::int n from router_runs where workspace_id = $1`, [ws]))[0].n, 1);
  assert.deepEqual([a.status, b.status].sort(), ["dup", "ok"]);
  const owner = (r: typeof a) => ("result" in r && r.result.kind === "owner" ? r.result.user : null);
  assert.equal(owner(a), owner(b));
  const again = await route(rpc, { ws, contact: c, key: `form:${c}`, reason: "form" });
  assert.equal(again.status, "dup");
});

test("a cap race: two leads for one last spot; the cap never goes over", async () => {
  const { ws, users } = await team(2);
  await publish(ws, rrBody(users));
  await q(`select router_rep_save($1, $2, '{"cap_day": 1}')`, [ws, users[0]]);
  await q(`select router_rep_save($1, $2, '{"cap_day": 3}')`, [ws, users[1]]);
  const leads = [await lead(ws), await lead(ws), await lead(ws), await lead(ws), await lead(ws)];
  await Promise.all(leads.map((c) => route(rpc, { ws, contact: c, key: `k:${c}`, reason: "api" })));
  const per = Object.fromEntries((await q(`select owner, count(*)::int n from router_runs where workspace_id = $1 and by = 'queue' group by owner`, [ws])).map((r) => [r.owner, r.n]));
  assert.equal(per[users[0]!], 1, "rep 0 is capped at 1");
  assert.equal(per[users[1]!], 3, "rep 1 is capped at 3");
  // The fifth lead: everyone's at their cap, and the fallback is the same queue, where caps hold too.
  assert.equal((await q(`select count(*)::int n from router_runs where workspace_id = $1 and kind = 'unassigned'`, [ws]))[0].n, 1);
});

test("a rep who leaves and a paused rep are skipped, with the reason in the log", async () => {
  const { ws, users } = await team(3);
  await publish(ws, rrBody(users));
  await q(`delete from workspace_members where workspace_id = $1 and user_id = $2`, [ws, users[0]]);
  await q(`select router_rep_save($1, $2, '{"paused_until": "infinity"}')`, [ws, users[1]]);
  const c = await lead(ws);
  const r = await route(rpc, { ws, contact: c, key: `k:${c}`, reason: "api" });
  assert.ok(r.status === "ok" && r.result.kind === "owner" && r.result.user === users[2]);
  const qline = r.status === "ok" ? r.decision!.steps.find((s) => s.step === "queue") : null;
  assert.ok(qline && qline.step === "queue");
  assert.deepEqual(qline.others.map((o) => o.why).sort(), ["not_member", "paused"]);
});

test("out of office by hand follows the rep's own midnight", async () => {
  const { ws, users } = await team(2, { tz: "Asia/Tokyo" });
  await publish(ws, rrBody(users));
  // Out on the date it is now in Tokyo.
  const today = (await q(`select to_char(now() at time zone 'Asia/Tokyo', 'YYYY-MM-DD') d`))[0].d as string;
  await q(`select router_rep_save($1, $2, $3)`, [ws, users[0], { out_dates: [{ from: today, to: today }] }]);
  for (let i = 0; i < 3; i++) {
    const c = await lead(ws);
    const r = await route(rpc, { ws, contact: c, key: `k:${c}`, reason: "api" });
    assert.ok(r.status === "ok" && r.result.kind === "owner" && r.result.user === users[1]);
  }
  // The day before in Tokyo: back in.
  const yesterday = (await q(`select to_char((now() at time zone 'Asia/Tokyo') - interval '1 day', 'YYYY-MM-DD') d`))[0].d as string;
  await q(`select router_rep_save($1, $2, $3)`, [ws, users[0], { out_dates: [{ from: yesterday, to: yesterday }] }]);
  const c = await lead(ws);
  const r = await route(rpc, { ws, contact: c, key: `k:${c}`, reason: "api" });
  assert.ok(r.status === "ok" && r.result.kind === "owner" && r.result.user === users[0], "the ended date no longer counts");
});

test("the account's owner and the open opportunity's owner win; a CRM owner maps through the links", async () => {
  const { ws, users } = await team(3);
  await q(`select crm_seed($1)`, [ws]);
  const src = (await q(`insert into sources (workspace_id, kind, name) values ($1, 'hubspot', 'HubSpot') returning id`, [ws]))[0].id;
  await q(`insert into crm_owner_links (workspace_id, source_id, crm_owner_id, label, user_id) values ($1, $2, 'hs-7', 'Ana', $3)`, [ws, src, users[1]]);
  const co = (await q(`insert into companies (workspace_id, domain, name, owner_crm_id) values ($1, 'acme.com', 'Acme', 'hs-7') returning id`, [ws]))[0].id;
  const b = rrBody([users[2]!]);
  b.account.on = true;
  await publish(ws, b);
  let c = await lead(ws, { email: "dana@eu.acme.com" });
  let r = await route(rpc, { ws, contact: c, key: `k:${c}`, reason: "api" });
  assert.ok(r.status === "ok" && r.result.kind === "owner" && r.result.user === users[1] && r.result.by === "account", "matched by domain, CRM owner mapped");
  // An open opportunity owned by rep 0 wins.
  const obj = (await q(`select id from objects where workspace_id = $1 and key = 'opportunity'`, [ws]))[0].id;
  const field = (await q(`select id from fields where workspace_id = $1 and object = 'opportunity' and key = 'company'`, [ws]))[0].id;
  const opp = (await q(`insert into records (workspace_id, object_id, name, fields) values ($1, $2, 'Acme rollout', $3) returning id`, [ws, obj, { owner: users[0], stage: "proposal" }]))[0].id;
  await q(`insert into record_links (workspace_id, field_id, from_object, from_id, to_object, to_id) values ($1, $2, 'opportunity', $3, 'company', $4)`, [ws, field, opp, co]);
  c = await lead(ws, { email: "lee@acme.com" });
  r = await route(rpc, { ws, contact: c, key: `k:${c}`, reason: "api" });
  assert.ok(r.status === "ok" && r.result.kind === "owner" && r.result.user === users[0]);
  // A won opportunity doesn't count.
  await q(`update records set fields = fields || '{"stage":"won"}' where id = $1`, [opp]);
  c = await lead(ws, { email: "sam@acme.com" });
  r = await route(rpc, { ws, contact: c, key: `k:${c}`, reason: "api" });
  assert.ok(r.status === "ok" && r.result.kind === "owner" && r.result.user === users[1]);
  // The contact's CRM owner is set to the routed rep's for the next push.
  assert.equal((await q(`select owner_crm_id from contacts where id = $1`, [c]))[0].owner_crm_id, "hs-7");
});

test("Test writes nothing", async () => {
  const { ws, users } = await team(2);
  await publish(ws, rrBody(users));
  const c = await lead(ws);
  const tables = ["router_runs", "contact_events", "jobs", "field_history"];
  const count = async () => Promise.all(tables.map(async (t) => (await q(`select count(*)::int n from ${t}`))[0].n as number));
  const before = await count();
  const owner = (await q(`select owner_user_id from contacts where id = $1`, [c]))[0].owner_user_id;
  const r = await testRoute(rpc, { ws, contact: c, body: rrBody(users), changes: { "lead.country": "DE" } });
  assert.ok(r && r.decision.result.kind === "owner");
  assert.equal(r.facts.values["lead.country"], "DE");
  assert.deepEqual(await count(), before);
  assert.equal((await q(`select owner_user_id from contacts where id = $1`, [c]))[0].owner_user_id, owner);
});

test("spam is held, never routed; the allow list wins; spam stays put until let through", async () => {
  const { ws, users } = await team(2);
  await publish(ws, rrBody(users));
  await q(`select router_lists_save($1, null, '{competitor.io}')`, [ws]);
  const fake = await lead(ws, { first: "asdf", last: "asdf" });
  let r = await route(rpc, { ws, contact: fake, key: `k:${fake}`, reason: "form" });
  assert.ok(r.status === "ok" && r.result.kind === "held");
  assert.equal((await q(`select route_status, owner_user_id from contacts where id = $1`, [fake]))[0].route_status, "held");
  const blocked = await lead(ws, { email: "qa@competitor.io" });
  r = await route(rpc, { ws, contact: blocked, key: `k:${blocked}`, reason: "form" });
  assert.ok(r.status === "ok" && r.result.kind === "held");
  await q(`select router_lists_save($1, '{competitor.io}', null)`, [ws]);
  r = await route(rpc, { ws, contact: blocked, key: `k2:${blocked}`, reason: "let_through" });
  assert.ok(r.status === "ok" && r.result.kind === "owner", "the allow list wins over the block list");
  await q(`select router_spam($1, $2)`, [ws, [fake]]);
  assert.equal((await route(rpc, { ws, contact: fake, key: `k3:${fake}`, reason: "again" })).status, "spam");
  // A throwaway domain from the identity list.
  const temp = await lead(ws, { email: "x@mailinator.com" });
  r = await route(rpc, { ws, contact: temp, key: `k:${temp}`, reason: "form" });
  assert.ok(r.status === "ok" && r.result.kind === "held" && r.result.signals.includes("disposable"));
});

test("nobody can take it and the fallback is paused: Unassigned, with one alert job", async () => {
  const { ws, users } = await team(2);
  const b = rrBody([users[0]!]);
  b.fallback = { kind: "user", id: users[1]! };
  await publish(ws, b);
  await q(`select router_rep_save($1, $2, '{"paused_until": "infinity"}')`, [ws, users[0]]);
  await q(`select router_rep_save($1, $2, '{"paused_until": "infinity"}')`, [ws, users[1]]);
  const c = await lead(ws);
  const r = await route(rpc, { ws, contact: c, key: `k:${c}`, reason: "form" });
  assert.ok(r.status === "ok" && r.result.kind === "unassigned");
  assert.equal((await q(`select route_status from contacts where id = $1`, [c]))[0].route_status, "unassigned");
  assert.equal((await q(`select count(*)::int n from jobs where kind = 'router_alert' and workspace_id = $1`, [ws]))[0].n, 1);
  // Assigned by hand: a run like any other.
  await q(`select router_assign($1, $2, $3, $4)`, [ws, c, users[0], users[1]]);
  assert.equal((await q(`select owner_user_id, route_status from contacts where id = $1`, [c]))[0].owner_user_id, users[0]);
  assert.equal((await q(`select by from router_runs where contact_id = $1 order by created_at desc limit 1`, [c]))[0].by, "hand");
});

test("drafts: a second editor's save is refused; publish and roll back make new versions", async () => {
  const { ws, users } = await team(1);
  const r1 = (await q(`select router_draft_save($1, $2, 0, $3) r`, [ws, rrBody(users), users[0]]))[0].r;
  assert.equal(r1, 1);
  await assert.rejects(q(`select router_draft_save($1, $2, 0, $3)`, [ws, rrBody(users), users[0]]), /conflict/);
  const v1 = await publish(ws, rrBody(users));
  const v2 = await publish(ws, emptyBody());
  const old = (await q(`select body from router_versions where workspace_id = $1 and version = $2`, [ws, v1]))[0].body;
  const v3 = await publish(ws, old);
  assert.deepEqual([v1, v2, v3], [1, 2, 3]);
  assert.equal((await liveRouter(rpc, ws))!.version, 3);
  assert.equal((await q(`select draft from routers where workspace_id = $1`, [ws]))[0].draft, null);
});

test("the MQL route hands over to a live router; before that, today's routing runs as before", async () => {
  const { ws, users } = await team(2);
  await q(`insert into lead_settings (workspace_id, enabled, routing) values ($1, true, $2)`, [ws, { respect_owner: true, rules: [{ name: "US", countries: ["US"], owners: [{ user_id: users[0] }] }], default: { owners: [{ user_id: users[1] }] } }]);
  let c = await lead(ws, { country: "US" });
  assert.equal((await q(`select lead_route($1) r`, [c]))[0].r, "US");
  assert.equal((await q(`select owner_user_id from contacts where id = $1`, [c]))[0].owner_user_id, users[0]);
  await publish(ws, fromLeadSettings({ respect_owner: true, rules: [{ name: "US", countries: ["US"], owners: [{ user_id: users[0] }] }], default: { owners: [{ user_id: users[1] }] } }).body);
  c = await lead(ws, { country: "US" });
  assert.equal((await q(`select lead_route($1) r`, [c]))[0].r, "router");
  const job = (await q(`select payload from jobs where kind = 'route' and payload->>'contact' = $1`, [c]))[0];
  assert.ok(job, "a route job is queued");
  assert.equal((await q(`select lifecycle from contacts where id = $1`, [c]))[0].lifecycle, "mql");
});

test("today's routing moved over gives the same owners for 200 sample leads", async () => {
  const { ws, users } = await team(4);
  const old = {
    respect_owner: true,
    rules: [
      { name: "DACH", countries: ["DE", "AT", "CH"], owners: [{ user_id: users[0] }] },
      { name: "Big US", countries: ["US"], sizes: ["1001-5000"], owners: [{ user_id: users[1] }] },
      { name: "Fintech", industries: ["Financial Services"], owners: [{ user_id: users[2] }] },
    ],
    default: { owners: [{ user_id: users[3] }] },
  };
  await q(`insert into lead_settings (workspace_id, enabled, routing) values ($1, true, $2)`, [ws, old]);
  const { body } = fromLeadSettings(old);
  const countries = ["DE", "US", "GB", "AT", "FR", "CH"];
  const sizes = ["1001-5000", "51-200", null];
  const industries = ["Financial Services", "Software", null];
  const leads: string[] = [];
  for (let i = 0; i < 200; i++) {
    const co = (await q(`insert into companies (workspace_id, domain, name, country, size, industry) values ($1, $2, $3, $4, $5, $6) returning id`, [ws, `c${i}-${randomUUID().slice(0, 4)}.io`, `C${i}`, i % 3 ? countries[i % 6] : null, sizes[i % 3], industries[i % 3]]))[0].id;
    leads.push(await lead(ws, { country: countries[(i + 1) % 6], company: co, owner: i % 17 === 0 ? users[2] : null }));
  }
  const want: string[] = [];
  for (const c of leads) {
    await q(`select lead_route($1)`, [c]);
    want.push((await q(`select owner_user_id from contacts where id = $1`, [c]))[0].owner_user_id);
  }
  // Clear the owners the old route set (keeping the 1 in 17 owned before), then route with the new router.
  for (let i = 0; i < leads.length; i++) if (i % 17 !== 0) await q(`update contacts set owner_user_id = null where id = $1`, [leads[i]]);
  await publish(ws, body);
  for (const c of leads) await route(rpc, { ws, contact: c, key: `k:${c}`, reason: "score" });
  const got = [];
  for (const c of leads) got.push((await q(`select owner_user_id from contacts where id = $1`, [c]))[0].owner_user_id);
  assert.deepEqual(got, want);
});

const job = (ws: string, kind: string, key: string, payload: Record<string, unknown>): Job => ({ id: randomUUID(), workspace_id: ws, kind, key, payload, attempts: 1, max_attempts: 5 });
const signal = new AbortController().signal;

test("the route job routes once; the alert goes to Slack, or by email when Slack is down for good", async () => {
  process.env.SECRETS_KEY ||= "router-test-secret-key-0123456789abcdef";
  const { ws, users } = await team(2);
  await publish(ws, rrBody([users[1]!]));
  const c = await lead(ws, { first: "Dana", last: "Lee" });
  const j = job(ws, "route", `form:${c}`, { contact: c, reason: "form", key: `form:${c}` });
  await routeJob(rpc)(j, signal);
  await routeJob(rpc)(j, signal);
  assert.equal((await q(`select count(*)::int n from router_runs where workspace_id = $1`, [ws]))[0].n, 1);
  const run = (await q(`select id from router_runs where workspace_id = $1`, [ws]))[0].id;
  // Slack answers 500 once (try again), then 200.
  await q(`insert into router_secrets (workspace_id, sealed) values ($1, $2)`, [ws, seal(JSON.stringify({ url: "https://hooks.slack.com/services/T/B/x" }))]);
  const posts: { text: string }[] = [];
  let status = 500;
  const fetcher = (async (_u: string, init: RequestInit) => {
    posts.push(JSON.parse(String(init.body)));
    const r = new Response("", { status });
    status = 200;
    return r;
  }) as unknown as typeof fetch;
  const sent: { to: string }[] = [];
  const mailer = { send: async (m: { to: string }) => (sent.push(m), "ses-1") };
  const alert = routerAlert(rpc, { mailer, base: "https://app.test", from: "meetings@tryclaritia.com", fetcher });
  await assert.rejects(alert(job(ws, "router_alert", run, { run }), signal), /Slack answered 500/);
  await alert(job(ws, "router_alert", run, { run }), signal);
  assert.equal(posts.length, 2);
  assert.match(posts[1]!.text, /^New lead for Rep 1: Dana Lee, US from A form$/);
  assert.equal(sent.length, 0);
  // A removed webhook: the rep hears by email instead.
  const gone = (async () => new Response("no_service", { status: 404 })) as unknown as typeof fetch;
  await routerAlert(rpc, { mailer, base: "https://app.test", from: "meetings@tryclaritia.com", fetcher: gone })(job(ws, "router_alert", run, { run }), signal);
  assert.equal(sent.length, 1);
  assert.match(sent[0]!.to, /^rep1-/);
});
