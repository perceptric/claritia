import { parsePeople, type Pasted } from "@/lib/emails/people";
import { requireUser, roleIn } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// Add pasted people to a list (docs/email-studio-plan.md Parts 4 and 10): POST { workspaceId, listId, text, consent }.
// One person a line: "email, first name, last name" (commas or tabs). New people are made, known ones keep their
// details; with consent, each gets opt-in consent from this import. Without it their consent isn't touched: someone who
// already agreed stays agreed, and a new person has no lawful basis, so marketing email skips them until they agree
// (email_guard). Throwaway addresses are left out and shared inboxes counted. Up to 2,000 lines at a time.
// Without consent, only an owner adds people at once; anyone else's import waits for an owner (contact_imports, 155),
// who answers with POST { workspaceId, importId, action: "add" | "discard" }.

const UUID = /^[0-9a-f-]{36}$/;
const bad = (error: string, status = 400) => Response.json({ error }, { status });
type Db = NonNullable<ReturnType<typeof serviceClient>>;

async function addPeople(db: Db, ws: string, list: string, rows: Pasted[], consent: boolean): Promise<{ added: number; created: number } | { error: string }> {
  const { data, error } = await db.rpc("contacts_upsert", { p_ws: ws, p_source: "import", p_rows: rows.map((r) => (consent ? { ...r, basis: "opt_in" } : r)) });
  if (error) return { error: error.message };
  const ids = ((data as { ids?: string[] } | null)?.ids ?? []).filter((x) => UUID.test(x));
  if (ids.length) {
    const { error: e2 } = await db.from("list_members").upsert(ids.map((contact_id) => ({ list_id: list, contact_id, workspace_id: ws })), { onConflict: "list_id,contact_id", ignoreDuplicates: true });
    if (e2) return { error: e2.message };
  }
  return { added: ids.length, created: (data as { created?: number } | null)?.created ?? 0 };
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const b = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; listId?: unknown; text?: unknown; consent?: unknown; importId?: unknown; action?: unknown };
  const ws = typeof b.workspaceId === "string" && UUID.test(b.workspaceId) ? b.workspaceId : null;
  if (!ws) return bad("Workspace not found.", 404);
  const role = await roleIn(auth, ws);
  if (!role) return bad("Workspace not found.", 404);
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);

  // An owner answers an import that waits.
  if (typeof b.importId === "string") {
    if (role !== "owner") return bad("Only an owner can add these people.", 403);
    if (!UUID.test(b.importId) || (b.action !== "add" && b.action !== "discard")) return bad("Import not found.", 404);
    const held = await db.from("contact_imports").select("id, list_id, people").eq("id", b.importId).eq("workspace_id", ws).maybeSingle();
    if (held.error) return bad(held.error.message, 500);
    if (!held.data) return bad("Import not found.", 404);
    const h = held.data as { id: string; list_id: string; people: Pasted[] };
    let added = 0;
    if (b.action === "add") {
      const r = await addPeople(db, ws, h.list_id, h.people, false);
      if ("error" in r) return bad(r.error, 500);
      added = r.added;
    }
    const { error } = await db.from("contact_imports").delete().eq("id", h.id).eq("workspace_id", ws);
    if (error) return bad(error.message, 500);
    return Response.json({ added });
  }

  const list = typeof b.listId === "string" && UUID.test(b.listId) ? b.listId : null;
  if (!list) return bad("List not found.", 404);
  const { rows, skipped, disposable, role: shared } = parsePeople(typeof b.text === "string" ? b.text.slice(0, 400_000) : "");
  if (!rows.length) return bad(disposable ? "Those are all throwaway addresses." : "Add one email a line.");
  if (rows.length > 2000) return bad("Add up to 2,000 people at a time.");
  const owns = await db.from("lists").select("id").eq("id", list).eq("workspace_id", ws).maybeSingle();
  if (!owns.data) return bad("List not found.", 404);
  const consent = b.consent === true;
  if (!consent && role !== "owner") {
    const { error } = await db.from("contact_imports").insert({ workspace_id: ws, list_id: list, people: rows, created_by: auth.user.id });
    if (error) return bad(error.message, 500);
    return Response.json({ added: 0, held: rows.length, skipped, disposable, shared });
  }
  const r = await addPeople(db, ws, list, rows, consent);
  if ("error" in r) return bad(r.error, 500);
  return Response.json({ ...r, held: 0, skipped, disposable, shared });
}
