// The plan checks the server runs before saving (supabase/migrations/120_plans.sql): a meeting type's kind, the number
// of types and hosts on Free, and calendars per host. Each answers null when the change fits the plan, or the line to
// show. A database without the plans migration yet lets the change through, as before.

import type { Rpc } from "./jobs.ts";
import { isMissingFunction } from "./rpcCompat.ts";

export async function planCheck(rpc: Rpc, fn: "plan_check_type" | "plan_check_calendar", args: Record<string, unknown>): Promise<string | null> {
  const { data, error } = await rpc(fn, args);
  if (error) {
    if (isMissingFunction(error.message, fn)) return null;
    throw new Error(`${fn}: ${error.message}`);
  }
  return typeof data === "string" && data ? data : null;
}
