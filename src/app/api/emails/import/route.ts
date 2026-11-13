import { cleanPeople, parsePeople, type Given, type Pasted } from "@/lib/emails/people";
import { requireUser, roleIn } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// Add people to a list (docs/email-studio-plan.md Parts 4 and 10, and step 2 of the Brew comparison): POST
// { workspaceId, listId, consent, text } with people pasted one a line, or { ..., rows, fileName } with people from a
// CSV file matched in the browser (src/lib/emails/csv.ts). New people are made, known ones keep their details; with
// consent, each gets opt-in consent from this import. Without it their consent isn't touched: someone who already
// agreed stays agreed, and a new person has no lawful basis, so marketing email skips them until they agree
// (email_guard). Throwaway addresses are left out and shared inboxes counted. Up to 5,000 people at a time, added in
// batches of 1,000; each import is kept in contact_import_log (157). Without consent, only an owner adds people at
// once; anyone else's import waits for an owner (contact_imports, 155), who answers with
// POST { workspaceId, importId, action: "add" | "discard" }.

const UUID = /^[0-9a-f-]{36}$/;
const MAX = 5000;
const BATCH = 1000;
const bad = (error: string, status = 400) => Response.json({ error }, { status });
type Db = NonNullable<ReturnType<typeof serviceClient>>;

async function addPeople(db: Db, ws: string, list: string | null, rows: Pasted[], consent: boolean): Promise<{ added: number; created: number } | { error: string }> {
  let added = 0;
  let created = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const part = rows.slice(i, i + BATCH);
    const { data, error } = await db.rpc("contacts_upsert", { p_ws: ws, p_source: "import", p_rows: part.map((r) => (consent ? { ...r, basis: "opt_in" } : r)) });
    if (error) return { error: added ? `Added ${added.toLocaleString("en-US")}, then: ${error.message}` : error.message };
    const ids = ((data as { ids?: string[] } | null)?.ids ?? []).filter((x) => UUID.test(x));
    if (ids.length && list) {
      const { error: e2 } = await db.from("list_members").upsert(ids.map((contact_id) => ({ list_id: list, contact_id, workspace_id: ws })), { onConflict: "list_id,contact_id", ignoreDuplicates: true });
      if (e2) return { error: e2.message };
    }
    added += ids.length;
    created += (data as { created?: number } | null)?.created ?? 0;
  }
  return { added, created };
}

/** The history row. A failed write never undoes the import, so it's best effort. */
async function logImport(db: Db, row: Record<string, unknown>) {
  await db.from("contact_import_log").insert(row);
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const b = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; listId?: unknown; text?: unknown; rows?: unknown; fileName?: unknown; consent?: unknown; importId?: unknown; action?: unknown };
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
    const held = await db.from("contact_imports").select("id, list_id, people, file_name").eq("id", b.importId).eq("workspace_id", ws).maybeSingle();
    if (held.error) return bad(held.error.message, 500);
    if (!held.data) return bad("Import not found.", 404);
    const h = held.data as { id: string; list_id: string; people: Pasted[]; file_name: string };
    let added = 0;
    if (b.action === "add") {
      const r = await addPeople(db, ws, h.list_id, h.people, false);
      if ("error" in r) return bad(r.error, 500);
      added = r.added;
      const ln = await db.from("lists").select("name").eq("id", h.list_id).maybeSingle();
      await logImport(db, { workspace_id: ws, list_id: h.list_id, list_name: (ln.data as { name?: string } | null)?.name ?? "", file_name: h.file_name, rows_in: h.people.length, added: r.added, created: r.created, created_by: auth.user.id });
    }
    const { error } = await db.from("contact_imports").delete().eq("id", h.id).eq("workspace_id", ws);
    if (error) return bad(error.message, 500);
    return Response.json({ added });
  }

  const list = typeof b.listId === "string" && UUID.test(b.listId) ? b.listId : null;
  // Audiences' Add person (docs/email-unify-plan.md, E2): one person, on a list or on no list at all.
  const one = Array.isArray(b.rows) && b.rows.length === 1;
  if (!list && !one) return bad("List not found.", 404);
  const fileName = typeof b.fileName === "string" ? b.fileName.trim().slice(0, 200) : "";
  const given = Array.isArray(b.rows) ? (b.rows as Given[]) : null;
  if (given && given.length > MAX) return bad("Import up to 5,000 people at a time.");
  const { rows, skipped, disposable, role: shared } = given ? cleanPeople(given.filter((g) => g && typeof g === "object")) : parsePeople(typeof b.text === "string" ? b.text.slice(0, 1_000_000) : "");
  if (!rows.length) return bad(disposable ? "Those are all throwaway addresses." : given ? "No emails in that column. Check which column holds the email." : "Add one email a line.");
  if (rows.length > MAX) return bad("Import up to 5,000 people at a time.");
  const owns = list ? await db.from("lists").select("id, name").eq("id", list).eq("workspace_id", ws).maybeSingle() : null;
  if (list && !owns?.data) return bad("List not found.", 404);
  const listName = (owns?.data as { name: string } | undefined)?.name ?? "";
  const consent = b.consent === true;
  if (!list && !consent && role !== "owner") return bad("Tick that they agreed to get email, or ask an owner to add them.", 403);
  const rowsIn = given?.length ?? rows.length + skipped + disposable;
  if (!consent && role !== "owner") {
    const { error } = await db.from("contact_imports").insert({ workspace_id: ws, list_id: list, people: rows, file_name: fileName, created_by: auth.user.id });
    if (error) return bad(error.message, 500);
    await logImport(db, { workspace_id: ws, list_id: list, list_name: listName, file_name: fileName, rows_in: rowsIn, skipped, disposable, shared, held: rows.length, created_by: auth.user.id });
    return Response.json({ added: 0, held: rows.length, skipped, disposable, shared });
  }
  const r = await addPeople(db, ws, list, rows, consent);
  if ("error" in r) return bad(r.error, 500);
  await logImport(db, { workspace_id: ws, list_id: list, list_name: listName, file_name: fileName, rows_in: rowsIn, added: r.added, created: r.created, skipped, disposable, shared, consent, created_by: auth.user.id });
  return Response.json({ ...r, held: 0, skipped, disposable, shared });
}
