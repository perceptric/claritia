// Database speed (086_db_speed.sql) on a real database. The rewritten readers return exactly what their previous
// definitions return on the same rows (each previous definition is read from the migration that last defined it and
// run side by side); broadcasts fire once, also when the scan runs twice; nurtures enroll past 5,000; journey event
// triggers still start one run per event, also for an event that commits late; lead scores still follow activity,
// skip workspaces with a live model, and a score-only change no longer marks the contact changed for CRM push.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { after, test } from "node:test";
import pg from "pg";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 6 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

const DIR = new URL("../../supabase/migrations/", import.meta.url);

/** The definition of public.<name> as the last migration before 086 left it, renamed to pg_temp.old_<name>. */
function previous(name: string): string {
  const files = readdirSync(DIR).filter((f) => /^\d{3}_.*\.sql$/.test(f) && f < "086").sort();
  const head = `create or replace function public.${name}(`;
  for (const f of files.reverse()) {
    const src = readFileSync(new URL(f, DIR), "utf8");
    const at = src.toLowerCase().lastIndexOf(head);
    if (at < 0) continue;
    const open = src.indexOf("$$", at);
    const close = src.indexOf("$$;", open + 2);
    return src.slice(at, close + 3).replace(`public.${name}(`, `pg_temp.old_${name}(`);
  }
  throw new Error(`no definition of ${name}`);
}

/** A connection signed in as `user`, with the previous definitions of `names` loaded. */
async function session(user: string, names: string[]) {
  const c = await pool.connect();
  await c.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user]);
  for (const n of names) await c.query(previous(n));
  return {
    one: async (sql: string, p: unknown[] = []) => (await c.query(sql, p)).rows[0]?.r,
    done: () => c.release(),
  };
}

async function workspace(tz = "UTC") {
  const ws = randomUUID();
  const user = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, 'Acme')`, [ws]);
  await q(`insert into auth.users (id, email) values ($1, $2)`, [user, `${user}@acme.com`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, user]);
  await q(`insert into send_settings (workspace_id, timezone) values ($1, $2)`, [ws, tz]);
  return { ws, user };
}

async function member(ws: string) {
  const u = randomUUID();
  await q(`insert into auth.users (id, email) values ($1, $2)`, [u, `${u}@acme.com`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')`, [ws, u]);
  return u;
}

async function contacts(ws: string, n: number) {
  return (
    await q(
      `insert into contacts (workspace_id, email, email_clean, email_class, first_name, last_name, source)
       select $1, 'p' || g || '_' || left($2, 6) || '@acme.com', 'p' || g || '_' || left($2, 6) || '@acme.com', 'work', 'Dana' || g, case when g % 3 = 0 then null else 'Lee' end, case when g % 4 = 0 then 'api' else 'form' end
       from generate_series(1, $3) g returning id`,
      [ws, randomUUID(), n],
    )
  ).map((r) => r.id as string);
}

const sortJson = (x: unknown) => JSON.stringify(x, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v));

