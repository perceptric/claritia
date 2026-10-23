// The live free/busy check right before a booking (docs/meetings-scheduler.md 1.3): asks each host's calendars about
// one span. A host whose provider can't be asked in time is left out of the busy set, so an outage falls back to the
// cached busy times instead of blocking every booking. It never throws.

import type { Rpc } from "../jobs.ts";
import type { HttpOpts } from "./providers/http.ts";
import { markReconnect, openProvider, ReconnectError, type AccountRow } from "./providers/index.ts";

type LiveAccount = Pick<AccountRow, "id" | "user_id" | "provider" | "sealed"> & { calendars: string[] | null; busy: [string, string][] | null };

export type LiveOpts = HttpOpts & {
  /** The whole check's budget, 1.5 seconds by default. */
  timeoutMs?: number;
};

export function liveBusyFor(rpc: Rpc, ws: string, o: LiveOpts = {}): (hosts: string[], from: number, to: number) => Promise<Set<string>> {
  return async (hosts, from, to) => {
    const busy = new Set<string>();
    if (!hosts.length) return busy;
    const budget = o.timeoutMs ?? 1500;
    const stop = AbortSignal.timeout(budget);
    const signal = o.signal ? AbortSignal.any([o.signal, stop]) : stop;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<void>((r) => (timer = setTimeout(r, budget)));
    const work = (async () => {
      const { data, error } = await rpc("calendar_live_inputs", { p_ws: ws, p_users: hosts, p_from: new Date(from).toISOString(), p_to: new Date(to).toISOString() });
      if (error) return;
      const accounts = (data as LiveAccount[] | null) ?? [];
      await Promise.all(
        accounts.map(async (a) => {
          try {
            const fakeBusy = a.provider === "fake" ? (a.busy ?? []).map(([s, e]) => ({ start: Date.parse(s), end: Date.parse(e) })) : undefined;
            const row: AccountRow = { ...a, workspace_id: ws, account_email: "", status: "ok", channels: {}, watch_due: null, lists: [] };
            const spans = await openProvider(rpc, row, { ...o, signal, timeoutMs: budget, fakeBusy }).busy(a.calendars ?? [], from, to);
            if (spans.some((s) => s.start < to && s.end > from)) busy.add(a.user_id);
          } catch (e) {
            if (e instanceof ReconnectError) await markReconnect(rpc, a.id, e.message).catch(() => undefined);
            // Anything else (slow, down, refused): this account falls back to the cache.
          }
        }),
      );
    })().catch(() => undefined);
    // The database or a provider that doesn't answer in time: the cache already shaped the offer.
    await Promise.race([work, deadline]);
    clearTimeout(timer);
    return new Set(busy);
  };
}
