// Scoring one lead (docs/scoring-plan.md Part 4): every group adds its rules' points up to its max, points taken away
// come off, and the result becomes a fit grade and an activity level, or one score. Pure code with no clock or
// database of its own: the worker, "Results on past leads" and the Why panel run this same function on the same facts.

import { holds } from "../router/conditions.ts";
import type { Cond } from "../router/types.ts";
import { eventField, isEventField, type EventKind, type ScoreBody, type ScoreRule } from "./model.ts";

export type LeadEvent = { k: EventKind; d?: string; at: number };

/** What the engine knows about a lead: the router's field values, and what they did (newest first or not). */
export type LeadFacts = { id: string; values: Record<string, unknown>; events: LeadEvent[]; met?: boolean; created?: number };

export type Hit = { rule: ScoreRule; group: string; points: number; times?: number; last?: number; capped?: boolean };

export type Score = {
  fit: number;
  act: number;
  total: number;
  grade: string;
  band: "hot" | "warm" | "cold" | "out";
  removedBy?: ScoreRule;
  hits: Hit[];
};

const DAY = 86_400_000;

/** The events a condition matches, or for a field condition whether it holds. */
function condMatch(c: Cond, f: LeadFacts): LeadEvent[] | boolean {
  if (!isEventField(c.field)) return holds(c, f.values[c.field]);
  const kind = eventField(c.field)!.event;
  const want = Array.isArray(c.value) ? c.value.map((v) => String(v).toLowerCase()) : [];
  return f.events.filter((e) => {
    if (e.k !== kind) return false;
    if (c.op === "filled" || !want.length) return true;
    const d = (e.d ?? "").toLowerCase();
    return c.op === "contains" ? want.some((w) => d.includes(w)) : want.includes(d);
  });
}

/** A rule's points for a lead, or null when it doesn't match. */
export function rulePoints(r: ScoreRule, f: LeadFacts, b: ScoreBody, now: number): { points: number; times?: number; last?: number; remove?: boolean } | null {
  if (!r.on || !r.conds.length) return null;
  const parts = r.conds.map((c) => condMatch(c, f));
  const ok = (p: LeadEvent[] | boolean) => (typeof p === "boolean" ? p : p.length > 0);
  if (!(r.match === "any" ? parts.some(ok) : parts.every(ok))) return null;
  if (r.remove) return { points: 0, remove: true };
  const events = parts.flatMap((p) => (typeof p === "boolean" ? [] : p));
  if (!events.length) return { points: r.points };
  // The same action can match two conditions; count it once.
  const seen = new Set<string>();
  const uniq = events.filter((e) => { const k = `${e.k}|${e.d ?? ""}|${e.at}`; if (seen.has(k)) return false; seen.add(k); return true; }).sort((x, y) => y.at - x.at);
  const life = r.fade === "never" ? Infinity : r.fade === "model" ? b.halfLife : r.fade;
  const take = r.count === "each" ? uniq.slice(0, r.cap) : uniq.slice(0, 1);
  let points = 0;
  for (const e of take) points += life === Infinity ? r.points : r.points * Math.pow(0.5, Math.max(0, now - e.at) / DAY / life);
  return { points, times: take.length, last: uniq[0]!.at };
}

const pct = (got: number, max: number) => (max > 0 ? Math.max(0, Math.min(100, Math.round((got / max) * 100))) : 0);

export function scoreLead(b: ScoreBody, f: LeadFacts, now: number): Score {
  const hits: Hit[] = [];
  // Activity counts only while the lead is active: nothing in `reset` days starts them over.
  const latest = f.events.reduce((m, e) => Math.max(m, e.at), 0);
  const active = latest > 0 && now - latest <= b.reset * DAY;
  const facts = active ? f : { ...f, events: [] };
  const side = (s: "fit" | "act") => {
    let got = 0;
    let max = 0;
    for (const g of b.groups.filter((x) => x.side === s)) {
      let sum = 0;
      const mine: Hit[] = [];
      for (const r of g.rules) {
        const p = rulePoints(r, facts, b, now);
        if (p && !p.remove) { sum += p.points; mine.push({ rule: r, group: g.name, points: p.points, times: p.times, last: p.last }); }
      }
      if (sum > g.max) for (const h of mine) h.capped = true;
      hits.push(...mine);
      got += Math.min(g.max, sum);
      max += g.max;
    }
    return { got, max };
  };
  const fitP = side("fit");
  const actP = side("act");
  let removedBy: ScoreRule | undefined;
  let minusFit = 0;
  let minusAct = 0;
  for (const r of b.minus) {
    const p = rulePoints(r, facts, b, now);
    if (!p) continue;
    hits.push({ rule: r, group: "Points taken away", points: p.points, times: p.times, last: p.last });
    if (p.remove) removedBy ??= r;
    else if (r.conds.some((c) => isEventField(c.field))) minusAct += p.points;
    else minusFit += p.points;
  }
  const fit = pct(fitP.got + minusFit, fitP.max);
  const act = pct(actP.got + minusAct, actP.max);
  const total = removedBy ? 0 : Math.max(0, Math.min(100, Math.round(fitP.got + actP.got + minusFit + minusAct)));
  const letter = "ABCD"[[...b.fitCuts, -1].findIndex((c) => fit >= c)]!;
  const level = 1 + [...b.actCuts, -1].findIndex((c) => act >= c);
  const grade = removedBy ? "Out" : `${letter}${level}`;
  let band: Score["band"];
  if (removedBy) band = "out";
  else if (b.style === "grades") band = b.mql.includes(grade) ? "hot" : letter <= "B" || level <= 2 ? "warm" : "cold";
  else band = total >= b.ready ? "hot" : total >= b.warm ? "warm" : "cold";
  return { fit, act, total, grade, band, ...(removedBy ? { removedBy } : {}), hits };
}

