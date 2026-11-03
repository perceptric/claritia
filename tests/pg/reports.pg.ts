// Reports on a real database (docs/enrich-workflows-reports.md 3.6): a seeded workspace with hand-counted answers on
// every page; a lead with two fills, a merged contact, test and spam fills; a lead at 23:30 in New York; a deal won,
// moved back and won again; form beacons on reload; and each report under 1.5 s on 50,000 contacts and 200,000 visits.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 4 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

/** Runs a member's call: the report functions check membership. */
async function as<T>(user: string, sql: string, p: unknown[] = []): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [user]);
    const r = await c.query(sql, p);
    await c.query("commit");
    return r.rows[0].r as T;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}

async function workspace(tz = "America/New_York") {
  const ws = randomUUID();
  const user = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, 'Acme')`, [ws]);
  await q(`insert into auth.users (id, email) values ($1, $2)`, [user, `${user}@acme.com`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, user]);
  await q(`insert into send_settings (workspace_id, from_name, from_email, address, quiet_start, quiet_end, timezone) values ($1, 'Acme', $2, '1 Main St', 0, 0, $3)`, [ws, `news@m${ws.slice(-8)}.acme.com`, tz]);
  const form = (await q(`insert into forms (workspace_id, name, draft) values ($1, 'Demo', '{}') returning id`, [ws]))[0].id as string;
  return { ws, user, form };
}

async function contact(ws: string, o: { lifecycle?: string; spam?: boolean; source?: string; owner?: string } = {}) {
  const email = `p${randomUUID().slice(0, 8)}@acme.com`;
  return (
    await q(`insert into contacts (workspace_id, email, email_clean, email_class, first_name, lifecycle, route_status, source, owner_user_id) values ($1, $2, $2, 'work', 'Dana', $3, $4, $5, $6) returning id`, [
      ws,
      email,
      o.lifecycle ?? null,
      o.spam ? "spam" : null,
      o.source ?? "form",
      o.owner ?? null,
    ])
  )[0].id as string;
}

async function fill(ws: string, form: string, c: string | null, at: string, o: { test?: boolean; spam?: boolean; hidden?: object } = {}) {
  return (
    await q(`insert into submissions (workspace_id, form_id, form_version, contact_id, idem_key, hidden, test, spam, created_at) values ($1, $2, 1, $3, $4, $5, $6, $7, $8) returning id`, [
      ws,
      form,
      c,
      randomUUID().replace(/-/g, ""),
      JSON.stringify(o.hidden ?? {}),
      !!o.test,
      !!o.spam,
      at,
    ])
  )[0].id as string;
}

async function routed(ws: string, c: string, owner: string, at: string, rule = "r1") {
  return (await q(`insert into router_runs (workspace_id, contact_id, key, reason, kind, owner, rule_id, created_at) values ($1, $2, $3, 'form', 'owner', $4, $5, $6) returning id`, [ws, c, randomUUID(), owner, rule, at]))[0].id as string;
}

async function meeting(ws: string, c: string, host: string, at: string, status = "booked", submission: string | null = null) {
  await q(
    `insert into meetings (workspace_id, hosts, contact_id, submission_id, guest_email, start_at, end_at, block_start, block_end, status, source, token_hash, created_at)
     values ($1, $2, $3, $4, 'g@x.com', $5::timestamptz + interval '2 days', $5::timestamptz + interval '2 days 30 minutes', $5::timestamptz + interval '2 days', $5::timestamptz + interval '2 days 30 minutes', $6, 'form', $7, $5)`,
    [ws, [host], c, submission, at, status, randomUUID()],
  );
}

async function deal(ws: string, c: string, stage: string, amount: number, at: string) {
  const obj = (await q(`select id from objects where workspace_id = $1 and key = 'opportunity'`, [ws]))[0].id;
  const field = (await q(`select id from fields where workspace_id = $1 and object = 'opportunity' and key = 'contacts'`, [ws]))[0].id;
  const id = (await q(`insert into records (workspace_id, object_id, name, fields, created_at) values ($1, $2, 'Deal', $3, $4) returning id`, [ws, obj, JSON.stringify({ stage, amount }), at]))[0].id as string;
  await q(`insert into record_links (workspace_id, field_id, from_object, from_id, to_object, to_id) values ($1, $2, 'opportunity', $3, 'contact', $4)`, [ws, field, id, c]);
  return id;
}

test("the funnel, by hand: two fills count once, a merged contact once, test and spam fills not at all, older leads stay out", async () => {
  const { ws, user, form } = await workspace();
  // A: first fill from Google, routed, a held meeting, a won deal of 1,000.
  const a = await contact(ws);
  await fill(ws, form, a, "2026-10-05T15:00:00Z", { hidden: { first_utm_source: "google", utm_source: "linkedin", utm_campaign: "fall" } });
  await routed(ws, a, user, "2026-10-05T15:00:05Z");
  await meeting(ws, a, user, "2026-10-05T16:00:00Z", "held");
  await deal(ws, a, "won", 1000, "2026-10-06T10:00:00Z");
  // M: a second contact for the same person, merged into A. Its fill doesn't add a lead.
  const m = await contact(ws);
  await fill(ws, form, m, "2026-10-07T15:00:00Z");
  await as(user, `select contacts_merge($1, $2) r`, [a, m]);
  // B: two fills, an MQL, routed and booked; a deal still open.
  const b = await contact(ws, { lifecycle: "mql" });
  await fill(ws, form, b, "2026-10-08T15:00:00Z");
  await fill(ws, form, b, "2026-10-09T15:00:00Z");
  await routed(ws, b, user, "2026-10-08T15:10:00Z");
  await meeting(ws, b, user, "2026-10-08T15:30:00Z");
  await deal(ws, b, "proposal", 500, "2026-10-09T10:00:00Z");
  // Left out: a test fill, a spam fill, a lead held as spam, and a lead whose first fill was in August.
  await fill(ws, form, await contact(ws), "2026-10-10T15:00:00Z", { test: true });
  await fill(ws, form, null, "2026-10-10T15:00:00Z", { spam: true });
  await fill(ws, form, await contact(ws, { spam: true }), "2026-10-10T15:00:00Z");
  const old = await contact(ws);
  await fill(ws, form, old, "2026-08-10T15:00:00Z");
  await fill(ws, form, old, "2026-10-11T15:00:00Z");

  const r = await as<{ now: Record<string, number>; before: Record<string, number>; days: { day: string; n: number }[] }>(user, `select report_funnel($1, '2026-10-01', '2026-10-31') r`, [ws]);
  const n = r.now;
  assert.deepEqual([n.submitted, n.qualified, n.routed, n.booked, n.held, n.opportunity, n.won, Number(n.won_amount)], [2, 1, 2, 2, 1, 2, 1, 1000]);
  assert.equal(r.days.length, 31);
  assert.equal(r.days.reduce((x, d) => x + d.n, 0), 2);
  assert.equal(r.before.submitted, 0);

  // By source: A under Google (its first touch, not its latest), B under direct.
  const by = await as<{ now: { groups: { key: string; submitted: number; won_amount: number }[] } }>(user, `select report_funnel($1, '2026-10-01', '2026-10-31', 'source') r`, [ws]);
  const groups = Object.fromEntries(by.now.groups.map((g) => [g.key, g.submitted]));
  assert.deepEqual(groups, { google: 1, direct: 1 });
  // The contacts behind a number.
  const people = await as<{ id: string }[]>(user, `select report_people($1, '2026-10-01', '2026-10-31', 'funnel', 'won', 'source', 'google') r`, [ws]);
  assert.deepEqual(people.map((p) => p.id), [a]);
  const booked = await as<{ id: string }[]>(user, `select report_people($1, '2026-10-01', '2026-10-31', 'funnel', 'booked') r`, [ws]);
  assert.deepEqual(new Set(booked.map((p) => p.id)), new Set([a, b]));

  // Forms and Reps agree with the funnel.
  const f = await as<{ forms: { id: string; submits: number; booked: number; people: number }[]; rules: { id: string; leads: number; booked: number }[] }>(user, `select report_forms($1, '2026-10-01', '2026-10-31') r`, [ws]);
  assert.equal(f.forms[0]!.submits, 5);
  assert.equal(f.rules[0]!.leads, 2);
  assert.equal(f.rules[0]!.booked, 2);
  const reps = await as<{ reps: { id: string; leads: number; booked: number; held: number }[] }>(user, `select report_reps($1, '2026-10-01', '2026-10-31') r`, [ws]);
  assert.deepEqual([reps.reps[0]!.leads, reps.reps[0]!.booked, reps.reps[0]!.held], [2, 2, 1]);

  // Not a member: nothing.
  await assert.rejects(as(randomUUID(), `select report_funnel($1, '2026-10-01', '2026-10-31') r`, [ws]), /Workspace not found/);
});

test("a lead at 23:30 in New York lands on that day; a deal won, moved back, and won again counts once", async () => {
  const { ws, user, form } = await workspace("America/New_York");
  const c = await contact(ws);
  // 23:30 on 1 Oct in New York is 03:30 on 2 Oct in UTC.
  await fill(ws, form, c, "2026-10-02T03:30:00Z");
  const one = await as<{ now: { submitted: number }; days: { day: string; n: number }[] }>(user, `select report_funnel($1, '2026-10-01', '2026-10-01') r`, [ws]);
  assert.equal(one.now.submitted, 1);
  assert.equal(one.days[0]!.n, 1);
  const two = await as<{ now: { submitted: number } }>(user, `select report_funnel($1, '2026-10-02', '2026-10-02') r`, [ws]);
  assert.equal(two.now.submitted, 0);

  const d = await deal(ws, c, "won", 700, "2026-10-03T10:00:00Z");
  await q(`update records set fields = fields || '{"stage":"proposal"}' where id = $1`, [d]);
  await q(`update records set fields = fields || '{"stage":"won"}' where id = $1`, [d]);
  const r = await as<{ now: { won: number; won_amount: number } }>(user, `select report_funnel($1, '2026-10-01', '2026-10-31') r`, [ws]);
  assert.equal(r.now.won, 1);
  assert.equal(Number(r.now.won_amount), 700);
});

test("speed to lead: medians from the fill to a rep, to first touch and to a meeting, and the share reached on time", async () => {
  const { ws, user, form } = await workspace("UTC");
  const mins = [2, 4, 6, 8, 100];
  for (const [i, m] of mins.entries()) {
    const c = await contact(ws);
    const at = new Date(Date.UTC(2026, 9, 5 + i, 12));
    await fill(ws, form, c, at.toISOString());
    const run = await routed(ws, c, user, new Date(at.getTime() + 60_000).toISOString());
    const acted = new Date(at.getTime() + m * 60_000).toISOString();
    await q(`insert into router_slas (run_id, workspace_id, contact_id, user_id, started_at, due_at, next, status, acted_at) values ($1, $2, $3, $4, $5, $5::timestamptz + interval '15 minutes', 'nudge', $6, $7)`, [
      run,
      ws,
      c,
      user,
      at.toISOString(),
      m <= 15 ? "met" : "missed",
      acted,
    ]);
  }
  const r = await as<{ now: { leads: number; assigned: { median: number }; touched: { median: number; p90: number }; on_time: { met: number; total: number } }; slowest: { seconds: number }[] }>(
    user,
    `select report_speed($1, '2026-10-01', '2026-10-31') r`,
    [ws],
  );
  assert.equal(r.now.leads, 5);
  assert.equal(r.now.assigned.median, 60);
  assert.equal(r.now.touched.median, 6 * 60);
  assert.ok(r.now.touched.p90 > 8 * 60 && r.now.touched.p90 <= 100 * 60);
  assert.deepEqual(r.now.on_time, { met: 4, total: 5 });
  assert.equal(r.slowest[0]!.seconds, 100 * 60);
});

test("form beacons: a reload within 30 minutes adds no view, a start counts once, and the next visit counts again", async () => {
  const { ws, form } = await workspace("UTC");
  const vid = "v_" + randomUUID().slice(0, 12);
  assert.equal((await q(`select form_seen($1, $2, 'view') r`, [form, vid]))[0].r, true);
  assert.equal((await q(`select form_seen($1, $2, 'view') r`, [form, vid]))[0].r, false);
  assert.equal((await q(`select form_seen($1, $2, 'start') r`, [form, vid]))[0].r, true);
  assert.equal((await q(`select form_seen($1, $2, 'start') r`, [form, vid]))[0].r, false);
  assert.equal((await q(`select form_seen($1, 'bad id!', 'view') r`, [form]))[0].r, false);
  await q(`update form_seen set at = now() - interval '31 minutes' where form_id = $1`, [form]);
  assert.equal((await q(`select form_seen($1, $2, 'view') r`, [form, vid]))[0].r, true);
  const d = (await q(`select views, starts from form_daily where form_id = $1 and workspace_id = $2`, [form, ws]))[0];
  assert.deepEqual([d.views, d.starts], [2, 1]);
});

test("first touch: set by the first real fill and never changed; contacts with no fill get it from their first visit", async () => {
  const { ws, form } = await workspace("UTC");
  const c = await contact(ws);
  await fill(ws, form, c, "2026-10-05T12:00:00Z", { test: true, hidden: { utm_source: "test" } });
  assert.equal((await q(`select first_touch from contacts where id = $1`, [c]))[0].first_touch, null);
  await fill(ws, form, c, "2026-10-05T13:00:00Z", { hidden: { utm_source: "bing", utm_medium: "cpc" } });
  await fill(ws, form, c, "2026-10-06T13:00:00Z", { hidden: { utm_source: "google" } });
  const t = (await q(`select first_touch from contacts where id = $1`, [c]))[0].first_touch;
  assert.equal(t.source, "bing");
  assert.equal(t.medium, "cpc");
  assert.equal(t.form_id, form);

  const site = (await q(`insert into sites (workspace_id, domain) values ($1, $2) returning id`, [ws, `ft-${ws.slice(-8)}.com`]))[0].id;
  const person = randomUUID();
  const imported = await contact(ws, { source: "import" });
  await q(`update contacts set person_id = $2, created_at = now() - interval '1 hour' where id = $1`, [imported, person]);
  await q(`insert into sessions (id, workspace_id, site_id, started_at, ended_at, policy, cookieless_key, person_id, source, campaign, ref_class) values ($1, $2, $3, now() - interval '3 days', now(), 'notice', '\\x01', $4, 'newsletter', 'oct', 'email')`, [
    randomUUID(),
    ws,
    site,
    person,
  ]);
  const plain = await contact(ws, { source: "import" });
  await q(`update contacts set created_at = now() - interval '1 hour' where id = $1`, [plain]);
  await q(`select first_touch_fill()`);
  const ft = Object.fromEntries((await q(`select id, first_touch from contacts where id = any($1)`, [[imported, plain]])).map((r) => [r.id, r.first_touch]));
  assert.equal(ft[imported].source, "newsletter");
  assert.equal(ft[imported].campaign, "oct");
  assert.equal(ft[plain].source, "import");
});

test("visits: rolled days come from site_daily, the rest live; bots and internal visits are left out", async () => {
  const { ws, user } = await workspace("UTC");
  const site = (await q(`insert into sites (workspace_id, domain) values ($1, $2) returning id`, [ws, `v-${ws.slice(-8)}.com`]))[0].id;
  const visit = (at: string, o: { bot?: boolean; internal?: boolean; source?: string } = {}) =>
    q(`insert into sessions (id, workspace_id, site_id, started_at, ended_at, policy, cookieless_key, source, is_bot, internal, pageviews) values ($1, $2, $3, $4, $4, 'notice', '\\x02', $5, $6, $7, 1)`, [
      randomUUID(),
      ws,
      site,
      at,
      o.source ?? "google",
      !!o.bot,
      !!o.internal,
    ]);
  await visit("2026-10-05T10:00:00Z");
  await visit("2026-10-05T11:00:00Z", { source: "bing" });
  await visit("2026-10-05T12:00:00Z", { bot: true });
  await visit("2026-10-05T12:00:00Z", { internal: true });
  await visit("2026-10-06T10:00:00Z");
  const live = await as<{ now: { visits: number } }>(user, `select report_funnel($1, '2026-10-05', '2026-10-06') r`, [ws]);
  assert.equal(live.now.visits, 3);
  await q(`select site_daily_roll($1, '2026-10-05')`, [ws]);
  const rolled = await as<{ now: { visits: number; groups: { key: string; visits: number }[] } }>(user, `select report_funnel($1, '2026-10-05', '2026-10-06', 'source') r`, [ws]);
  assert.equal(rolled.now.visits, 3);
  assert.deepEqual(Object.fromEntries(rolled.now.groups.map((g) => [g.key, g.visits])), { google: 2, bing: 1 });
});

test("each report answers in under 1.5 s on 50,000 contacts and 200,000 visits", async () => {
  const { ws, user, form } = await workspace("UTC");
  const site = (await q(`insert into sites (workspace_id, domain) values ($1, $2) returning id`, [ws, `load-${ws.slice(-8)}.com`]))[0].id;
  await q(
    `insert into contacts (id, workspace_id, email, email_clean, email_class, source, owner_user_id, created_at)
     select gen_random_uuid(), $1, 'l' || g || '@load.io', 'l' || g || '@load.io', 'work', 'form', $2, now() - (g % 365) * interval '1 day' from generate_series(1, 50000) g`,
    [ws, user],
  );
  await q(
    `insert into submissions (workspace_id, form_id, form_version, contact_id, idem_key, hidden, created_at)
     select $1, $2, 1, c.id, replace(gen_random_uuid()::text, '-', ''), '{"utm_source":"google"}', c.created_at from contacts c where c.workspace_id = $1`,
    [ws, form],
  );
  await q(
    `insert into router_runs (workspace_id, contact_id, key, reason, kind, owner, rule_id, created_at)
     select $1, c.id, gen_random_uuid()::text, 'form', 'owner', $2, 'r' || (random() * 5)::int, c.created_at + interval '1 minute' from contacts c where c.workspace_id = $1 and random() < 0.6`,
    [ws, user],
  );
  await q(
    `insert into sessions (id, workspace_id, site_id, started_at, ended_at, policy, cookieless_key, source, pageviews)
     select gen_random_uuid(), $1, $2, now() - (g % 365) * interval '1 day' - (g % 1440) * interval '1 minute', now(), 'notice', '\\x03', case when g % 3 = 0 then 'google' else 'direct' end, 2
     from generate_series(1, 200000) g`,
    [ws, site],
  );
  await q(`analyze contacts; analyze submissions; analyze sessions; analyze router_runs`);
  const to = (await q(`select current_date - 1 as d`))[0].d.toISOString().slice(0, 10);
  const from = (await q(`select current_date - 30 as d`))[0].d.toISOString().slice(0, 10);
  for (const [name, sql] of [
    ["funnel", `select report_funnel($1, $2, $3) r`],
    ["funnel by source", `select report_funnel($1, $2, $3, 'source') r`],
    ["speed", `select report_speed($1, $2, $3) r`],
    ["reps", `select report_reps($1, $2, $3) r`],
    ["forms", `select report_forms($1, $2, $3) r`],
    ["email", `select report_email($1, $2, $3) r`],
  ] as const) {
    const t = Date.now();
    await as(user, sql, [ws, from, to]);
    const ms = Date.now() - t;
    assert.ok(ms < 1500, `${name} took ${ms} ms`);
  }
});
