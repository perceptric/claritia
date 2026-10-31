// Recovery and review, stage H (docs/routing-workflow.md Sections 15, 18, 19 and 22): the Activity drawer's actions on
// a real run. A review item is approved, dismissed with a reason, or reopened at the revision the person saw; "Approve
// and route" runs an explicit child attempt (a new attempt id linked to the parent) on the original policy version
// when it's still valid, else a chosen published version, with the reviewer's corrections as new facts with their
// provenance; the parent resolves only when the child commits an owner (the database does that in the same
// transaction). A reassignment by hand goes through the same committer (a new owner counts once in their quota, no
// team turn, company and opportunity owners and existing meetings untouched) and is audited. A failed step is
// recovered on its own: a CRM sync is pushed again, an unknown calendar outcome is reconciled with the same provider
// key, a booking is resumed with the run's committed owner. Nothing here routes a lead again blindly. Server only.

import type { Rpc } from "../jobs.ts";
import { cleanBody } from "../router/check.ts";
import { numberOrRange } from "../router/conditions.ts";
import { eligibleWhy, inScope } from "../router/engine.ts";
import { commit, pickFor, readFacts, type LiveRouter } from "../router/server.ts";
import type { Decision, Facts, RouterBody } from "../router/types.ts";
import { DENIED, may, mayRecover, mayReview } from "./access.ts";
import { evaluate, fieldsUsed, type Trace } from "./evaluate.ts";
import { teamsOf } from "./policies.ts";
import { Refusal, type Caller, type Deps } from "./screens.ts";
import { validatePolicy } from "./validate.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const OP = /^[A-Za-z0-9_-]{8,80}$/;

