// The router's engine (docs/router.md Part 3, docs/routing-workflow.md Section 21): facts in, a path and an owner out.
// Pure and in memory: the same facts always give the same answer, so a real route, the Test panel, Replay and the
// policy tester all run this one function. It never writes: the server reads the facts (routing_facts) and the
// committer writes the result under its locks (routing_commit), checking again what may have changed meanwhile.
//
// A body's `v` picks its semantics. v1 is every body made before policies, kept exactly as it ran. v2 is the spec:
// typed conditions, ownership in the policy's order and scope, one backup hop then review
// (docs/routing-current-to-target.md Part 3). Distribution is the same for both: a team from the database takes
// turns from its persisted next position.

import { ruleMatches, segmentsOf } from "./conditions.ts";
import { spamSignals } from "./spam.ts";
import type { Backup, Decision, Facts, OwnerKind, Queue, RepFacts, Result, RouterBody, StepResult, TeamFacts, WhenOut, Why, Then } from "./types.ts";

/**
 * Why a rep can't take a new lead now, or null when they can. `forOwner`: keeping a lead they own skips caps and hours.
 * `passed`: they let this lead wait past its response time, so it goes to someone else.
 */
export function blocked(rep: RepFacts | undefined, now: number, o: { forOwner?: boolean; hoursOnly?: boolean; passed?: boolean } = {}): { why: Why; until?: number | null } | null {
  if (!rep || !rep.member) return { why: "not_member" };
  if (o.passed) return { why: "passed" };
  if (rep.pausedUntil !== null && rep.pausedUntil > now) return { why: "paused", until: Number.isFinite(rep.pausedUntil) ? rep.pausedUntil : null };
  if (rep.outUntil !== null && rep.outUntil > now) return { why: "out", until: rep.outUntil };
  if (o.forOwner) return null;
  if (rep.capDay !== null && rep.today >= rep.capDay) return { why: "cap_day" };
  if (rep.capWeek !== null && rep.week >= rep.capWeek) return { why: "cap_week" };
  if (o.hoursOnly && rep.inHours === false) return { why: "hours" };
  return null;
}

type Pick = { user: string; n: number } | null;

/** A team's members from its persisted next position on, wrapping round: the order turns are taken in. */
export function rotation(team: Pick2<TeamFacts, "members" | "next">): TeamFacts["members"] {
  const ms = [...team.members].sort((a, b) => a.position - b.position);
  const i = ms.findIndex((m) => m.position >= team.next);
  return i <= 0 ? ms : [...ms.slice(i), ...ms.slice(0, i)];
}
type Pick2<T, K extends keyof T> = { [P in K]: T[P] };

export type QueueOpts = {
  /** v2: who's in the policy's scope, and the contact's current owner (kept without a turn, past their cap). */
  v2?: { scope: (user: string) => boolean; owner: string | null };
};

/**
 * Pick one member of a queue. A team from the database (`f.teams`) that takes turns starts from its persisted next
 * position and takes the first member who can take the lead (docs/routing-workflow.md Section 12): one shared queue per
 * team. Without it (a draft's own queue, older facts): fewest leads from this queue in 30 days, then the one who waited
 * longest, then the queue's order. Weighted: the count divided by the weight. By load: fewest meetings this week.
 * Strict keeps that order even outside working hours. The committer takes the turn again under the team's lock.
 */
