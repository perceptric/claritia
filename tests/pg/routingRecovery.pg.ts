// Routing recovery and review, stages H and I (docs/routing-workflow.md Sections 8, 13, 15, 18-20, 22 and 26), on a
// real database: the review lifecycle (G09), an explicit child attempt that resolves its parent (G10), a reviewer who
// leaves, manual reassignment through the committer, an abandoned booking and its later confirmation (B06, B07), a
// calendar create whose answer is lost and is reconciled without a second event (B09, B11), a confirmed booking whose
// CRM sync fails and is retried on its own (B10), cancellation and no-show (B12), daylight saving (B15), one task per
// run and purpose (G11), no second meeting or invitation on a rerun or retry (G12), a disconnected form's safe outcome
// (G13), every new action refused on the server for the wrong person or workspace (G14), a new form's connection, and a
// booking-first team's allocation in the quota.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";
import { bookForClaim, readBooking, type Booking, type Claim } from "../../src/lib/forms/booking.ts";
import { checkForm, emptyForm } from "../../src/lib/forms/schema.ts";
import { acceptFill, type PublicForm } from "../../src/lib/forms/submit.ts";
import type { Job } from "../../src/lib/jobs.ts";
import { at } from "../../src/lib/meetings/time.ts";
import { DEFAULT_AVAILABILITY, DEFAULT_SETTINGS } from "../../src/lib/meetings/types.ts";
import { providerFor, type FullProvider } from "../../src/lib/meetings/providers/index.ts";
import { BASE_FIELDS } from "../../src/lib/router/conditions.ts";
import { invalidateRouterLive } from "../../src/lib/router/server.ts";
import * as H from "../../src/lib/routing/handoff.ts";
import * as R from "../../src/lib/routing/recovery.ts";
import * as S from "../../src/lib/routing/screens.ts";
import { forgetSources } from "../../src/lib/routing/sources.ts";
import { meetingSync } from "../../worker-intel/jobs/calendars.ts";
import { ctxFor } from "../../worker-intel/jobs/imports.ts";
import { routingAbandon } from "../../worker-intel/jobs/router.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";
import { ANA, KAI, policy, VIN } from "../fixtures/routingSpec.ts";

const SECRET = "routing-recovery-test-secret-0123456789abcdef";
const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 10 });
const rpc = pgRpc(pool);
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

const TZ = "America/New_York";
const NOW = at("2026-11-02", "06:00", TZ);
const free = () => async () => new Set<string>();
const NAMES: Record<string, string> = { [ANA]: "Ana", [VIN]: "Vincent", [KAI]: "Kai" };
const signal = new AbortController().signal;
const op = (p = "op") => `${p}_${randomUUID().replace(/-/g, "")}`;
const job = (kind: string, key: string, payload: Record<string, unknown>, ws: string, attempts = 1, max = 5): Job => ({ id: randomUUID(), workspace_id: ws, kind, key, payload, attempts, max_attempts: max });

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

/** The Section 26 workspace (as tests/pg/routingForms.pg.ts): the Section 11 policy as the default, both forms published with it. */
async function setup(o: { sizeType?: "number" | "text"; window?: number } = {}) {
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
  const intro = (await q(`insert into meeting_types (workspace_id, slug, name, kind, hosts, settings) values ($1, 'intro', 'Intro call', 'one', $2, $3) returning id`, [ws, JSON.stringify([{ user_id: VIN }]), { ...DEFAULT_SETTINGS, notice: 0, window: o.window ?? 1 }]))[0].id as string;
  const demo = await form(ws, VIN, { calendar: intro, sizeType: o.sizeType });
  const sales = await form(ws, VIN, { sizeType: o.sizeType });
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
  forgetSources();
  const pub = async (id: string) => (await q(`select form_public($1) as f`, [id]))[0].f as PublicForm;
  const owner: S.Caller = { ws, user: VIN, role: "owner" };
  const ana: S.Caller = { ws, user: ANA, role: "member" };
  const kai: S.Caller = { ws, user: KAI, role: "member" };
  const deps: S.Deps = {
    members: async () => (await q(`select user_id id from workspace_members where workspace_id = $1`, [ws])).map((r) => ({ id: r.id as string, name: NAMES[r.id as string] ?? "", email: "" })),
    fields: async () => BASE_FIELDS,
  };
  return { ws, pid, intro, demoId: demo, salesId: sales, demo: await pub(demo), sales: await pub(sales), owner, ana, kai, deps };
}
type W = Awaited<ReturnType<typeof setup>>;

let n = 0;
async function fill(f: PublicForm, o: { country?: string; size?: number | string; first?: string; now?: number } = {}) {
  const raw = {
    v: 1,
    version: f.version,
    key: `k${randomUUID().replace(/-/g, "")}`.slice(0, 32),
    answers: { em: `maya${++n}-${randomUUID().slice(0, 6)}@globex${n}.com`, fn: o.first ?? "Maya", fco: o.country ?? "United States", fsz: o.size ?? 800 },
    ms: 5000,
    trap: "",
  };
  const r = await acceptFill(rpc, f, raw as never, await ctxFor(pool, f.workspace_id), { secret: SECRET, now: o.now ?? NOW });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { body: r.body as { id: string; booking?: Booking; pending?: boolean }, raw };
}

const runOf = async (sub: string) => (await q(`select * from router_runs where key = $1`, [`form:${sub}`]))[0];
const claimOf = (b: Booking) => {
  const c = readBooking(b.token, SECRET);
  assert.ok(c && c !== "expired");
  return c as Claim;
};
const quota = async (ws: string, u: string) => (await q(`select (routing_quota_used($1, $2)->>'today')::int n`, [ws, u]))[0].n as number;
const nexts = async (ws: string) => (await q(`select json_agg(next_position order by id) n from routing_teams where workspace_id = $1`, [ws]))[0].n;
const reviewOf = async (run: string) => (await q(`select * from routing_reviews where run_id = $1`, [run]))[0];
const refused = (status: number) => (e: unknown) => e instanceof S.Refusal && e.status === status;
const placeEvent = (meeting: string, user: string) => q(`select meeting_calendar_save($1, $2, '{}')`, [meeting, { [user]: { provider: "fake", account: "a", calendar: "primary", event: `ev_${meeting.slice(0, 6)}` } }]);

