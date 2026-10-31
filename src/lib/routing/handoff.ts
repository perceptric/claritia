// Internal handoff, Route & book (docs/routing-workflow.md Section 14): a teammate opens a contact, finds who the
// published policy would give it to, then assigns it or assigns and books. Finding is a preview: facts are read, the
// shared evaluator decides, the suggested recipient's real times are read; nothing is written. Confirming checks
// again what may have changed since the preview (the policy's live version, the contact's owner, the recipient) and
// asks the person to look again when anything did; otherwise one commit through the A-E committer, then the booking
// through the scheduler's own path. A failed booking keeps the assignment. Server only.

import type { Rpc } from "../jobs.ts";
import { book, hostStates, offer } from "../meetings/server.ts";
import type { MeetingType } from "../meetings/types.ts";
import { eligibleWhy, inScope } from "../router/engine.ts";
import { commit, pickFor, readFacts, type LiveRouter } from "../router/server.ts";
import type { Decision, Facts, RouterBody } from "../router/types.ts";
import { evaluate, fieldsUsed, type Trace } from "./evaluate.ts";
import { DENIED, may, mayHandOff } from "./access.ts";
import { Refusal, type Caller } from "./screens.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function call<T>(rpc: Rpc, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

type HandoffSource = { id: string | null; policy: string; live: LiveRouter; meetingTypeId: string | null; revision: number | null };

/**
 * The policy Route & book uses: the published policy the handoff connection routes with; a workspace that never set
 * that connection up uses its default policy, the way a form with no connection does.
 */
async function handoffSource(rpc: Rpc, ws: string): Promise<HandoffSource> {
  const src = await call<{ sources: { id: string; kind: string; enabled: boolean; policy_id: string | null; outcome: string; meeting_type_id: string | null; live_revision: number }[] }>(rpc, "routing_screen_sources", { p_ws: ws });
  const h = (src?.sources ?? []).find((s) => s.kind === "handoff");
  let policy: string | null = null;
  if (h) {
    if (!h.enabled || !h.policy_id) throw new Refusal(409, "not_connected", "Connect Internal handoff to a published policy in Routing.");
    policy = h.policy_id;
  } else policy = await call<string | null>(rpc, "routing_default_policy", { p_ws: ws });
  if (!policy) throw new Refusal(409, "not_connected", "Connect Internal handoff to a published policy in Routing.");
  const live = await call<LiveRouter | null>(rpc, "routing_live", { p_ws: ws, p_policy: policy });
  if (!live) throw new Refusal(409, "not_connected", "Publish the policy Internal handoff uses first.");
  return { id: h?.id ?? null, policy, live: { ...live, policy_id: policy }, meetingTypeId: h && h.outcome === "assign_and_calendar" ? h.meeting_type_id : null, revision: h?.live_revision ?? null };
}

/** Local values for this handoff only (Section 14): never written to the CRM. */
function withLocal(f: Facts, body: RouterBody, values: unknown): Facts {
  if (!values || typeof values !== "object") return f;
  const used = new Set(fieldsUsed(body));
  for (const [k, v] of Object.entries(values as Record<string, unknown>)) {
    if (!used.has(k)) continue;
    const blank = v === null || v === undefined || (typeof v === "string" && !v.trim());
    f.values[k] = blank ? null : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v.trim()) : v;
    f.provenance = { ...(f.provenance ?? {}), [k]: { source: "handoff" } };
  }
  return f;
}

export type Availability =
  | { state: "ok"; tz: string; slots: number[]; length: number }
  | { state: "no_slots" | "calendar_disconnected" | "no_hours" | "unknown"; tz: string | null; slots: []; length: number | null };