test("forms_list returns what it did, across local midnights, spam, tests and failed deliveries", async () => {
  const { ws, user } = await workspace("America/Los_Angeles");
  const people = await contacts(ws, 30);
  const forms: string[] = [];
  for (let i = 0; i < 3; i++) {
    const f = (await q(`insert into forms (workspace_id, name, status, version) values ($1, $2, 'live', 1) returning id`, [ws, `Form ${i}`]))[0].id as string;
    await q(`insert into form_versions (form_id, workspace_id, version, body) values ($1, $2, 1, '{}')`, [f, ws]);
    forms.push(f);
  }
  await q(`update forms set draft = '{"changed":true}' where id = $1`, [forms[2]]);
  // Fills every 5 hours for 12 days, so some land either side of each local midnight.
  await q(
    `insert into submissions (workspace_id, form_id, form_version, contact_id, idem_key, hidden, spam, test, created_at)
     select $1, ($2::uuid[])[1 + g % 2], 1, ($3::uuid[])[1 + g % 30], 'k' || replace(gen_random_uuid()::text, '-', ''),
            case when g % 4 = 0 then jsonb_build_object('page', 'https://acme.com/p' || (g % 3)) when g % 9 = 0 then jsonb_build_object('page', 'https://app.claritia.com/f/' || gen_random_uuid()) else '{}' end,
            g % 7 = 0, g % 11 = 0, now() - g * interval '5 hours'
     from generate_series(0, 60) g`,
    [ws, forms, people],
  );
  const d = (await q(`insert into form_destinations (workspace_id, form_id, kind, name) values ($1, $2, 'webhook', 'Hook') returning id`, [ws, forms[0]]))[0].id;
  await q(`insert into deliveries (workspace_id, submission_id, destination_id, status) select workspace_id, id, $2, case when random() < 0.5 then 'failed' else 'done' end from submissions where form_id = $1`, [forms[0], d]);
  await q(`insert into form_checks (workspace_id, form_id, status) values ($1, $2, 'passed')`, [ws, forms[1]]).catch(() => undefined);
  await q(`insert into form_daily (form_id, workspace_id, day, views, starts) values ($1, $2, current_date - 1, 40, 9), ($1, $2, current_date - 40, 7, 1)`, [forms[0], ws]);
  const s = await session(user, ["forms_list"]);
  try {
    const now = await s.one(`select forms_list($1) r`, [ws]);
    const was = await s.one(`select pg_temp.old_forms_list($1) r`, [ws]);
    assert.equal(now.length, 3);
    assert.ok(now.some((f: { week: number }) => f.week > 0), "the sample has fills this week");
    assert.equal(sortJson(now), sortJson(was));
  } finally {
    s.done();
  }
});

test("router_pick picks the same rep with the same counts, with undone runs, other queues and odd candidates", async () => {
  const { ws, user } = await workspace();
  const reps = [user, await member(ws), await member(ws), await member(ws)];
  const outsider = randomUUID();
  await q(`insert into router_reps (workspace_id, user_id, cap_day) values ($1, $2, 1)`, [ws, reps[3]]);
  await q(
    `insert into router_runs (workspace_id, key, reason, kind, owner, by, queue_id, created_at, undone_at)
     select $1, 'k' || g, 'form', case when g % 13 = 0 then 'unassigned' else 'owner' end, case when g % 13 = 0 then null else ($2::uuid[])[1 + g % 3] end, 'queue',
            case when g % 5 = 0 then 'other' else 'q1' end, now() - (g % 40) * interval '1 day' - g * interval '1 minute', case when g % 17 = 0 then now() end
     from generate_series(1, 300) g`,
    [ws, reps.slice(0, 3)],
  );
  await q(`insert into router_runs (workspace_id, key, reason, kind, owner, by, queue_id) values ($1, 'today', 'form', 'owner', $2, 'queue', 'q1')`, [ws, reps[3]]);
  const s = await session(user, ["router_pick"]);
  try {
    const picks = [
      { queue: "q1", method: "rr", candidates: reps.map((u) => ({ user: u })) },
      { queue: "q1", method: "weighted", candidates: reps.map((u, i) => ({ user: u.toUpperCase(), weight: i + 1 })) },
      { queue: "q1", method: "load", candidates: [{ user: reps[1] }, { user: reps[1] }, { user: outsider }] },
      { queue: "none", candidates: [{ user: reps[2] }, { user: reps[0] }] },
      { queue: "other", method: "rr", candidates: [{ user: outsider }] },
    ];
    for (const p of picks) {
      const now = await s.one(`select router_pick($1, $2) r`, [ws, p]);
      const was = await s.one(`select pg_temp.old_router_pick($1, $2) r`, [ws, p]);
      assert.deepEqual(now, was, JSON.stringify(p));
    }
  } finally {
    s.done();
  }
});

