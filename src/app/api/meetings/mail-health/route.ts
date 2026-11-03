// Meeting emails' health for one workspace (src/lib/meetings/mailHealth.ts): GET ?workspaceId → { problem, meetings }.
// Members only.

import { mailHealth } from "@/lib/meetings/mailHealth";
import { requireUser, roleIn } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const ws = new URL(request.url).searchParams.get("workspaceId");
  if (!(await roleIn(auth, ws))) return bad("Workspace not found.", 404);
  const db = serviceClient();
  if (!db) return Response.json({ problem: null, meetings: {} });
  return Response.json(await mailHealth(db, ws!));
}
