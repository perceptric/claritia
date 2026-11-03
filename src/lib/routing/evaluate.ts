// The shared evaluator boundary (docs/routing-workflow.md Section 21): captured, normalized facts and a policy
// snapshot in; a decision and its trace out. It never writes an owner, a turn, a count, a task or an event: the
// tester's simulation and the production committer both call this one function (the committer then checks again,
// under its locks, what may have changed). The decision itself is the router's engine (src/lib/router/engine.ts);
// this adds the spec's seven trace stages and the separate assignment and booking states. Pure: runs in the browser
// and on the server.

import { decide, effectOf } from "../router/engine.ts";
import type { Decision, Facts, OwnerKind, Provenance, RouterBody, StepResult, Why } from "../router/types.ts";
import type { AssignmentState, Outcome } from "./states.ts";

type Step<K extends StepResult["step"]> = Extract<StepResult, { step: K }>;

export type Trace = {
  semantics: "v1" | "v2";
  /** Relevant values and where each came from; a missing value is listed apart from an input problem. */
  input: {
    values: { field: string; value: unknown; known: boolean; source: Provenance["source"] | "unknown" }[];
    missing: string[];
    issues: { code: string; field: string }[];
    previousOwner: string | null;
    company: { id: string; name: string; match: string } | null;
  };
  checks: { result: "passed" | "held"; reason?: string; signals?: string[] };
  ownership: {
    enabled: boolean;
    order: OwnerKind[];
    candidates: { kind: OwnerKind; user: string | null; outcome: "picked" | "skipped" | "none"; reason?: string }[];
  };
  rules: {
    evaluated: { id: string; name: string; matched: boolean }[];
    matched: { id: string; name: string } | null;
    notEvaluated: { id: string; name: string }[];
    usedDefault: boolean;
  };
  distribution: {
    destination: { kind: "queue" | "user" | "owner" | "review"; id: string | null; name: string | null } | null;
    next: number | null;
    excluded: { user: string; reason: Why }[];
    suggested: string | null;
    backup: { to: string | null; picked: string | null; reason?: string } | null;
  };
  assignment: { state: AssignmentState; effect: "new" | "retained" | "none"; recipient: string | null; previousOwner: string | null; reason?: string };
  booking: { outcome: "not_requested" | "calendar" | "follow_up" | "no_slots_follow_up"; host: string | null; meetingType: string | null };
};

export type Evaluation = { decision: Decision; trace: Trace; state: AssignmentState; effect: "new" | "retained" | "none" };

/** The source a run is for, as far as the booking stage needs it. `slots`: a test override of availability. */
export type SourceView = { outcome: Outcome; meetingTypeId: string | null; slots?: boolean };

const find = <K extends StepResult["step"]>(steps: StepResult[], k: K) => steps.find((s): s is Step<K> => s.step === k);

/** The fields a body's enabled rules and company types test. */
export function fieldsUsed(body: RouterBody): string[] {
  const out = new Set<string>();
  for (const r of body.rules.on ? body.rules.list : []) if (r.on !== false) for (const c of r.conds) out.add(c.field);
  for (const sg of body.segments ?? []) for (const c of sg.conds) out.add(c.field);
  return [...out];
}

const blank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);

export function assignmentStateOf(d: Decision): AssignmentState {
  return d.result.kind === "owner" ? "assigned" : d.result.kind === "held" ? "held_for_review" : "unassigned_needs_review";
}

