// The step cache for marketing AI calls (CLAUDE.md, docs/marketing-platform.md Part 2 rule 6). An AI step is keyed by
// a hash of everything it reads; the same inputs replay the saved answer and never call the model. Every call, cached
// or not, is logged in ai_calls with its tokens and cost, so the bill can be checked against the plan.

import { createHash } from "node:crypto";
import type { Rpc } from "../jobs.ts";

export type Usage = { input: number; output: number; cache_read: number; cache_write: number; searches?: number };

// Per million tokens (docs/marketing-platform.md Part 11). Cache reads at a tenth of input, writes at 1.25 times
// (check against the price page when the plans change). Web search $10 per 1,000 (check).
const PRICES: Record<string, { in: number; out: number }> = {
  "claude-haiku-5-5": { in: 0.1, out: 0.5 },
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-opus-5-5": { in: 4, out: 20 },
};

export function costOf(model: string, u: Usage): number {
  const p = PRICES[model] ?? PRICES["claude-sonnet-5-5"];
  return (u.input * p.in + u.cache_read * p.in * 0.1 + u.cache_write * p.in * 1.25 + u.output * p.out) / 1_000_000 + (u.searches ?? 0) * 0.01;
}

/** Usage from an Anthropic response's usage block. */
export function usageOf(u: { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } | null | undefined): Usage {
  return { input: u?.input_tokens ?? 0, output: u?.output_tokens ?? 0, cache_read: u?.cache_read_input_tokens ?? 0, cache_write: u?.cache_creation_input_tokens ?? 0 };
}

export const addUsage = (a: Usage, b: Usage): Usage => ({
  input: a.input + b.input,
  output: a.output + b.output,
  cache_read: a.cache_read + b.cache_read,
  cache_write: a.cache_write + b.cache_write,
  searches: (a.searches ?? 0) + (b.searches ?? 0),
});

/** A stable key for any JSON-able inputs: object keys are sorted, so the same data always hashes the same. */
export function hashKey(...parts: unknown[]): string {
  const stable = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, stable((v as Record<string, unknown>)[k])])) : v;
  return createHash("sha256").update(JSON.stringify(parts.map(stable))).digest("hex");
}

async function call<T>(rpc: Rpc, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

/**
 * Run an AI step through the cache. `run` calls the model and returns what to keep; it only runs on a miss. A step
 * whose answer shouldn't be reused (it failed or asked a question back) returns `keep: false`.
 */
export async function cachedStep<T>(
  rpc: Rpc,
  ws: string,
  kind: string,
  key: string,
  run: () => Promise<{ result: T; model: string; usage: Usage; keep?: boolean }>,
): Promise<{ result: T; cached: boolean; usage: Usage; cost: number }> {
  const hit = await call<T | null>(rpc, "ai_cache_get", { p_ws: ws, p_kind: kind, p_key: key });
  if (hit !== null && hit !== undefined) {
    await call(rpc, "ai_call_log", { p_ws: ws, p_kind: kind, p_model: "cache", p_usage: {}, p_cost: 0, p_cached: true }).catch(() => undefined);
    return { result: hit, cached: true, usage: { input: 0, output: 0, cache_read: 0, cache_write: 0 }, cost: 0 };
  }
  const r = await run();
  const cost = costOf(r.model, r.usage);
  await call(rpc, "ai_call_log", { p_ws: ws, p_kind: kind, p_model: r.model, p_usage: r.usage, p_cost: cost, p_cached: false }).catch(() => undefined);
  if (r.keep !== false) await call(rpc, "ai_cache_put", { p_ws: ws, p_kind: kind, p_key: key, p_output: r.result, p_model: r.model, p_in: r.usage.input, p_out: r.usage.output });
  return { result: r.result, cached: false, usage: r.usage, cost };
}
