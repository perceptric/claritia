// Validating a policy before it's published (docs/routing-workflow.md Section 17): blocking errors and warnings that
// need a look, each tied to where it is. v1 bodies keep their old checks (`problems`), so the current Routing screens
// publish as before; v2 bodies also need a review owner, a scope that covers every destination, a backup that isn't
// itself a destination, typed values that fit their field, and a meeting type for every calendar source. Only claims
// what it can establish: a later rule is called shadowed only when an earlier one has the very same conditions.
// Runs in the browser and on the server.

import { problems, type Where } from "../router/check.ts";
import { BASE_FIELDS, needsValue, type FieldDef } from "../router/conditions.ts";
import type { Queue, RouterBody, TeamFacts } from "../router/types.ts";
import type { Outcome } from "./states.ts";

export type Issue = { code: string; where: Where | { kind: "policy" | "source"; id?: string }; text: string };

export type SourceRef = { id: string; name: string; enabled: boolean; outcome: Outcome; meetingTypeId: string | null };

export type ValidateCtx = {
  members: Set<string>;
  fields?: FieldDef[];
  /** The workspace's teams by key (routing_teams through routing_team_keys). */
  teams?: Record<string, Pick<TeamFacts, "name" | "members">>;
  /** The sources this policy would serve once published. */
  sources?: SourceRef[];
  meetingTypes?: Set<string>;
};

export const NAME_MAX = 80;

/** A policy's name: trimmed, not empty, at most 80 characters. */
export function nameProblem(raw: unknown): string | null {
  const n = typeof raw === "string" ? raw.trim() : "";
  if (!n) return "Name the policy.";
  if (n.length > NAME_MAX) return `Keep the name to ${NAME_MAX} characters.`;
  return null;
}

/** The body with the workspace's teams it names but doesn't copy, so the old checks see their members. */
function withTeams(body: RouterBody, teams: ValidateCtx["teams"]): RouterBody {
  if (!teams) return body;
  const have = new Set(body.queues.map((q) => q.id));
  const extra: Queue[] = Object.entries(teams)
    .filter(([k]) => !have.has(k))
    .map(([id, t]) => ({ id, name: t.name, method: "rr", strict: false, hoursOnly: false, members: [...t.members].sort((a, b) => a.position - b.position).map((m) => ({ user: m.user, weight: m.weight })) }));
  return extra.length ? { ...body, queues: [...body.queues, ...extra] } : body;
}

