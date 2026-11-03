import { isMember } from "@/lib/contacts/server";
import { deps } from "@/lib/sources/run";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// A connected email tool's lists (audiences, forms, groups), for the form's Sync tab (docs/integrations-plan.md step
// 1): GET ?workspaceId=&sourceId= → { lists: [{ id, name }] } or { error }. Read live from the tool. The caller must
// be in the workspace and the tool one of its connected email tools.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TIMEOUT_MS = 10_000;

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const url = new URL(request.url);
  const ws = url.searchParams.get("workspaceId") ?? "";
  const sourceId = url.searchParams.get("sourceId") ?? "";
  if (!(await isMember(auth, ws))) return Response.json({ error: "Workspace not found." }, { status: 404 });
  if (!UUID.test(sourceId)) return Response.json({ error: "Tool not found." }, { status: 404 });
  const db = serviceClient();
  if (!db) return Response.json({ error: "The server is not set up for this." }, { status: 500 });
  const { data: src } = await db.from("sources").select("id, kind, status").eq("id", sourceId).eq("workspace_id", ws).maybeSingle();
  if (!src || src.status === "disconnected") return Response.json({ error: "Tool not found." }, { status: 404 });
  try {
    const d = await deps({ rpc: (fn, args) => db.rpc(fn, args), clean: async () => ({ custom: [] }), signal: AbortSignal.timeout(TIMEOUT_MS) }, src.id);
    if (!d) return Response.json({ error: "Connect this tool again to read its lists." }, { status: 409 });
    if (!d.connector.audiences) return Response.json({ error: "This tool has no lists." }, { status: 400 });
    const lists = (await d.connector.audiences(d.ctx)).slice(0, 500);
    return Response.json({ lists }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    // A failed read is an answer the picker shows.
    return Response.json({ error: `Couldn't read the lists: ${String((e as Error).message ?? e).slice(0, 200)}` }, { headers: { "cache-control": "no-store" } });
  }
}
