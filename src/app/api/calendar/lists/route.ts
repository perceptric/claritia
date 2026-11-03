import { saveLists } from "@/lib/meetings/providers/connect";
import { asCaller } from "../_lib/caller";

// Which calendars count as busy and which one gets new events:
// POST { workspaceId, accountId, calendars: [{ id, busy?, write? }] }. A person changes their own.

export const POST = (request: Request) =>
  asCaller(request, async (rpc, c, body) => {
    await saveLists(rpc, c, body.accountId, body.calendars);
    return { ok: true };
  });