test("meeting_inputs and calendar_reconnect_info see the same meetings: several hosts, holds, cancels and old payments", async () => {
  const { ws, user } = await workspace();
  const other = await member(ws);
  await q(`insert into router_reps (workspace_id, user_id, out_dates, paused_until) values ($1, $2, '["2030-01-01"]', now() + interval '1 day')`, [ws, other]);
  await q(
    `insert into meetings (workspace_id, hosts, guest_email, start_at, end_at, block_start, block_end, status, source, token_hash, created_at)
     select $1, case g % 3 when 0 then array[$2::uuid] when 1 then array[$3::uuid] else array[$3::uuid, $2::uuid] end, 'g' || g || '@x.com',
            now() + (g - 20) * interval '7 hours', now() + (g - 20) * interval '7 hours' + interval '30 minutes',
            now() + (g - 20) * interval '7 hours' - interval '10 minutes', now() + (g - 20) * interval '7 hours' + interval '40 minutes',
            (array['booked', 'booked', 'canceled', 'pending_payment', 'held'])[1 + g % 5], 'page', 't' || gen_random_uuid(),
            case when g % 2 = 0 then now() - interval '2 minutes' else now() - interval '1 hour' end
     from generate_series(0, 80) g`,
    [ws, user, other],
  );
  const acct = (await q(`insert into calendar_accounts (workspace_id, user_id, provider, account_email) values ($1, $2, 'google', 'x@acme.com') returning id`, [ws, other]))[0].id;
  const s = await session(user, ["meeting_inputs", "calendar_reconnect_info"]);
  try {
    for (const [from, to] of [["now()", "now() + interval '7 days'"], ["now() - interval '3 days'", "now() + interval '1 day'"]]) {
      const args = [ws, [user, other, user, randomUUID()]];
      const now = await s.one(`select meeting_inputs($1, $2, ${from}, ${to}) r`, args);
      const was = await s.one(`select pg_temp.old_meeting_inputs($1, $2, ${from}, ${to}) r`, args);
      // Rows within each person's list come in index order; compare as sets.
      const norm = (x: { booked: unknown[] }[]) => x.map((p) => ({ ...p, booked: [...p.booked].map((b) => JSON.stringify(b)).sort() }));
      assert.deepEqual(norm(now), norm(was));
      assert.ok(now[1].booked.length > 0);
    }
    const now = await s.one(`select calendar_reconnect_info($1) r`, [acct]);
    const was = await s.one(`select pg_temp.old_calendar_reconnect_info($1) r`, [acct]);
    assert.deepEqual(now, was);
    assert.ok(now.upcoming > 0);
  } finally {
    s.done();
  }
});

test("report_leads finds the same first touches, through merges, spam, tests and API contacts", async () => {
  const { ws, user } = await workspace();
  const ids = await contacts(ws, 40);
  // Merges two levels deep: 1 → 2 → 3, and 4 → 5.
  await q(`update contacts set merged_into = $2, deleted_at = now() where id = $1`, [ids[1], ids[2]]);
  await q(`update contacts set merged_into = $2, deleted_at = now() where id = $1`, [ids[2], ids[3]]);
  await q(`update contacts set merged_into = $2, deleted_at = now() where id = $1`, [ids[4], ids[5]]);
  await q(`update contacts set route_status = 'spam' where id = $1`, [ids[6]]);
  await q(`update contacts set created_at = now() - (random() * 60) * interval '1 day' where workspace_id = $1`, [ws]);
  const f = (await q(`insert into forms (workspace_id, name) values ($1, 'F') returning id`, [ws]))[0].id;
  await q(
    `insert into submissions (workspace_id, form_id, form_version, contact_id, idem_key, spam, test, created_at)
     select $1, $2, 1, ($3::uuid[])[1 + g % 40], 'k' || replace(gen_random_uuid()::text, '-', ''), g % 9 = 0, g % 10 = 0, now() - (g % 61) * interval '1 day' - g * interval '7 minutes'
     from generate_series(0, 150) g`,
    [ws, f, ids],
  );
  const s = await session(user, ["report_leads", "report_facts"]);
  let found = 0;
  try {
    for (const [a, b] of [["now() - interval '30 days'", "now()"], ["now() - interval '7 days'", "now() - interval '1 day'"], ["now() - interval '90 days'", "now()"]]) {
      const now = await s.one(`select coalesce(jsonb_agg(x order by x.contact_id), '[]') r from report_leads($1, ${a}, ${b}) x`, [ws]);
      const was = await s.one(`select coalesce(jsonb_agg(x order by x.contact_id), '[]') r from pg_temp.old_report_leads($1, ${a}, ${b}) x`, [ws]);
      assert.deepEqual(now.map((x: { contact_id: string; lead_at: string }) => [x.contact_id, x.lead_at]), was.map((x: { contact_id: string; lead_at: string }) => [x.contact_id, x.lead_at]));
      found += now.length;
      const facts = await s.one(`select coalesce(jsonb_agg(x order by x.contact_id), '[]') r from report_facts($1, ${a}, ${b}) x`, [ws]);
      const factsWas = await s.one(`select coalesce(jsonb_agg(x order by x.contact_id), '[]') r from pg_temp.old_report_facts($1, ${a}, ${b}) x`, [ws]);
      assert.deepEqual(facts.map((x: { contact_id: string; won: boolean }) => [x.contact_id, x.won]), factsWas.map((x: { contact_id: string; won: boolean }) => [x.contact_id, x.won]));
    }
    assert.ok(found > 0);
  } finally {
    s.done();
  }
});

