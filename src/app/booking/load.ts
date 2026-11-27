import "server-only";
import { cache } from "react";
import { DOWN, pageRead } from "@/lib/meetings/pageRead";
import { loadHandleCached } from "@/lib/meetings/public";
import { pageRpc, withBrand } from "../book/load";

// /booking/<handle> (docs/scheduling-plan.md 4.1): a handle names a person or a team. The pages below read the same
// booking data as /book/<workspace>/..., found through the handle, in one read (book_page) that the page and its
// metadata share (React cache within the request, the short target cache across requests).

/**
 * A handle's page, or one of its types (`type`). A person's handle shows their page; a team's shows the team page.
 * Null when nothing is there, DOWN when the read failed (src/lib/meetings/pageRead.ts).
 */
export const loadHandle = cache(async (handle: string, type: string | null, form: string | null) => {
  const rpc = pageRpc();
  const d = await pageRead(rpc ? () => loadHandleCached(rpc, handle, type, form) : null);
  if (d === DOWN || !d) return d;
  return { rpc: rpc!, h: d.h, t: await withBrand(d.t, form) };
});
