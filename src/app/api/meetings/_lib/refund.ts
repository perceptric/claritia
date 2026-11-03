import { refundMeeting } from "@/lib/meetings/payServer";

// Refunds for paid meetings a host cancels (docs/meetings-scheduler.md 1.8b): refundMeeting (the public booking
// side, src/lib/meetings/payServer.ts) refunds once on the workspace's Stripe account. Throws when it didn't.
export async function refundPaid(meetingId: string): Promise<void> {
  const r = await refundMeeting(meetingId);
  if (!r.ok) throw new Error(r.reason);
}