test("visitors_live still shows every page of a visit, also when its events sit in the day tables either side", async () => {
  const { ws, user } = await workspace();
  const site = (await q(`insert into sites (workspace_id, domain) values ($1, $2) returning id`, [ws, `${randomUUID().slice(0, 8)}.com`]))[0].id;
  // Visits from the last hour; each event's day is its id's UTC day, which can be the day before or after its time.
  await q(
    `do $$ declare d date; n text; begin
       for d in select generate_series(current_date - 2, current_date + 2, interval '1 day')::date loop
         n := 'events_' || to_char(d, 'YYYYMMDD');
         if to_regclass('public.' || n) is null then
           execute format('create table public.%I partition of public.events for values from (%L) to (%L)', n, d, d + 1);
         end if;
       end loop;
     end $$`,
  ).catch(() => undefined);
  for (let i = 0; i < 4; i++) {
    const id = randomUUID();
    await q(
      `insert into sessions (id, workspace_id, site_id, cookieless_key, started_at, ended_at, policy, pageviews) values ($1, $2, $3, '\\x01', now() - $4::int * interval '10 minutes', now() - $4::int * interval '10 minutes' + interval '5 minutes', 'notice', 3)`,
      [id, ws, site, i + 1],
    );
    for (const [k, off] of [[0, -1], [1, 0], [2, 1], [3, 0]] as const) {
      await q(
        `insert into events (id, workspace_id, session_id, day, kind, path, server_at)
         select gen_random_uuid(), $1, s.id, ((s.started_at + $4::int * interval '1 minute') at time zone 'UTC')::date + $3::int, 'view', $5, s.started_at + $4::int * interval '1 minute'
         from sessions s where s.id = $2`,
        [ws, id, off, k, `/p${k}`],
      );
    }
  }
  const s = await session(user, ["visitors_live"]);
  try {
    const now = await s.one(`select visitors_live($1, 24, 100) r`, [ws]);
    const was = await s.one(`select pg_temp.old_visitors_live($1, 24, 100) r`, [ws]);
    assert.deepEqual(now, was);
    assert.equal(now.length, 4);
    assert.ok(now.every((v: { pages: string[] }) => v.pages.length === 4));
  } finally {
    s.done();
  }
});

