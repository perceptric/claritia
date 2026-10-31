// The SQL behind Visitors, booking stitching, workflow folders, workflow reminders and Spam goes to Spam, against a
// real database built from every migration (scripts/test-db.sh). Migrations 098 to 102.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import pg from "pg";
import { uuid7 } from "../../collect/ids.ts";
import { stitchDevice, type Settings } from "../../src/lib/identity/stitch.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 6 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
const settings: Settings = { own_domains: ["team-test.io"], partner_domains: [], secrets: [] };
const H = 3600_000;
let ws = "";
let user = "";
let site = "";
after(() => pool.end());

async function asUser<T>(who: string, sql: string, params: unknown[]): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query(`select set_config('request.jwt.claim.sub', $1, false)`, [who]);
    return (await c.query(sql, params)).rows[0].r as T;
  } finally {
    await c.query(`select set_config('request.jwt.claim.sub', '', false)`);
    c.release();
  }
}

before(async () => {
  ws = uuid7();
  user = uuid7();
  await q(`insert into workspaces (id, name) values ($1, 'inbound nurture')`, [ws]);
  await q(`insert into auth.users (id, email) values ($1, $2)`, [user, `${user}@t.io`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, user]);
  site = (await q(`insert into sites (workspace_id, domain) values ($1, 'nurture-test.com') returning id`, [ws]))[0].id;
});

async function device(state = "fresh") {
  const id = uuid7();
  await q(`insert into devices (id, workspace_id, site_id, state, last_seen) values ($1, $2, $3, $4, now())`, [id, ws, site, state]);
  return id;
}
async function visit(dev: string, at: number, o: { bot?: boolean; source?: string } = {}) {
  const id = uuid7(at);
  await q(`insert into sessions (id, workspace_id, site_id, device_id, started_at, ended_at, policy, is_bot, source, pageviews, landing_path) values ($1, $2, $3, $4, $5, $6, 'notice', $7, $8, 2, '/pricing')`, [
    id, ws, site, dev, new Date(at), new Date(at + 5 * 60_000), o.bot ?? false, o.source ?? null,
  ]);
  await q(`insert into events (id, workspace_id, session_id, day, kind, path, title, server_at) values ($1, $2, $3, $4, 'view', '/pricing', 'Pricing', $5)`, [uuid7(at + 1000), ws, id, new Date(at).toISOString().slice(0, 10), new Date(at + 1000)]);
  return id;
}

