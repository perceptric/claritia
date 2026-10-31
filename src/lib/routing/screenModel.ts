// What the Routing screens show, worked out from real records (docs/routing-workflow.md Sections 4, 7, 11, 16-18):
// a policy's state label, its rules as one line each, what a draft changes against the live version, what moving a
// migrated policy to the spec's rules changes, the tester's trace in words, and Activity's badges. Pure: the editor,
// the tester and the server's publish review all use it, so what a person reads is what the server checks.

import { BASE_FIELDS, countryName, needsValue, type FieldDef, type FieldType } from "../router/conditions.ts";
import type { Cond, Op, Rule, RouterBody } from "../router/types.ts";
import { fingerprint, type Trace } from "./evaluate.ts";
import type { Outcome } from "./states.ts";

export type Names = { people: Record<string, string>; teams: Record<string, string> };

const first = (n: string) => n.split(" ")[0] ?? n;

// Policy state (Section 4) ------------------------------------------------------------------------------------------

export type PolicyRow = {
  id: string;
  name: string;
  draft_name: string | null;
  is_default: boolean;
  archived: boolean;
  active_version: number | null;
  draft_revision: number;
  draft: RouterBody | null;
  live: RouterBody | null;
  live_sources: number;
  staged: number;
  last_run: string | null;
};

/** Whether a draft differs from what's live: its config, a staged name, or staged source changes. */
export function hasChanges(p: Pick<PolicyRow, "draft" | "live" | "draft_name" | "staged">): boolean {
  if (p.draft_name) return true;
  if (p.staged > 0) return true;
  if (!p.draft) return false;
  if (!p.live) return true;
  return fingerprint(p.draft) !== fingerprint(p.live);
}

export function policyState(p: Pick<PolicyRow, "archived" | "active_version" | "draft" | "live" | "draft_name" | "staged" | "live_sources">): { label: string; tone: "gray" | "green" | "amber"; changed: boolean } {
  const changed = hasChanges(p);
  if (p.archived) return { label: "Archived", tone: "gray", changed };
  if (!p.active_version) return { label: "Draft", tone: "gray", changed: true };
  if (changed) return { label: `Published v${p.active_version} · draft changes`, tone: "amber", changed };
  if (!p.live_sources) return { label: `Published v${p.active_version} · not connected`, tone: "gray", changed };
  return { label: `Published v${p.active_version}`, tone: "green", changed };
}

// Destinations ----------------------------------------------------------------------------------------------------

/** Where a rule, Everyone else or the backup sends a lead: a team (by its key), one person, or a person's review. */
export type Dest = { kind: "team"; key: string } | { kind: "person"; id: string } | { kind: "review" } | null;

export function ruleDest(r: Rule): Dest {
  const then = r.then ?? "queue";
  if (then === "hold") return { kind: "review" };
  if (then === "user") return r.user ? { kind: "person", id: r.user } : null;
  if (then === "queue") return r.queue ? { kind: "team", key: r.queue } : null;
  return null;
}

export function withRuleDest(r: Rule, d: Dest): Rule {
  const { then: _t, user: _u, ...rest } = r;
  void _t;
  void _u;
  if (!d) return { ...rest, queue: "" };
  if (d.kind === "review") return { ...rest, queue: "", then: "hold" };
  if (d.kind === "person") return { ...rest, queue: "", then: "user", user: d.id };
  return { ...rest, queue: d.key };
}

export const fallbackDest = (b: RouterBody): Dest => (!b.fallback ? null : b.fallback.kind === "user" ? { kind: "person", id: b.fallback.id } : { kind: "team", key: b.fallback.id });
export const backupDest = (b: RouterBody): Dest => {
  const x = b.backup ?? { kind: "review" as const };
  return x.kind === "user" ? { kind: "person", id: x.id } : x.kind === "queue" ? { kind: "team", key: x.id } : { kind: "review" };
};

export function destName(d: Dest, n: Names): string {
  if (!d) return "Select";
  if (d.kind === "review") return "Manual review";
  if (d.kind === "person") return n.people[d.id] ?? "Former teammate";
  return n.teams[d.key] ?? "Removed team";
}

