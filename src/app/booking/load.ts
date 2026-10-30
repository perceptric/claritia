import "server-only";
import { cache } from "react";
import { loadHandleCached } from "@/lib/meetings/public";
import { pageRpc } from "../book/load";

// /booking/<handle> (docs/scheduling-plan.md 4.1): a handle names a person or a team. The pages below read the same
// booking data as /book/<workspace>/..., found through the handle, in one read (book_page) that the page and its
// metadata share (React cache within the request, the short target cache across requests).

/** A handle's page, or one of its types (`type`). A person's handle shows their page; a team's shows the team page. */
export const loadHandle = cache(async (handle: string, type: string | null, form: string | null) => {
  const rpc = pageRpc();
  if (!rpc) return null;
  const d = await loadHandleCached(rpc, handle, type, form).catch(() => null);
  return d ? { rpc, ...d } : null;
});
