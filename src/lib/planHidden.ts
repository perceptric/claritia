// Free's cap (docs/pricing.md): a fill past 250 in a month is saved with over_cap (supabase/migrations/120_plans.sql).
// Its answers stay hidden this month until the workspace upgrades (which clears the flag); from the 1st they show.

const monthStart = (now: Date) => Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);

export const hiddenFill = (f: { over_cap?: boolean | null; created_at: string }, now = new Date()): boolean =>
  !!f.over_cap && Date.parse(f.created_at) >= monthStart(now);

/** A hidden fill as the screens show it: no answers, no person, and `locked` set. */
export function maskFill<T extends { over_cap?: boolean | null; created_at: string }>(f: T, now = new Date()): T {
  if (!hiddenFill(f, now)) return f;
  return { ...f, values: {}, hidden: {}, contacts: null, locked: true } as T;
}
