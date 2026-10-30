// Form deliveries on claritia-intel (docs/form-builder.md Part 7). One job per delivery: take it with a lease, send
// it, record how it ended. A try that can retry goes back to the jobs queue (1, 5, 30 minutes, then 2 and 6 hours);
// after the last one the delivery is marked failed and shows on the form's Deliveries tab with Replay.
// deliver_held: a destination turned back on sends what it held, oldest first.

import type pg from "pg";
import { enqueueJob, enqueueJobs, JobError, type Handler, type Rpc } from "../../src/lib/jobs.ts";
import { sendDelivery, type SendDeps, type Taken } from "../../src/lib/delivery/send.ts";
import { call } from "../../src/lib/sources/sync.ts";
import type { RunOpts } from "../../src/lib/sources/run.ts";
import { ctxFor } from "./imports.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** One try of one delivery. Returns "retry" (with the error) when the jobs queue should try again. */
export async function deliverOnce(rpc: Rpc, send: SendDeps, id: string, last: boolean): Promise<{ retry?: { error: string; retryAfterS?: number } }> {
  const t = await call<Taken | null>(rpc, "delivery_take", { p_id: id, p_lease_s: 120 });
  if (!t) return {};
  const r = await sendDelivery(t, send);
  if (r.status === "done") await call(rpc, "delivery_finish", { p_id: id, p_status: "done", p_external_id: r.externalId ?? null, p_external_url: r.externalUrl ?? null, p_error: null });
  else if (r.status === "skipped") await call(rpc, "delivery_finish", { p_id: id, p_status: "skipped", p_external_id: null, p_external_url: null, p_error: r.reason });
  else if (r.status === "failed" || last) await call(rpc, "delivery_finish", { p_id: id, p_status: "failed", p_external_id: null, p_external_url: null, p_error: r.error });
  else {
    await call(rpc, "delivery_finish", { p_id: id, p_status: "retrying", p_external_id: null, p_external_url: null, p_error: r.error });
    return { retry: { error: r.error, retryAfterS: r.retryAfterS } };
  }
  return {};
}

type Extra = Partial<RunOpts & Pick<SendDeps, "resolve">>;

const sendDeps = (pool: pg.Pool, rpc: Rpc, signal: AbortSignal, extra: Extra): SendDeps => ({
  run: { rpc, clean: (ws) => ctxFor(pool, ws), signal, budgetMs: 60_000, ...extra },
  fetcher: extra.fetcher,
  resolve: extra.resolve,
});

export const deliver =
  (pool: pg.Pool, rpc: Rpc, extra: Extra = {}): Handler =>
  async (job, signal) => {
    const id = String(job.payload.delivery_id ?? "");
    if (!UUID.test(id)) throw new JobError("deliver needs a delivery", { retry: false });
    const r = await deliverOnce(rpc, sendDeps(pool, rpc, signal, extra), id, job.attempts >= job.max_attempts);
    if (r.retry) throw new JobError(r.retry.error, { retryAfterS: r.retry.retryAfterS });
  };

/** How long one round of held deliveries runs before the rest goes back in line. */
export const HELD_ROUND_MS = 45_000;

export const deliverHeld =
  (pool: pg.Pool, rpc: Rpc, extra: Extra & { roundMs?: number } = {}): Handler =>
  async (job, signal) => {
    const dest = String(job.payload.destination_id ?? "");
    if (!UUID.test(dest)) throw new JobError("deliver_held needs a destination", { retry: false });
    const send = sendDeps(pool, rpc, signal, extra);
    const until = Date.now() + (extra.roundMs ?? HELD_ROUND_MS);
    for (;;) {
      const list = (await call<string[] | null>(rpc, "deliveries_held", { p_destination: dest, p_limit: 100 })) ?? [];
      if (!list.length) return;
      for (const [i, id] of list.entries()) {
        if (Date.now() >= until) {
          // Out of time: the rest of the destination's held deliveries in the next round, a moment later.
          await enqueueJob(rpc, { workspaceId: job.workspace_id, kind: "deliver_held", key: job.key, payload: { destination_id: dest }, delayS: 2, maxAttempts: job.max_attempts });
          return;
        }
        const r = await deliverOnce(rpc, send, id, false);
        if (r.retry) {
          // The tool is struggling: this one and the rest of the batch go to their own jobs with backoff, in order,
          // in one call and in the bulk lane (a backlog never crowds out new form deliveries).
          await enqueueJobs(rpc, list.slice(i).map((rest, j) => ({ workspaceId: job.workspace_id, kind: "deliver", key: rest, payload: { delivery_id: rest, lane: "bulk" }, delayS: 60 + j, maxAttempts: 6 })));
          return;
        }
        if (signal.aborted) throw new Error("Stopped");
      }
    }
  };