/** The recipient's real free times for the meeting type, or why there are none (Section 15: a failed read isn't "no times"). */
async function availability(rpc: Rpc, ws: string, type: MeetingType | null, user: string | null, now: number): Promise<Availability | null> {
  if (!type || !user) return null;
  const length = type.settings.lengths[0] ?? 30;
  try {
    const [h] = await hostStates(rpc, ws, [user], now, now + 86_400_000);
    const tz = h?.input?.availability?.tz ?? null;
    if (!h?.bookable) return { state: h?.why === "no_hours" ? "no_hours" : "calendar_disconnected", tz, slots: [], length };
    const o = await offer(rpc, { ws, type, length, now, only: user });
    return o.slots.length ? { state: "ok", tz: tz ?? "UTC", slots: o.slots.slice(0, 12).map((s) => s.start), length } : { state: "no_slots", tz, slots: [], length };
  } catch {
    return { state: "unknown", tz: null, slots: [], length };
  }
}

export type Preview = {
  contact: { id: string; name: string; email: string | null; company: string | null; owner: string | null };
  policy: { id: string; name: string; version: number };
  meetingType: { id: string; name: string; minutes: number | null } | null;
  fields: { key: string; value: unknown }[];
  trace: Trace;
  state: string;
  effect: string;
  recipient: string | null;
  availability: Availability | null;
  /** What the person saw: sent back with Assign or Confirm and checked again then. */
  ref: { policy: string; version: number; owner: string | null; recipient: string | null };
};

async function previewOf(rpc: Rpc, c: Caller, o: { contact: string; values?: unknown; now?: number; users?: string[] }): Promise<{ p: Preview; facts: Facts; decision: Decision; src: HandoffSource; type: MeetingType | null }> {
  const src = await handoffSource(rpc, c.ws);
  const body = src.live.body;
  const now = o.now ?? Date.now();
  const read = await readFacts(rpc, { ws: c.ws, contact: o.contact, key: null, body, reason: "manual", now, users: o.users });
  // A contact in another workspace reads as missing: the same answer as one that was never there.
  if (!read || "existing" in read) throw new Refusal(404, "not_found", "That contact isn't in this workspace.");
  const facts = withLocal(read.facts, body, o.values);
  const ev = evaluate(body, facts, { source: { outcome: src.meetingTypeId ? "assign_and_calendar" : "assign_only", meetingTypeId: src.meetingTypeId } });
  const [policies, type] = await Promise.all([
    call<{ id: string; name: string }[]>(rpc, "routing_screen_policies", { p_ws: c.ws }),
    src.meetingTypeId ? call<MeetingType | null>(rpc, "meeting_type_get", { p_ws: c.ws, p_id: src.meetingTypeId }) : Promise.resolve(null),
  ]);
  const recipient = ev.trace.assignment.recipient;
  const p: Preview = {
    contact: { id: o.contact, name: facts.lead.name, email: facts.lead.email, company: facts.company?.name ?? null, owner: facts.owner?.user ?? null },
    policy: { id: src.policy, name: policies.find((x) => x.id === src.policy)?.name ?? "Policy", version: src.live.version },
    meetingType: type ? { id: type.id, name: type.name, minutes: type.settings.lengths[0] ?? null } : null,
    fields: fieldsUsed(body).map((key) => ({ key, value: facts.values[key] ?? null })),
    trace: ev.trace,
    state: ev.state,
    effect: ev.effect,
    recipient,
    availability: await availability(rpc, c.ws, type, ev.state === "assigned" ? recipient : null, now),
    ref: { policy: src.policy, version: src.live.version, owner: facts.owner?.user ?? null, recipient },
  };
  return { p, facts, decision: ev.decision, src, type };
}

/** Find recipient (Section 14): read only. No owner, count, turn, task, invitation or event changes. */
export async function preview(rpc: Rpc, c: Caller, o: { contact: unknown; values?: unknown; now?: number }): Promise<Preview> {
  if (typeof o.contact !== "string" || !UUID.test(o.contact)) throw new Refusal(400, "invalid_configuration", "Pick a contact.");
  // A preview reads what a member can already see in the CRM; who may commit is checked at confirm (Section 20).
  return (await previewOf(rpc, c, { contact: o.contact, values: o.values, now: o.now })).p;
}

export type Committed =
  | { status: "changed"; reason: "policy_changed" | "ownership_changed" | "recipient_changed"; preview: Preview }
  | {
      status: "assigned";
      run: string;
      owner: string;
      effect: string;
      repeat: boolean;
      booking: { state: "not_requested" } | { state: "pending_confirmation"; meeting: string; start: number } | { state: "slot_taken"; slots: number[] } | { state: "failed"; message: string };
    }
  | { status: "review"; run: string; state: string };

