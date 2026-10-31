// The form slice of Routing (docs/routing-workflow.md Sections 8, 13, 15 and 26 E), on a real database: a form's
// connection and its live policy decide; the accepted submission is saved before anything else; assign-only shows its
// completion with no booking; a calendar form shows the committed owner's times only (never the meeting type's fixed
// host); held leads get a review item and the safe completion; no slots keeps the owner with one follow-up task; a
// taken slot refreshes times without a new run or count; a page with old fields is held for review, its answers kept;
// a public caller can't pick a recipient; a commit that fails once is finished by the same request again.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";
import { bookForClaim, readBooking, type Booking, type Claim } from "../../src/lib/forms/booking.ts";
import { checkForm, emptyForm } from "../../src/lib/forms/schema.ts";
import { acceptFill, type PublicForm } from "../../src/lib/forms/submit.ts";
import type { Rpc } from "../../src/lib/jobs.ts";
import { at } from "../../src/lib/meetings/time.ts";
import { DEFAULT_AVAILABILITY, DEFAULT_SETTINGS } from "../../src/lib/meetings/types.ts";
import { invalidateRouterLive } from "../../src/lib/router/server.ts";
import { ctxFor } from "../../worker-intel/jobs/imports.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";
import { ANA, KAI, policy, VIN } from "../fixtures/routingSpec.ts";

const SECRET = "routing-forms-test-secret-0123456789abcdef";
const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 10 });
const rpc = pgRpc(pool);
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

const TZ = "America/New_York";
// Monday 2 November 2026, 06:00 in New York.
const NOW = at("2026-11-02", "06:00", TZ);
const free = () => async () => new Set<string>();
const NAMES: Record<string, string> = { [ANA]: "Ana", [VIN]: "Vincent", [KAI]: "Kai" };

async function form(ws: string, owner: string, o: { calendar?: string; sizeType?: "number" | "text" } = {}) {
  const raw = {
    ...emptyForm(),
    steps: [
      {
        id: "s1",
        fields: [
          { id: "em", key: "email", type: "email", label: "Work email", required: true },
          { id: "fn", key: "first_name", type: "text", label: "First name", required: false },
          { id: "fco", key: "q.country", type: "text", label: "Country", required: false },
          { id: "fsz", key: "q.size", type: o.sizeType ?? "number", label: "Company size", required: false },
        ],
      },
    ],
    spam: { minSeconds: 0, turnstile: false },
    after: { end: { kind: "message", title: "Thanks" }, ...(o.calendar ? { schedule: { tool: "claritia", url: "", perOwner: false, meetingTypeId: o.calendar } } : {}) },
  };
  const r = checkForm(raw);
  if ("errors" in r) throw new Error(r.errors.join(" "));
  const id = (await q(`insert into forms (workspace_id, name, draft) values ($1, $2, $3) returning id`, [ws, o.calendar ? "Demo request" : "Contact sales", r.form]))[0].id as string;
  await q(`select form_publish($1, $2, $3)`, [id, owner, r.form]);
  return id;
}

/**
 * The Section 26 workspace: Ana, Vincent, Kai (out); teams Enterprise US, Enterprise global, General sales and
 * Vietnam sales; the Section 11 policy as the workspace's default; Demo request (Intro call, 30 min, a type whose
 * own fixed host is Vincent) shows the assigned owner's calendar; Contact sales assigns only. Both forms map their
 * country and size answers by field id, published with the policy in one release.
 */
