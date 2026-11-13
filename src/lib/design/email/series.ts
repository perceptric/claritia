// Many new emails from one prompt (docs/email-canvas-b5.md section 3): Tia plans a short series (each email's name,
// subject and one line on what it says, at most 10, in order), the person says Write them, and each email is then
// written through the existing chat (runEmailChat), from a template and in the brand's styles. Server only for the
// model calls; the plan's reading and the messages are pure and tested with a scripted model.

import type Anthropic from "@anthropic-ai/sdk";
import { addUsage, usageOf, type Usage } from "../../ai/cache.ts";
import { readEmailDoc, type EmailDoc } from "./doc.ts";
import type { Model } from "./chat.ts";

export const SERIES_MODEL = "claude-sonnet-5-5";
export const MAX_SERIES = 10;
export type PlanItem = { name: string; subject: string; brief: string };

export const SERIES_SYSTEM = `You plan short series of marketing emails in Claritia with a person who is not technical. When they ask for new emails, call plan_emails once with the emails in the order they go out: a short name for each (what the team calls it), its subject line, and one plain sentence on what it says. Keep to what they asked for; at most ${MAX_SERIES} emails. If what they want isn't clear enough to plan, ask one short question in words instead of calling the tool. Never write the emails here.`;

export const PLAN_TOOL: Anthropic.Beta.BetaTool = {
  name: "plan_emails",
  description: "The plan: the new emails in order, each with a short name, its subject and one sentence on what it says.",
  input_schema: {
    type: "object",
    properties: {
      emails: {
        type: "array",
        minItems: 1,
        maxItems: MAX_SERIES,
        items: { type: "object", properties: { name: { type: "string" }, subject: { type: "string" }, brief: { type: "string" } }, required: ["name", "subject", "brief"] },
      },
    },
    required: ["emails"],
  },
};

const line = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** A plan read safely: named emails only, trimmed, at most 10. */
export function readPlan(raw: unknown): PlanItem[] {
  const list = Array.isArray((raw as { emails?: unknown })?.emails) ? ((raw as { emails: unknown[] }).emails) : [];
  return list
    .map((e) => ({ name: line((e as PlanItem)?.name, 120), subject: line((e as PlanItem)?.subject, 200), brief: line((e as PlanItem)?.brief, 400) }))
    .filter((e) => e.name)
    .slice(0, MAX_SERIES);
}

/** One planning call: the plan, or a question in words when the ask isn't clear. */
export async function planSeries(model: Model, message: string, ctx: { group: string; brand?: { name: string; brief?: string } | null; history: { role: "user" | "assistant"; text: string }[] }): Promise<{ plan: PlanItem[]; reply: string; usage: Usage }> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...ctx.history.slice(-10).map((h) => ({ role: h.role, content: h.text.slice(0, 2000) }) as Anthropic.Beta.BetaMessageParam),
    { role: "user", content: `${ctx.brand ? `Brand: ${ctx.brand.name}${ctx.brand.brief ? `\nBrief: ${ctx.brand.brief.slice(0, 2000)}` : ""}\n\n` : ""}Group: ${ctx.group}\n\nThe person says:\n${message.slice(0, 4000)}` },
  ];
  while (messages.length && messages[0]!.role !== "user") messages.shift();
  const res = await model({ system: [{ type: "text", text: SERIES_SYSTEM, cache_control: { type: "ephemeral" } }], tools: [PLAN_TOOL], messages });
  const usage = addUsage({ input: 0, output: 0, cache_read: 0, cache_write: 0 }, usageOf(res.usage));
  const call = res.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === "plan_emails");
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
  return { plan: call ? readPlan(call.input) : [], reply: call ? "" : text, usage };
}

/** What the chat is asked for one email of a plan. */
export function buildMessage(items: PlanItem[], index: number, asked: string): string {
  const it = items[index]!;
  const others = items.map((x, i) => `${i + 1}. ${x.name}: ${x.subject}`).join("\n");
  return `Write email ${index + 1} of ${items.length} in a new series. The person asked: "${asked.slice(0, 1000)}".\nThis email: ${it.name}. Subject: ${it.subject}. It says: ${it.brief}\nThe whole series:\n${others}\nStart from the template that fits this email best, write its words in the brand's voice, set its subject (and a preview line), and keep the footer.`;
}

/** The document a series email starts from: a footer only, with fixed ids so the same request replays from cache. */
export function seriesStartDoc(index: number, kitId?: string): EmailDoc {
  return readEmailDoc({ ...(kitId ? { kitId } : {}), sections: [{ id: `ss${index}a`, columns: [{ id: `sc${index}a`, blocks: [{ id: `sf${index}a`, type: "footer" }] }] }] });
}
