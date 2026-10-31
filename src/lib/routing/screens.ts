// The Routing screens' server side, stages F and G (docs/routing-workflow.md Sections 4-8, 12, 16-18): the Policies,
// Teams and Activity reads, draft saves with revision checks, source staging, the lead tester and its evidence, the
// publish review and the guarded publish. Every write goes through the A-E services (policies.ts) and every decision
// through the one evaluator (evaluate.ts); a test calls no committer. The caller is a workspace member (the API route
// checked); changes need a workspace owner. Server only.

import type { Rpc } from "../jobs.ts";
import { cleanBody } from "../router/check.ts";
import { numberOrRange, type FieldDef } from "../router/conditions.ts";
import { namesOf, readFacts, withTryOwners } from "../router/server.ts";
import type { RouterBody, TeamFacts } from "../router/types.ts";
import { evaluate, type Trace } from "./evaluate.ts";
import { archivePolicy, createPolicy, duplicatePolicy, getPolicy, publishPolicy, saveDraft, saveTeam, stageHandoff, stageSource, teamsOf } from "./policies.ts";
import { releaseFingerprint, releaseSources, semanticsChanges, type PolicyRow, type SourceRow } from "./screenModel.ts";
import { failure, RoutingFailure, type Outcome } from "./states.ts";
import { validatePolicy, type Issue } from "./validate.ts";
import { DENIED, may } from "./access.ts";

export type Caller = { ws: string; user: string; role: "owner" | "member" };

/** What the screens need besides the database: the workspace's people and the fields rules can test. */
export type Deps = { members: () => Promise<{ id: string; name: string; email: string }[]>; fields: () => Promise<FieldDef[]> };

