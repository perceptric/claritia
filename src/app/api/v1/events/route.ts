import { isUuid } from "@/lib/apiAuth";
import { fillHookBody, isApiEvent, itemOf, sampleItem, type HookBody, type HookFill } from "@/lib/hooks/api";
import { bad, formsCaller } from "@/lib/hooks/v1";

/**
 * The last events of a kind, newest first, as the hook would send them: an app's sample step, a polling trigger,
 * and Find fill (?email=). GET ?event=form.submitted&form=<id>&email=<email>&limit=3. With &sample=1, a workspace
 * with none yet gets one made-up item marked test.
 */
export async function GET(request: Request) {
  const c = await formsCaller(request);
  if ("denied" in c) return c.denied;
  const q = new URL(request.url).searchParams;
  const event = q.get("event") ?? "form.submitted";
  if (!isApiEvent(event)) return bad("Unknown event.");
  const form = q.get("form") || null;
  if (form && !isUuid(form)) return bad("Form not found.", 404);
  const email = (q.get("email") ?? "").trim().toLowerCase().slice(0, 254) || null;
  const limit = Math.min(Math.max(Number(q.get("limit")) || 3, 1), 100);
  const { data, error } = await c.sb.rpc("api_recent", { p_ws: c.workspaceId, p_event: event, p_form: form, p_email: email, p_limit: limit });
  if (error) return bad("Couldn't read the events. Try again.", 500);
  const rows = (data ?? []) as unknown[];
  const items = rows.filter(Boolean).map((r) => itemOf(event === "form.submitted" ? fillHookBody(r as HookFill, c.workspaceId) : (r as HookBody)));
  if (!items.length && q.get("sample") === "1") items.push(sampleItem(event));
  return Response.json({ items });
}
