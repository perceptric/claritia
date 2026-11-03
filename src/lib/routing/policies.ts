// Routing policies on the server (docs/routing-workflow.md Sections 4, 6, 12 and 17): create a named policy once per
// click, save its draft against the revision the editor read, publish one release through one service (Forms and
// Routing both use it), and save teams as operational changes. Every write is a service-role database function
// (095_routing_policies.sql) that checks the workspace again; the caller has already checked the person's role.
// Server only.

import type { Rpc } from "../jobs.ts";
import { cleanBody } from "../router/check.ts";
import { specBody, type RouterBody, type TeamFacts } from "../router/types.ts";
import { failure } from "./states.ts";
import type { Outcome } from "./states.ts";
import { nameProblem, validatePolicy, type Issue, type SourceRef, type ValidateCtx } from "./validate.ts";

export type Caller = { ws: string; user: string | null };

async function call<T>(rpc: Rpc, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw mapped(fn, error.message);
  return data as T;
}

/** A database refusal as the typed error contract. */
function mapped(fn: string, msg: string) {
  if (/draft_conflict|^conflict/.test(msg)) return failure("draft_conflict", "Someone else changed this since you opened it.", { retryable: true });
  if (/not_found/.test(msg)) return failure("not_found", "That's gone.", { retryable: false });
  if (/invalid_configuration/.test(msg)) return failure("invalid_configuration", msg.replace(/^.*invalid_configuration:?\s*/, "") || "Check the setup.", { retryable: false });
  return new Error(`${fn}: ${msg}`);
}

export type PolicyRow = {
  id: string;
  name: string;
  is_default: boolean;
  archived: boolean;
  draft: RouterBody | null;
  draft_revision: number;
  draft_base: number | null;
  active_version: number | null;
  live: RouterBody | null;
  sources: { id: string; kind: "form" | "handoff"; form_id: string | null; name: string; enabled: boolean; policy_id: string | null; outcome: Outcome; meeting_type_id: string | null; live_revision: number; draft: Record<string, unknown> | null; draft_revision: number }[];
};

export async function getPolicy(rpc: Rpc, c: Caller, policy: string): Promise<PolicyRow> {
  const row = await call<PolicyRow | null>(rpc, "routing_policy_get", { p_ws: c.ws, p_policy: policy });
  if (!row) throw failure("not_found", "That policy is gone.", { retryable: false });
  return { ...row, draft: row.draft ? cleanBody(row.draft) : null, live: row.live ? cleanBody(row.live) : null };
}

/** The workspace's default policy (Inbound), made from its router when there's none yet. */
export async function defaultPolicy(rpc: Rpc, ws: string): Promise<string | null> {
  return call<string | null>(rpc, "routing_default_policy", { p_ws: ws });
}

/**
 * Create a policy (Section 6, Step A): "Send everything to me" (no rules, the person as Everyone else and the whole
 * scope, no team needed) or "Route by conditions" (an empty rule list to fill in). `key` makes a double click make
 * one policy. The draft is saved at once; nothing is live until it's published.
 */
export async function createPolicy(rpc: Rpc, c: Caller, o: { name: string; start: "solo" | "conditions"; key: string }): Promise<{ id: string; created: boolean }> {
  const bad = nameProblem(o.name);
  if (bad) throw failure("invalid_configuration", bad, { field: "name", retryable: false });
  if (!c.user) throw failure("permission_denied", "Sign in to create a policy.", { retryable: false });
  const body = o.start === "solo" ? { ...specBody({ people: [c.user], reviewer: c.user }), fallback: { kind: "user" as const, id: c.user } } : specBody({ reviewer: c.user });
  return call(rpc, "routing_policy_create", { p_ws: c.ws, p_name: o.name.trim(), p_config: body, p_key: o.key.slice(0, 100), p_user: c.user });
}

/**
 * Save a draft (Section 4): the revision the editor read, or draft_conflict. Returns the saved revision and body. A
 * `name` is staged with it (live with the next publish); a null body with a name saves a rename alone.
 */
