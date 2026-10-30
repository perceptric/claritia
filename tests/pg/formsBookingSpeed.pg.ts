// Forms and booking in fewer round trips (090_forms_booking_speed.sql) on a real database, with the flaky cases:
// a send past its hourly limit is held, the alerts are queued once whatever retries; the same fill sent twice at once
// is one submission, one run and one alert; routing slower than its budget goes to the job and the late inline run
// writes nothing, while a commit already under way at the deadline finishes and no job is queued; two confirms on one
// time are one meeting with one manage token and one calendar job; a busy queue lock hands the team's run to a job;
// a poll vote, a cancel and a move answer with the new view; the one-read booking page matches the two reads.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";
import { checkForm, emptyForm } from "../../src/lib/forms/schema.ts";
import { acceptFill, routeFillWith, type PublicForm } from "../../src/lib/forms/submit.ts";
import type { Rpc } from "../../src/lib/jobs.ts";
import { keptManageToken } from "../../src/lib/meetings/links.ts";
import { book, tokenHash } from "../../src/lib/meetings/server.ts";
import { checkLink, loadHandleTarget, loadLink, loadMeeting, loadTarget, cancelByGuest, pollVote, pollView, reschedule, bookType } from "../../src/lib/meetings/public.ts";
import { at } from "../../src/lib/meetings/time.ts";
import { DEFAULT_AVAILABILITY, DEFAULT_SETTINGS, type Kind, type MeetingType } from "../../src/lib/meetings/types.ts";
import { invalidateRouterLive, route } from "../../src/lib/router/server.ts";
import { emptyBody, type RouterBody } from "../../src/lib/router/types.ts";
import { ctxFor } from "../../worker-intel/jobs/imports.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";

process.env.SECRETS_KEY ??= "forms-booking-speed-test-secret-0123456789";
const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 12 });
const rpc = pgRpc(pool);
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

const NOW = at("2026-11-02", "06:00", "America/New_York");
const TEN = at("2026-11-02", "10:00", "America/New_York");
const none = async () => new Set<string>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const key = () => `k${randomUUID().replace(/-/g, "")}`.slice(0, 32);
const count = async (sql: string, p: unknown[]) => (await q(sql, p))[0].n as number;

async function team(n: number) {
  const ws = randomUUID();
  const slug = `acme-${ws.slice(0, 6)}`;
  await q(`insert into workspaces (id, name, booking_slug) values ($1, 'Acme', $2)`, [ws, slug]);
  const users: string[] = [];
  for (let i = 0; i < n; i++) {
    const u = randomUUID();
    users.push(u);
    await q(`insert into auth.users (id, email) values ($1, $2)`, [u, `${u}@t.io`]);
    await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, u]);
    const acc = (await q(`insert into calendar_accounts (workspace_id, user_id, provider, account_email) values ($1, $2, 'fake', $3) returning id`, [ws, u, `${u}@t.io`]))[0].id;
    await q(`insert into calendar_lists (account_id, calendar_id, name, busy, write) values ($1, 'primary', 'Work', true, true)`, [acc]);
    const a = DEFAULT_AVAILABILITY("America/New_York");
    await q(`insert into availability (workspace_id, user_id, tz, weekly, overrides) values ($1, $2, $3, $4, $5)`, [ws, u, a.tz, a.weekly, JSON.stringify(a.overrides)]);
    await q(`insert into booking_profiles (workspace_id, user_id, slug, name, handle) values ($1, $2, $3, $4, $5)`, [ws, u, `person-${i}`, `Person ${i}`, `h${i}-${u.slice(0, 6)}`]);
  }
  return { ws, slug, users };
}

async function meetingType(ws: string, kind: Kind, users: string[], settings: Partial<MeetingType["settings"]> = {}): Promise<MeetingType> {
  const hosts = users.map((u) => ({ user_id: u, weight: 1, tier: 0 }));
  const s = { ...DEFAULT_SETTINGS, notice: 0, window: 1, ...settings };
  const slug = `d-${randomUUID().slice(0, 6)}`;
  const id = (await q(`insert into meeting_types (workspace_id, slug, name, kind, hosts, settings) values ($1, $2, 'Demo', $3, $4, $5) returning id`, [ws, slug, kind, JSON.stringify(hosts), s]))[0].id as string;
  return { id, workspace_id: ws, slug, name: "Demo", kind, hosts, settings: s, secret: false, active: true, owner_user_id: null, template_id: null, locked: [] };
}