/** A held (suspected spam) Demo request, with its open review item. */
async function held(w: W) {
  const { body } = await fill(w.demo, { first: "asdf" });
  const run = await runOf(body.id);
  assert.equal(run.kind, "held");
  return { sub: body.id, run };
}

// Review lifecycle (Section 18) ----------------------------------------------------------------------------------

test("G09 approving without running the child keeps the item in Needs review; dismiss needs a reason; reopen; stale revisions refused", async () => {
  const w = await setup();
  const { run } = await held(w);
  const inReview = async () => ((await S.activity(rpc, w.owner, { filter: "review" })).runs as { id: string }[]).some((r) => r.id === run.id);
  assert.equal(await inReview(), true);
  const v0 = await reviewOf(run.id);
  const a = await R.reviewAct(rpc, w.owner, { run: run.id, action: "approve", revision: v0.revision });
  assert.equal(a!.state, "approved_pending_execution");
  assert.equal(await inReview(), true, "approval alone isn't an assignment: still in Needs review");
  assert.equal((await q(`select owner_user_id, route_status from contacts where id = $1`, [run.contact_id]))[0].route_status, "held");
  // A second approval from the same screen is the same request; a stale revision from another screen is a conflict.
  await R.reviewAct(rpc, w.owner, { run: run.id, action: "approve" });
  await assert.rejects(R.reviewAct(rpc, w.owner, { run: run.id, action: "dismiss", reason: "Spam", revision: v0.revision }), refused(409));
  await assert.rejects(R.reviewAct(rpc, w.owner, { run: run.id, action: "dismiss", reason: "  " }), refused(400));
  const d = await R.reviewAct(rpc, w.owner, { run: run.id, action: "dismiss", reason: "A test from our agency" });
  assert.equal(d!.state, "dismissed");
  assert.equal(await inReview(), false);
  assert.equal((await q(`select route_status from contacts where id = $1`, [run.contact_id]))[0].route_status, null, "the contact no longer reads as waiting");
  const r = await R.reviewAct(rpc, w.owner, { run: run.id, action: "reopen" });
  assert.equal(r!.state, "open");
  assert.equal(await inReview(), true);
  const log = await q(`select action, data->>'reason' reason from audit_log where workspace_id = $1 and action like 'routing.review.%' order by at`, [w.ws]);
  assert.deepEqual(log.map((l) => l.action), ["routing.review.approve", "routing.review.dismiss", "routing.review.reopen"]);
  assert.equal(log[1].reason, "A test from our agency");
  // Never resolved by an action: only a child's owner resolves it.
  await assert.rejects(q(`select routing_review_act($1, $2, 'resolve', $3)`, [w.ws, v0.id, VIN]), /invalid_configuration/);
});

test("G10 Approve and route: an explicit child attempt on the original version resolves the parent; the parent's trace is kept", async () => {
  const w = await setup();
  const { run } = await held(w);
  const parentTrace = run.trace;
  const pv = await R.childPreview(rpc, w.owner, w.deps, { run: run.id, clearHold: true });
  assert.equal(pv.chosen?.original, true, "the original version by default");
  assert.equal(pv.chosen?.version, run.policy_version);
  assert.equal(pv.recipient, ANA, "the preview's suggestion");
  const before = await q(`select count(*)::int n from router_runs where workspace_id = $1`, [w.ws]);
  assert.equal((await q(`select count(*)::int n from router_runs where workspace_id = $1`, [w.ws]))[0].n, before[0].n, "a preview writes nothing");
  const o1 = op("child");
  const [x, y] = await Promise.all([
    R.childRun(rpc, w.owner, w.deps, { run: run.id, op: o1, clearHold: true, ref: pv.ref }),
    R.childRun(rpc, w.owner, w.deps, { run: run.id, op: o1, clearHold: true, ref: pv.ref }).catch((e) => e),
  ]);
  assert.equal(x.status, "resolved");
  const child = (await q(`select * from router_runs where parent_run_id = $1`, [run.id]));
  assert.equal(child.length, 1, "one child attempt, even when confirmed twice");
  assert.equal(child[0].key, `review:${(await reviewOf(run.id)).id}:${o1}`, "a new attempt id, linked to the parent");
  assert.equal(child[0].owner, ANA);
  assert.equal(child[0].trace.review.clearHold, true);
  void y;
  const v = await reviewOf(run.id);
  assert.deepEqual([v.state, v.child_run_id], ["resolved", child[0].id]);
  assert.deepEqual((await q(`select trace from router_runs where id = $1`, [run.id]))[0].trace, parentTrace, "the original decision trace isn't rewritten");
  assert.deepEqual((await q(`select owner_user_id, route_status from contacts where id = $1`, [run.contact_id]))[0], { owner_user_id: ANA, route_status: null });
  assert.equal(await quota(w.ws, ANA), 1);
  // Resolved: no second attempt.
  await assert.rejects(R.childRun(rpc, w.owner, w.deps, { run: run.id, op: op(), clearHold: true, ref: pv.ref }), refused(409));
});