export const destValue = (d: Dest): string => (!d ? "" : d.kind === "review" ? "review" : d.kind === "person" ? `p:${d.id}` : `t:${d.key}`);
export const destFrom = (v: string): Dest => (v === "review" ? { kind: "review" } : v.startsWith("p:") ? { kind: "person", id: v.slice(2) } : v.startsWith("t:") ? { kind: "team", key: v.slice(2) } : null);

/**
 * The policy's recipients follow its destinations (Section 10): the people and teams its rules, Everyone else and the
 * backup name, so the scope is always explicit and never wider than where leads can go. A migrated policy that let
 * every member receive leads keeps that.
 */
export function withScope(b: RouterBody): RouterBody {
  if (b.v !== 2 || b.scope?.everyone) return b;
  const people = new Set<string>();
  const teams = new Set<string>();
  const add = (d: Dest) => {
    if (d?.kind === "person") people.add(d.id);
    if (d?.kind === "team") teams.add(d.key);
  };
  for (const r of b.rules.list) add(ruleDest(r));
  add(fallbackDest(b));
  add(backupDest(b));
  return { ...b, scope: { everyone: false, people: [...people], teams: [...teams] } };
}

/**
 * A migrated policy (v1) in the editor: the same rules on the spec's semantics (Section 24 step 9: a reviewed change,
 * never a silent one). Every member stays in scope, existing owners are kept in the order the old steps had them,
 * review goes to `reviewer`, and the queues the database already has as teams are referenced, not copied.
 */
export function toV2(b: RouterBody, o: { reviewer: string | null; teamKeys: Set<string> }): RouterBody {
  if (b.v === 2) return b;
  return {
    ...b,
    v: 2,
    queues: b.queues.filter((q) => !o.teamKeys.has(q.id)),
    scope: { everyone: true, people: [], teams: [] },
    ownership: { order: [...(b.account.on ? (["company"] as const) : []), ...(b.keep.on ? (["contact"] as const) : [])], capBlocksNew: true },
    backup: { kind: "review" },
    review: { owner: b.review?.owner ?? o.reviewer },
  };
}

/** What moving a migrated policy onto the spec's rules changes (docs/routing-current-to-target.md Part 3). */
export function semanticsChanges(live: RouterBody | null, draft: RouterBody): string[] {
  if (draft.v !== 2 || !live || live.v === 2) return [];
  return [
    "“Is not” and “is not one of” no longer match a lead whose value is unknown",
    "A number test on a range passes only when the whole range does",
    "Text that isn't a whole number counts as unknown",
    "An owner who is paused or out of office is skipped, not kept",
    "A company owner at their daily cap is skipped",
    "A team with nobody available goes to the backup once, then review",
    "Several companies matching one email go to review",
    "A form answer of the wrong type goes to review",
  ];
}

// Conditions (Section 11) -----------------------------------------------------------------------------------------

/** The comparisons the editor offers for a field type (Section 11). A saved rule's other comparison stays shown. */
export function opsOf(type: FieldType): { value: Op; label: string }[] {
  switch (type) {
    case "number":
      return [
        { value: "gte", label: "at least" },
        { value: "lte", label: "at most" },
        { value: "is", label: "equals" },
        { value: "filled", label: "is known" },
        { value: "empty", label: "is unknown" },
      ];
    case "country":
    case "choice":
      return [
        { value: "one_of", label: "is" },
        { value: "not_one_of", label: "is not" },
        { value: "filled", label: "is known" },
        { value: "empty", label: "is unknown" },
      ];
    case "bool":
      return [
        { value: "is", label: "is" },
        { value: "filled", label: "is known" },
        { value: "empty", label: "is unknown" },
      ];
    default:
      return [
        { value: "is", label: "is" },
        { value: "filled", label: "is known" },
        { value: "empty", label: "is unknown" },
      ];
  }
}

const OTHER_OPS: Partial<Record<Op, string>> = { is_not: "is not", contains: "contains", starts_with: "starts with", gt: "more than", lt: "less than", between: "between", one_of: "is one of", not_one_of: "is not one of" };

export function opLabel(op: Op, type: FieldType): string {
  return opsOf(type).find((o) => o.value === op)?.label ?? OTHER_OPS[op] ?? op;
}

