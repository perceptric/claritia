// Staged webhooks on claritia-intel: fills from outside form tools and bookings from outside schedulers
// (src/lib/sources/hooks.ts), applied a round at a time. They're integrations, on Starter and up (docs/pricing.md): on a
// lower plan the hooks stay staged, unapplied and never dropped, and an upgrade's next hook applies them all.

import type pg from "pg";
import { JobError, type Handler, type Job, type Rpc } from "../../src/lib/jobs.ts";
import { runHooks, type RunOpts } from "../../src/lib/sources/run.ts";
import { AuthError, RateLimited } from "../../src/lib/sources/types.ts";
import { ctxFor } from "./ctx.ts";
import { lockFor } from "../../src/lib/planGate.ts";
import { toolFeature } from "../../src/lib/plans.ts";

const idOf = (job: Job) => {
  const id = String(job.payload.source_id ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new JobError(`${job.kind} needs a source`, { retry: false });
  return id;
};

/** One round's time. */
export const SOURCE_ROUND_MS = 45_000;

export const sourceHook =
  (pool: pg.Pool, rpc: Rpc, extra: Partial<RunOpts> = {}): Handler =>
  async (job, signal) => {
    const id = idOf(job);
    const src = (await pool.query<{ workspace_id: string; kind: string }>("select workspace_id, kind from sources where id = $1", [id])).rows[0];
    if (src && (await lockFor(rpc, src.workspace_id, toolFeature(src.kind)))) return;
    try {
      await runHooks({ rpc, clean: (ws) => ctxFor(pool, ws), signal, budgetMs: SOURCE_ROUND_MS, ...extra }, id);
    } catch (e) {
      if (e instanceof AuthError) throw new JobError(e.message, { retry: false });
      if (e instanceof RateLimited) throw new JobError(e.message, { retryAfterS: e.retryAfterS });
      throw e;
    }
  };