async function call<T>(rpc: Rpc, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

const uuid = (v: unknown, what: string): string => {
  if (typeof v !== "string" || !UUID.test(v)) throw new Refusal(400, "invalid_configuration", `Bad ${what}.`);
  return v;
};
const opOf = (v: unknown): string => {
  if (typeof v !== "string" || !OP.test(v)) throw new Refusal(400, "invalid_configuration", "Bad request.");
  return v;
};

/** What the recovery actions read of a run (routing_screen_run, 097). */
export type RunRecord = {
  id: string;
  key: string;
  kind: string;
  owner: string | null;
  by: string | null;
  contact_id: string | null;
  policy_id: string | null;
  version: number | null;
  source_id: string | null;
  source_revision: number | null;
  source_kind: string | null;
  submission_id: string | null;
  booking_state: string | null;
  booking_reason: string | null;
  sync_state: string | null;
  trace: Trace | null;
  current_owner: string | null;
  review: { id: string; state: string; reason: string; reviewer: string; revision: number; latest_action: { action?: string; op?: string } | null; child_run_id: string | null } | null;
  meeting: { id: string; status: string; confirmed: boolean } | null;
  owner_calendar: { provider: string; status: string } | null;
};

export async function runOf(rpc: Rpc, c: Caller, run: unknown): Promise<RunRecord> {
  const r = await call<RunRecord | null>(rpc, "routing_screen_run", { p_ws: c.ws, p_run: uuid(run, "run") });
  if (!r) throw new Refusal(404, "not_found", "That run is gone.");
  return r;
}

const OPEN = new Set(["open", "approved_pending_execution", "in_progress"]);

/** A database refusal as the API's typed error. */
function refusal(e: unknown): never {
  const msg = e instanceof Error ? e.message : String(e);
  if (/draft_conflict/.test(msg)) throw new Refusal(409, "draft_conflict", "Someone else changed this item. Open it again.");
  if (/not_found/.test(msg)) throw new Refusal(404, "not_found", "That's gone.");
  if (/invalid_configuration: reason/.test(msg)) throw new Refusal(400, "invalid_configuration", "Add a reason.");
  if (/invalid_configuration/.test(msg)) throw new Refusal(409, "invalid_configuration", "This item has moved on. Open it again.");
  throw e instanceof Error ? e : new Error(msg);
}

// The review lifecycle (Section 18) -------------------------------------------------------------------------------

export type ReviewAction = "approve" | "dismiss" | "reopen";

/** Approve (cleared for a child attempt, still in Needs review), dismiss with a reason, or reopen a dismissed item. */
export async function reviewAct(rpc: Rpc, c: Caller, o: { run: unknown; action: unknown; reason?: unknown; revision?: unknown }) {
  const action = o.action === "approve" || o.action === "dismiss" || o.action === "reopen" ? (o.action as ReviewAction) : null;
  if (!action) throw new Refusal(400, "invalid_configuration", "Bad request.");
  const r = await runOf(rpc, c, o.run);
  if (!r.review) throw new Refusal(404, "not_found", "This run has no review item.");
  if (!mayReview(c, r.review)) throw new Refusal(403, "permission_denied", DENIED.review);
  const reason = typeof o.reason === "string" ? o.reason.trim().slice(0, 300) : "";
  if (action === "dismiss" && !reason) throw new Refusal(400, "invalid_configuration", "Add a reason.");
  try {
    return await call<{ id: string; state: string; revision: number }>(rpc, "routing_review_act", {
      p_ws: c.ws,
      p_review: r.review.id,
      p_action: action,
      p_user: c.user,
      p_reason: reason || null,
      p_revision: typeof o.revision === "number" ? o.revision : null,
      p_op: null,
    });
  } catch (e) {
    refusal(e);
  }
}

// Child attempts ---------------------------------------------------------------------------------------------------

export type VersionChoice = { policy: string; version: number; name: string; original: boolean; valid: boolean; why: string | null };

type PolicyLite = { id: string; name: string; is_default: boolean; archived: boolean; active_version: number | null };

/**
 * The versions a child attempt may use (Section 18 step 3): the run's original version (with the reason it can't be
 * reused, when it can't: archived, gone, or naming people, teams or fields that aren't there any more) and each
 * policy's current published version. The default is the original when it's valid, else the same policy's current
 * version, else the default policy's.
 */
export async function versionChoices(rpc: Rpc, c: Caller, deps: Deps, r: RunRecord): Promise<{ options: VersionChoice[]; chosen: VersionChoice | null; configs: Map<string, RouterBody> }> {
  const [policies, teams, members, fields] = await Promise.all([call<PolicyLite[]>(rpc, "routing_screen_policies", { p_ws: c.ws }), teamsOf(rpc, c.ws), deps.members(), deps.fields()]);
  const configs = new Map<string, RouterBody>();
  const versionsOf = async (p: string) => call<{ version: number; config: RouterBody }[]>(rpc, "routing_screen_versions", { p_ws: c.ws, p_policy: p });
  const check = (body: RouterBody): string | null => validatePolicy(body, { members: new Set(members.map((m) => m.id)), fields, teams }).errors[0]?.text ?? null;
  const options: VersionChoice[] = [];
  const pol = policies.find((p) => p.id === r.policy_id);
  if (r.policy_id && r.version) {
    const v = pol ? (await versionsOf(pol.id)).find((x) => x.version === r.version) : undefined;
    const body = v ? cleanBody(v.config) : null;
    if (body) configs.set(`${r.policy_id}:${r.version}`, body);
    const why = !pol ? "That policy is gone." : pol.archived ? "That policy is archived." : !body ? "That version is gone." : check(body);
    options.push({ policy: r.policy_id, version: r.version, name: pol?.name ?? "Policy", original: true, valid: !why, why });
  }
  for (const p of policies) {
    if (p.archived || !p.active_version || (p.id === r.policy_id && p.active_version === r.version)) continue;
    const v = (await versionsOf(p.id)).find((x) => x.version === p.active_version);
    if (!v) continue;
    const body = cleanBody(v.config);
    configs.set(`${p.id}:${p.active_version}`, body);
    const why = check(body);
    options.push({ policy: p.id, version: p.active_version, name: p.name, original: false, valid: !why, why });
  }
  const valid = options.filter((x) => x.valid);
  const chosen = valid.find((x) => x.original) ?? valid.find((x) => x.policy === r.policy_id) ?? valid.find((x) => policies.find((p) => p.id === x.policy)?.is_default) ?? valid[0] ?? null;
  return { options, chosen, configs };
}

/** A corrected value as the reviewer typed it: whole numbers stay numbers, ranges stay ranges, blank is unknown. */
function corrected(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, 200);
  if (!t) return null;
  const n = numberOrRange(t);
  return n && n.lo === n.hi && /^[\d,.\s]+$/.test(t) ? n.lo : t;
}

