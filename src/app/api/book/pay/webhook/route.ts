import { stripeClient } from "@/lib/billing";
import { handleConnectWebhook } from "@/lib/meetings/payServer";
import { serviceClient } from "@/lib/serviceClient";

/**
 * Stripe tells us about paid meetings on the workspaces' connected accounts: checkout paid, expired or failed, and
 * accounts that can now take payments. Each event is checked by fetching it back from Stripe on its account. A 500
 * makes Stripe send it again later.
 */
export async function POST(request: Request) {
  const stripe = stripeClient();
  const db = serviceClient();
  if (!stripe || !db) return Response.json({ error: "Payments aren't set up." }, { status: 503 });
  let body: string;
  try {
    body = await request.text();
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
  try {
    const result = await handleConnectWebhook(stripe, (fn, args) => db.rpc(fn, args), body);
    return Response.json(result, { status: result.ok ? 200 : 400 });
  } catch {
    return Response.json({ error: "Try again." }, { status: 500 });
  }
}
