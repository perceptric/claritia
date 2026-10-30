// The jobs queue's lanes and the worker's batched calls on a real database (supabase/migrations/087_job_lanes.sql),
// with the flaky cases: two workers claiming the same key at once, a lease lost while a meeting's emails go out, a
// worker killed mid-import that resumes from the byte it stopped at, and stitching while a rebuild holds the workspace.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";
import { toCsv } from "../../src/lib/contacts/csv.ts";
import { executeImport, type ImportRow } from "../../src/lib/contacts/importJob.ts";
import { SendError } from "../../src/lib/email/provider.ts";
import { jobLoop, Lanes, type Handler, type Job } from "../../src/lib/jobs.ts";
import { newToken, tokenHash } from "../../src/lib/meetings/server.ts";
import { DEFAULT_SETTINGS } from "../../src/lib/meetings/types.ts";
import { ctxFor } from "../../worker-intel/jobs/imports.ts";
import { meetingNotify, type Mail, type Mailer } from "../../worker-intel/jobs/meetings.ts";
import { BUSY_WAIT_S, stitch } from "../../worker-intel/jobs/stitch.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";
import { setDomainCheck } from "../../worker-intel/settings.ts";

setDomainCheck(async () => true);
const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 12 });
const rpc = pgRpc(pool);
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
const one = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await q(sql, p))[0] as T;
after(() => pool.end());
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function workspace(name = "lanes") {
  const ws = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, $2)`, [ws, name]);
  return ws;
}

test("enqueue sets the lane from the kind and the route's reason; a waiting job keeps the more urgent lane", async () => {
  const ws = await workspace();
  const lane = async (kind: string, key: string, payload: object) => {
    const id = (await one<{ id: string }>(`select enqueue_job($1, $2, $3, $4) id`, [ws, kind, key, JSON.stringify(payload)])).id;
    return (await one<{ p: number }>(`select priority p from jobs where id = $1`, [id])).p;
  };
  assert.equal(await lane("meeting_notify", "m1", {}), 0);
  assert.equal(await lane("route", "form:1", { reason: "form" }), 0);
  assert.equal(await lane("route", "import:1", { reason: "import" }), 2);
  assert.equal(await lane("stitch", "d1", {}), 1);
  assert.equal(await lane("enrich_contact", "c1", {}), 2);
  assert.equal(await lane("send", ws, { lane: "bulk" }), 2, "the rest of a long send");
  assert.equal(await lane("send", ws, {}), 1, "a new message takes the waiting send back to the normal lane");
});

test("enqueue_jobs: one call, same-key rows collapse to the last payload and the earliest start", async () => {
  const ws = await workspace();
  const n = (await one<{ n: number }>(`select enqueue_jobs($1) n`, [
    JSON.stringify([
      { workspace_id: ws, kind: "score_account", key: "a", payload: { v: 1 }, delay_s: 60 },
      { workspace_id: ws, kind: "score_account", key: "a", payload: { v: 2 }, delay_s: 0 },
      { workspace_id: ws, kind: "score_account", key: "b", payload: { v: 3 }, delay_s: 60 },
      { workspace_id: ws, kind: "score_account", key: "", payload: { v: 4 } },
    ]),
  ])).n;
  assert.equal(n, 3);
  const rows = await q(`select key, payload->>'v' v, run_after <= now() + interval '1 second' as now from jobs where workspace_id = $1 order by key, v`, [ws]);
  assert.deepEqual(rows.map((r) => `${r.key}:${r.v}:${r.now}`), [":4:true", "a:2:true", "b:3:false"]);
});

test("router_queue is one insert: every new contact of an import gets one bulk route job, and a second call adds none", async () => {
  const ws = await workspace();
  const imp = randomUUID();
  const user = randomUUID();
  await q(`insert into auth.users (id, email) values ($1, $2)`, [user, `${user}@t.io`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, user]);
  await q(`insert into imports (id, workspace_id, created_by, file_name, mapping, kind, status) values ($1, $2, $3, 'x.csv', '{}', 'file', 'done')`, [imp, ws, user]);
  for (let i = 0; i < 30; i++) await q(`insert into contacts (workspace_id, email, email_clean, email_class, import_id) values ($1, $2, $2, 'work', $3)`, [ws, `p${i}@co.io`, imp]);
  await q(`insert into contacts (workspace_id, email, email_clean, email_class, import_id, owner_user_id) values ($1, 'owned@co.io', 'owned@co.io', 'work', $2, $3)`, [ws, imp, user]);
  assert.equal((await one<{ n: number }>(`select router_queue($1, 'import', null, $2) n`, [ws, imp])).n, 0, "no live router, nothing queued");
  await q(`insert into routers (workspace_id, live_version) values ($1, 1) on conflict (workspace_id) do update set live_version = 1`, [ws]).catch(async () => {
    await q(`update routers set live_version = 1 where workspace_id = $1`, [ws]);
  });
  assert.equal((await one<{ n: number }>(`select router_queue($1, 'import', null, $2) n`, [ws, imp])).n, 30);
  assert.equal((await one<{ n: number }>(`select router_queue($1, 'import', null, $2) n`, [ws, imp])).n, 30, "the same contacts join their waiting jobs");
  const jobs = await q(`select priority, payload from jobs where workspace_id = $1 and kind = 'route'`, [ws]);
  assert.equal(jobs.length, 30);
  assert.ok(jobs.every((j) => j.priority === 2 && j.payload.reason === "import" && j.payload.key === `import:${j.payload.contact}`));
});

test("send_done_many and meeting_mail_done_many record a round of answers in one call", async () => {
  const ws = await workspace();
  const email = (await one<{ id: string }>(`insert into emails (workspace_id, name, kind, subject, html, text) values ($1, 'E', 'broadcast', 'S', '<p>x</p>', 'x') returning id`, [ws])).id;
  const ids: string[] = [];
  for (const to of ["a@x.io", "b@x.io", "c@x.io"]) ids.push((await one<{ id: string }>(`insert into email_messages (workspace_id, email_id, to_email, dedupe, status, attempts) values ($1, $2, $3, $3, 'sending', 1) returning id`, [ws, email, to])).id);
  const r = await rpc("send_done_many", { p_rows: [{ id: ids[0], outcome: "ok", provider_id: `re_${randomUUID()}`, error: null, delay_s: 60 }, { id: ids[1], outcome: "later", provider_id: null, error: "429", delay_s: 30 }, { id: ids[2], outcome: "unknown", provider_id: null, error: "timeout" }] });
  assert.equal(r.error, null);
  assert.deepEqual((await q(`select status from email_messages where id = any($1) order by to_email`, [ids])).map((x) => x.status), ["sent", "queued", "unknown"]);
  const m1 = (await one<{ id: string }>(`select meeting_mail_start($1, null, null, 'reconnect', 'h@x.io', $2) id`, [ws, `r:${randomUUID()}`])).id;
  const m2 = (await one<{ id: string }>(`select meeting_mail_start($1, null, null, 'reconnect', 'k@x.io', $2) id`, [ws, `r:${randomUUID()}`])).id;
  await rpc("meeting_mail_done_many", { p_rows: [{ id: m1, outcome: "ok", provider_id: `p_${randomUUID()}`, error: null }, { id: m2, outcome: "retry", provider_id: null, error: "450" }] });
  assert.deepEqual((await q(`select status from meeting_mails where id = any($1) order by to_email`, [[m1, m2]])).map((x) => x.status), ["sent", "retry"]);
});

test("two workers claiming at once never run two jobs of one key together, and every job runs", async () => {
  const ws = await workspace();
  const keys = ["k1", "k2", "k3"];
  const running = new Set<string>();
  let overlap = 0;
  let ran = 0;
  const handler: Handler = async (job) => {
    if (running.has(job.key)) overlap++;
    running.add(job.key);
    await sleep(15);
    running.delete(job.key);
    ran++;
  };
  const stop = new AbortController();
  // Two worker processes (their own lanes), two loops each.
  const loops = [new Lanes({ bulkMax: 2 }), new Lanes({ bulkMax: 2 })].flatMap((lanes, w) => [0, 1].map((i) => jobLoop({ rpc, worker: `w${w}-${i}`, handlers: { lane_test: handler }, idleMs: 5, signal: stop.signal, lanes })));
  let queued = 0;
  for (let round = 0; round < 8; round++) {
    for (const k of keys) {
      await q(`select enqueue_job($1, 'lane_test', $2, $3)`, [ws, k, JSON.stringify({ round })]);
      queued++;
    }
    await sleep(10);
  }
  const end = Date.now() + 10_000;
  while (Date.now() < end && (await one<{ n: number }>(`select count(*)::int n from jobs where workspace_id = $1 and status in ('queued', 'running')`, [ws])).n > 0) await sleep(20);
  stop.abort();
  await Promise.all(loops);
  assert.equal(overlap, 0, "one key never ran twice at once");
  assert.ok(ran >= keys.length && ran <= queued, `ran ${ran}`);
  assert.equal((await one<{ n: number }>(`select count(*)::int n from jobs where workspace_id = $1 and status <> 'done'`, [ws])).n, 0);
});

test("lanes: a lane-0 loop takes a booking email while bulk work waits, and leaves the bulk alone", async () => {
  const ws = await workspace();
  // Kinds of this test's own, in the lanes enqueue would give a booking email and a backfill.
  await q(`insert into jobs (workspace_id, kind, key, payload, priority) select $1, 'lane_bulk', 'c' || g, '{}', 2 from generate_series(1, 500) g`, [ws]);
  await q(`insert into jobs (workspace_id, kind, key, payload, priority) values ($1, 'lane_urgent', 'booked:x', '{}', 0)`, [ws]);
  const got = await q(`select kind from claim_job_lane('{lane_bulk,lane_urgent}', 'urgent-loop', 60, 5, 0)`);
  assert.deepEqual(got.map((r) => r.kind), ["lane_urgent"]);
  const shared = await q(`select kind, priority from claim_job_lane('{lane_bulk,lane_urgent}', 'shared-loop', 60, 1, 2)`);
  assert.deepEqual(shared.map((r) => [r.kind, r.priority]), [["lane_bulk", 2]]);
  // A lapsed lease waits for the recovery timer, not for the next claim.
  await q(`update jobs set locked_until = now() - interval '1 second' where workspace_id = $1 and status = 'running'`, [ws]);
  await q(`select from claim_job_lane('{lane_bulk,lane_urgent}', 'other', 60, 1, 0)`);
  assert.equal((await one<{ n: number }>(`select count(*)::int n from jobs where workspace_id = $1 and status = 'running'`, [ws])).n, 2);
  assert.ok((await one<{ n: number }>(`select recover_jobs() n`)).n >= 2);
  assert.equal((await one<{ n: number }>(`select count(*)::int n from jobs where workspace_id = $1 and status = 'running'`, [ws])).n, 0);
  await q(`delete from jobs where workspace_id = $1`, [ws]);
});

// Meeting emails with a lost lease ---------------------------------------------------------------------------------

test("a lease lost while a meeting's emails go out: the second worker sends the rest, and no one gets one twice", async () => {
  process.env.SECRETS_KEY ||= "m".repeat(40);
  const ws = await workspace("Acme");
  const hosts = [randomUUID(), randomUUID()];
  for (const [i, u] of hosts.entries()) {
    await q(`insert into auth.users (id, email) values ($1, $2)`, [u, `${u}@acme.test`]);
    await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')`, [ws, u]);
    await q(`insert into booking_profiles (workspace_id, user_id, slug, name) values ($1, $2, $3, $4)`, [ws, u, `host-${i}`, `Host ${i}`]);
  }
  const type = (await one<{ id: string }>(`insert into meeting_types (workspace_id, slug, name, kind, hosts, settings) values ($1, 'demo', 'Demo', 'one', $2, $3) returning id`, [ws, JSON.stringify(hosts.map((user_id) => ({ user_id }))), { ...DEFAULT_SETTINGS, reminders: [] }])).id;
  const start = Date.now() + 2 * 86_400_000;
  const m = (await one<{ id: string }>(
    `insert into meetings (workspace_id, type_id, hosts, guest_email, guest_name, guest_tz, answers, start_at, end_at, block_start, block_end, status, source, token_hash, location)
     values ($1, $2, $3, 'dana@lead.test', 'Dana', 'UTC', '{"guests":"pat@lead.test"}', $4, $5, $4, $5, 'booked', 'page', $6, '{"kind":"google_meet","url":"https://meet.google.com/x"}') returning id`,
    [ws, type, hosts, new Date(start).toISOString(), new Date(start + 1_800_000).toISOString(), tokenHash(newToken())],
  )).id;
  await q(`insert into meeting_events (meeting_id, kind) values ($1, 'booked')`, [m]);

  const sent: Mail[] = [];
  let gate!: () => void;
  const opened = new Promise<void>((r) => (gate = r));
  let first = true;
  // Worker A's first email hangs until its lease is gone; then the provider answers.
  const slow: Mailer = {
    async send(mail) {
      if (first) {
        first = false;
        await opened;
      }
      sent.push(mail);
      return randomUUID();
    },
  };
  const fast: Mailer = { send: async (mail) => (sent.push(mail), randomUUID()) };
  const job = (): Job => ({ id: randomUUID(), workspace_id: ws, kind: "meeting_notify", key: `booked:${m}`, payload: { meeting: m, event: "booked" }, attempts: 1, max_attempts: 5 });
  const leaseA = new AbortController();
  const a = meetingNotify(rpc, { mailer: slow, base: "https://app.test" })(job(), leaseA.signal);
  await sleep(150);
  // The lease runs out; worker B takes the job and runs it to the end.
  leaseA.abort();
  await meetingNotify(rpc, { mailer: fast, base: "https://app.test" })(job(), new AbortController().signal);
  gate();
  await a.catch(() => undefined);
  const byTo = new Map<string, number>();
  for (const s of sent) byTo.set(s.to, (byTo.get(s.to) ?? 0) + 1);
  assert.deepEqual([...byTo.values()].filter((n) => n > 1), [], `someone got an email twice: ${JSON.stringify([...byTo])}`);
  assert.equal(byTo.size, 4, "the guest, the other voter and both hosts");
  const rows = await q(`select status from meeting_mails where meeting_id = $1`, [m]);
  assert.equal(rows.length, 4);
  assert.ok(rows.every((r) => r.status === "sent"), JSON.stringify(rows));
});

