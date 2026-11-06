import { payClient, squareOrderOf, squareSignatureOk } from "@/lib/pay/providers";
import { keysFor, settle } from "@/lib/pay/server";
import { serviceClient } from "@/lib/serviceClient";
import { APP_URL } from "@/lib/site";

// Square's webhook for one workspace (docs/integrations-plan.md, Next step 12): set in the team's Square app as
// https://app.tryclaritia.com/api/pay/square?w=<workspace id> for payment.updated, with its signature key in
// Settings › Integrations. The signature covers this exact address and the body; then the order is read back.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function POST(request: Request) {
  const ws = new URL(request.url).searchParams.get("w") ?? "";
  if (!UUID.test(ws)) return new Response("Unknown workspace.", { status: 404 });
  const body = await request.text();
  const db = serviceClient();
  if (!db) return new Response("Not set up.", { status: 503 });
  const rpc = (fn: string, args: Record<string, unknown>) => db.rpc(fn, args);
  const keys = await keysFor(rpc, ws, "square");
  if (!keys) return new Response("Square isn't connected.", { status: 404 });
  if (!squareSignatureOk(keys.signature_key ?? "", `${APP_URL}/api/pay/square?w=${ws}`, body, request.headers.get("x-square-hmacsha256-signature"))) return new Response("Bad signature.", { status: 401 });
  try {
    const order = squareOrderOf(JSON.parse(body) as Parameters<typeof squareOrderOf>[0]);
    if (!order) return new Response(null, { status: 204 });
    const client = payClient("square", keys);
    const s = await client.status(order);
    if (s.ref) await settle(rpc, client, s.ref);
    return new Response(null, { status: 204 });
  } catch {
    // Square sends it again.
    return new Response("Try again.", { status: 503 });
  }
}
