import { cleaningCtx, isMember } from "@/lib/contacts/server";
import { queueNotify, releaseFill, type HeldFill } from "@/lib/forms/submit";
import type { Form } from "@/lib/forms/schema";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// Not spam (docs/forms-plan.md 1.1): fills held as spam become leads, through the same checks and steps as on the way
// in (src/lib/forms/submit.ts releaseFill). POST { workspaceId, ids } → { released, errors: { id: reason } }.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const b = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; ids?: unknown };
  if (!(await isMember(auth, b.workspaceId))) return Response.json({ error: "Workspace not found." }, { status: 404 });
  const ws = b.workspaceId as string;
  const ids = Array.isArray(b.ids) ? b.ids.filter((x): x is string => typeof x === "string" && UUID.test(x)).slice(0, 100) : [];
  if (!ids.length) return Response.json({ error: "Pick the fills to let through." }, { status: 400 });
  const db = serviceClient();
  if (!db) return Response.json({ error: "The server is not set up for this." }, { status: 500 });
  const { data: rows, error } = await db
    .from("submissions")
    .select("id, workspace_id, form_id, form_version, idem_key, values, consent, country, created_at, contact_id")
    .in("id", ids)
    .eq("workspace_id", ws)
    .eq("spam", true)
    .eq("test", false);
  if (error) return Response.json({ error: "Try again in a moment." }, { status: 503 });
  const fills = (rows ?? []) as (HeldFill & { form_id: string | null })[];
  const versions = new Map<string, Form>();
  for (const s of fills) {
    const k = `${s.form_id}:${s.form_version}`;
    if (!s.form_id || versions.has(k)) continue;
    const { data } = await db.from("form_versions").select("body").eq("form_id", s.form_id).eq("version", s.form_version).maybeSingle();
    if (data?.body) versions.set(k, data.body as Form);
  }
  const ctx = await cleaningCtx(db, ws);
  const rpc = (fn: string, args: Record<string, unknown>) => db.rpc(fn, args);
  let released = 0;
  const errors: Record<string, string> = {};
  for (const s of fills) {
    const body = versions.get(`${s.form_id}:${s.form_version}`);
    if (!body) {
      errors[s.id] = "The form for this fill is gone.";
      continue;
    }
    const r = await releaseFill(rpc, s, body, ctx);
    if ("error" in r) errors[s.id] = r.error;
    else {
      released++;
      // Let through, it alerts the team and replies like any submission.
      await queueNotify(rpc, ws, body, s.id);
    }
  }
  return Response.json({ released, errors });
}
