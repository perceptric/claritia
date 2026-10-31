// A form's source connection at submit time (docs/routing-workflow.md Sections 8 and 17): its live revision and its
// policy's active version, resolved together by the database (routing_source_resolve, 095), so a run always records
// the pair it used. Kept for a few seconds per form, like the live router; a publish on this server forgets them.
// Server only.

import type { Rpc } from "../jobs.ts";
import { callNewer } from "../forms/newer.ts";
import type { LiveRouter } from "../router/server.ts";
import type { Mapping } from "./mapping.ts";
import type { Outcome } from "./states.ts";

export type SourceRow = {
  id: string;
  revision: number;
  enabled: boolean;
  follows_default: boolean;
  policy_id: string | null;
  outcome: Outcome;
  meeting_type_id: string | null;
  mappings: Mapping[];
  completion: Record<string, unknown>;
  no_slots: { message?: string; task?: boolean; email_later?: boolean };
};

export type Resolved = { source: SourceRow | null; live: LiveRouter | null };

export const SOURCE_TTL_MS = 10_000;
const cache = new Map<string, { at: number; value: Promise<Resolved | null> }>();

/**
 * The form's connection and the live policy it routes with; null when the database is older than 095 (the caller
 * reads the workspace's router as before). A failed read is never kept.
 */
export function resolveSource(rpc: Rpc, form: string, now = Date.now()): Promise<Resolved | null> {
  const hit = cache.get(form);
  if (hit && now - hit.at < SOURCE_TTL_MS) return hit.value;
  const value = (async () => {
    const r = await callNewer(rpc, "routing_source_resolve", { p_form: form });
    if (!r) return null;
    if (r.error) throw new Error(`routing_source_resolve: ${r.error.message}`);
    const d = r.data as { source: SourceRow | null; live: LiveRouter | null } | null;
    return { source: d?.source ?? null, live: d?.live ?? null };
  })();
  if (cache.size > 5000) cache.clear();
  cache.set(form, { at: now, value });
  value.catch(() => {
    if (cache.get(form)?.value === value) cache.delete(form);
  });
  return value;
}

/** Forget every cached connection: after a publish or a pause on this server. */
export function forgetSources(): void {
  cache.clear();
}
