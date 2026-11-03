// Plans on a real database (supabase/migrations/120_plans.sql, docs/pricing.md): Free's 250th fill is the last that
// shows, and two fills racing for it both save with exactly one under the cap; a repeat send, spam and tests never
// count, a released spam fill does; an upgrade shows every hidden answer. Two Tia steps racing for the last credits
// never both get them. Free holds 1 meeting type with 1 host; kinds sit on their plans; calendars per host; the hosts
// Stripe bills for; and what Settings › Billing reads.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import pg from "pg";
import { uuid7 } from "./ids.ts";
import { checkForm } from "../../src/lib/forms/schema.ts";
import { prepareSubmit } from "../../src/lib/forms/submit.ts";
import { TEMPLATES } from "../../src/lib/forms/templates.ts";
import { ctxFor } from "../../worker-intel/jobs/ctx.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 12 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

async function workspace(plan?: string) {
  const ws = uuid7();
  const user = uuid7();
  await q(`insert into workspaces (id, name) values ($1, 'Plans')`, [ws]);
  await q(`insert into auth.users (id, email) values ($1, $2)`, [user, `${user}@t.io`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, user]);
  if (plan) await q(`insert into workspace_billing (workspace_id, plan) values ($1, $2)`, [ws, plan]);
  return { ws, user };
}
const key = () => "k".repeat(16) + uuid7().replace(/-/g, "").slice(0, 20);
const fill = (ws: string, o: { spam?: boolean; test?: boolean } = {}) =>
  q(`insert into submissions (workspace_id, form_version, idem_key, spam, test) values ($1, 1, $2, $3, $4) returning id`, [ws, key(), o.spam ?? false, o.test ?? false]).then((r) => r[0].id as string);
const used = async (ws: string) => (await q(`select submissions, ai_credits from plan_usage where workspace_id = $1 and month = plan_month()`, [ws]))[0] ?? { submissions: 0, ai_credits: 0 };
const hidden = async (ws: string) => Number((await q(`select count(*) n from submissions where workspace_id = $1 and over_cap`, [ws]))[0].n);

test("Free: fill 251 is saved and hidden; two racing for the last slot both save, exactly one counts under the cap", async () => {
  const { ws } = await workspace();
  await q(`insert into plan_usage (workspace_id, month, submissions) values ($1, plan_month(), 248)`, [ws]);
  // 249, then two at once for 250: both save, one shows, one is hidden.
  await fill(ws);
  const [a, b] = await Promise.all([fill(ws), fill(ws)]);
  assert.ok(a && b);
  assert.equal((await used(ws)).submissions, 251);
  assert.equal(await hidden(ws), 1, "exactly one of the two racing fills is past the cap");
  await fill(ws);
  assert.equal(await hidden(ws), 2);
  assert.equal(Number((await q(`select count(*) n from submissions where workspace_id = $1`, [ws]))[0].n), 4, "no fill is ever dropped");
});

test("many fills at once past the cap: every one saves and the count is exact", async () => {
  const { ws } = await workspace();
  await q(`insert into plan_usage (workspace_id, month, submissions) values ($1, plan_month(), 240)`, [ws]);
  await Promise.all(Array.from({ length: 20 }, () => fill(ws)));
  assert.equal((await used(ws)).submissions, 260);
  assert.equal(await hidden(ws), 10, "fills 251 to 260 are hidden, 241 to 250 show");
});

test("spam, tests and a repeated send never count; a spam fill let through does", async () => {
  const { ws, user } = await workspace();
  await fill(ws, { spam: true });
  await fill(ws, { test: true });
  assert.equal((await used(ws)).submissions, 0);
  const s = await fill(ws, { spam: true });
  await q(`update submissions set spam = false where id = $1`, [s]);
  assert.equal((await used(ws)).submissions, 1, "released from spam: counted once");
  await q(`update submissions set spam = false where id = $1`, [s]);
  assert.equal((await used(ws)).submissions, 1, "a second release changes nothing");

  // The same send three times at once, through form_submit: one fill, one count.
  const r = checkForm(TEMPLATES.find((t) => t.key === "contact_sales")!.form());
  if ("errors" in r) throw new Error(r.errors.join(" "));
  const id = (await q(`insert into forms (workspace_id, name, draft) values ($1, 'Contact', $2) returning id`, [ws, r.form]))[0].id as string;
  const v = (await q(`select form_publish($1, $2, $3) as v`, [id, user, r.form]))[0].v as number;
  const fields = r.form.steps.flatMap((x) => x.fields);
  const answers = Object.fromEntries(fields.filter((f) => f.required).map((f) => [f.id, f.type === "email" ? "dana@acme.com" : "Dana"]));
  const prep = prepareSubmit(r.form, v, { v: 1, version: v, key: key(), answers, ms: 5000 }, await ctxFor(pool, ws));
  if (!("args" in prep)) throw new Error(JSON.stringify(prep));
  const a = prep.args;
  await Promise.all([1, 2, 3].map(() => q(`select form_submit($1, $2, $3, $4, $5, $6, $7, $8, $9, false)`, [id, a.p_version, a.p_idem, a.p_values, a.p_hidden, a.p_contact, a.p_consent, a.p_country, a.p_spam])));
  assert.equal((await used(ws)).submissions, 2, "a send repeated by the browser counts once");
});

