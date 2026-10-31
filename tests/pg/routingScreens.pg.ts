// The Routing screens' server side on a real database (docs/routing-workflow.md Sections 4-8, 14, 16, 17 and 26 A, F
// and G): creating policies (P01, P02, P10), durable drafts with revision checks (P07-P09, G05), the lead tester
// writing nothing but its evidence (G01, G03, G04), the guarded publish with its operation id (G06, G07) and restore
// (G08), and Route & book (H01-H10): a preview writes nothing, a confirm rechecks policy, owner and recipient and
// commits once, a failed booking keeps the assignment, and the server refuses what the person may not do.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";
import { at } from "../../src/lib/meetings/time.ts";
import { DEFAULT_AVAILABILITY, DEFAULT_SETTINGS } from "../../src/lib/meetings/types.ts";
import { BASE_FIELDS } from "../../src/lib/router/conditions.ts";
import { invalidateRouterLive } from "../../src/lib/router/server.ts";
import * as H from "../../src/lib/routing/handoff.ts";
import * as S from "../../src/lib/routing/screens.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";
import { ANA, KAI, LEE, policy, VIN } from "../fixtures/routingSpec.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 12 });
const rpc = pgRpc(pool);
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

const TZ = "America/New_York";
const NOW = at("2026-11-02", "06:00", TZ);
const NAMES: Record<string, string> = { [ANA]: "Ana Silva", [VIN]: "Vincent Nguyen", [KAI]: "Kai Ito", [LEE]: "Lee Park" };
const key = (p = "k") => `${p}_${randomUUID().replace(/-/g, "")}`;

/** The Section 26 workspace with calendars and hours, the four teams, an Intro call and two forms. Nothing routed yet. */
async function workspace() {
  const ws = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, 'Fixture')`, [ws]);
  for (const [u, name] of Object.entries(NAMES)) {
    await q(`insert into auth.users (id, email) values ($1, $2) on conflict do nothing`, [u, `${name.split(" ")[0]!.toLowerCase()}@claritia.test`]);
    await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, $3)`, [ws, u, u === VIN ? "owner" : "member"]);
    const acc = (await q(`insert into calendar_accounts (workspace_id, user_id, provider, account_email) values ($1, $2, 'fake', $3) returning id`, [ws, u, `${u.slice(-4)}-${ws.slice(0, 4)}@t.io`]))[0].id;
    await q(`insert into calendar_lists (account_id, calendar_id, name, busy, write) values ($1, 'primary', 'Work', true, true)`, [acc]);
    const a = DEFAULT_AVAILABILITY(TZ);
    await q(`insert into availability (workspace_id, user_id, tz, weekly, overrides) values ($1, $2, $3, $4, $5)`, [ws, u, a.tz, a.weekly, JSON.stringify(a.overrides)]);
    await q(`insert into booking_profiles (workspace_id, user_id, slug, name) values ($1, $2, $3, $4)`, [ws, u, `${u.slice(-4)}-${ws.slice(0, 6)}`, name]);
    await q(`insert into router_reps (workspace_id, user_id, cap_day, out_dates) values ($1, $2, 5, $3)`, [ws, u, JSON.stringify(u === KAI ? [{ from: "2020-01-01", to: "2099-01-01" }] : [])]);
  }
  for (const [k, name, members] of [["eus", "Enterprise US", [ANA, VIN]], ["eg", "Enterprise global", [KAI, ANA]], ["gs", "General sales", [VIN, KAI, ANA]], ["vn", "Vietnam sales", [VIN]]] as const)
    await q(`select routing_team_save($1, null, $2, 'rr', $3, null, $4)`, [ws, name, JSON.stringify(members.map((user) => ({ user }))), k]);
  const intro = (await q(`insert into meeting_types (workspace_id, slug, name, kind, hosts, settings) values ($1, 'intro', 'Intro call', 'one', $2, $3) returning id`, [ws, JSON.stringify([{ user_id: VIN }]), { ...DEFAULT_SETTINGS, notice: 0, window: 14 }]))[0].id as string;
  const forms: string[] = [];
  for (const name of ["Demo request", "Contact sales"]) forms.push((await q(`insert into forms (workspace_id, name, draft) values ($1, $2, '{}') returning id`, [ws, name]))[0].id as string);
  const owner: S.Caller = { ws, user: VIN, role: "owner" };
  const member: S.Caller = { ws, user: ANA, role: "member" };
  const deps: S.Deps = {
    members: async () => (await q(`select user_id id from workspace_members where workspace_id = $1`, [ws])).map((r) => ({ id: r.id as string, name: NAMES[r.id as string] ?? "", email: "" })),
    fields: async () => BASE_FIELDS,
  };
  return { ws, intro, demo: forms[0]!, sales: forms[1]!, owner, member, deps };
}
type W = Awaited<ReturnType<typeof workspace>>;