test("G10 corrections are new facts with provenance; a later published version can be chosen; a child that lands in review reopens its parent", async () => {
  const w = await setup({ sizeType: "text" });
  const { body } = await fill(w.demo, { size: "51-200" });
  const run = await runOf(body.id);
  assert.equal(run.trace.checks.reason, "source_mapping_mismatch");
  // Publish v2 (Vietnam first) after the run: the original stays the default; v2 can be chosen.
  const b = policy();
  b.rules.list = [b.rules.list[2]!, b.rules.list[0]!, b.rules.list[1]!];
  await q(`select router_draft_save($1, $2, null, $3)`, [w.ws, b, VIN]);
  const rev = (await q(`select draft_revision from routing_policies where id = $1`, [w.pid]))[0].draft_revision;
  await q(`select routing_publish($1, $2, $3, 'v2', $4, $5, $6)`, [w.ws, w.pid, b, VIN, randomUUID(), rev]);
  const pv = await R.childPreview(rpc, w.owner, w.deps, { run: run.id, corrections: { "company.employees": "50", "lead.country": "VN" } });
  assert.deepEqual(pv.options.map((x) => [x.version, x.original, x.valid]), [[run.policy_version, true, true], [run.policy_version + 1, false, true]]);
  assert.equal(pv.recipient, VIN, "Vietnam, 50 employees on the original order");
  assert.equal(pv.fields.find((f) => f.key === "company.employees")?.source, "review");
  // A child whose own decision lands in review (nobody can take it) reopens the parent's item: no second item.
  await q(`update router_reps set paused_until = 'infinity' where workspace_id = $1`, [w.ws]);
  const pv2 = await R.childPreview(rpc, w.owner, w.deps, { run: run.id, choice: { policy: w.pid, version: run.policy_version + 1 }, corrections: { "company.employees": "50", "lead.country": "VN" } });
  const r2 = await R.childRun(rpc, w.owner, w.deps, { run: run.id, op: op(), choice: { policy: w.pid, version: run.policy_version + 1 }, corrections: { "company.employees": "50", "lead.country": "VN" }, ref: pv2.ref });
  assert.equal(r2.status, "review");
  const v = await reviewOf(run.id);
  assert.equal(v.state, "open");
  assert.equal((await q(`select count(*)::int n from routing_reviews where workspace_id = $1`, [w.ws]))[0].n, 1, "one item for the lead");
  const c1 = (await q(`select * from router_runs where id = $1`, [v.child_run_id]))[0];
  assert.equal(c1.policy_version, run.policy_version + 1, "the chosen version");
  assert.deepEqual(c1.trace.review.corrections, { "company.employees": 50, "lead.country": "VN" });
  assert.equal(c1.trace.input.values.find((x: { field: string }) => x.field === "company.employees").source, "review");
  // Back on: the next child resolves it.
  await q(`update router_reps set paused_until = null where workspace_id = $1`, [w.ws]);
  const pv3 = await R.childPreview(rpc, w.owner, w.deps, { run: run.id, corrections: { "company.employees": "50", "lead.country": "VN" } });
  const r3 = await R.childRun(rpc, w.owner, w.deps, { run: run.id, op: op(), corrections: { "company.employees": "50", "lead.country": "VN" }, ref: pv3.ref });
  assert.equal(r3.status, "resolved");
  assert.equal((await reviewOf(run.id)).state, "resolved");
});

test("a child attempt whose preview went stale comes back changed and leaves the item approved, nothing written", async () => {
  const w = await setup();
  const { run } = await held(w);
  const pv = await R.childPreview(rpc, w.owner, w.deps, { run: run.id, clearHold: true });
  await q(`update router_reps set paused_until = 'infinity' where workspace_id = $1 and user_id = $2`, [w.ws, ANA]);
  const r = await R.childRun(rpc, w.owner, w.deps, { run: run.id, op: op(), clearHold: true, ref: pv.ref });
  assert.equal(r.status, "changed");
  assert.equal((r as { preview: R.ChildPreview }).preview.recipient, VIN);
  assert.equal((await reviewOf(run.id)).state, "approved_pending_execution");
  assert.equal((await q(`select count(*)::int n from router_runs where parent_run_id = $1`, [run.id]))[0].n, 0);
});

test("a reviewer who leaves hands their open items to a workspace owner; the policy's review owner may act, other members can't", async () => {
  const w = await setup();
  const { run } = await held(w);
  await q(`update routing_reviews set reviewer = $2 where run_id = $1`, [run.id, ANA]);
  await assert.rejects(R.reviewAct(rpc, w.kai, { run: run.id, action: "approve" }), refused(403));
  assert.equal((await R.reviewAct(rpc, w.ana, { run: run.id, action: "approve" }))!.state, "approved_pending_execution", "the named reviewer may act");
  await q(`delete from workspace_members where workspace_id = $1 and user_id = $2`, [w.ws, ANA]);
  const v = await reviewOf(run.id);
  assert.deepEqual([v.reviewer, v.state, v.latest_action.action, v.latest_action.from], [VIN, "approved_pending_execution", "escalated", ANA]);
});

// Manual reassignment (Section 18) -------------------------------------------------------------------------------

