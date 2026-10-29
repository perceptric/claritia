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

export const scoreRefresh =
  (pool: pg.Pool, rpc: Rpc): Handler =>
  async (job, signal) => {
    const ws = job.workspace_id;
    if (!ws) throw new JobError("score_refresh needs a workspace", { retry: false });
    const m = (await pool.query("select m.id, v.body from scoring_models m join scoring_versions v on v.model_id = m.id and v.version = m.live_version where m.workspace_id = $1 order by m.position, m.created_at limit 1", [ws])).rows[0] as { id: string; body: unknown } | undefined;
    if (!m) return;
    const forms = (await pool.query("select id, name from forms where workspace_id = $1", [ws])).rows as { id: string; name: string }[];
    const fields = fitFields(BASE_FIELDS);
    const model = { id: m.id, body: cleanBody(m.body, fields) };
    const words = { fields, forms: Object.fromEntries(forms.map((f) => [f.id, f.name])) };
    const quick = job.payload.quick === true;
    if (quick) {
      const since = typeof job.payload.since === "string" ? job.payload.since : new Date(Date.now() - 2 * QUICK_S * 1000).toISOString();
      const started = new Date().toISOString();
      const { data, error } = await rpc("scoring_changed", { p_ws: ws, p_since: since });
      if (error) throw new Error(`scoring_changed: ${error.message}`);
      const ids = (data as string[] | null) ?? [];
      if (ids.length) await scoreAll(rpc, ws, model, words, { signal, ids });
      await enqueueJob(rpc, { workspaceId: ws, kind: "score_refresh", key: "score_refresh_quick", payload: { quick: true, since: started }, delayS: QUICK_S, maxAttempts: 3 });
      return;
    }
    await scoreAll(rpc, ws, model, words, { signal });
    await enqueueJob(rpc, { workspaceId: ws, kind: "score_refresh", key: "score_refresh", payload: {}, delayS: FULL_S, maxAttempts: 3 });
    await enqueueJob(rpc, { workspaceId: ws, kind: "score_refresh", key: "score_refresh_quick", payload: { quick: true, since: new Date().toISOString() }, delayS: QUICK_S, maxAttempts: 3 });
  };