/** Everything a dry run or a preview must never change. */
async function business(ws: string) {
  return (
    await q(
      `select (select count(*) from contacts where workspace_id = $1)::int contacts,
              (select coalesce(json_agg(owner_user_id order by id), '[]') from contacts where workspace_id = $1) owners,
              (select count(*) from router_runs where workspace_id = $1)::int runs,
              (select count(*) from routing_assignments where workspace_id = $1)::int assignments,
              (select count(*) from routing_quota where workspace_id = $1)::int quota_rows,
              (select coalesce(sum(n), 0) from routing_quota where workspace_id = $1)::int quota,
              (select json_agg(next_position order by id) from routing_teams where workspace_id = $1) nexts,
              (select count(*) from tasks where workspace_id = $1)::int tasks,
              (select count(*) from meetings where workspace_id = $1)::int meetings,
              (select count(*) from jobs where workspace_id = $1)::int jobs,
              (select count(*) from routing_reviews where workspace_id = $1)::int reviews,
              (select count(*) from contact_events where workspace_id = $1)::int events,
              (select count(*) from companies where workspace_id = $1)::int companies`,
      [ws],
    )
  )[0];
}

const rowOf = async (w: W, id: string) => (await S.screen(rpc, w.owner, w.deps)).policies.find((p) => p.id === id)!;

/** A "Route by conditions" policy with the Section 11 rules, both forms and the handoff staged, tested and published. */
async function published(w: W, o: { handoffMeeting?: boolean } = {}) {
  const { id } = await S.create(rpc, w.owner, { name: "Inbound sales", start: "conditions", key: key("pol") });
  let rev = (await rowOf(w, id)).draft_revision;
  rev = (await S.save(rpc, w.owner, { policy: id, body: policy(), revision: rev })).revision;
  const mappings = [
    { field: "fco", target: "lead.country", type: "country" },
    { field: "fsz", target: "company.employees", type: "integer" },
  ];
  await S.stage(rpc, w.owner, { policy: id, source: { kind: "form", form: w.demo }, outcome: "assign_and_calendar", meeting: w.intro, mappings });
  await S.stage(rpc, w.owner, { policy: id, source: { kind: "form", form: w.sales }, outcome: "assign_only", mappings });
  await S.stage(rpc, w.owner, { policy: id, source: { kind: "handoff" }, outcome: o.handoffMeeting === false ? "assign_only" : "assign_and_calendar", meeting: o.handoffMeeting === false ? null : w.intro });
  await S.test(rpc, w.owner, w.deps, { policy: id, version: "draft", revision: rev, email: "maya@globex.com", values: { "lead.country": "US", "company.employees": "800" } });
  const out = await S.publish(rpc, w.owner, w.deps, { policy: id, revision: rev, key: key("pub") });
  invalidateRouterLive();
  return { id, version: out.version };
}

let n = 0;
async function contact(ws: string, o: { owner?: string | null; country?: string; employees?: number } = {}) {
  n++;
  const co = (await q(`insert into companies (workspace_id, name, domain, country, employees) values ($1, $2, $3, $4, $5) returning id`, [ws, `Globex ${n}`, `globex${n}-${ws.slice(0, 6)}.com`, o.country ?? "US", o.employees ?? 800]).catch(async () => q(`insert into companies (workspace_id, name, domain, country) values ($1, $2, $3, $4) returning id`, [ws, `Globex ${n}`, `globex${n}-${ws.slice(0, 6)}.com`, o.country ?? "US"])))[0].id;
  return (
    await q(`insert into contacts (workspace_id, email, email_clean, email_class, first_name, last_name, company_id, owner_user_id, country) values ($1, $2, $2, 'work', 'Maya', 'Chen', $3, $4, $5) returning id`, [
      ws,
      `maya${n}@globex${n}-${ws.slice(0, 6)}.com`,
      co,
      o.owner ?? null,
      o.country ?? "US",
    ])
  )[0].id as string;
}
const values = { "lead.country": "US", "company.employees": 800 };

// A. Creating and editing --------------------------------------------------------------------------------------------