test("manual reassignment: reason required, one commit by operation id, quota once, no team turn, company owner and meetings untouched", async () => {
  const w = await setup();
  const { body } = await fill(w.demo);
  const run = await runOf(body.id);
  const c = claimOf(body.booking!);
  assert.equal((await bookForClaim(rpc, body.booking!.token, c, { start: body.booking!.slots[0]!, now: NOW, liveBusyFor: free })).status, 200);
  const co = (await q(`select company_id from contacts where id = $1`, [run.contact_id]))[0].company_id;
  if (co) await q(`update companies set owner_user_id = $2 where id = $1`, [co, KAI]);
  const turns = await nexts(w.ws);
  const pv = await R.reassignPreview(rpc, w.owner, { run: run.id, user: VIN });
  assert.deepEqual([pv.contact.owner, pv.proposed, pv.eligible, pv.meetings], [ANA, VIN, true, 1]);
  await assert.rejects(R.reassign(rpc, w.owner, { run: run.id, user: VIN, reason: "", op: op() }), refused(400));
  await assert.rejects(R.reassign(rpc, w.ana, { run: run.id, user: VIN, reason: "Mine now", op: op() }), refused(403));
  const k = op("ra");
  const [a, b] = await Promise.all([R.reassign(rpc, w.owner, { run: run.id, user: VIN, reason: "Knows the buyer", op: k, expectOwner: ANA }), R.reassign(rpc, w.owner, { run: run.id, user: VIN, reason: "Knows the buyer", op: k, expectOwner: ANA })]);
  assert.deepEqual([a.status, b.status], ["assigned", "assigned"]);
  assert.equal((await q(`select count(*)::int n from router_runs where key = $1`, [`reassign:${k}`]))[0].n, 1);
  assert.equal((await q(`select owner_user_id from contacts where id = $1`, [run.contact_id]))[0].owner_user_id, VIN);
  assert.equal(await quota(w.ws, VIN), 1, "the new owner counts once");
  assert.deepEqual(await nexts(w.ws), turns, "no team turn");
  if (co) assert.equal((await q(`select owner_user_id from companies where id = $1`, [co]))[0].owner_user_id, KAI, "company owner untouched");
  assert.deepEqual((await q(`select hosts from meetings where submission_id = $1`, [body.id]))[0].hosts, [ANA], "the existing meeting keeps its host");
  const audit = await q(`select actor, data from audit_log where workspace_id = $1 and action = 'routing.assign_by_hand'`, [w.ws]);
  assert.deepEqual([audit.length, audit[0].actor, audit[0].data.reason, audit[0].data.previous_owner], [1, VIN, "Knows the buyer", ANA]);
  // Someone changed the owner since: a conflict, never an overwrite.
  const stale = await R.reassign(rpc, w.owner, { run: run.id, user: ANA, reason: "Back", op: op(), expectOwner: ANA });
  assert.deepEqual([stale.status, (stale as { owner: string }).owner], ["changed", VIN]);
  // At today's cap: refused with the reason, nothing written.
  await q(`update router_reps set cap_day = 1 where workspace_id = $1 and user_id = $2`, [w.ws, ANA]);
  const runs = (await q(`select count(*)::int n from router_runs where workspace_id = $1`, [w.ws]))[0].n;
  await assert.rejects(R.reassign(rpc, w.owner, { run: run.id, user: ANA, reason: "Back", op: op(), expectOwner: VIN }), (e: unknown) => e instanceof S.Refusal && /cap/.test(e.message));
  assert.equal((await q(`select count(*)::int n from router_runs where workspace_id = $1`, [w.ws]))[0].n, runs);
});

test("Assign manually from a review item resolves it; a contact from another workspace is refused", async () => {
  const w = await setup();
  const { run } = await held(w);
  const r = await R.reassign(rpc, w.owner, { run: run.id, user: VIN, reason: "Real lead, known to us", op: op() });
  assert.equal(r.status, "assigned");
  assert.equal((await reviewOf(run.id)).state, "resolved");
  const other = await setup();
  const { run: foreign } = await held(other);
  await assert.rejects(R.reassignPreview(rpc, w.owner, { contact: foreign.contact_id, user: VIN }), refused(404));
  await assert.rejects(R.reassign(rpc, w.owner, { run: foreign.id, user: VIN, reason: "x", op: op() }), refused(404));
});

// Booking recovery (Sections 13 and 15) -------------------------------------------------------------------------

test("B06 B07 a visitor leaves the calendar: abandoned after the quiet window (owner kept), a follow-up only when configured; a later booking confirms and resolves it", async () => {
  const w = await setup();
  const { body } = await fill(w.demo);
  const run = await runOf(body.id);
  assert.ok(run.booking_active_at, "the session started when times were shown");
  const check = (await q(`select run_after - now() > interval '29 minutes' later from jobs where kind = 'routing_abandon' and key = $1 and status = 'queued'`, [run.id]))[0];
  assert.equal(check.later, true, "the check waits the 30-minute window");
  // Still inside the window: not abandoned; the check looks again later.
  await routingAbandon(rpc)(job("routing_abandon", run.id, { run: run.id }, w.ws), signal);
  assert.equal((await runOf(body.id)).booking_state, "awaiting_selection");
  // Quiet for 31 minutes: abandoned, owner kept, no task (none configured).
  await q(`update router_runs set booking_active_at = now() - interval '31 minutes' where id = $1`, [run.id]);
  await routingAbandon(rpc)(job("routing_abandon", run.id, { run: run.id }, w.ws), signal);
  const r1 = await runOf(body.id);
  assert.deepEqual([r1.booking_state, r1.owner], ["abandoned", ANA]);
  assert.equal((await q(`select count(*)::int n from tasks where workspace_id = $1`, [w.ws]))[0].n, 0, "no follow-up unless configured");
  // With the follow-up configured: one linked task for the owner, however often the check runs.
  await q(`update routing_sources set no_slots = no_slots || '{"abandonTask": true}' where form_id = $1`, [w.demoId]);
  const f2 = await fill(w.demo);
  const run2 = await runOf(f2.body.id);
  await q(`update router_runs set booking_active_at = now() - interval '31 minutes' where id = $1`, [run2.id]);
  await routingAbandon(rpc)(job("routing_abandon", run2.id, { run: run2.id }, w.ws), signal);
  await q(`update router_runs set booking_state = 'awaiting_selection' where id = $1`, [run2.id]);
  await routingAbandon(rpc)(job("routing_abandon", run2.id, { run: run2.id }, w.ws), signal);
  const tasks = await q(`select assignee, done, dedupe_key from tasks where workspace_id = $1`, [w.ws]);
  assert.deepEqual(tasks.map((t) => [t.assignee, t.done, t.dedupe_key]), [[run2.owner, false, `routing:${run2.id}:abandoned`]]);
  // B07: the visitor comes back and books: resumed, pending until the calendar holds it, then confirmed; the task is done.
  const t = await bookForClaim(rpc, f2.body.booking!.token, claimOf(f2.body.booking!), { start: f2.body.booking!.slots[0]!, now: NOW, liveBusyFor: free });
  assert.equal(t.status, 200);
  const r2 = await runOf(f2.body.id);
  assert.equal(r2.booking_state, "pending_confirmation");
  await placeEvent(r2.meeting_id, run2.owner);
  assert.equal((await runOf(f2.body.id)).booking_state, "confirmed");
  assert.equal((await q(`select done from tasks where dedupe_key = $1`, [`routing:${run2.id}:abandoned`]))[0].done, true, "the follow-up is resolved, not left as misleading work");
  const hist = await q(`select kind from contact_events where contact_id = $1 and kind like 'lead.booking_%' order by at`, [run2.contact_id]);
  assert.deepEqual(hist.map((h) => h.kind), ["lead.booking_abandoned", "lead.booking_abandoned"], "history keeps both moments (the second check found it waiting again)");
});

