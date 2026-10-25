import { briefDomains, claudeDrafter, draftSteps } from "@/lib/nurture/draft";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// AI drafts for a workflow's emails (docs/enrich-workflows-reports.md 2.2): POST { workspaceId, brief, count,
// existing } answers that many emails written from the brief only, with what a person should check. Nothing is
// saved: the editor adds them unapproved, and a person approves each one. Answers go through the step cache.

const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return bad("AI isn't set up on the server.", 503);
  const b = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; brief?: unknown; count?: unknown; existing?: unknown };
  const ws = typeof b.workspaceId === "string" ? b.workspaceId : "";
  const { data: m } = ws ? await auth.sb.from("workspace_members").select("role, workspaces(name)").eq("workspace_id", ws).eq("user_id", auth.user.id).maybeSingle() : { data: null };
  if (!m) return bad("Workspace not found.", 404);
  const brief = typeof b.brief === "string" ? b.brief.trim().slice(0, 4000) : "";
  if (brief.length < 40) return bad("Write a brief first: who it's for, what you offer, and what's true about it.");
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);
  const { data: sites } = await db.from("sites").select("domain, extra_domains").eq("workspace_id", ws);
  const domains = [...new Set([...(sites ?? []).flatMap((s) => [s.domain, ...(s.extra_domains ?? [])]), ...briefDomains(brief)])];
  const existing = (Array.isArray(b.existing) ? b.existing : []).slice(0, 20).map((e) => ({ subject: String((e as { subject?: unknown }).subject ?? "").slice(0, 200), text: String((e as { text?: unknown }).text ?? "").slice(0, 4000) }));
  try {
    const out = await draftSteps((fn, args) => db.rpc(fn, args), claudeDrafter(apiKey), ws, {
      workspace: (m.workspaces as unknown as { name: string } | null)?.name ?? "",
      brief,
      domains,
      existing,
      count: Math.max(1, Math.min(6, Math.round(Number(b.count) || 1))),
      replace: null,
    });
    return Response.json({ steps: out.steps, cached: out.cached });
  } catch {
    return bad("The AI didn't answer. Try again in a moment.", 502);
  }
}