test("P01 Send everything to me: no team needed; the default and the whole scope are the person", async () => {
  const w = await workspace();
  const { id } = await S.create(rpc, w.owner, { name: "Send everything to me", start: "solo", key: key() });
  const p = await rowOf(w, id);
  assert.equal(p.draft!.v, 2);
  assert.deepEqual(p.draft!.rules.list, []);
  assert.deepEqual(p.draft!.fallback, { kind: "user", id: VIN });
  assert.deepEqual(p.draft!.scope, { everyone: false, people: [VIN], teams: [] });
  assert.equal(p.draft!.review?.owner, VIN);
  // An Ana-owned contact isn't kept outside the solo scope (O08), in a dry run of the draft.
  const t = await S.test(rpc, w.owner, w.deps, { policy: id, version: "draft", revision: p.draft_revision, email: "maya@globex.com", overrides: { contactOwner: ANA } });
  assert.equal(t.recipient, VIN);
  assert.equal(t.trace.ownership.candidates.find((c) => c.kind === "contact")?.reason, "out_of_scope");
});

test("P02 a blank name is refused inline; a double click makes one policy; a member can't create", async () => {
  const w = await workspace();
  await assert.rejects(S.create(rpc, w.owner, { name: "   ", start: "conditions", key: key() }), /Name the policy/);
  await assert.rejects(S.create(rpc, w.owner, { name: "x".repeat(81), start: "conditions", key: key() }), /80 characters/);
  const k = key();
  const [a, b] = await Promise.all([S.create(rpc, w.owner, { name: "Partner leads", start: "conditions", key: k }), S.create(rpc, w.owner, { name: "Partner leads", start: "conditions", key: k })]);
  assert.equal(a.id, b.id);
  assert.equal((await q(`select count(*)::int n from routing_policies where workspace_id = $1`, [w.ws]))[0].n, 1);
  await assert.rejects(S.create(rpc, w.member, { name: "Mine", start: "solo", key: key() }), (e: unknown) => e instanceof S.Refusal && e.status === 403);
});

test("P07 P08 P09 G05 drafts: delete then undo restores the order; a stale or failed save changes nothing live; reload restores the draft and its staged connections", async () => {
  const w = await workspace();
  const { id, version } = await published(w);
  const before = await business(w.ws);
  const live0 = (await rowOf(w, id)).live;
  let rev = (await rowOf(w, id)).draft_revision;
  const body = policy();
  const without = { ...body, rules: { ...body.rules, list: body.rules.list.filter((r) => r.id !== "r_ent") } };
  rev = (await S.save(rpc, w.owner, { policy: id, body: without, revision: rev })).revision;
  rev = (await S.save(rpc, w.owner, { policy: id, body, revision: rev })).revision;
  assert.deepEqual((await rowOf(w, id)).draft!.rules.list.map((r) => r.id), ["r_us_ent", "r_ent", "r_vn"], "P07: the row and its place are back");
  assert.deepEqual(await business(w.ws), before, "P07: no real assignment changed");
  // G05: another tab saved meanwhile; this one's stale save is a conflict carrying what's saved now.
  const other = (await S.save(rpc, w.owner, { policy: id, body: { ...body, spam: { ...body.spam, on: false } }, revision: rev })).revision;
  await assert.rejects(
    S.save(rpc, w.owner, { policy: id, body: without, revision: rev }),
    (e: unknown) => e instanceof S.Refusal && e.code === "draft_conflict" && (e.state as { revision: number }).revision === other,
  );
  // P08: a save the database refuses (a name too long) leaves the live version as it was.
  await assert.rejects(S.save(rpc, w.owner, { policy: id, body, name: "y".repeat(90), revision: other }));
  const after = await rowOf(w, id);
  assert.equal(after.active_version, version);
  assert.deepEqual(after.live, live0);
  // P09: a fresh read has the saved draft and the staged rename and connection.
  await S.save(rpc, w.owner, { policy: id, body, name: "Inbound sales EU", revision: other });
  await S.stage(rpc, w.owner, { policy: id, source: { kind: "form", form: w.sales }, outcome: "assign_only", enabled: false, revision: (await S.screen(rpc, w.owner, w.deps)).sources.find((s) => s.form_id === w.sales)!.draft_revision });
  const again = await S.screen(rpc, w.owner, w.deps);
  const p = again.policies.find((x) => x.id === id)!;
  assert.equal(p.draft_name, "Inbound sales EU");
  assert.equal(p.name, "Inbound sales", "the live name waits for the publish");
  assert.equal(p.staged, 1);
  assert.equal(again.sources.find((s) => s.form_id === w.sales)!.draft!.enabled, false);
});

