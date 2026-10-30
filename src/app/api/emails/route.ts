import type { Rpc } from "@/lib/jobs";
import { linkBase } from "@/lib/email/render";
import { Refused, type Caller } from "@/lib/router/actions";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";
import * as J from "@/lib/workflows/journeys";

// Emails › Journeys (docs/email-plan.md Part 8): POST { workspaceId, action }. "load" reads the build screen's facts
// and the journeys this workspace can run; "build" makes the ones that aren't there yet (owners).

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const ws = typeof body.workspaceId === "string" && /^[0-9a-f-]{36}$/.test(body.workspaceId) ? body.workspaceId : "";
  const { data: member } = ws ? await auth.sb.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", auth.user.id).maybeSingle() : { data: null };
  if (!member) return Response.json({ error: "Workspace not found." }, { status: 404 });
  const db = serviceClient();
  if (!db) return Response.json({ error: "The server is not set up for this." }, { status: 500 });
  const rpc: Rpc = (f, args) => db.rpc(f, args);
  const c: Caller = { ws, user: auth.user.id, role: member.role === "owner" ? "owner" : "member" };
  try {
    if (body.action === "load") return Response.json(await J.load(rpc, db, c, linkBase()));
    if (body.action === "build") return Response.json(await J.build(rpc, db, c, { base: linkBase(), ai: (await import("@/lib/forms/claude")).claudeChat() }));
    throw new Refused(400, "Unknown action.");
  } catch (e) {
    if (e instanceof Refused) return Response.json({ error: e.message }, { status: e.status });
    return Response.json({ error: e instanceof Error ? e.message.slice(0, 300) : "Something went wrong." }, { status: 502 });
  }
}
