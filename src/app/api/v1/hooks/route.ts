import { checkHook } from "@/lib/hooks/api";
import { bad, formsCaller } from "@/lib/hooks/v1";
import { newSecret, sealEndpoint } from "@/lib/meetings/webhooks";

/**
 * Subscribe a hook (REST hooks, as Zapier, Make and Activepieces use them): { url, event, form? }. Answers the hook's
 * id, to send to DELETE /api/v1/hooks/<id> on unsubscribe, and its signing secret.
 */
export async function POST(request: Request) {
  const c = await formsCaller(request);
  if ("denied" in c) return c.denied;
  const h = checkHook(await request.json().catch(() => null));
  if ("error" in h) return bad(h.error);
  const secret = newSecret();
  const s = sealEndpoint(h.url, secret);
  const { data, error } = await c.sb.rpc("api_hook_add", {
    p_ws: c.workspaceId, p_key: c.keyId, p_via: c.via === "api" ? h.via : c.via, p_host: s.host, p_sealed: s.sealed, p_hint: s.hint,
    p_events: h.events, p_forms: h.forms, p_description: h.description,
  });
  if (error) {
    if (error.message.includes("form_not_found")) return bad("Form not found.", 404);
    if (error.message.includes("too_many")) return bad("This workspace has 200 hooks. Remove one first.", 409);
    if (error.message.includes("bad_key")) return bad("This API key was revoked.", 401);
    return bad("Couldn't add the hook. Try again.", 500);
  }
  return Response.json({ id: data as string, secret, events: h.events, forms: h.forms }, { status: 201 });
}