/** A live form: email and a name; perHour, alerts and the auto-reply as asked. */
async function liveForm(ws: string, user: string, o: { perHour?: number; notify?: boolean; reply?: boolean } = {}): Promise<PublicForm> {
  const raw = {
    ...emptyForm(),
    steps: [{ id: "s1", fields: [{ id: "em", key: "email", type: "email", label: "Email", required: true }, { id: "fn", key: "first_name", type: "text", label: "First name", required: false }] }],
    spam: { minSeconds: 0, turnstile: false, ...(o.perHour ? { perHour: o.perHour } : {}) },
    ...(o.notify ? { notify: { on: true, to: ["team@acme.io"], slack: false, answers: true } } : {}),
    ...(o.reply ? { reply: { on: true, subject: "Thanks", body: "We got it." } } : {}),
  };
  const r = checkForm(raw);
  if ("errors" in r) throw new Error(r.errors.join(" "));
  const id = (await q(`insert into forms (workspace_id, name, draft) values ($1, 'Demo', $2) returning id`, [ws, r.form]))[0].id as string;
  await q(`select form_publish($1, $2, $3)`, [id, user, r.form]);
  return (await q(`select form_public($1) as f`, [id]))[0].f as PublicForm;
}

const send = async (f: PublicForm, email: string, o: { key?: string; rpc?: Rpc; test?: boolean } = {}) =>
  acceptFill(o.rpc ?? rpc, f, { v: 1, version: f.version, key: o.key ?? key(), answers: { em: email }, ms: 5000, trap: "" }, await ctxFor(pool, f.workspace_id), { secret: process.env.SECRETS_KEY, now: NOW, test: o.test });

function rrBody(users: string[]): RouterBody {
  const b = emptyBody();
  b.account.on = false;
  b.queues = [{ id: "q1", name: "Everyone", method: "rr", strict: false, hoursOnly: false, members: users.map((user) => ({ user, weight: 1 })) }];
  b.rules.list = [{ id: "r1", name: "All", match: "all", conds: [{ field: "lead.source", op: "filled" }], queue: "q1" }];
  b.fallback = { kind: "queue", id: "q1" };
  return b;
}

/** An Rpc that holds one function's answer back for `ms`. */
const slow = (fn: string, ms: number, calls?: string[]): Rpc => async (f, args) => {
  calls?.push(f);
  if (f === fn) await sleep(ms);
  return rpc(f, args);
};

// Forms -------------------------------------------------------------------------------------------------------------

test("form_submit_all: past the hourly limit a fill is held as spam with no contact; tests and spam don't count", async () => {
  const { ws, users } = await team(1);
  const f = await liveForm(ws, users[0]!, { perHour: 2 });
  const a = await send(f, "a@acme.io");
  const b = await send(f, "b@acme.io");
  await send(f, "t@acme.io", { test: true });
  const c = await send(f, "c@acme.io");
  assert.deepEqual([a.status, b.status, c.status], [200, 200, 200], "the visitor never sees the limit");
  const rows = await q(`select spam, spam_reason, contact_id, test from submissions where form_id = $1 order by created_at`, [f.id]);
  assert.deepEqual(rows.map((r) => [r.spam, r.spam_reason, !!r.contact_id, r.test]), [[false, null, true, false], [false, null, true, false], [false, null, true, true], [true, "rate", false, false]]);
});

test("form_submit_all: the alert and the auto-reply are queued once, the reply 5 minutes out; a repeat or a test queues none", async () => {
  const { ws, users } = await team(1);
  const f = await liveForm(ws, users[0]!, { notify: true, reply: true });
  const k = key();
  const first = await send(f, "ana@acme.io", { key: k });
  const again = await send(f, "ana@acme.io", { key: k });
  assert.equal(first.body.id, again.body.id, "the same fill");
  const sid = first.body.id as string;
  const jobs = await q(`select key, payload->>'only' only, extract(epoch from run_after - created_at)::int delay from jobs where kind = 'form_notify' and payload->>'submission' = $1 order by key`, [sid]);
  assert.deepEqual(jobs.map((j) => [j.key, j.only]), [[`form_notify:${sid}`, "alerts"], [`form_reply:${sid}`, "reply"]]);
  assert.ok(jobs.find((j) => j.only === "reply")!.delay >= 299, "the reply waits 5 minutes");
  const t = await send(f, "qa@acme.io", { test: true });
  assert.equal(await count(`select count(*)::int n from jobs where kind = 'form_notify' and payload->>'submission' = $1`, [t.body.id]), 0);
});

