import { readReturn } from "@/lib/pay/flow";
import { clientFor, settle } from "@/lib/pay/server";
import { serviceClient } from "@/lib/serviceClient";

// The guest coming back from PayPal or Square (docs/integrations-plan.md, Next step 12). The address is ours and
// signed, so it says only what it's about and where to go next; whether it's paid is read back from the provider
// (PayPal captures here). Whatever happens, the guest goes on to their page; a payment not settled here is settled
// by the webhook.

export async function GET(request: Request) {
  const b = readReturn(new URL(request.url).searchParams.get("s"));
  if (!b) return new Response("This payment link isn't valid.", { status: 400 });
  if (b.paid) {
    const db = serviceClient();
    if (db) {
      try {
        const rpc = (fn: string, args: Record<string, unknown>) => db.rpc(fn, args);
        const client = await clientFor(rpc, b.ws, b.provider);
        if (client) await settle(rpc, client, b.ref);
      } catch {
        // Down or slow: the webhook settles it.
      }
    }
  }
  return Response.redirect(b.to, 302);
}