test("records_search and report_people return what they did, for long, short and odd terms and groups", async () => {
  const { ws, user } = await workspace();
  const ids = await contacts(ws, 25);
  await q(`update contacts set first_name = 'Ann_Marie', last_name = null where id = $1`, [ids[0]]);
  await q(`update contacts set first_name = null, last_name = '100% Lee' where id = $1`, [ids[1]]);
  await q(`insert into companies (workspace_id, name, domain) values ($1, 'Dana Corp', 'danacorp.com'), ($1, 'Other', null)`, [ws]);
  const f = (await q(`insert into forms (workspace_id, name) values ($1, 'F') returning id`, [ws]))[0].id;
  await q(`insert into submissions (workspace_id, form_id, form_version, contact_id, idem_key) select $1, $2, 1, c, 'k' || replace(gen_random_uuid()::text, '-', '') from unnest($3::uuid[]) c`, [ws, f, ids]);
  await q(
    `insert into meetings (workspace_id, hosts, contact_id, guest_email, start_at, end_at, block_start, block_end, status, source, token_hash)
     select $1, array[$2::uuid], c, 'g@x.com', now(), now() + interval '30 minutes', now(), now() + interval '30 minutes', 'booked', 'page', 't' || gen_random_uuid() from unnest($3::uuid[]) c`,
    [ws, user, ids.slice(0, 5)],
  );
  const s = await session(user, ["records_search", "report_people"]);
  try {
    for (const term of ["dana1", "Da", "lee", "ann_m", "100%", "acme.com", "zzzz", "", "corp"]) {
      for (const obj of ["contact", "company"]) {
        const now = await s.one(`select records_search($1, $2, $3, 50) r`, [ws, obj, term]);
        const was = await s.one(`select pg_temp.old_records_search($1, $2, $3, 50) r`, [ws, obj, term]);
        assert.deepEqual(new Set(now.map((x: { id: string }) => x.id)), new Set(was.map((x: { id: string }) => x.id)), `${obj} ${term}`);
      }
    }
    for (const [page, metric, group] of [["reps", "booked", user], ["reps", "booked", user.toUpperCase()], ["reps", "leads", "nope"], ["forms", "submits", f], ["forms", "submits", "x"], ["email", "sent", randomUUID()]]) {
      const now = await s.one(`select report_people($1, current_date - 3, current_date + 1, $2, $3, null, $4) r`, [ws, page, metric, group]);
      const was = await s.one(`select pg_temp.old_report_people($1, current_date - 3, current_date + 1, $2, $3, null, $4) r`, [ws, page, metric, group]);
      assert.deepEqual(now, was, `${page} ${metric} ${group}`);
    }
  } finally {
    s.done();
  }
});

test("enrich_backfill_page walks the same pages", async () => {
  const { ws, user } = await workspace();
  const ids = await contacts(ws, 30);
  await q(`update contacts set title = 'CEO' where id = any($1)`, [ids.filter((_, i) => i % 3 === 0)]);
  await q(`update contacts set email_class = 'free' where id = any($1)`, [ids.filter((_, i) => i % 5 === 0)]);
  const s = await session(user, ["enrich_backfill_page"]);
  try {
    for (const filter of [{}, { missing: "title" }, { missing: "seniority" }]) {
      const walk = async (fn: string) => {
        const pages: unknown[] = [];
        let after: string | null = null;
        for (let i = 0; i < 10; i++) {
          // Inside a rolled-back savepoint: a page also queues jobs.
          await s.one("savepoint p");
          const r: { count: number; last: string | null } = await s.one(`select ${fn}($1, $2, $3, 7) r`, [ws, filter, after]);
          await s.one("rollback to savepoint p");
          pages.push(r);
          if (!r.count) break;
          after = r.last;
        }
        return pages;
      };
      await s.one("begin");
      try {
        assert.deepEqual(await walk("enrich_backfill_page"), await walk("pg_temp.old_enrich_backfill_page"), JSON.stringify(filter));
      } finally {
        await s.one("rollback");
      }
    }
  } finally {
    s.done();
  }
});

async function liveWorkflow(ws: string, trigger: object) {
  const id = (await q(`insert into workflows (workspace_id, name, status, live_version, trigger_kind, live_at) values ($1, 'Flow', 'live', 1, $2, now() - interval '1 hour') returning id`, [ws, (trigger as { kind: string }).kind]))[0].id as string;
  await q(`insert into workflow_versions (workflow_id, workspace_id, version, body) values ($1, $2, 1, $3)`, [id, ws, { trigger, steps: [], entry: { mode: "once" } }]);
  return id;
}
const runs = async (wf: string) => (await q(`select count(*)::int n from workflow_runs where workflow_id = $1`, [wf]))[0].n as number;

