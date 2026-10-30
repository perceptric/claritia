// Imports on claritia-intel (docs/conversion-weeks.md week 2): big files, undo, and clearing old files.

import type pg from "pg";
import type { Ctx } from "../../src/lib/contacts/import.ts";
import { executeImport, type ImportRow, type OpenAt } from "../../src/lib/contacts/importJob.ts";
import { removeFiles } from "../../src/lib/contacts/storage.ts";
import type { CustomField } from "../../src/lib/records/fields.ts";
import { enqueueJob, JobError, type Handler, type Rpc } from "../../src/lib/jobs.ts";

async function call<T>(rpc: Rpc, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

/** What cleaning needs from the workspace: its custom contact fields and its own and partner domains. */
export async function ctxFor(pool: pg.Pool, ws: string): Promise<Ctx> {
  const [fields, settings] = await Promise.all([
    pool.query(`select key, label, type, options from fields where workspace_id = $1 and object = 'contact'`, [ws]),
    pool.query(`select own_domains, partner_domains from identity_settings where workspace_id = $1`, [ws]),
  ]);
  return { custom: fields.rows as CustomField[], own_domains: settings.rows[0]?.own_domains ?? [], partner_domains: settings.rows[0]?.partner_domains ?? [] };
}

/** How long one slice of an import runs before the rest goes back in line. */
export const IMPORT_SLICE_MS = 45_000;

/**
 * import_file: read the stored file from where the last slice (or attempt) stopped, for about 45 seconds, then queue
 * the rest (a CSV opens at the byte after the last row done). The last slice routes the new contacts when asked.
 */
export const importFile =
  (pool: pg.Pool, rpc: Rpc, open?: (path: string) => Promise<ReadableStream<Uint8Array>>, o: { openAt?: OpenAt; sliceMs?: number } = {}): Handler =>
  async (job, signal) => {
    const id = String(job.payload.import_id ?? "");
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new JobError("import_file needs an import", { retry: false });
    const imp = await call<ImportRow | null>(rpc, "import_claim", { p_import: id });
    if (!imp) return;
    const r = await executeImport(rpc, imp, await ctxFor(pool, imp.workspace_id), { signal, open, openAt: o.openAt, budgetMs: o.sliceMs ?? IMPORT_SLICE_MS });
    if (r.more) {
      await enqueueJob(rpc, { workspaceId: imp.workspace_id, kind: "import_file", key: id, payload: { import_id: id }, delayS: 1, maxAttempts: job.max_attempts });
      return;
    }
    // "Route new contacts" on the import's last step: its new contacts go through the router (docs/router-ux.md W9).
    const done = (await pool.query(`select status, mapping from imports where id = $1`, [id])).rows[0] as { status: string; mapping: { route?: boolean } } | undefined;
    if (done?.status === "done" && done.mapping?.route === true) await call(rpc, "router_queue", { p_ws: imp.workspace_id, p_reason: "import", p_import: id });
  };

/** import_undo: take back what an import did. */
export const importUndo = (rpc: Rpc): Handler => async (job) => {
  const id = String(job.payload.import_id ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new JobError("import_undo needs an import", { retry: false });
  await call(rpc, "import_undo_run", { p_import: id });
};

/** Files past the 30-day undo window go from storage. */
export async function pruneImportFiles(rpc: Rpc): Promise<number> {
  const paths = await call<string[]>(rpc, "imports_files_to_prune", {});
  const list = (Array.isArray(paths) ? paths : []).map((p) => (typeof p === "string" ? p : (p as Record<string, string>).imports_files_to_prune)).filter(Boolean);
  if (!list.length) return 0;
  await removeFiles(list);
  await call(rpc, "imports_files_pruned", { p_paths: list });
  return list.length;
}