test("a meeting job's answers are recorded even when a later email says not now", async () => {
  const ws = await workspace("Acme");
  const u = randomUUID();
  await q(`insert into auth.users (id, email) values ($1, $2)`, [u, `${u}@acme.test`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')`, [ws, u]);
  const acc = (await one<{ id: string }>(`insert into calendar_accounts (workspace_id, user_id, provider, account_email, status, reconnect_at) values ($1, $2, 'google', $3, 'reconnect', now()) returning id`, [ws, u, `${u}@acme.test`])).id;
  const { calendarReconnect } = await import("../../worker-intel/jobs/meetings.ts");
  let n = 0;
  const mailer: Mailer = { send: async () => (++n === 1 ? Promise.reject(new SendError("SMTP 451", { status: 451, retry: true })) : "id") };
  const job: Job = { id: randomUUID(), workspace_id: ws, kind: "calendar_reconnect", key: acc, payload: { account: acc }, attempts: 2, max_attempts: 5 };
  await assert.rejects(calendarReconnect(rpc, { mailer, base: "https://app.test" })(job, new AbortController().signal), (e: Error & { retryAfterS?: number }) => {
    assert.ok(e.retryAfterS! >= 48 && e.retryAfterS! <= 72, `backs off with jitter: ${e.retryAfterS}`);
    return true;
  });
  assert.equal((await one<{ status: string }>(`select status from meeting_mails where workspace_id = $1`, [ws])).status, "retry", "the not-now was recorded for the retry");
  await calendarReconnect(rpc, { mailer, base: "https://app.test" })(job, new AbortController().signal);
  assert.equal((await one<{ status: string }>(`select status from meeting_mails where workspace_id = $1`, [ws])).status, "sent");
});

// Imports that resume from a byte ----------------------------------------------------------------------------------

test("a worker killed mid-import picks up at the byte after the last row done, not at row 0", async () => {
  const ws = await workspace("resume");
  const user = randomUUID();
  await q(`insert into auth.users (id, email) values ($1, $2)`, [user, `${user}@t.io`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, user]);
  const ROWS = 12_000;
  const rows: unknown[][] = [["Email", "Note"]];
  // A quoted cell with a line break inside, and non-ASCII, so offsets are real bytes.
  for (let i = 0; i < ROWS; i++) rows.push([`p${i}@co${i % 50}.com`, i % 997 === 0 ? "two\nlines, \"quoted\"" : `Zoë ${i}`]);
  const bytes = new TextEncoder().encode(toCsv(rows));
  const id = (await one<{ id: string }>(`select imports_start($1, $2, 'big.csv', $3, 'file', $4, $5, null, true) as id`, [ws, user, JSON.stringify({ columns: ["email", "skip"], source: "signups", basis: "opt_in" }), `${ws}/${randomUUID()}/big.csv`, bytes.length])).id;
  const opens: number[] = [];
  let served = 0;
  const openAt = async (_p: string, offset: number) => {
    opens.push(offset);
    const part = bytes.subarray(offset);
    served += part.length;
    return { stream: new Blob([part]).stream() as ReadableStream<Uint8Array>, offset };
  };
  const load = async () => (await one<ImportRow>(`select * from imports where id = $1`, [id])) as ImportRow;
  await q(`select import_claim($1)`, [id]);
  // First attempt: killed (its signal aborts) after the first page went in.
  const kill = new AbortController();
  const killer = setInterval(async () => {
    if ((await load()).rows_done >= 5000) kill.abort();
  }, 5);
  await assert.rejects(executeImport(rpc, await load(), await ctxFor(pool, ws), { openAt, signal: kill.signal }));
  clearInterval(killer);
  const mid = await load();
  assert.ok(mid.rows_done >= 5000 && mid.rows_done < ROWS, `stopped at ${mid.rows_done}`);
  assert.equal(mid.progress.resume?.rows, mid.rows_done);
  assert.ok(mid.progress.resume!.offset > 0);
  // Second attempt: opens at the saved byte.
  served = 0;
  await executeImport(rpc, mid, await ctxFor(pool, ws), { openAt });
  assert.equal(opens.at(-1), mid.progress.resume!.offset, "opened at the saved byte");
  assert.ok(served < bytes.length * 0.75, "the done rows weren't read again");
  const done = await load();
  assert.equal((done as unknown as { status: string }).status, "done");
  assert.equal((await one<{ n: number }>(`select count(*)::int n from contacts where workspace_id = $1`, [ws])).n, ROWS, "every row once");
});

test("an import runs in slices: each ends after its time, the next opens where it stopped, and the error rows add up", async () => {
  const ws = await workspace("slices");
  const user = randomUUID();
  await q(`insert into auth.users (id, email) values ($1, $2)`, [user, `${user}@t.io`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, user]);
  const ROWS = 16_000;
  const rows: unknown[][] = [["Email"]];
  for (let i = 0; i < ROWS; i++) rows.push([i % 1000 === 0 ? `bad-${i}` : `s${i}@co.io`]);
  const bytes = new TextEncoder().encode(toCsv(rows));
  const id = (await one<{ id: string }>(`select imports_start($1, $2, 's.csv', $3, 'file', $4, $5, null, true) as id`, [ws, user, JSON.stringify({ columns: ["email"], source: "signups", basis: "opt_in" }), `${ws}/${randomUUID()}/s.csv`, bytes.length])).id;
  const opens: number[] = [];
  const openAt = async (_p: string, offset: number) => (opens.push(offset), { stream: new Blob([bytes.subarray(offset)]).stream() as ReadableStream<Uint8Array>, offset });
  const files = new Map<string, string>();
  const put = async (p: string, csv: string) => void files.set(p, csv);
  let slices = 0;
  for (;;) {
    slices++;
    await q(`select import_claim($1)`, [id]);
    const imp = (await one(`select * from imports where id = $1`, [id])) as unknown as ImportRow;
    // Each slice runs out of time after its first page.
    const r = await executeImport(rpc, imp, await ctxFor(pool, ws), { openAt, budgetMs: 1, put, readPart: async (p) => files.get(p) ?? "" });
    if (!r.more || slices > 10) break;
  }
  assert.equal(slices, 4, "16,000 rows in pages of 5,000");
  assert.ok(opens[0] === 0 && opens.slice(1).every((o, i) => o > opens[i]!), `each slice opens further on: ${opens}`);
  const done = await one<{ status: string; errors_path: string | null }>(`select status, errors_path from imports where id = $1`, [id]);
  assert.equal(done.status, "done");
  assert.equal((await one<{ n: number }>(`select count(*)::int n from contacts where workspace_id = $1`, [ws])).n, ROWS - ROWS / 1000);
  const csv = files.get(done.errors_path!)!;
  assert.equal(csv.trim().split(/\r?\n/).length - 1, ROWS / 1000, "every slice's bad rows are in the one errors file");
  assert.deepEqual([...csv.matchAll(/bad-(\d+)/g)].map((m) => Number(m[1])), Array.from({ length: ROWS / 1000 }, (_, i) => i * 1000), "in file order");
});

// Stitching while a rebuild holds the workspace ------------------------------------------------------------------

test("a stitch job during a rebuild goes back in line at once instead of holding a worker loop", async () => {
  const ws = await workspace();
  const site = (await one<{ id: string }>(`insert into sites (workspace_id, domain) values ($1, $2) returning id`, [ws, `s-${ws.slice(0, 8)}.com`])).id;
  const dev = randomUUID();
  await q(`insert into devices (id, workspace_id, site_id) values ($1, $2, $3)`, [dev, ws, site]);
  await q(`insert into identity_evidence (id, workspace_id, site_id, device_id, source, level, identifiers) values ($1, $2, $3, $4, 'form', 'asserted', '[{"kind":"email","value":"x@busy.io"}]')`, [randomUUID(), ws, site, dev]);
  const holder = await pool.connect();
  try {
    await holder.query("begin");
    await holder.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [`ws:${ws}`]);
    const t0 = Date.now();
    await stitch(pool)({ id: randomUUID(), workspace_id: ws, kind: "stitch", key: dev, payload: { device_id: dev }, attempts: 1, max_attempts: 5 }, new AbortController().signal);
    assert.ok(Date.now() - t0 < 2000, "it didn't wait for the rebuild");
    const waiting = await one<{ later: boolean }>(`select run_after > now() + make_interval(secs => $2 - 2) as later from jobs where workspace_id = $1 and kind = 'stitch' and status = 'queued'`, [ws, BUSY_WAIT_S]);
    assert.ok(waiting?.later, "queued again a little later");
    assert.equal((await one<{ n: number }>(`select count(*)::int n from identity_evidence where device_id = $1 and stitched_at is null`, [dev])).n, 1);
  } finally {
    await holder.query("rollback");
    holder.release();
  }
  await stitch(pool)({ id: randomUUID(), workspace_id: ws, kind: "stitch", key: dev, payload: { device_id: dev }, attempts: 1, max_attempts: 5 }, new AbortController().signal);
  assert.equal((await one<{ n: number }>(`select count(*)::int n from identity_evidence where device_id = $1 and stitched_at is null`, [dev])).n, 0, "stitched once the rebuild let go");
});

// A form's alerts wake when routing commits -------------------------------------------------------------------------

test("a form fill's routing wakes its alerts job that waits for the rep's name", async () => {
  const ws = await workspace();
  const sid = randomUUID();
  await q(`select enqueue_job($1, 'form_notify', $2, $3, 30)`, [ws, `form_notify:${sid}`, JSON.stringify({ submission: sid, only: "alerts", waiting_route: true })]);
  await q(`select enqueue_job($1, 'form_notify', $2, $3, 300)`, [ws, `form_reply:${sid}`, JSON.stringify({ submission: sid, only: "reply" })]);
  await q(`insert into router_runs (workspace_id, key, reason, kind) values ($1, $2, 'form', 'unassigned')`, [ws, `form:${sid}`]);
  const rows = await q(`select key, run_after <= now() as now from jobs where workspace_id = $1 order by key`, [ws]);
  assert.deepEqual(rows.map((r) => `${r.key.split(":")[0]}:${r.now}`), ["form_notify:true", "form_reply:false"], "the alerts run now; the auto-reply keeps its 5 minutes");
});
