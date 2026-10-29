// The scoring assistant (docs/scoring-plan.md Part 3): one call that reviews the first model built from the data, and
// one per chat message that changes the draft. Both hand back a whole model, which is cleaned (model.ts) before it is
// saved, so the assistant can never store something the editor can't show. Calls go through the step cache.

import type Anthropic from "@anthropic-ai/sdk";
import { addUsage, usageOf, type Usage } from "../ai/cache.ts";
import type { Model } from "../forms/chat.ts";
import type { FieldDef } from "../router/conditions.ts";
import { cleanBody, EVENT_FIELDS, type ScoreBody } from "./model.ts";
import type { Stats } from "./engine.ts";
import { ruleWords, pointsWords } from "./words.ts";
import type { Finding } from "./build.ts";

export const SCORING_MODEL = "claude-sonnet-5-5";

export type ScoringCtx = {
  body: ScoreBody;
  fields: FieldDef[];
  forms: { id: string; name: string }[];
  stats: Stats | null;
  site: { name: string | null; domain: string | null };
  findings?: Finding[];
  history?: { role: "user" | "assistant"; text: string }[];
};

export const SCORING_SYSTEM = `You set up lead scoring for a B2B team, the way an experienced revenue operations lead would.

The model has fit groups (could they buy: company and person), activity groups (do they want to buy now: forms, pages,
meetings, email clicks, product use), and rules that take points away or remove a lead from scoring. Each group adds its
rules' points up to its max. Activity points fade by half every halfLife days. Grades style turns fit and activity into
a grade like A1 (best fit, most active) and the sales-ready grades are in mql. Points style uses one score with ready and
warm cut-offs. capacity is how many sales-ready leads a week the team can follow up.

Rules:
- Use only the fields listed. Event fields: event.form (value: form ids), event.page (value: words in the path),
  event.meeting, event.click, event.unsub, event.product (value: event names). Use op "filled" for "it happened".
- Keep rule ids that exist. New rules need no id.
- Never invent facts about the company. Use the numbers you are given; say plainly when there aren't enough leads.
- Write in plain words a 9th grader can read. No hype. No exclamation marks.
- Always answer with the save_model tool.`;

const BODY_SCHEMA = { type: "object", description: "The whole model, in the same shape as the one you were given." } as const;
export const BUILD_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "save_model",
    description: "Save the model and say what you found.",
    input_schema: {
      type: "object",
      properties: {
        body: BODY_SCHEMA,
        findings: { type: "array", description: "Up to 8 short sentences about what you used, each with its source.", items: { type: "object", properties: { source: { type: "string", enum: ["site", "crm", "leads"] }, text: { type: "string" } }, required: ["source", "text"] } },
      },
      required: ["body", "findings"],
    },
  },
];
export const CHAT_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "save_model",
    description: "Save the changed model and tell the person what changed.",
    input_schema: {
      type: "object",
      properties: {
        body: BODY_SCHEMA,
        reply: { type: "string", description: "One or two plain sentences for the person." },
        lines: { type: "array", items: { type: "string" }, description: "Each change in a few words, like 'Visited /pricing: +15'." },
      },
      required: ["body", "reply"],
    },
  },
];