async function setup(o: { sizeType?: "number" | "text" } = {}) {
  const ws = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, 'Fixture')`, [ws]);
  for (const [u, name] of Object.entries(NAMES)) {
    await q(`insert into auth.users (id, email) values ($1, $2) on conflict do nothing`, [u, `${name.toLowerCase()}@claritia.test`]);
    await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, $3)`, [ws, u, u === VIN ? "owner" : "member"]);
    const acc = (await q(`insert into calendar_accounts (workspace_id, user_id, provider, account_email) values ($1, $2, 'fake', $3) returning id`, [ws, u, `${name}-${ws.slice(0, 4)}@t.io`]))[0].id;
    await q(`insert into calendar_lists (account_id, calendar_id, name, busy, write) values ($1, 'primary', 'Work', true, true)`, [acc]);
    const a = DEFAULT_AVAILABILITY(TZ);
    await q(`insert into availability (workspace_id, user_id, tz, weekly, overrides) values ($1, $2, $3, $4, $5)`, [ws, u, a.tz, a.weekly, JSON.stringify(a.overrides)]);
    await q(`insert into booking_profiles (workspace_id, user_id, slug, name) values ($1, $2, $3, $4)`, [ws, u, `${name.toLowerCase()}-${ws.slice(0, 6)}`, name]);
    await q(`insert into router_reps (workspace_id, user_id, cap_day, out_dates) values ($1, $2, 5, $3)`, [ws, u, JSON.stringify(u === KAI ? [{ from: "2020-01-01", to: "2099-01-01" }] : [])]);
  }
  for (const [key, name, members] of [["eus", "Enterprise US", [ANA, VIN]], ["eg", "Enterprise global", [KAI, ANA]], ["gs", "General sales", [VIN, KAI, ANA]], ["vn", "Vietnam sales", [VIN]]] as const)
    await q(`select routing_team_save($1, null, $2, 'rr', $3, null, $4)`, [ws, name, JSON.stringify(members.map((user) => ({ user }))), key]);
  const intro = (await q(`insert into meeting_types (workspace_id, slug, name, kind, hosts, settings) values ($1, 'intro', 'Intro call', 'one', $2, $3) returning id`, [ws, JSON.stringify([{ user_id: VIN }]), { ...DEFAULT_SETTINGS, notice: 0, window: 1 }]))[0].id as string;
  const demo = await form(ws, VIN, { calendar: intro, sizeType: o.sizeType });
  const sales = await form(ws, VIN, { sizeType: o.sizeType });
  // The policy as the workspace's default (Inbound), with both connections staged and published in one release.
  const body = policy();
  await q(`select router_draft_save($1, $2, null, $3)`, [ws, body, VIN]);
  const pid = (await q(`select routing_default_policy($1) p`, [ws]))[0].p as string;
  const mappings = [
    { field: "fco", target: "lead.country", type: "country" },
    { field: "fsz", target: "company.employees", type: "integer" },
  ];
  const staged = [];
  for (const [f, outcome] of [[demo, "assign_and_calendar"], [sales, "assign_only"]] as const)
    staged.push((await q(`select routing_source_stage($1, $2, $3, null, $4) s`, [ws, f, { policy_id: pid, enabled: true, outcome, meeting_type_id: outcome === "assign_only" ? null : intro, mappings }, VIN]))[0].s);
  const rev = (await q(`select draft_revision from routing_policies where id = $1`, [pid]))[0].draft_revision;
  await q(`select routing_publish($1, $2, $3, 'go live', $4, $5, $6, true, $7)`, [ws, pid, body, VIN, randomUUID(), rev, JSON.stringify(staged.map((s) => ({ id: s.id, revision: s.revision })))]);
  invalidateRouterLive();
  const pub = async (id: string) => (await q(`select form_public($1) as f`, [id]))[0].f as PublicForm;
  return { ws, pid, intro, demo: await pub(demo), sales: await pub(sales) };
}

let n = 0;
async function fill(f: PublicForm, o: { country?: string; size?: number | string; first?: string; extra?: Record<string, unknown>; key?: string; rpc?: Rpc } = {}) {
  const raw = {
    v: 1,
    version: f.version,
    key: o.key ?? `k${randomUUID().replace(/-/g, "")}`.slice(0, 32),
    answers: { em: `maya${++n}-${randomUUID().slice(0, 6)}@globex${n}.com`, fn: o.first ?? "Maya", fco: o.country ?? "United States", fsz: o.size ?? 800 },
    ms: 5000,
    trap: "",
    ...o.extra,
  };
  const r = await acceptFill(o.rpc ?? rpc, f, raw as never, await ctxFor(pool, f.workspace_id), { secret: SECRET, now: NOW });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { body: r.body as { id: string; booking?: Booking; pending?: boolean; message?: string }, raw };
}

const runOf = async (sub: string) => (await q(`select * from router_runs where key = $1`, [`form:${sub}`]))[0];
const claimOf = (b: Booking) => {
  const c = readBooking(b.token, SECRET);
  assert.ok(c && c !== "expired");
  return c as Claim;
};
const quota = async (ws: string, u: string) => (await q(`select (routing_quota_used($1, $2)->>'today')::int n`, [ws, u]))[0].n as number;

