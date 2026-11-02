import Anthropic from "@anthropic-ai/sdk";
import { isMember } from "@/lib/contacts/server";
import { applyTailor, TAILOR_MODEL, TAILOR_SCHEMA, TAILOR_SYSTEM, tailorKey, tailorPrompt, type TailorOut } from "@/lib/forms/tailor";
import { checkSchema } from "@/lib/forms/schema";
import type { FormSchema } from "@/lib/forms/types";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// Tailor to my business: POST { workspaceId, id, about, schema } → { schema }. The editor shows the result as
// unsaved changes, so nothing reaches visitors until someone saves. The same form and description replay from
// form_tailor_cache and never call the model again.

export const runtime = "nodejs";
export const maxDuration = 90;

const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const b = (await request.json().catch(() => ({}))) as { workspaceId?: string; id?: string; about?: string; schema?: FormSchema };
  if (!(await isMember(auth, b.workspaceId))) return bad("Workspace not found.", 404);
  const about = String(b.about ?? "").trim();
  if (about.length < 10) return bad("Describe your business in a sentence or two.");
  if (about.length > 2000) return bad("Keep the description under 2,000 characters.");
  if (!b.schema || checkSchema(b.schema).length) return bad("Fix the form's errors first.");
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);
  const { data: owned } = await db.from("forms").select("id").eq("id", String(b.id ?? "")).eq("workspace_id", b.workspaceId!).maybeSingle();
  if (!owned) return bad("Form not found.", 404);

  const key = tailorKey(b.schema, about);
  const { data: hit } = await db.from("form_tailor_cache").select("result").eq("key", key).maybeSingle();
  if (hit?.result) {
    try {
      return Response.json({ schema: applyTailor(b.schema, hit.result as TailorOut), cached: true });
    } catch {
      // A cached answer that no longer fits is asked again.
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return bad("Tailor isn't set up on this server yet.", 503);
  const client = new Anthropic({ apiKey, maxRetries: 3, timeout: 80_000 });
  try {
    const res = await client.messages.create({
      model: TAILOR_MODEL,
      max_tokens: 12000,
      output_config: { effort: "low", format: { type: "json_schema", schema: TAILOR_SCHEMA } },
      system: [{ type: "text", text: TAILOR_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: tailorPrompt(b.schema, about) }],
    });
    if (res.stop_reason === "refusal") return bad("Claude couldn't tailor this form. Try a different description.");
    if (res.stop_reason === "max_tokens") return bad("The form is too long to tailor in one go.");
    const out = JSON.parse(res.content.flatMap((x) => (x.type === "text" ? [x.text] : [])).join("")) as TailorOut;
    const schema = applyTailor(b.schema, out);
    await db.from("form_tailor_cache").upsert({ key, result: out, at: new Date().toISOString() });
    return Response.json({ schema });
  } catch (e) {
    console.error("tailor failed", e instanceof Error ? e.message : e);
    return bad("Tailor didn't finish. Try again.", 502);
  }
}
