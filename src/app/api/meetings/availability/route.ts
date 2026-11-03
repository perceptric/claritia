import { deleteSchedule, saveAvailability, saveSchedule } from "../_lib/host";
import { handle } from "../_lib/route";

// Hours (docs/meetings-scheduler.md 1.2, docs/app-structure.md 6.4). POST { workspaceId, userId?, ... }: your own, or
// anyone's for owners, checked by checkAvailability.
//   (no action)       { availability }: the default schedule ("Working hours")
//   schedule_save     { id?, name, availability }: add or change a named schedule
//   schedule_delete   { id }
export function POST(request: Request) {
  return handle(request, async ({ rpc, actor, body }) => {
    if (body.action === "schedule_save") return { id: await saveSchedule(rpc, actor, body.userId, body.id, body.name, body.availability) };
    if (body.action === "schedule_delete") {
      await deleteSchedule(rpc, actor, body.userId, body.id);
      return { ok: true };
    }
    await saveAvailability(rpc, actor, body.userId, body.availability);
    return { ok: true };
  });
}