/**
 * The child attempt's facts (Section 18): the lead as the CRM has it now, the parent's own submitted answers (its
 * stored trace's input snapshot), then the reviewer's corrections, each a new fact with its provenance. The parent's
 * trace is never rewritten.
 */
async function childFacts(rpc: Rpc, c: Caller, r: RunRecord, body: RouterBody, corrections: Record<string, unknown>, users: string[] = []) {
  if (!r.contact_id) throw new Refusal(409, "not_found", "This run has no contact to route.");
  const read = await readFacts(rpc, { ws: c.ws, contact: r.contact_id, key: null, body, reason: "manual", users });
  if (!read || "existing" in read) throw new Refusal(404, "not_found", "That contact is gone.");
  const f = read.facts;
  for (const v of r.trace?.input?.values ?? []) {
    if (!v.known || !["form", "handoff", "review"].includes(v.source)) continue;
    f.values[v.field] = v.value;
    f.provenance = { ...(f.provenance ?? {}), [v.field]: { source: v.source as "form" } };
  }
  const allowed = new Set(fieldsUsed(body));
  const at = Date.now();
  const applied: Record<string, unknown> = {};
  for (const [k, raw] of Object.entries(corrections).slice(0, 40)) {
    if (!allowed.has(k)) continue;
    const v = corrected(raw);
    f.values[k] = v;
    applied[k] = v;
    f.provenance = { ...(f.provenance ?? {}), [k]: { source: "review", by: c.user, at } };
  }
  return { facts: f, applied };
}

export type ChildPreview = {
  options: VersionChoice[];
  chosen: VersionChoice | null;
  fields: { key: string; value: unknown; source: string }[];
  trace: Trace | null;
  state: string | null;
  recipient: string | null;
  ref: { policy: string; version: number; owner: string | null; recipient: string | null } | null;
};

type ChildIn = { run: unknown; choice?: unknown; corrections?: unknown; clearHold?: unknown };

async function prepare(rpc: Rpc, c: Caller, deps: Deps, o: ChildIn) {
  const r = await runOf(rpc, c, o.run);
  if (!r.review) throw new Refusal(404, "not_found", "This run has no review item.");
  if (!mayReview(c, r.review)) throw new Refusal(403, "permission_denied", DENIED.review);
  if (!OPEN.has(r.review.state)) throw new Refusal(409, "invalid_configuration", r.review.state === "dismissed" ? "Reopen this item first." : "This item is resolved.");
  const vc = await versionChoices(rpc, c, deps, r);
  const want = o.choice && typeof o.choice === "object" ? (o.choice as { policy?: unknown; version?: unknown }) : null;
  const chosen = want ? vc.options.find((x) => x.policy === want.policy && x.version === want.version) : vc.chosen;
  if (want && !chosen) throw new Refusal(400, "invalid_configuration", "That version can't be used.");
  if (chosen && !chosen.valid) throw new Refusal(400, "invalid_configuration", chosen.why ?? "That version can't be used.");
  const corrections = o.corrections && typeof o.corrections === "object" ? (o.corrections as Record<string, unknown>) : {};
  const clearHold = o.clearHold === true;
  return { r, vc, chosen, corrections, clearHold };
}