test("the same fill sent twice at once: one submission, one routing run, one alert", async () => {
  const { ws, users } = await team(2);
  await q(`select router_publish($1, $2, 'test', null)`, [ws, rrBody(users)]);
  invalidateRouterLive(ws);
  const f = await liveForm(ws, users[0]!, { notify: true });
  const k = key();
  const [a, b] = await Promise.all([send(f, "dup@acme.io", { key: k }), send(f, "dup@acme.io", { key: k })]);
  assert.equal(a.body.id, b.body.id);
  assert.equal(await count(`select count(*)::int n from submissions where form_id = $1`, [f.id]), 1);
  assert.equal(await count(`select count(*)::int n from router_runs where workspace_id = $1`, [ws]), 1);
  assert.equal(await count(`select count(*)::int n from jobs where kind = 'form_notify' and payload->>'submission' = $1`, [a.body.id]), 1);
});

test("a form whose version changed under the cached copy: the send is refused with a refresh, never saved on the old one", async () => {
  const { ws, users } = await team(1);
  const f = await liveForm(ws, users[0]!);
  const body = { ...f.body, steps: f.body.steps };
  await q(`select form_publish($1, $2, $3)`, [f.id, users[0], body]);
  const r = await acceptFill(rpc, f, { v: 1, version: f.version + 1, key: key(), answers: { em: "x@acme.io" }, ms: 5000, trap: "" }, await ctxFor(pool, ws), {});
  assert.equal(r.status, 409, "the browser is on another version than the copy it was checked against");
  assert.equal(await count(`select count(*)::int n from submissions where form_id = $1`, [f.id]), 0);
});

test("form_submission_keys: the keys the latest fills used, spam aside", async () => {
  const { ws, users } = await team(1);
  const f = await liveForm(ws, users[0]!);
  await q(`insert into submissions (workspace_id, form_id, form_version, idem_key, "values") values ($1, $2, $3, $4, '{"email":"a","q.size":3}'), ($1, $2, $3, $5, '{"email":"b","first_name":"B"}')`, [ws, f.id, f.version, key(), key()]);
  await q(`insert into submissions (workspace_id, form_id, form_version, idem_key, "values", spam) values ($1, $2, $3, $4, '{"secret":"x"}', true)`, [ws, f.id, f.version, key()]);
  assert.deepEqual((await q(`select form_submission_keys($1) k`, [f.id]))[0].k, ["email", "first_name", "q.size"]);
});

// Routing -----------------------------------------------------------------------------------------------------------

test("router_facts_full: router_facts with the enrichment columns, and a key seen before answers as before", async () => {
  const { ws, users } = await team(1);
  const c = (await q(`insert into contacts (workspace_id, email, email_clean, email_class, seniority, department) values ($1, 'x@client.io', 'x@client.io', 'work', 'VP', 'Sales') returning id`, [ws]))[0].id;
  const args = [ws, c, "k-1", [users[0]], ["q1"]];
  const full = (await q(`select router_facts_full($1, $2, $3, $4, $5) f`, args))[0].f;
  const plain = (await q(`select router_facts($1, $2, $3, $4, $5) f`, args))[0].f;
  const more = (await q(`select router_facts_more($1) m`, [c]))[0].m;
  assert.deepEqual(full, { ...plain, more });
  assert.deepEqual(full.more, { seniority: "VP", department: "Sales" });
  await q(`insert into router_runs (workspace_id, contact_id, key, reason, version, kind) values ($1, $2, 'k-1', 'api', 1, 'unassigned')`, [ws, c]);
  const seen = (await q(`select router_facts_full($1, $2, $3, $4, $5) f`, args))[0].f;
  assert.ok(seen.existing && !seen.more);
});

