// The one-call functions in 090_forms_booking_speed.sql, with the old calls while the database doesn't have them yet
// (the code can ship before the migration is run). A function found missing is tried again after 5 minutes.

import type { Rpc } from "../jobs.ts";

type Answer = Awaited<ReturnType<Rpc>>;

const RETRY_MS = 5 * 60_000;
const missing = new Map<string, number>();

/** Whether an error says the function isn't in the database (PostgREST's schema cache, or Postgres itself). */
export function isMissingFn(error: { message: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "PGRST202" || error.code === "42883" || /Could not find the function|function [\w.]+\(.*\) does not exist/i.test(error.message);
}

/** The new function's answer, or null when the database doesn't have it (then the caller takes the old way). */
export async function callNewer(rpc: Rpc, fn: string, args: Record<string, unknown>, now = Date.now()): Promise<Answer | null> {
  const until = missing.get(fn);
  if (until !== undefined && until > now) return null;
  const r = await rpc(fn, args);
  if (isMissingFn(r.error as { message: string; code?: string } | null)) {
    missing.set(fn, now + RETRY_MS);
    return null;
  }
  missing.delete(fn);
  return r;
}

/** Tests: forget what was found missing. */
export function resetNewer(): void {
  missing.clear();
}