export function pickInQueue(
  q: Queue,
  f: Facts,
  o: QueueOpts = {},
): { picked: Pick; others: { user: string; n: number; why?: Why; until?: number | null }[]; window: number; next?: number; retained?: boolean } {
  const team = f.teams?.[q.id];
  const method = team?.method ?? q.method;
  const strict = team?.strict ?? q.strict;
  // v2: working hours never stop someone owning a lead (Section 12); the calendar shows their next free times.
  const hoursOnly = o.v2 ? false : (team?.hoursOnly ?? q.hoursOnly);
  const members = team ? rotation(team).map((m) => ({ user: m.user, weight: m.weight })) : q.members;
  const counts = f.counts[q.id] ?? {};
  const window = Object.values(counts).reduce((a, c) => a + c.n, 0);
  const turns = !!team && method === "rr";
  const scored = members.map((m, i) => {
    const rep = f.reps[m.user];
    const c = counts[m.user] ?? { n: 0, last: 0 };
    const score = turns ? i : method === "load" ? (rep?.meetingsWeek ?? 0) : method === "weighted" ? c.n / Math.max(1, Math.min(10, m.weight || 1)) : c.n;
    const no = o.v2
      ? eligibleWhy(rep, f, { scope: o.v2.scope(m.user), retain: m.user === o.v2.owner, passed: passedBy(f, m.user) })
      : blocked(rep, f.now, { hoursOnly: hoursOnly && !strict, passed: passedBy(f, m.user) });
    return { user: m.user, n: method === "load" ? (rep?.meetingsWeek ?? 0) : c.n, score, last: turns ? 0 : c.last, i, no };
  });
  const order = [...scored].sort((a, b) => a.score - b.score || a.last - b.last || a.i - b.i);
  const first = order.find((x) => !x.no) ?? null;
  const owner = o.v2?.owner ?? f.owner?.user ?? null;
  return {
    picked: first ? { user: first.user, n: first.n } : null,
    others: scored.filter((x) => x.user !== first?.user).map((x) => ({ user: x.user, n: x.n, ...(x.no ? { why: x.no.why, ...(x.no.until !== undefined ? { until: x.no.until } : {}) } : {}) })),
    window,
    ...(turns ? { next: team!.next } : {}),
    ...(first && owner && first.user === owner ? { retained: true } : {}),
  };
}

/**
 * v2 eligibility, in the spec's order (Section 12): in the workspace, in the policy's scope, not passed over for a
 * missed response time, accepting leads (not paused), not out of office, then the cap, which only stops a new owner:
 * someone keeping a lead they already own is never stopped by their cap.
 */
export function eligibleWhy(rep: RepFacts | undefined, f: Facts, o: { scope: boolean; retain: boolean; passed?: boolean }): { why: Why; until?: number | null } | null {
  if (!rep || !rep.member) return { why: "not_member" };
  if (!o.scope) return { why: "out_of_scope" };
  if (o.passed) return { why: "passed" };
  if (rep.pausedUntil !== null && rep.pausedUntil > f.now) return { why: "paused", until: Number.isFinite(rep.pausedUntil) ? rep.pausedUntil : null };
  if (rep.outUntil !== null && rep.outUntil > f.now) return { why: "out", until: rep.outUntil };
  if (o.retain) return null;
  if (rep.capDay !== null && rep.today >= rep.capDay) return { why: "cap_day" };
  if (rep.capWeek !== null && rep.week >= rep.capWeek) return { why: "cap_week" };
  return null;
}

/** A team's members by the body's queue id: the database's when the facts have it, else the body's own. */
export function teamMembers(body: RouterBody, f: Facts, id: string): string[] {
  const t = f.teams?.[id];
  if (t) return [...t.members].sort((a, b) => a.position - b.position).map((m) => m.user);
  return body.queues.find((q) => q.id === id)?.members.map((m) => m.user) ?? [];
}

/** Whether a person is in a body's scope: every member (v1, or `everyone`), else the people and teams named. */
export function inScope(body: RouterBody, f: Facts, user: string): boolean {
  const s = body.scope;
  if (!s || s.everyone) return true;
  if (s.people.includes(user)) return true;
  return s.teams.some((t) => teamMembers(body, f, t).includes(user));
}

/** A queue by id: the body's, or a database team the body only names (a v2 policy keeps no copy of its teams). */
function queueOf(body: RouterBody, f: Facts, id: string): Queue | undefined {
  const q = body.queues.find((x) => x.id === id);
  if (q) return q;
  const t = f.teams?.[id];
  return t ? { id, name: t.name, method: t.method, strict: t.strict, hoursOnly: t.hoursOnly, members: [] } : undefined;
}

const passedBy = (f: Facts, user: string) => !!f.passed?.includes(user);

