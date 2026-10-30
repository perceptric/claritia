import type { Rpc } from "@/lib/jobs";
import { Refused, type Caller } from "@/lib/router/actions";
import * as A from "@/lib/scoring/actions";
import { requireUser, roleIn } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// The Scoring screens' server side (docs/scoring-plan.md): POST { workspaceId, action, ... }. The caller signs in and
// names a workspace they're in; the work runs with the service client after the role checks in
// src/lib/scoring/actions.ts.

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
  const c: Caller = { ws, user: auth.user.id, role };
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  const revision = typeof body.revision === "number" ? body.revision : null;
  const ai = async () => (await import("@/lib/forms/claude")).claudeChat();
  try {
    const out = await (async () => {
      switch (body.action) {
        case "load":
          return A.load(db, c, { model: str("model") || null });
        case "build":
          return A.build(rpc, db, c, { model: str("model") || null, ai: await ai() });
        case "save_draft":
          return A.saveDraft(rpc, db, c, { model: str("model"), body: body.body, revision });
        case "publish":
          return A.publish(rpc, db, c, { model: str("model") });
        case "results":
          return A.results(rpc, db, c, { model: str("model") || null, body: body.body });
        case "fit":
          return A.fit(rpc, db, c, { body: body.body });
        case "chat":
          return A.chat(rpc, db, c, { model: str("model"), message: str("message"), body: body.body, revision, history: body.history, ai: await ai() });
        case "rename":
          return A.rename(db, c, { model: str("model"), name: str("name") });
      }
      throw new Refused(400, "Unknown action.");
    })();
    return Response.json(out);
  } catch (e) {
    if (e instanceof Refused) return Response.json({ error: e.message }, { status: e.status });
    return Response.json({ error: e instanceof Error ? e.message.slice(0, 300) : "Something went wrong." }, { status: 502 });
  }
}