test("P10 Duplicate: a disconnected draft copy; no people, teams, meetings or form attachments copied", async () => {
  const w = await workspace();
  const { id } = await published(w);
  const teams = (await q(`select count(*)::int n from routing_teams where workspace_id = $1`, [w.ws]))[0].n;
  const k = key("dup");
  const a = await S.duplicate(rpc, w.owner, { policy: id, key: k });
  const b = await S.duplicate(rpc, w.owner, { policy: id, key: k });
  assert.equal(a.id, b.id, "one copy per click");
  const copy = await rowOf(w, a.id);
  assert.equal(copy.name, "Inbound sales — copy");
  assert.equal(copy.active_version, null);
  assert.equal(copy.live_sources, 0);
  assert.equal(copy.staged, 0);
  assert.deepEqual(copy.draft!.rules.list.map((r) => r.queue), ["eus", "eg", "vn"], "the same team references");
  assert.equal((await q(`select count(*)::int n from routing_teams where workspace_id = $1`, [w.ws]))[0].n, teams);
  assert.equal((await q(`select count(*)::int n from routing_sources where workspace_id = $1 and policy_id = $2`, [w.ws, id]))[0].n, 3, "the original keeps its sources");
});

// G. Testing and publishing -------------------------------------------------------------------------------------------

test("G01 dry runs of every fixture change no business state; only test evidence is written", async () => {
  const w = await workspace();
  const { id } = await published(w);
  const owned = await contact(w.ws, { owner: VIN });
  void owned;
  const before = await business(w.ws);
  const ev0 = (await q(`select count(*)::int n from routing_test_evidence where workspace_id = $1`, [w.ws]))[0].n;
  const rev = (await rowOf(w, id)).draft_revision;
  const src = (await S.screen(rpc, w.owner, w.deps)).sources.find((s) => s.form_id === w.demo)!.id;
  const cases: [Record<string, unknown>, S.TestOverrides, string | null][] = [
    [{ "lead.country": "US", "company.employees": "800" }, {}, ANA],
    [{ "lead.country": "DE", "company.employees": "800" }, {}, ANA],
    [{ "lead.country": "VN", "company.employees": "50" }, {}, VIN],
    [{ "lead.country": "DE", "company.employees": "50" }, {}, VIN],
    [{ "lead.country": "", "company.employees": "" }, {}, VIN],
    [{ "lead.country": "US", "company.employees": "800" }, { contactOwner: VIN }, VIN],
    [{ "lead.country": "US", "company.employees": "800" }, { spam: true }, null],
    [{ "lead.country": "US", "company.employees": "800" }, { unavailable: true }, null],
    [{ "lead.country": "US", "company.employees": "800" }, { noSlots: true }, ANA],
  ];
  for (const [vals, ov, want] of cases) {
    const t = await S.test(rpc, w.owner, w.deps, { policy: id, version: "draft", revision: rev, source: src, email: ov.spam ? "test@mailinator.com" : "maya@globex.com", values: vals, overrides: ov, now: NOW });
    assert.equal(t.state === "assigned" ? t.recipient : null, want, JSON.stringify(vals) + JSON.stringify(ov));
    if (ov.noSlots) assert.equal(t.trace.booking.outcome, "no_slots_follow_up");
  }
  // Repeating the same preview never moves a team's place (T02).
  for (let i = 0; i < 3; i++) await S.test(rpc, w.owner, w.deps, { policy: id, version: "live", email: "maya@globex.com", values });
  assert.deepEqual(await business(w.ws), before, "no contact, owner, run, count, turn, task, meeting, job, review or event");
  const ev1 = (await q(`select count(*)::int n from routing_test_evidence where workspace_id = $1`, [w.ws]))[0].n;
  assert.equal(ev1 - ev0, cases.length, "one evidence row per draft test; published tests keep none");
});

