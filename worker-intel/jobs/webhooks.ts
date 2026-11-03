// meeting_webhook on claritia-intel (docs/scheduling-plan.md 5.3): one try of one meeting webhook send. A try that
// can work later goes back to the jobs queue (1, 5, 30 minutes, then 2 and 6 hours, up to 8 tries); after the last
// one, or on an answer that won't change, the send is marked failed with the reason and shows in the Webhooks tab.

import { JobError, type Handler, type Rpc } from "../../src/lib/jobs.ts";
import { firstBody, openEndpoint, sendWebhook, type SendDeps, type Taken } from "../../src/lib/meetings/webhooks.ts";
import { call } from "../../src/lib/sources/sync.ts";

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
  if (!t.frozen) {
    body = firstBody(t, d.base, d.secret);
    await call(rpc, "webhook_freeze", { p_id: id, p_body: body });
  }
  const r = await sendWebhook({ url: endpoint.url, secret: endpoint.secret, delivery: id, body }, d);
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
