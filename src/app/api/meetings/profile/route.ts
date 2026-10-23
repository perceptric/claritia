import { saveProfile, workspaceSlug } from "../_lib/host";
import { handle } from "../_lib/route";

// Your booking page (docs/meetings-scheduler.md 1.8b). POST { workspaceId, profile } saves your link name, name,
// line and photo; POST { workspaceId } alone returns the workspace's booking address, made the first time.
export function POST(request: Request) {
  return handle(request, async ({ rpc, actor, body }) => {
    if (body.profile !== undefined) await saveProfile(rpc, actor, body.profile);
    return { workspaceSlug: await workspaceSlug(rpc, actor) };
  });
}