/** Decide one lead and explain it in the spec's stages. Writes nothing. */
export function evaluate(body: RouterBody, f: Facts, o: { source?: SourceView | null } = {}): Evaluation {
  const decision = decide(body, f);
  const steps = decision.steps;
  const state = assignmentStateOf(decision);
  const effect = effectOf(decision.result, f);
  const previousOwner = f.owner?.user ?? null;

  const fields = fieldsUsed(body);
  const values = fields.map((field) => {
    const value = f.values[field] ?? null;
    return { field, value, known: !blank(value), source: f.provenance?.[field]?.source ?? (blank(value) ? ("unknown" as const) : ("crm" as const)) };
  });

  const spam = find(steps, "spam");
  const check = find(steps, "check");
  const checks: Trace["checks"] = check
    ? { result: "held", reason: check.reason }
    : spam && !spam.ok
      ? { result: "held", reason: "spam", signals: spam.signals }
      : { result: "passed" };

  const owners = find(steps, "owners");
  let ownership: Trace["ownership"];
  if (owners) {
    ownership = {
      enabled: !owners.off,
      order: owners.order,
      candidates: owners.candidates.map((c) => ({ kind: c.kind, user: c.user, outcome: c.picked ? "picked" : c.user ? "skipped" : "none", ...(c.why ? { reason: c.why } : c.miss ? { reason: c.miss } : {}) })),
    };
  } else {
    const account = find(steps, "account");
    const keep = find(steps, "keep");
    const order: OwnerKind[] = [...(account && !account.off ? (["company"] as const) : []), ...(keep && !keep.off ? (["contact"] as const) : [])];
    const cand = (kind: OwnerKind, s: Step<"account"> | Step<"keep"> | undefined) =>
      !s || s.off ? [] : [{ kind, user: s.backup ?? s.owner ?? null, outcome: (s.ok ? "picked" : s.owner ? "skipped" : "none") as "picked" | "skipped" | "none", ...(s.unavailable ? { reason: s.unavailable.why } : s.miss ? { reason: s.miss } : {}) }];
    ownership = { enabled: order.length > 0, order, candidates: [...cand("company", account), ...cand("contact", keep)] };
  }

  const rs = find(steps, "rules");
  const rules: Trace["rules"] = {
    evaluated: [...(rs?.skipped ?? []).map((x) => ({ id: x.id, name: x.name, matched: false })), ...(rs?.rule ? [{ id: rs.rule.id, name: rs.rule.name, matched: true }] : [])],
    matched: rs?.rule ? { id: rs.rule.id, name: rs.rule.name } : null,
    notEvaluated: rs?.notEvaluated ?? [],
    usedDefault: !rs?.rule && (!!find(steps, "fallback") || !!find(steps, "queue")),
  };

  const queue = find(steps, "queue");
  const fallback = find(steps, "fallback");
  const backup = find(steps, "backup");
  const rule = rs?.rule;
  let destination: Trace["distribution"]["destination"] = null;
  if (rule?.then === "hold") destination = { kind: "review", id: null, name: null };
  else if (rule?.then === "owner") destination = { kind: "owner", id: rs?.owner ?? null, name: null };
  else if (rule?.then === "user") destination = { kind: "user", id: rule.user ?? null, name: f.reps[rule.user ?? ""]?.name ?? null };
  else if (queue) destination = { kind: "queue", id: queue.queue.id, name: queue.queue.name };
  else if (fallback && body.fallback) destination = { kind: body.fallback.kind, id: body.fallback.id, name: body.fallback.kind === "user" ? (f.reps[body.fallback.id]?.name ?? null) : (body.queues.find((q) => q.id === body.fallback!.id)?.name ?? f.teams?.[body.fallback.id]?.name ?? null) };
  const distribution: Trace["distribution"] = {
    destination,
    next: queue?.next ?? null,
    excluded: (queue?.others ?? []).filter((x): x is typeof x & { why: Why } => !!x.why).map((x) => ({ user: x.user, reason: x.why })),
    suggested: decision.result.kind === "owner" ? decision.result.user : null,
    backup: backup ? { to: backup.to?.name ?? null, picked: backup.picked ?? null, ...(backup.why ? { reason: backup.why } : {}) } : null,
  };

  const r = decision.result;
  const assignment: Trace["assignment"] = {
    state,
    effect,
    recipient: r.kind === "owner" ? r.user : null,
    previousOwner,
    ...(r.kind === "held" ? { reason: r.reason ?? (r.signals.includes("rule") ? "rule" : "spam") } : r.kind === "unassigned" ? { reason: r.reason ?? "no_eligible_recipient" } : {}),
  };

  const src = o.source;
  const meetingType = src?.outcome === "assign_and_calendar" ? (rule && body.rules.list.find((x) => x.id === rule.id)?.meet) || (r.kind === "owner" && r.by === "fallback" ? body.fallback?.meet : undefined) || src.meetingTypeId : null;
  const booking: Trace["booking"] =
    !src || src.outcome === "assign_only"
      ? { outcome: "not_requested", host: null, meetingType: null }
      : r.kind !== "owner"
        ? { outcome: "follow_up", host: null, meetingType: meetingType ?? null }
        : src.slots === false
          ? { outcome: "no_slots_follow_up", host: r.user, meetingType: meetingType ?? null }
          : { outcome: "calendar", host: r.user, meetingType: meetingType ?? null };

  const c = f.company;
  return {
    decision,
    state,
    effect,
    trace: {
      semantics: body.v === 2 ? "v2" : "v1",
      input: {
        values,
        missing: values.filter((v) => !v.known).map((v) => v.field),
        issues: (f.issues ?? []).map((i) => ({ code: i.code, field: i.field })),
        previousOwner,
        company: c ? { id: c.id, name: c.name, match: f.companyMatch?.kind ?? "linked" } : null,
      },
      checks,
      ownership,
      rules,
      distribution,
      assignment,
      booking,
    },
  };
}

/**
 * A short fingerprint of a policy and the team setup it was tested with (Section 16's test evidence): any change to
 * either gives a new one. Live queue positions and counts are left out, so normal traffic never makes evidence stale.
 * `extra`: more of the release that a test covers (its sources' outcomes and mappings).
 */
export function fingerprint(body: RouterBody, teams?: Facts["teams"], extra?: unknown): string {
  const t = Object.fromEntries(Object.entries(teams ?? {}).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => [k, { id: v.id, method: v.method, strict: v.strict, hoursOnly: v.hoursOnly, members: v.members.map((m) => [m.user, m.weight, m.position]) }]));
  const text = stable(extra === undefined ? { body, teams: t } : { body, teams: t, extra });
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v as object)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v ?? null);
}