function evaluateChild(body0: RouterBody, facts: Facts, clearHold: boolean) {
  // Clearing the hold is the reviewer's explicit decision (Section 18 step 2): the spam check and block list are skipped.
  const body = clearHold ? { ...body0, spam: { ...body0.spam, on: false } } : body0;
  if (clearHold) facts.lists = { ...facts.lists, block: [] };
  return { body, ev: evaluate(body, facts) };
}

/** Preview the child attempt (Section 18 step 4): the decision the chosen version would make now. Writes nothing. */
export async function childPreview(rpc: Rpc, c: Caller, deps: Deps, o: ChildIn): Promise<ChildPreview> {
  const { r, vc, chosen, corrections, clearHold } = await prepare(rpc, c, deps, o);
  if (!chosen) return { options: vc.options, chosen: null, fields: [], trace: null, state: null, recipient: null, ref: null };
  const body0 = vc.configs.get(`${chosen.policy}:${chosen.version}`)!;
  const { facts } = await childFacts(rpc, c, r, body0, corrections);
  const { ev } = evaluateChild(body0, facts, clearHold);
  return {
    options: vc.options,
    chosen,
    fields: fieldsUsed(body0).map((key) => ({ key, value: facts.values[key] ?? null, source: facts.provenance?.[key]?.source ?? (facts.values[key] == null ? "unknown" : "crm") })),
    trace: ev.trace,
    state: ev.state,
    recipient: ev.trace.assignment.recipient,
    ref: { policy: chosen.policy, version: chosen.version, owner: facts.owner?.user ?? null, recipient: ev.trace.assignment.recipient },
  };
}

export type ChildResult =
  | { status: "resolved"; run: string; owner: string | null; repeat: boolean }
  | { status: "review"; run: string; state: string }
  | { status: "changed"; preview: ChildPreview };

/**
 * Confirm the child attempt (Section 18 step 5): the item goes in progress with this attempt's operation id (a retry
 * or a second click gets the running one back), the decision is checked against what the person previewed, then one
 * commit with a new attempt id linked to the parent. Its owner resolves the parent in the same transaction; a child
 * that lands in review again puts the parent back to open with the child linked. A commit that can't settle puts the
 * item back to approved, nothing written.
 */
