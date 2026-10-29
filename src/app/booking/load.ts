import "server-only";
import type { Rpc } from "@/lib/jobs";
import { loadTarget, resolveHandle } from "@/lib/meetings/public";

// /booking/<handle> (docs/scheduling-plan.md 4.1): a handle names a person or a team. The pages below read the same
// booking data as /book/<workspace>/..., found through the handle.

/** A handle's page, or one of its types (`type`). A person's handle shows their page; a team's shows the team page. */
export async function loadHandle(rpc: Rpc, handle: string, type: string | null, form: string | null) {
  const h = await resolveHandle(rpc, handle).catch(() => null);
  if (!h) return null;
  const t = await loadTarget(rpc, h.ws, type ?? h.person, form).catch(() => null);
  // Under a handle, the second part is only ever a type.
  if (!t || (type && !t.type)) return null;
  return { h, t };
}
