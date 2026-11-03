// A database function added by a newer migration (088_server_speed.sql), with the old way as the fallback: until the
// migration is run, the call answers "function not found" and the old calls run instead. That answer is remembered
// for five minutes, so a server deployed before the migration doesn't ask twice per request. Only use it for a new
// function that is a single transaction (all or nothing), so falling back can never do the work twice.

import type { Rpc } from "./jobs.ts";

type Out<T> = { data: T | null; error: { message: string } | null };

const missing = new Map<string, number>();

export const isMissingFunction = (message: string, fn: string) =>
  message.includes(fn) && /Could not find the function|does not exist|PGRST202/i.test(message);

/**
 * Call `fn`; when it isn't in the database yet, run `fallback` (the old calls). `anyError` also falls back on any
 * other failure: only for work that is safe to do twice (a dedupe key, an upsert), since a lost answer may hide a
 * call that did go through.
 */
export async function rpcOr<T>(rpc: Rpc, fn: string, args: Record<string, unknown>, fallback: () => PromiseLike<Out<T>>, o: { anyError?: boolean } = {}): Promise<Out<T>> {
  const until = missing.get(fn);
  if (until && until > Date.now()) return fallback();
  const { data, error } = await rpc(fn, args);
  if (!error) return { data: data as T, error: null };
  if (isMissingFunction(error.message, fn)) {
    missing.set(fn, Date.now() + 5 * 60_000);
    return fallback();
  }
  return o.anyError ? fallback() : { data: null, error };
}

/** Tests: forget which functions were missing. */
export const resetMissing = () => missing.clear();
