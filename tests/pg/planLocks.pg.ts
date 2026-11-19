// Plan locks on a real database (supabase/migrations/171_plan_locks.sql, docs/pricing.md Part 4): links, polls, tools
// and destinations are held to their plan with the app's own line, on every path that writes them; a workspace that
// moves down keeps every row it has and can still delete them; two links made at once as the plan changes are judged
// on the plan each one saw. Stripe's Disconnect forgets the account and turns off only the Stripe-paid types, once,
// and never touches a booked meeting.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import pg from "pg";
import { uuid7 } from "./ids.ts";
import { checkForm } from "../../src/lib/forms/schema.ts";
import { TEMPLATES } from "../../src/lib/forms/templates.ts";
import { lockFor, readPlan } from "../../src/lib/planGate.ts";
import { seal } from "../../src/lib/seal.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";

process.env.SECRETS_KEY ||= "test-secrets-key-that-is-long-enough-1234";
const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 8 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
const refused = (p: Promise<unknown>, line: string) => assert.rejects(p, (e: Error) => e.message === line);
after(() => pool.end());

async function workspace(plan?: string) {
  const ws = uuid7();
  const user = uuid7();
  await q(`insert into workspaces (id, name) values ($1, 'Locks')`, [ws]);
  await q(`insert into auth.users (id, email) values ($1, $2)`, [user, `${user}@t.io`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, user]);
  if (plan) await q(`insert into workspace_billing (workspace_id, plan) values ($1, $2)`, [ws, plan]);
  return { ws, user };
}
const setPlan = (ws: string, plan: string) => q(`insert into workspace_billing (workspace_id, plan) values ($1, $2) on conflict (workspace_id) do update set plan = excluded.plan`, [ws, plan]);
/** A single-use link needs a type: one per workspace, made the first time. */
const types = new Map<string, Promise<string>>();
const typeOf = (ws: string, user: string) => {
  if (!types.has(ws)) types.set(ws, q(`insert into meeting_types (workspace_id, slug, name, kind, hosts, settings) values ($1, 'intro', 'Intro', 'one', $2, '{"lengths":[30]}') returning id`, [ws, JSON.stringify([{ user_id: user }])]).then((r) => r[0].id as string));
  return types.get(ws)!;
};
const link = async (ws: string, user: string, kind: string) =>
  q(`insert into meeting_links (workspace_id, kind, type_id, owner_user_id, offered, length_min, token_hash) values ($1, $2, $3, $4, $5, 30, $6) returning id`, [ws, kind, kind === "single_use" ? await typeOf(ws, user) : null, user, JSON.stringify([{ start: "2030-01-01T10:00:00Z", end: "2030-01-01T10:30:00Z" }]), `h${uuid7()}`]).then((r) => r[0].id as string);
const connect = (ws: string, user: string, kind: string) => q(`select source_connect($1, $2, $3, $3, 'acct', $4, '{}') as id`, [ws, user, kind, seal(JSON.stringify({ type: "hook" }))]).then((r) => r[0].id as string);
async function liveForm(ws: string, user: string) {
  const r = checkForm(TEMPLATES.find((t) => t.key === "contact_sales")!.form());
  if ("errors" in r) throw new Error(r.errors.join(" "));
  const id = (await q(`insert into forms (workspace_id, name, draft) values ($1, 'Contact', $2) returning id`, [ws, r.form]))[0].id as string;
  await q(`select form_publish($1, $2, $3)`, [id, user, r.form]);
  return id;
}
const destination = (user: string, form: string, kind: string, source: string | null = null) =>
  q(`select form_destination_save($1, $2, null, $3, $4, $3, '{}', 'upsert', $5) as id`, [user, form, kind, source, kind === "source" ? null : seal(JSON.stringify({ url: "https://hooks.slack.com/services/x" }))]).then((r) => r[0].id as string);

test("plan_allows holds each lock on its plan", async () => {
  const ok = async (plan: string | undefined, f: string) => {
    const { ws } = await workspace(plan);
    return (await q(`select plan_allows($1, $2) ok`, [ws, f]))[0].ok as boolean;
  };
  assert.deepEqual(
    await Promise.all([ok(undefined, "polls"), ok("starter", "polls"), ok("starter", "routing"), ok("pro", "routing"), ok("pro", "salesforce"), ok("business", "salesforce"), ok(undefined, "anything else")]),
    [false, true, false, true, false, true, true],
  );
});