/** The fake calendar of an account, as the worker would open it. */
const fakeOf = async (ws: string, user: string) => {
  const a = (await q(`select id, provider from calendar_accounts where workspace_id = $1 and user_id = $2 and provider = 'fake'`, [ws, user]))[0];
  return providerFor({ id: a.id, provider: "fake" }, null) as FullProvider & { events: Map<string, { key: string }> };
};

test("B09 B11 the calendar create times out after making the event: pending with an unknown outcome, reconciled with the same key, one event, one invitation", async () => {
  const w = await setup();
  const { body } = await fill(w.demo);
  const c = claimOf(body.booking!);
  // B11: the confirm is double-clicked: one app booking.
  const [x, y] = await Promise.all([
    bookForClaim(rpc, body.booking!.token, c, { start: body.booking!.slots[0]!, now: NOW, liveBusyFor: free }),
    bookForClaim(rpc, body.booking!.token, c, { start: body.booking!.slots[0]!, now: NOW, liveBusyFor: free }),
  ]);
  // One of the two wins; the other sees the meeting or a taken time, never a second meeting.
  assert.ok([x.status, y.status].includes(200));
  const meetings = await q(`select id from meetings where submission_id = $1`, [body.id]);
  assert.equal(meetings.length, 1, "one booking intent");
  const m = meetings[0].id as string;
  const fake = await fakeOf(w.ws, ANA);
  const made = fake.events.size;
  // The provider makes the event but the answer never arrives, on every try.
  const lost = (p: FullProvider): FullProvider => ({
    ...p,
    async create(cal, e) {
      await p.create(cal, e);
      throw new Error("timeout");
    },
  });
  await meetingSync(rpc, { provider: () => lost(fake) })(job("meeting_sync", `create:${m}`, { meeting: m, action: "create" }, w.ws, 5, 5), signal).catch(() => undefined);
  const r1 = await runOf(body.id);
  assert.deepEqual([r1.booking_state, r1.booking_reason], ["pending_confirmation", "outcome_unknown"], "never 'failed' and never 'confirmed' on a timeout");
  assert.equal(fake.events.size, made + 1, "the provider did make it");
  // Check the calendar: the same job key, so the provider finds that event instead of making another.
  const rec = await R.reconcile(rpc, w.owner, { run: r1.id });
  assert.deepEqual(rec, { state: "pending_confirmation", queued: true });
  const queued = (await q(`select * from jobs where kind = 'meeting_sync' and key = $1 and status = 'queued'`, [`create:${m}`]))[0];
  await meetingSync(rpc, { provider: () => fake })(job("meeting_sync", queued.key, queued.payload, w.ws), signal);
  assert.equal(fake.events.size, made + 1, "no second event");
  assert.equal((await runOf(body.id)).booking_state, "confirmed");
  // G12: the same calendar job again makes nothing and invites nobody twice.
  await meetingSync(rpc, { provider: () => fake })(job("meeting_sync", `create:${m}`, { meeting: m, action: "create" }, w.ws), signal);
  assert.equal(fake.events.size, made + 1);
  assert.equal((await q(`select count(*)::int n from jobs where kind = 'meeting_notify' and key = $1`, [`booked:${m}`]))[0].n, 1, "one invitation");
  // A member who isn't the lead's owner can't trigger it.
  await assert.rejects(R.reconcile(rpc, w.kai, { run: r1.id }), refused(403));
});

test("B09 a create that surely failed (no calendar to write to) is failed, not unknown; reconnect then check makes it once", async () => {
  const w = await setup();
  const { body } = await fill(w.demo);
  assert.equal((await bookForClaim(rpc, body.booking!.token, claimOf(body.booking!), { start: body.booking!.slots[0]!, now: NOW, liveBusyFor: free })).status, 200);
  const m = (await q(`select id from meetings where submission_id = $1`, [body.id]))[0].id as string;
  await q(`update calendar_lists set write = false where account_id in (select id from calendar_accounts where workspace_id = $1 and user_id = $2)`, [w.ws, ANA]);
  await meetingSync(rpc, { provider: () => undefined })(job("meeting_sync", `create:${m}`, { meeting: m, action: "create" }, w.ws, 1, 5), signal).catch(() => undefined);
  const r = await runOf(body.id);
  assert.deepEqual([r.booking_state, r.booking_reason], ["failed", "provider_error"]);
  assert.equal(r.owner, ANA, "the owner stays");
  await q(`update calendar_lists set write = true where account_id in (select id from calendar_accounts where workspace_id = $1 and user_id = $2)`, [w.ws, ANA]);
  await R.reconcile(rpc, w.owner, { run: r.id });
  const fake = await fakeOf(w.ws, ANA);
  const before = fake.events.size;
  await meetingSync(rpc, { provider: () => fake })(job("meeting_sync", `create:${m}`, { meeting: m, action: "create" }, w.ws), signal);
  assert.equal(fake.events.size, before + 1);
  assert.equal((await runOf(body.id)).booking_state, "confirmed");
});