test("B01 Demo request: the lead is saved, the owner committed, and the assigned owner's Intro call times shown", async () => {
  const s = await setup();
  const { body } = await fill(s.demo);
  const run = await runOf(body.id);
  assert.deepEqual([run.owner, run.assignment_state, run.booking_state, run.policy_id, run.rule_id], [ANA, "assigned", "awaiting_selection", s.pid, "r_us_ent"]);
  assert.equal(run.source_id, (await q(`select id from routing_sources where form_id = $1`, [s.demo.id]))[0].id, "the run records its source and revision");
  assert.equal(run.source_revision, 2);
  assert.deepEqual(run.trace.input.values.find((v: { field: string }) => v.field === "lead.country"), { field: "lead.country", value: "US", known: true, source: "form" }, "the label became the country code");
  const c = claimOf(body.booking!);
  assert.deepEqual([c.owner, c.only, c.type], [ANA, true, s.intro], "B14: the routed owner hosts, not the type's fixed host (Vincent)");
  assert.deepEqual(body.booking!.host, { name: "Ana" });
  const ok = await bookForClaim(rpc, body.booking!.token, c, { start: body.booking!.slots[0]!, now: NOW, liveBusyFor: free });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const m = (await q(`select id, hosts from meetings where submission_id = $1`, [body.id]))[0];
  assert.deepEqual(m.hosts, [ANA]);
  // Never "booked" before the calendar holds the event (Section 15): pending, then confirmed by the calendar side.
  assert.deepEqual([(await runOf(body.id)).booking_state, (await runOf(body.id)).meeting_id], ["pending_confirmation", m.id]);
  await q(`select meeting_calendar_save($1, $2, '{}')`, [m.id, { [ANA]: { provider: "fake", account: "a", calendar: "primary", event: "ev_1" } }]);
  assert.equal((await runOf(body.id)).booking_state, "confirmed");
});

test("B02 Contact sales: the owner is committed and the thank-you shown, with no booking at all", async () => {
  const s = await setup();
  const { body } = await fill(s.sales);
  assert.deepEqual([body.booking, body.pending], [undefined, undefined]);
  const run = await runOf(body.id);
  assert.deepEqual([run.owner, run.booking_state], [ANA, "not_requested"]);
  assert.equal((await q(`select booking_shown_at from submissions where id = $1`, [body.id]))[0].booking_shown_at, null);
  assert.equal((await q(`select count(*)::int n from jobs where workspace_id = $1 and kind = 'meeting_book_later'`, [s.ws]))[0].n, 0);
});

test("B03 suspected spam with hold on: one review item; no owner, count, turn or calendar", async () => {
  const s = await setup();
  const { body } = await fill(s.demo, { first: "asdf" });
  assert.equal(body.booking, undefined, "the safe completion");
  const run = await runOf(body.id);
  assert.deepEqual([run.kind, run.assignment_state, run.owner, run.booking_state], ["held", "held_for_review", null, "not_requested"]);
  assert.deepEqual(await q(`select reason, reviewer, state from routing_reviews where run_id = $1`, [run.id]), [{ reason: "spam", reviewer: VIN, state: "open" }]);
  assert.deepEqual([await quota(s.ws, ANA), (await q(`select next_position from routing_teams t join routing_team_keys k on k.team_id = t.id where k.workspace_id = $1 and k.key = 'eus'`, [s.ws]))[0].next_position], [0, 0]);
});

test("B04 the assigned owner has no free times: the owner stays, the message shows, and one scheduling task, even when retried", async () => {
  const s = await setup();
  await q(`update availability set weekly = $3 where workspace_id = $1 and user_id = $2`, [s.ws, ANA, { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }]);
  const { body, raw } = await fill(s.demo);
  assert.equal(body.booking, undefined);
  const run = await runOf(body.id);
  assert.deepEqual([run.owner, run.booking_state, run.booking_reason], [ANA, "unavailable", "no_slots"]);
  await acceptFill(rpc, s.demo, raw as never, await ctxFor(pool, s.ws), { secret: SECRET, now: NOW });
  const tasks = await q(`select assignee, record_id, title, done from tasks where workspace_id = $1`, [s.ws]);
  assert.equal(tasks.length, 1, "the retried send reuses the task");
  assert.deepEqual([tasks[0].assignee, tasks[0].record_id, tasks[0].done], [ANA, run.contact_id, false]);
  assert.equal((await q(`select owner_user_id from contacts where id = $1`, [run.contact_id]))[0].owner_user_id, ANA);
});

