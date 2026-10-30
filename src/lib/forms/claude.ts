import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { CHAT_MODEL, type Model } from "./chat.ts";

// The chat's model call: Claude Sonnet 5.5 with adaptive thinking at medium effort, and the server-side fallback for
// a declined request. Null when ANTHROPIC_API_KEY isn't set.
// One client per process (and per key): 45 s a call and one retry, so a chat turn can't hold a request for minutes.
let shared: { apiKey: string; client: Anthropic } | null = null;

export function claudeChat(): Model | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  if (shared?.apiKey !== apiKey) shared = { apiKey, client: new Anthropic({ apiKey, maxRetries: 1, timeout: 45_000 }) };
  const client = shared.client;
  return (p) =>
    client.beta.messages.create({
      model: process.env.FORMS_CHAT_MODEL?.trim() || CHAT_MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: p.system,
      tools: p.tools,
      messages: p.messages,
    });
}
