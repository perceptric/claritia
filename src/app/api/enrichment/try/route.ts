import { lookupEmail } from "@/lib/enrich/server";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// Enrichment › Providers › Try an email (docs/enrich-workflows-reports.md 1.3): POST { workspaceId, email } runs the
// whole waterfall on one address and answers each step's result with what was found. Workspace owners only, since a
// lookup can use a credit. Nothing is written to a contact.

const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const body = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; email?: unknown };
  const ws = typeof body.workspaceId === "string" ? body.workspaceId : "";
  const { data: m } = ws ? await auth.sb.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", auth.user.id).maybeSingle() : { data: null };
  if (!m) return bad("Workspace not found.", 404);
  if ((m as { role: string }).role !== "owner") return bad("Only workspace owners can run lookups.", 403);
  const email = typeof body.email === "string" ? body.email.trim().slice(0, 254) : "";
  if (!email.includes("@")) return bad("Type a work email, like dana@acme.com.");
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);
  const rpc = (fn: string, args: Record<string, unknown>) => db.rpc(fn, args);
  try {
    const started = Date.now();
    const e = await lookupEmail(rpc, ws, email, { budgetMs: 8000 });
    if (!e) return bad("That isn't an email address Claritia can look up.");
    await db.rpc("enrich_run_log", { p_ws: ws, p_contact: null, p_trigger: "try", p_steps: e.steps, p_fields: [], p_credits: e.credits, p_ms: Date.now() - started });
    return Response.json({ person: e.person, company: e.company, steps: e.steps, credits: e.credits, check: e.check });
  } catch {
    return bad("The lookup failed. Try again in a moment.", 502);
  }
}
