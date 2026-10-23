import type { Rpc } from "@/lib/jobs";
import { CalendarRefused, type Caller } from "@/lib/meetings/providers/connect";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// The signed-in routes under /api/calendar: the caller signs in and names a workspace they're in; the work runs with
// the service client after the checks in src/lib/meetings/providers/connect.ts. Refusals go back with their status.

export async function asCaller(request: Request, fn: (rpc: Rpc, c: Caller, body: Record<string, unknown>) => Promise<object>): Promise<Response> {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const ws = typeof body.workspaceId === "string" && /^[0-9a-f-]{36}$/.test(body.workspaceId) ? body.workspaceId : "";
  const { data: member } = ws ? await auth.sb.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", auth.user.id).maybeSingle() : { data: null };
  if (!member) return Response.json({ error: "Workspace not found." }, { status: 404 });
  const db = serviceClient();
  if (!db) return Response.json({ error: "The server is not set up for this." }, { status: 500 });
  const rpc: Rpc = (f, args) => db.rpc(f, args);
  try {
    return Response.json(await fn(rpc, { ws, user: auth.user.id, role: member.role === "owner" ? "owner" : "member", email: auth.user.email ?? undefined }, body));
  } catch (e) {
    if (e instanceof CalendarRefused) return Response.json({ error: e.message }, { status: e.status });
    return Response.json({ error: e instanceof Error ? e.message.slice(0, 300) : "Something went wrong." }, { status: 502 });
  }
}
