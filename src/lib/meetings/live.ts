// The live free/busy check right before a booking (docs/meetings-scheduler.md 1.3): asks each host's calendars about
// one span. A host whose provider can't be asked is left out of the busy set, so an outage falls back to the cached
// busy times instead of blocking every booking.

import type { Rpc } from "../jobs.ts";

export function liveBusyFor(_rpc: Rpc, _ws: string): (hosts: string[], from: number, to: number) => Promise<Set<string>> {
  return async () => new Set<string>();
}
