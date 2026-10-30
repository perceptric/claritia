import { ttlCache } from "@/lib/roleCache";
import { deps } from "@/lib/sources/run";
import { requireUser, roleIn } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

type Crm = { source: string; kind: string; owners: { id: string; label: string }[]; error?: string };

// A CRM's users change rarely: kept 10 minutes per workspace in this process. A list with an error isn't kept.
const kept = ttlCache<Crm[]>({ ttlMs: 10 * 60_000, max: 500 });
const LIMIT_MS = 15_000;

// The CRM's users who can own a contact, for lead routing: GET ?workspaceId=. Every connected CRM that can list
// them, as [{ source, kind, owners: [{ id, label }] }]. The CRMs are asked side by side, 15 s at most.
export async function GET(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const ws = new URL(request.url).searchParams.get("workspaceId") ?? "";
  if (!(await roleIn(auth, ws))) return Response.json({ error: "Workspace not found." }, { status: 404 });
  const db = serviceClient();
  if (!db) return Response.json({ error: "The server is not set up for this." }, { status: 500 });
  const read = async (): Promise<Crm[]> => {
    const { data: sources } = await db.from("sources").select("id, kind, name").eq("workspace_id", ws).in("kind", ["hubspot", "salesforce"]).neq("status", "disconnected");
    const signal = AbortSignal.timeout(LIMIT_MS);
    const out = await Promise.all(
      (sources ?? []).map(async (s): Promise<Crm | null> => {
        try {
          const d = await deps({ rpc: (fn, args) => db.rpc(fn, args), clean: async () => ({ custom: [] }), signal }, s.id);
          if (!d?.connector.owners) return null;
          return { source: s.name, kind: s.kind, owners: await d.connector.owners(d.ctx) };
        } catch (e) {
          const m = String((e as Error).message);
          return { source: s.name, kind: s.kind, owners: [], error: signal.aborted ? `${s.name} took too long. Try again.` : /403|scope|permission/i.test(m) ? `Reconnect ${s.name} to list its owners.` : m.slice(0, 200) };
        }
      }),
    );
    const crms = out.filter((x): x is Crm => !!x);
    if (crms.some((c) => c.error)) throw Object.assign(new Error("partial"), { crms });
    return crms;
  };
  const crms = await kept.get(ws, read).catch((e: { crms?: Crm[] }) => {
    if (e.crms) return e.crms;
    throw e;
  });
  return Response.json({ crms });
}
