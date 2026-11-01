// The model the app's chats run on (email, routing, scoring and workflows), and the shape of one chat call. Kept apart
// from the client (src/lib/forms/claude.ts), so code and tests can name them without loading the server's client.

import type Anthropic from "@anthropic-ai/sdk";

export const CHAT_MODEL = "claude-sonnet-5-5";
/** One chat call: the system prompt, the tools and the messages so far. Tests pass a fake. */
export type Model = (params: { system: Anthropic.Beta.BetaTextBlockParam[]; tools: Anthropic.Beta.BetaTool[]; messages: Anthropic.Beta.BetaMessageParam[] }) => Promise<Anthropic.Beta.BetaMessage>;
