import { cleaningCtx, isMember } from "@/lib/contacts/server";
import { allFields, checkForm, unsetConstants } from "@/lib/forms/schema";
import { forgetPublic } from "@/lib/forms/server";
import { publishLocks } from "@/lib/forms/planLocks";
import { readPlan } from "@/lib/planGate";
import { forgetFields } from "@/lib/router/actions";
import { publishFormRouting } from "@/lib/routing/formPublish";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";
import { isUuid } from "@/lib/uuid";

// Publish a form's draft: POST { workspaceId, id }. The draft is checked against the schema and the workspace's
// fields first; only a clean copy goes live (docs/form-builder.md Part 3). Its routing goes live with it
// (src/lib/routing/formPublish.ts): the answer says what was left out, or why the routing didn't go. Signatures and
// payments are on Starter and up (402 with the line below it); routing by answer on Pro and up: below it the routing
// goes live without its conditions, and the answer says so (src/lib/forms/planLocks.ts).

const bad = (error: string, status = 400, extra: object = {}) => Response.json({ error, ...extra }, { status });

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const body = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; id?: unknown };
  if (!(await isMember(auth, body.workspaceId))) return bad("Workspace not found.", 404);
  if (typeof body.id !== "string" || !isUuid(body.id)) return bad("Form not found.", 404);
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);
  const { data: form } = await db.from("forms").select("id, name, draft").eq("id", body.id).eq("workspace_id", body.workspaceId as string).maybeSingle();
  if (!form) return bad("Form not found.", 404);
  const ctx = await cleaningCtx(db, body.workspaceId as string);
  const r = checkForm(form.draft, { custom: ctx.custom });
  if ("errors" in r) return bad(r.errors[0], 400, { errors: r.errors });
  // A price or rate left blank would make every result empty; the owner sets it first.
  const unset = unsetConstants(r.form).map((c) => `Set ${c.name} before publishing.`);
  if (unset.length) return bad(unset[0], 400, { errors: unset });
  // A form that takes payment needs the workspace's Stripe account connected and ready (Settings, Payments).
  if (allFields(r.form).some((f) => f.type === "payment")) {
    const acct = (await db.from("payment_accounts").select("ready").eq("workspace_id", body.workspaceId as string).maybeSingle()).data as { ready?: boolean } | null;
    if (!acct?.ready) return bad("Connect Stripe in Settings, Payments before publishing a form that takes payment.", 400, { errors: ["Connect Stripe before publishing a form that takes payment."] });
  }
  const locks = publishLocks(r.form, await readPlan((fn, args) => db.rpc(fn, args), body.workspaceId as string));
  if (locks.refuse.length) return bad(locks.refuse[0]!, 402, { errors: locks.refuse });
  const { data, error } = await db.rpc("form_publish", { p_id: body.id, p_user: auth.user.id, p_body: r.form });
  if (error) return bad(error.message, 500);
  // The new version shows at once on this server (others read it again within 10 seconds, or on the first send).
  forgetPublic(body.id);
  // Routing's field list includes the form's questions.
  forgetFields(body.workspaceId as string);
  const schedule = r.form.after.schedule && !locks.routing ? { ...r.form.after.schedule, routes: [] } : r.form.after.schedule;
  const routing = await publishFormRouting((f, args) => db.rpc(f, args), db, { ws: body.workspaceId as string, user: auth.user.id, formId: body.id, formName: (form.name as string) ?? "Form", schedule })
    .then((x) => ({ problems: x.problems, ...(locks.note ? { locked: locks.note } : {}) }))
    .catch((e: unknown) => ({ problems: [] as string[], error: e instanceof Error ? e.message : "Couldn't publish the routing." }));
  return Response.json({ version: data as number, routing });
}
