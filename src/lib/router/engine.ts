// The router's engine (docs/router.md Part 3): facts in, a path and an owner out. Pure and in memory: the same facts
// always give the same answer, so a real route, the Test panel and Replay all run this one function. The server reads
// the facts (router_facts) and writes the result under a lock (router_commit).

import { ruleMatches } from "./conditions.ts";
import { spamSignals } from "./spam.ts";
import type { Decision, Facts, Queue, RepFacts, RouterBody, StepResult, WhenOut, Why } from "./types.ts";

/** Why a rep can't take a new lead now, or null when they can. `forOwner`: keeping a lead they own skips caps and hours. */
export function blocked(rep: RepFacts | undefined, now: number, o: { forOwner?: boolean; hoursOnly?: boolean } = {}): { why: Why; until?: number | null } | null {
  if (!rep || !rep.member) return { why: "not_member" };
  if (rep.pausedUntil !== null && rep.pausedUntil > now) return { why: "paused", until: Number.isFinite(rep.pausedUntil) ? rep.pausedUntil : null };
  if (rep.outUntil !== null && rep.outUntil > now) return { why: "out", until: rep.outUntil };
  if (o.forOwner) return null;
  if (rep.capDay !== null && rep.today >= rep.capDay) return { why: "cap_day" };
  if (rep.capWeek !== null && rep.week >= rep.capWeek) return { why: "cap_week" };
  if (o.hoursOnly && rep.inHours === false) return { why: "hours" };
  return null;
}

type Pick = { user: string; n: number } | null;

/**
 * Pick one member of a queue. Round robin: fewest leads from this queue in 30 days, then the one who waited longest,
 * then the queue's order. Weighted: the count divided by the weight. By load: fewest meetings this week. Strict keeps
 * that order even outside working hours.
 */
export function pickInQueue(q: Queue, f: Facts): { picked: Pick; others: { user: string; n: number; why?: Why; until?: number | null }[]; window: number } {
  const counts = f.counts[q.id] ?? {};
  const window = Object.values(counts).reduce((a, c) => a + c.n, 0);
  const scored = q.members.map((m, i) => {
    const rep = f.reps[m.user];
    const c = counts[m.user] ?? { n: 0, last: 0 };
    const score = q.method === "load" ? (rep?.meetingsWeek ?? 0) : q.method === "weighted" ? c.n / Math.max(1, Math.min(10, m.weight || 1)) : c.n;
    const no = blocked(rep, f.now, { hoursOnly: q.hoursOnly && !q.strict });
    return { user: m.user, n: q.method === "load" ? (rep?.meetingsWeek ?? 0) : c.n, score, last: c.last, i, no };
  });
  const order = [...scored].sort((a, b) => a.score - b.score || a.last - b.last || a.i - b.i);
  const first = order.find((x) => !x.no) ?? null;
  return {
    picked: first ? { user: first.user, n: first.n } : null,
    others: scored.filter((x) => x.user !== first?.user).map((x) => ({ user: x.user, n: x.n, ...(x.no ? { why: x.no.why, ...(x.no.until !== undefined ? { until: x.no.until } : {}) } : {}) })),
    window,
  };
}

/** An owner who's out or paused: keep them, give it to their backup, or route on. */
function whenOut(action: WhenOut, owner: string, f: Facts): { keep: string | null; backup?: string } {
  if (action === "keep") return { keep: owner };
  if (action === "backup") {
    const b = f.reps[owner]?.backup;
    if (b && b !== owner && !blocked(f.reps[b], f.now, { forOwner: true })) return { keep: b, backup: b };
  }
  return { keep: null };
}

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
        const no = blocked(f.reps[owner], f.now, { forOwner: true });
        if (!no) r.ok = true;
        else if (no.why === "not_member") r.unavailable = { user: owner, why: no.why };
        else {
          r.unavailable = { user: owner, why: no.why, until: no.until ?? null };
          r.action = body.keep.whenOut;
          const w = whenOut(body.keep.whenOut, owner, f);
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
      const no = blocked(f.reps[o.user], f.now, { forOwner: true });
      if (!no) r.ok = true;
      else if (no.why === "not_member") r.unavailable = { user: o.user, why: no.why };
      else {
        r.unavailable = { user: o.user, why: no.why, until: no.until ?? null };
        r.action = body.keep.whenOut;
        const w = whenOut(body.keep.whenOut, o.user, f);
        if (w.keep) {
          r.ok = true;
          if (w.backup) r.backup = w.backup;
        }
      }
    }
    steps.push(r);
    if (r.ok) return { result: { kind: "owner", user: r.backup ?? r.owner!, by: "keep" }, steps };
  } else steps.push({ step: "keep", ok: false, off: true });

  // 4. Rules, then 5. the queue they pick.
  if (body.rules.on) {
    const skipped: Extract<StepResult, { step: "rules" }>["skipped"] = [];
    let hit: { id: string; name: string; queue: string } | undefined;
    for (const rule of body.rules.list) {
      if (rule.on === false) continue;
      const m = ruleMatches(rule, f.values, body.territories);
      if (m.ok) {
        hit = { id: rule.id, name: rule.name, queue: rule.queue };
        break;
      }
      skipped.push({ id: rule.id, name: rule.name, failed: m.failed });
    }
    steps.push({ step: "rules", ok: !!hit, ...(hit ? { rule: hit } : {}), skipped });
    const q = hit ? body.queues.find((x) => x.id === hit!.queue) : undefined;
    if (hit && q) {
      const p = pickInQueue(q, f);
      steps.push({
        step: "queue",
        ok: !!p.picked,
        queue: { id: q.id, name: q.name, method: q.method, strict: q.strict },
        ...(p.picked ? { picked: p.picked.user, pickedN: p.picked.n } : {}),
        others: p.others,
        window: p.window,
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
    const no = blocked(f.reps[fb.id], f.now);
    // The fallback takes leads over its caps: it's the last stop.
    const hard = no && (no.why === "not_member" || no.why === "paused" || no.why === "out") ? no : null;
    steps.push({ step: "fallback", ok: !hard, ...(hard ? { why: hard.why } : { picked: fb.id }) });
    return hard ? { result: { kind: "unassigned" }, steps } : { result: { kind: "owner", user: fb.id, by: "fallback" }, steps };
  }
  const q = body.queues.find((x) => x.id === fb.id);
  if (!q) {
    steps.push({ step: "fallback", ok: false, why: "none" });
    return { result: { kind: "unassigned" }, steps };
  }
  const p = pickInQueue(q, f);
  steps.push({ step: "fallback", ok: !!p.picked, queue: { id: q.id, name: q.name }, ...(p.picked ? { picked: p.picked.user } : { why: "none" as const }) });
  return p.picked ? { result: { kind: "owner", user: p.picked.user, by: "fallback", queue: q.id }, steps } : { result: { kind: "unassigned" }, steps };
}

/** Why a given rep didn't get this lead, from the same facts: their status, a queue they're not in, or their turn. */
export function whyNot(body: RouterBody, f: Facts, d: Decision, user: string): { why: Why | "not_in_queue" | "not_their_turn" | "owner_kept" | "held" | "picked"; until?: number | null; queue?: string } {
  if (d.result.kind === "owner" && d.result.user === user) return { why: "picked" };
  if (d.result.kind === "held") return { why: "held" };
  const no = blocked(f.reps[user], f.now);
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