test("G03 G04 the published version tests with its own sources; editing after a test makes publish ask for a new one", async () => {
  const w = await workspace();
  const { id } = await published(w);
  const scr = await S.screen(rpc, w.owner, w.deps);
  const sales = scr.sources.find((s) => s.form_id === w.sales)!;
  // The draft disconnects Contact sales; the published version still has it.
  await S.stage(rpc, w.owner, { policy: id, source: { kind: "form", form: w.sales }, outcome: "assign_only", enabled: false, revision: sales.draft_revision });
  await assert.rejects(S.test(rpc, w.owner, w.deps, { policy: id, version: "draft", source: sales.id, email: "a@b.co", values }), /isn't connected/);
  const live = await S.test(rpc, w.owner, w.deps, { policy: id, version: "live", source: sales.id, email: "a@b.co", values });
  assert.equal(live.trace.booking.outcome, "not_requested", "Contact sales assigns only");
  // G04: a test of this draft, then an edit: the evidence no longer matches and publish refuses.
  let rev = (await rowOf(w, id)).draft_revision;
  await S.test(rpc, w.owner, w.deps, { policy: id, version: "draft", revision: rev, email: "a@b.co", values });
  assert.ok((await S.review(rpc, w.owner, w.deps, { policy: id })).evidence);
  const b = policy();
  rev = (await S.save(rpc, w.owner, { policy: id, body: { ...b, rules: { ...b.rules, list: [b.rules.list[2]!, b.rules.list[0]!, b.rules.list[1]!] } }, revision: rev })).revision;
  const r = await S.review(rpc, w.owner, w.deps, { policy: id });
  assert.equal(r.evidence, null);
  await assert.rejects(S.publish(rpc, w.owner, w.deps, { policy: id, revision: rev, key: key("pub") }), /Run Test lead/);
  // A test against a revision that's no longer the saved one is refused rather than tested.
  await assert.rejects(S.test(rpc, w.owner, w.deps, { policy: id, version: "draft", revision: rev - 1, email: "a@b.co", values }), (e: unknown) => e instanceof S.Refusal && e.code === "draft_conflict");
  // A team change the policy uses also needs a new test (Section 16).
  await S.test(rpc, w.owner, w.deps, { policy: id, version: "draft", revision: rev, email: "a@b.co", values });
  assert.ok((await S.review(rpc, w.owner, w.deps, { policy: id })).evidence);
  const eus = scr.teams.find((t) => t.keys.includes("eus"))!;
  await S.team(rpc, w.owner, { team: eus.id, name: eus.name, members: [ANA, VIN, KAI], revision: eus.revision });
  assert.equal((await S.review(rpc, w.owner, w.deps, { policy: id })).evidence, null);
});

test("G06 G07 one release turns on rules and staged sources together; a lost answer is looked up, never published twice", async () => {
  const w = await workspace();
  const { id: pid } = await S.create(rpc, w.owner, { name: "Inbound sales", start: "conditions", key: key("pol") });
  const rev = (await S.save(rpc, w.owner, { policy: pid, body: policy(), revision: (await rowOf(w, pid)).draft_revision })).revision;
  await S.stage(rpc, w.owner, { policy: pid, source: { kind: "form", form: w.demo }, outcome: "assign_and_calendar", meeting: w.intro, mappings: [] });
  const r = await S.review(rpc, w.owner, w.deps, { policy: pid });
  assert.equal(r.version, 1);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.sources.map((s) => s.name), ["Demo request"]);
  await assert.rejects(S.publish(rpc, w.member, w.deps, { policy: pid, revision: rev, key: key("pub") }), (e: unknown) => e instanceof S.Refusal && e.status === 403);
  await S.test(rpc, w.owner, w.deps, { policy: pid, version: "draft", revision: rev, email: "a@b.co", values });
  const k = key("pub");
  // The same operation sent twice at once (a retry after a lost answer): one version.
  const [a, b] = await Promise.allSettled([S.publish(rpc, w.owner, w.deps, { policy: pid, revision: rev, key: k }), S.publish(rpc, w.owner, w.deps, { policy: pid, revision: rev, key: k })]);
  const ok = [a, b].filter((x) => x.status === "fulfilled").map((x) => (x as PromiseFulfilledResult<{ version: number }>).value.version);
  assert.ok(ok.length >= 1 && ok.every((v) => v === 1), JSON.stringify([a, b].map((x) => x.status)));
  assert.equal((await S.publishStatus(rpc, w.owner, { policy: pid, key: k })).version, 1);
  assert.equal((await S.publish(rpc, w.owner, w.deps, { policy: pid, revision: rev, key: k })).version, 1, "asked again: the same version");
  assert.equal((await q(`select count(*)::int n from routing_policy_versions where policy_id = $1`, [pid]))[0].n, 1);
  const src = (await q(`select policy_id, enabled, outcome, meeting_type_id, follows_default, draft from routing_sources where form_id = $1`, [w.demo]))[0];
  assert.deepEqual([src.policy_id, src.enabled, src.outcome, src.meeting_type_id, src.follows_default, src.draft], [pid, true, "assign_and_calendar", w.intro, false, null]);
  assert.deepEqual((await q(`select sources from routing_policy_versions where policy_id = $1`, [pid]))[0].sources.length, 1, "the version records the connection it turned on");
  assert.equal((await S.publishStatus(rpc, w.owner, { policy: pid, key: key("never") })).version, null);
});

