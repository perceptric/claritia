// The workflow engine's pure part (docs/enrich-workflows-reports.md 2.3): which path a Branch or Split takes, when a
// Wait is over, whether a goal is met, and the path one contact would take (Try a contact). The worker and the
// editor both call these, so what the editor shows is what runs.

import { createHash } from "node:crypto";
import { ruleMatches } from "../router/conditions.ts";
import { addDays, at, dateIn, dayOf, validZone } from "../meetings/time.ts";
import { enterPath, find, nextAfter, type PathName } from "./tree.ts";
import type { Body, Goal, Step } from "./types.ts";

export type Facts = {
  /** Values by the router's field names: contact.*, company.*, lead.*, answer.*. */
  values: Record<string, unknown>;
  lifecycle: string | null;
  outcome: string | null;
  /** A meeting booked since the run started. */
  booked: boolean;
  timezone: string | null;
};

/** Branch: whether the contact matches. */
export function branchYes(s: Extract<Step, { kind: "branch" }>, values: Record<string, unknown>): boolean {
  if (!s.conds.length) return false;
  return ruleMatches({ id: s.id, name: s.id, match: s.match, conds: s.conds, queue: "" }, values, []).ok;
}

/** Split: the same contact always lands on the same side, so a run that's picked up again goes the same way. */
export function splitSide(s: Extract<Step, { kind: "split" }>, runId: string): "a" | "b" {
  const h = createHash("sha256").update(`${runId}:${s.id}`).digest();
  return h.readUInt32BE(0) % 100 < Math.min(Math.max(s.percent, 0), 100) ? "a" : "b";
}

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * When a Wait that started at `from` is over: the time it adds, then (when set) the next allowed weekday at the
 * hour, in the contact's time zone (the workspace's when the contact has none). Daylight saving is handled by
 * building the hour on that date in that zone.
 */
export function waitUntil(s: Extract<Step, { kind: "wait" }>, from: number, tz: string | null): number {
  const zone = tz && validZone(tz) ? tz : "UTC";
  const base = from + (Math.max(0, s.days) * 24 + Math.max(0, s.hours)) * 3_600_000;
  if (!s.at && !s.weekday?.length) return base;
  const days = s.weekday?.length ? s.weekday : [0, 1, 2, 3, 4, 5, 6];
  const hour = s.at && /^\d{2}:\d{2}$/.test(s.at) ? s.at : "09:00";
  let date = dateIn(base, zone);
  for (let i = 0; i < 8; i++) {
    const t = at(date, hour, zone);
    if (t >= base && days.includes(WEEKDAYS.indexOf(dayOf(date)))) return t;
    date = addDays(date, 1);
  }
  return base;
}

/** How long before the meeting a "before the meeting" Wait ends. */
export const beforeMs = (s: Pick<Extract<Step, { kind: "wait" }>, "days" | "hours">) => (Math.max(0, s.days) * 24 + Math.max(0, s.hours)) * 3_600_000;

/** A reminder due less than this long ago still goes (a worker a few minutes behind); later than this, it's skipped. */
export const REMINDER_GRACE_MS = 30 * 60_000;

/**
 * The meeting a "before the meeting" Wait counts back from: the contact's soonest booked meeting still ahead, of the
 * trigger's meeting types when it names some. Null when there's none (canceled, or never booked).
 */
export function meetingFor<M extends { start_at: string; type_id: string | null }>(meetings: M[], trigger: Body["trigger"], now: number): M | null {
  const types = trigger.kind === "meeting" && trigger.types.length ? new Set(trigger.types) : null;
  return meetings.filter((m) => Date.parse(m.start_at) > now && (!types || (m.type_id !== null && types.has(m.type_id)))).sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at))[0] ?? null;
}

/**
 * Where a reminder too late to send goes: the next "before the meeting" Wait in the same flow (the next reminder),
 * skipping the steps between; null when there's none, and the run ends.
 */
export function nextReminder(steps: Step[], id: string): string | null {
  for (let at = nextAfter(steps, id), guard = 0; at && guard < 200; at = nextAfter(steps, at), guard++) {
    const s = find(steps, at)?.step;
    if (s?.kind === "wait" && s.before === "meeting") return s.id;
  }
  return null;
}

/** What a "before the meeting" Wait does now: park until `at`, go on, or skip a reminder that's too late. */
export function reminderMove(s: Extract<Step, { kind: "wait" }>, start: number, now: number): { kind: "park"; at: number } | { kind: "go" } | { kind: "late" } {
  const due = start - beforeMs(s);
  if (due > now) return { kind: "park", at: due };
  return now - due <= REMINDER_GRACE_MS ? { kind: "go" } : { kind: "late" };
}

export function goalMet(goals: Goal[], f: Pick<Facts, "booked" | "lifecycle" | "outcome">): Goal | null {
  for (const g of goals) {
    if (g.kind === "meeting_booked" && f.booked) return g;
    if (g.kind === "lifecycle" && f.lifecycle && g.stages.includes(f.lifecycle)) return g;
    if (g.kind === "outcome" && f.outcome && g.outcomes.includes(f.outcome)) return g;
  }
  return null;
}

/** Whether a contact may enter: the "only if" conditions. */
export function mayEnter(body: Body, values: Record<string, unknown>): boolean {
  if (!body.only?.conds.length) return true;
  return ruleMatches({ id: "only", name: "only", match: body.only.match, conds: body.only.conds, queue: "" }, values, []).ok;
}

export type PathLine = { step: Step; note?: string; path?: PathName };

/**
 * Try a contact: the steps one contact would go through, in order, with the side each Branch and Split takes. A
 * Wait until goes the "no" way (the event hasn't happened yet). Stops at an Exit, a goal, or the end.
 */
export function tracePath(body: Body, f: Facts, runId = "preview"): { lines: PathLine[]; entered: boolean; goal: Goal | null } {
  if (!mayEnter(body, f.values)) return { lines: [], entered: false, goal: null };
  const goal = goalMet(body.goals, f);
  if (goal) return { lines: [], entered: true, goal };
  const lines: PathLine[] = [];
  let id: string | null = body.steps[0]?.id ?? null;
  for (let guard = 0; id && guard < 200; guard++) {
    const w = find(body.steps, id);
    if (!w) break;
    const s = w.step;
    if (s.kind === "branch") {
      const p: PathName = branchYes(s, f.values) ? "yes" : "no";
      lines.push({ step: s, path: p });
      id = enterPath(body.steps, s, p);
    } else if (s.kind === "split") {
      const p = splitSide(s, runId);
      lines.push({ step: s, path: p });
      id = enterPath(body.steps, s, p);
    } else if (s.kind === "wait_until") {
      lines.push({ step: s, path: "no", note: "if it hasn't happened by then" });
      id = enterPath(body.steps, s, "no");
    } else {
      lines.push({ step: s });
      if (s.kind === "exit") break;
      id = nextAfter(body.steps, s.id);
    }
  }
  return { lines, entered: true, goal: null };
}

export { fillMerge, MERGE, MERGE_KEYS, mergeGaps } from "./merge.ts";