test("visitors: everyone with a real visit, known ones marked; internal and bot-only devices never show", async () => {
  const now = Date.now();
  const anon = await device();
  await visit(anon, now - 2 * H, { source: "google" });
  const internal = await device("internal");
  await visit(internal, now - H);
  const bot = await device();
  await visit(bot, now - H, { bot: true });
  // A booking on the site links this device to Dana (the same proof as a form).
  const dana = await device();
  const s = await visit(dana, now - 3 * H);
  await q(`insert into identity_evidence (id, workspace_id, site_id, device_id, session_id, source, level, identifiers, extra, server_at) values ($1, $2, $3, $4, $5, 'booking', 'asserted', $6, '{}', now())`, [
    uuid7(), ws, site, dana, s, JSON.stringify([{ kind: "email", value: "dana@lead-test.io" }]),
  ]);
  const r = await stitchDevice(pool, ws, dana, settings);
  assert.ok(r.some((x) => "person" in x), "a booking links the device");
  await q(`insert into contacts (workspace_id, email, email_clean, first_name, last_name, person_id) select $1, 'dana@lead-test.io', 'dana@lead-test.io', 'Dana', 'Lee', person_id from identifiers where workspace_id = $1 and value_clean = 'dana@lead-test.io' on conflict do nothing`, [ws]);
  await q(`update contacts set person_id = (select person_id from identifiers where workspace_id = $1 and value_clean = 'dana@lead-test.io') where workspace_id = $1 and email_clean = 'dana@lead-test.io'`, [ws]);

  type V = { id: string; contact_id: string | null; first_name: string | null; source: string | null; views: number };
  const all = await asUser<V[]>(user, `select visitors_list($1, 'all', null, 50) as r`, [ws]);
  assert.deepEqual(new Set(all.map((v) => v.id)), new Set([anon, dana]));
  assert.equal(all.find((v) => v.id === dana)!.first_name, "Dana");
  assert.equal(all.find((v) => v.id === anon)!.source, "google");
  assert.deepEqual((await asUser<V[]>(user, `select visitors_list($1, 'known', null, 50) as r`, [ws])).map((v) => v.id), [dana]);
  assert.deepEqual((await asUser<V[]>(user, `select visitors_list($1, 'unknown', null, 50) as r`, [ws])).map((v) => v.id), [anon]);
  assert.deepEqual(await asUser(user, `select visitors_counts($1) as r`, [ws]), { all: 2, known: 1 });

  type J = { contact: { first_name: string } | null; sessions: { events: { kind: string; path: string }[] }[]; proof: { source: string; email: string }[] };
  const j = await asUser<J>(user, `select visitor_journey($1, $2) as r`, [ws, dana]);
  assert.equal(j.contact?.first_name, "Dana");
  assert.equal(j.sessions[0]!.events[0]!.path, "/pricing");
  assert.deepEqual(j.proof.map((p) => [p.source, p.email]), [["booking", "dana@lead-test.io"]]);
  assert.equal(await asUser(user, `select visitor_journey($1, $2) as r`, [ws, internal]), null, "an internal device has no journey");

  // Someone outside the workspace sees nothing.
  const stranger = uuid7();
  await q(`insert into auth.users (id, email) values ($1, $2)`, [stranger, `${stranger}@t.io`]);
  await assert.rejects(asUser(stranger, `select visitors_list($1) as r`, [ws]), /Workspace not found/);
  await assert.rejects(asUser(stranger, `select visitor_journey($1, $2) as r`, [ws, dana]), /Workspace not found/);
});

test("workflow folders: made from the old groups once; rename, move, file and delete keep every workflow", async () => {
  const a = (await q(`insert into workflows (workspace_id, name, stage) values ($1, 'Missed demo', 'pipeline') returning id`, [ws]))[0].id;
  const b = (await q(`insert into workflows (workspace_id, name) values ($1, 'New nurture') returning id`, [ws]))[0].id;
  assert.equal(await asUser(user, `select workflow_folders_start($1) as r`, [ws]), 2);
  assert.equal(await asUser(user, `select workflow_folders_start($1) as r`, [ws]), 0, "only the first time");
  const folders = await q(`select id, name, position from workflow_folders where workspace_id = $1 order by position`, [ws]);
  assert.deepEqual(folders.map((f) => f.name), ["Pipeline", "Workflows"]);
  const by = async (id: string) => (await q(`select folder_id from workflows where id = $1`, [id]))[0].folder_id;
  assert.equal(await by(a), folders[0].id);
  assert.equal(await by(b), folders[1].id);
  const made = await asUser<string>(user, `select workflow_folder_save($1, null, ' Onboarding ') as r`, [ws]);
  await asUser(user, `select workflow_folder_save($1, $2, 'Sales') as r`, [ws, folders[0].id]);
  await asUser(user, `select workflow_folder_move($1, $2, -1) as r`, [ws, made]);
  assert.deepEqual((await q(`select name from workflow_folders where workspace_id = $1 order by position`, [ws])).map((f) => f.name), ["Sales", "Onboarding", "Workflows"]);
  await asUser(user, `select workflow_set_folder($1, $2, $3) as r`, [ws, b, made]);
  assert.equal(await by(b), made);
  await asUser(user, `select workflow_folder_delete($1, $2) as r`, [ws, made]);
  assert.equal(await by(b), null, "its workflow stays, in no folder");
  assert.equal((await q(`select count(*)::int n from workflows where id = $1`, [b]))[0].n, 1);
  await assert.rejects(asUser(user, `select workflow_folder_save($1, null, '   ') as r`, [ws]), /Name the folder/);
});