export async function saveDraft(rpc: Rpc, c: Caller, policy: string, body: unknown, revision: number | null, name?: string | null): Promise<{ revision: number; body: RouterBody | null }> {
  if (name !== undefined && name !== null) {
    const bad = nameProblem(name);
    if (bad) throw failure("invalid_configuration", bad, { field: "name", retryable: false });
  }
  const clean = body === null || body === undefined ? null : cleanBody(body);
  if (name === undefined && clean) {
    const rev = await call<number>(rpc, "routing_draft_save", { p_ws: c.ws, p_policy: policy, p_config: clean, p_revision: revision, p_user: c.user });
    return { revision: rev, body: clean };
  }
  const rev = await call<number>(rpc, "routing_policy_draft", { p_ws: c.ws, p_policy: policy, p_config: clean, p_name: name ? name.trim() : null, p_revision: revision, p_user: c.user });
  return { revision: rev, body: clean };
}

/**
 * Duplicate a policy (Section 5): a new draft with the same rules and references, named "<name> — copy", connected to
 * no source. Teams, people, meetings and connections are referenced, never copied. `key` makes a double click make one.
 */
export async function duplicatePolicy(rpc: Rpc, c: Caller, o: { policy: string; key: string }): Promise<{ id: string; created: boolean }> {
  if (!c.user) throw failure("permission_denied", "Sign in to duplicate a policy.", { retryable: false });
  const row = await getPolicy(rpc, c, o.policy);
  const body = row.draft ?? row.live;
  if (!body) throw failure("invalid_configuration", "There's nothing to copy yet.", { retryable: false });
  const base = row.name.length > 73 ? row.name.slice(0, 73).trimEnd() : row.name;
  return call(rpc, "routing_policy_create", { p_ws: c.ws, p_name: `${base} — copy`, p_config: cleanBody(body), p_key: o.key.slice(0, 100), p_user: c.user });
}

/**
 * Archive a policy (Section 5): refused while a live source routes with it; the sources that do come back so the
 * person can move them first. `archive: false` restores it as a draft with no source connected.
 */
export async function archivePolicy(rpc: Rpc, c: Caller, o: { policy: string; archive: boolean }): Promise<{ archived: boolean; sources?: { id: string; name: string }[] }> {
  return call(rpc, "routing_policy_archive", { p_ws: c.ws, p_policy: o.policy, p_archive: o.archive, p_user: c.user });
}

/** Stage the internal handoff's connection (Contacts › Route & book): live after the next publish of its policy. */
export async function stageHandoff(
  rpc: Rpc,
  c: Caller,
  o: { policy: string | null; enabled: boolean; outcome: Outcome; meetingTypeId: string | null; revision: number | null },
): Promise<{ id: string; revision: number; live_revision: number; live_policy: string | null }> {
  return call(rpc, "routing_handoff_stage", {
    p_ws: c.ws,
    p_draft: { policy_id: o.policy, enabled: o.enabled, outcome: o.outcome, meeting_type_id: o.meetingTypeId },
    p_revision: o.revision,
    p_user: c.user,
  });
}

export async function teamsOf(rpc: Rpc, ws: string): Promise<Record<string, TeamFacts & { revision: number }>> {
  return call(rpc, "routing_team_list", { p_ws: ws });
}

/**
 * Publish a release (Section 17): the draft at the revision the person reviewed, with the staged connections they
 * reviewed, as the next immutable version, in one transaction. Blocking errors stop it before anything is written;
 * `key` is the operation id, so a publish whose answer was lost returns the version it made. Warnings come back with
 * the result.
 */