test("paid plans never hide; an upgrade shows every hidden answer", async () => {
  const paid = await workspace("starter");
  await q(`insert into plan_usage (workspace_id, month, submissions) values ($1, plan_month(), 300)`, [paid.ws]);
  await fill(paid.ws);
  assert.equal(await hidden(paid.ws), 0);

  const { ws } = await workspace();
  await q(`insert into plan_usage (workspace_id, month, submissions) values ($1, plan_month(), 250)`, [ws]);
  await fill(ws);
  await fill(ws);
  assert.equal(await hidden(ws), 2);
  await q(`insert into workspace_billing (workspace_id, plan) values ($1, 'pro')`, [ws]);
  assert.equal(await hidden(ws), 0, "upgraded: every answer shows");
});

test("AI credits: two steps racing for the last ones never both get them", async () => {
  const { ws } = await workspace();
  await q(`insert into plan_usage (workspace_id, month, ai_credits) values ($1, plan_month(), 92)`, [ws]);
  const got = await Promise.all([1, 2, 3, 4].map(() => q(`select ai_credit_take($1, 8) ok`, [ws]).then((r) => r[0].ok as boolean)));
  assert.equal(got.filter(Boolean).length, 1, "only one 8-credit step fits in the last 8");
  assert.equal((await used(ws)).ai_credits, 100);
  assert.equal((await q(`select ai_credit_take($1, 1) ok`, [ws]))[0].ok, false);
  await q(`select ai_credit_give($1, 8)`, [ws]);
  assert.equal((await used(ws)).ai_credits, 92);
  assert.equal((await q(`select ai_credit_take($1, 0) ok`, [ws]))[0].ok, true, "a free step always goes");
  const pro = await workspace("pro");
  await q(`insert into plan_usage (workspace_id, month, ai_credits) values ($1, plan_month(), 1995)`, [pro.ws]);
  assert.equal((await q(`select ai_credit_take($1, 5) ok`, [pro.ws]))[0].ok, true, "Pro has 2,000");
  assert.equal((await q(`select ai_credit_take($1, 1) ok`, [pro.ws]))[0].ok, false);
});

const type = (o: Record<string, unknown>) => JSON.stringify({ kind: "one", active: true, hosts: [], settings: {}, ...o });
const check = async (ws: string, id: string | null, t: string) => (await q(`select plan_check_type($1, $2, $3::jsonb) r`, [ws, id, t]))[0].r as string | null;
async function saveType(ws: string, hosts: string[], o: Record<string, unknown> = {}) {
  return (
    await q(`insert into meeting_types (workspace_id, slug, name, kind, hosts, settings, active) values ($1, $2, 'Call', $3, $4, '{}', $5) returning id`, [
      ws,
      `t-${uuid7().slice(-8)}`,
      o.kind ?? "one",
      JSON.stringify(hosts.map((u) => ({ user_id: u }))),
      o.active ?? true,
    ])
  )[0].id as string;
}

