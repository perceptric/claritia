import { paypalOrderOf, paypalVerify, payClient } from "@/lib/pay/providers";
import { keysFor, settle } from "@/lib/pay/server";
import { serviceClient } from "@/lib/serviceClient";

// PayPal's webhook for one workspace (docs/integrations-plan.md, Next step 12): set in the team's PayPal app as
// https://app.tryclaritia.com/api/pay/paypal?w=<workspace id>, with its webhook id in Settings › Integrations.
// PayPal checks the signature itself (verify-webhook-signature); then the order is read back and settled.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function POST(request: Request) {
  const ws = new URL(request.url).searchParams.get("w") ?? "";
  if (!UUID.test(ws)) return new Response("Unknown workspace.", { status: 404 });
  const body = await request.text();
  let event: { event_type?: string; resource?: { id?: string; supplementary_data?: { related_ids?: { order_id?: string } } } };
  try {
    event = JSON.parse(body) as typeof event;
  } catch {
    return new Response("Not JSON.", { status: 400 });
  }
  const db = serviceClient();
  if (!db) return new Response("Not set up.", { status: 503 });
  const rpc = (fn: string, args: Record<string, unknown>) => db.rpc(fn, args);
  const keys = await keysFor(rpc, ws, "paypal");
  if (!keys) return new Response("PayPal isn't connected.", { status: 404 });
  try {
    if (!(await paypalVerify({ client_id: keys.client_id ?? "", client_secret: keys.client_secret ?? "", mode: keys.mode, webhook_id: keys.webhook_id }, request.headers, event))) return new Response("Bad signature.", { status: 401 });
    const order = paypalOrderOf(event);
    if (!order) return new Response(null, { status: 204 });
    const client = payClient("paypal", keys);
    const s = await client.status(order);
    if (s.ref) await settle(rpc, client, s.ref);
    return new Response(null, { status: 204 });
  } catch {
    // PayPal sends it again.
    return new Response("Try again.", { status: 503 });
  }
}