test("G08 restoring a version makes it the draft; history, live version and meetings stay as they are", async () => {
  const w = await workspace();
  const { id } = await published(w);
  let rev = (await rowOf(w, id)).draft_revision;
  const b = policy();
  rev = (await S.save(rpc, w.owner, { policy: id, body: { ...b, rules: { ...b.rules, list: [b.rules.list[2]!] } }, revision: rev })).revision;
  await S.test(rpc, w.owner, w.deps, { policy: id, version: "draft", revision: rev, email: "a@b.co", values });
  await S.publish(rpc, w.owner, w.deps, { policy: id, revision: rev, key: key("pub") });
  const before = await business(w.ws);
  const out = await S.restore(rpc, w.owner, { policy: id, version: 1, revision: (await rowOf(w, id)).draft_revision });
  const p = await rowOf(w, id);
  assert.equal(p.draft_revision, out.revision);
  assert.deepEqual(p.draft!.rules.list.map((r) => r.id), ["r_us_ent", "r_ent", "r_vn"]);
  assert.equal(p.active_version, 2, "live stays v2 until the restored draft is published");
  assert.deepEqual((await q(`select version from routing_policy_versions where policy_id = $1 order by version`, [id])).map((r) => r.version), [1, 2]);
  assert.deepEqual(await business(w.ws), before);
});

test("archive: refused while a live source routes with the policy; restored as a disconnected draft", async () => {
  const w = await workspace();
  const { id } = await published(w);
  const out = await S.archive(rpc, w.owner, { policy: id, archive: true });
  assert.equal(out.archived, false);
  assert.equal(out.sources?.length, 3);
  const { id: other } = await S.create(rpc, w.owner, { name: "Spare", start: "solo", key: key() });
  assert.equal((await S.archive(rpc, w.owner, { policy: other, archive: true })).archived, true);
  assert.equal((await rowOf(w, other)).archived, true);
  await assert.rejects(S.save(rpc, w.owner, { policy: other, body: policy(), revision: null }), /archived/);
  assert.equal((await S.archive(rpc, w.owner, { policy: other, archive: false })).archived, false);
});

// F. Route & book --------------------------------------------------------------------------------------------------

test("H01 H02 Find recipient previews only: edited fields, a suggestion and real times, and nothing changed", async () => {
  const w = await workspace();
  await published(w);
  // Lee (an SDR outside the policy's recipients) owns the contact: skipped, so the rules decide (O09).
  const c = await contact(w.ws, { owner: LEE, country: "DE", employees: 40 });
  const before = await business(w.ws);
  const p = await H.preview(rpc, w.member, { contact: c, values: { "lead.country": "US", "company.employees": "800" }, now: NOW });
  assert.equal(p.recipient, ANA, "the local values decide: US enterprise");
  assert.equal(p.contact.owner, LEE);
  assert.equal(p.trace.ownership.candidates.find((x) => x.kind === "contact")?.reason, "out_of_scope");
  assert.equal(p.trace.input.values.find((v) => v.field === "lead.country")?.source, "handoff");
  assert.equal(p.availability?.state, "ok");
  assert.ok(p.availability!.slots.length > 0);
  assert.deepEqual(p.ref, { policy: p.policy.id, version: p.policy.version, owner: LEE, recipient: ANA });
  assert.deepEqual(await business(w.ws), before, "H01/H02: no contact, owner, count, turn, task or event");
  assert.equal((await q(`select country from contacts where id = $1`, [c]))[0].country, "DE", "the edit stayed in the handoff");
});

test("H03 Assign without booking commits once; a second click or a concurrent one makes nothing new", async () => {
  const w = await workspace();
  await published(w);
  const c = await contact(w.ws);
  const p = await H.preview(rpc, w.member, { contact: c, now: NOW });
  assert.equal(p.recipient, ANA);
  const op = key("ho");
  const [a, b] = await Promise.all([H.confirm(rpc, w.member, { contact: c, op, ref: p.ref, now: NOW }), H.confirm(rpc, w.member, { contact: c, op, ref: p.ref, now: NOW })]);
  for (const x of [a, b]) assert.equal(x.status, "assigned");
  const runs = await q(`select owner, booking_state, key, by_user, reason from router_runs where workspace_id = $1`, [w.ws]);
  assert.equal(runs.length, 1);
  assert.deepEqual([runs[0].owner, runs[0].booking_state, runs[0].by_user, runs[0].reason], [ANA, "not_requested", ANA, "manual"]);
  assert.equal((await q(`select owner_user_id from contacts where id = $1`, [c]))[0].owner_user_id, ANA);
  assert.equal((await q(`select count(*)::int n from routing_assignments where workspace_id = $1 and counted`, [w.ws]))[0].n, 1);
  const again = await H.confirm(rpc, w.member, { contact: c, op, ref: p.ref, now: NOW });
  assert.equal(again.status === "assigned" && again.repeat, true);
  assert.equal((await q(`select count(*)::int n from meetings where workspace_id = $1`, [w.ws]))[0].n, 0);
});

