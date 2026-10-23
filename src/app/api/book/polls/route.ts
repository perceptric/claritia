import { isMember } from "@/lib/contacts/server";
import { liveBusyFor } from "@/lib/meetings/live";
import { loadLink, pollBookWinner } from "@/lib/meetings/public";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// The host books a poll's winning time (docs/meetings-scheduler.md 1.8b): POST { workspaceId, linkId, start }.
// A time that's no longer free writes nothing and answers 409 with the poll's times still free, to pick again.

const bad = (error: string, status = 400, extra: object = {}) => Response.json({ error, ...extra }, { status });

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const body = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; linkId?: unknown; start?: unknown };
  if (!(await isMember(auth, body.workspaceId))) return bad("Workspace not found.", 404);
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);
  const rpc = (fn: string, args: Record<string, unknown>) => db.rpc(fn, args);
  const v = typeof body.linkId === "string" ? await loadLink(rpc, { id: body.linkId }) : null;
  if (!v || v.link.kind !== "poll" || v.link.workspace_id !== body.workspaceId) return bad("Poll not found.", 404);
  const start = typeof body.start === "number" ? body.start : typeof body.start === "string" ? Date.parse(body.start) : NaN;
  if (!Number.isFinite(start)) return bad("Pick a time.");
  try {
    const r = await pollBookWinner(rpc, { view: v, start, bookedBy: auth.user.id, liveBusy: liveBusyFor(rpc, v.link.workspace_id) });
    if (r.ok) return Response.json({ meetingId: r.meetingId, guests: r.guests });
    const error = {
      slot_taken: "That time is no longer free. Pick another.",
      not_offered: "That time isn't in the poll.",
      link_closed: "This poll is already booked.",
      no_votes: "No one has voted yet.",
    }[r.error];
    return bad(error, r.error === "slot_taken" ? 409 : 400, { code: r.error, free: r.free });
  } catch {
    return bad("Try again in a moment.", 503);
  }
}
