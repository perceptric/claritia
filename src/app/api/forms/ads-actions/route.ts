import { isMember } from "@/lib/contacts/server";
import { adsAccounts, adsActions, adsReady } from "@/lib/sources/ads";
import { deps } from "@/lib/sources/run";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// Settings › Tracking's Google Ads picker (docs/integrations-plan.md, Next step 2), read live from Google Ads.
//   POST { workspaceId }                     → { accounts: [{ customer, login, name }] }
//   POST { workspaceId, customer, login }    → { actions: [{ id, name }] }  the account's upload-click actions
// Through the workspace's Google Ads connection; the caller must be in the workspace.

const TIMEOUT_MS = 20_000;
const ID = /^\d{10}$/;
const bad = (error: string, status = 400) => Response.json({ error }, { status, headers: { "cache-control": "no-store" } });

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const b = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; customer?: unknown; login?: unknown };
  if (!(await isMember(auth, b.workspaceId))) return bad("Workspace not found.", 404);
  if (!adsReady()) return bad("Google Ads isn't set up on this server yet.", 503);
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);
  const { data: src } = await db.from("sources").select("id").eq("workspace_id", b.workspaceId as string).eq("kind", "google_ads").neq("status", "disconnected").order("created_at").limit(1).maybeSingle();
  if (!src) return bad("Connect Google Ads in Settings › Integrations.", 409);
  const d = await deps({ rpc: (fn, args) => db.rpc(fn, args), clean: async () => ({ custom: [] }), signal: AbortSignal.timeout(TIMEOUT_MS) }, src.id as string);
  if (!d) return bad("Connect Google Ads again.", 409);
  try {
    if (typeof b.customer === "string" && ID.test(b.customer)) {
      const login = typeof b.login === "string" && ID.test(b.login) ? b.login : b.customer;
      return Response.json({ actions: (await adsActions(d.ctx, b.customer, login)).slice(0, 200) }, { headers: { "cache-control": "no-store" } });
    }
    return Response.json({ accounts: (await adsAccounts(d.ctx)).slice(0, 200) }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return bad(`Couldn't read Google Ads: ${String((e as Error).message ?? e).slice(0, 200)}`, 502);
  }
}
