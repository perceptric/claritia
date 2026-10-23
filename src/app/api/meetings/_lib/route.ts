import type { SupabaseClient } from "@supabase/supabase-js";
import type { Rpc } from "@/lib/jobs";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";
import { Refused, type Actor } from "./host";

// The routes under /api/meetings: the caller signs in, names the workspace, and the work runs with the service
// client after the checks in ./host.ts. Refusals go back with their status and plain words.

export type Ctx = { rpc: Rpc; db: SupabaseClient; actor: Actor; body: Record<string, unknown>; request: Request };

export async function handle(request: Request, fn: (c: Ctx) => Promise<object>): Promise<Response> {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.workspaceId !== "string") return Response.json({ error: "Workspace not found." }, { status: 404 });
  const db = serviceClient();
  if (!db) return Response.json({ error: "The server is not set up for this." }, { status: 500 });
  const rpc: Rpc = (fn, args) => db.rpc(fn, args);
  try {
    return Response.json(await fn({ rpc, db, actor: { ws: body.workspaceId, user: auth.user.id }, body, request }));
  } catch (e) {
    if (e instanceof Refused) return Response.json({ error: e.message, ...(e.errors ? { errors: e.errors } : {}) }, { status: e.status });
    return Response.json({ error: e instanceof Error ? e.message : "Something went wrong." }, { status: 500 });
  }
}