test("B05 the owner's calendar needs signing in again: a distinct internal reason, the safe message, ownership kept", async () => {
  const s = await setup();
  await q(`update calendar_accounts set status = 'reconnect' where workspace_id = $1 and user_id = $2`, [s.ws, ANA]);
  const { body } = await fill(s.demo);
  assert.equal(body.booking, undefined);
  const run = await runOf(body.id);
  assert.deepEqual([run.owner, run.booking_state, run.booking_reason], [ANA, "unavailable", "calendar_disconnected"]);
  // A calendar read that fails outright is "unknown", never "no free times"; the owner is still kept.
  const broken: Rpc = (fn, args) => (fn === "meeting_inputs" ? Promise.resolve({ data: null, error: { message: "connection reset" } }) : rpc(fn, args));
  await q(`update calendar_accounts set status = 'ok' where workspace_id = $1`, [s.ws]);
  const b = await fill(s.demo, { rpc: broken });
  const r2 = await runOf(b.body.id);
  assert.deepEqual([b.body.booking, r2.owner, r2.booking_state, r2.booking_reason], [undefined, VIN, "unavailable", "unknown"]);
});

test("B08 the chosen time is taken before the confirm: fresh times, the same owner, no new run and no new count", async () => {
  const s = await setup();
  const { body } = await fill(s.demo);
  const c = claimOf(body.booking!);
  const start = body.booking!.slots[0]!;
  const runs = (await q(`select count(*)::int n from router_runs where workspace_id = $1`, [s.ws]))[0].n;
  const count = await quota(s.ws, ANA);
  const taken = await bookForClaim(rpc, body.booking!.token, c, { start, now: NOW, liveBusyFor: () => async () => new Set([ANA]) });
  assert.equal(taken.status, 409);
  assert.ok(taken.body.taken && taken.body.booking?.slots.length, "fresh times");
  assert.equal((await q(`select count(*)::int n from meetings where submission_id = $1`, [body.id]))[0].n, 0, "no false confirmation");
  assert.deepEqual([(await q(`select count(*)::int n from router_runs where workspace_id = $1`, [s.ws]))[0].n, await quota(s.ws, ANA)], [runs, count]);
  const run = await runOf(body.id);
  assert.deepEqual([run.owner, run.booking_state], [ANA, "awaiting_selection"]);
  const ok = await bookForClaim(rpc, body.booking!.token, c, { start: taken.body.booking!.slots[1]!, now: NOW, liveBusyFor: free });
  assert.equal(ok.status, 200);
  assert.equal((await runOf(body.id)).booking_state, "pending_confirmation", "booked in Claritia; the calendar confirms it");
});

test("B13 a policy published after a run was accepted: that run keeps its version and owner; the next uses the new one", async () => {
  const s = await setup();
  const a = await fill(s.sales, { country: "Vietnam", size: 800 });
  const before = await runOf(a.body.id);
  const b = policy();
  b.rules.list = [b.rules.list[2]!, b.rules.list[0]!, b.rules.list[1]!];
  await q(`select router_draft_save($1, $2, null, $3)`, [s.ws, b, VIN]);
  const rev = (await q(`select draft_revision from routing_policies where id = $1`, [s.pid]))[0].draft_revision;
  await q(`select routing_publish($1, $2, $3, 'Vietnam first', $4, $5, $6)`, [s.ws, s.pid, b, VIN, randomUUID(), rev]);
  invalidateRouterLive();
  const c = await fill(s.sales, { country: "Vietnam", size: 800 });
  const after2 = await runOf(c.body.id);
  const again = await runOf(a.body.id);
  assert.deepEqual([again.policy_version, again.owner, again.rule_id], [before.policy_version, before.owner, "r_ent"]);
  assert.deepEqual([after2.policy_version, after2.rule_id, after2.owner], [before.policy_version + 1, "r_vn", VIN]);
});

