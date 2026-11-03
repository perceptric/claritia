import { refreshNow } from "@/lib/meetings/providers/connect";
import { asCaller } from "../_lib/caller";

// Read a calendar's busy times now and pick up calendars added since: POST { workspaceId, accountId }.

export const POST = (request: Request) =>
  asCaller(request, async (rpc, c, body) => {
    await refreshNow(rpc, c, body.accountId);
    return { ok: true };
  });