/**
 * Assign without booking, or Confirm handoff & book (Section 14). `op` is the operation id the drawer made when it
 * opened: a second click or a retry commits nothing new. The policy's live version, the contact's owner and the
 * recipient are checked again first; any change comes back as `changed` with a fresh preview and nothing written.
 * `override` (workspace owners, with a reason) picks another eligible in-scope recipient. A booking that fails keeps
 * the assignment ("Lead assigned to Ana. Meeting not confirmed.").
 */
export async function confirm(
  rpc: Rpc,
  c: Caller,
  o: {
    contact: unknown;
    op: unknown;
    ref: unknown;
    values?: unknown;
    book?: { start?: unknown; tz?: unknown } | null;
    override?: { user?: unknown; reason?: unknown } | null;
    now?: number;
    liveBusy?: (hosts: string[], from: number, to: number) => Promise<Set<string>>;
  },
): Promise<Committed> {
  if (typeof o.contact !== "string" || !UUID.test(o.contact)) throw new Refusal(400, "invalid_configuration", "Pick a contact.");
  const op = typeof o.op === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(o.op) ? o.op : null;
  if (!op) throw new Refusal(400, "invalid_configuration", "Bad request.");
  const ref = (o.ref ?? {}) as { policy?: unknown; version?: unknown; owner?: unknown; recipient?: unknown };
  const key = `handoff:${op}`;

  // A second click or a retry: the run this operation already made, with its booking.
  const again = await call<{ id: string; owner: string | null; effect: string | null; meeting_id: string | null; booking_state: string | null; assignment_state: string | null } | null>(rpc, "routing_handoff_run", { p_ws: c.ws, p_key: key }).catch(() => null);
  if (again) {
    if (again.assignment_state !== "assigned" || !again.owner) return { status: "review", run: again.id, state: again.assignment_state ?? "unassigned_needs_review" };
    return { status: "assigned", run: again.id, owner: again.owner, effect: again.effect ?? "new", repeat: true, booking: again.meeting_id ? { state: "pending_confirmation", meeting: again.meeting_id, start: 0 } : { state: "not_requested" } };
  }

  const override = o.override && typeof o.override.user === "string" && UUID.test(o.override.user) ? { user: o.override.user, reason: typeof o.override.reason === "string" ? o.override.reason.trim().slice(0, 300) : "" } : null;
  if (o.override && !override) throw new Refusal(400, "invalid_configuration", "Pick who gets the lead.");
  if (override && !may(c, "override")) throw new Refusal(403, "permission_denied", DENIED.override);
  if (override && !override.reason) throw new Refusal(400, "invalid_configuration", "Add a reason.");

  const now = o.now ?? Date.now();
  const { p, facts, decision, src, type } = await previewOf(rpc, c, { contact: o.contact, values: o.values, now, users: override ? [override.user] : undefined });
  if (ref.policy !== p.ref.policy || ref.version !== p.ref.version) return { status: "changed", reason: "policy_changed", preview: p };
  if ((ref.owner ?? null) !== p.ref.owner) return { status: "changed", reason: "ownership_changed", preview: p };
  if (!override && (ref.recipient ?? null) !== p.ref.recipient) return { status: "changed", reason: "recipient_changed", preview: p };
  if (!mayHandOff(c, p.ref.owner)) throw new Refusal(403, "permission_denied", DENIED.handoff);

  const body = src.live.body;
  let d: Decision = decision;
  let trace: Trace & { override?: unknown } = p.trace;
  if (override) {
    // An override is a deliberate choice inside the policy's normal limits: in scope, accepting leads, under the cap.
    const no = eligibleWhy(facts.reps[override.user], facts, { scope: inScope(body, facts, override.user), retain: override.user === p.ref.owner });
    const WHY: Record<string, string> = { not_member: "not in the workspace", out_of_scope: "out of scope", paused: "paused", out: "out of office", cap_day: "at their daily cap", cap_week: "at their weekly cap", passed: "passed over" };
    if (no) throw new Refusal(400, "no_eligible_recipient", `That person can't take this lead now: ${WHY[no.why] ?? no.why}.`);
    d = { result: { kind: "owner", user: override.user, by: "hand", effect: override.user === p.ref.owner ? "retained" : "new" }, steps: [...decision.steps, { step: "hand", ok: true, user: override.user, by_user: c.user }] };
    trace = { ...p.trace, assignment: { ...p.trace.assignment, recipient: override.user }, override: { reason: override.reason, suggested: p.ref.recipient, by: c.user } };
  }
  // A team's turn is taken under its lock, but only for the person shown: anyone else is a change to review.
  const pick = override ? null : pickFor(body, d);
  const res = await commit(rpc, {
    ws: c.ws,
    contact: o.contact,
    key,
    reason: "manual",
    live: src.live,
    decision: d,
    trace,
    facts,
    ms: 0,
    byUser: c.user,
    pick: pick && p.ref.recipient ? { ...pick, candidates: pick.candidates.filter((x) => x.user === p.ref.recipient) } : pick,
    source: src.id && src.revision !== null ? { id: src.id, revision: src.revision } : null,
    booking: "not_requested",
    submission: null,
    parent: null,
    expectOwner: p.ref.owner,
    ...(override ? { recheck: { away: true, caps: true } } : {}),
  });
  if (res.status === "stale") {
    const fresh = await previewOf(rpc, c, { contact: o.contact, values: o.values, now: Date.now() });
    return { status: "changed", reason: res.reason === "ownership_changed" ? "ownership_changed" : "recipient_changed", preview: fresh.p };
  }
  if (res.status === "gone") throw new Refusal(404, "not_found", "That contact is gone.");
  if (res.kind !== "owner" || !res.owner) return { status: "review", run: res.id!, state: res.kind === "held" ? "held_for_review" : "unassigned_needs_review" };
  const run = res.id!;
  const owner = res.owner;

  if (!o.book || typeof o.book.start !== "number") return { status: "assigned", run, owner, effect: res.effect ?? "new", repeat: res.status === "dup", booking: { state: "not_requested" } };
  if (!type) return { status: "assigned", run, owner, effect: res.effect ?? "new", repeat: false, booking: { state: "failed", message: "This handoff has no meeting type." } };

  // The assignment is saved. The booking is its own step: the scheduler's path, with the committed owner alone.
  try {
    const r = await book(rpc, {
      ws: c.ws,
      type,
      length: type.settings.lengths[0] ?? 30,
      start: o.book.start,
      guest: { email: facts.lead.email ?? "", name: facts.lead.name, ...(typeof o.book.tz === "string" ? { tz: o.book.tz.slice(0, 60) } : {}) },
      source: "handoff",
      only: owner,
      contactId: o.contact,
      bookedBy: c.user,
      now,
      liveBusy: o.liveBusy ?? (async () => new Set<string>()),
    });
    if (!r.ok) {
      await call(rpc, "routing_run_meeting", { p_ws: c.ws, p_run: run, p_meeting: null, p_state: "awaiting_selection", p_reason: r.error === "slot_taken" ? "slot_taken" : null }).catch(() => null);
      return { status: "assigned", run, owner, effect: res.effect ?? "new", repeat: false, booking: { state: "slot_taken", slots: r.slots.slice(0, 12).map((s) => s.start) } };
    }
    await call(rpc, "routing_run_meeting", { p_ws: c.ws, p_run: run, p_meeting: r.meetingId, p_state: "pending_confirmation", p_reason: null });
    return { status: "assigned", run, owner, effect: res.effect ?? "new", repeat: false, booking: { state: "pending_confirmation", meeting: r.meetingId, start: r.start } };
  } catch (e) {
    await call(rpc, "routing_run_meeting", { p_ws: c.ws, p_run: run, p_meeting: null, p_state: "failed", p_reason: null }).catch(() => null);
    return { status: "assigned", run, owner, effect: res.effect ?? "new", repeat: false, booking: { state: "failed", message: e instanceof Error ? e.message.slice(0, 200) : "The meeting couldn't be booked." } };
  }
}