/** An owner who's out or paused: keep them, give it to their backup, or route on. One who let it wait is never kept. */
function whenOut(action: WhenOut, owner: string, f: Facts, why: Why): { keep: string | null; backup?: string } {
  if (action === "keep" && why !== "passed") return { keep: owner };
  if (action === "backup" || (action === "keep" && why === "passed")) {
    const b = f.reps[owner]?.backup;
    if (b && b !== owner && !blocked(f.reps[b], f.now, { forOwner: true, passed: passedBy(f, b) })) return { keep: b, backup: b };
  }
  return { keep: null };
}

/**
 * Whether an owner result is new (a quota charge, and the team's turn when a team picked them) or the owner the
 * contact already had (neither). The committer works it out again from the contact it locked.
 */
export const effectOf = (r: Result, f: { owner: Facts["owner"] }): "new" | "retained" | "none" => (r.kind !== "owner" ? "none" : r.user === (f.owner?.user ?? null) ? "retained" : "new");

export function decide(body: RouterBody, f: Facts): Decision {
  const steps: StepResult[] = [];

  // 1. Spam.
  if (body.spam.on) {
    const s = spamSignals(body, f);
    steps.push({ step: "spam", ok: !s.signals.length, checks: s.checks, signals: s.signals, ...(s.allowed ? { allowed: true } : {}) });
    if (s.signals.length) return { result: { kind: "held", signals: s.signals }, steps };
  } else {
    // Blocked addresses are held even with the spam step off: the team listed them by hand.
    const s = spamSignals({ ...body, spam: { ...body.spam, disposable: false, fakeName: false, tooMany: false, freeMail: false } }, f);
    if (s.signals.length) {
      steps.push({ step: "spam", ok: false, checks: s.checks, signals: s.signals });
      return { result: { kind: "held", signals: s.signals }, steps };
    }
    steps.push({ step: "spam", ok: true, off: true, checks: 0, signals: [] });
  }

  if (body.v === 2) return decideV2(body, f, steps);

  // 2. The account's owner.
  if (body.account.on) {
    const c = f.company;
    const r: Extract<StepResult, { step: "account" }> = { step: "account", ok: false };
    if (!f.lead.email) r.miss = "no_email";
    else if (f.lead.emailClass === "free") r.miss = "free_mail";
    else if (!c) r.miss = "no_company";
    else {
      r.company = { id: c.id, name: c.name, domain: c.domain };
      const opp = body.account.oppFirst ? c.oppOwner : null;
      const owner = opp ?? c.owner;
      if (!owner) r.miss = c.ownerCrm ? "unmapped" : "no_owner";
      else {
        r.owner = owner;
        r.via = opp ? "opp" : "company";
        if (opp) r.opp = c.oppName;
        const no = blocked(f.reps[owner], f.now, { forOwner: true, passed: passedBy(f, owner) });
        if (!no) r.ok = true;
        else if (no.why === "not_member") r.unavailable = { user: owner, why: no.why };
        else {
          r.unavailable = { user: owner, why: no.why, until: no.until ?? null };
          r.action = no.why === "passed" && body.keep.whenOut === "keep" ? "backup" : body.keep.whenOut;
          const w = whenOut(body.keep.whenOut, owner, f, no.why);
          if (w.keep) {
            r.ok = true;
            if (w.backup) r.backup = w.backup;
          }
        }
      }
    }
    steps.push(r);
    if (r.ok) return { result: { kind: "owner", user: r.backup ?? r.owner!, by: "account" }, steps };
  } else steps.push({ step: "account", ok: false, off: true });

  // 3. Keep the contact's owner.
  if (body.keep.on) {
    const r: Extract<StepResult, { step: "keep" }> = { step: "keep", ok: false };
    const o = f.owner;
    if (!o?.user) r.miss = o?.crm ? "unmapped" : "no_owner";
    else {
      r.owner = o.user;
      const no = blocked(f.reps[o.user], f.now, { forOwner: true, passed: passedBy(f, o.user) });
      if (!no) r.ok = true;
      else if (no.why === "not_member") r.unavailable = { user: o.user, why: no.why };
      else {
        r.unavailable = { user: o.user, why: no.why, until: no.until ?? null };
        r.action = no.why === "passed" && body.keep.whenOut === "keep" ? "backup" : body.keep.whenOut;
        const w = whenOut(body.keep.whenOut, o.user, f, no.why);
        if (w.keep) {
          r.ok = true;
          if (w.backup) r.backup = w.backup;
        }
      }
    }
    steps.push(r);
    if (r.ok) return { result: { kind: "owner", user: r.backup ?? r.owner!, by: "keep" }, steps };
  } else steps.push({ step: "keep", ok: false, off: true });

  // 4. Rules, then 5. the queue they pick. The company's types are worked out first, for rules that test them.
  const values = body.segments?.length ? { ...f.values, "company.type": segmentsOf(body.segments, f.values, body.territories) } : f.values;
  if (body.rules.on) {
    const skipped: Extract<StepResult, { step: "rules" }>["skipped"] = [];
    let hit: { id: string; name: string; queue: string; then?: Then } | undefined;
    const notEvaluated: { id: string; name: string }[] = [];
    for (const rule of body.rules.list) {
      if (rule.on === false) continue;
      if (hit) {
        notEvaluated.push({ id: rule.id, name: rule.name });
        continue;
      }
      const m = ruleMatches(rule, values, body.territories);
      if (m.ok) {
        hit = { id: rule.id, name: rule.name, queue: rule.queue, ...(rule.then && rule.then !== "queue" && rule.then !== "user" ? { then: rule.then } : {}) };
        continue;
      }
      skipped.push({ id: rule.id, name: rule.name, failed: m.failed });
    }
    const later = notEvaluated.length ? { notEvaluated } : {};
    // A rule that holds: the lead waits for review, like junk.
    if (hit?.then === "hold") {
      steps.push({ step: "rules", ok: true, rule: hit, skipped, ...later });
      return { result: { kind: "held", signals: ["rule"] }, steps };
    }
    // A rule that sends to the owner: the rep on the open deal (when the account step looks there), the company's
    // owner, then the contact's owner. Away or missing, the lead goes on to the fallback.
    if (hit?.then === "owner") {
      const c = f.company;
      const owner = (body.account.oppFirst ? c?.oppOwner : null) ?? c?.owner ?? f.owner?.user ?? null;
      const no = owner ? blocked(f.reps[owner], f.now, { forOwner: true, passed: passedBy(f, owner) }) : null;
      const r: Extract<StepResult, { step: "rules" }> = { step: "rules", ok: !!owner && !no, rule: hit, skipped, ...later, ...(owner ? { owner } : {}), ...(owner && no ? { unavailable: { user: owner, why: no.why, until: no.until ?? null } } : {}) };
      steps.push(r);
      if (r.ok) return { result: { kind: "owner", user: owner!, by: "account", rule: hit.id }, steps };
    } else steps.push({ step: "rules", ok: !!hit, ...(hit ? { rule: hit } : {}), skipped, ...later });
    const q = hit && (hit.then ?? "queue") === "queue" ? queueOf(body, f, hit.queue) : undefined;
    if (hit && q) {
      const p = pickInQueue(q, f);
      steps.push({
        step: "queue",
        ok: !!p.picked,
        queue: { id: q.id, name: q.name, method: q.method, strict: q.strict },
        ...(p.picked ? { picked: p.picked.user, pickedN: p.picked.n } : {}),
        others: p.others,
        window: p.window,
        ...(p.next !== undefined ? { next: p.next } : {}),
        ...(p.retained ? { retained: true } : {}),
      });
      if (p.picked) return { result: { kind: "owner", user: p.picked.user, by: "queue", queue: q.id, rule: hit.id }, steps };
    }
  } else steps.push({ step: "rules", ok: false, off: true, skipped: [] });

  // 6. Fallback.
  const fb = body.fallback;
  if (!fb) {
    steps.push({ step: "fallback", ok: false, why: "none" });
    return { result: { kind: "unassigned" }, steps };
  }
  if (fb.kind === "user") {
    const no = blocked(f.reps[fb.id], f.now, { passed: passedBy(f, fb.id) });
    // The fallback takes leads over its caps: it's the last stop.
    const hard = no && (no.why === "not_member" || no.why === "paused" || no.why === "out" || no.why === "passed") ? no : null;
    steps.push({ step: "fallback", ok: !hard, ...(hard ? { why: hard.why } : { picked: fb.id }) });
    return hard ? { result: { kind: "unassigned" }, steps } : { result: { kind: "owner", user: fb.id, by: "fallback" }, steps };
  }
  const q = queueOf(body, f, fb.id);
  if (!q) {
    steps.push({ step: "fallback", ok: false, why: "none" });
    return { result: { kind: "unassigned" }, steps };
  }
  const p = pickInQueue(q, f);
  steps.push({ step: "fallback", ok: !!p.picked, queue: { id: q.id, name: q.name }, ...(p.picked ? { picked: p.picked.user } : { why: "none" as const }) });
  return p.picked ? { result: { kind: "owner", user: p.picked.user, by: "fallback", queue: q.id }, steps } : { result: { kind: "unassigned" }, steps };
}