test("reminders: a moved or canceled meeting wakes the contact's waiting runs; the live check finds a reminder workflow", async () => {
  const c = (await q(`insert into contacts (workspace_id, email, email_clean) values ($1, 'sam@lead-test.io', 'sam@lead-test.io') returning id`, [ws]))[0].id;
  const start = new Date(Date.now() + 72 * H);
  const m = (
    await q(
      `insert into meetings (workspace_id, hosts, contact_id, guest_email, start_at, end_at, block_start, block_end, source, token_hash, status) values ($1, array[$2]::uuid[], $3, 'sam@lead-test.io', $4, $5, $4, $5, 'page', 'hash-reminder-meeting', 'booked') returning id`,
      [ws, user, c, start, new Date(start.getTime() + 30 * 60_000)],
    )
  )[0].id;
  const body = { trigger: { kind: "meeting", events: ["booked"], types: [] }, steps: [{ id: "w1", kind: "wait", days: 1, hours: 0, before: "meeting" }], goals: [], entry: { mode: "repeat", gapDays: 1 } };
  const wf = (await q(`insert into workflows (workspace_id, name, status, live_version, draft) values ($1, 'Meeting reminders', 'live', 1, $2) returning id`, [ws, JSON.stringify(body)]))[0].id;
  await q(`insert into workflow_versions (workflow_id, workspace_id, version, body) values ($1, $2, 1, $3)`, [wf, ws, JSON.stringify(body)]);
  assert.equal((await q(`select workflow_reminders_live($1) as r`, [ws]))[0].r, true);
  const later = new Date(start.getTime() - 24 * H);
  const run = (await q(`insert into workflow_runs (workspace_id, workflow_id, version, contact_id, key, status, at_step, next_at, wait) values ($1, $2, 1, $3, 'ev:1', 'waiting', 'w1', $4, $5) returning id`, [ws, wf, c, later, JSON.stringify({ step: "w1", meeting: m, start: start.toISOString() })]))[0].id;
  const other = (await q(`insert into workflow_runs (workspace_id, workflow_id, version, contact_id, key, status, at_step, next_at, wait) values ($1, $2, 1, $3, 'ev:2', 'waiting', 'w1', $4, $5) returning id`, [ws, wf, c, later, JSON.stringify({ step: "x", until: later.toISOString() })]))[0].id;
  const nextAt = async (id: string) => new Date((await q(`select next_at from workflow_runs where id = $1`, [id]))[0].next_at).getTime();
  const meetings = (await q(`select workflow_meetings($1) as r`, [run]))[0].r as { id: string }[];
  assert.deepEqual(meetings.map((x) => x.id), [m]);
  await q(`update meetings set start_at = start_at + interval '2 days', end_at = end_at + interval '2 days', block_start = block_start + interval '2 days', block_end = block_end + interval '2 days' where id = $1`, [m]);
  assert.ok((await nextAt(run)) <= Date.now() + 1000, "the reminder run checks again now");
  assert.equal(await nextAt(other), later.getTime(), "a plain wait isn't touched");
  await q(`update workflow_runs set next_at = $2 where id = $1`, [run, later]);
  await q(`update meetings set status = 'canceled' where id = $1`, [m]);
  assert.ok((await nextAt(run)) <= Date.now() + 1000, "a cancel wakes it too");
  assert.deepEqual((await q(`select workflow_meetings($1) as r`, [run]))[0].r, [], "a canceled meeting is no longer counted back from");
});