test("B16 an older page sends a size the mapping can't read: the answers are kept and the lead waits for review", async () => {
  const s = await setup({ sizeType: "text" });
  const { body } = await fill(s.demo, { size: "51-200" });
  assert.equal(body.booking, undefined);
  const sub = (await q(`select "values" from submissions where id = $1`, [body.id]))[0];
  assert.equal(sub.values["q.size"], "51-200", "the accepted answer is kept as sent");
  const run = await runOf(body.id);
  assert.deepEqual([run.kind, run.trace.checks.reason, run.owner], ["held", "source_mapping_mismatch", null]);
  assert.equal((await q(`select reason from routing_reviews where run_id = $1`, [run.id]))[0].reason, "source_mapping_mismatch");
});

test("a public caller can't choose the recipient, the queue position or the workspace", async () => {
  const s = await setup();
  const other = randomUUID();
  const { body } = await fill(s.sales, { extra: { owner: KAI, recipient: KAI, queue: "gs", next_position: 2, workspace_id: other, policy_id: randomUUID() } });
  const run = await runOf(body.id);
  assert.deepEqual([run.workspace_id, run.owner, run.policy_id], [s.ws, ANA, s.pid]);
});

test("flaky: the commit fails once; the details are saved, the form waits, and the same request again commits once", async () => {
  const s = await setup();
  let fails = 1;
  const flaky: Rpc = (fn, args) => (fn === "routing_commit" && fails-- > 0 ? Promise.resolve({ data: null, error: { message: "connection reset" } }) : rpc(fn, args));
  const first = await fill(s.demo, { rpc: flaky });
  assert.deepEqual([first.body.pending, first.body.message], [true, "Your details are saved. We're finishing your request."]);
  assert.equal((await q(`select count(*)::int n from jobs where workspace_id = $1 and kind = 'route' and key = $2`, [s.ws, `form:${first.body.id}`]))[0].n, 1, "a job has it, with the same key");
  const again = await acceptFill(rpc, s.demo, first.raw as never, await ctxFor(pool, s.ws), { secret: SECRET, now: NOW });
  const b = again.body as { id: string; booking?: Booking };
  assert.equal(b.id, first.body.id, "the same submission");
  assert.equal(claimOf(b.booking!).owner, ANA);
  assert.equal((await q(`select count(*)::int n from router_runs where workspace_id = $1`, [s.ws]))[0].n, 1);
  assert.equal(await quota(s.ws, ANA), 1);
});

test("flaky: routing slower than the send's budget; the job routes with the answers and connection the send captured", async () => {
  const s = await setup();
  const slow: Rpc = async (fn, args) => {
    if (fn === "routing_facts") await new Promise((r) => setTimeout(r, 2600));
    return rpc(fn, args);
  };
  const first = await fill(s.demo, { rpc: slow, country: "Vietnam", size: 50 });
  assert.equal(first.body.pending, true);
  const job = (await q(`select * from jobs where workspace_id = $1 and kind = 'route' and key = $2`, [s.ws, `form:${first.body.id}`]))[0];
  assert.deepEqual([job.payload.source.id, job.payload.inputs.values, job.payload.booking, job.payload.policy], [(await q(`select id from routing_sources where form_id = $1`, [s.demo.id]))[0].id, { "lead.country": "VN", "company.employees": 50 }, "awaiting_selection", s.pid]);
  const { routeJob } = await import("../../worker-intel/jobs/router.ts");
  await routeJob(rpc)({ ...job, payload: job.payload }, new AbortController().signal);
  await new Promise((r) => setTimeout(r, 2800));
  const run = await runOf(first.body.id);
  assert.deepEqual([run.rule_id, run.owner, run.source_id, run.booking_state], ["r_vn", VIN, job.payload.source.id, "awaiting_selection"], "the Vietnam rule, from the captured answers");
  assert.equal((await q(`select count(*)::int n from router_runs where workspace_id = $1`, [s.ws]))[0].n, 1, "the late inline run wrote nothing");
  const again = await acceptFill(rpc, s.demo, first.raw as never, await ctxFor(pool, s.ws), { secret: SECRET, now: NOW });
  assert.equal(claimOf((again.body as { booking: Booking }).booking).owner, VIN, "the same request again shows the committed owner's times");
});