/**
 * Where a handoff's booking is (Section 15): confirmed once the provider holds the event, failed when the calendar
 * work failed for good, else still pending. Moves the run's booking state when it learns something.
 */
export async function status(rpc: Rpc, c: Caller, o: { run: unknown }): Promise<{ state: string; start: string | null }> {
  if (typeof o.run !== "string" || !UUID.test(o.run)) throw new Refusal(400, "invalid_configuration", "Bad run.");
  const r = await call<{ booking_state: string | null; meeting: { id: string; start: string; confirmed: boolean; failed: boolean } | null } | null>(rpc, "routing_handoff_status", { p_ws: c.ws, p_run: o.run });
  if (!r) throw new Refusal(404, "not_found", "That run is gone.");
  if (r.booking_state === "pending_confirmation" && r.meeting) {
    const next = r.meeting.confirmed ? "confirmed" : r.meeting.failed ? "failed" : null;
    if (next) {
      await call(rpc, "routing_run_meeting", { p_ws: c.ws, p_run: o.run, p_meeting: r.meeting.id, p_state: next, p_reason: null });
      return { state: next, start: r.meeting.start };
    }
  }
  return { state: r.booking_state ?? "not_requested", start: r.meeting?.start ?? null };
}

/**
 * Book again for a handoff whose assignment is saved but whose meeting isn't (Section 18: recover the step, never the
 * allocation): the run's committed owner alone, the handoff's meeting type, a new time.
 */