export async function childRun(rpc: Rpc, c: Caller, deps: Deps, o: ChildIn & { op: unknown; ref?: unknown }): Promise<ChildResult> {
  const prep = await prepare(rpc, c, deps, o);
  const { r, vc, chosen, corrections, clearHold } = prep;
  const review = r.review!;
  const started = await call<{ op: string | null }>(rpc, "routing_review_act", { p_ws: c.ws, p_review: review.id, p_action: "start", p_user: c.user, p_reason: null, p_revision: null, p_op: opOf(o.op) }).catch(refusal);
  const key = `review:${review.id}:${started.op ?? opOf(o.op)}`;
  // Already committed under this attempt id (a retry after a lost answer): its outcome, nothing new.
  const done = await call<{ id: string; owner: string | null; assignment_state: string | null } | null>(rpc, "routing_handoff_run", { p_ws: c.ws, p_key: key });
  if (done) return done.assignment_state === "assigned" ? { status: "resolved", run: done.id, owner: done.owner, repeat: true } : { status: "review", run: done.id, state: done.assignment_state ?? "unassigned_needs_review" };
  const back = () => call(rpc, "routing_review_act", { p_ws: c.ws, p_review: review.id, p_action: "back", p_user: c.user, p_reason: null, p_revision: null, p_op: null }).catch(() => null);
  if (!chosen) {
    await back();
    throw new Refusal(409, "invalid_configuration", "No published version can route this lead. Publish one first.");
  }
  const body0 = vc.configs.get(`${chosen.policy}:${chosen.version}`)!;
  const { facts, applied } = await childFacts(rpc, c, r, body0, corrections);
  const { body, ev } = evaluateChild(body0, facts, clearHold);
  const ref = (o.ref ?? {}) as { policy?: unknown; version?: unknown; owner?: unknown; recipient?: unknown };
  const fresh = async (): Promise<ChildResult> => {
    await back();
    return { status: "changed", preview: await childPreview(rpc, c, deps, { run: r.id, choice: { policy: chosen.policy, version: chosen.version }, corrections, clearHold }) };
  };
  if (ref.policy !== chosen.policy || ref.version !== chosen.version || (ref.owner ?? null) !== (facts.owner?.user ?? null) || (ref.recipient ?? null) !== ev.trace.assignment.recipient) return fresh();
  const live: LiveRouter = { version: chosen.version, body, policy_id: chosen.policy };
  const pick = pickFor(body, ev.decision);
  const recipient = ev.trace.assignment.recipient;
  const res = await commit(rpc, {
    ws: c.ws,
    contact: r.contact_id!,
    key,
    reason: "manual",
    live,
    decision: ev.decision,
    trace: { ...ev.trace, review: { parent: r.id, item: review.id, by: c.user, corrections: applied, clearHold, version: chosen.version, original: chosen.original } },
    facts,
    ms: 0,
    byUser: c.user,
    pick: pick && recipient ? { ...pick, candidates: pick.candidates.filter((x) => x.user === recipient) } : pick,
    source: r.source_id && r.source_revision !== null ? { id: r.source_id, revision: r.source_revision } : null,
    booking: "not_requested",
    submission: r.submission_id,
    parent: r.id,
    expectOwner: facts.owner?.user ?? null,
  });
  if (res.status === "stale") return fresh();
  if (res.status === "gone") {
    await back();
    throw new Refusal(404, "not_found", "That contact is gone.");
  }
  if (res.kind === "owner") return { status: "resolved", run: res.id!, owner: res.owner ?? null, repeat: res.status === "dup" };
  return { status: "review", run: res.id!, state: res.kind === "held" ? "held_for_review" : "unassigned_needs_review" };
}

// Manual reassignment (Section 18) --------------------------------------------------------------------------------

const WHY: Record<string, string> = { not_member: "isn't in the workspace", out_of_scope: "is out of scope", paused: "is paused", out: "is out of office", cap_day: "is at today's cap", cap_week: "is at this week's cap", passed: "passed on this lead" };

/** A reassignment by hand isn't a policy's decision: no policy version, no company owner, no review owner. */
const MANUAL_BODY = (): RouterBody => {
  const b = cleanBody({ v: 2 });
  b.account = { ...b.account, setCompanyOwner: false };
  // Anyone in the workspace may be chosen by hand; eligibility (status, caps) is still checked.
  b.scope = { everyone: true, people: [], teams: [] };
  return b;
};

export type ReassignPreview = {
  contact: { id: string; name: string; email: string | null; owner: string | null; company: string | null };
  proposed: string;
  eligible: boolean;
  why: string | null;
  today: number;
  cap: number | null;
  meetings: number;
};

async function reassignPrep(rpc: Rpc, c: Caller, o: { contact?: unknown; run?: unknown; user: unknown }) {
  const user = uuid(o.user, "person");
  const r = o.run ? await runOf(rpc, c, o.run) : null;
  const viaReview = !!r?.review && OPEN.has(r.review.state) && mayReview(c, r.review);
  if (!may(c, "reassign") && !viaReview) throw new Refusal(403, "permission_denied", DENIED.reassign);
  const contact = r?.contact_id ?? uuid(o.contact, "contact");
  const body = MANUAL_BODY();
  const read = await readFacts(rpc, { ws: c.ws, contact, key: null, body, reason: "manual", users: [user] });
  // A contact in another workspace reads as missing: the same answer as one that was never there.
  if (!read || "existing" in read) throw new Refusal(404, "not_found", "That contact isn't in this workspace.");
  const facts = read.facts;
  const owner = facts.owner?.user ?? null;
  const no = eligibleWhy(facts.reps[user], facts, { scope: inScope(body, facts, user), retain: user === owner });
  return { r, contact, user, body, facts, owner, no, viaReview };
}