export const fieldOf = (key: string, fields: FieldDef[]): FieldDef => fields.find((f) => f.key === key) ?? BASE_FIELDS.find((f) => f.key === key) ?? { key, label: key.replace(/^[a-z]+\.(f\.)?/, "").replace(/_/g, " "), group: "Contact", type: "text" };

/** A new condition for a field: its first comparison, no value yet (incomplete until filled, never a catch-all). */
export function newCond(f: FieldDef): Cond {
  const op = opsOf(f.type)[0]!.value;
  return { field: f.key, op, value: op === "one_of" ? [] : "" };
}

function valueWords(c: Cond, f: FieldDef): string {
  const list = Array.isArray(c.value) ? c.value : c.value === undefined || c.value === "" ? [] : [c.value];
  if (!list.length) return "…";
  return list.map((v) => (f.type === "country" && typeof v === "string" && !v.startsWith("t:") ? countryName(v) : String(v))).join(" or ");
}

/** One condition as the rule row shows it: "Country = US", "Employees ≥ 201", "Country is unknown". */
export function condText(c: Cond, fields: FieldDef[]): string {
  const f = fieldOf(c.field, fields);
  if (!needsValue(c.op)) return `${f.label} ${c.op === "filled" ? "is known" : "is unknown"}`;
  const sym: Partial<Record<Op, string>> = { gte: "≥", lte: "≤", gt: ">", lt: "<", is: "=", is_not: "≠", one_of: "=", not_one_of: "≠" };
  if (c.op === "between" && Array.isArray(c.value)) return `${f.label} between ${c.value[0] ?? "…"} and ${c.value[1] ?? "…"}`;
  if (sym[c.op]) return `${f.label} ${sym[c.op]} ${valueWords(c, f)}`;
  return `${f.label} ${opLabel(c.op, f.type)} ${valueWords(c, f)}`;
}

/** A rule's conditions in one line, with its grouping: "Country = US AND Employees ≥ 201". */
export const condSummary = (r: Rule, fields: FieldDef[]): string => (r.conds.length ? r.conds.map((c) => condText(c, fields)).join(r.match === "any" ? " OR " : " AND ") : "No conditions");

/** Why a rule can't be published yet, for its row and its editor (Section 7: field-level errors). */
export function ruleProblem(r: Rule, fields: FieldDef[], teamKeys?: Set<string>): string | null {
  if (!r.name.trim()) return "Add a name";
  if (!r.conds.length) return "Add at least one condition";
  for (const c of r.conds) {
    if (!needsValue(c.op)) continue;
    const list = Array.isArray(c.value) ? c.value : c.value === undefined || c.value === "" ? [] : [c.value];
    if (!list.length) return "A condition has no value";
    const f = fieldOf(c.field, fields);
    if (f.type === "number" && list.some((v) => typeof v !== "number" || !Number.isFinite(v))) return `${f.label} must be a number`;
    if (c.field === "company.employees" && list.some((v) => typeof v === "number" && (v < 1 || !Number.isInteger(v)))) return "Employees must be a whole number";
  }
  const d = ruleDest(r);
  if (!d) return "Choose a destination";
  if (d.kind === "team" && teamKeys && !teamKeys.has(d.key)) return "The team is gone";
  return null;
}

// Changes (Section 17's review) ---------------------------------------------------------------------------------------

export type SourceChange = { name: string; text: string };