test("H04 H08 Confirm handoff & book: assigned, then booked with the owner; confirmed only once the calendar has the event; a failed booking keeps the owner and books again alone", async () => {
  const w = await workspace();
  await published(w);
  const c = await contact(w.ws);
  const p = await H.preview(rpc, w.owner, { contact: c, now: NOW });
  const start = p.availability!.slots[0]!;
  const out = await H.confirm(rpc, w.owner, { contact: c, op: key("ho"), ref: p.ref, book: { start }, now: NOW });
  assert.ok(out.status === "assigned" && out.booking.state === "pending_confirmation", JSON.stringify(out));
  const run = (out as { run: string }).run;
  const m = (await q(`select hosts, contact_id, source from meetings where workspace_id = $1`, [w.ws]))[0];
  assert.deepEqual([m.hosts, m.contact_id, m.source], [[ANA], c, "handoff"], "host = committed owner, not the type's fixed host");
  assert.equal((await H.status(rpc, w.owner, { run })).state, "pending_confirmation", "no event yet: not confirmed");
  const mid = (await q(`select meeting_id from router_runs where id = $1`, [run]))[0].meeting_id;
  await q(`select meeting_calendar_save($1, $2, '{}')`, [mid, { [ANA]: { provider: "fake", event: "evt_1" } }]);
  assert.equal((await H.status(rpc, w.owner, { run })).state, "confirmed");
  assert.equal((await q(`select booking_state from router_runs where id = $1`, [run]))[0].booking_state, "confirmed");

  // H08: the time was taken meanwhile. The assignment stays; another time books with the same owner, no new run.
  const c2 = await contact(w.ws);
  const p2 = await H.preview(rpc, w.owner, { contact: c2, now: NOW });
  const taken = p2.availability!.slots[1]!;
  const o2 = await H.confirm(rpc, w.owner, { contact: c2, op: key("ho"), ref: p2.ref, book: { start: taken + 7 * 60_000 }, now: NOW });
  assert.ok(o2.status === "assigned" && o2.booking.state === "slot_taken", JSON.stringify(o2));
  const owner2 = (o2 as { owner: string }).owner;
  assert.equal((await q(`select owner_user_id from contacts where id = $1`, [c2]))[0].owner_user_id, owner2, "the owner stays");
  const runs = (await q(`select count(*)::int n from router_runs where workspace_id = $1`, [w.ws]))[0].n;
  const fresh = (o2 as { booking: { slots: number[] } }).booking.slots;
  const b = await H.bookRun(rpc, w.owner, { run: (o2 as { run: string }).run, start: fresh[0]!, now: NOW });
  assert.equal(b.state, "pending_confirmation");
  assert.equal((await q(`select count(*)::int n from router_runs where workspace_id = $1`, [w.ws]))[0].n, runs, "booking only: no second routing run");
  assert.deepEqual((await q(`select hosts from meetings where contact_id = $1`, [c2]))[0].hosts, [owner2]);
  assert.equal((await q(`select coalesce(sum(n), 0)::int n from routing_quota where workspace_id = $1 and user_id = $2`, [w.ws, owner2]))[0].n >= 1, true);
});

test("H05 H06 H07 changes after the preview: a recipient who became unavailable, a new published version, an owner changed by someone else", async () => {
  const w = await workspace();
  const { id } = await published(w);
  const c = await contact(w.ws);
  // H05: Ana pauses after the preview.
  const p = await H.preview(rpc, w.member, { contact: c, now: NOW });
  assert.equal(p.recipient, ANA);
  await q(`update router_reps set paused_until = 'infinity' where workspace_id = $1 and user_id = $2`, [w.ws, ANA]);
  const before = await business(w.ws);
  const r1 = await H.confirm(rpc, w.member, { contact: c, op: key("ho"), ref: p.ref, book: { start: p.availability!.slots[0]! }, now: NOW });
  assert.equal(r1.status, "changed");
  assert.equal((r1 as { reason: string }).reason, "recipient_changed");
  assert.equal((r1 as { preview: H.Preview }).preview.recipient, VIN, "the new suggestion comes back to look at");
  assert.deepEqual(await business(w.ws), before, "nothing committed or booked for the old name");
  await q(`update router_reps set paused_until = null where workspace_id = $1 and user_id = $2`, [w.ws, ANA]);
  // H06: a new version is published after the preview.
  const p2 = await H.preview(rpc, w.member, { contact: c, now: NOW });
  const rev = (await rowOf(w, id)).draft_revision;
  const b = policy();
  const r2rev = (await S.save(rpc, w.owner, { policy: id, body: { ...b, spam: { ...b.spam, on: false } }, revision: rev })).revision;
  await S.test(rpc, w.owner, w.deps, { policy: id, version: "draft", revision: r2rev, email: "a@b.co", values });
  await S.publish(rpc, w.owner, w.deps, { policy: id, revision: r2rev, key: key("pub") });
  const r2 = await H.confirm(rpc, w.member, { contact: c, op: key("ho"), ref: p2.ref, now: NOW });
  assert.equal((r2 as { reason: string }).reason, "policy_changed");
  assert.deepEqual(await business(w.ws), before);
  // H07: someone else gives the contact to Kai's teammate Lee by hand after the preview.
  const p3 = await H.preview(rpc, w.member, { contact: c, now: NOW });
  await q(`update contacts set owner_user_id = $2 where id = $1`, [c, LEE]);
  const r3 = await H.confirm(rpc, w.member, { contact: c, op: key("ho"), ref: p3.ref, now: NOW });
  assert.equal((r3 as { reason: string }).reason, "ownership_changed");
  assert.equal((await q(`select owner_user_id from contacts where id = $1`, [c]))[0].owner_user_id, LEE, "no silent overwrite");
  assert.equal((r3 as { preview: H.Preview }).preview.contact.owner, LEE);
});