/** Current owner, proposed owner and whether they can take it now. Writes nothing. */
export async function reassignPreview(rpc: Rpc, c: Caller, o: { contact?: unknown; run?: unknown; user: unknown }): Promise<ReassignPreview> {
  const { contact, user, facts, owner, no } = await reassignPrep(rpc, c, o);
  const rep = facts.reps[user];
  const meetings = await call<unknown[]>(rpc, "meeting_upcoming_for", { p_ws: c.ws, p_contact: contact }).catch(() => []);
  return {
    contact: { id: contact, name: facts.lead.name, email: facts.lead.email, owner, company: facts.company?.name ?? null },
    proposed: user,
    eligible: !no,
    why: no ? `${rep?.name ?? "That person"} ${WHY[no.why] ?? no.why}.` : null,
    today: rep?.today ?? 0,
    cap: rep?.capDay ?? null,
    meetings: Array.isArray(meetings) ? meetings.length : 0,
  };
}

export type ReassignResult = { status: "assigned"; run: string; owner: string; effect: string; repeat: boolean } | { status: "changed"; reason: string; owner: string | null };

/**
 * Reassign by hand: a reason is required; the person must be able to take the lead now (in the workspace, accepting
 * leads, under their cap, checked again under the lock); the owner the person saw is checked (a newer owner is a
 * conflict, never overwritten); one commit through the committer by this operation id. From a review item the run
 * is the parent, so the item resolves with it. Company and opportunity owners and existing meetings stay as they are.
 */
export async function reassign(rpc: Rpc, c: Caller, o: { contact?: unknown; run?: unknown; user: unknown; reason: unknown; op: unknown; expectOwner?: unknown }): Promise<ReassignResult> {
  const op = opOf(o.op);
  const reason = typeof o.reason === "string" ? o.reason.trim().slice(0, 300) : "";
  if (!reason) throw new Refusal(400, "invalid_configuration", "Add a reason.");
  const key = `reassign:${op}`;
  const done = await call<{ id: string; owner: string | null; effect: string | null } | null>(rpc, "routing_handoff_run", { p_ws: c.ws, p_key: key });
  if (done?.owner) return { status: "assigned", run: done.id, owner: done.owner, effect: done.effect ?? "new", repeat: true };
  const { r, contact, user, body, facts, owner, no, viaReview } = await reassignPrep(rpc, c, o);
  const expect = o.expectOwner === null || typeof o.expectOwner === "string" ? (o.expectOwner as string | null) : owner;
  if (expect !== owner) return { status: "changed", reason: "ownership_changed", owner };
  if (no) throw new Refusal(400, "no_eligible_recipient", `${facts.reps[user]?.name ?? "That person"} ${WHY[no.why] ?? no.why}.`);
  if (viaReview && r?.review) await call(rpc, "routing_review_act", { p_ws: c.ws, p_review: r.review.id, p_action: "start", p_user: c.user, p_reason: null, p_revision: null, p_op: op }).catch(refusal);
  const base = evaluate(body, facts).trace;
  const effect = user === owner ? "retained" : "new";
  const d: Decision = { result: { kind: "owner", user, by: "hand", effect }, steps: [{ step: "hand", ok: true, user, by_user: c.user }] };
  const trace = { ...base, assignment: { ...base.assignment, recipient: user }, manual: { reason, by: c.user, from: owner, to: user } };
  const live: LiveRouter = { version: null as unknown as number, body, policy_id: undefined };
  const res = await commit(rpc, {
    ws: c.ws,
    contact,
    key,
    reason: "manual",
    live,
    decision: d,
    trace,
    facts,
    ms: 0,
    byUser: c.user,
    pick: null,
    source: null,
    booking: "not_requested",
    submission: null,
    parent: r && r.review && OPEN.has(r.review.state) ? r.id : null,
    expectOwner: owner,
    recheck: { away: true, caps: true },
  });
  if (res.status === "stale") {
    if (viaReview && r?.review) await call(rpc, "routing_review_act", { p_ws: c.ws, p_review: r.review.id, p_action: "back", p_user: c.user, p_reason: null, p_revision: null, p_op: null }).catch(() => null);
    if (res.reason === "ownership_changed") return { status: "changed", reason: "ownership_changed", owner: (res as { owner?: string | null }).owner ?? null };
    throw new Refusal(400, "no_eligible_recipient", `${facts.reps[user]?.name ?? "That person"} ${WHY[res.reason === "cap" ? "cap_day" : res.reason === "away" ? "paused" : (res.reason ?? "")] ?? "can't take this lead now"}.`);
  }
  if (res.status === "gone") throw new Refusal(404, "not_found", "That contact is gone.");
  return { status: "assigned", run: res.id!, owner: res.owner ?? user, effect: res.effect ?? effect, repeat: res.status === "dup" };
}

