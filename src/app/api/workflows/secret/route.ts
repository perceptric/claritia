import { requireUser } from "@/lib/serverAuth";
import { webhookSecret } from "@/lib/workflows/facts";

// A workflow's webhook signing secret (docs/enrich-workflows-reports.md 2.2), for the receiver to check
// x-claritia-signature. Made from SECRETS_KEY and the workflow, so nothing is stored. Members of its workspace only.

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const b = (await request.json().catch(() => ({}))) as { workflowId?: unknown };
  const id = typeof b.workflowId === "string" && /^[0-9a-f-]{36}$/.test(b.workflowId) ? b.workflowId : "";
  const { data: w } = await auth.sb.from("workflows").select("id").eq("id", id).maybeSingle();
  if (!w) return Response.json({ error: "Workflow not found." }, { status: 404 });
  if (!process.env.SECRETS_KEY) return Response.json({ error: "The server is not set up for this." }, { status: 500 });
  return Response.json({ secret: webhookSecret(id) });
}
