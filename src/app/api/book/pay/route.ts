import { stripeClient } from "@/lib/billing";
import { connectLink, refreshAccount } from "@/lib/meetings/payServer";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// A workspace's Stripe account for paid meeting types (Connect Standard), for owners:
//   POST { workspaceId, action: "connect" } → { url }: Stripe's page to connect or finish connecting the account.
//   POST { workspaceId, action: "refresh" } → { ready }: read the account again after Stripe sends them back.

const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const body = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; action?: unknown };
  const ws = typeof body.workspaceId === "string" && /^[0-9a-f-]{36}$/.test(body.workspaceId) ? body.workspaceId : null;
  if (!ws) return bad("Workspace not found.", 404);
  const { data: me } = await auth.sb.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", auth.user.id).maybeSingle();
  if (!me) return bad("Workspace not found.", 404);
  if ((me as { role: string }).role !== "owner") return bad("Only owners can connect payments.", 403);
  const stripe = stripeClient();
  const db = serviceClient();
  if (!stripe || !db) return bad("Payments aren't set up on the server.", 503);
  const rpc = (fn: string, args: Record<string, unknown>) => db.rpc(fn, args);
  const { data: acct } = await db.from("payment_accounts").select("stripe_account").eq("workspace_id", ws).maybeSingle();
  const account = (acct as { stripe_account: string } | null)?.stripe_account ?? null;
  try {
    if (body.action === "connect") return Response.json({ url: await connectLink(rpc, stripe, ws, account) });
    if (body.action === "refresh") {
      if (!account) return Response.json({ ready: false });
      return Response.json({ ready: await refreshAccount(rpc, stripe, ws, account) });
    }
    return bad("Bad request.");
  } catch {
    return bad("Stripe didn't answer. Try again in a moment.", 502);
  }
}
