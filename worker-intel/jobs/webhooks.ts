// meeting_webhook on claritia-intel (docs/scheduling-plan.md 5.3): one try of one meeting webhook send. A try that
// can work later goes back to the jobs queue (1, 5, 30 minutes, then 2 and 6 hours, up to 8 tries); after the last
// one, or on an answer that won't change, the send is marked failed with the reason and shows in the Webhooks tab.
// The same job sends the hooks Zapier, Make and Activepieces made (127_api_hooks.sql): a fill's body is built on its
// first try, and a hook whose address answers 410 Gone is removed, as REST hooks ask.

import { JobError, type Handler, type Rpc } from "../../src/lib/jobs.ts";
import { firstBody, openEndpoint, sendWebhook, type SendDeps, type Taken } from "../../src/lib/meetings/webhooks.ts";
import { call } from "../../src/lib/sources/sync.ts";
import { fillHeld, fillHookBody, type HookFill } from "../../src/lib/hooks/api.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type WebhookDeps = SendDeps & { base: string; secret?: string };

/** One try. Returns a retry when the jobs queue should try again. */
export async function webhookOnce(rpc: Rpc, d: WebhookDeps, id: string, last: boolean): Promise<{ retry?: { error: string; retryAfterS?: number } }> {
  const t = await call<Taken | null>(rpc, "webhook_take", { p_id: id });
  if (!t) return {};
  const finish = (status: "done" | "retrying" | "failed", code: number | null, error: string | null) => call(rpc, "webhook_done", { p_id: id, p_status: status, p_code: code, p_error: error });
  if (!t.active) {
    await finish("failed", null, "The endpoint is paused.");
    return {};
  }
  let endpoint: { url: string; secret: string };
  try {
    endpoint = openEndpoint(t.sealed, d.secret);
  } catch {
    await finish("failed", null, "Add this endpoint's address again.");
    return {};
  }
  let body = t.body;
  if (!t.frozen && t.submission_id) {
    const fill = await call<HookFill | null>(rpc, "hook_fill", { p_sub: t.submission_id });
    const held = fillHeld(fill);
    if (held) {
      await finish("failed", null, held);
      return {};
    }
    // A fill hook carries data.fill in place of data.meeting; the send reads only its bytes.
    body = fillHookBody(fill!, t.body.workspace_id) as unknown as typeof body;
    await call(rpc, "webhook_freeze", { p_id: id, p_body: body });
  } else if (!t.frozen) {
    body = firstBody(t, d.base, d.secret);
    await call(rpc, "webhook_freeze", { p_id: id, p_body: body });
  }
  const r = await sendWebhook({ url: endpoint.url, secret: endpoint.secret, delivery: id, body }, d);
  if (r.code === 410 && t.via && t.via !== "app" && t.endpoint_id) {
    await finish("failed", 410, "The app removed this hook.");
    await call(rpc, "api_hook_remove", { p_ws: t.body.workspace_id, p_id: t.endpoint_id });
    return {};
  }
  if (r.status === "done") await finish("done", r.code, null);
  else if (r.status === "failed" || last) await finish("failed", r.code, r.error);
  else {
    await finish("retrying", r.code, r.error);
    return { retry: { error: r.error, retryAfterS: r.retryAfterS } };
  }
  return {};
}

export const meetingWebhook =
  (rpc: Rpc, d: WebhookDeps): Handler =>
  async (job) => {
    const id = String(job.payload.delivery_id ?? "");
    if (!UUID.test(id)) throw new JobError("meeting_webhook needs a delivery", { retry: false });
    const r = await webhookOnce(rpc, d, id, job.attempts >= job.max_attempts);
    if (r.retry) throw new JobError(r.retry.error, { retryAfterS: r.retry.retryAfterS });
  };
