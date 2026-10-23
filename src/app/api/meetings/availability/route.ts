import { saveAvailability } from "../_lib/host";
import { handle } from "../_lib/route";

// Hours (docs/meetings-scheduler.md 1.2). POST { workspaceId, userId?, availability }: your own, or anyone's for
// owners, checked by checkAvailability.
export function POST(request: Request) {
  return handle(request, async ({ rpc, actor, body }) => {
    await saveAvailability(rpc, actor, body.userId, body.availability);
    return { ok: true };
  });
}