export function validatePolicy(body: RouterBody, ctx: ValidateCtx): { errors: Issue[]; warnings: Issue[] } {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const full = withTeams(body, ctx.teams);
  for (const p of problems(full, { members: ctx.members, fields: ctx.fields })) errors.push({ code: "invalid_configuration", where: p.where, text: p.text });

  const membersOf = (id: string) => full.queues.find((q) => q.id === id)?.members.map((m) => m.user) ?? [];
  const destinations: { kind: "queue" | "user"; id: string; where: Where }[] = [];
  for (const r of body.rules.on ? body.rules.list : []) {
    if (r.on === false) continue;
    const then = r.then ?? "queue";
    if (then === "queue") destinations.push({ kind: "queue", id: r.queue, where: { kind: "rule", id: r.id } });
    if (then === "user") {
      if (!r.user) errors.push({ code: "invalid_configuration", where: { kind: "rule", id: r.id }, text: `"${r.name}" needs a person` });
      else destinations.push({ kind: "user", id: r.user, where: { kind: "rule", id: r.id } });
    }
  }
  if (body.fallback) destinations.push({ kind: body.fallback.kind, id: body.fallback.id, where: { kind: "fallback" } });

  if (body.v === 2) {
    const reviewer = body.review?.owner ?? null;
    if (!reviewer) errors.push({ code: "invalid_configuration", where: { kind: "policy" }, text: "Pick who reviews leads that need a person" });
    else if (!ctx.members.has(reviewer)) errors.push({ code: "invalid_configuration", where: { kind: "policy" }, text: "The reviewer is no longer in the workspace" });

    const scope = body.scope ?? { everyone: false, people: [], teams: [] };
    if (!scope.everyone && !scope.people.length && !scope.teams.length) errors.push({ code: "invalid_configuration", where: { kind: "policy" }, text: "Pick who this policy may assign to" });
    for (const t of scope.teams) if (!full.queues.some((q) => q.id === t)) errors.push({ code: "invalid_configuration", where: { kind: "policy" }, text: "A team in the scope is gone" });
    const inScope = (u: string) => scope.everyone || scope.people.includes(u) || scope.teams.some((t) => membersOf(t).includes(u));
    const outside = (d: { kind: "queue" | "user"; id: string }) => (d.kind === "user" ? !inScope(d.id) : !scope.everyone && !scope.teams.includes(d.id));
    for (const d of destinations) if (outside(d)) errors.push({ code: "invalid_configuration", where: d.where, text: d.kind === "user" ? "This person is outside the policy's scope" : "This team is outside the policy's scope" });

    const b = body.backup ?? { kind: "review" as const };
    if (b.kind === "user" || b.kind === "queue") {
      if (b.kind === "user" && !ctx.members.has(b.id)) errors.push({ code: "invalid_configuration", where: { kind: "fallback" }, text: "The backup is no longer in the workspace" });
      if (b.kind === "queue" && !full.queues.some((q) => q.id === b.id)) errors.push({ code: "invalid_configuration", where: { kind: "fallback" }, text: "The backup team is gone" });
      if (outside(b)) errors.push({ code: "invalid_configuration", where: { kind: "fallback" }, text: "The backup is outside the policy's scope" });
      // One hop only: a backup that is itself a destination would back itself up.
      if (destinations.some((d) => d.kind === b.kind && d.id === b.id)) errors.push({ code: "fallback_cycle", where: { kind: "fallback" }, text: "The backup can't be a destination it backs up" });
    }
    if (b.kind === "default") errors.push({ code: "fallback_cycle", where: { kind: "fallback" }, text: "Pick a backup person or team, or review" });

    // Typed values (Section 11): numbers are numbers; employee counts are whole and positive.
    const fields = ctx.fields ?? BASE_FIELDS;
    for (const r of body.rules.list) {
      for (const c of r.conds) {
        const f = fields.find((x) => x.key === c.field);
        if (f?.type !== "number" || !needsValue(c.op)) continue;
        const list = Array.isArray(c.value) ? c.value : c.value === undefined ? [] : [c.value];
        if (list.some((v) => typeof v !== "number" || !Number.isFinite(v))) errors.push({ code: "invalid_configuration", where: { kind: "rule", id: r.id }, text: `"${r.name}" needs a number for ${f.label.toLowerCase()}` });
        else if (c.field === "company.employees" && list.some((v) => (v as number) < 1 || !Number.isInteger(v))) errors.push({ code: "invalid_configuration", where: { kind: "rule", id: r.id }, text: `"${r.name}": employees is a whole number of at least 1` });
      }
    }
  }

  for (const s of ctx.sources ?? []) {
    if (s.enabled && s.outcome === "assign_and_calendar") {
      if (!s.meetingTypeId) errors.push({ code: "invalid_configuration", where: { kind: "source", id: s.id }, text: `${s.name} shows a calendar but has no meeting type` });
      else if (ctx.meetingTypes && !ctx.meetingTypes.has(s.meetingTypeId)) errors.push({ code: "invalid_configuration", where: { kind: "source", id: s.id }, text: `${s.name}'s meeting type is gone` });
    }
  }
  if (ctx.sources && !ctx.sources.some((s) => s.enabled)) warnings.push({ code: "no_sources", where: { kind: "policy" }, text: "No connected sources" });

  // Shadowed: an earlier enabled rule with exactly the same conditions and grouping always wins.
  const key = (r: RouterBody["rules"]["list"][number]) => `${r.match}|${JSON.stringify([...r.conds].map((c) => JSON.stringify(c)).sort())}`;
  const seen = new Map<string, string>();
  for (const r of body.rules.list) {
    if (r.on === false || !r.conds.length) continue;
    const k = key(r);
    const first = seen.get(k);
    if (first) warnings.push({ code: "shadowed_rule", where: { kind: "rule", id: r.id }, text: `"${r.name}" can't match: "${first}" above has the same conditions` });
    else seen.set(k, r.name);
  }
  for (const d of destinations) if (d.kind === "queue" && full.queues.some((q) => q.id === d.id) && !membersOf(d.id).length) warnings.push({ code: "no_eligible_member", where: d.where, text: "This team has nobody yet" });
  return { errors, warnings };
}
