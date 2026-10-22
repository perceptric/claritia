import { cleaningCtx, isMember } from "@/lib/contacts/server";
import { checkForm } from "@/lib/forms/schema";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// Publish a form's draft: POST { workspaceId, id }. The draft is checked against the schema and the workspace's
// fields first; only a clean copy goes live (docs/form-builder.md Part 3).

const bad = (error: string, status = 400, extra: object = {}) => Response.json({ error, ...extra }, { status });

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const body = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; id?: unknown };
  if (!(await isMember(auth, body.workspaceId))) return bad("Workspace not found.", 404);
  if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/.test(body.id)) return bad("Form not found.", 404);
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);
  const { data: form } = await db.from("forms").select("id, draft").eq("id", body.id).eq("workspace_id", body.workspaceId as string).maybeSingle();
  if (!form) return bad("Form not found.", 404);
  const ctx = await cleaningCtx(db, body.workspaceId as string);
  const r = checkForm(form.draft, { custom: ctx.custom });
  if ("errors" in r) return bad(r.errors[0], 400, { errors: r.errors });
  const { data, error } = await db.rpc("form_publish", { p_id: body.id, p_user: auth.user.id, p_body: r.form });
  if (error) return bad(error.message, 500);
  return Response.json({ version: data as number });
}