function contextText(ctx: ScoringCtx): string {
  const words = { fields: ctx.fields, forms: Object.fromEntries(ctx.forms.map((f) => [f.id, f.name])) };
  const rules = [...ctx.body.groups.map((g) => ({ g: `${g.name} (${g.side}, max ${g.max})`, rules: g.rules })), { g: "Points taken away", rules: ctx.body.minus }]
    .map((x) => `${x.g}:\n${x.rules.map((r) => `  - ${ruleWords(r, words)}: ${pointsWords(r)}`).join("\n") || "  (none)"}`)
    .join("\n");
  const s = ctx.stats;
  return [
    `Company: ${ctx.site.name ?? "unknown"}${ctx.site.domain ? ` (${ctx.site.domain})` : ""}`,
    `Fields: ${ctx.fields.map((f) => `${f.key} (${f.type}${f.options?.length ? `: ${f.options.slice(0, 12).join(", ")}` : ""})`).join("; ")}`,
    `Event fields: ${EVENT_FIELDS.map((f) => f.key).join(", ")}`,
    `Forms: ${ctx.forms.map((f) => `${f.id} = ${f.name}`).join("; ") || "none"}`,
    s ? `Past ${s.days} days: ${s.total} leads, ${s.base}% met sales. Sales-ready ${s.bands.hot}, warming ${s.bands.warm}, not yet ${s.bands.cold}, removed ${s.bands.out}. About ${s.perWeek} sales-ready a week. ${s.caught}% of leads that met were sales-ready first.` : "No past leads yet.",
    ctx.findings?.length ? `Found in the data:\n${ctx.findings.map((f) => `- (${f.source}) ${f.text}`).join("\n")}` : "",
    `The model in words:\n${rules}`,
    `The model as data:\n${JSON.stringify(ctx.body)}`,
  ].filter(Boolean).join("\n\n");
}

async function once(model: Model, tools: Anthropic.Beta.BetaTool[], messages: Anthropic.Beta.BetaMessageParam[]) {
  let usage: Usage = { input: 0, output: 0, cache_read: 0, cache_write: 0 };
  const res = await model({ system: [{ type: "text", text: SCORING_SYSTEM, cache_control: { type: "ephemeral" } }], tools, messages });
  usage = addUsage(usage, usageOf(res.usage));
  const call = res.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === "save_model");
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
  return { input: (call?.input ?? null) as Record<string, unknown> | null, text, usage, refused: res.stop_reason === "refusal" };
}

/** Review the model built from the data. Falls back to it unchanged when the answer doesn't hold up. */
export async function reviewBuild(model: Model, ctx: ScoringCtx): Promise<{ body: ScoreBody; findings: Finding[]; usage: Usage }> {
  const r = await once(model, BUILD_TOOLS, [{ role: "user", content: `${contextText(ctx)}\n\nThis model was built from the data above. Improve it where the numbers support it, keep what works, and list what you used.` }]);
  const body = r.input?.body ? cleanBody(r.input.body, ctx.fields) : ctx.body;
  const findings = (Array.isArray(r.input?.findings) ? r.input!.findings : [])
    .filter((f): f is Finding => !!f && typeof f === "object" && ["site", "crm", "leads"].includes((f as Finding).source) && typeof (f as Finding).text === "string")
    .map((f) => ({ source: f.source, text: f.text.trim().slice(0, 160) }))
    .slice(0, 8);
  const usable = body.groups.some((g) => g.side === "fit" && g.rules.length) && body.groups.some((g) => g.side === "act" && g.rules.length);
  return { body: usable ? body : ctx.body, findings: findings.length ? findings : (ctx.findings ?? []), usage: r.usage };
}

/** One chat message: the changed model, a reply and the changes in a few words. */
export async function chatTurn(model: Model, message: string, ctx: ScoringCtx): Promise<{ body: ScoreBody | null; reply: string; lines: string[]; usage: Usage }> {
  const history = (ctx.history ?? []).slice(-8).map((h) => ({ role: h.role, content: h.text.slice(0, 2000) }) as Anthropic.Beta.BetaMessageParam);
  while (history.length && history[0]!.role !== "user") history.shift();
  const r = await once(model, CHAT_TOOLS, [...history, { role: "user", content: `${contextText(ctx)}\n\nThe person says:\n${message.slice(0, 4000)}` }]);
  if (r.refused) return { body: null, reply: "I can't help with that one.", lines: [], usage: r.usage };
  if (!r.input?.body) return { body: null, reply: r.text || "I couldn't change the model from that. Try saying it another way.", lines: [], usage: r.usage };
  const lines = (Array.isArray(r.input.lines) ? r.input.lines : []).filter((l): l is string => typeof l === "string").map((l) => l.slice(0, 160)).slice(0, 10);
  return { body: cleanBody(r.input.body, ctx.fields), reply: (typeof r.input.reply === "string" ? r.input.reply : "Done.").slice(0, 600), lines, usage: r.usage };
}