/** The draft against the live version, as short sentences, in the order the editor shows its sections. */
export function changesBetween(live: RouterBody | null, draft: RouterBody, o: { names: Names; fields: FieldDef[]; rename?: string | null; sources?: SourceChange[] }): string[] {
  const out: string[] = [];
  if (o.rename) out.push(`Renamed to ${o.rename}`);
  for (const s of o.sources ?? []) out.push(`${s.name}: ${s.text}`);
  if (!live) {
    out.push(draft.rules.list.length ? `${draft.rules.list.length} ${draft.rules.list.length === 1 ? "rule" : "rules"}` : "No rules");
    out.push(`Everyone else goes to ${destName(fallbackDest(draft), o.names)}`);
    return out;
  }
  if (live.spam.on !== draft.spam.on) out.push(draft.spam.on ? "Spam is now held" : "Spam is no longer held");
  const order = (b: RouterBody) => (b.v === 2 ? (b.ownership?.order ?? []) : [...(b.account.on ? ["company"] : []), ...(b.keep.on ? ["contact"] : [])]).join(",");
  if (order(live) !== order(draft)) out.push(!draft.ownership?.order.length ? "Existing owners are no longer kept" : draft.ownership.order[0] === "contact" ? "Contact owner is kept first" : "Company owner is kept first");
  live.rules.list.forEach((r, i) => {
    const j = draft.rules.list.findIndex((x) => x.id === r.id);
    if (j === -1) out.push(`Removed rule ${r.name}`);
    else {
      const d = draft.rules.list[j]!;
      if (j !== i) out.push(`Moved ${d.name} to position ${j + 1}`);
      else if (JSON.stringify({ ...d, name: r.name }) !== JSON.stringify(r)) out.push(`Changed rule ${d.name}`);
      if (d.name !== r.name) out.push(`Renamed rule ${r.name} to ${d.name}`);
    }
  });
  for (const r of draft.rules.list) if (!live.rules.list.some((x) => x.id === r.id)) out.push(`Added rule ${r.name || "Untitled rule"}`);
  if (destValue(fallbackDest(live)) !== destValue(fallbackDest(draft))) out.push(`Everyone else now goes to ${destName(fallbackDest(draft), o.names)}`);
  if (destValue(backupDest(live)) !== destValue(backupDest(draft)) && draft.v === 2) out.push(`Backup is now ${destName(backupDest(draft), o.names)}`);
  if ((live.review?.owner ?? null) !== (draft.review?.owner ?? null) && draft.review?.owner) out.push(`${o.names.people[draft.review.owner] ?? "Someone"} now reviews held leads`);
  if (live.v !== 2 && draft.v === 2) out.push("Moves to the new routing rules");
  return out;
}

// Sources (Section 8) -------------------------------------------------------------------------------------------------

export type SourceRow = {
  id: string;
  kind: "form" | "handoff";
  form_id: string | null;
  name: string;
  enabled: boolean;
  policy_id: string | null;
  follows_default: boolean;
  outcome: Outcome;
  meeting_type_id: string | null;
  mappings: { field: string; target: string; type: string; required?: boolean }[];
  no_slots: Record<string, unknown>;
  /** A disconnected form's new leads: kept as before ("none") or sent to review (097). */
  when_off?: "none" | "review";
  /** Made for a new form and never edited: it follows the form's own after-submit setting at each form publish (097). */
  auto?: boolean;
  live_revision: number;
  draft: { policy_id?: string | null; enabled?: boolean; outcome?: Outcome; meeting_type_id?: string | null; mappings?: SourceRow["mappings"]; no_slots?: Record<string, unknown>; when_off?: "none" | "review" } | null;
  draft_revision: number;
};

/** A source as it would be once this policy's draft is published: its staged change for this policy over its live one. */
export function effectiveSource(s: SourceRow, policy: string): { connected: boolean; enabled: boolean; outcome: Outcome; meetingTypeId: string | null; mappings: SourceRow["mappings"]; noSlots: Record<string, unknown>; pending: boolean } {
  const staged = s.draft && (s.draft.policy_id ?? null) === policy ? s.draft : null;
  const movingAway = !!s.draft && (s.draft.policy_id ?? null) !== policy && s.policy_id === policy;
  return {
    connected: staged ? true : s.policy_id === policy && !movingAway,
    enabled: staged ? (staged.enabled ?? s.enabled) : s.enabled,
    outcome: staged?.outcome ?? s.outcome,
    meetingTypeId: staged && "meeting_type_id" in staged ? (staged.meeting_type_id ?? null) : s.meeting_type_id,
    mappings: staged?.mappings ?? s.mappings,
    noSlots: staged?.no_slots ?? s.no_slots,
    pending: !!staged || movingAway,
  };
}

/** The sources a policy's draft would serve, and the staged changes its publish turns on. */
export function releaseSources(sources: SourceRow[], policy: string): { serving: (SourceRow & { eff: ReturnType<typeof effectiveSource> })[]; staged: { id: string; revision: number }[] } {
  const serving = sources.map((s) => ({ ...s, eff: effectiveSource(s, policy) })).filter((s) => s.eff.connected);
  const staged = sources.filter((s) => s.draft && (s.draft.policy_id ?? null) === policy).map((s) => ({ id: s.id, revision: s.draft_revision }));
  return { serving, staged };
}