// v2 ------------------------------------------------------------------------------------------------------------

type Dest = { kind: "queue" | "user"; id: string };

/**
 * The spec's path after the spam step (docs/routing-workflow.md Sections 9 to 12): input checks, existing owners in
 * the policy's order and scope, the first matching rule (later rules are not looked at), its destination, and when
 * that destination has nobody, the backup once, then review. A rule never falls through to a later rule.
 */
function decideV2(body: RouterBody, f: Facts, steps: StepResult[]): Decision {
  const previous = f.owner?.user ?? null;
  const scope = (u: string) => inScope(body, f, u);
  const why = (u: string) => eligibleWhy(f.reps[u], f, { scope: scope(u), retain: u === previous, passed: passedBy(f, u) });
  const held = (reason: "source_mapping_mismatch" | "multiple_companies"): Decision => ({ result: { kind: "held", signals: [], reason }, steps });

  // Input checks: a mapped form value of the wrong type, or several companies that could be this lead's.
  const issue = f.issues?.[0];
  if (issue) {
    steps.push({ step: "check", ok: false, reason: issue.code, field: issue.field });
    return held(issue.code);
  }
  if (f.companyMatch?.kind === "ambiguous") {
    steps.push({ step: "check", ok: false, reason: "multiple_companies", count: f.companyMatch.count });
    return held("multiple_companies");
  }

  // Existing owners, in the policy's order. One person found twice is looked at once.
  const order: OwnerKind[] = body.ownership?.order ?? ["company", "contact"];
  if (!order.length) steps.push({ step: "owners", ok: false, off: true, order, candidates: [] });
  else {
    const candidates: Extract<StepResult, { step: "owners" }>["candidates"] = [];
    const seen = new Set<string>();
    let owner: { user: string; kind: OwnerKind } | null = null;
    for (const kind of order) {
      if (kind === "company") {
        const c = f.company;
        if (!c) {
          candidates.push({ kind, user: null, miss: "no_company" });
          continue;
        }
        const opp = body.account.oppFirst ? c.oppOwner : null;
        const user = opp ?? c.owner;
        if (!user) {
          candidates.push({ kind, user: null, miss: c.ownerCrm ? "unmapped" : "no_owner" });
          continue;
        }
        if (seen.has(user)) {
          candidates.push({ kind, user, miss: "same_person" });
          continue;
        }
        seen.add(user);
        const no = why(user);
        candidates.push({ kind, user, via: opp ? "opp" : "company", ...(no ? { why: no.why, ...(no.until !== undefined ? { until: no.until } : {}) } : { picked: true }) });
        if (!no) {
          owner = { user, kind };
          break;
        }
      } else {
        const user = f.owner?.user ?? null;
        if (!user) {
          candidates.push({ kind, user: null, miss: f.owner?.crm ? "unmapped" : "no_owner" });
          continue;
        }
        if (seen.has(user)) {
          candidates.push({ kind, user, miss: "same_person" });
          continue;
        }
        seen.add(user);
        const no = why(user);
        candidates.push({ kind, user, ...(no ? { why: no.why, ...(no.until !== undefined ? { until: no.until } : {}) } : { picked: true }) });
        if (!no) {
          owner = { user, kind };
          break;
        }
      }
    }
    steps.push({ step: "owners", ok: !!owner, order, candidates, ...(owner ? { owner: owner.user } : {}) });
    if (owner) return { result: { kind: "owner", user: owner.user, by: owner.kind === "company" ? "account" : "keep" }, steps };
  }

  // Rules: the first that matches decides; the rest aren't looked at.
  const values = body.segments?.length ? { ...f.values, "company.type": segmentsOf(body.segments, f.values, body.territories, "v2") } : f.values;
  const skipped: Extract<StepResult, { step: "rules" }>["skipped"] = [];
  const notEvaluated: { id: string; name: string }[] = [];
  let hit: (typeof body.rules.list)[number] | undefined;
  if (body.rules.on) {
    for (const rule of body.rules.list) {
      if (rule.on === false) continue;
      if (hit) {
        notEvaluated.push({ id: rule.id, name: rule.name });
        continue;
      }
      const m = ruleMatches(rule, values, body.territories, "v2");
      if (m.ok) hit = rule;
      else skipped.push({ id: rule.id, name: rule.name, failed: m.failed });
    }
  }
  const later = notEvaluated.length ? { notEvaluated } : {};
  const then: Then = hit?.then ?? "queue";
  const ruleRef = hit ? { id: hit.id, name: hit.name, queue: hit.queue, ...(then !== "queue" ? { then } : {}), ...(then === "user" && hit.user ? { user: hit.user } : {}) } : undefined;
  if (!body.rules.on) steps.push({ step: "rules", ok: false, off: true, skipped: [] });

  if (hit && then === "hold") {
    steps.push({ step: "rules", ok: true, rule: ruleRef, skipped, ...later });
    return { result: { kind: "held", signals: ["rule"], reason: "rule" }, steps };
  }
  if (hit && then === "owner") {
    const c = f.company;
    const user = (body.account.oppFirst ? c?.oppOwner : null) ?? c?.owner ?? previous;
    const no = user ? why(user) : null;
    steps.push({ step: "rules", ok: !!user && !no, rule: ruleRef, skipped, ...later, ...(user ? { owner: user } : {}), ...(user && no ? { unavailable: { user, why: no.why, until: no.until ?? null } } : {}) });
    if (user && !no) return { result: { kind: "owner", user, by: "account", rule: hit.id }, steps };
    return backupOf(body, f, steps, { kind: "user", id: user ?? "" }, why, scope, hit.id);
  }
  if (hit && then === "user") {
    const user = hit.user ?? "";
    const no = user ? why(user) : { why: "not_member" as Why };
    steps.push({ step: "rules", ok: !no, rule: ruleRef, skipped, ...later, ...(no ? { unavailable: { user, why: no.why, until: no.until ?? null } } : {}) });
    if (!no) return { result: { kind: "owner", user, by: "rule", rule: hit.id }, steps };
    return backupOf(body, f, steps, { kind: "user", id: user }, why, scope, hit.id);
  }
  if (hit) {
    steps.push({ step: "rules", ok: true, rule: ruleRef, skipped, ...later });
    const r = pickFrom(body, f, steps, hit.queue, scope, previous, "queue");
    if (r) return { result: { ...r, rule: hit.id }, steps };
    return backupOf(body, f, steps, { kind: "queue", id: hit.queue }, why, scope, hit.id);
  }
  if (body.rules.on) steps.push({ step: "rules", ok: false, skipped });

  // Everyone else.
  const fb = body.fallback;
  if (!fb) {
    steps.push({ step: "fallback", ok: false, why: "none" });
    return { result: { kind: "unassigned", reason: "no_default" }, steps };
  }
  if (fb.kind === "user") {
    const no = why(fb.id);
    steps.push({ step: "fallback", ok: !no, ...(no ? { why: no.why } : { picked: fb.id }) });
    if (!no) return { result: { kind: "owner", user: fb.id, by: "fallback" }, steps };
    return backupOf(body, f, steps, { kind: "user", id: fb.id }, why, scope);
  }
  const r = pickFrom(body, f, steps, fb.id, scope, previous, "fallback");
  if (r) return { result: r, steps };
  return backupOf(body, f, steps, { kind: "queue", id: fb.id }, why, scope);
}