test("routing slower than its budget goes to the job; the inline run finishing late writes nothing; one run, one owner", async () => {
  const { ws, users } = await team(3);
  await q(`select router_publish($1, $2, 'test', null)`, [ws, rrBody(users)]);
  invalidateRouterLive(ws);
  const c = (await q(`insert into contacts (workspace_id, email, email_clean, email_class) values ($1, 'late@client.io', 'late@client.io', 'work') returning id`, [ws]))[0].id as string;
  const calls: string[] = [];
  const sLate = randomUUID();
  // The facts take 250 ms, past a 100 ms budget: the job is queued, and the inline run reaches its gate after.
  const r = await routeFillWith(slow("router_facts_full", 250, calls), ws, c, sLate, { budgetMs: 100 });
  assert.equal(r.routed, null);
  assert.equal(await count(`select count(*)::int n from jobs where kind = 'route' and key = 'form:${sLate}'`, []), 1, "the job has it");
  await sleep(400);
  assert.ok(!calls.includes("router_commit"), "the late inline run stopped at its gate");
  assert.equal(await count(`select count(*)::int n from router_runs where workspace_id = $1`, [ws]), 0);
  // The job runs (twice, as a retry would): one run, one owner.
  for (let i = 0; i < 2; i++) await route(rpc, { ws, contact: c, key: `form:${sLate}`, reason: "form" });
  const runs = await q(`select owner from router_runs where workspace_id = $1`, [ws]);
  assert.equal(runs.length, 1);
  assert.equal((await q(`select owner_user_id from contacts where id = $1`, [c]))[0].owner_user_id, runs[0].owner);
});

test("a commit under way at the deadline finishes inline and no job is queued; one past the grace leaves the job a repeat", async () => {
  const { ws, users } = await team(2);
  await q(`select router_publish($1, $2, 'test', null)`, [ws, rrBody(users)]);
  invalidateRouterLive(ws);
  const lead = async (e: string) => (await q(`insert into contacts (workspace_id, email, email_clean, email_class) values ($1, $2, $2, 'work') returning id`, [ws, e]))[0].id as string;
  const c1 = await lead("c1@client.io");
  const [sCommit, sGrace] = [randomUUID(), randomUUID()];
  // The commit takes 200 ms; the budget is 100 ms: it had claimed the lead, so it finishes.
  const r = await routeFillWith(slow("router_commit", 200), ws, c1, sCommit, { budgetMs: 100 });
  assert.equal(r.routed?.kind, "owner");
  assert.equal(await count(`select count(*)::int n from jobs where kind = 'route' and key = 'form:${sCommit}'`, []), 0, "no job: the inline run owned it");
  assert.equal(await count(`select count(*)::int n from router_runs where key = 'form:${sCommit}'`, []), 1);
  // The commit takes 300 ms with only 50 ms of grace: the job is queued too, and finds the run already written.
  const c2 = await lead("c2@client.io");
  const late = await routeFillWith(slow("router_commit", 300), ws, c2, sGrace, { budgetMs: 50, graceMs: 50 });
  assert.equal(late.routed, null);
  assert.equal(await count(`select count(*)::int n from jobs where kind = 'route' and key = 'form:${sGrace}'`, []), 1);
  await sleep(400);
  const again = await route(rpc, { ws, contact: c2, key: `form:${sGrace}`, reason: "form" });
  assert.equal(again.status, "dup");
  assert.equal(await count(`select count(*)::int n from router_runs where key = 'form:${sGrace}'`, []), 1);
});

test("a router whose rules test qualify: the send never waits on it; the job routes", async () => {
  const { ws, users } = await team(1);
  const b = rrBody(users);
  b.rules.list = [{ id: "r1", name: "Fit", match: "all", conds: [{ field: "lead.qualify", op: "is", value: "fit" }], queue: "q1" }];
  await q(`select router_publish($1, $2, 'test', null)`, [ws, b]);
  invalidateRouterLive(ws);
  const c = (await q(`insert into contacts (workspace_id, email, email_clean, email_class) values ($1, 'q@client.io', 'q@client.io', 'work') returning id`, [ws]))[0].id as string;
  const calls: string[] = [];
  const sQ = randomUUID();
  const t0 = Date.now();
  const r = await routeFillWith(slow("none", 0, calls), ws, c, sQ);
  assert.equal(r.routed, null);
  assert.ok(Date.now() - t0 < 300);
  assert.ok(!calls.includes("router_facts_full") && !calls.some((x) => x.startsWith("qualify")));
  assert.equal(await count(`select count(*)::int n from jobs where kind = 'route' and key = 'form:${sQ}'`, []), 1);
});

// Booking pages -------------------------------------------------------------------------------------------------------

