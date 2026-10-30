import { seal } from "@/lib/seal";
import { requireUser, roleIn } from "@/lib/serverAuth";
import { later } from "@/lib/later";
import { serviceClient } from "@/lib/serviceClient";

// A team's own vendor key (docs/enrich-workflows-reports.md 1.2 A): POST { workspaceId, step, key } seals it with
// SECRETS_KEY and keeps it where only the server reads it; an empty key removes it. Lookups with the team's own key
// use no Claritia credits. Workspace owners only.

const bad = (error: string, status = 400) => Response.json({ error }, { status });
const STEPS = new Set(["coresignal", "pdl"]);

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const body = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; step?: unknown; key?: unknown };
  const ws = typeof body.workspaceId === "string" ? body.workspaceId : "";
  const role = await roleIn(auth, ws);
  if (!role) return bad("Workspace not found.", 404);
  if (role !== "owner") return bad("Only workspace owners can change keys.", 403);
  const step = typeof body.step === "string" && STEPS.has(body.step) ? body.step : "";
  if (!step) return bad("Pick a provider.");
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (key.length > 500 || /\s/.test(key)) return bad("That doesn't look like an API key.");
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);
  try {
    if (key) {
      const { error } = await db.from("enrich_keys").upsert({ workspace_id: ws, step, sealed: seal(key) }, { onConflict: "workspace_id,step" });
      if (error) return bad("Couldn't save the key. Try again.", 500);
    } else {
      await db.from("enrich_keys").delete().eq("workspace_id", ws).eq("step", step);
    }
    await db.from("enrich_sources").upsert({ workspace_id: ws, step, has_key: !!key }, { onConflict: "workspace_id,step", ignoreDuplicates: false });
    later(() => db.from("audit_log").insert({ workspace_id: ws, actor: auth.user.id, action: key ? "enrich.key_set" : "enrich.key_removed", target: step }));
    return Response.json({ ok: true, has_key: !!key });
  } catch (e) {
    return bad(e instanceof Error && /SECRETS_KEY/.test(e.message) ? "The server can't seal keys yet." : "Couldn't save the key. Try again.", 500);
  }
}
