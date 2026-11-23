// Sending Claritia's changes out to a tool (docs/contact-sources.md): which contacts changed since the last push,
// what each one looks like on the other side, and recording what was sent.

import { call } from "../jobs.ts";
import { agreed, changedKeys, compared, effectiveMapping, pushable, toRemote } from "./map.ts";
import type { PushChange } from "./types.ts";
import { type Deps, type Counts, type LogRow, zero, log } from "./syncDeps.ts";

// Out ---------------------------------------------------------------------------------------------------------

type Candidate = {
  id: string;
  updated_at: string;
  email: string;
  email_clean: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  phone: string | null;
  country: string | null;
  region: string | null;
  timezone: string | null;
  lifecycle: string | null;
  lead_status: string | null;
  fields: Record<string, unknown>;
  company_name: string | null;
  company_domain: string | null;
  external_id: string | null;
  last: Record<string, unknown> | null;
  suppressed: boolean;
};

const plain = (c: Candidate) => ({ ...c, first_name: c.first_name ?? undefined, last_name: c.last_name ?? undefined, title: c.title ?? undefined, phone: c.phone ?? undefined, country: c.country ?? undefined, region: c.region ?? undefined, timezone: c.timezone ?? undefined, lifecycle: c.lifecycle ?? undefined, lead_status: c.lead_status ?? undefined, company_name: c.company_name ?? undefined, company_domain: c.company_domain ?? undefined });

/** Push contacts that changed here. `ids` pushes just those (a retry from the sync log). */
export async function push(d: Deps, opts: { ids?: string[]; budgetMs?: number; batch?: number } = {}): Promise<Counts & { more: boolean }> {
  const c = { ...zero(), more: false };
  const src = d.ctx.source;
  if (!d.connector.push || (src.settings.objects?.contacts ?? "in") !== "both") return c;
  const now = d.now ?? Date.now;
  const start = now();
  const all = effectiveMapping(d.connector, "contact", d.saved, [], d.clean.custom);
  const cols = d.connector.writable ? all.filter((m) => d.connector.writable!.includes(m.col)) : all;
  const keys = new Set(compared(cols).filter(pushable));
  const pushPart = (v: Record<string, unknown> | null | undefined) => Object.fromEntries(Object.entries(v ?? {}).filter(([k]) => keys.has(k)));
  const pushNew = src.settings.push_new ?? "lifecycle";
  let cursor = opts.ids ? null : src.push_cursor;
  for (;;) {
    if (d.ctx.signal?.aborted) throw new Error("Stopped");
    const cands = await call<Candidate[]>(d.rpc, "push_candidates", { p_source: src.id, p_after: cursor, p_limit: opts.batch ?? 200, p_ids: opts.ids ?? null });
    if (!cands.length) break;
    const changes: (PushChange & { values: Record<string, unknown>; ours: Record<string, unknown>; last: Record<string, unknown> | null })[] = [];
    for (const k of cands) {
      const x = plain(k);
      const ours = agreed(cols, x);
      if (!k.external_id) {
        const allowed = pushNew === "all" || (pushNew === "lifecycle" && !!k.lifecycle && k.lifecycle !== "subscriber");
        if (!allowed) continue;
      } else if (changedKeys(pushPart(k.last), pushPart(ours)).length === 0) {
        c.skipped++;
        continue;
      }
      changes.push({ localId: k.id, externalId: k.external_id, values: toRemote(cols, x), ours, last: k.last });
    }
    if (changes.length) {
      const results = await d.connector.push(d.ctx, changes);
      const byId = new Map(results.map((r) => [r.localId, r]));
      const put: { external_id: string; local_id: string; values: Record<string, unknown> }[] = [];
      const rows: LogRow[] = [];
      const gone: string[] = [];
      for (const ch of changes) {
        const r = byId.get(ch.localId);
        if (r?.gone && ch.externalId) {
          gone.push(ch.externalId);
          rows.push({ direction: "in", object: "contact", local_id: ch.localId, external_id: ch.externalId, action: "delete" });
          continue;
        }
        if (!r || r.error || !r.externalId) {
          c.errors++;
          rows.push({ direction: "out", object: "contact", local_id: ch.localId, external_id: ch.externalId, action: "error", error: r?.error ?? "The tool didn't answer for this contact." });
          continue;
        }
        // What the tool now holds: what it had, with what we sent.
        put.push({ external_id: r.externalId, local_id: ch.localId, values: { ...(ch.last ?? {}), ...pushPart(ch.ours) } });
        rows.push({ direction: "out", object: "contact", local_id: ch.localId, external_id: r.externalId, action: ch.externalId ? "update" : "create", fields: changedKeys(pushPart(ch.last), pushPart(ch.ours)) });
        c.written++;
      }
      if (put.length) await call(d.rpc, "source_links_put", { p_source: src.id, p_object: "contact", p_rows: put });
      if (gone.length) await call(d.rpc, "source_links_delete", { p_source: src.id, p_object: "contact", p_external: gone });
      await log(d, rows);
    }
    if (opts.ids) break;
    // Read on from the last row. The saved cursor stays 30 seconds back: rows written just now may still be
    // committing elsewhere, and the next push reads them again (skipped if nothing changed).
    const lastRow = cands[cands.length - 1];
    cursor = `${lastRow.updated_at}|${lastRow.id}`;
    const safe = new Date(now() - 30_000).toISOString();
    const saved = lastRow.updated_at < safe ? cursor : `${safe}|`;
    if (saved !== src.push_cursor) {
      await call(d.rpc, "source_push_cursor_save", { p_id: src.id, p_cursor: saved });
      src.push_cursor = saved;
    }
    if (cands.length < (opts.batch ?? 200)) break;
    if (now() - start > (opts.budgetMs ?? 240_000)) {
      c.more = true;
      break;
    }
  }
  return c;
}
