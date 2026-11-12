import { parsePeople } from "@/lib/emails/people";
import { requireUser, roleIn } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// Add pasted people to a list (docs/email-studio-plan.md Part 4): POST { workspaceId, listId, text, consent }. One
// person a line: "email, first name, last name" (commas or tabs). New people are made, known ones keep their details;
// with consent, each gets opt-in consent from this import. Without it their consent isn't touched: someone who
// already agreed stays agreed, and a new person has no lawful basis, so marketing email skips them until they agree
// (email_guard). Up to 2,000 lines at a time.

const UUID = /^[0-9a-f-]{36}$/;
const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const b = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; listId?: unknown; text?: unknown; consent?: unknown };
  const ws = typeof b.workspaceId === "string" && UUID.test(b.workspaceId) ? b.workspaceId : null;
  const list = typeof b.listId === "string" && UUID.test(b.listId) ? b.listId : null;
  if (!ws || !list) return bad("List not found.", 404);
  if (!(await roleIn(auth, ws))) return bad("Workspace not found.", 404);
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);
  const { rows, skipped } = parsePeople(typeof b.text === "string" ? b.text.slice(0, 400_000) : "");
  if (!rows.length) return bad("Add one email a line.");
  if (rows.length > 2000) return bad("Add up to 2,000 people at a time.");
  const owns = await db.from("lists").select("id").eq("id", list).eq("workspace_id", ws).maybeSingle();
  if (!owns.data) return bad("List not found.", 404);
  const consent = b.consent === true;
  const { data, error } = await db.rpc("contacts_upsert", { p_ws: ws, p_source: "import", p_rows: rows.map((r) => (consent ? { ...r, basis: "opt_in" } : r)) });
  if (error) return bad(error.message, 500);
  const ids = ((data as { ids?: string[] } | null)?.ids ?? []).filter((x) => UUID.test(x));
  if (ids.length) {
    const { error: e2 } = await db.from("list_members").upsert(ids.map((contact_id) => ({ list_id: list, contact_id, workspace_id: ws })), { onConflict: "list_id,contact_id", ignoreDuplicates: true });
    if (e2) return bad(e2.message, 500);
  }
  return Response.json({ added: ids.length, created: (data as { created?: number } | null)?.created ?? 0, skipped });
}