export class Refusal extends Error {
  status: number;
  code: string;
  state?: unknown;
  constructor(status: number, code: string, message: string, state?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.state = state;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Section 20 through access.ts: editing, publishing and teams are a workspace owner's.
const ownerOnly = (c: Caller, cap: "edit_policy" | "publish" | "team" = "edit_policy") => {
  if (!may(c, cap)) throw new Refusal(403, "permission_denied", DENIED[cap]);
};
const id = (v: unknown, what = "id"): string => {
  if (typeof v !== "string" || !UUID.test(v)) throw new Refusal(400, "invalid_configuration", `Bad ${what}.`);
  return v;
};

async function call<T>(rpc: Rpc, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

/** A service failure as the API's typed error (Section 21). */
export function refusalOf(e: unknown): Refusal | null {
  if (e instanceof Refusal) return e;
  if (e instanceof RoutingFailure) {
    const status = e.error.code === "draft_conflict" ? 409 : e.error.code === "not_found" ? 404 : e.error.code === "permission_denied" ? 403 : 400;
    return new Refusal(status, e.error.code, e.message, e.error.state);
  }
  return null;
}

// Reads --------------------------------------------------------------------------------------------------------

export type Screen = {
  policies: PolicyRow[];
  sources: SourceRow[];
  forms: { id: string; name: string; status: string; fields: { id: string; key: string; type: string; label: string; options?: { value: string; label?: string }[] | null }[] }[];
  meetingTypes: { id: string; name: string; minutes: number | null }[];
  teams: { id: string; name: string; method: string; next: number; revision: number; keys: string[]; members: { user: string; position: number; weight: number }[] }[];
  people: ScreenPerson[];
  fields: FieldDef[];
  me: string;
  role: "owner" | "member";
  openReviews: number;
  /** Routing paused for the workspace: new leads keep the owner they come with. */
  paused: boolean;
};

export type ScreenPerson = {
  id: string;
  role: "owner" | "member";
  name: string;
  email: string;
  paused_until: string | null;
  out_dates: { from: string; to: string }[];
  cap_day: number | null;
  cap_week: number | null;
  backup: string | null;
  tz: string;
  today: number;
  calendar: string | null;
  reconnect: boolean;
  out: boolean;
};

/** Everything the Routing section opens with, in one round of reads side by side. */
export async function screen(rpc: Rpc, c: Caller, deps: Deps): Promise<Screen> {
  const [policies, src, teams, fields, reviews] = await Promise.all([
    call<PolicyRow[]>(rpc, "routing_screen_policies", { p_ws: c.ws }),
    call<{ sources: SourceRow[]; forms: Screen["forms"]; meeting_types: Screen["meetingTypes"] }>(rpc, "routing_screen_sources", { p_ws: c.ws }),
    call<{ teams: Screen["teams"]; people: ScreenPerson[] }>(rpc, "routing_screen_teams", { p_ws: c.ws }),
    deps.fields(),
    call<{ open_reviews: number }>(rpc, "routing_screen_activity", { p_ws: c.ws, p_filter: "review", p_before: null, p_limit: 1 }),
  ]);
  const live = await call<{ paused?: boolean } | null>(rpc, "router_live", { p_ws: c.ws }).catch(() => null);
  return {
    policies: (policies ?? []).map((p) => ({ ...p, draft: p.draft ? cleanBody(p.draft) : null, live: p.live ? cleanBody(p.live) : null, live_sources: Number(p.live_sources) || 0, staged: Number(p.staged) || 0 })),
    sources: src?.sources ?? [],
    forms: src?.forms ?? [],
    meetingTypes: src?.meeting_types ?? [],
    teams: teams?.teams ?? [],
    people: teams?.people ?? [],
    fields,
    me: c.user,
    role: c.role,
    openReviews: Number(reviews?.open_reviews) || 0,
    paused: !!live?.paused,
  };
}

export async function versions(rpc: Rpc, c: Caller, o: { policy: unknown }) {
  return { versions: await call<unknown[]>(rpc, "routing_screen_versions", { p_ws: c.ws, p_policy: id(o.policy, "policy") }) };
}

export async function activity(rpc: Rpc, c: Caller, o: { filter?: unknown; before?: unknown }) {
  const filter = o.filter === "review" || o.filter === "errors" ? o.filter : "all";
  const before = typeof o.before === "string" && !Number.isNaN(Date.parse(o.before)) ? o.before : null;
  return call<{ runs: unknown[]; open_reviews: number }>(rpc, "routing_screen_activity", { p_ws: c.ws, p_filter: filter, p_before: before, p_limit: 50 });
}

export async function run(rpc: Rpc, c: Caller, o: { run: unknown }) {
  const r = await call<Record<string, unknown> | null>(rpc, "routing_screen_run", { p_ws: c.ws, p_run: id(o.run, "run") });
  if (!r) throw new Refusal(404, "not_found", "That run is gone.");
  return { run: r };
}

// Policies -------------------------------------------------------------------------------------------------------

export async function create(rpc: Rpc, c: Caller, o: { name: unknown; start: unknown; key: unknown }) {
  ownerOnly(c);
  const key = typeof o.key === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(o.key) ? o.key : null;
  if (!key) throw new Refusal(400, "invalid_configuration", "Bad request.");
  return createPolicy(rpc, c, { name: typeof o.name === "string" ? o.name : "", start: o.start === "solo" ? "solo" : "conditions", key });
}

/**
 * Save the editor's draft at the revision it read (Section 4). A conflict comes back with what's saved now (revision,
 * draft and name), so the editor can offer reload, compare or reapply; nothing of the person's edits is lost.
 */
export async function save(rpc: Rpc, c: Caller, o: { policy: unknown; body?: unknown; name?: unknown; revision: unknown }) {
  ownerOnly(c);
  const policy = id(o.policy, "policy");
  const revision = typeof o.revision === "number" ? o.revision : null;
  try {
    return await saveDraft(rpc, c, policy, o.body ?? null, revision, typeof o.name === "string" ? o.name : undefined);
  } catch (e) {
    if (e instanceof RoutingFailure && e.error.code === "draft_conflict") {
      const now = (await call<PolicyRow[]>(rpc, "routing_screen_policies", { p_ws: c.ws })).find((p) => p.id === policy);
      throw new Refusal(409, "draft_conflict", "Someone else changed this policy.", now ? { revision: now.draft_revision, draft: now.draft ? cleanBody(now.draft) : null, name: now.draft_name ?? now.name } : null);
    }
    throw e;
  }
}

export async function duplicate(rpc: Rpc, c: Caller, o: { policy: unknown; key: unknown }) {
  ownerOnly(c);
  const key = typeof o.key === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(o.key) ? o.key : null;
  if (!key) throw new Refusal(400, "invalid_configuration", "Bad request.");
  return duplicatePolicy(rpc, c, { policy: id(o.policy, "policy"), key });
}

export async function archive(rpc: Rpc, c: Caller, o: { policy: unknown; archive: unknown }) {
  ownerOnly(c);
  return archivePolicy(rpc, c, { policy: id(o.policy, "policy"), archive: o.archive !== false });
}

/** Restore a version (Section 17): its config becomes the draft, at the revision the editor read. Nothing else moves. */
export async function restore(rpc: Rpc, c: Caller, o: { policy: unknown; version: unknown; revision: unknown }) {
  ownerOnly(c);
  const policy = id(o.policy, "policy");
  const list = await call<{ version: number; config: RouterBody }[]>(rpc, "routing_screen_versions", { p_ws: c.ws, p_policy: policy });
  const v = list.find((x) => x.version === Number(o.version));
  if (!v) throw new Refusal(404, "not_found", "That version is gone.");
  return save(rpc, c, { policy, body: cleanBody(v.config), revision: o.revision });
}

/**
 * Stage a source connection from the editor's Sources drawer (Section 8): the same row Forms edits, live with this
 * policy's next publish. A form already live on another policy moves when this one publishes.
 */
export async function stage(rpc: Rpc, c: Caller, o: { policy: unknown; source: unknown; enabled?: unknown; outcome?: unknown; meeting?: unknown; mappings?: unknown; noSlots?: unknown; whenOff?: unknown; revision?: unknown }) {
  ownerOnly(c);
  const policy = id(o.policy, "policy");
  const outcome: Outcome = o.outcome === "assign_and_calendar" ? "assign_and_calendar" : "assign_only";
  const meeting = typeof o.meeting === "string" && UUID.test(o.meeting) ? o.meeting : null;
  const revision = typeof o.revision === "number" ? o.revision : null;
  const enabled = o.enabled !== false;
  if (enabled && outcome === "assign_and_calendar" && !meeting) throw new Refusal(400, "invalid_configuration", "Pick a meeting type.");
  const src = o.source as { kind?: unknown; form?: unknown } | null;
  try {
    if (src?.kind === "handoff") return await stageHandoff(rpc, c, { policy, enabled, outcome, meetingTypeId: meeting, revision });
    const mappings = Array.isArray(o.mappings)
      ? o.mappings
          .filter((m): m is { field: string; target: string; type: string; required?: boolean } => !!m && typeof m === "object" && typeof (m as { field?: unknown }).field === "string" && typeof (m as { target?: unknown }).target === "string")
          .slice(0, 40)
          .map((m) => ({ field: m.field.slice(0, 80), target: m.target.slice(0, 80), type: ["email", "integer", "range", "country", "text", "enum"].includes(m.type) ? m.type : "text", ...(m.required ? { required: true } : {}) }))
      : undefined;
    const noSlots = o.noSlots && typeof o.noSlots === "object" ? followUps(o.noSlots as Record<string, unknown>) : undefined;
    const whenOff = o.whenOff === "review" || o.whenOff === "none" ? o.whenOff : undefined;
    if (!enabled && !whenOff) throw new Refusal(400, "invalid_configuration", "Choose what happens to new leads.");
    return await stageSource(rpc, c, { form: id(src?.form, "form"), policy, enabled, outcome, meetingTypeId: meeting, mappings, noSlots, whenOff, revision });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/draft_conflict/.test(msg)) throw new Refusal(409, "draft_conflict", "Someone else changed this source.");
    if (/not_found/.test(msg)) throw new Refusal(404, "not_found", "That's gone.");
    if (/invalid_configuration/.test(msg)) throw new Refusal(400, "invalid_configuration", "Check the source's settings.");
    throw e;
  }
}

/**
 * A connection's follow-up settings (Sections 13 and 19): the no-slots task, the email-times-later choice, and the
 * abandoned-booking follow-up with its inactivity window (30 minutes unless set, 5 to 1440).
 */
function followUps(n: Record<string, unknown>) {
  const after = typeof n.abandonAfter === "number" && Number.isInteger(n.abandonAfter) ? Math.min(1440, Math.max(5, n.abandonAfter)) : undefined;
  return { message: "form", task: n.task !== false, ...(n.email_later === true ? { email_later: true } : {}), abandonTask: n.abandonTask === true, ...(after ? { abandonAfter: after } : {}) };
}

/**
 * A form's canonical connection for Forms › After submit (Section 8): the same row Routing's Sources drawer stages,
 * with the policies it can route with and the meeting types. Forms changes it through `stage`, never a copy.
 */
export async function formSource(rpc: Rpc, c: Caller, o: { form: unknown }) {
  const form = id(o.form, "form");
  const [src, policies] = await Promise.all([
    call<{ sources: SourceRow[]; forms: { id: string }[]; meeting_types: Screen["meetingTypes"] }>(rpc, "routing_screen_sources", { p_ws: c.ws }),
    call<PolicyRow[]>(rpc, "routing_screen_policies", { p_ws: c.ws }),
  ]);
  if (!src.forms.some((f) => f.id === form)) throw new Refusal(404, "not_found", "That form isn't in this workspace.");
  return {
    source: src.sources.find((s) => s.kind === "form" && s.form_id === form) ?? null,
    policies: policies.filter((p) => !p.archived).map((p) => ({ id: p.id, name: p.draft_name ?? p.name, active_version: p.active_version, is_default: p.is_default })),
    meetingTypes: src.meeting_types,
    role: c.role,
  };
}

// Teams (Section 12) --------------------------------------------------------------------------------------------------

export async function team(rpc: Rpc, c: Caller, o: { team?: unknown; name: unknown; members: unknown; revision?: unknown }) {
  ownerOnly(c, "team");
  const members = (Array.isArray(o.members) ? o.members : []).filter((u): u is string => typeof u === "string" && UUID.test(u)).slice(0, 100);
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!name || name.length > 80) throw new Refusal(400, "invalid_configuration", name ? "Keep the name to 80 characters." : "Name the team.");
  try {
    return await saveTeam(rpc, c, { team: o.team ? id(o.team, "team") : null, name, members: members.map((user) => ({ user })), revision: typeof o.revision === "number" ? o.revision : null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/draft_conflict/.test(msg)) throw new Refusal(409, "draft_conflict", "Someone else changed this team. Open it again.");
    throw e;
  }
}

// The tester (Section 16) ---------------------------------------------------------------------------------------------

export type TestOverrides = { contactOwner?: string | null; companyOwner?: string | null; spam?: boolean; unavailable?: boolean; noSlots?: boolean };

/** The teams a body names, as the database has them: what a test and its fingerprint depend on. */
function teamsFor(body: RouterBody, all: Record<string, TeamFacts & { revision: number }>) {
  const used = new Set(namesOf(body).queues);
  return Object.fromEntries(Object.entries(all).filter(([k]) => used.has(k)));
}

/** A typed test value: whole numbers stay numbers; ranges stay ranges; blank is unknown. */
function testValue(v: unknown, type: string | undefined): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && !v.trim()) return null;
  if (type === "number" && typeof v === "string") {
    const r = numberOrRange(v);
    return r && r.lo === r.hi ? r.lo : r ? v.trim() : v.trim();
  }
  return typeof v === "string" ? v.trim().slice(0, 200) : v;
}

