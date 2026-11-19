import { stripeClient } from "@/lib/billing";
import { syncHostsSoon } from "@/lib/billingHosts";
import { disconnectStripe } from "@/lib/meetings/payDisconnect";
import { connectLink, refreshAccount } from "@/lib/meetings/payServer";
import { republishFormsUsing } from "@/lib/routing/formPublish";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// A workspace's Stripe account for paid meeting types (Connect Standard), for owners:
//   POST { workspaceId, action: "connect" } → { url }: Stripe's page to connect or finish connecting the account.
//   POST { workspaceId, action: "refresh" } → { ready }: read the account again after Stripe sends them back.
//   POST { workspaceId, action: "disconnect" } → { ok, off }: forget the account and turn off the meeting types that
//     take payment on it (src/lib/meetings/payDisconnect.ts); `off` is how many. Booked meetings stay. Safe to repeat.

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
  if (body.action === "disconnect") {
    const sdb = serviceClient();
    if (!sdb) return bad("Payments aren't set up on the server.", 503);
    const srpc = (fn: string, args: Record<string, unknown>) => sdb.rpc(fn, args);
    let off: string[];
    try {
      off = (await disconnectStripe(srpc, ws)).types;
    } catch {
      return bad("Couldn't disconnect Stripe. Try again in a moment.", 503);
    }
    if (off.length) {
      // The seats Stripe bills follow the active types; the forms booking them route with them turned off.
      syncHostsSoon(ws);
      for (const typeId of off) await republishFormsUsing(srpc, sdb, { ws, user: auth.user.id, typeId }).catch(() => 0);
    }
    return Response.json({ ok: true, off: off.length });
  }
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