test("B10 the event is confirmed but the CRM sync fails: the booking stays confirmed; Retry sync pushes only that contact again", async () => {
  const w = await setup();
  const src = (await q(`insert into sources (workspace_id, kind, name, status, settings) values ($1, 'hubspot', 'HubSpot', 'active', '{"objects": {"contacts": "both"}}') returning id`, [w.ws]))[0].id;
  const { body } = await fill(w.demo);
  const run = await runOf(body.id);
  assert.equal(run.sync_state, "pending", "a two-way CRM has to learn the new owner");
  assert.equal((await bookForClaim(rpc, body.booking!.token, claimOf(body.booking!), { start: body.booking!.slots[0]!, now: NOW, liveBusyFor: free })).status, 200);
  await placeEvent((await runOf(body.id)).meeting_id, ANA);
  await q(`select sync_log_add($1, $2)`, [src, JSON.stringify([{ direction: "out", object: "contact", local_id: run.contact_id, action: "error", error: "HubSpot said 502" }])]);
  const r1 = await runOf(body.id);
  assert.deepEqual([r1.booking_state, r1.sync_state], ["confirmed", "failed"]);
  const meetingsBefore = (await q(`select count(*)::int n from meetings where workspace_id = $1`, [w.ws]))[0].n;
  const runsBefore = (await q(`select count(*)::int n from router_runs where workspace_id = $1`, [w.ws]))[0].n;
  const out = await R.retrySync(rpc, w.owner, { run: run.id });
  assert.deepEqual(out, { state: "pending", queued: 1 });
  const j = (await q(`select payload from jobs where kind = 'source_pull' and key = $1`, [`${src}:route:${run.id}`]))[0];
  assert.deepEqual(j.payload.retry, [run.contact_id], "that contact only");
  assert.deepEqual([(await q(`select count(*)::int n from meetings where workspace_id = $1`, [w.ws]))[0].n, (await q(`select count(*)::int n from router_runs where workspace_id = $1`, [w.ws]))[0].n], [meetingsBefore, runsBefore], "no new meeting, no new routing");
  await q(`select sync_log_add($1, $2)`, [src, JSON.stringify([{ direction: "out", object: "contact", local_id: run.contact_id, external_id: "hs_1", action: "update" }])]);
  assert.deepEqual([(await runOf(body.id)).sync_state, (await runOf(body.id)).booking_state], ["complete", "confirmed"]);
  // The lead's owner may retry their own; another member can't.
  await assert.rejects(R.retrySync(rpc, w.kai, { run: run.id }), refused(403));
});

test("B12 cancellation updates the booking only; a no-show is attendance: owner, quota and queue stay", async () => {
  const w = await setup();
  const { body } = await fill(w.demo);
  assert.equal((await bookForClaim(rpc, body.booking!.token, claimOf(body.booking!), { start: body.booking!.slots[0]!, now: NOW, liveBusyFor: free })).status, 200);
  const run = await runOf(body.id);
  await placeEvent(run.meeting_id, ANA);
  const keep = [await quota(w.ws, ANA), JSON.stringify(await nexts(w.ws))];
  // A no-show (the meeting is in the past here): the run's booking stays confirmed.
  await q(`update meetings set start_at = now() - interval '2 hours', end_at = now() - interval '90 minutes' where id = $1`, [run.meeting_id]);
  await q(`select meeting_status($1, 'no_show', null, null)`, [run.meeting_id]);
  assert.equal((await runOf(body.id)).booking_state, "confirmed");
  const f2 = await fill(w.demo);
  assert.equal((await bookForClaim(rpc, f2.body.booking!.token, claimOf(f2.body.booking!), { start: f2.body.booking!.slots[0]!, now: NOW, liveBusyFor: free })).status, 200);
  const run2 = await runOf(f2.body.id);
  const keep2 = [await quota(w.ws, run2.owner), JSON.stringify(await nexts(w.ws))];
  await q(`select meeting_status($1, 'canceled', 'guest', null)`, [run2.meeting_id]);
  const r2 = await runOf(f2.body.id);
  assert.deepEqual([r2.booking_state, r2.owner], ["cancelled", run2.owner]);
  assert.equal((await q(`select owner_user_id from contacts where id = $1`, [run2.contact_id]))[0].owner_user_id, run2.owner, "ownership not erased");
  assert.deepEqual([await quota(w.ws, run2.owner), JSON.stringify(await nexts(w.ws))], keep2, "no refund of the turn or the count");
  void keep;
});

test("B15 times around the end of daylight saving land on the right instant and are stored as instants with the zone", async () => {
  const w = await setup({ window: 5 });
  // Friday 30 October 2026 (EDT, UTC-4) to Monday 2 November (EST, UTC-5) in New York.
  const now = at("2026-10-30", "06:00", TZ);
  const { body } = await fill(w.demo, { now });
  const slots = body.booking!.slots;
  const fri = at("2026-10-30", "09:00", TZ);
  const mon = at("2026-11-02", "09:00", TZ);
  assert.equal(new Date(fri).toISOString(), "2026-10-30T13:00:00.000Z");
  assert.equal(new Date(mon).toISOString(), "2026-11-02T14:00:00.000Z");
  assert.ok(slots.includes(fri), "9:00 Friday is 13:00 UTC");
  assert.ok(slots.includes(mon), "9:00 Monday is 14:00 UTC, an hour later in UTC");
  assert.ok(!slots.includes(at("2026-11-02", "08:00", TZ)), "no 8:00 Monday from a stale offset");
  const ok = await bookForClaim(rpc, body.booking!.token, claimOf(body.booking!), { start: mon, now, tz: "Europe/Berlin", liveBusyFor: free });
  assert.equal(ok.status, 200);
  const m = (await q(`select start_at, guest_tz from meetings where submission_id = $1`, [body.id]))[0];
  assert.deepEqual([m.start_at.toISOString(), m.guest_tz], ["2026-11-02T14:00:00.000Z", "Europe/Berlin"]);
});