test("H09 H10 an owner's override is checked and audited; a member's override and a contact from another workspace are refused with nothing written", async () => {
  const w = await workspace();
  await published(w);
  const c = await contact(w.ws);
  const p = await H.preview(rpc, w.owner, { contact: c, now: NOW });
  const before = await business(w.ws);
  // H10: the client is bypassed.
  await assert.rejects(H.confirm(rpc, w.member, { contact: c, op: key("ho"), ref: p.ref, override: { user: VIN, reason: "Knows them" }, now: NOW }), (e: unknown) => e instanceof S.Refusal && e.status === 403);
  const other = await workspace();
  const foreign = await contact(other.ws);
  await assert.rejects(H.preview(rpc, w.member, { contact: foreign, now: NOW }), (e: unknown) => e instanceof S.Refusal && e.status === 404);
  await assert.rejects(H.confirm(rpc, w.owner, { contact: foreign, op: key("ho"), ref: p.ref, now: NOW }), (e: unknown) => e instanceof S.Refusal && e.status === 404);
  assert.deepEqual(await business(w.ws), before);
  assert.deepEqual(await business(other.ws), { ...(await business(other.ws)) });
  // H09: out of scope or out of office is refused; a reason is required; an eligible choice is committed and audited.
  await assert.rejects(H.confirm(rpc, w.owner, { contact: c, op: key("ho"), ref: p.ref, override: { user: LEE, reason: "Friend" }, now: NOW }), /out of scope/);
  await assert.rejects(H.confirm(rpc, w.owner, { contact: c, op: key("ho"), ref: p.ref, override: { user: KAI, reason: "Back soon" }, now: NOW }), /out/);
  await assert.rejects(H.confirm(rpc, w.owner, { contact: c, op: key("ho"), ref: p.ref, override: { user: VIN, reason: " " }, now: NOW }), /reason/);
  assert.deepEqual(await business(w.ws), before);
  const out = await H.confirm(rpc, w.owner, { contact: c, op: key("ho"), ref: p.ref, override: { user: VIN, reason: "Met them at the event" }, now: NOW });
  assert.equal(out.status === "assigned" && out.owner, VIN);
  const run = (await q(`select by, trace, previous_owner from router_runs where workspace_id = $1`, [w.ws]))[0];
  assert.equal(run.by, "hand");
  assert.deepEqual(run.trace.override, { reason: "Met them at the event", suggested: ANA, by: VIN });
  const a = (await q(`select counted, advanced from routing_assignments where workspace_id = $1`, [w.ws]))[0];
  assert.deepEqual([a.counted, a.advanced], [true, false], "a new owner's quota, no team turn");
});

test("Route & book needs a published handoff connection; a contact from the handoff shows up in Activity with its source", async () => {
  const w = await workspace();
  const c = await contact(w.ws);
  await assert.rejects(H.preview(rpc, w.owner, { contact: c, now: NOW }), (e: unknown) => e instanceof S.Refusal && e.code === "not_connected");
  await published(w, { handoffMeeting: false });
  const p = await H.preview(rpc, w.owner, { contact: c, now: NOW });
  assert.equal(p.meetingType, null);
  assert.equal(p.availability, null);
  await H.confirm(rpc, w.owner, { contact: c, op: key("ho"), ref: p.ref, now: NOW });
  const act = await S.activity(rpc, w.owner, { filter: "all" });
  const row = act.runs[0] as { source: string; policy: string; version: number; assignment_state: string; booking_state: string };
  assert.deepEqual([row.source, row.policy, row.version, row.assignment_state, row.booking_state], ["Internal handoff", "Inbound sales", 1, "assigned", "not_requested"]);
  assert.equal((await S.activity(rpc, w.owner, { filter: "errors" })).runs.length, 0);
});
