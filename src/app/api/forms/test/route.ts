import { randomBytes } from "node:crypto";
import { cleaningCtx, isMember } from "@/lib/contacts/server";
import { sampleAnswers } from "@/lib/forms/sample";
import { loadPublic } from "@/lib/forms/server";
import { prepareSubmit } from "@/lib/forms/submit";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// The Test button: POST { workspaceId, id }. Sends a fill marked as a test through the live version and every
// destination (docs/form-builder.md Part 10). The app then watches its deliveries turn green or red.

const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const b = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; id?: unknown };
  if (!(await isMember(auth, b.workspaceId))) return bad("Workspace not found.", 404);
  if (typeof b.id !== "string" || !/^[0-9a-f-]{36}$/.test(b.id)) return bad("Form not found.", 404);
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);
  const f = await loadPublic(db, b.id, true);
  if (!f || f.workspace_id !== b.workspaceId) return bad("Publish the form first.");
  const ctx = await cleaningCtx(db, f.workspace_id);
  const domain = ctx.own_domains?.[0] || "example.com";
  const tag = randomBytes(4).toString("hex");
  const key = `test_${randomBytes(16).toString("base64url")}`;
  const r = prepareSubmit(f.body, f.version, { v: 1, version: f.version, key, answers: sampleAnswers(f.body, `test+${tag}@${domain}`), ms: 60_000, consent: { given: true } }, ctx);
  if (!("args" in r)) return bad("errors" in r ? `The test lead didn't pass the form's own checks: ${Object.values(r.errors)[0]}` : r.error);
  const { data, error } = await db.rpc("form_submit", { p_form: b.id, ...r.args, p_test: true });
  if (error) return bad(error.message);
  return Response.json({ id: (data as { id: string }).id });
}
