// What sync's two directions share: what a run is given, its counts, and the sync log.

import { type Ctx as CleanCtx } from "../contacts/import.ts";
import { call, type Rpc } from "../jobs.ts";
import { type SavedMapping } from "./map.ts";
import type { Connector, Ctx } from "./types.ts";

export type Deps = { rpc: Rpc; connector: Connector; ctx: Ctx; clean: CleanCtx; saved: SavedMapping[]; now?: () => number };

export type Counts = { pulled: number; written: number; skipped: number; errors: number };

export type LogRow = { direction: "in" | "out"; object: string; local_id?: string | null; external_id?: string | null; action: string; fields?: string[]; error?: string };

export const zero = (): Counts => ({ pulled: 0, written: 0, skipped: 0, errors: 0 });

export async function log(d: Deps, rows: LogRow[]) {
  for (let i = 0; i < rows.length; i += 1000) await call(d.rpc, "sync_log_add", { p_source: d.ctx.source.id, p_rows: rows.slice(i, i + 1000) });
}