/**
 * Dry-run one lead (Section 16): the saved draft at the revision the editor saved, or the published version; the
 * source's outcome as that version would have it; the values typed in and the labeled simulation overrides over what
 * the CRM knows about the email's company. The shared evaluator decides; no committer, queue, quota, contact, task,
 * message or event is touched. A draft's test keeps its evidence: the release fingerprint and a short result.
 */
export async function test(
  rpc: Rpc,
  c: Caller,
  deps: Deps,
  o: { policy: unknown; version: unknown; revision?: unknown; source?: unknown; email?: unknown; contact?: unknown; values?: unknown; overrides?: TestOverrides; now?: number },
) {
  if (!may(c, "test")) throw new Refusal(403, "permission_denied", DENIED.test);
  const policy = id(o.policy, "policy");
  // An existing contact, looked up in this workspace only (Section 16): its CRM facts are read, nothing is written.
  const contact = o.contact === undefined || o.contact === null || o.contact === "" ? null : id(o.contact, "contact");
  const which = o.version === "live" ? "live" : "draft";
  const [row, teams, src, fields] = await Promise.all([getPolicy(rpc, c, policy), teamsOf(rpc, c.ws), call<{ sources: SourceRow[] }>(rpc, "routing_screen_sources", { p_ws: c.ws }), deps.fields()]);
  const body = which === "draft" ? (row.draft ?? row.live) : row.live;
  if (!body) throw new Refusal(400, "invalid_configuration", which === "live" ? "Nothing is published yet." : "There's nothing to test yet.");
  if (which === "draft" && typeof o.revision === "number" && o.revision !== row.draft_revision) throw new Refusal(409, "draft_conflict", "The draft changed since it was saved. Run the test again.");
  const sources = src?.sources ?? [];
  const mine = which === "draft" ? releaseSources(sources, policy).serving.filter((s) => s.eff.enabled) : sources.filter((s) => s.policy_id === policy && s.enabled).map((s) => ({ ...s, eff: { connected: true, enabled: s.enabled, outcome: s.outcome, meetingTypeId: s.meeting_type_id, mappings: s.mappings, noSlots: s.no_slots, pending: false } }));
  const source = typeof o.source === "string" ? mine.find((s) => s.id === o.source) : undefined;
  if (typeof o.source === "string" && !source) throw new Refusal(400, "invalid_configuration", "That source isn't connected to this version.");

  const ov = o.overrides ?? {};
  const user = (u: unknown) => (typeof u === "string" && UUID.test(u) ? u : null);
  // A looked-up contact keeps the owners the CRM has unless an override says otherwise; a typed lead starts with none.
  const owners = {
    contact: contact && ov.contactOwner === undefined ? undefined : user(ov.contactOwner),
    company: contact && ov.companyOwner === undefined ? undefined : user(ov.companyOwner),
  };
  const email = typeof o.email === "string" ? o.email.trim().slice(0, 200) : "";
  const read = await readFacts(rpc, { ws: c.ws, contact, email: contact ? null : email || null, key: null, body, reason: "form", now: o.now, users: [owners.contact, owners.company].filter((u): u is string => !!u) });
  if (contact && !read) throw new Refusal(404, "not_found", "That contact isn't in this workspace.");
  if (!read || "existing" in read) throw new Refusal(400, "invalid_configuration", "Couldn't read this lead.");
  const facts = withTryOwners(read.facts, owners);
  const values = o.values && typeof o.values === "object" ? (o.values as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(values).slice(0, 40)) {
    if (!/^[a-z]+\.[a-z0-9_.]{1,60}$/i.test(k)) continue;
    facts.values[k] = testValue(v, fields.find((f) => f.key === k)?.type);
    facts.provenance = { ...(facts.provenance ?? {}), [k]: { source: "test" } };
  }
  if (ov.spam) facts.lead.disposable = true;
  if (ov.unavailable) for (const r of Object.values(facts.reps)) r.outUntil = facts.now + 86_400_000;
  const ev = evaluate(body, facts, { source: source ? { outcome: source.eff.outcome, meetingTypeId: source.eff.meetingTypeId, slots: !ov.noSlots } : null });

  let evidence: { id: string; fingerprint: string; at: string } | null = null;
  const fp = releaseFingerprint(body, teamsFor(body, teams), which === "draft" ? releaseSources(sources, policy).serving : mine);
  if (which === "draft") {
    const deps2 = Object.fromEntries(Object.entries(teamsFor(body, teams)).map(([k, t]) => [k, t.revision]));
    evidence = await call(rpc, "routing_evidence_save", {
      p_ws: c.ws,
      p_policy: policy,
      p_fingerprint: fp,
      p_revision: row.draft_revision,
      p_tested: "draft",
      p_version: null,
      p_source: source?.id ?? null,
      p_deps: deps2,
      p_result: { state: ev.state, effect: ev.effect, recipient: ev.trace.assignment.recipient, rule: ev.trace.rules.matched?.name ?? null, booking: ev.trace.booking.outcome },
      p_user: c.user,
    });
  }
  return { trace: ev.trace, state: ev.state, effect: ev.effect, recipient: ev.trace.assignment.recipient, fingerprint: fp, evidence, version: which === "live" ? row.active_version : null, revision: row.draft_revision };
}

