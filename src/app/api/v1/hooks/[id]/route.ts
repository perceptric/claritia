import { isUuid } from "@/lib/apiAuth";
import { bad, formsCaller } from "@/lib/hooks/v1";

/** Unsubscribe a hook. A hook already gone answers 200 too, so an app's retry never fails. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await formsCaller(request);
  if ("denied" in c) return c.denied;
  const { id } = await params;
  if (!isUuid(id)) return bad("Hook not found.", 404);
  const { data, error } = await c.sb.rpc("api_hook_remove", { p_ws: c.workspaceId, p_id: id.toLowerCase() });
  if (error) return bad("Couldn't remove the hook. Try again.", 500);
  return Response.json({ removed: data === true });
}
