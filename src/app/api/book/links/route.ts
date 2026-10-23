import { isMember } from "@/lib/contacts/server";
import { checkLink, withDefaults, type LinkIn } from "@/lib/meetings/public";
import type { MeetingType } from "@/lib/meetings/types";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";
import { base } from "../_shared";

// Make a single-use link, a one-off meeting or a poll (docs/meetings-scheduler.md 1.8b), for a signed-in member:
// POST { workspaceId, kind, typeId?, title?, offered?: [{ start }], length?, location?, expiresAt? }. The link's
// address holds a token shown only now (only its hash is kept): { id, url }.

const bad = (error: string, status = 400, extra: object = {}) => Response.json({ error, ...extra }, { status });

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const body = (await request.json().catch(() => ({}))) as LinkIn & { workspaceId?: unknown };
  if (!(await isMember(auth, body.workspaceId))) return bad("Workspace not found.", 404);
  const ws = body.workspaceId as string;
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);
  let type: MeetingType | null = null;
  if (body.typeId) {
    if (typeof body.typeId !== "string" || !/^[0-9a-f-]{36}$/.test(body.typeId)) return bad("Meeting type not found.", 404);
    const { data } = await db.from("meeting_types").select("*").eq("id", body.typeId).eq("workspace_id", ws).eq("active", true).maybeSingle();
    if (!data) return bad("Meeting type not found.", 404);
    type = withDefaults(data as MeetingType);
  }
  const r = checkLink(body, { owner: auth.user.id, type });
  if ("errors" in r) return bad(r.errors[0]!, 400, { errors: r.errors });
  const { data, error } = await db.from("meeting_links").insert({ workspace_id: ws, ...r.row }).select("id").single();
  if (error) return bad(error.message, 500);
  const path = r.row.kind === "poll" ? "p" : "l";
  return Response.json({ id: (data as { id: string }).id, url: `${base()}/book/${path}/${r.token}` });
}