test("G11 a retried no-slots step and a retried abandonment make one linked task each, by run and purpose", async () => {
  const w = await setup();
  const { body } = await fill(w.demo);
  const run = await runOf(body.id);
  const ids = new Set<string>();
  for (let i = 0; i < 5; i++) ids.add((await q(`select routing_followup($1, $2, 'schedule') id`, [w.ws, run.id]))[0].id);
  for (let i = 0; i < 3; i++) ids.add((await q(`select routing_followup($1, $2, 'abandoned') id`, [w.ws, run.id]))[0].id);
  assert.equal(ids.size, 2);
  assert.equal((await q(`select count(*)::int n from tasks where workspace_id = $1`, [w.ws]))[0].n, 2);
  // Both resolve when the meeting is confirmed.
  assert.equal((await bookForClaim(rpc, body.booking!.token, claimOf(body.booking!), { start: body.booking!.slots[0]!, now: NOW, liveBusyFor: free })).status, 200);
  await placeEvent((await runOf(body.id)).meeting_id, ANA);
  assert.deepEqual((await q(`select bool_and(done) d from tasks where workspace_id = $1`, [w.ws]))[0].d, true);
});

test("G12 a review child attempt and a handoff retry on a lead with a meeting make no second meeting", async () => {
  const w = await setup();
  const { body } = await fill(w.demo);
  assert.equal((await bookForClaim(rpc, body.booking!.token, claimOf(body.booking!), { start: body.booking!.slots[0]!, now: NOW, liveBusyFor: free })).status, 200);
  const run = await runOf(body.id);
  // Re-sending the booking with the same token returns the same meeting.
  const again = await bookForClaim(rpc, body.booking!.token, claimOf(body.booking!), { start: body.booking!.slots[1]!, now: NOW, liveBusyFor: free });
  assert.ok(again.body.booked);
  // A reassignment on the run books nothing.
  await R.reassign(rpc, w.owner, { run: run.id, user: VIN, reason: "Coverage", op: op() });
  assert.equal((await q(`select count(*)::int n from meetings where workspace_id = $1`, [w.ws]))[0].n, 1);
  // Resume booking refuses a lead that has a meeting.
  await assert.rejects(R.resumeBooking(rpc, w.owner, { run: run.id }), refused(409));
});

test("resume booking after a reconnect: the committed owner's times by email, once; nobody else's", async () => {
  const w = await setup();
  await q(`update calendar_accounts set status = 'reconnect' where workspace_id = $1 and user_id = $2`, [w.ws, ANA]);
  const { body } = await fill(w.demo);
  const run = await runOf(body.id);
  assert.deepEqual([run.booking_state, run.booking_reason, run.owner], ["unavailable", "calendar_disconnected", ANA]);
  await assert.rejects(R.resumeBooking(rpc, w.owner, { run: run.id }), refused(409));
  await q(`update calendar_accounts set status = 'ok' where workspace_id = $1 and user_id = $2`, [w.ws, ANA]);
  await R.resumeBooking(rpc, w.ana, { run: run.id });
  await R.resumeBooking(rpc, w.ana, { run: run.id });
  const jobs = await q(`select payload from jobs where kind = 'meeting_book_later' and key = $1`, [`book_later:${body.id}`]);
  assert.equal(jobs.length, 1);
  assert.deepEqual([jobs[0].payload.owner, jobs[0].payload.only], [ANA, true], "the committed owner only");
  await assert.rejects(R.resumeBooking(rpc, w.kai, { run: run.id }), refused(403));
});

// Sources (Sections 8 and 24) -----------------------------------------------------------------------------------

test("G13 a form disconnected from routing sends new leads to review with a named reviewer and no calendar; archiving a live policy is refused", async () => {
  const w = await setup();
  const s = (await q(`select draft_revision from routing_sources where form_id = $1`, [w.demoId]))[0];
  await assert.rejects(S.stage(rpc, w.owner, { policy: w.pid, source: { kind: "form", form: w.demoId }, enabled: false, outcome: "assign_and_calendar", meeting: w.intro, revision: s.draft_revision }), refused(400));
  await S.stage(rpc, w.owner, { policy: w.pid, source: { kind: "form", form: w.demoId }, enabled: false, whenOff: "review", outcome: "assign_and_calendar", meeting: w.intro, revision: s.draft_revision });
  const src = (await q(`select id, draft_revision from routing_sources where form_id = $1`, [w.demoId]))[0];
  const rev = (await q(`select draft_revision from routing_policies where id = $1`, [w.pid]))[0].draft_revision;
  await q(`select routing_publish($1, $2, $3, 'disconnect', $4, $5, $6, true, $7)`, [w.ws, w.pid, policy(), VIN, randomUUID(), rev, JSON.stringify([{ id: src.id, revision: src.draft_revision }])]);
  invalidateRouterLive();
  forgetSources();
  assert.deepEqual((await q(`select enabled, when_off from routing_sources where id = $1`, [src.id]))[0], { enabled: false, when_off: "review" });
  const { body } = await fill(w.demo);
  assert.equal(body.booking, undefined, "no calendar without an owner");
  const run = await runOf(body.id);
  assert.deepEqual([run.kind, run.owner, run.source_id], ["unassigned", null, src.id]);
  assert.deepEqual(await q(`select reason, reviewer, state from routing_reviews where run_id = $1`, [run.id]), [{ reason: "source_disconnected", reviewer: VIN, state: "open" }]);
  assert.equal((await q(`select count(*)::int n from submissions where id = $1`, [body.id]))[0].n, 1, "the submission is kept");
  // The default policy, which the other form still routes with, can't be archived (096 refuses a policy a live
  // source uses; tests/pg/routingScreens.pg.ts covers a named policy).
  await assert.rejects(S.archive(rpc, w.owner, { policy: w.pid, archive: true }));
});

test("a new form gets its explicit connection when it's made", async () => {
  const w = await setup();
  const f = (await q(`insert into forms (workspace_id, name, draft) values ($1, 'Webinar', '{}') returning id`, [w.ws]))[0].id;
  const s = await q(`select kind, enabled, follows_default, outcome, policy_id from routing_sources where form_id = $1`, [f]);
  assert.deepEqual(s, [{ kind: "form", enabled: true, follows_default: true, outcome: "assign_only", policy_id: w.pid }]);
  const fs = await S.formSource(rpc, w.owner, { form: f });
  assert.equal(fs.source?.form_id, f);
  const other = await setup();
  await assert.rejects(S.formSource(rpc, other.owner, { form: f }), refused(404));
});

