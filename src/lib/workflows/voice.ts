// The build screen's writing step (docs/email-plan.md Part 8): the journeys' emails rewritten in the brand's voice,
// from its brief and its past emails, in one model call through the step cache. Only the words change; the steps,
// waits and links stay as built. An answer that doesn't hold up leaves the built words. Server only.

import type Anthropic from "@anthropic-ai/sdk";
import { usageOf, type Usage } from "../ai/cache.ts";
import type { Model } from "../forms/chat.ts";
import { mergeGaps } from "./merge.ts";
import type { EmailBody } from "./types.ts";

export const VOICE_SYSTEM = `You write lifecycle emails for a B2B SaaS company, in its own voice.
- You get the brand's name, a short brief about it, and a list of emails, each with an id, the moment it's for and its current words.
- Rewrite each email so it sounds like this company: its words for its product and its customers, short sentences, one idea per email.
- Keep each email's purpose, its button and where it sits in the journey. Plain text only, no markdown, no emoji, no exclamation marks.
- Never invent numbers, customer names, quotes, prices or features the brief doesn't state.
- Keep merge tags exactly as {{first_name|there}}. Keep paragraphs to two or three sentences, three paragraphs at most.
- Call save_emails once with every email.`;

export const VOICE_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "save_emails",
    description: "Save the rewritten emails.",
    input_schema: {
      type: "object",
      properties: {
        emails: {
          type: "array",
          items: {
            type: "object",
            properties: { id: { type: "string" }, subject: { type: "string" }, preheader: { type: "string" }, paragraphs: { type: "array", items: { type: "string" } }, cta_label: { type: "string" } },
            required: ["id", "subject", "preheader", "paragraphs"],
          },
        },
      },
      required: ["emails"],
    },
  },
];

export type VoiceIn = { brand: string; brief: string; emails: { id: string; moment: string; email: EmailBody }[] };
export type Rewrite = { id: string; subject: string; preheader: string; paragraphs: string[]; cta_label?: string };

/** One email's rewrite, checked: real words, merge tags with a fallback, a button label only where there was one. */
export function cleanRewrite(r: unknown, was: EmailBody): EmailBody | null {
  const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
  const subject = text(o.subject, 120);
  const preheader = text(o.preheader, 160);
  const paragraphs = (Array.isArray(o.paragraphs) ? o.paragraphs : []).map((p) => text(p, 600)).filter(Boolean).slice(0, 4);
  const cta = was.cta_label ? text(o.cta_label, 40) || was.cta_label : "";
  if (!subject || !paragraphs.length) return null;
  if ([subject, preheader, ...paragraphs, cta].some((x) => mergeGaps(x).length || /[!*#]|https?:\/\//.test(x))) return null;
  return { ...was, subject, preheader, paragraphs, cta_label: cta };
}

export async function rewriteInVoice(model: Model, input: VoiceIn): Promise<{ rewrites: Rewrite[]; usage: Usage }> {
  const list = input.emails.map((e) => ({ id: e.id, moment: e.moment, subject: e.email.subject, preheader: e.email.preheader, paragraphs: e.email.paragraphs, cta_label: e.email.cta_label || undefined }));
  const res = await model({
    system: [{ type: "text", text: VOICE_SYSTEM, cache_control: { type: "ephemeral" } }],
    tools: VOICE_TOOLS,
    messages: [{ role: "user", content: `Brand: ${input.brand}\nBrief: ${input.brief.slice(0, 3000) || "(none)"}\n\nEmails:\n${JSON.stringify(list)}` }],
  });
  const call = res.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === "save_emails");
  const emails = (call?.input as { emails?: unknown } | undefined)?.emails;
  return { rewrites: Array.isArray(emails) ? (emails as Rewrite[]) : [], usage: usageOf(res.usage) };
}