/** A pick from a queue for a rule (`queue` line) or Everyone else (`fallback` line); null when nobody can take it. */
function pickFrom(body: RouterBody, f: Facts, steps: StepResult[], id: string, scope: (u: string) => boolean, owner: string | null, as: "queue" | "fallback" | "backup"): Extract<Result, { kind: "owner" }> | null {
  const q = queueOf(body, f, id);
  if (!q) {
    if (as === "fallback") steps.push({ step: "fallback", ok: false, why: "none" });
    return null;
  }
  const p = pickInQueue(q, f, { v2: { scope, owner } });
  const t = f.teams?.[id];
  if (as !== "backup")
    steps.push({
      step: "queue",
      ok: !!p.picked,
      queue: { id: q.id, name: q.name, method: t?.method ?? q.method, strict: t?.strict ?? q.strict },
      ...(p.picked ? { picked: p.picked.user, pickedN: p.picked.n } : {}),
      others: p.others,
      window: p.window,
      ...(p.next !== undefined ? { next: p.next } : {}),
      ...(p.retained ? { retained: true } : {}),
    });
  if (!p.picked) return null;
  return { kind: "owner", user: p.picked.user, by: as, queue: q.id };
}

/**
 * The unavailable-recipient fallback (Section 7): a destination was chosen and has nobody. One hop to the policy's
 * backup person or team (never the destination that just failed), then review. Never a later rule.
 */
