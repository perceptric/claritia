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

/** Merge fields in an email: {{first_name|there}}. Unknown keys and blanks take the fallback. */
export const MERGE_KEYS = ["first_name", "last_name", "company", "title"] as const;
export const MERGE = /\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/g;

export function fillMerge(text: string, vars: Record<string, string | null | undefined>): string {
  return text.replace(MERGE, (_, k: string, fallback?: string) => {
    const v = (MERGE_KEYS as readonly string[]).includes(k) ? vars[k] : undefined;
    return v && v.trim() ? v.trim() : (fallback ?? "").trim();
  });
}

/** Merge fields that have no fallback, which would leave a gap for a contact missing that value. */
export function mergeGaps(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(MERGE)) if (m[2] === undefined || !(MERGE_KEYS as readonly string[]).includes(m[1]!)) out.push(m[0]);
  return out;
}
