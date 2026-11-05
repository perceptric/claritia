import { formsCaller } from "@/lib/hooks/v1";

/** The workspace's forms, newest first: for an app's form picker. */
export async function GET(request: Request) {
  const c = await formsCaller(request);
  if ("denied" in c) return c.denied;
  const { data, error } = await c.sb.from("forms").select("id, name, status, created_at").eq("workspace_id", c.workspaceId).order("created_at", { ascending: false }).limit(500);
  if (error) return Response.json({ error: "Couldn't read the forms. Try again." }, { status: 500 });
  return Response.json({ forms: data ?? [] });
}
