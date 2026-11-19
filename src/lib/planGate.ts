// The plan checks the server runs before saving (supabase/migrations/120_plans.sql): a meeting type's kind, the number
// of types and hosts on Free, and calendars per host. Each answers null when the change fits the plan, or the line to
// show. A database without the plans migration yet lets the change through, as before.
//   The feature locks (docs/pricing.md Part 4, FEATURES in plans.ts) read the workspace's plan here: polls, one-off
// and single-use links, signatures and payments on forms, routing by answer, integrations and Salesforce. A read that
// hiccups (timeout, busy, network) is tried again with growing waits; a plan that still can't be read lets the work
// through (a missed lead or booking costs more than a feature used once on a lower plan), and the database's own
// checks (170_plan_locks.sql) still hold every new link, tool and destination to the plan.

import type { Rpc } from "./jobs.ts";
import { allows, FEATURES, linkFeature, lockLine, type Feature } from "./plans.ts";
import { isMissingFunction } from "./rpcCompat.ts";

export async function planCheck(rpc: Rpc, fn: "plan_check_type" | "plan_check_calendar", args: Record<string, unknown>): Promise<string | null> {
  const { data, error } = await rpc(fn, args);
  if (error) {
    if (isMissingFunction(error.message, fn)) return null;
    throw new Error(`${fn}: ${error.message}`);
  }
  return typeof data === "string" && data ? data : null;
}

/** A failure worth trying again: the database or the network was slow, busy or away for a moment. */
export const TRANSIENT = /time(d)? ?out|timeout|ECONN|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|fetch failed|network|socket|terminat|connection|too many|rate limit|busy|unavailable|\b(408|425|429|5\d\d)\b/i;

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type PlanRead = { tries?: number; wait?: (ms: number) => Promise<void> };

/**
 * The workspace's plan id ("free", "starter", "pro", "business"), or null when it can't be known: the database has no
 * plans yet (before 120), or the read kept failing. A hiccup is tried again after 150 ms, then 450 ms.
 */
export async function readPlan(rpc: Rpc, ws: string, o: PlanRead = {}): Promise<string | null> {
  const tries = Math.max(1, o.tries ?? 3);
  const wait = o.wait ?? pause;
  for (let i = 0; i < tries; i++) {
    let message: string;
    try {
      const { data, error } = await rpc("workspace_plan", { p_ws: ws });
      if (!error) return typeof data === "string" && data ? data : "free";
      if (isMissingFunction(error.message, "workspace_plan")) return null;
      message = error.message;
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    if (!TRANSIENT.test(message) || i === tries - 1) return null;
    await wait(150 * 3 ** i);
  }
  return null;
}

/**
 * The plan on a visitor's path (booking links, polls, routing a fill), kept a minute per workspace like the live
 * form's look. Callers that arrive together share one read; a plan that couldn't be read is never kept.
 */
export const PLAN_TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: Promise<string | null> }>();

export function planCached(rpc: Rpc, ws: string, o: PlanRead & { now?: number } = {}): Promise<string | null> {
  const now = o.now ?? Date.now();
  const hit = cache.get(ws);
  if (hit && now - hit.at < PLAN_TTL_MS) return hit.value;
  const value = readPlan(rpc, ws, o);
  if (cache.size > 5000) cache.clear();
  const entry = { at: now, value };
  cache.set(ws, entry);
  void value.then((p) => {
    if (p === null && cache.get(ws) === entry) cache.delete(ws);
  });
  return value;
}

/** Forget a workspace's kept plan (all of them with no argument): after a plan change on this server, and in tests. */
export function forgetPlan(ws?: string): void {
  if (ws === undefined) cache.clear();
  else cache.delete(ws);
}

/** Whether a plan (null: unknown) lets the feature run. Unknown lets it run. */
export const planLets = (plan: string | null, f: Feature): boolean => plan === null || allows(plan, f);

/** The line to show when the workspace's plan doesn't have the feature, or null when it does (or can't be read). */
export async function lockFor(rpc: Rpc, ws: string, f: Feature | null, o: PlanRead & { cached?: boolean } = {}): Promise<string | null> {
  if (!f) return null;
  const plan = o.cached ? await planCached(rpc, ws, o) : await readPlan(rpc, ws, o);
  return planLets(plan, f) ? null : lockLine(f);
}

/** A database refusal from a plan lock (170_plan_locks.sql raises the line itself), or null for any other error. */
export function planRefusal(message: string | null | undefined): string | null {
  if (!message) return null;
  for (const f of Object.keys(FEATURES) as Feature[]) if (message.includes(lockLine(f))) return lockLine(f);
  return null;
}

/**
 * Whether a link's workspace has moved to a plan without its kind (docs/pricing.md): the link then takes no new
 * booking or vote, as if closed. Its meeting and votes stay. A plan that can't be read keeps the link open.
 */
export async function linkLocked(rpc: Rpc, link: { workspace_id: string; kind: string }, o: PlanRead = {}): Promise<boolean> {
  return !!(await lockFor(rpc, link.workspace_id, linkFeature(link.kind), { ...o, cached: true }));
}
