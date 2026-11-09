import { GUEST_KEY, guestKeyHash } from "@/lib/forms/guest";
import { allowed, clientIp } from "@/lib/forms/server";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// Claim a form made from chat before signing up (/claim/<key>, 142_guest_forms.sql): the person signed in becomes its
// workspace's owner. Answers the workspace and the form to open.

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  if (!allowed(`claim:${clientIp(request)}`, 20)) return Response.json({ error: "Too many tries. Wait a minute." }, { status: 429 });
  const b = ((await request.json().catch(() => null)) ?? {}) as { key?: unknown };
  const key = typeof b.key === "string" ? b.key.trim() : "";
  if (!GUEST_KEY.test(key)) return Response.json({ error: "This claim link isn't right." }, { status: 400 });
  const db = serviceClient();
  if (!db) return Response.json({ error: "Not set up." }, { status: 503 });
  const { data, error } = await db.rpc("guest_claim", { p_token_hash: guestKeyHash(key), p_user: auth.user.id });
  if (error) return Response.json({ error: "Couldn't claim the form. Try again." }, { status: 500 });
  const r = data as { workspace_id?: string; form_id?: string } | null;
  if (!r?.workspace_id) return Response.json({ error: "This form was already claimed, or the link isn't right." }, { status: 404 });
  return Response.json({ workspaceId: r.workspace_id, formId: r.form_id ?? null });
}
