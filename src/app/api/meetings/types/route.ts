import { deleteType, duplicateType, pushType, saveType } from "../_lib/host";
import { handle } from "../_lib/route";
import { republishFormsUsing } from "@/lib/routing/formPublish";

// Meeting types (docs/meetings-scheduler.md 1.4 and 1.8b). POST { workspaceId, action, id?, type?, users? }:
//   save       create (no id) or change a type, checked by checkType with the workspace's members as hosts
//   delete     remove it (copies of a managed type stay with their people, unlocked)
//   duplicate  a copy with a free link name
//   push       owners: give a one-person or group type to `users`, each with their own copy and its locked settings
export function POST(request: Request) {
  return handle(request, async ({ rpc, db, actor, body }) => {
    const id = typeof body.id === "string" ? body.id : null;
    switch (body.action) {
      case "save": {
        const saved = await saveType(rpc, actor, body.type, id);
        // Forms that book this meeting route with its new settings from now on.
        const forms = id ? await republishFormsUsing(rpc, db, { ws: actor.ws, user: actor.user, typeId: id }).catch((e: unknown) => (e instanceof Error ? e.message : "failed")) : 0;
        return { ...saved, ...(typeof forms === "string" ? { formsError: forms } : { forms }) };
      }
      case "delete":
        await deleteType(rpc, actor, id);
        return { ok: true };
      case "duplicate":
        return duplicateType(rpc, actor, id);
      case "push":
        return pushType(rpc, actor, id, body.users);
      default:
        return Promise.reject(new Error("Unknown action."));
    }
  });
}