test("a broadcast fires once: a second scan, a scan that overlaps, or a later member starts nothing more", async () => {
  const { ws } = await workspace();
  const ids = await contacts(ws, 12);
  const seg = (await q(`insert into segments (workspace_id, name, kind) values ($1, 'All', 'static') returning id`, [ws]))[0].id;
  await q(`insert into segment_members (workspace_id, segment_id, contact_id) select $1, $2, c from unnest($3::uuid[]) c`, [ws, seg, ids.slice(0, 10)]);
  const wf = await liveWorkflow(ws, { kind: "broadcast", segment: seg, at: new Date(Date.now() - 60_000).toISOString() });
  // Two scans at once (cron overlap): one run per contact.
  await Promise.all([q(`select workflow_scan()`), q(`select workflow_scan()`)]);
  assert.equal(await runs(wf), 10);
  await q(`insert into segment_members (workspace_id, segment_id, contact_id) select $1, $2, c from unnest($3::uuid[]) c`, [ws, seg, ids.slice(10)]);
  await q(`select workflow_scan()`);
  await q(`select workflow_scan()`);
  assert.equal(await runs(wf), 10, "fired once, to the segment as it was then");
  // A broadcast set for later waits for its time.
  const later = await liveWorkflow(ws, { kind: "broadcast", segment: seg, at: new Date(Date.now() + 3_600_000).toISOString() });
  await q(`select workflow_scan()`);
  assert.equal(await runs(later), 0);
});

test("a date trigger runs once a day", async () => {
  const { ws } = await workspace();
  const ids = await contacts(ws, 4);
  await q(`update contacts set fields = jsonb_build_object('renewal', to_char(current_date, 'YYYY-MM-DD')) where id = any($1)`, [ids.slice(0, 3)]);
  const wf = await liveWorkflow(ws, { kind: "date", field: "f.renewal", time: "00:00", days: 0 });
  await q(`select workflow_scan()`);
  assert.equal(await runs(wf), 3);
  await q(`update contacts set fields = jsonb_build_object('renewal', to_char(current_date, 'YYYY-MM-DD')) where id = $1`, [ids[3]]);
  await q(`select workflow_scan()`);
  assert.equal(await runs(wf), 3, "not again today");
  assert.equal((await q(`select date_ran_on = current_date ok from workflow_marks where workflow_id = $1`, [wf]))[0].ok, true);
});

test("event triggers still start one run per event: kinds by index, an event that commits late, a second scan", async () => {
  const { ws } = await workspace();
  const [a, b, c] = await contacts(ws, 3);
  const form = randomUUID();
  const onForm = await liveWorkflow(ws, { kind: "form", forms: [form] });
  const onRouted = await liveWorkflow(ws, { kind: "routed", result: "any" });
  const onMeeting = await liveWorkflow(ws, { kind: "meeting", events: ["booked"], types: [] });
  await q(`select workflow_scan()`);
  const ev = (contact: string, kind: string, data: object, ago = "0 minutes") =>
    q(`insert into contact_events (workspace_id, contact_id, kind, data, source, at) values ($1, $2, $3, $4, 'test', now() - $5::interval)`, [ws, contact, kind, data, ago]);
  // Stamped 5 minutes ago but committed after the last scan: a slow transaction.
  await ev(a, "form.submitted", { form_id: form }, "5 minutes");
  await ev(b, "form.submitted", { form_id: randomUUID() });
  await ev(b, "lead.unassigned", {});
  await ev(c, "lead.routed", {});
  await ev(c, "meeting.booked", {});
  await ev(a, "meeting.canceled", {});
  await q(`select workflow_scan()`);
  await q(`select workflow_scan()`);
  assert.equal(await runs(onForm), 1);
  assert.equal(await runs(onRouted), 2);
  assert.equal(await runs(onMeeting), 1);
});

test("a nurture enrolls everyone in a segment past 5,000, a run at a time", async () => {
  const { ws } = await workspace();
  const ids = await contacts(ws, 5200);
  const seg = (await q(`insert into segments (workspace_id, name, kind) values ($1, 'Big', 'static') returning id`, [ws]))[0].id;
  await q(`insert into segment_members (workspace_id, segment_id, contact_id) select $1, $2, c from unnest($3::uuid[]) c`, [ws, seg, ids]);
  const email = (await q(`insert into emails (workspace_id, name, kind, subject, html, text) values ($1, 'E', 'journey', 'Hi', '<p>x</p>', 'x') returning id`, [ws]))[0].id;
  const n = (await q(`insert into nurtures (workspace_id, name, status, trigger, live_at) values ($1, 'N', 'live', $2, now()) returning id`, [ws, { kind: "segment", segment_id: seg }]))[0].id;
  await q(`insert into nurture_steps (workspace_id, nurture_id, position, wait_days, email_id) values ($1, $2, 0, 1, $3)`, [ws, n, email]);
  const enrolled = async () => (await q(`select count(*)::int n from nurture_enrollments where nurture_id = $1`, [n]))[0].n as number;
  await q(`select nurture_enroll($1)`, [n]);
  assert.equal(await enrolled(), 5000);
  await q(`select nurture_enroll($1)`, [n]);
  assert.equal(await enrolled(), 5200, "the rest join on the next run");
  assert.equal((await q(`select nurture_enroll($1) n`, [n]))[0].n, 0);
});

