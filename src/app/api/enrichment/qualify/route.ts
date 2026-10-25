import { cleanQualify } from "@/lib/enrich/qualify";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// Qualify's settings (docs/enrich-workflows-reports.md 1.2 E): POST { workspaceId, settings } saves the team's
// outcomes, their lines and the rules that decide first, cleaned the same way the worker reads them. Owners only.

const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const body = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; settings?: unknown };
  const ws = typeof body.workspaceId === "string" ? body.workspaceId : "";
  const { data: m } = ws ? await auth.sb.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", auth.user.id).maybeSingle() : { data: null };
  if (!m) return bad("Workspace not found.", 404);
  if ((m as { role: string }).role !== "owner") return bad("Only workspace owners can change qualify.", 403);
  if (!body.settings || typeof body.settings !== "object") return bad("Nothing to save.");
  const s = cleanQualify(body.settings as never);
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);
  const { error } = await db.from("qualify_settings").upsert({ workspace_id: ws, on: s.on, outcomes: s.outcomes, rules: s.rules, updated_at: new Date().toISOString() }, { onConflict: "workspace_id" });
  if (error) return bad("Couldn't save. Try again.", 500);
  await db.from("audit_log").insert({ workspace_id: ws, actor: auth.user.id, action: "qualify.settings", target: ws });
  return Response.json({ settings: s });
}
