import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { cachedStep, hashKey, usageOf } from "../ai/cache.ts";
import type { Rpc } from "../jobs.ts";
import { parseWhen, readWhen, WHEN_MODEL, WHEN_SYSTEM, type WhenRange } from "./when.ts";

// The booking page's plain-words box, on the server (docs/booking-page-plan.md, Part 5): what the page's own reader
// couldn't read goes to Claude Haiku through the step cache, keyed by the words and the guest's today, so the same
// phrase on the same day never calls the model twice. No credits are taken from the workspace (book_when costs 0).
// Null when nothing fits or the model can't be asked: the guest picks from the calendar as before.

export async function whenAnswer(rpc: Rpc, ws: string, raw: string, today: string): Promise<WhenRange | null> {
  const text = raw.trim().replace(/\s+/g, " ").slice(0, 120);
  if (text.length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
  const local = parseWhen(text, today);
  if (local) return local;
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  try {
    const r = await cachedStep(rpc, ws, "book_when", hashKey(WHEN_MODEL, "when-1", WHEN_SYSTEM, text.toLowerCase(), today), async () => {
      const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 15_000 });
      const msg = await client.messages.create({
        model: WHEN_MODEL,
        max_tokens: 100,
        system: [{ type: "text", text: WHEN_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: `Today is ${today} (${new Date(`${today}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })}). Phrase: ${text}` }],
      });
      const answer = msg.content.map((c) => (c.type === "text" ? c.text : "")).join("");
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(answer.slice(answer.indexOf("{"), answer.lastIndexOf("}") + 1));
      } catch {}
      const range = readWhen(parsed, today);
      return { result: range, model: WHEN_MODEL, usage: usageOf(msg.usage), keep: range !== null };
    });
    return readWhen(r.result, today);
  } catch {
    return null;
  }
}