function backupOf(body: RouterBody, f: Facts, steps: StepResult[], from: Dest, why: (u: string) => { why: Why } | null, scope: (u: string) => boolean, rule?: string): Decision {
  const b: Backup = body.backup ?? { kind: "review" };
  const target: Dest | null = b.kind === "default" ? (body.fallback ? { kind: body.fallback.kind, id: body.fallback.id } : null) : b.kind === "review" ? null : { kind: b.kind, id: b.id };
  const review = (w: Extract<StepResult, { step: "backup" }>["why"], to?: Extract<StepResult, { step: "backup" }>["to"]): Decision => {
    steps.push({ step: "backup", ok: false, from, ...(to ? { to } : {}), why: w });
    return { result: { kind: "unassigned", reason: "no_eligible_recipient" }, steps };
  };
  if (!target) return review("review");
  const name = target.kind === "queue" ? (queueOf(body, f, target.id)?.name ?? "Team") : (f.reps[target.id]?.name ?? "Someone");
  const to = { ...target, name };
  if (target.kind === from.kind && target.id === from.id) return review("same_destination", to);
  if (target.kind === "user") {
    const no = why(target.id);
    if (no) return review(no.why, to);
    steps.push({ step: "backup", ok: true, from, to, picked: target.id });
    return { result: { kind: "owner", user: target.id, by: "backup", ...(rule ? { rule } : {}) }, steps };
  }
  const r = pickFrom(body, f, steps, target.id, scope, f.owner?.user ?? null, "backup");
  if (!r) return review("none", to);
  steps.push({ step: "backup", ok: true, from, to, picked: r.user });
  return { result: { ...r, by: "backup", ...(rule ? { rule } : {}) }, steps };
}