export async function publishPolicy(
  rpc: Rpc,
  c: Caller,
  o: { policy: string; revision: number; key: string; note?: string | null; ctx: Omit<ValidateCtx, "teams" | "sources">; sources?: { id: string; revision: number }[] },
): Promise<{ version: number; repeat: boolean; warnings: Issue[] }> {
  const [row, teams] = await Promise.all([getPolicy(rpc, c, o.policy), teamsOf(rpc, c.ws)]);
  if (row.archived) throw failure("invalid_configuration", "This policy is archived.", { retryable: false });
  if (!row.draft) {
    // Nothing to publish: a lost answer to a publish that went through is looked up by its key.
    const again = await call<{ version: number; repeat: boolean } | null>(rpc, "routing_publish_lookup", { p_policy: o.policy, p_key: o.key }).catch(() => null);
    if (again) return { ...again, warnings: [] };
    throw failure("invalid_configuration", "There's no draft to publish.", { retryable: false });
  }
  if (row.draft_revision !== o.revision) throw failure("draft_conflict", "Someone else changed this draft since you reviewed it.", { retryable: true });
  // The sources this release serves: live ones staying on it, and staged ones being turned on with it.
  const staged = new Map((o.sources ?? []).map((s) => [s.id, s.revision]));
  const sources: SourceRef[] = row.sources
    .filter((s) => (staged.has(s.id) ? s.draft?.policy_id === row.id : s.policy_id === row.id))
    .map((s) => {
      const d = staged.has(s.id) ? (s.draft ?? {}) : {};
      return { id: s.id, name: s.name, enabled: (d.enabled as boolean | undefined) ?? s.enabled, outcome: (d.outcome as Outcome | undefined) ?? s.outcome, meetingTypeId: (d.meeting_type_id as string | null | undefined) ?? s.meeting_type_id };
    });
  const v = validatePolicy(row.draft, { ...o.ctx, teams, sources });
  if (v.errors.length) throw failure("invalid_configuration", v.errors.map((e) => e.text).join(". "), { retryable: false, state: { errors: v.errors } });
  const out = await call<{ version: number; repeat: boolean }>(rpc, "routing_publish", {
    p_ws: c.ws,
    p_policy: o.policy,
    p_config: row.draft,
    p_note: o.note?.trim().slice(0, 300) || null,
    p_user: c.user,
    p_key: o.key.slice(0, 100),
    p_revision: o.revision,
    p_clear_draft: true,
    p_sources: o.sources ?? [],
  });
  const { invalidateRouterLive } = await import("../router/server.ts");
  invalidateRouterLive(c.ws);
  return { version: out.version, repeat: out.repeat, warnings: v.warnings };
}

/** Save a team (Section 12): name, method and ordered members, live at once. `revision`: the one the editor read. */
export async function saveTeam(
  rpc: Rpc,
  c: Caller,
  o: { team?: string | null; name: string; method?: "rr" | "weighted" | "load"; members: { user: string; weight?: number }[]; revision?: number | null; key?: string },
): Promise<{ id: string; key: string; revision: number; next: number }> {
  return call(rpc, "routing_team_save", {
    p_ws: c.ws,
    p_team: o.team ?? null,
    p_name: o.name,
    p_method: o.method ?? "rr",
    p_members: o.members.map((m) => ({ user: m.user, weight: m.weight ?? 1 })),
    p_revision: o.revision ?? null,
    p_key: o.key ?? null,
  });
}

/** Stage a form's connection (Section 8): the same row Forms and Routing edit; live after the next publish. */
export async function stageSource(
  rpc: Rpc,
  c: Caller,
  o: { form: string; policy: string | null; enabled: boolean; outcome: Outcome; meetingTypeId: string | null; mappings?: unknown[]; noSlots?: Record<string, unknown>; whenOff?: "none" | "review"; revision: number | null },
): Promise<{ id: string; revision: number; live_revision: number; live_policy: string | null }> {
  return call(rpc, "routing_source_stage", {
    p_ws: c.ws,
    p_form: o.form,
    p_draft: { policy_id: o.policy, enabled: o.enabled, outcome: o.outcome, meeting_type_id: o.meetingTypeId, ...(o.mappings ? { mappings: o.mappings } : {}), ...(o.noSlots ? { no_slots: o.noSlots } : {}), ...(o.whenOff ? { when_off: o.whenOff } : {}) },
    p_revision: o.revision,
    p_user: c.user,
  });
}