/** The tested release's fingerprint: the draft, the teams it names, and its sources' outcomes and mappings. */
export function releaseFingerprint(body: RouterBody, teams: Parameters<typeof fingerprint>[1], sources: ReturnType<typeof releaseSources>["serving"]): string {
  const src = [...sources]
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((s) => ({ id: s.id, enabled: s.eff.enabled, outcome: s.eff.outcome, meeting: s.eff.meetingTypeId, mappings: s.eff.mappings, noSlots: s.eff.noSlots }));
  return fingerprint(body, teams, { sources: src });
}

export const outcomeWords = (o: Outcome, meeting: string | null) => (o === "assign_and_calendar" ? `Assign and show calendar${meeting ? ` · ${meeting}` : ""}` : "Assign only");

// The tester's trace in words (Section 16) ---------------------------------------------------------------------------

const WHY: Record<string, string> = {
  not_member: "not in the workspace",
  out_of_scope: "outside this policy's recipients",
  passed: "let it wait past the response time",
  paused: "paused",
  out: "out of office",
  cap_day: "at daily cap",
  cap_week: "at weekly cap",
  hours: "outside working hours",
  no_owner: "none",
  no_company: "none",
  unmapped: "a CRM owner with no teammate linked",
  same_person: "the same person",
};
export const whyWords = (w: string | undefined) => (w ? (WHY[w] ?? w.replace(/_/g, " ")) : "");

const CHECK_WORDS: Record<string, string> = {
  spam: "Held as suspected spam",
  rule: "Held by a rule",
  source_mapping_mismatch: "Held: a form answer doesn't fit its routing field",
  multiple_companies: "Held: several companies match this email",
};

export type TraceWords = { k: string; v: { t: string; faint?: boolean }[] }[];