// Review and publish (Section 17) -----------------------------------------------------------------------------------

export type Review = {
  version: number;
  revision: number;
  fingerprint: string;
  evidence: { id: string; at: string; by: string | null; result: { state?: string; recipient?: string | null; rule?: string | null } } | null;
  errors: Issue[];
  warnings: Issue[];
  sources: { id: string; name: string; pending: boolean }[];
  staged: { id: string; revision: number }[];
  semantics: string[];
};

/** What publishing this draft would do, checked on the server: blocking errors, warnings, sources and test evidence. */
export async function review(rpc: Rpc, c: Caller, deps: Deps, o: { policy: unknown }): Promise<Review> {
  const policy = id(o.policy, "policy");
  const [row, teams, src, members, fields, screenTeams, versions] = await Promise.all([
    getPolicy(rpc, c, policy),
    teamsOf(rpc, c.ws),
    call<{ sources: SourceRow[]; meeting_types: { id: string }[] }>(rpc, "routing_screen_sources", { p_ws: c.ws }),
    deps.members(),
    deps.fields(),
    call<{ people: ScreenPerson[] }>(rpc, "routing_screen_teams", { p_ws: c.ws }),
    call<{ version: number }[]>(rpc, "routing_screen_versions", { p_ws: c.ws, p_policy: policy }),
  ]);
  const body = row.draft ?? row.live;
  if (!body) throw new Refusal(400, "invalid_configuration", "There's nothing to publish.");
  const rel = releaseSources(src?.sources ?? [], policy);
  const used = teamsFor(body, teams);
  const fp = releaseFingerprint(body, used, rel.serving);
  const v = validatePolicy(body, {
    members: new Set(members.map((m) => m.id)),
    fields,
    teams,
    meetingTypes: new Set((src?.meeting_types ?? []).map((m) => m.id)),
    sources: rel.serving.map((s) => ({ id: s.id, name: s.name, enabled: s.eff.enabled, outcome: s.eff.outcome, meetingTypeId: s.eff.meetingTypeId })),
  });
  const warnings = [...v.warnings];
  // Live warnings that need a look, never blocks (Section 17): teams with nobody who can take a lead right now, and
  // calendars that can't be read for sources that show one.
  const people = new Map((screenTeams?.people ?? []).map((p) => [p.id, p]));
  const today = new Date().toISOString().slice(0, 10);
  const awayWords = (u: string): string | null => {
    const p = people.get(u);
    if (!p) return "has left the workspace";
    if (p.paused_until && Date.parse(p.paused_until) > Date.now()) return "is paused";
    if (p.out) {
      const until = (p.out_dates ?? []).filter((d) => d.from <= today && today <= d.to).map((d) => d.to).sort().pop();
      return until ? `is out of office until ${new Date(`${until}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}` : "is out of office";
    }
    return null;
  };
  for (const [key, t] of Object.entries(used)) {
    const off = t.members.map((m) => ({ u: m.user, why: awayWords(m.user) })).filter((x) => x.why);
    const ok = t.members.length - off.length;
    if (t.members.length && off.length)
      warnings.push({ code: "member_unavailable", where: { kind: "queue", id: key }, text: `${off.map((x) => `${people.get(x.u)?.name ?? "A member"} ${x.why}`).join(". ")}. ${t.name} currently has ${ok} eligible ${ok === 1 ? "member" : "members"}.` });
  }
  if (rel.serving.some((s) => s.eff.enabled && s.eff.outcome === "assign_and_calendar")) {
    const hosts = new Set(Object.values(used).flatMap((t) => t.members.map((m) => m.user)));
    if (body.fallback?.kind === "user") hosts.add(body.fallback.id);
    const noCal = [...hosts].filter((u) => people.has(u) && !people.get(u)!.calendar);
    if (noCal.length) warnings.push({ code: "calendar_unhealthy", where: { kind: "policy" }, text: `${noCal.map((u) => people.get(u)!.name).join(", ")} ${noCal.length === 1 ? "has" : "have"} no calendar connected` });
  }
  const evidence = await call<Review["evidence"]>(rpc, "routing_evidence_latest", { p_ws: c.ws, p_policy: policy, p_fingerprint: fp });
  const next = Math.max(row.active_version ?? 0, ...(versions ?? []).map((x) => x.version)) + 1;
  return {
    version: next,
    revision: row.draft_revision,
    fingerprint: fp,
    evidence: evidence ?? null,
    errors: v.errors,
    warnings,
    sources: rel.serving.filter((s) => s.eff.enabled).map((s) => ({ id: s.id, name: s.name, pending: s.eff.pending })),
    staged: rel.staged,
    semantics: semanticsChanges(row.live, body),
  };
}

/**
 * Publish (Section 17), through the one publish service: the server checks the person, the draft revision they
 * reviewed, every reference, and that a completed dry run exists for exactly this release; then one version with its
 * staged sources, keyed by the operation id, so a lost answer is looked up instead of published twice.
 */
export async function publish(rpc: Rpc, c: Caller, deps: Deps, o: { policy: unknown; revision: unknown; key: unknown; fingerprint?: unknown; note?: unknown }) {
  ownerOnly(c, "publish");
  const policy = id(o.policy, "policy");
  const key = typeof o.key === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(o.key) ? o.key : null;
  if (!key || typeof o.revision !== "number") throw new Refusal(400, "invalid_configuration", "Bad request.");
  const done = await call<{ version: number } | null>(rpc, "routing_publish_lookup", { p_policy: policy, p_key: key });
  if (done) return { version: done.version, repeat: true, warnings: [] as Issue[] };
  const r = await review(rpc, c, deps, { policy });
  if (r.revision !== o.revision) throw new Refusal(409, "draft_conflict", "Someone else changed this draft since you reviewed it.");
  if (typeof o.fingerprint === "string" && o.fingerprint !== r.fingerprint) throw new Refusal(409, "stale_evidence", "Something this policy uses changed. Review it again.");
  if (r.errors.length) throw new Refusal(400, "invalid_configuration", r.errors.map((e) => e.text).join(". "), { errors: r.errors });
  if (!r.evidence) throw failure("invalid_configuration", "Run Test lead on this draft before publishing.", { retryable: false, state: { code: "no_evidence" } });
  const [members, fields] = await Promise.all([deps.members(), deps.fields()]);
  const out = await publishPolicy(rpc, c, {
    policy,
    revision: r.revision,
    key,
    note: typeof o.note === "string" ? o.note : null,
    ctx: { members: new Set(members.map((m) => m.id)), fields },
    sources: r.staged,
  });
  return out;
}

/** A publish whose answer was lost (Section 17): the version its operation id made, or nothing yet. */
export async function publishStatus(rpc: Rpc, c: Caller, o: { policy: unknown; key: unknown }) {
  const key = typeof o.key === "string" ? o.key.slice(0, 100) : "";
  const done = await call<{ version: number } | null>(rpc, "routing_publish_lookup", { p_policy: id(o.policy, "policy"), p_key: key });
  return { version: done?.version ?? null };
}

export type { Trace };
