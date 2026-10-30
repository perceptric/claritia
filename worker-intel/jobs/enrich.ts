// Enrichment's jobs (docs/enrich-workflows-reports.md Part 1):
//   enrich_contact   one contact through the waterfall and into its record (a new contact, a fill, a workflow step,
//                    an owner's backfill). Then qualify, when the team has it on and the lead has no outcome yet.
//   enrich_backfill  an owner's backfill: contacts missing a field, or in a segment, a page at a time, each its own
//                    enrich_contact job. Stops at the cap: the jobs that can't get a credit skip their paid steps.
//   qualify          one lead through the team's rules, then Claude through the step cache.

import { JobError, type Handler, type Rpc } from "../../src/lib/jobs.ts";
import { enrichContact, qualifyContact, type EnrichOpts } from "../../src/lib/enrich/server.ts";
import type { Ask } from "../../src/lib/enrich/qualify.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TRIGGERS = new Set(["new", "form", "backfill", "workflow", "again"]);
/** A backfill pages on while fewer lookups than this wait for the workspace. */
export const BACKFILL_WAITING = 1000;

async function call<T>(rpc: Rpc, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

export const enrichContactJob =
  (rpc: Rpc, o: EnrichOpts = {}): Handler =>
  async (job) => {
    const contact = String(job.payload.contact_id ?? job.key ?? "");
    const trigger = String(job.payload.trigger ?? "new");
    if (!job.workspace_id || !UUID.test(contact) || !TRIGGERS.has(trigger)) throw new JobError("enrich_contact needs a contact", { retry: false });
    const r = await enrichContact(rpc, contact, { ...o, trigger: trigger as "new", force: trigger === "again" || trigger === "backfill" || job.payload.force === true });
    if (r.skipped === "gone") return;
    // A filled company or title can change the outcome, so qualify runs after the lookup.
    await call(rpc, "enqueue_job", { p_workspace: job.workspace_id, p_kind: "qualify", p_key: contact, p_payload: { contact_id: contact }, p_delay_s: 0, p_max_attempts: 3 });
  };

export const qualifyJob =
  (rpc: Rpc, o: { ask?: Ask | null } = {}): Handler =>
  async (job) => {
    const contact = String(job.payload.contact_id ?? job.key ?? "");
    if (!job.workspace_id || !UUID.test(contact)) throw new JobError("qualify needs a contact", { retry: false });
    const r = await qualifyContact(rpc, contact, { ask: o.ask, timeoutMs: 15_000, force: job.payload.force === true });
    // No clear answer: try once more later, never guess.
    if (r.status === "none" && job.attempts < 2) throw new JobError("No clear answer from the model; trying once more later", { retryAfterS: 300 });
  };

export const enrichBackfill =
  (rpc: Rpc): Handler =>
  async (job) => {
    const ws = job.workspace_id;
    if (!ws) throw new JobError("enrich_backfill needs a workspace", { retry: false });
    const after = typeof job.payload.after === "string" && UUID.test(job.payload.after) ? job.payload.after : null;
    // A page at a time, and only while the lookups already queued are few: a big backfill never floods the queue.
    if ((await call<number>(rpc, "jobs_waiting", { p_ws: ws, p_kind: "enrich_contact", p_cap: BACKFILL_WAITING })) >= BACKFILL_WAITING) {
      await call(rpc, "enqueue_job", { p_workspace: ws, p_kind: "enrich_backfill", p_key: job.key, p_payload: job.payload, p_delay_s: 60, p_max_attempts: job.max_attempts });
      return;
    }
    const r = await call<{ count: number; last: string | null }>(rpc, "enrich_backfill_page", { p_ws: ws, p_filter: job.payload.filter ?? {}, p_after: after, p_limit: 200 });
    // A page at a time, so a big backfill never holds the queue.
    if (r.count === 200 && r.last) await call(rpc, "enqueue_job", { p_workspace: ws, p_kind: "enrich_backfill", p_key: `bf:${r.last}`, p_payload: { ...job.payload, after: r.last }, p_delay_s: 30, p_max_attempts: 3 });
  };