test("lead scores follow activity, skip workspaces with a live model, and a score alone doesn't mark the contact for CRM push", async () => {
  const { ws } = await workspace();
  const [c1, c2] = await contacts(ws, 2);
  await q(`insert into lead_settings (workspace_id, enabled) values ($1, true)`, [ws]);
  await q(`select lead_scores_refresh($1, 100)`, [ws]);
  const row = async (id: string) => (await q(`select score, score_band, engagement_score, scored_at, updated_at from contacts where id = $1`, [id]))[0];
  const first = await row(c1);
  assert.ok(first.scored_at, "new contacts are scored");
  // Nothing happened: running again writes nothing.
  await q(`select lead_scores_refresh($1, 100)`, [ws]);
  assert.deepEqual(await row(c1), first);
  // Activity: a form fill and a meeting raise engagement on the next run.
  await q(`insert into contact_events (workspace_id, contact_id, kind, data, source) values ($1, $2, 'form.submitted', '{}', 'test'), ($1, $2, 'meeting.booked', '{}', 'test')`, [ws, c1]);
  await q(`select lead_scores_refresh($1, 100)`, [ws]);
  const later = await row(c1);
  assert.ok(later.engagement_score > first.engagement_score, `${first.engagement_score} → ${later.engagement_score}`);
  assert.ok(later.scored_at > first.scored_at);
  // A score change that keeps the band leaves updated_at alone; a band change still marks it.
  const before = await row(c2);
  await q(`update contacts set score = coalesce(score, 0) + 1 where id = $1`, [c2]);
  assert.equal((await row(c2)).updated_at.getTime(), before.updated_at.getTime());
  await q(`update contacts set score_band = 'hot' where id = $1`, [c2]);
  assert.ok((await row(c2)).updated_at > before.updated_at);

  // The 5-minute run: a workspace with a live scoring model is left alone, the other is scored. Run in a transaction
  // that sees only these two workspaces enabled, then rolled back, so other test files' workspaces aren't touched.
  const { ws: modelWs } = await workspace();
  const [m1] = await contacts(modelWs, 1);
  await q(`insert into lead_settings (workspace_id, enabled) values ($1, true)`, [modelWs]);
  await q(`insert into scoring_models (workspace_id, name, live_version) values ($1, 'Model', 1)`, [modelWs]);
  await q(`update contacts set score = 42, score_band = 'model', scored_at = null where id = $1`, [m1]);
  assert.deepEqual((await q(`select lead_scores_refresh($1, 100) r`, [modelWs]))[0].r, { scored: 0, routed: 0 });
  await q(`insert into contact_events (workspace_id, contact_id, kind, data, source) values ($1, $2, 'email.clicked', '{}', 'test')`, [ws, c1]);
  await q(`insert into contact_events (workspace_id, contact_id, kind, data, source) values ($1, $2, 'email.clicked', '{}', 'test')`, [modelWs, m1]);
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(`update lead_settings set enabled = false where workspace_id <> all($1)`, [[ws, modelWs]]);
    assert.equal((await c.query(`select lead_scores_due() n`)).rows[0].n, 1, "only the workspace without a model");
    const m = (await c.query(`select score, score_band, scored_at from contacts where id = $1`, [m1])).rows[0];
    assert.deepEqual([m.score, m.score_band, m.scored_at], [42, "model", null]);
    const a = (await c.query(`select engagement_score from contacts where id = $1`, [c1])).rows[0];
    assert.ok(a.engagement_score > later.engagement_score, "the click counts on the next run");
  } finally {
    await c.query("rollback");
    c.release();
  }
});
