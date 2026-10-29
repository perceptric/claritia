// Reading facts and writing scores (supabase/migrations/080_scoring_models.sql). Shared by the API and the worker,
// so Results on past leads and the scores people see come from the same facts and the same engine.

import type { Rpc } from "../jobs.ts";
import { scoreLead, type LeadEvent, type LeadFacts, type Score } from "./engine.ts";
import type { ScoreBody } from "./model.ts";
import { ruleWords, type WordsCtx } from "./words.ts";

type RawFacts = { id: string; created: string; values: Record<string, unknown>; events: { k: LeadEvent["k"]; d?: string | null; at: string }[]; met: boolean };

const KINDS = new Set(["form", "page", "meeting", "click", "unsub", "product"]);

export function toFacts(r: RawFacts): LeadFacts {
  return {
    id: r.id,
    created: Date.parse(r.created),
    values: r.values ?? {},
    events: (r.events ?? []).filter((e) => KINDS.has(e.k)).map((e) => ({ k: e.k, ...(e.d ? { d: e.d } : {}), at: Date.parse(e.at) })).filter((e) => Number.isFinite(e.at)),
    met: !!r.met,
  };
}

async function call<T>(rpc: Rpc, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

/** Leads in pages of 1,000, up to `max`. `since` keeps the ones created since then. */
export async function loadFacts(rpc: Rpc, ws: string, o: { since?: Date; max?: number; ids?: string[] } = {}): Promise<LeadFacts[]> {
  const out: LeadFacts[] = [];
  let after: string | null = null;
  const max = o.max ?? 5000;
  while (out.length < max) {
    const page: RawFacts[] = (await call<RawFacts[] | null>(rpc, "scoring_facts", { p_ws: ws, p_since: o.since?.toISOString() ?? null, p_ids: o.ids ?? null, p_after: after, p_limit: Math.min(1000, max - out.length) })) ?? [];
    out.push(...page.map(toFacts));
    if (page.length < 1000 || o.ids) break;
    after = page[page.length - 1]!.id;
  }
  return out;
}

/** What the Why panel shows, kept with the score: each rule that counted, in words, with its points. */
export function reasonsOf(s: Score, words: WordsCtx) {
  return {
    fit: s.fit,
    act: s.act,
    ...(s.removedBy ? { removed: ruleWords(s.removedBy, words) } : {}),
    hits: s.hits.map((h) => ({ g: h.group, w: ruleWords(h.rule, words), p: Math.round(h.points), ...(h.times && h.times > 1 ? { n: h.times } : {}), ...(h.last ? { at: new Date(h.last).toISOString() } : {}), ...(h.capped ? { cap: true } : {}) })),
  };
}

/**
 * Score leads with a live model and write what changed: every lead, or only `ids` (the quick pass for leads that
 * are new or did something). Returns how many were scored and how many changed.
 */
export async function scoreAll(rpc: Rpc, ws: string, model: { id: string; body: ScoreBody }, words: WordsCtx, o: { now?: number; signal?: AbortSignal; ids?: string[] } = {}): Promise<{ scored: number; changed: number }> {
  const now = o.now ?? Date.now();
  let after: string | null = null;
  let scored = 0;
  let changed = 0;
  for (let i = 0; ; i++) {
    if (o.signal?.aborted) break;
    const ids = o.ids?.slice(i * 500, (i + 1) * 500);
    if (o.ids && !ids?.length) break;
    const page: RawFacts[] = (await call<RawFacts[] | null>(rpc, "scoring_facts", { p_ws: ws, p_since: null, p_ids: ids ?? null, p_after: ids ? null : after, p_limit: 500 })) ?? [];
    if (!page.length && !o.ids) break;
    const rows = page.map((r) => {
      const s = scoreLead(model.body, toFacts(r), now);
      return { id: r.id, score: s.total, band: s.band, grade: model.body.style === "grades" ? s.grade : null, fit: s.fit, act: s.act, reasons: reasonsOf(s, words) };
    });
    if (rows.length) changed += await call<number>(rpc, "scoring_write", { p_ws: ws, p_model: model.id, p_rows: rows });
    scored += rows.length;
    if (!o.ids) {
      after = page[page.length - 1]?.id ?? null;
      if (page.length < 500) break;
    }
  }
  return { scored, changed };
}