test("book_page: one read answers what book_target and booking_look did, by address or by handle", async () => {
  const { ws, slug, users } = await team(2);
  const t = await meetingType(ws, "round_robin", users);
  await q(`update workspaces set booking_page = '{"welcome":"Hello"}' where id = $1`, [ws]);
  const viaPage = await loadTarget(rpc, slug, t.slug);
  const old = (await q(`select book_target($1, $2, null) t`, [slug, t.slug]))[0].t;
  assert.equal(viaPage?.type?.id, old.type.id);
  assert.deepEqual(viaPage?.profiles.map((p) => p.user_id).sort(), old.profiles.map((p: { user_id: string }) => p.user_id).sort());
  assert.equal(viaPage?.look.welcome, "Hello");
  const handle = (await q(`select handle from booking_profiles where user_id = $1`, [users[1]]))[0].handle as string;
  const person = await loadHandleTarget(rpc, handle, null);
  assert.equal(person?.t.profile?.user_id, users[1]);
  assert.equal(person?.h.handle, handle);
  const typed = await loadHandleTarget(rpc, slug, t.slug);
  assert.equal(typed?.t.type?.id, t.id, "the team's handle with a type");
  assert.equal(await loadHandleTarget(rpc, slug, "person-0"), null, "under a handle the second part is only ever a type");
  assert.equal(await loadHandleTarget(rpc, "nobody-here", null), null);
  assert.equal((await q(`select book_page(null, null, null, 'nobody-here') p`, []))[0].p, null);
});

// Booking ---------------------------------------------------------------------------------------------------------------

test("two confirms on one time: one meeting, with its manage token kept and one calendar job; the other gets fresh times", async () => {
  const { ws, users } = await team(1);
  const t = await meetingType(ws, "one", users);
  const g = (email: string) => ({ email, name: "Dana Lee", tz: "America/New_York", answers: {} });
  const [a, b] = await Promise.all([
    bookType(rpc, { ws, type: t, length: 30, start: TEN, guest: g("a@lead.io"), source: "page", payReady: false, liveBusy: none, now: NOW }),
    bookType(rpc, { ws, type: t, length: 30, start: TEN, guest: g("b@lead.io"), source: "page", payReady: false, liveBusy: none, now: NOW }),
  ]);
  const won = [a, b].filter((r) => r.ok);
  const lost = [a, b].filter((r) => !r.ok);
  assert.equal(won.length, 1);
  assert.ok(!lost[0]!.ok && lost[0]!.error === "slot_taken" && lost[0]!.slots.every((s) => s.start !== TEN));
  const w = won[0]!;
  assert.ok(w.ok);
  const m = (await q(`select token_hash, token_sealed, contact_id from meetings where workspace_id = $1`, [ws]))!;
  assert.equal(m.length, 1);
  assert.equal(m[0].token_hash, tokenHash(w.token));
  assert.equal(keptManageToken(m[0]), w.token, "the emails can carry the guest's link");
  assert.ok(m[0].contact_id, "the new guest became a contact in the same call");
  assert.equal(await count(`select count(*)::int n from jobs where kind = 'meeting_sync' and payload->>'meeting' = $1`, [w.meetingId]), 1);
  assert.equal((await loadMeeting(rpc, { token: w.token }))?.meeting.id, w.meetingId, "the manage link opens it");
});

test("meeting_book_all refuses what meeting_book refuses and writes nothing; a held time queues no calendar job", async () => {
  const { ws, users } = await team(1);
  const t = await meetingType(ws, "one", users);
  const args = (email: string, status = "booked") => ({
    p_ws: ws, p_type: t.id, p_hosts: users, p_start: new Date(TEN).toISOString(), p_end: new Date(TEN + 1_800_000).toISOString(),
    p_block_start: new Date(TEN).toISOString(), p_block_end: new Date(TEN + 1_800_000).toISOString(),
    p_guest: { email, name: "", tz: "", answers: {} }, p_source: "page", p_token_hash: tokenHash(randomUUID()), p_status: status, p_sealed: "v1:x:y:z", p_sync: true,
  });
  const held = await rpc("meeting_book_all", args("p@lead.io", "pending_payment"));
  assert.ok(!held.error);
  const mid = (held.data as { id: string }).id;
  assert.equal(await count(`select count(*)::int n from jobs where kind = 'meeting_sync' and payload->>'meeting' = $1`, [mid]), 0, "no event until it's paid");
  const taken = await rpc("meeting_book_all", args("q@lead.io"));
  assert.match(taken.error?.message ?? "", /slot_taken/);
  assert.equal(await count(`select count(*)::int n from meetings where workspace_id = $1`, [ws]), 1);
  assert.equal(await count(`select count(*)::int n from jobs where workspace_id = $1 and kind = 'meeting_sync'`, [ws]), 0);
});

