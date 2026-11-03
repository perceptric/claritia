import { isMember } from "@/lib/contacts/server";
import { isCrmVendor, propertyError, readProperties } from "@/lib/sources/properties";
import { deps } from "@/lib/sources/run";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// A connected CRM's contact fields, for a form field's Data tab (docs/form-studio.md 2.1):
// GET ?workspaceId=&sourceId=[&fresh=1] → { properties: [{ name, label, kind, options?, readOnly?, objects? }] } or
// { error }. Read live from the CRM and kept 10 minutes per source (src/lib/sources/properties.ts). The caller must
// be in the workspace, and the source must be one of its connected CRMs.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Long enough for a slow CRM, short enough that the picker never hangs.
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
  if (!isCrmVendor(src.kind)) return Response.json({ error: "This tool has no fields to link." }, { status: 400 });
  try {
    const d = await deps({ rpc: (fn, args) => db.rpc(fn, args), clean: async () => ({ custom: [] }), signal: AbortSignal.timeout(TIMEOUT_MS) }, src.id);
    if (!d) return Response.json({ error: "Connect this tool again to read its fields." }, { status: 409 });
    const r = await readProperties(d.ctx, { fresh: url.searchParams.get("fresh") === "1" });
    // A failed read is an answer the picker shows, not a failed request: the form still saves.
    return Response.json(r, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return Response.json({ error: propertyError(src.kind, e) }, { headers: { "cache-control": "no-store" } });
  }
}
