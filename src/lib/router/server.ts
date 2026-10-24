// Routing a lead (docs/router-ux.md 7.4): read the facts in one call (router_facts), decide in memory (engine.ts),
// write under a lock in one call (router_commit). A pick that went stale meanwhile (a cap filled, a rep paused) is
// decided again with fresh facts, at most twice. A key seen before returns its first answer and writes nothing. Server
// only: the form send, the API, the jobs and the Test panel call it.

import type { Rpc } from "../jobs.ts";
import type { Availability } from "../meetings/types.ts";
import { addDays, at, dateIn, dayOf, validZone } from "../meetings/time.ts";
import { decide } from "./engine.ts";
import type { Decision, Facts, Reason, RepFacts, RouterBody, StepResult } from "./types.ts";

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
  };
}

/** Whether an email's domain is a throwaway one (the identity cleaner's list). Loaded on use: it reads a file. */
async function disposable(email: string | null): Promise<boolean> {
  if (!email) return false;
  const { cleanEmail } = await import("../identity/clean.ts");
  const e = cleanEmail(email);
  return "rejected" in e && e.rejected === "disposable";
}

/** The reps and queues a body names, for router_facts. */
export function namesOf(body: RouterBody): { users: string[]; queues: string[] } {
  const users = new Set<string>();
  for (const q of body.queues) for (const m of q.members) users.add(m.user);
  if (body.fallback?.kind === "user") users.add(body.fallback.id);
  return { users: [...users], queues: body.queues.map((q) => q.id) };
}

/** Read one lead's facts for a body. Null when the contact is gone; `existing` when the key was routed already. */
export async function readFacts(
  rpc: Rpc,
  o: { ws: string; contact: string | null; email?: string | null; key: string | null; body: RouterBody; reason: Reason; now?: number },
): Promise<{ facts: Facts; raw: RawFacts } | { existing: NonNullable<RawFacts["existing"]> } | null> {
  const n = namesOf(o.body);
  let emailClass: string | null = null;
  if (!o.contact && o.email) {
    const { cleanEmail } = await import("../identity/clean.ts");
    const e = cleanEmail(o.email);
    emailClass = "rejected" in e ? null : e.class;
  }
  const raw = await call<RawFacts | null>(rpc, "router_facts", { p_ws: o.ws, p_contact: o.contact, p_key: o.key, p_users: n.users, p_queues: n.queues, p_email: o.email ?? null, p_email_class: emailClass });
  if (!raw) return null;
  if (raw.existing) return { existing: raw.existing };
  const facts = toFacts(raw, o.reason, o.now);
  facts.lead.disposable = await disposable(raw.contact.email_clean ?? raw.contact.email);
  return { facts, raw };
}

export type Routed =
  | { status: "ok" | "dup"; run: string; decision: Decision | null; result: Decision["result"] }
  | { status: "no_router" | "gone" | "spam" };

/** The live router's body and version. */
export async function liveRouter(rpc: Rpc, ws: string): Promise<{ version: number; body: RouterBody } | null> {
  const r = await call<{ version: number; body: RouterBody } | null>(rpc, "router_live", { p_ws: ws });
  return r ?? null;
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
    live?: { version: number; body: RouterBody } | null;
    now?: () => number;
  },
): Promise<Routed> {
  const live = o.live === undefined ? await liveRouter(rpc, o.ws) : o.live;
  if (!live) return { status: "no_router" };
  const t0 = Date.now();
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
    const decided = decide(body, read.facts);
    const d: Decision = o.before?.length ? { ...decided, steps: [...o.before, ...decided.steps] } : decided;
    const pick = pickFor(body, d);
    const res = await call<{ status: string; id?: string; kind?: string; owner?: string | null; steps?: unknown }>(rpc, "router_commit", {
      p_ws: o.ws,
      p_contact: o.contact,
      p_key: o.key,
      p_reason: o.reason,
      p_version: live.version,
      p_result: d.result.kind === "owner" ? d.result : { kind: d.result.kind },
      p_steps: d.steps,
      p_facts: read.facts,
      p_ms: Date.now() - t0,
      p_set_company: live.body.account.setCompanyOwner,
      p_by_user: o.byUser ?? null,
      p_pick: pick,
    });
    if (res.status === "ok") {
      // The queue's turn was taken under the lock: the run's lines and owner are as written.
      const decision: Decision = pick && res.owner && d.result.kind === "owner" ? { result: { ...d.result, user: res.owner }, steps: (res.steps as Decision["steps"]) ?? d.steps } : d;
      return { status: "ok", run: res.id!, decision, result: decision.result };
    }
    if (res.status === "dup") {
      const result: Decision["result"] = res.kind === "owner" ? { kind: "owner", user: res.owner!, by: "queue" } : res.kind === "held" ? { kind: "held", signals: [] } : { kind: "unassigned" };
      return { status: "dup", run: res.id!, decision: null, result };
    }
    if (res.status === "gone") return { status: "gone" };
    // stale: decide again with fresh facts (the rep's new count or pause is in them now).
  }
  throw new Error("The router couldn't settle on a rep; trying again later.");
}

/**
 * For a pick from a queue (a rule's, or the fallback's), the reps who could take it, in the queue's order, so
 * router_commit can take the turn under the queue's lock with fresh counts. Reps the engine left out for their status
 * or hours stay out; caps are checked again there.
 */
export function pickFor(body: RouterBody, d: Decision): { queue: string; method: string; candidates: { user: string; weight: number }[] } | null {
  const r = d.result;
  if (r.kind !== "owner" || !r.queue || (r.by !== "queue" && r.by !== "fallback")) return null;
  const q = body.queues.find((x) => x.id === r.queue);
  if (!q) return null;
  const step = d.steps.find((s): s is Extract<Decision["steps"][number], { step: "queue" }> => s.step === "queue" && s.queue.id === q.id);
  const out = new Set((step?.others ?? []).filter((o) => o.why).map((o) => o.user));
  if (r.by === "fallback") for (const m of q.members) if (m.user !== r.user) out.add(m.user);
  return { queue: q.id, method: q.method, candidates: q.members.filter((m) => m.user === r.user || !out.has(m.user)).map((m) => ({ user: m.user, weight: m.weight })) };
}

/** Test a lead against a body without writing anything (docs/router-ux.md 4.3). Changed fields override the lead's. */
export async function testRoute(rpc: Rpc, o: { ws: string; contact?: string | null; email?: string | null; body: RouterBody; changes?: Record<string, unknown>; now?: number }): Promise<{ decision: Decision; facts: Facts } | null> {
  const read = await readFacts(rpc, { ws: o.ws, contact: o.contact ?? null, email: o.email, key: null, body: o.body, reason: "form", now: o.now });
  if (!read || "existing" in read) return null;
  const facts = read.facts;
  for (const [k, v] of Object.entries(o.changes ?? {})) facts.values[k] = v;
  return { decision: decide(o.body, facts), facts };
}