test("Free: no new link or poll, with the app's line; Starter makes all three", async () => {
  const free = await workspace();
  await refused(link(free.ws, free.user, "poll"), "Meeting polls are on Starter and up.");
  await refused(link(free.ws, free.user, "one_off"), "One-off meetings are on Starter and up.");
  await refused(link(free.ws, free.user, "single_use"), "Single-use links are on Starter and up.");
  const starter = await workspace("starter");
  for (const k of ["poll", "one_off", "single_use"]) assert.ok(await link(starter.ws, starter.user, k));
  assert.equal(await lockFor(pgRpc(pool), free.ws, "polls"), "Meeting polls are on Starter and up.", "the app reads the same plan");
  assert.equal(await readPlan(pgRpc(pool), starter.ws), "starter");
});

test("moving down keeps every link, vote and tool; they can still be closed and deleted, and nothing new is made", async () => {
  const { ws, user } = await workspace("starter");
  const poll = await link(ws, user, "poll");
  await q(`insert into poll_votes (link_id, email, name, picks) values ($1, 'ana@acme.com', 'Ana', '["2030-01-01T10:00:00Z"]')`, [poll]);
  const tool = await connect(ws, user, "typeform");
  await setPlan(ws, "free");
  assert.equal(Number((await q(`select count(*) n from meeting_links where workspace_id = $1`, [ws]))[0].n), 1, "the poll stays");
  assert.equal(Number((await q(`select count(*) n from poll_votes where link_id = $1`, [poll]))[0].n), 1, "and its vote");
  assert.equal((await q(`select status from sources where id = $1`, [tool]))[0].status, "active", "the tool stays connected");
  await q(`update meeting_links set closed_at = now() where id = $1`, [poll]);
  await q(`update sources set settings = settings || '{"every_min": 30}' where id = $1`, [tool]);
  await refused(connect(ws, user, "typeform"), "Integrations are on Starter and up.");
  await q(`update sources set status = 'disconnected' where id = $1`, [tool]);
  await refused(q(`update sources set status = 'active' where id = $1`, [tool]), "Integrations are on Starter and up.");
  await q(`delete from meeting_links where id = $1`, [poll]);
  assert.equal(Number((await q(`select count(*) n from meeting_links where workspace_id = $1`, [ws]))[0].n), 0, "a lower plan still deletes");
});

test("tools: the webhook and Google Forms on every plan, the rest on Starter, Salesforce on Business", async () => {
  const free = await workspace();
  assert.ok(await connect(free.ws, free.user, "api"));
  await refused(connect(free.ws, free.user, "hubspot"), "Integrations are on Starter and up.");
  const pro = await workspace("pro");
  assert.ok(await connect(pro.ws, pro.user, "hubspot"));
  await refused(connect(pro.ws, pro.user, "salesforce"), "Salesforce is on Business.");
  const biz = await workspace("business");
  assert.ok(await connect(biz.ws, biz.user, "salesforce"));
});

test("destinations: a webhook on Free, Slack and tools on Starter, Salesforce on Business; a kept one's settings still change", async () => {
  const free = await workspace();
  const f1 = await liveForm(free.ws, free.user);
  assert.ok(await q(`select form_destination_save($1, $2, null, 'webhook', null, 'Hook', '{}', 'upsert', $3)`, [free.user, f1, seal(JSON.stringify({ url: "https://example.com/h", secret: "s" }))]));
  await refused(destination(free.user, f1, "slack"), "Integrations are on Starter and up.");
  const s = await workspace("starter");
  const f2 = await liveForm(s.ws, s.user);
  const slack = await destination(s.user, f2, "slack");
  const hub = await connect(s.ws, s.user, "hubspot");
  const toHub = await destination(s.user, f2, "source", hub);
  await setPlan(s.ws, "business");
  const sf = await connect(s.ws, s.user, "salesforce");
  await setPlan(s.ws, "pro");
  await refused(destination(s.user, f2, "source", sf), "Salesforce is on Business.");
  await setPlan(s.ws, "free");
  await q(`select form_destination_save($1, $2, $3, 'source', $4, 'HubSpot', '{"rules": {}}', 'upsert', null)`, [s.user, f2, toHub, hub]);
  assert.equal(Number((await q(`select count(*) n from form_destinations where form_id = $1`, [f2]))[0].n), 2, "both stay on Free");
  await q(`delete from form_destinations where id = $1`, [slack]);
  assert.equal(Number((await q(`select count(*) n from form_destinations where form_id = $1`, [f2]))[0].n), 1, "and can be removed");
});

