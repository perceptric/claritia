import { formsCaller } from "@/lib/hooks/v1";

/** The key's workspace: what an app shows as the connected account. */
export async function GET(request: Request) {
  const c = await formsCaller(request);
  if ("denied" in c) return c.denied;
  const { data, error } = await c.sb.from("workspaces").select("id, name").eq("id", c.workspaceId).maybeSingle();
  if (error || !data) return Response.json({ error: "Workspace not found." }, { status: 404 });
  return Response.json({ workspace: data, app: c.via });
}