export async function bookRun(
  rpc: Rpc,
  c: Caller,
  o: { run: unknown; start: unknown; tz?: unknown; now?: number; liveBusy?: (hosts: string[], from: number, to: number) => Promise<Set<string>> },
): Promise<{ state: "pending_confirmation"; meeting: string; start: number } | { state: "slot_taken"; slots: number[] }> {
  if (typeof o.run !== "string" || !UUID.test(o.run) || typeof o.start !== "number") throw new Refusal(400, "invalid_configuration", "Bad request.");
  const r = await call<{ id: string; key: string; owner: string | null; by_user: string | null; contact_id: string | null; meeting: { id: string } | null; lead: { name: string | null; email: string | null } } | null>(rpc, "routing_screen_run", { p_ws: c.ws, p_run: o.run });
  if (!r || !r.key.startsWith("handoff:") || !r.owner || !r.contact_id) throw new Refusal(404, "not_found", "That handoff is gone.");
  // The person who made the handoff, the lead's owner, or a workspace owner books it again.
  if (c.role !== "owner" && r.by_user !== c.user && r.owner !== c.user) throw new Refusal(403, "permission_denied", DENIED.recover);
  if (r.meeting) return { state: "pending_confirmation", meeting: r.meeting.id, start: o.start };
  const src = await handoffSource(rpc, c.ws);
  const type = src.meetingTypeId ? await call<MeetingType | null>(rpc, "meeting_type_get", { p_ws: c.ws, p_id: src.meetingTypeId }) : null;
  if (!type) throw new Refusal(409, "not_connected", "This handoff has no meeting type.");
  const b = await book(rpc, {
    ws: c.ws,
    type,
    length: type.settings.lengths[0] ?? 30,
    start: o.start,
    guest: { email: r.lead.email ?? "", name: r.lead.name ?? "", ...(typeof o.tz === "string" ? { tz: o.tz.slice(0, 60) } : {}) },
    source: "handoff",
    only: r.owner,
    contactId: r.contact_id,
    bookedBy: c.user,
    now: o.now,
    liveBusy: o.liveBusy ?? (async () => new Set<string>()),
  });
  if (!b.ok) return { state: "slot_taken", slots: b.slots.slice(0, 12).map((s) => s.start) };
  await call(rpc, "routing_run_meeting", { p_ws: c.ws, p_run: r.id, p_meeting: b.meetingId, p_state: "pending_confirmation", p_reason: null });
  return { state: "pending_confirmation", meeting: b.meetingId, start: b.start };
}