test("flaky: links made at once while the plan changes each go by the plan their own write saw", async () => {
  const { ws, user } = await workspace("starter");
  const tries = Array.from({ length: 12 }, (_, i) => (i === 6 ? setPlan(ws, "free").then(() => "plan") : link(ws, user, "single_use").then(() => "made", (e: Error) => e.message)));
  const out = await Promise.all(tries);
  assert.ok(out.every((x) => x === "plan" || x === "made" || x === "Single-use links are on Starter and up."), `only made or the plan's line: ${out.join(", ")}`);
  assert.equal(await link(ws, user, "single_use").catch((e: Error) => e.message), "Single-use links are on Starter and up.", "once Free shows, every new one is held");
  const made = out.filter((x) => x === "made").length;
  assert.equal(Number((await q(`select count(*) n from meeting_links where workspace_id = $1`, [ws]))[0].n), made, "every link that said made is there, none more");
});

test("Disconnect forgets Stripe, turns off only active Stripe-paid types, keeps meetings, and changes nothing the second time", async () => {
  const { ws, user } = await workspace("starter");
  await q(`insert into payment_accounts (workspace_id, stripe_account, ready) values ($1, $2, true)`, [ws, `acct_${uuid7().replace(/-/g, "").slice(0, 16)}`]);
  const type = (slug: string, price: object | null, active = true) =>
    q(`insert into meeting_types (workspace_id, slug, name, kind, hosts, settings, active) values ($1, $2, $2, 'one', $3, $4, $5) returning id`, [ws, slug, JSON.stringify([{ user_id: user }]), JSON.stringify({ lengths: [30], ...(price ? { price } : {}) }), active]).then((r) => r[0].id as string);
  const stripe = await type("paid", { amount: 5000, currency: "usd" });
  const named = await type("paid-stripe", { amount: 2000, currency: "usd", provider: "stripe" });
  const paypal = await type("paid-paypal", { amount: 3000, currency: "usd", provider: "paypal" });
  const free = await type("free-call", null);
  const zero = await type("zero", { amount: 0, currency: "usd" });
  const meeting = (
    await q(
      `insert into meetings (workspace_id, type_id, hosts, guest_email, start_at, end_at, block_start, block_end, status, source, token_hash, payment)
       values ($1, $2, array[$3::uuid], 'ana@acme.com', now() + interval '2 days', now() + interval '2 days 30 minutes', now() + interval '2 days', now() + interval '2 days 30 minutes', 'booked', 'page', $4, '{"status":"paid","account":"acct_x"}') returning id`,
      [ws, stripe, user, `t${uuid7()}`],
    )
  )[0].id as string;
  const first = (await q(`select payment_account_disconnect($1) r`, [ws]))[0].r as { account: string | null; types: string[] };
  assert.match(first.account ?? "", /^acct_/);
  assert.deepEqual([...first.types].sort(), [stripe, named].sort());
  const active = Object.fromEntries((await q(`select id, active from meeting_types where workspace_id = $1`, [ws])).map((r) => [r.id, r.active]));
  assert.deepEqual([active[stripe], active[named], active[paypal], active[free], active[zero]], [false, false, true, true, true]);
  assert.equal((await q(`select settings -> 'price' ->> 'amount' a from meeting_types where id = $1`, [stripe]))[0].a, "5000", "the price is kept for when Stripe comes back");
  assert.equal(Number((await q(`select count(*) n from payment_accounts where workspace_id = $1`, [ws]))[0].n), 0);
  const m = (await q(`select status, payment from meetings where id = $1`, [meeting]))[0];
  assert.deepEqual([m.status, m.payment.status], ["booked", "paid"], "the booked, paid meeting is untouched");
  assert.deepEqual((await q(`select payment_account_disconnect($1) r`, [ws]))[0].r, { account: null, types: [] });
  const both = await Promise.all([q(`select payment_account_disconnect($1) r`, [ws]), q(`select payment_account_disconnect($1) r`, [ws])]);
  assert.ok(both.every((r) => r[0].r.account === null), "two at once: nothing left to forget");
});