test("spam goes to Spam: the routing spam check on a form lead marks the fill; other reviews stay open", async () => {
  const c = (await q(`insert into contacts (workspace_id, email, email_clean, route_status) values ($1, 'x@spam-test.io', 'x@spam-test.io', 'held') returning id`, [ws]))[0].id;
  const f = (await q(`insert into forms (workspace_id, name) values ($1, 'Demo request') returning id`, [ws]))[0].id;
  const sub = (await q(`insert into submissions (workspace_id, form_id, form_version, idem_key, contact_id, values) values ($1, $2, 1, 'idem-key-spam-0001', $3, '{"email":"x@spam-test.io"}') returning id`, [ws, f, c]))[0].id;
  const runOf = async (k: string) => (await q(`insert into router_runs (workspace_id, contact_id, key, reason, kind) values ($1, $2, $3, 'form', 'held') returning id`, [ws, c, k]))[0].id;
  const r1 = await runOf("form:1");
  await q(`insert into routing_reviews (workspace_id, run_id, contact_id, submission_id, reason, reviewer) values ($1, $2, $3, $4, 'spam', $5)`, [ws, r1, c, sub, user]);
  const s = (await q(`select spam, spam_reason from submissions where id = $1`, [sub]))[0];
  assert.deepEqual([s.spam, s.spam_reason], [true, "routing"]);
  assert.equal((await q(`select state from routing_reviews where run_id = $1`, [r1]))[0].state, "dismissed", "kept, dismissed, for Not spam");
  assert.equal((await q(`select route_status from contacts where id = $1`, [c]))[0].route_status, null);
  const r2 = await runOf("api:1");
  await q(`insert into routing_reviews (workspace_id, run_id, contact_id, reason, reviewer) values ($1, $2, $3, 'spam', $4)`, [ws, r2, c, user]);
  assert.equal((await q(`select state from routing_reviews where run_id = $1`, [r2]))[0].state, "open", "a lead from the API keeps its review");
  const r3 = await runOf("form:2");
  await q(`insert into routing_reviews (workspace_id, run_id, contact_id, submission_id, reason, reviewer) values ($1, $2, $3, $4, 'rule', $5)`, [ws, r3, c, sub, user]);
  assert.equal((await q(`select state from routing_reviews where run_id = $1`, [r3]))[0].state, "open", "a rule's hold isn't spam");
});

test("meeting description info: the form, its answers and the sealed token", async () => {
  const f = (await q(`insert into forms (workspace_id, name) values ($1, 'Demo request') returning id`, [ws]))[0].id;
  await q(`insert into form_versions (form_id, workspace_id, version, body) values ($1, $2, 1, $3)`, [f, ws, JSON.stringify({ steps: [{ fields: [{ id: "a", key: "company.size", type: "choice", label: "Company size" }] }] })]);
  const sub = (await q(`insert into submissions (workspace_id, form_id, form_version, idem_key, values) values ($1, $2, 1, 'idem-key-info-0009', '{"company.size":"51-200"}') returning id`, [ws, f]))[0].id;
  const start = new Date(Date.now() + 48 * H);
  const m = (
    await q(`insert into meetings (workspace_id, hosts, submission_id, guest_email, start_at, end_at, block_start, block_end, source, token_hash, token_sealed) values ($1, array[$2]::uuid[], $3, 'dana@lead-test.io', $4, $5, $4, $5, 'form', 'hash', 'sealed') returning id`, [
      ws, user, sub, start, new Date(start.getTime() + 30 * 60_000),
    ])
  )[0].id;
  const info = (await q(`select meeting_invite_info($1) as r`, [m]))[0].r;
  assert.equal(info.form.name, "Demo request");
  assert.equal(info.form.values["company.size"], "51-200");
  assert.equal(info.form.body.steps[0].fields[0].label, "Company size");
  assert.deepEqual([info.token_hash, info.token_sealed], ["hash", "sealed"]);
  await q(`update submissions set spam = true where id = $1`, [sub]);
  assert.equal((await q(`select meeting_invite_info($1) as r`, [m]))[0].r.form, null, "a spam fill gives nothing");
});
