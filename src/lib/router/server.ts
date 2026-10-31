// Routing a lead (docs/router-ux.md 7.4): read the facts in one call (router_facts), decide in memory (engine.ts),
// write under a lock in one call (router_commit). A pick that went stale meanwhile (a cap filled, a rep paused) is
// decided again with fresh facts, at most twice. A key seen before returns its first answer and writes nothing. Server
// only: the form send, the API, the jobs and the Test panel call it.

import { callNewer } from "../forms/newer.ts";
import { forgetSources } from "../routing/sources.ts";
import type { Rpc } from "../jobs.ts";
import type { Availability } from "../meetings/types.ts";
import { addDays, at, dateIn, dayOf, validZone } from "../meetings/time.ts";
import { decide } from "./engine.ts";
import type { Decision, Facts, InputIssue, Provenance, Reason, RepFacts, RouterBody, StepResult, TeamFacts } from "./types.ts";

async function call<T>(rpc: Rpc, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

type RawRep = {
  name: string;
  member: boolean;
  tz: string;
  availability: Availability | null;
  paused_until: string | null;
  out_dates: { from: string; to: string }[];
  calendar_out_until: string | null;
  backup: string | null;
  cap_day: number | null;
  cap_week: number | null;
  today: number;
  week: number;
  meetings_week: number;
};

export type RawFacts = {
  existing?: { id: string; kind: "owner" | "held" | "unassigned"; owner: string | null; by: string | null; queue: string | null; rule: string | null };
  contact: {
    id: string;
    email: string | null;
    email_clean: string | null;
    email_class: string | null;
    first_name: string | null;
    last_name: string | null;
    title: string | null;
    country: string | null;
    region: string | null;
    lifecycle: string | null;
    lead_status: string | null;
    score: number | null;
    score_band: string | null;
    fields: Record<string, unknown>;
    route_status: string | null;
  };
  domain: string | null;
  owner: { user: string | null; crm: string | null };
  company: {
    id: string;
    name: string;
    domain: string | null;
    country: string | null;
    industry: string | null;
    size: string | null;
    fields: Record<string, unknown>;
    owner: string | null;
    owner_crm: string | null;
    opp_owner: string | null;
    opp_name: string | null;
  } | null;
  submission: { id: string; form_id: string | null; values: Record<string, unknown>; hidden: Record<string, unknown> } | null;
  recent: number;
  reps: Record<string, RawRep>;
  counts: Record<string, Record<string, { n: number; last: string }>>;
  lists: { allow: string[]; block: string[] };
  /** The columns enrichment and qualify added (router_facts_full; router_facts_more before 090). */
  more?: { seniority?: string; department?: string; qualify?: string; employees?: number };
  /** routing_facts (095): the body's teams as the database has them, and how the company was found. */
  teams?: Record<string, TeamFacts>;
  company_match?: Facts["companyMatch"];
};

/** Whether now is inside someone's hours (weekly ranges, with a date's own hours first). Null when they have none. */
export function inHours(a: Availability | null, now: number): boolean | null {
  if (!a || !a.weekly) return null;
  const tz = validZone(a.tz) ? a.tz : "UTC";
  const date = dateIn(now, tz);
  const own = a.overrides?.find((o) => o.date === date);
  const ranges = own ? own.ranges : (a.weekly[dayOf(date)] ?? []);
  const any = Object.values(a.weekly).some((r) => r?.length);
  if (!any && !own) return null;
  return ranges.some(([s, e]) => at(date, s, tz) <= now && now < at(date, e, tz));
}

/** Out of office until: the later of a calendar block covering now and a hand-set date range covering today. */
export function outUntil(r: Pick<RawRep, "out_dates" | "calendar_out_until" | "tz">, now: number): number | null {
  const tz = validZone(r.tz) ? r.tz : "UTC";
  const today = dateIn(now, tz);
  let until = r.calendar_out_until ? Date.parse(r.calendar_out_until) : null;
  for (const d of r.out_dates ?? []) {
    if (typeof d?.from !== "string" || typeof d?.to !== "string") continue;
    if (d.from <= today && today <= d.to) {
      const end = at(addDays(d.to, 1), "00:00", tz);
      until = Math.max(until ?? 0, end);
    }
  }
  return until;
}

const pausedUntil = (v: string | null) => (v === null ? null : v === "infinity" ? Infinity : Date.parse(v));

/** The values rules can test, by field name (see `Cond` in types.ts). */
export function valuesOf(raw: RawFacts, reason: Reason): Record<string, unknown> {
  const c = raw.contact;
  const co = raw.company;
  const v: Record<string, unknown> = {
    "lead.country": co?.country ?? c.country ?? null,
    "lead.source": reason === "form" ? "form" : reason === "import" ? "import" : reason === "crm" ? "crm" : "api",
    "lead.score": c.score,
    "lead.band": c.score_band,
    "lead.form": raw.submission?.form_id ?? null,
    "contact.email_domain": raw.domain,
    "contact.email_class": c.email_class,
    "contact.title": c.title,
    "contact.country": c.country,
    "contact.region": c.region,
    "contact.lifecycle": c.lifecycle,
    "contact.lead_status": c.lead_status,
    "company.name": co?.name ?? null,
    "company.domain": co?.domain ?? null,
    "company.country": co?.country ?? null,
    "company.industry": co?.industry ?? null,
    "company.size": co?.size ?? null,
  };
  for (const [k, x] of Object.entries(c.fields ?? {})) v[`contact.f.${k}`] = x;
  for (const [k, x] of Object.entries(co?.fields ?? {})) v[`company.f.${k}`] = x;
  for (const [k, x] of Object.entries(raw.submission?.values ?? {})) v[`answer.${k}`] = x;
  const h = raw.submission?.hidden ?? {};
  for (const k of ["source", "medium", "campaign", "term", "content"]) v[`utm.${k}`] = h[`utm_${k}`] ?? h[`first_utm_${k}`] ?? null;
  return v;
}

/** The raw read as the engine's facts. */
export function toFacts(raw: RawFacts, reason: Reason, now = Date.now()): Facts {
  const c = raw.contact;
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "";
  const reps: Record<string, RepFacts> = {};
  for (const [id, r] of Object.entries(raw.reps ?? {})) {
    reps[id] = {
      name: r.name,
      member: r.member,
      tz: r.tz,
      pausedUntil: pausedUntil(r.paused_until),
      outUntil: outUntil(r, now),
      backup: r.backup,
      capDay: r.cap_day,
      capWeek: r.cap_week,
      today: Number(r.today) || 0,
      week: Number(r.week) || 0,
      meetingsWeek: Number(r.meetings_week) || 0,
      inHours: inHours(r.availability, now),
    };
  }
  const counts: Facts["counts"] = {};
  for (const [q, byUser] of Object.entries(raw.counts ?? {})) {
    counts[q] = {};
    for (const [u, x] of Object.entries(byUser ?? {})) counts[q][u] = { n: Number(x.n) || 0, last: Date.parse(x.last) || 0 };
  }
  const co = raw.company;
  return {
    now,
    lead: {
      id: c.id ?? "",
      name,
      email: c.email,
      emailClass: c.email_class,
      domain: raw.domain,
      firstName: c.first_name,
      lastName: c.last_name,
      recent: Number(raw.recent) || 0,
      disposable: false,
    },
    values: valuesOf(raw, reason),
    owner: raw.owner,
    company: co ? { id: co.id, name: co.name, domain: co.domain, owner: co.owner, ownerCrm: co.owner_crm, oppOwner: co.opp_owner, oppName: co.opp_name } : null,
    reps,
    counts,
    lists: raw.lists ?? { allow: [], block: [] },
    ...(raw.teams ? { teams: raw.teams } : {}),
    ...(raw.company_match ? { companyMatch: raw.company_match } : {}),
  };
}

/** Whether an email's domain is a throwaway one (the identity cleaner's list). Loaded on use: it reads a file. */
async function disposable(email: string | null): Promise<boolean> {
  if (!email) return false;
  const { cleanEmail } = await import("../identity/clean.ts");
  const e = cleanEmail(email);
  return "rejected" in e && e.rejected === "disposable";
}

/**
 * The reps and queues a body names, for the facts read: its queues (and the teams a v2 body only names: rule teams,
 * Everyone else, the backup and the scope's teams), and the people it names.
 */
export function namesOf(body: RouterBody): { users: string[]; queues: string[] } {
  const users = new Set<string>();
  const queues = new Set<string>(body.queues.map((q) => q.id));
  for (const q of body.queues) for (const m of q.members) users.add(m.user);
  if (body.fallback?.kind === "user") users.add(body.fallback.id);
  if (body.fallback?.kind === "queue") queues.add(body.fallback.id);
  for (const r of body.rules.list) {
    if ((r.then ?? "queue") === "queue" && r.queue) queues.add(r.queue);
    if (r.then === "user" && r.user) users.add(r.user);
  }
  if (body.backup?.kind === "user") users.add(body.backup.id);
  if (body.backup?.kind === "queue") queues.add(body.backup.id);
  for (const u of body.scope?.people ?? []) users.add(u);
  for (const t of body.scope?.teams ?? []) queues.add(t);
  if (body.review?.owner) users.add(body.review.owner);
  return { users: [...users], queues: [...queues] };
}

/** Read one lead's facts for a body. Null when the contact is gone; `existing` when the key was routed already. */
export async function readFacts(
  rpc: Rpc,
  o: { ws: string; contact: string | null; email?: string | null; key: string | null; body: RouterBody; reason: Reason; now?: number; users?: string[] },
): Promise<{ facts: Facts; raw: RawFacts } | { existing: NonNullable<RawFacts["existing"]> } | null> {
  const n = namesOf(o.body);
  // More reps to read (and their backups), for "Try a lead" when it says who the lead already works with.
  if (o.users?.length) n.users = [...new Set([...n.users, ...o.users])];
  let emailClass: string | null = null;
  if (!o.contact && o.email) {
    const { cleanEmail } = await import("../identity/clean.ts");
    const e = cleanEmail(o.email);
    emailClass = "rejected" in e ? null : e.class;
  }
  const args = { p_ws: o.ws, p_contact: o.contact, p_key: o.key, p_users: n.users, p_queues: n.queues, p_email: o.email ?? null, p_email_class: emailClass };
  // One read with teams and quota counts (routing_facts, 095), else with the enrichment columns (router_facts_full,
  // 090); the two old reads while neither is there.
  const full = (await callNewer(rpc, "routing_facts", args)) ?? (await callNewer(rpc, "router_facts_full", args));
  if (full?.error) throw new Error(`routing facts: ${full.error.message}`);
  const raw = full ? (full.data as RawFacts | null) : await call<RawFacts | null>(rpc, "router_facts", args);
  if (!raw) return null;
  if (raw.existing) return { existing: raw.existing };
  const facts = toFacts(raw, o.reason, o.now);
  facts.lead.disposable = await disposable(raw.contact.email_clean ?? raw.contact.email);
  // The columns enrichment and qualify added (068_enrichment.sql).
  if (raw.contact.id) {
    const more = full ? (raw.more ?? null) : await call<RawFacts["more"] | null>(rpc, "router_facts_more", { p_contact: raw.contact.id }).catch(() => null);
    facts.values["contact.seniority"] = more?.seniority ?? null;
    facts.values["contact.department"] = more?.department ?? null;
    facts.values["lead.qualify"] = more?.qualify ?? null;
    facts.values["company.employees"] = more?.employees ?? null;
  }
  return { facts, raw };
}

export type Routed =
  | { status: "ok" | "dup"; run: string; decision: Decision | null; result: Decision["result"] }
  | { status: "no_router" | "paused" | "gone" | "spam" }
  /** The caller's gate said no just before router_commit (a job took the lead meanwhile): nothing was written. */
  | { status: "late" };

/** Whether a body's rules or company types test the qualify outcome. */
export function usesQualify(body: RouterBody): boolean {
  const test = (conds: { field: string }[] | undefined) => !!conds?.some((c) => c.field === "lead.qualify");
  return (body.rules.on && body.rules.list.some((r) => r.on !== false && test(r.conds))) || !!body.segments?.some((sg) => test(sg.conds));
}

/** A live policy: its config (a router body), version, and whether routing is paused. `policy_id` from 095 on. */
export type LiveRouter = { version: number; body: RouterBody; paused?: boolean; policy_id?: string };

/** The source a run is for (routing_sources): its id and live revision, stored on the run. */
export type SourceRef = { id: string; revision: number };

/** Answers a person or a test gives, by routing field, with where they came from (form mappings). */
export type Inputs = { values: Record<string, unknown>; provenance: Record<string, Provenance>; issues: InputIssue[] };

/** The live router's body and version, and whether routing is paused. */
export async function liveRouter(rpc: Rpc, ws: string): Promise<LiveRouter | null> {
  const r = await call<LiveRouter | null>(rpc, "router_live", { p_ws: ws });
  return r ?? null;
}

/**
 * The live router on the visitor's path (form sends, booking pages), kept LIVE_TTL_MS per workspace. A publish or a
 * pause made on this server shows at once (invalidateRouterLive); on another server within LIVE_TTL_MS. Callers that
 * arrive together share one read; a failed read is never kept. The Router screens and the jobs read it fresh.
 */
export const LIVE_TTL_MS = 10_000;
const liveCache = new Map<string, { at: number; gen: number; value: Promise<LiveRouter | null> }>();
let liveGen = 0;

export function liveRouterCached(rpc: Rpc, ws: string, now = Date.now()): Promise<LiveRouter | null> {
  const hit = liveCache.get(ws);
  if (hit && now - hit.at < LIVE_TTL_MS) return hit.value;
  const gen = ++liveGen;
  const value = liveRouter(rpc, ws);
  if (liveCache.size > 5000) liveCache.clear();
  liveCache.set(ws, { at: now, gen, value });
  // Only this read's own entry goes on a failure, never a newer one.
  value.catch(() => {
    if (liveCache.get(ws)?.gen === gen) liveCache.delete(ws);
  });
  return value;
}

/** Forget a workspace's cached live router (all of them with no argument): after router_publish, a rollback, router_pause. */
export function invalidateRouterLive(ws?: string): void {
  if (ws === undefined) liveCache.clear();
  else liveCache.delete(ws);
  forgetSources();
}

/**
 * Route one lead with the live router. `key` makes it once-only (the fill id, an import row, an API key). A lead marked
 * spam isn't routed unless `force` (Held's "Let through"). After a missed response time, `passed` names the reps who
 * let it wait (they're skipped) and `before` is the line that says so, put first in the run.
 */
export async function route(
  rpc: Rpc,
  o: {
    ws: string;
    contact: string;
    key: string;
    reason: Reason;
    byUser?: string | null;
    force?: boolean;
    skipSpam?: boolean;
    passed?: string[];
    before?: StepResult[];
    live?: { version: number; body: RouterBody; paused?: boolean } | null;
    now?: () => number;
    /** Qualify the lead now (enrich/server.ts qualifyContact), for a body whose rules test its outcome. */
    qualify?: (contact: string) => Promise<unknown>;
    /**
     * Asked once, just before the first router_commit: false means the caller handed the lead to a job meanwhile, so
     * nothing is written here ("late"); true means this call owns the commit.
     */
    gate?: () => boolean;
    /** The source connection this run is for, stored on the run with its revision. */
    source?: SourceRef | null;
    /** A submission's mapped answers (routing/mapping.ts): values with their origin, and answers that don't fit. */
    inputs?: Inputs | null;
    /** The run's first booking state: awaiting_selection when its source shows a calendar. */
    booking?: "not_requested" | "awaiting_selection";
    submission?: string | null;
    /** A child attempt's parent run (an approved review). */
    parent?: string | null;
  },
): Promise<Routed> {
  const live = o.live === undefined ? await liveRouter(rpc, o.ws) : o.live;
  if (!live) return { status: "no_router" };
  // Paused: new leads keep the owner they come with.
  if (live.paused) return { status: "paused" };
  const t0 = Date.now();
  // A rule that tests the qualify outcome waits for it, up to 3 seconds; with none by then the lead goes on without.
  if (o.qualify && usesQualify(live.body)) {
    await Promise.race([o.qualify(o.contact).catch(() => undefined), new Promise((r) => setTimeout(r, 3000))]);
  }
  for (let tries = 0; tries < 3; tries++) {
    const now = o.now?.() ?? Date.now();
    const read = await readFacts(rpc, { ws: o.ws, contact: o.contact, key: o.key, body: live.body, reason: o.reason, now });
    if (!read) return { status: "gone" };
    if ("existing" in read) {
      const e = read.existing;
      const result: Decision["result"] = e.kind === "owner" ? { kind: "owner", user: e.owner!, by: (e.by ?? "queue") as "queue", ...(e.queue ? { queue: e.queue } : {}), ...(e.rule ? { rule: e.rule } : {}) } : e.kind === "held" ? { kind: "held", signals: [] } : { kind: "unassigned" };
      return { status: "dup", run: e.id, decision: null, result };
    }
    if (read.raw.contact.route_status === "spam" && !o.force) return { status: "spam" };
    // Held's "Let through": a person looked at it, so the spam step and the block list are skipped.
    const body = o.skipSpam ? { ...live.body, spam: { ...live.body.spam, on: false } } : live.body;
    if (o.skipSpam) read.facts.lists = { ...read.facts.lists, block: [] };
    if (o.passed?.length) read.facts.passed = o.passed;
    if (o.inputs) withInputs(read.facts, o.inputs);
    const { evaluate } = await import("../routing/evaluate.ts");
    const ev = evaluate(body, read.facts);
    const decided = ev.decision;
    const d: Decision = o.before?.length ? { ...decided, steps: [...o.before, ...decided.steps] } : decided;
    const pick = pickFor(body, d);
    if (o.gate && tries === 0 && !o.gate()) return { status: "late" };
    const res = await commit(rpc, {
      ws: o.ws,
      contact: o.contact,
      key: o.key,
      reason: o.reason,
      live,
      decision: d,
      trace: ev.trace,
      facts: read.facts,
      ms: Date.now() - t0,
      byUser: o.byUser ?? null,
      pick,
      source: o.source ?? null,
      booking: d.result.kind === "owner" ? (o.booking ?? "not_requested") : "not_requested",
      submission: o.submission ?? null,
      parent: o.parent ?? null,
    });
    if (res.status === "ok") {
      // The queue's turn was taken under the lock: the run's lines and owner are as written.
      const decision: Decision = pick && res.owner && d.result.kind === "owner" ? { result: { ...d.result, user: res.owner }, steps: (res.steps as Decision["steps"]) ?? d.steps } : d;
      return { status: "ok", run: res.id!, decision, result: decision.result };
    }
    if (res.status === "dup") {
      const x = res as Committed & { by?: string; queue?: string | null; rule?: string | null };
      const result: Decision["result"] =
        res.kind === "owner"
          ? { kind: "owner", user: res.owner!, by: (x.by ?? "queue") as "queue", ...(x.queue ? { queue: x.queue } : {}), ...(x.rule ? { rule: x.rule } : {}) }
          : res.kind === "held"
            ? { kind: "held", signals: [] }
            : { kind: "unassigned" };
      return { status: "dup", run: res.id!, decision: null, result };
    }
    if (res.status === "gone") return { status: "gone" };
    // stale: decide again with fresh facts (the rep's new count or pause is in them now).
  }
  throw new Error("The router couldn't settle on a rep; trying again later.");
}

/** A submission's mapped answers over the facts: this submission's answers win for this decision (Section 9). */
export function withInputs(f: Facts, i: Inputs): Facts {
  Object.assign(f.values, i.values);
  f.provenance = { ...(f.provenance ?? {}), ...i.provenance };
  if (i.issues.length) f.issues = [...(f.issues ?? []), ...i.issues];
  return f;
}

/**
 * For a pick from a queue (a rule's, Everyone else's or the backup's), the reps who could take it, so the committer
 * can take the turn under the team's lock. Reps the engine left out (status, scope, hours, a missed response time)
 * stay out; pause, out of office and caps are checked again there. A v1 fallback pick names only the rep it picked,
 * as before.
 */
export function pickFor(body: RouterBody, d: Decision): { queue: string; method: string; candidates: { user: string; weight: number }[] } | null {
  const r = d.result;
  if (r.kind !== "owner" || !r.queue || (r.by !== "queue" && r.by !== "fallback" && r.by !== "backup")) return null;
  const q = body.queues.find((x) => x.id === r.queue);
  const step = d.steps.find((s): s is Extract<Decision["steps"][number], { step: "queue" }> => s.step === "queue" && s.queue.id === r.queue);
  const members = q?.members ?? [...(step?.others ?? []).map((o) => ({ user: o.user, weight: 1 })), { user: r.user, weight: 1 }];
  if (!q && !step && r.by !== "backup") return null;
  const out = new Set((step?.others ?? []).filter((o) => o.why).map((o) => o.user));
  if ((r.by === "fallback" && body.v !== 2) || (r.by === "backup" && !step)) for (const m of members) if (m.user !== r.user) out.add(m.user);
  return { queue: r.queue, method: q?.method ?? step?.queue.method ?? "rr", candidates: members.filter((m) => m.user === r.user || !out.has(m.user)).map((m) => ({ user: m.user, weight: m.weight })) };
}

type Committed = { status: string; id?: string; kind?: string; owner?: string | null; steps?: unknown; effect?: string; reason?: string };

/**
 * The committer (routing_commit, 095): one transaction that rechecks what may have changed and writes the owner, the
 * run with its trace, the assignment event, the count and the queue turn, or the review item. Before 095, the old
 * router_commit.
 */
async function commit(
  rpc: Rpc,
  c: {
    ws: string;
    contact: string;
    key: string;
    reason: Reason;
    live: LiveRouter;
    decision: Decision;
    trace: unknown;
    facts: Facts;
    ms: number;
    byUser: string | null;
    pick: ReturnType<typeof pickFor>;
    source: SourceRef | null;
    booking: "not_requested" | "awaiting_selection";
    submission: string | null;
    parent: string | null;
  },
): Promise<Committed> {
  const body = c.live.body;
  const r = c.decision.result;
  const by = r.kind === "owner" ? r.by : null;
  const v2 = body.v === 2;
  // What the committer checks again (Section 22): v2 rechecks pause, out of office and the cap for every new owner;
  // v1 as before (queue picks and the fallback checked for pause, queue picks for caps).
  const recheck = v2
    ? { away: by !== "hand", caps: by !== "hand" && (by === "account" || by === "keep" ? body.ownership?.capBlocksNew !== false : true) }
    : { away: by === "queue" || by === "fallback", caps: by === "queue" };
  const p = {
    ws: c.ws,
    contact: c.contact,
    key: c.key,
    reason: c.reason,
    policy_id: c.live.policy_id ?? null,
    policy_version: c.live.version,
    source_id: c.source?.id ?? null,
    source_revision: c.source?.revision ?? null,
    parent_run: c.parent,
    submission: c.submission,
    decision: r.kind === "owner" ? r : r.kind === "held" ? { kind: "held", signals: r.signals, ...(r.reason ? { reason: r.reason } : {}) } : { kind: "unassigned", reason: r.reason ?? "no_eligible_recipient" },
    steps: c.decision.steps,
    trace: c.trace,
    facts: c.facts,
    ms: c.ms,
    by_user: c.byUser,
    set_company: body.account.setCompanyOwner,
    reviewer: body.review?.owner ?? null,
    booking_state: c.booking,
    expect_owner: c.facts.owner?.user ?? null,
    recheck,
    ...(c.pick ? { pick: c.pick } : {}),
  };
  const res = await callNewer(rpc, "routing_commit", { p });
  if (res) {
    if (res.error) throw new Error(`routing_commit: ${res.error.message}`);
    return res.data as Committed;
  }
  return call<Committed>(rpc, "router_commit", {
    p_ws: c.ws,
    p_contact: c.contact,
    p_key: c.key,
    p_reason: c.reason,
    p_version: c.live.version,
    p_result: r.kind === "owner" ? r : { kind: r.kind },
    p_steps: c.decision.steps,
    p_facts: c.facts,
    p_ms: c.ms,
    p_set_company: body.account.setCompanyOwner,
    p_by_user: c.byUser,
    p_pick: c.pick,
  });
}

/** Test a lead against a body without writing anything (docs/router-ux.md 4.3). Changed fields override the lead's. */
export async function testRoute(
  rpc: Rpc,
  o: { ws: string; contact?: string | null; email?: string | null; body: RouterBody; changes?: Record<string, unknown>; owners?: TryOwners; now?: number },
): Promise<{ decision: Decision; facts: Facts } | null> {
  const users = [o.owners?.company, o.owners?.contact].filter((u): u is string => typeof u === "string" && UUID_RE.test(u));
  const read = await readFacts(rpc, { ws: o.ws, contact: o.contact ?? null, email: o.email, key: null, body: o.body, reason: "form", now: o.now, users });
  if (!read || "existing" in read) return null;
  const facts = withTryOwners(read.facts, o.owners);
  for (const [k, v] of Object.entries(o.changes ?? {})) facts.values[k] = v;
  return { decision: decide(o.body, facts), facts };
}

const UUID_RE = /^[0-9a-f-]{36}$/;

/**
 * "Try a lead": who the lead's company and the lead already work with, as typed in the panel. Left out (undefined),
 * the facts stay as read; a rep's id or null (nobody yet) replaces them. A company that doesn't exist yet is made up
 * from the email's domain, so "Same company, same rep" can be tried before the company is in the CRM. Writes nothing.
 */
export type TryOwners = { company?: string | null; contact?: string | null };

export function withTryOwners(f: Facts, o: TryOwners | undefined): Facts {
  if (!o) return f;
  const out: Facts = { ...f };
  if (o.company !== undefined) {
    const owner = o.company && UUID_RE.test(o.company) ? o.company : null;
    const domain = f.company?.domain ?? f.lead.domain ?? null;
    out.company = f.company
      ? { ...f.company, owner, ownerCrm: null, oppOwner: null, oppName: null }
      : owner && domain
        ? { id: "try", name: domain, domain, owner, ownerCrm: null, oppOwner: null, oppName: null }
        : null;
  }
  if (o.contact !== undefined) {
    const user = o.contact && UUID_RE.test(o.contact) ? o.contact : null;
    out.owner = { user, crm: null };
  }
  return out;
}
