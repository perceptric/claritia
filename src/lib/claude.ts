// The one shape every Claude call here takes: adaptive thinking, a JSON schema for the answer, the instructions
// cached, and (for Opus) the server-side fallback that re-runs a declined request on another model.
import type Anthropic from "@anthropic-ai/sdk";

export type Usage = { input: number; output: number };

/** A request for an answer that fits `schema`. `fallback` adds the server-side fallback; Haiku has none. */
export function jsonRequest(o: {
  model: string;
  maxTokens: number;
  effort: "low" | "medium" | "high";
  schema: Record<string, unknown>;
  system: string;
  content: string | Anthropic.Beta.BetaContentBlockParam[];
  fallback: boolean;
}) {
  return {
    model: o.model,
    max_tokens: o.maxTokens,
    ...(o.fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    thinking: { type: "adaptive" as const },
    output_config: { effort: o.effort, format: { type: "json_schema" as const, schema: o.schema } },
    system: [{ type: "text" as const, text: o.system, cache_control: { type: "ephemeral" as const } }],
    messages: [{ role: "user" as const, content: o.content }],
  };
}

/** Every input token (cached or not) and the output tokens, for the AI credits and the bill. */
export function usageOf(res: Anthropic.Beta.BetaMessage): Usage {
  const u = res.usage;
  return { input: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), output: u.output_tokens ?? 0 };
}

/** The answer's text, joined from its text blocks. */
export const textOf = (res: Anthropic.Beta.BetaMessage) => res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
