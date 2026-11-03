import { disconnect } from "@/lib/meetings/providers/connect";
import { asCaller } from "../_lib/caller";

// Disconnect a calendar: POST { workspaceId, accountId }. A person disconnects their own; owners anyone's.

export const POST = (request: Request) =>
  asCaller(request, async (rpc, c, body) => {
    await disconnect(rpc, c, body.accountId);
    return { ok: true };
  });
