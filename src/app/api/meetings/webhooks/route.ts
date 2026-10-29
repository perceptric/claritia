import { addWebhook, changeWebhook, deleteWebhook, listWebhooks, resendWebhook, rollSecret, testWebhook, webhookSends } from "../_lib/hooks";
import { handle } from "../_lib/route";

// The Webhooks tab (docs/scheduling-plan.md Part 5). POST { workspaceId, action, ... }; owners change things:
//   list     the endpoints and the events there are
//   add      { endpoint: { url, events, description } }: the new id and the secret, shown once
//   change   { id, endpoint: { url?, events?, description?, active? } }
//   roll     { id }: a new secret, shown once
//   delete   { id }
//   sends    { id }: its last 50 sends
//   test     { id, event }: send a sample now and say how it went
//   resend   { send }: send one again
export function POST(request: Request) {
  return handle(request, async ({ rpc, actor, body }) => {
    switch (body.action) {
      case "list":
        return listWebhooks(rpc, actor);
      case "add":
        return addWebhook(rpc, actor, body.endpoint);
      case "change":
        return changeWebhook(rpc, actor, body.id, body.endpoint);
      case "roll":
        return rollSecret(rpc, actor, body.id);
      case "delete":
        return deleteWebhook(rpc, actor, body.id);
      case "sends":
        return webhookSends(rpc, actor, body.id);
      case "test":
        return testWebhook(rpc, actor, body.id, body.event);
      case "resend":
        return resendWebhook(rpc, actor, body.send);
      default:
        return Promise.reject(new Error("Unknown action."));
    }
  });
}
