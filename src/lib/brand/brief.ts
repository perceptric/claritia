// The brand brief (docs/design-system.md Part 7.1 step 2): Claude reads the site's words and colors and writes a
// short brief (who it's for, tone, words to use and avoid) and names the brand colors. The AI that writes emails and
// forms reads the brief. One call per scan, through the step cache.

import type Anthropic from "@anthropic-ai/sdk";

export const BRIEF_MODEL = "claude-sonnet-5-5";
export type Brief = { brief: string; colors: string[] };
export type Briefer = (input: { url: string; copy: string; colors: string[] }) => Promise<{ brief: Brief; usage: Anthropic.Beta.BetaUsage }>;

const SCHEMA = {
  type: "object",
  properties: {
    brief: { type: "string", description: "Under 120 words." },
    colors: { type: "array", items: { type: "string" }, description: "A short name for each color, in order, like Ocean blue." },
  },
  required: ["brief", "colors"],
  additionalProperties: false,
};

const SYSTEM = `You write a brand brief for the team that writes this company's marketing emails and forms. From the site's own words: who the company sells to, what it offers in one line, its tone of voice, three words or phrases it uses, and anything it avoids. Plain sentences, under 120 words, no lists, no claims that aren't on the page. Then give each color a short name of two words at most.`;

export function claudeBriefer(client: Anthropic): Briefer {
  return async ({ url, copy, colors }) => {
    const res = await client.beta.messages.create({
      model: BRIEF_MODEL,
      max_tokens: 2000,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [{ role: "user", content: `Site: ${url}\nColors: ${colors.join(", ") || "none"}\n\nThe home page's words:\n${copy.slice(0, 6000)}` }],
    });
    if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return { brief: { brief: "", colors: [] }, usage: res.usage };
    const out = JSON.parse(res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("") || "{}") as Partial<Brief>;
    return { brief: { brief: String(out.brief ?? "").slice(0, 1500), colors: (Array.isArray(out.colors) ? out.colors : []).map((c) => String(c).slice(0, 40)).slice(0, 6) }, usage: res.usage };
  };
}