/** Why a given rep didn't get this lead, from the same facts: their status, a queue they're not in, or their turn. */
export function whyNot(body: RouterBody, f: Facts, d: Decision, user: string): { why: Why | "not_in_queue" | "not_their_turn" | "owner_kept" | "held" | "picked"; until?: number | null; queue?: string } {
  if (d.result.kind === "owner" && d.result.user === user) return { why: "picked" };
  if (d.result.kind === "held") return { why: "held" };
  const no = blocked(f.reps[user], f.now, { passed: passedBy(f, user) });
  if (no) return { why: no.why, until: no.until ?? null };
  if (d.result.kind === "owner" && (d.result.by === "account" || d.result.by === "keep")) return { why: "owner_kept" };
  const qStep = d.steps.find((s): s is Extract<StepResult, { step: "queue" }> => s.step === "queue");
  if (!qStep) return { why: "not_in_queue" };
  const q = body.queues.find((x) => x.id === qStep.queue.id);
  if (!q?.members.some((m) => m.user === user)) return { why: "not_in_queue", queue: qStep.queue.name };
  const other = qStep.others.find((o) => o.user === user);
  if (other?.why) return { why: other.why, until: other.until ?? null, queue: qStep.queue.name };
  return { why: "not_their_turn", queue: qStep.queue.name };
}
