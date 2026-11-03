import Anthropic from "@anthropic-ai/sdk";
import { cachedStep, hashKey, usageOf } from "@/lib/ai/cache";
import { isMember } from "@/lib/contacts/server";
import { catalogLines, localMatch, MATCH_MODEL, MATCH_SYSTEM, readMatch } from "@/lib/forms/gallery/match";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// Describe your form (docs/form-templates-plan.md 5.5): POST { workspaceId, text } answers { ids } (up to 3 template
// ids, best first). Words that hit the catalog match without AI; the rest go to Claude Haiku through the step cache.
// A model that doesn't answer leaves the list empty: the Build with AI button works either way.

const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const b = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; text?: unknown };
  if (!(await isMember(auth, b.workspaceId))) return bad("Workspace not found.", 404);
  const ws = b.workspaceId as string;
  const text = typeof b.text === "string" ? b.text.trim().replace(/\s+/g, " ").slice(0, 300) : "";
  if (text.length < 8) return Response.json({ ids: [] });
  const local = localMatch(text);
  if (local.length) return Response.json({ ids: local.map((t) => t.id), ai: false });
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const db = serviceClient();
  if (!apiKey || !db) return Response.json({ ids: [] });
  const catalog = catalogLines();
  const rpc = (fn: string, args: Record<string, unknown>) => db.rpc(fn, args);
  try {
    const r = await cachedStep(rpc, ws, "template_match", hashKey(MATCH_MODEL, "match-1", catalog, text.toLowerCase()), async () => {
      const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 20_000 });
      const msg = await client.messages.create({
        model: MATCH_MODEL,
        max_tokens: 120,
        system: [{ type: "text", text: `${MATCH_SYSTEM}\n\nCatalog:\n${catalog}`, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: text }],
      });
      const answer = msg.content.map((c) => (c.type === "text" ? c.text : "")).join("\n");
      return { result: readMatch(answer), model: MATCH_MODEL, usage: usageOf(msg.usage) };
    });
    return Response.json({ ids: r.result, ai: true });
  } catch {
    return Response.json({ ids: [] });
  }
}
