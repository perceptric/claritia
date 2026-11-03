import { isMember } from "@/lib/contacts/server";
import { prepareTable } from "@/lib/sources/dbRows";
import { createSheet, sheetFromLink } from "@/lib/sources/rows";
import { deps } from "@/lib/sources/run";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// Where a form's rows go (docs/integrations-plan.md step 2), for the form's Sync tab. Read live from the tool.
//   GET ?workspaceId=&sourceId=                                  → { targets: [{ id, name, url }] }  Airtable, Notion
//   POST { workspaceId, sourceId, action: "create", name }       → { target }  a new Google Sheet for the form
//   POST { workspaceId, sourceId, action: "link", link }         → { target }  a Google Sheet from its link
//   POST { workspaceId, sourceId, action: "table", name }        → { target }  a PostgreSQL or MySQL table, made if missing
// The caller must be in the workspace and the tool one of its connected sheets and databases.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TIMEOUT_MS = 15_000;
const bad = (error: string, status = 400) => Response.json({ error }, { status });

async function load(request: Request, ws: unknown, sourceId: unknown) {
  const auth = await requireUser(request);
  if ("denied" in auth) return { denied: auth.denied };
  if (!(await isMember(auth, ws))) return { denied: bad("Workspace not found.", 404) };
  if (typeof sourceId !== "string" || !UUID.test(sourceId)) return { denied: bad("Tool not found.", 404) };
  const db = serviceClient();
  if (!db) return { denied: bad("The server is not set up for this.", 500) };
  const { data: src } = await db.from("sources").select("id, kind, status").eq("id", sourceId).eq("workspace_id", ws as string).maybeSingle();
  if (!src || src.status === "disconnected") return { denied: bad("Tool not found.", 404) };
  const d = await deps({ rpc: (fn, args) => db.rpc(fn, args), clean: async () => ({ custom: [] }), signal: AbortSignal.timeout(TIMEOUT_MS) }, src.id);
  if (!d) return { denied: bad("Connect this tool again.", 409) };
  return { d, kind: src.kind as string };
}

const why = (e: unknown) => String((e as Error).message ?? e).slice(0, 200);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const l = await load(request, url.searchParams.get("workspaceId"), url.searchParams.get("sourceId"));
  if ("denied" in l) return l.denied;
  if (!l.d.connector.targets) return bad("This tool has nothing to pick.");
  try {
    return Response.json({ targets: (await l.d.connector.targets(l.d.ctx)).slice(0, 500) }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return Response.json({ error: `Couldn't read them: ${why(e)}` }, { headers: { "cache-control": "no-store" } });
  }
}

export async function POST(request: Request) {
  const b = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; sourceId?: unknown; action?: unknown; name?: unknown; link?: unknown };
  const l = await load(request, b.workspaceId, b.sourceId);
  if ("denied" in l) return l.denied;
  if (l.kind === "postgres" || l.kind === "mysql") {
    if (b.action !== "table" || typeof b.name !== "string") return bad("Name the table.");
    try {
      return Response.json({ target: await prepareTable(l.d.ctx, b.name.slice(0, 200)) });
    } catch (e) {
      return bad(why(e), 502);
    }
  }
  if (l.kind !== "google_sheets") return bad("Pick one from the list.");
  try {
    if (b.action === "create") return Response.json({ target: await createSheet(l.d.ctx, typeof b.name === "string" ? b.name.trim() : "") });
    if (b.action === "link" && typeof b.link === "string") return Response.json({ target: await sheetFromLink(l.d.ctx, b.link.trim().slice(0, 1000)) });
    return bad("Make a new sheet or paste one's link.");
  } catch (e) {
    return bad(why(e), 502);
  }
}
