// score_refresh on claritia-intel (docs/scoring-plan.md Part 4): score leads with the workspace's live model and write
// what changed. Two jobs keep it current: a quick pass every 5 minutes for leads that are new or did something (so
// Routing sees a score when a form comes in), and a full pass every 6 hours so activity points fade.

import type pg from "pg";
import { enqueueJob, JobError, type Handler, type Rpc } from "../../src/lib/jobs.ts";
import { BASE_FIELDS } from "../../src/lib/router/conditions.ts";
import { cleanBody, fitFields } from "../../src/lib/scoring/model.ts";
import { scoreAll } from "../../src/lib/scoring/server.ts";

const QUICK_S = 300;
const FULL_S = 6 * 3600;
/** One round of the full pass; the rest goes back in line from the last contact done. */
export const FULL_ROUND_MS = 45_000;
const PAGE = 2000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const scoreRefresh =
  (pool: pg.Pool, rpc: Rpc, o: { roundMs?: number } = {}): Handler =>
  async (job, signal) => {
    const ws = job.workspace_id;
    if (!ws) throw new JobError("score_refresh needs a workspace", { retry: false });
    const quick = job.payload.quick === true;
    // The quick pass looks first: nothing changed since the last one is one query.
    let ids: string[] = [];
    let started = "";
    if (quick) {
      const since = typeof job.payload.since === "string" ? job.payload.since : new Date(Date.now() - 2 * QUICK_S * 1000).toISOString();
      started = new Date().toISOString();
      const { data, error } = await rpc("scoring_changed", { p_ws: ws, p_since: since });
      if (error) throw new Error(`scoring_changed: ${error.message}`);
      ids = (data as string[] | null) ?? [];
      if (!ids.length) {
        await enqueueJob(rpc, { workspaceId: ws, kind: "score_refresh", key: "score_refresh_quick", payload: { quick: true, since: started }, delayS: QUICK_S, maxAttempts: 3 });
        return;
      }
    }
    const m = (await pool.query("select m.id, v.body from scoring_models m join scoring_versions v on v.model_id = m.id and v.version = m.live_version where m.workspace_id = $1 order by m.position, m.created_at limit 1", [ws])).rows[0] as { id: string; body: unknown } | undefined;
    if (!m) return;
    const forms = (await pool.query("select id, name from forms where workspace_id = $1", [ws])).rows as { id: string; name: string }[];
    const fields = fitFields(BASE_FIELDS);
    const model = { id: m.id, body: cleanBody(m.body, fields) };
    const words = { fields, forms: Object.fromEntries(forms.map((f) => [f.id, f.name])) };
    if (quick) {
      await scoreAll(rpc, ws, model, words, { signal, ids });
      await enqueueJob(rpc, { workspaceId: ws, kind: "score_refresh", key: "score_refresh_quick", payload: { quick: true, since: started }, delayS: QUICK_S, maxAttempts: 3 });
      return;
    }
    // The full pass, a page of contacts at a time, for about 45 seconds a round.
    const until = Date.now() + (o.roundMs ?? FULL_ROUND_MS);
    let after = typeof job.payload.after === "string" && UUID.test(job.payload.after) ? job.payload.after : null;
    for (;;) {
      if (signal.aborted) throw new Error("Stopped");
      const page = (
        await pool.query(`select id from contacts where workspace_id = $1 and deleted_at is null and ($2::uuid is null or id > $2::uuid) order by id limit ${PAGE}`, [ws, after])
      ).rows.map((r) => r.id as string);
      if (page.length) await scoreAll(rpc, ws, model, words, { signal, ids: page });
      if (page.length < PAGE) break;
      after = page[page.length - 1]!;
      if (Date.now() >= until) {
        await enqueueJob(rpc, { workspaceId: ws, kind: "score_refresh", key: "score_refresh", payload: { after, lane: "bulk" }, delayS: 1, maxAttempts: 3 });
        return;
      }
    }
    await enqueueJob(rpc, { workspaceId: ws, kind: "score_refresh", key: "score_refresh", payload: {}, delayS: FULL_S, maxAttempts: 3 });
    await enqueueJob(rpc, { workspaceId: ws, kind: "score_refresh", key: "score_refresh_quick", payload: { quick: true, since: new Date().toISOString() }, delayS: QUICK_S, maxAttempts: 3 });
  };