/** The seven stages as the tester shows them. `test`: wording for a preview ("Would…"), else for a real run. */
export function traceWords(t: Trace, o: { names: Names; fields: FieldDef[]; reviewer: string | null; meetingName?: string | null; test: boolean; email?: string | null }): TraceWords {
  const who = (u: string | null | undefined) => (u ? (o.names.people[u] ?? "Former teammate") : "Nobody");
  const input = t.input.values.map((x) => {
    const f = fieldOf(x.field, o.fields);
    const shown = !x.known ? "unknown" : f.type === "country" && typeof x.value === "string" ? countryName(x.value) : Array.isArray(x.value) ? x.value.join(", ") : String(x.value);
    return { t: `${f.label} ${shown}`, faint: !x.known };
  });
  if (o.email !== undefined) input.unshift({ t: `Work email ${o.email || "missing"}`, faint: !o.email });
  for (const i of t.input.issues) input.push({ t: `${fieldOf(i.field, o.fields).label}: answer doesn't fit`, faint: false });
  if (t.input.company) input.push({ t: `Company ${t.input.company.name}`, faint: false });
  const checks = t.checks.result === "held" ? [{ t: CHECK_WORDS[t.checks.reason ?? "spam"] ?? "Held" }] : [{ t: "Passed" }];
  const ownership = !t.ownership.enabled
    ? [{ t: "Existing ownership is off" }]
    : t.ownership.candidates.length
      ? t.ownership.candidates.map((c) => {
          const label = c.kind === "company" ? "Company owner" : "Contact owner";
          if (!c.user) return { t: `${label}: none` };
          if (c.outcome === "picked") return { t: `${label} ${who(c.user)}: selected` };
          return { t: `${label} ${who(c.user)}: skipped, ${whyWords(c.reason)}` };
        })
      : [{ t: "Not checked" }];
  const picked = t.ownership.candidates.some((c) => c.outcome === "picked");
  const rules: TraceWords[number]["v"] = [];
  if (picked) rules.push({ t: "Not evaluated, existing owner selected", faint: true });
  else if (t.checks.result === "held") rules.push({ t: "Not evaluated", faint: true });
  else {
    for (const r of t.rules.evaluated) rules.push({ t: `${r.name}: ${r.matched ? "matched" : "no match"}` });
    for (const r of t.rules.notEvaluated) rules.push({ t: `${r.name}: not evaluated`, faint: true });
    if (t.rules.usedDefault || (!t.rules.matched && t.distribution.destination)) rules.push({ t: `Everyone else → ${t.distribution.destination?.name ?? (t.distribution.destination?.kind === "user" ? who(t.distribution.destination.id) : "Manual review")}` });
  }
  const dist: TraceWords[number]["v"] = [];
  const d = t.distribution;
  if (d.destination?.kind === "queue") {
    for (const x of d.excluded) dist.push({ t: `${who(x.user)}: skipped, ${whyWords(x.reason)}` });
    if (d.suggested && !d.backup) dist.push({ t: `${d.destination.name ?? "Team"}: ${who(d.suggested)} is next` });
  } else if (d.destination?.kind === "user" && d.suggested) dist.push({ t: `${who(d.suggested)}` });
  if (d.backup) {
    dist.push({ t: `No eligible member in ${d.destination?.name ?? "the destination"}. Backup: ${d.backup.to ?? "Manual review"}` });
    if (d.backup.picked) dist.push({ t: `${who(d.backup.picked)} selected` });
  }
  if (!dist.length) dist.push({ t: "Not needed", faint: true });
  const a = t.assignment;
  const assign =
    a.state === "assigned"
      ? a.effect === "retained"
        ? `${o.test ? "Would retain" : "Kept"} ${who(a.recipient)}. No new quota, no team turn`
        : `${o.test ? "Would newly assign" : "Assigned to"} ${who(a.recipient)}. Quota +1${d.destination?.kind === "queue" && !picked ? ", team turn advances" : ", no team turn"}`
      : `No new assignment; needs review by ${who(o.reviewer)}`;
  const b = t.booking;
  const meeting = o.meetingName ?? "the meeting";
  const booking =
    b.outcome === "calendar"
      ? `Shows ${who(b.host)}'s calendar for ${meeting}`
      : b.outcome === "no_slots_follow_up"
        ? `No slots. Thank-you message; one follow-up task for ${who(b.host)}`
        : b.outcome === "follow_up"
          ? "Thank-you message, no calendar"
          : "Thank-you message, no meeting";
  return [
    { k: "Input", v: input.length ? input : [{ t: "No routing fields", faint: true }] },
    { k: "Checks", v: checks },
    { k: "Ownership", v: ownership },
    { k: "Rules", v: rules.length ? rules : [{ t: "No rules", faint: true }] },
    { k: "Distribution", v: dist },
    { k: "Assignment", v: [{ t: assign }] },
    { k: "Visitor sees", v: [{ t: booking }] },
  ];
}

// Activity (Section 18) ---------------------------------------------------------------------------------------------

type Tone = "gray" | "green" | "amber" | "red";

export function assignmentBadge(state: string | null, effect: string | null, kind: string): { label: string; tone: Tone } {
  const s = state ?? (kind === "owner" ? "assigned" : kind === "held" ? "held_for_review" : "unassigned_needs_review");
  if (s === "assigned") return effect === "retained" ? { label: "Retained", tone: "green" } : { label: "Assigned", tone: "green" };
  if (s === "held_for_review") return { label: "Held for review", tone: "amber" };
  if (s === "unassigned_needs_review") return { label: "Needs review", tone: "amber" };
  if (s === "failed") return { label: "Failed", tone: "red" };
  if (s === "excluded") return { label: "Excluded", tone: "gray" };
  return { label: "Pending", tone: "gray" };
}

const BOOKING_REASON: Record<string, string> = { no_slots: "No slots", calendar_disconnected: "Calendar disconnected", permission_error: "Calendar permission", timeout: "Calendar timed out", unknown: "Availability unknown", slot_taken: "Time taken" };

export function bookingBadge(state: string | null, reason: string | null): { label: string; tone: Tone } {
  switch (state) {
    case "awaiting_selection":
      return { label: "Awaiting selection", tone: "gray" };
    case "pending_confirmation":
      return reason === "outcome_unknown" ? { label: "Outcome unknown", tone: "amber" } : { label: "Pending confirmation", tone: "amber" };
    case "confirmed":
      return { label: "Confirmed", tone: "green" };
    case "unavailable":
      return { label: BOOKING_REASON[reason ?? ""] ?? "Unavailable", tone: reason === "no_slots" ? "amber" : "red" };
    case "abandoned":
      return { label: "Abandoned", tone: "gray" };
    case "cancelled":
      return { label: "Cancelled", tone: "gray" };
    case "failed":
      return { label: reason === "provider_error" ? "Calendar event failed" : "Failed", tone: "red" };
    default:
      return { label: "Not requested", tone: "gray" };
  }
}

