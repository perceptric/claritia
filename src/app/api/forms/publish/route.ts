import { cleaningCtx, isMember } from "@/lib/contacts/server";
import { checkForm } from "@/lib/forms/schema";
import { forgetPublic } from "@/lib/forms/server";
import { forgetFields } from "@/lib/router/actions";
import { publishFormRouting } from "@/lib/routing/formPublish";
import { forgetScoring } from "@/lib/scoring/actions";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// Publish a form's draft: POST { workspaceId, id }. The draft is checked against the schema and the workspace's
// fields first; only a clean copy goes live (docs/form-builder.md Part 3). Its routing goes live with it
// (src/lib/routing/formPublish.ts): the answer says what was left out, or why the routing didn't go.

const bad = (error: string, status = 400, extra: object = {}) => Response.json({ error, ...extra }, { status });

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const body = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; id?: unknown };
  if (!(await isMember(auth, body.workspaceId))) return bad("Workspace not found.", 404);
  if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/.test(body.id)) return bad("Form not found.", 404);
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);
  const { data: form } = await db.from("forms").select("id, name, draft").eq("id", body.id).eq("workspace_id", body.workspaceId as string).maybeSingle();
  if (!form) return bad("Form not found.", 404);
  const ctx = await cleaningCtx(db, body.workspaceId as string);
  const r = checkForm(form.draft, { custom: ctx.custom });
  if ("errors" in r) return bad(r.errors[0], 400, { errors: r.errors });
  const { data, error } = await db.rpc("form_publish", { p_id: body.id, p_user: auth.user.id, p_body: r.form });
  if (error) return bad(error.message, 500);
  // The new version shows at once on this server (others read it again within 10 seconds, or on the first send).
  forgetPublic(body.id);
  // Routing's field list and Scoring's context include the form's questions.
  forgetFields(body.workspaceId as string);
  forgetScoring(body.workspaceId as string);
  const routing = await publishFormRouting((f, args) => db.rpc(f, args), db, { ws: body.workspaceId as string, user: auth.user.id, formId: body.id, formName: (form.name as string) ?? "Form", schedule: r.form.after.schedule })
    .then((x) => ({ problems: x.problems }))
    .catch((e: unknown) => ({ problems: [] as string[], error: e instanceof Error ? e.message : "Couldn't publish the routing." }));
  return Response.json({ version: data as number, routing });
}
