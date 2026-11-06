import { isMember } from "@/lib/contacts/server";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// Stop sending from your own mailbox: { workspaceId }. Emails go from the team's address again.

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const b = ((await request.json().catch(() => null)) ?? {}) as { workspaceId?: unknown };
  if (!(await isMember(auth, b.workspaceId))) return Response.json({ error: "Workspace not found." }, { status: 404 });
  const db = serviceClient();
  if (!db) return Response.json({ error: "Not set up." }, { status: 503 });
  const { error } = await db.rpc("mailbox_disconnect", { p_ws: b.workspaceId, p_user: auth.user.id });
  if (error) return Response.json({ error: "Couldn't disconnect. Try again." }, { status: 500 });
  return Response.json({ ok: true });
}