/** A run's CRM sync (Section 22), only when it matters. */
export function syncBadge(state: string | null): { label: string; tone: Tone } | null {
  if (state === "pending") return { label: "Sync pending", tone: "gray" };
  if (state === "complete") return { label: "Synced", tone: "green" };
  if (state === "failed") return { label: "Sync failed", tone: "red" };
  return null;
}

/** What can be done about a real run (Section 18's error table), for the person looking at it. */
export type Recovery = "approve" | "resume_child" | "assign" | "dismiss" | "reopen" | "reassign" | "reconnect" | "resume_booking" | "reconcile" | "retry_sync";

export type RecoveryRun = {
  kind: string;
  owner: string | null;
  review: { state: string; reviewer: string } | null;
  booking_state: string | null;
  booking_reason: string | null;
  sync_state: string | null;
  meeting: { id: string } | null;
  owner_calendar: { status: string } | null;
  submission_id: string | null;
};

/**
 * Each failure gets its own step's recovery, never a blind reallocation: a review item is approved and routed by an
 * explicit child attempt (or resumed while one runs), assigned by hand, dismissed or reopened; a disconnected calendar
 * is reconnected before its booking resumes with the same owner; an unknown calendar outcome is checked with the same
 * provider key; a failed CRM sync is pushed again. The server checks each again (src/lib/routing/access.ts).
 */
export function recoveryActions(r: RecoveryRun, who: { me: string; role: "owner" | "member" }): Recovery[] {
  const out: Recovery[] = [];
  const reviewer = !!r.review && (who.role === "owner" || r.review.reviewer === who.me);
  if (r.review && reviewer) {
    if (r.review.state === "open" || r.review.state === "approved_pending_execution") out.push("approve", "assign", "dismiss");
    else if (r.review.state === "in_progress") out.push("resume_child");
    else if (r.review.state === "dismissed") out.push("reopen");
  }
  const recover = who.role === "owner" || (!!r.owner && r.owner === who.me);
  const calendarOk = r.owner_calendar?.status === "ok";
  if (recover && r.kind === "owner" && r.owner) {
    const unknown = (r.booking_state === "pending_confirmation" && r.booking_reason === "outcome_unknown") || (r.booking_state === "failed" && !!r.meeting);
    if (unknown) out.push(calendarOk ? "reconcile" : "reconnect");
    else if (!r.meeting && r.submission_id && (r.booking_state === "unavailable" || r.booking_state === "abandoned" || r.booking_state === "failed"))
      out.push(calendarOk ? "resume_booking" : "reconnect");
    if (r.sync_state === "failed") out.push("retry_sync");
  }
  if (who.role === "owner" && r.kind === "owner" && !out.includes("assign")) out.push("reassign");
  return out;
}

export const REVIEW_WORDS: Record<string, string> = { open: "Open", approved_pending_execution: "Approved, not run yet", in_progress: "In progress", resolved: "Resolved", dismissed: "Dismissed" };

/** Why a run went where it did, in a few words. */
export function reasonWords(r: { kind: string; by: string | null; rule_name: string | null; held: unknown; review?: { reason: string } | null; effect?: string | null }): string {
  if (r.kind === "held") return r.review?.reason === "rule" ? "Held by a rule" : r.review?.reason === "source_mapping_mismatch" ? "Form answer doesn't fit" : r.review?.reason === "multiple_companies" ? "Several companies match" : "Suspected spam";
  if (r.kind === "unassigned") return "Nobody available";
  switch (r.by) {
    case "account":
      return "Kept company owner";
    case "keep":
      return "Kept contact owner";
    case "fallback":
      return "Everyone else";
    case "backup":
      return "Backup";
    case "hand":
      return "Chosen by hand";
    default:
      return r.rule_name ?? "Everyone else";
  }
}

export const firstName = first;
