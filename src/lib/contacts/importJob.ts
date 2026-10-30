// Running a stored import from start (or from where it stopped) to finish. The web app calls this for small files;
// the import_file job on claritia-intel for big ones, a slice at a time (`budgetMs`): a slice ends after a page once
// its time is up, saves where the CSV stopped (progress.resume: the byte after the last row done) and its error rows
// (errors-<row>.csv), and the job queues the next slice, which opens the file at that byte. Both pass the database
// through `rpc`.

import type { Rpc } from "../jobs.ts";
import { writeContacts, type Source } from "./contacts.ts";
import { chunksOf, csvCursor, csvRowsAt, fileRows, kindOf, XLSX_TOO_BIG, type CsvResume } from "./files.ts";
import type { Ctx, Mapping } from "./import.ts";
import { emptyTotals, errorsCsv, runImport, type Totals } from "./importRun.ts";
import { openFile, openFileFrom, putFile, removeFiles } from "./storage.ts";

export type ImportRow = {
  id: string;
  workspace_id: string;
  file_name: string;
  file_path: string;
  kind: string;
  sheet: string | null;
  mapping: Mapping;
  rows_done: number;
  progress: { totals?: Totals; resume?: (CsvResume & { rows: number }) | null; error_parts?: string[]; errors_kept?: number };
};

export type OpenAt = (path: string, offset: number, signal?: AbortSignal) => Promise<{ stream: ReadableStream<Uint8Array>; offset: number }>;
export type ExecuteOpts = {
  signal?: AbortSignal;
  open?: (path: string) => Promise<ReadableStream<Uint8Array>>;
  /** Opens the file at a byte (a resumed CSV). Without it, `open` (or storage) reads from the start. */
  openAt?: OpenAt;
  /** A slice's time: after a page past it, the run stops and returns `more`. */
  budgetMs?: number;
  /** Tests: where error files go, and how a slice's part is read back (storage otherwise). */
  put?: (path: string, csv: string) => Promise<void>;
  readPart?: (path: string) => Promise<string>;
};

const MAX_ERRORS = 50_000;

const call = async (rpc: Rpc, fn: string, args: Record<string, unknown>) => {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

/** Which source a file import writes as, so the field order can rank it. */
export function sourceOfFile(imp: Pick<ImportRow, "kind" | "file_name">): Source {
  if (imp.kind === "paste") return "paste";
  const k = kindOf(imp.file_name);
  return k === "xlsx" ? "excel" : k === "vcf" ? "vcard" : "csv";
}

export async function executeImport(rpc: Rpc, imp: ImportRow, ctx: Ctx, opts: ExecuteOpts = {}): Promise<Totals & { more?: boolean }> {
  const kind = kindOf(imp.file_name);
  if (!kind) throw new Error("This kind of file can't be imported");
  const source = sourceOfFile(imp);
  const done = imp.rows_done ?? 0;
  // A CSV that stopped cleanly opens at the byte after its last row; anything else reads from the start and skips.
  const saved = kind === "csv" && imp.progress?.resume && imp.progress.resume.rows === done && done > 0 ? imp.progress.resume : null;
  let stream: ReadableStream<Uint8Array>;
  let from: CsvResume | undefined;
  if (saved) {
    const opened = await (opts.openAt ?? (opts.open ? null : openFileFrom))?.(imp.file_path, saved.offset, opts.signal);
    if (opened && opened.offset === saved.offset) {
      stream = opened.stream;
      from = saved;
    } else {
      if (opened) await opened.stream.cancel().catch(() => {});
      stream = await (opts.open ?? ((p: string) => openFile(p, opts.signal)))(imp.file_path);
    }
  } else if (opts.openAt && !opts.open) stream = (await opts.openAt(imp.file_path, 0, opts.signal)).stream;
  else stream = await (opts.open ?? ((p: string) => openFile(p, opts.signal)))(imp.file_path);
  const cur = csvCursor();
  const parts = [...(imp.progress?.error_parts ?? [])];
  let kept = imp.progress?.errors_kept ?? 0;
  const until = opts.budgetMs ? Date.now() + opts.budgetMs : null;
  const put = opts.put ?? ((path: string, csv: string) => putFile(path, csv, "text/csv", opts.signal));
  const progressOf = (rows: number, t: Totals) => {
    const r = kind === "csv" ? cur.resume() : null;
    return { stage: "running", rows, totals: t, resume: r ? { ...r, rows } : null, error_parts: parts, errors_kept: kept };
  };
  try {
    const run = await runImport({
      rows: kind === "csv" ? csvRowsAt(chunksOf(stream), cur, from) : fileRows(kind, chunksOf(stream), imp.sheet),
      mapping: imp.mapping,
      ctx,
      skip: done,
      start: from ? done : 0,
      over: until ? () => Date.now() >= until : undefined,
      initial: imp.progress?.totals ?? emptyTotals(),
      signal: opts.signal,
      suppress: async (rows) => {
        for (let i = 0; i < rows.length; i += 10_000) await call(rpc, "suppress", { p_ws: imp.workspace_id, p_source: source, p_rows: rows.slice(i, i + 10_000), p_import: imp.id });
      },
      write: async (contacts) => {
        await writeContacts(rpc, imp.workspace_id, source, contacts, { importId: imp.id });
      },
      progress: async (rows, t) => {
        await call(rpc, "import_progress", { p_import: imp.id, p_rows_done: rows, p_progress: progressOf(rows, t) });
      },
    });
    const errors = run.errors.slice(0, Math.max(0, MAX_ERRORS - kept));
    if (run.more) {
      // This slice's error rows go to their own file, named by the row the slice started at, before the next slice.
      if (errors.length) {
        const part = `${imp.workspace_id}/${imp.id}/errors-${done}.csv`;
        await put(part, errorsCsv(errors));
        if (!parts.includes(part)) parts.push(part);
        kept += errors.length;
        await call(rpc, "import_progress", { p_import: imp.id, p_rows_done: run.done, p_progress: progressOf(run.done, run.totals) });
      }
      return { ...run.totals, more: true };
    }
    let errorsPath: string | null = null;
    if (errors.length || parts.length) {
      errorsPath = `${imp.workspace_id}/${imp.id}/errors.csv`;
      try {
        const earlier: string[] = [];
        for (const p of parts) earlier.push((await (opts.readPart ?? ((x: string) => readText(x, opts.signal)))(p)).replace(/^[^\n]*\n/, ""));
        const csv = errorsCsv(errors);
        await put(errorsPath, parts.length ? csv.replace(/^([^\n]*\n)/, (head) => head + earlier.join("")) : csv);
        if (parts.length && !opts.put) await removeFiles(parts, opts.signal).catch(() => undefined);
      } catch {
        errorsPath = null;
      }
    }
    await call(rpc, "imports_finish", { p_import: imp.id, p_status: "done", p_counts: run.totals, p_error: null, p_errors_path: errorsPath });
    return run.totals;
  } catch (e) {
    // A file that can't be read or a mapping that doesn't fit won't get better by trying again.
    const message = e instanceof Error ? e.message : String(e);
    if (/can't be imported|Map |Choose |empty|rows at a time|no longer exists|one column|Bought/.test(message) || message === XLSX_TOO_BIG) {
      await call(rpc, "imports_finish", { p_import: imp.id, p_status: "failed", p_counts: imp.progress?.totals ?? {}, p_error: message });
    }
    throw e;
  } finally {
    await stream.cancel().catch(() => {});
  }
}

async function readText(path: string, signal?: AbortSignal): Promise<string> {
  return await new Response(await openFile(path, signal)).text();
}
