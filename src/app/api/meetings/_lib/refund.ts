import { refundIfProvider } from "@/lib/pay/server";
import { serviceClient } from "@/lib/serviceClient";
import { refundMeeting } from "@/lib/meetings/payServer";

// Refunds for paid meetings a host cancels (docs/meetings-scheduler.md 1.8b): refundMeeting (the public booking
// side, src/lib/meetings/payServer.ts) refunds once on the workspace's Stripe account. Throws when it didn't.
export async function refundPaid(meetingId: string): Promise<void> {
  // PayPal and Square (docs/integrations-plan.md, Next step 12) refund on the team's own account.
  const db = serviceClient();
  const own = db ? await refundIfProvider((fn, args) => db.rpc(fn, args), meetingId) : null;
  if (own) {
    if (!own.ok) throw new Error(own.reason);
    return;
  }
  const r = await refundMeeting(meetingId);
  if (!r.ok) throw new Error(r.reason);
}
