import { isMember } from "@/lib/contacts/server";
import { checkLink, withDefaults, type LinkIn } from "@/lib/meetings/public";
import type { MeetingType } from "@/lib/meetings/types";
import { requireUser } from "@/lib/serverAuth";
import { seal, unseal } from "@/lib/seal";
import { serviceClient } from "@/lib/serviceClient";
import { base } from "../_shared";

// Make a single-use link, a one-off meeting or a poll (docs/meetings-scheduler.md 1.8b), for a signed-in member:
// POST { workspaceId, kind, typeId?, title?, offered?: [{ start }], length?, location?, expiresAt? }. Only the token's
// hash opens it; a sealed copy is kept so Links and polls can copy it again: { id, url }.
// On an existing link (docs/app-structure.md 6.5): POST { workspaceId, action: "url" | "close" | "delete", id }.

const bad = (error: string, status = 400, extra: object = {}) => Response.json({ error, ...extra }, { status });

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const body = (await request.json().catch(() => ({}))) as LinkIn & { workspaceId?: unknown; action?: unknown; id?: unknown };
  if (!(await isMember(auth, body.workspaceId))) return bad("Workspace not found.", 404);
  const ws = body.workspaceId as string;
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);
  if (body.action === "url" || body.action === "close" || body.action === "delete") {
    if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/.test(body.id)) return bad("Link not found.", 404);
    const { data: row } = await db.from("meeting_links").select("id, kind, token_sealed, owner_user_id").eq("id", body.id).eq("workspace_id", ws).maybeSingle();
    const link = row as { id: string; kind: string; token_sealed: string | null; owner_user_id: string } | null;
    if (!link) return bad("Link not found.", 404);
    if (body.action === "url") {
      if (!link.token_sealed) return bad("This link was made before links could be copied again. Make a new one.", 409);
      let token = "";
      try {
        token = unseal(link.token_sealed);
      } catch {
        return bad("This link can't be copied again. Make a new one.", 409);
      }
      return Response.json({ url: `${base()}/book/${link.kind === "poll" ? "p" : "l"}/${token}` });
    }
    const { data: m } = await db.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", auth.user.id).maybeSingle();
    if (link.owner_user_id !== auth.user.id && (m as { role: string } | null)?.role !== "owner") return bad("Only the link's owner can change it.", 403);
    const { error } = body.action === "close" ? await db.from("meeting_links").update({ closed_at: new Date().toISOString() }).eq("id", link.id) : await db.from("meeting_links").delete().eq("id", link.id);
    if (error) return bad(error.message, 500);
    return Response.json({ ok: true });
  }
  let type: MeetingType | null = null;
  if (body.typeId) {
    if (typeof body.typeId !== "string" || !/^[0-9a-f-]{36}$/.test(body.typeId)) return bad("Meeting type not found.", 404);
    const { data } = await db.from("meeting_types").select("*").eq("id", body.typeId).eq("workspace_id", ws).eq("active", true).maybeSingle();
    if (!data) return bad("Meeting type not found.", 404);
    type = withDefaults(data as MeetingType);
  }
  const r = checkLink(body, { owner: auth.user.id, type });
  if ("errors" in r) return bad(r.errors[0]!, 400, { errors: r.errors });
  let sealed: string | null = null;
  try {
    sealed = seal(r.token);
  } catch {
    sealed = null;
  }
  const { data, error } = await db.from("meeting_links").insert({ workspace_id: ws, ...r.row, token_sealed: sealed }).select("id").single();
  if (error) return bad(error.message, 500);
  const path = r.row.kind === "poll" ? "p" : "l";
  return Response.json({ id: (data as { id: string }).id, url: `${base()}/book/${path}/${r.token}` });
}