// One step's recovery (Sections 15 and 18) ------------------------------------------------------------------------

/** Retry the CRM sync of a known assignment: that contact is pushed again; nothing is routed or booked. */
export async function retrySync(rpc: Rpc, c: Caller, o: { run: unknown }) {
  const r = await runOf(rpc, c, o.run);
  if (!mayRecover(c, r)) throw new Refusal(403, "permission_denied", DENIED.recover);
  return call<{ state: string; queued: number }>(rpc, "routing_sync_retry", { p_ws: c.ws, p_run: r.id, p_user: c.user });
}

/** Check the calendar for a booking whose outcome is unknown: the same provider key finds the first event or makes one. */
export async function reconcile(rpc: Rpc, c: Caller, o: { run: unknown }) {
  const r = await runOf(rpc, c, o.run);
  if (!mayRecover(c, r)) throw new Refusal(403, "permission_denied", DENIED.recover);
  if (!r.meeting) throw new Refusal(409, "invalid_configuration", "This run has no booking to check.");
  if (r.owner_calendar?.status !== "ok") throw new Refusal(409, "calendar_disconnected", "Reconnect the calendar first.");
  return call<{ state: string; queued: boolean }>(rpc, "routing_booking_reconcile", { p_ws: c.ws, p_run: r.id, p_user: c.user });
}

/**
 * Resume a form lead's booking with their committed owner, once the owner's calendar works again: the lead gets that
 * owner's times by email (the existing book-later email, keyed by the submission, so it goes once). A handoff's
 * booking is resumed in Route & book instead (bookRun), where the person picks the time.
 */
export async function resumeBooking(rpc: Rpc, c: Caller, o: { run: unknown }) {
  const r = await runOf(rpc, c, o.run);
  if (!mayRecover(c, r)) throw new Refusal(403, "permission_denied", DENIED.recover);
  if (r.kind !== "owner" || !r.owner) throw new Refusal(409, "invalid_configuration", "This lead has no owner to book with.");
  if (r.meeting || r.booking_state === "confirmed" || r.booking_state === "pending_confirmation") throw new Refusal(409, "invalid_configuration", "This lead already has a meeting.");
  if (r.owner_calendar?.status !== "ok") throw new Refusal(409, "calendar_disconnected", "Reconnect the calendar first.");
  if (!r.submission_id) throw new Refusal(409, "invalid_configuration", "Book this lead from Route & book.");
  const src = await call<{ sources: { id: string; meeting_type_id: string | null }[] }>(rpc, "routing_screen_sources", { p_ws: c.ws });
  const type = src.sources.find((s) => s.id === r.source_id)?.meeting_type_id;
  if (!type) throw new Refusal(409, "invalid_configuration", "This form shows no calendar.");
  await call(rpc, "enqueue_job", { p_workspace: c.ws, p_kind: "meeting_book_later", p_key: `book_later:${r.submission_id}`, p_payload: { submission: r.submission_id, type, owner: r.owner, only: true }, p_delay_s: 0, p_max_attempts: 3 });
  return { queued: true };
}