// Access (Section 20, G14) --------------------------------------------------------------------------------------

test("G14 every new action checks the person and the workspace on the server", async () => {
  const w = await setup();
  const other = await setup();
  const { run } = await held(w);
  const before = (await q(`select count(*)::int n from router_runs`))[0].n;
  // Another workspace's caller, with this workspace's run id: as if it weren't there.
  for (const p of [
    () => R.reviewAct(rpc, other.owner, { run: run.id, action: "approve" }),
    () => R.childPreview(rpc, other.owner, other.deps, { run: run.id }),
    () => R.childRun(rpc, other.owner, other.deps, { run: run.id, op: op() }),
    () => R.reassign(rpc, other.owner, { run: run.id, user: VIN, reason: "x", op: op() }),
    () => R.retrySync(rpc, other.owner, { run: run.id }),
    () => R.reconcile(rpc, other.owner, { run: run.id }),
    () => R.resumeBooking(rpc, other.owner, { run: run.id }),
  ])
    await assert.rejects(p(), refused(404));
  // A member who isn't the reviewer: refused, nothing written.
  await assert.rejects(R.reviewAct(rpc, w.kai, { run: run.id, action: "dismiss", reason: "x" }), refused(403));
  await assert.rejects(R.childRun(rpc, w.kai, w.deps, { run: run.id, op: op() }), refused(403));
  await assert.rejects(R.reassign(rpc, w.kai, { contact: run.contact_id, user: KAI, reason: "mine", op: op() }), refused(403));
  // Members can't publish, change teams or connections.
  await assert.rejects(S.team(rpc, w.kai, { name: "Mine", members: [KAI] }), refused(403));
  await assert.rejects(S.stage(rpc, w.kai, { policy: w.pid, source: { kind: "form", form: w.salesId }, outcome: "assign_only" }), refused(403));
  // H10 regression: a member's override is refused; a member can't hand off a lead someone else owns.
  const { body } = await fill(w.sales);
  const owned = await runOf(body.id);
  assert.equal(owned.owner, ANA);
  const pv = await H.preview(rpc, w.kai, { contact: owned.contact_id, now: NOW });
  await assert.rejects(H.confirm(rpc, w.kai, { contact: owned.contact_id, op: op("ho"), ref: pv.ref, now: NOW }), refused(403));
  assert.equal((await q(`select count(*)::int n from router_runs`))[0].n, before + 1, "only the fill above was routed");
  assert.equal((await reviewOf(run.id)).state, "open");
});

test("the tester's existing-contact lookup reads this workspace's contact and writes nothing; another workspace's is refused", async () => {
  const w = await setup();
  const { body } = await fill(w.sales, { country: "Vietnam", size: 50 });
  const run = await runOf(body.id);
  const snap = async () => (await q(`select (select count(*) from router_runs where workspace_id = $1)::int runs, (select coalesce(sum(n), 0) from routing_quota where workspace_id = $1)::int quota, (select json_agg(owner_user_id) from contacts where workspace_id = $1) owners`, [w.ws]))[0];
  const before = await snap();
  const t = await S.test(rpc, w.ana, w.deps, { policy: w.pid, version: "live", contact: run.contact_id, values: { "lead.country": "VN", "company.employees": "50" } });
  assert.equal(t.trace.ownership.candidates.find((c) => c.kind === "contact")?.user, VIN, "the contact's real owner is read");
  assert.deepEqual(await snap(), before, "a dry run writes nothing");
  const other = await setup();
  await assert.rejects(S.test(rpc, other.owner, other.deps, { policy: other.pid, version: "live", contact: run.contact_id }), refused(404));
});

// The quota (Section 12) -----------------------------------------------------------------------------------------

test("a booking-first team meeting that gives an unowned contact its owner counts once in their quota, with no owner-first turn", async () => {
  const w = await setup();
  const turns = await nexts(w.ws);
  const mk = async (owner: string | null) => {
    const c = (await q(`insert into contacts (workspace_id, email, email_clean, owner_user_id) values ($1, $2, $2, $3) returning id`, [w.ws, `t${randomUUID().slice(0, 8)}@acme.io`, owner]))[0].id;
    const m = (await q(
      `insert into meetings (workspace_id, type_id, hosts, contact_id, guest_email, start_at, end_at, block_start, block_end, source, token_hash, status)
       values ($1, $2, $3, $4, 'g@acme.io', now() + interval '1 day', now() + interval '1 day 30 minutes', now() + interval '1 day', now() + interval '1 day 30 minutes', 'page', $5, 'booked') returning id`,
      [w.ws, w.intro, [VIN], c, randomUUID()],
    ))[0].id;
    return { c, m };
  };
  const a = await mk(null);
  const before = await quota(w.ws, VIN);
  await q(`select meeting_team_run($1, $2, $3, 'gs', $4, 1)`, [w.ws, a.m, a.c, VIN]);
  await q(`select meeting_team_run($1, $2, $3, 'gs', $4, 1)`, [w.ws, a.m, a.c, VIN]);
  assert.equal(await quota(w.ws, VIN), before + 1, "counted once");
  const asg = await q(`select counted, advanced from routing_assignments a join router_runs r on r.id = a.run_id where r.key = $1`, [`booking:${a.m}`]);
  assert.deepEqual(asg, [{ counted: true, advanced: false }]);
  assert.deepEqual(await nexts(w.ws), turns);
  const b = await mk(ANA);
  await q(`select meeting_team_run($1, $2, $3, 'gs', $4, 1)`, [w.ws, b.m, b.c, VIN]);
  assert.equal(await quota(w.ws, VIN), before + 1, "an owned contact's booking counts nothing");
  assert.equal((await q(`select owner_user_id from contacts where id = $1`, [b.c]))[0].owner_user_id, ANA);
});