/**
 * A past lead as it was just before it first met sales, so the meeting itself, and what came after, can't make the
 * model look better than it is. Leads that never met stay as they are.
 */
export function beforeMeeting(f: LeadFacts): LeadFacts {
  const first = f.events.reduce((m, e) => (e.k === "meeting" ? Math.min(m, e.at) : m), Infinity);
  return first === Infinity ? f : { ...f, events: f.events.filter((e) => e.at < first) };
}

/**
 * When to score a past lead for Results: just before it first met sales, or for one that never did, right after its
 * last action (its best moment). Scoring every past lead as of today would let old activity fade to nothing.
 */
export function peakOf(f: LeadFacts, now: number): number {
  const first = f.events.reduce((m, e) => (e.k === "meeting" ? Math.min(m, e.at) : m), Infinity);
  if (first !== Infinity) return first - 1;
  const last = f.events.reduce((m, e) => Math.max(m, e.at), 0);
  return Math.min(now, last || f.created || now);
}

export type Stats = {
  total: number;
  days: number;
  bands: Record<Score["band"], number>;
  met: Record<Score["band"], number>;
  cells: Record<string, { n: number; met: number }>;
  perWeek: number;
  /** Of the leads that went on to meet, the share that were sales-ready. */
  caught: number;
  base: number;
};

/** What a model does to past leads: how many land in each band, and how often each band went on to meet. */
export function statsOf(b: ScoreBody, leads: LeadFacts[], now: number, days: number): Stats {
  const s: Stats = { total: leads.length, days, bands: { hot: 0, warm: 0, cold: 0, out: 0 }, met: { hot: 0, warm: 0, cold: 0, out: 0 }, cells: {}, perWeek: 0, caught: 0, base: 0 };
  let met = 0;
  for (const f of leads) {
    const x = scoreLead(b, beforeMeeting(f), peakOf(f, now));
    s.bands[x.band]++;
    const c = (s.cells[x.grade] ??= { n: 0, met: 0 });
    c.n++;
    if (f.met) { met++; s.met[x.band]++; c.met++; }
  }
  s.perWeek = days > 0 ? Math.round((s.bands.hot / days) * 7) : 0;
  s.caught = met ? Math.round((s.met.hot / met) * 100) : 0;
  s.base = leads.length ? Math.round((met / leads.length) * 100) : 0;
  return s;
}
export const rate = (s: Stats, band: Score["band"]) => (s.bands[band] ? Math.round((s.met[band] / s.bands[band]) * 100) : 0);

/**
 * Set the cut-off so past leads would have given the team about `capacity` sales-ready leads a week. Points: the
 * score cut-off. Grades: the best grades first, in a fixed order.
 */
export function fitToCapacity(b: ScoreBody, leads: LeadFacts[], now: number, days: number): ScoreBody {
  if (!leads.length) return b;
  const per = (x: ScoreBody) => statsOf(x, leads, now, days).perWeek;
  if (b.style === "points") {
    let best = b.ready;
    let diff = Infinity;
    for (let c = 20; c <= 95; c += 5) {
      const d = Math.abs(per({ ...b, ready: c, warm: Math.min(b.warm, c - 1) }) - b.capacity);
      if (d < diff) { diff = d; best = c; }
    }
    return { ...b, ready: best, warm: Math.max(1, Math.min(b.warm, best - 10)) };
  }
  // Best grades first. A poor fit (D) never reaches sales on activity alone, and C needs a lot of activity.
  const order = ["A1", "A2", "B1", "B2", "A3", "C1", "B3", "C2", "A4"];
  let best = 1;
  let diff = Infinity;
  for (let n = 1; n <= order.length; n++) {
    const d = Math.abs(per({ ...b, mql: order.slice(0, n) }) - b.capacity);
    if (d < diff) { diff = d; best = n; }
  }
  return { ...b, mql: order.slice(0, best) };
}
