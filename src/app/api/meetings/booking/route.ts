import { bookingInfo, handleCheck, savePage, saveTeamHandle } from "../_lib/hooks";
import { handle } from "../_lib/route";

// The Booking page tab (docs/scheduling-plan.md Part 4). POST { workspaceId, action, ... }:
//   load    the team's handle, your page and the types you can show
//   check   whether { handle } is free for you, or for the team with { team: true }
//   save    your page: { profile, handle }
//   team    owners: the team's { handle }
export function POST(request: Request) {
  return handle(request, async ({ rpc, actor, body }) => {
    switch (body.action) {
      case "load":
        return bookingInfo(rpc, actor);
      case "check":
        return handleCheck(rpc, actor, body.handle, body.team === true);
      case "save":
        return savePage(rpc, actor, body.profile, body.handle);
      case "team":
        return saveTeamHandle(rpc, actor, body.handle);
      default:
        return Promise.reject(new Error("Unknown action."));
    }
  });
}
