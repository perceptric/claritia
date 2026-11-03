// The look check (docs/form-builder.md 5.1 step 4): Claude compares the site's own form with Claritia's form drawn in
// the scanned tokens, and names up to three tokens to change. One pass only, so it can't loop. The fixes go through
// the same token checks as everything else.

import type Anthropic from "@anthropic-ai/sdk";
import pw from "playwright-core";
import { cleanTokens, fixContrast, type Tokens } from "../forms/brand.ts";
import type { Form } from "../forms/schema.ts";

export const LOOK_MODEL = "claude-sonnet-5-5";
const TOKENS: (keyof Tokens)[] = ["text", "muted", "background", "inputBg", "border", "borderWidth", "radius", "inputHeight", "accent", "buttonBg", "buttonText", "buttonRadius", "buttonWeight", "labelSize", "labelWeight", "fontSize", "gap"];

export type Fix = { token: keyof Tokens; value: string; why: string };
export type Looker = (theirs: Buffer, ours: Buffer, tokens: Tokens) => Promise<{ fixes: Fix[]; usage: Anthropic.Beta.BetaUsage }>;

/** Claritia's form, drawn in the given tokens, as a PNG. `code` is the built <claritia-form> script. */
export async function drawForm(code: string, form: Form, tokens: Tokens, chromiumPath?: string): Promise<Buffer> {
  const browser = await pw.chromium.launch({ headless: true, executablePath: chromiumPath || undefined, args: ["--disable-dev-shm-usage"] });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
    await page.setContent(`<!doctype html><body style="margin:0;padding:24px;background:${tokens.background}"><claritia-form id="f"></claritia-form></body>`);
    await page.addScriptTag({ content: code });
    await page.evaluate(([f, t]) => ((document.getElementById("f") as unknown as { preview: unknown }).preview = { form: f, tokens: t }), [form, tokens] as const);
    await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
    return await page.locator("claritia-form").screenshot();
  } finally {
    await browser.close();
  }
}

const SCHEMA = {
  type: "object",
  properties: {
    fixes: {
      type: "array",
      items: {
        type: "object",
        properties: { token: { type: "string", enum: TOKENS }, value: { type: "string" }, why: { type: "string" } },
        required: ["token", "value", "why"],
        additionalProperties: false,
      },
    },
  },
  required: ["fixes"],
  additionalProperties: false,
};

const SYSTEM = `You compare two screenshots of a web form. The first is the customer's own form on their site. The second is a form we drew to match it from design tokens. Name at most three tokens whose change would make the second look most like the first: colors as #rrggbb, sizes as whole pixels, weights as 400 to 700. Only fix clear differences in corners, borders, field height, button color or shape, label size and weight, and colors. Return no fixes when they already match. Say why in under ten words.`;

export function claudeLooker(client: Anthropic): Looker {
  return async (theirs, ours, tokens) => {
    const res = await client.beta.messages.create({
      model: LOOK_MODEL,
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: theirs.toString("base64") } },
            { type: "image", source: { type: "base64", media_type: "image/png", data: ours.toString("base64") } },
            { type: "text", text: `Tokens now: ${JSON.stringify(Object.fromEntries(TOKENS.map((k) => [k, tokens[k]])))}` },
          ],
        },
      ],
    });
    if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return { fixes: [], usage: res.usage };
    const out = JSON.parse(res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("") || "{}") as { fixes?: Fix[] };
    return { fixes: (out.fixes ?? []).slice(0, 3), usage: res.usage };
  };
}

/** Apply up to three fixes; each goes through the token checks and the contrast fix. Returns the notes to show. */
export function applyFixes(tokens: Tokens, fixes: Fix[]): { tokens: Tokens; notes: string[] } {
  const next: Record<string, unknown> = { ...tokens };
  const used: Fix[] = [];
  for (const f of fixes.slice(0, 3)) {
    if (!TOKENS.includes(f.token)) continue;
    const before = cleanTokens(next).tokens[f.token];
    const after = cleanTokens({ ...next, [f.token]: f.value }).tokens[f.token];
    if (after === before) continue;
    next[f.token] = f.value;
    used.push(f);
  }
  const fixed = fixContrast(cleanTokens(next).tokens);
  return { tokens: fixed.tokens, notes: [...used.map((f) => `Matched to your form: ${f.why.replace(/\.$/, "")}.`.slice(0, 200)), ...fixed.notes] };
}
