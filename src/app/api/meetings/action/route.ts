import { APP_URL } from "@/lib/site";
import { hostAction, hostLink } from "../_lib/host";
import { refundPaid } from "../_lib/refund";
import { handle } from "../_lib/route";

// A host's action on a meeting (docs/meetings-scheduler.md 1.7). POST { workspaceId, meetingId, action, reason? }:
//   held, no_show  after the start; queues meeting_notify
//   cancel         queues the calendar cancel (meeting_sync) once, in the same transaction; a paid meeting is refunded
//   link           the guest's own link to move or cancel (/book/m/<token>), for the host to send again
export function POST(request: Request) {
  const origin = request.headers.get("origin");
  return handle(request, async ({ rpc, actor, body }) => {
    if (body.action === "link") return hostLink(rpc, actor, body.meetingId, origin && /^https?:\/\/[^/]+$/.test(origin) ? origin : APP_URL);
    const r = await hostAction(rpc, actor, body.meetingId, body.action, body.reason);
    let refund: "done" | "failed" | undefined;
    if (r.status === "canceled" && r.payment) {
      try {
        await refundPaid(body.meetingId as string);
        refund = "done";
      } catch {
        refund = "failed";
      }
    }
    return { status: r.status, ...(refund ? { refund } : {}) };
  });
}