test("Free holds 1 meeting type with 1 host; kinds sit on their plans", async () => {
  const { ws, user } = await workspace();
  const other = uuid7();
  assert.equal(await check(ws, null, type({ hosts: [{ user_id: user }] })), null);
  const t1 = await saveType(ws, [user]);
  assert.match((await check(ws, null, type({ hosts: [{ user_id: user }] })))!, /1 meeting type/);
  assert.equal(await check(ws, t1, type({ hosts: [{ user_id: user }], name: "Renamed" })), null, "changing the one type is fine");
  assert.match((await check(ws, t1, type({ hosts: [{ user_id: user }, { user_id: other }] })))!, /1 seat/);
  assert.equal(await check(ws, null, type({ active: false })), null, "an inactive type doesn't count");
  assert.match((await check(ws, null, type({ kind: "group" })))!, /Starter/);
  assert.match((await check(ws, t1, type({ settings: { price: { amount: 2000, currency: "usd" } } })))!, /Paid meetings/);

  const starter = await workspace("starter");
  assert.equal(await check(starter.ws, null, type({ kind: "group" })), null);
  assert.match((await check(starter.ws, null, type({ kind: "round_robin" })))!, /Pro/);
  await saveType(starter.ws, [starter.user]);
  assert.equal(await check(starter.ws, null, type({ hosts: [{ user_id: starter.user }, { user_id: other }] })), null, "paid plans have any number of types and hosts");
  const pro = await workspace("pro");
  assert.equal(await check(pro.ws, null, type({ kind: "collective" })), null);
  assert.match((await check(pro.ws, null, type({ kind: "owner_first" })))!, /Business/);
  const biz = await workspace("business");
  assert.equal(await check(biz.ws, null, type({ kind: "double" })), null);
});

test("hosts: the people in active meeting types and their owners, counted once", async () => {
  const { ws, user } = await workspace("pro");
  const b = uuid7();
  const c = uuid7();
  await saveType(ws, [user, b]);
  await saveType(ws, [b]);
  await saveType(ws, [c], { active: false });
  assert.equal((await q(`select plan_hosts($1) n`, [ws]))[0].n, 2);
  await q(`update meeting_types set owner_user_id = $2 where workspace_id = $1 and active`, [ws, c]);
  assert.equal((await q(`select plan_hosts($1) n`, [ws]))[0].n, 3, "an owner can be booked too");
});

test("calendars per host: Free 1, a reconnect always fits, Zoom isn't a calendar", async () => {
  const { ws, user } = await workspace();
  const calCheck = async (provider: string, email: string) => (await q(`select plan_check_calendar($1, $2, $3, $4) r`, [ws, user, provider, email]))[0].r as string | null;
  assert.equal(await calCheck("google", "a@acme.com"), null);
  await q(`insert into calendar_accounts (workspace_id, user_id, provider, account_email) values ($1, $2, 'google', 'a@acme.com')`, [ws, user]);
  assert.equal(await calCheck("google", "A@acme.com"), null, "the same account again is a reconnect");
  assert.match((await calCheck("microsoft", "a@acme.com"))!, /1 calendar/);
  assert.equal(await calCheck("zoom", "a@acme.com"), null);
  await q(`insert into workspace_billing (workspace_id, plan) values ($1, 'starter')`, [ws]);
  assert.equal(await calCheck("microsoft", "a@acme.com"), null, "Starter has 3");
});

test("Settings › Billing reads the plan and this month; members only; old Team is Pro", async () => {
  const { ws, user } = await workspace("pro");
  await q(`update workspace_billing set billing_interval = 'year', hosts = 3 where workspace_id = $1`, [ws]);
  await saveType(ws, [user]);
  await fill(ws);
  await q(`select ai_credit_take($1, 3)`, [ws]);
  const s = (await q(`select plan_status($1) s`, [ws]))[0].s;
  assert.deepEqual([s.plan, s.interval, s.hosts, s.hosts_billed, s.submissions, s.submissions_cap, s.ai_credits, s.ai_credits_cap], ["pro", "year", 1, 3, 1, 5000, 3, 2000]);
  const c = await pool.connect();
  try {
    const stranger = uuid7();
    await c.query(`set role authenticated`);
    await c.query(`select set_config('request.jwt.claim.sub', $1, false)`, [stranger]);
    await assert.rejects(c.query(`select plan_status($1)`, [ws]), /Workspace not found/);
    await assert.rejects(c.query(`select ai_credit_take($1, 1)`, [ws]), /permission denied/);
    await assert.rejects(c.query(`update plan_usage set ai_credits = 0`), /permission denied/);
    await c.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user]);
    assert.equal((await c.query(`select plan_status($1) s`, [ws])).rows[0].s.plan, "pro");
  } finally {
    await c.query(`reset role`);
    await c.query(`select set_config('request.jwt.claim.sub', '', false)`);
    c.release();
  }
  await assert.rejects(q(`update workspace_billing set plan = 'team' where workspace_id = $1`, [ws]), /check constraint/);
});
