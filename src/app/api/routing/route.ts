import { appBase } from "@/lib/billing";
import * as A from "@/lib/router/actions";
import type { Rpc } from "@/lib/jobs";
import { seal } from "@/lib/seal";
import { requireUser, roleIn } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// The Routing screens' server side (docs/router-ux.md 7.3): POST { workspaceId, action, ... }. The caller signs in and
// names a workspace they're in; the work runs with the service client after the role checks in
// src/lib/router/actions.ts.

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const ws = typeof body.workspaceId === "string" && /^[0-9a-f-]{36}$/.test(body.workspaceId) ? body.workspaceId : "";
  const role = await roleIn(auth, ws);
  if (!role) return Response.json({ error: "Workspace not found." }, { status: 404 });
  const db = serviceClient();
  if (!db) return Response.json({ error: "The server is not set up for this." }, { status: 500 });
  const rpc: Rpc = (f, args) => db.rpc(f, args);
  const c: A.Caller = { ws, user: auth.user.id, role };
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : null);
  try {
    const out = await (async () => {
      switch (body.action) {
        case "load":
          return A.load(rpc, db, c, { slim: body.slim === true });
        case "stats":
          return { stats: await A.stats(rpc, c) };
        case "versions":
          return { versions: await A.versions(db, c) };
        case "chat_history":
          return { chat: await A.chatHistory(db, c) };
        case "save_draft":
          return A.saveDraft(rpc, c, body.body, typeof body.revision === "number" ? body.revision : null);
        case "drop_draft":
          return A.dropDraft(rpc, c);
        case "publish":
          return A.publish(rpc, db, c, str("note"));
        case "rollback":
          return A.rollback(rpc, db, c, Number(body.version));
        case "changes":
          return A.changes(rpc, db, c, { from: typeof body.from === "number" ? body.from : null, to: typeof body.to === "number" ? body.to : "draft" });
        case "test":
          return A.test(rpc, db, c, {
            email: str("email"),
            contact: str("contact"),
            changes: body.changes && typeof body.changes === "object" ? (body.changes as Record<string, unknown>) : undefined,
            owners: tryOwners(body.owners),
            which: body.which === "live" || body.which === "both" ? body.which : "draft",
            whyNot: str("whyNot"),
            draft: body.draft,
          });
        case "replay":
          return A.replay(db, c, { days: Number(body.days) || 30, draft: body.draft });
        case "route":
          return A.routeAgain(rpc, c, Array.isArray(body.contacts) ? (body.contacts as string[]) : []);
        case "rep":
          return A.saveRep(rpc, c, str("user") ?? c.user, (body.patch as Record<string, unknown>) ?? {});
        case "held":
          return A.heldAction(rpc, db, c, { op: str("op") ?? "", contacts: Array.isArray(body.contacts) ? (body.contacts as string[]) : [], domain: str("domain") ?? undefined, user: str("user") ?? undefined, moveMeetings: body.moveMeetings === true });
        case "lists":
          return A.saveLists(rpc, c, body.allow, body.block);
        case "alert":
          return A.saveAlert(db, c, str("url"), str("label"), (s) => seal(s));
        case "pause":
          return A.setPaused(rpc, c, body.paused === true);
        case "slack_install":
          return A.slackInstall(c, `${appBase()}/api/slack/callback`);
        case "slack_remove":
          return A.slackRemove(db, c);
        case "contacted":
          return A.markContacted(rpc, c, str("contact"));
        case "chat": {
          const { claudeChat } = await import("@/lib/forms/claude");
          return A.chat(rpc, db, c, { message: str("message") ?? "", revision: typeof body.revision === "number" ? body.revision : null, model: claudeChat(), clear: body.clear === true });
        }
        case "crm_owners":
          return A.crmOwners(db, c);
        case "save_crm_owners":
          return A.saveCrmOwners(db, c, body.rows);
      }
      throw new A.Refused(400, "Unknown action.");
    })();
    return Response.json(out);
  } catch (e) {
    if (e instanceof A.Refused) return Response.json({ error: e.message }, { status: e.status });
    return Response.json({ error: e instanceof Error ? e.message.slice(0, 300) : "Something went wrong." }, { status: 502 });
  }
}

/** "Try a lead"'s owners: each a rep's id, null (nobody yet), or left out. */
function tryOwners(raw: unknown): { company?: string | null; contact?: string | null } | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const one = (v: unknown) => (v === null ? null : typeof v === "string" && /^[0-9a-f-]{36}$/.test(v) ? v : undefined);
  const out: { company?: string | null; contact?: string | null } = {};
  if (one(r.company) !== undefined) out.company = one(r.company);
  if (one(r.contact) !== undefined) out.contact = one(r.contact);
  return out;
}
