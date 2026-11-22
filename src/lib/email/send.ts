// One message through the pipeline: claim it (the guard), build it, hand it to SES, record what happened.
// A message is sent at most once:
//   - SES says no for good (a bad address, an unverified From): failed, not retried.
//   - SES is throttling or had a server error: it didn't take the message, so it goes back in line.
//   - The call died with no answer (a timeout, a dropped connection): SES may have it, so it's marked unknown and
//     never sent again. SES's Send event fills it in if it did go out.

import { enqueueJob, JobError, type Rpc } from "../jobs.ts";
import { claim } from "./guard.ts";
import { buildMessage } from "./message.ts";
import { SesError, type Ses } from "./ses.ts";

export type SendOpts = { rpc: Rpc; ses: Ses | null; base: string; key: Buffer };
export type SendResult = { result: "sent" | "blocked" | "wait" | "skip" | "failed" | "unknown"; detail?: string };

async function call(rpc: Rpc, fn: string, args: Record<string, unknown>) {
  const { error } = await rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
}

export async function sendMessage(o: SendOpts, messageId: string, workspaceId: string | null): Promise<SendResult> {
  if (!o.ses) throw new JobError("Sending isn't set up: add AWS_SES_REGION, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY", { retryAfterS: 600 });
  const c = await claim(o.rpc, messageId);
  if (c.action === "skip") return { result: "skip" };
  if (c.action === "blocked") return { result: "blocked", detail: c.reason };
  if (c.action === "wait") {
    await enqueueJob(o.rpc, { workspaceId, kind: "send", key: messageId, payload: { message_id: messageId }, delayS: c.seconds, maxAttempts: 8 });
    return { result: "wait", detail: c.why };
  }

  let built;
  try {
    built = buildMessage(c, { base: o.base, key: o.key });
  } catch (e) {
    await call(o.rpc, "send_failed", { p_id: messageId, p_status: "failed", p_error: (e as Error).message });
    return { result: "failed", detail: (e as Error).message };
  }

  let sesId: string;
  try {
    sesId = await o.ses.sendRaw(built.raw, {
      from: c.from_email,
      to: c.to,
      configSet: c.config_set,
      tags: [
        { Name: "ws", Value: c.workspace_id },
        { Name: "m", Value: c.id },
      ],
    });
  } catch (e) {
    if (e instanceof SesError && e.retryable) {
      await call(o.rpc, "send_failed", { p_id: messageId, p_status: "queued", p_error: e.message });
      throw new JobError(e.message, { retryAfterS: e.status === 429 ? 5 : 60 });
    }
    if (e instanceof SesError) {
      await call(o.rpc, "send_failed", { p_id: messageId, p_status: "failed", p_error: e.message });
      return { result: "failed", detail: e.message };
    }
    await call(o.rpc, "send_failed", { p_id: messageId, p_status: "unknown", p_error: `No answer from SES: ${(e as Error).message}` });
    return { result: "unknown", detail: (e as Error).message };
  }
  await call(o.rpc, "send_done", { p_id: messageId, p_ses_id: sesId, p_subject: built.subject, p_body_hash: built.bodyHash });
  return { result: "sent", detail: sesId };
}