test("a team meeting's run is written with the booking, or handed to its job when the queue's lock is busy", async () => {
  const { ws, users } = await team(2);
  await q(`select router_publish($1, $2, 'test', null)`, [ws, rrBody(users)]);
  invalidateRouterLive(ws);
  const t = await meetingType(ws, "round_robin", users, { team: "q1" });
  const g = { email: "team@lead.io", name: "T", tz: "America/New_York" };
  const r = await book(rpc, { ws, type: t, length: 30, start: TEN, guest: g, source: "page", now: NOW, liveBusy: none });
  assert.ok(r.ok && r.tail);
  assert.equal(await count(`select count(*)::int n from router_runs where key = $1`, [`booking:${r.meetingId}`]), 1);
  // Someone holds the queue's lock (a lead routing into it): the booking doesn't wait; the job writes the run.
  const holder = await pool.connect();
  try {
    await holder.query("begin");
    await holder.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [`router-queue:${ws}:q1`]);
    const t0 = Date.now();
    const r2 = await book(rpc, { ws, type: t, length: 30, start: TEN + 3_600_000, guest: { ...g, email: "team2@lead.io" }, source: "page", now: NOW, liveBusy: none });
    assert.ok(r2.ok);
    assert.ok(Date.now() - t0 < 2000, "never waits on the queue");
    assert.equal(await count(`select count(*)::int n from router_runs where key = $1`, [`booking:${r2.meetingId}`]), 0);
    assert.equal(await count(`select count(*)::int n from jobs where kind = 'meeting_team_run' and key = $1`, [`booking:${r2.meetingId}`]), 1);
  } finally {
    await holder.query("rollback");
    holder.release();
  }
});

test("a poll vote answers with the poll as it is now; a cancel and a move answer with the meeting, and queue the calendar once", async () => {
  const { ws, users } = await team(1);
  const host = users[0]!;
  const made = checkLink({ kind: "poll", offered: [{ start: TEN }, { start: TEN + 3_600_000 }], length: 30 }, { owner: host, type: null, now: NOW });
  assert.ok("row" in made);
  await q(`insert into meeting_links (workspace_id, kind, owner_user_id, offered, length_min, token_hash) values ($1, 'poll', $2, $3, 30, $4)`, [ws, host, JSON.stringify(made.row.offered), made.row.token_hash]);
  const v = await pollVote(rpc, made.token, { email: "a@x.io", name: "Ana", picks: [TEN] });
  assert.ok(v.ok && v.view);
  assert.deepEqual(pollView(v.view, NOW).times.map((x) => x.n), [1, 0]);
  const before = await loadLink(rpc, { token: made.token });
  assert.deepEqual(pollView(before!, NOW), pollView(v.view, NOW), "the same view a fresh read gives");

  const t = await meetingType(ws, "one", users);
  const booked = await bookType(rpc, { ws, type: t, length: 30, start: TEN + 7_200_000, guest: { email: "m@lead.io", name: "M", tz: "UTC", answers: {} }, source: "page", payReady: false, liveBusy: none, now: NOW });
  assert.ok(booked.ok);
  const view = (await loadMeeting(rpc, { token: booked.token }))!;
  const moved = await reschedule(rpc, { view, start: TEN + 10_800_000, liveBusy: none, now: NOW });
  assert.ok(moved.ok && moved.view);
  assert.equal(Date.parse(moved.view.meeting.start_at), TEN + 10_800_000);
  assert.equal(await count(`select count(*)::int n from jobs where kind = 'meeting_sync' and payload->>'meeting' = $1 and payload->>'action' = 'move'`, [booked.meetingId]), 1);
  const canceled = await cancelByGuest(rpc, { view: moved.view, reason: "No longer needed", now: NOW });
  assert.ok(canceled.ok && canceled.view);
  assert.equal(canceled.view.meeting.status, "canceled");
  assert.equal(await count(`select count(*)::int n from jobs where kind = 'meeting_sync' and payload->>'meeting' = $1 and payload->>'action' = 'cancel'`, [booked.meetingId]), 1);
  const twice = await cancelByGuest(rpc, { view: canceled.view, now: NOW });
  assert.deepEqual(twice, { ok: false, error: "not_cancelable" });
});
