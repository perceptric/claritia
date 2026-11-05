import { formsCaller } from "@/lib/hooks/v1";

/** The workspace's live workflows: for an app's "Add contact to workflow" picker. */
export async function GET(request: Request) {
  const c = await formsCaller(request);
  if ("denied" in c) return c.denied;
  const { data, error } = await c.sb.from("workflows").select("id, name").eq("workspace_id", c.workspaceId).eq("status", "live").order("name").limit(500);
  if (error) return Response.json({ error: "Couldn't read the workflows. Try again." }, { status: 500 });
  return Response.json({ workflows: data ?? [] });
}
