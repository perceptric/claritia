import { isUuid } from "@/lib/apiAuth";
import { bad, formsCaller } from "@/lib/hooks/v1";
import { cleanEmail, isRejected } from "@/lib/identity/clean";
import { nameCase } from "@/lib/contacts/clean";

/**
 * Add a person to a live workflow: { email, first_name?, last_name? }. The contact is found by email or made, the
 * way a form fill makes one. Answers { added: true } when a run started; false when the workflow's re-entry rules
 * kept them out or they're already in today.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await formsCaller(request);
  if ("denied" in c) return c.denied;
  const { id } = await params;
  if (!isUuid(id)) return bad("Workflow not found.", 404);
  const b = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const e = cleanEmail(b.email);
  if (isRejected(e)) return bad("Send a valid email.");
  const name = (v: unknown) => (typeof v === "string" && v.trim() ? nameCase(v.trim().slice(0, 80)) : undefined);
  const row = { email: e.raw, email_clean: e.clean, email_class: e.class, first_name: name(b.first_name), last_name: name(b.last_name) };
  const w = await c.sb.from("workflows").select("id, status").eq("id", id.toLowerCase()).eq("workspace_id", c.workspaceId).maybeSingle();
  if (!w.data) return bad("Workflow not found.", 404);
  if ((w.data as { status: string }).status !== "live") return bad("Make the workflow live first.", 409);
  const up = await c.sb.rpc("form_contact_write", { p_ws: c.workspaceId, p_row: row });
  const contact = ((up.data as { ids?: string[] } | null)?.ids ?? [])[0];
  if (up.error || !contact) return bad("Couldn't save the contact. Try again.", 500);
  const r = await c.sb.rpc("api_workflow_enter", { p_ws: c.workspaceId, p_workflow: id.toLowerCase(), p_contact: contact });
  if (r.error) return r.error.message.includes("not_live") ? bad("Make the workflow live first.", 409) : bad("Couldn't add them. Try again.", 500);
  return Response.json({ added: (r.data as number) > 0, contact_id: contact });
}
