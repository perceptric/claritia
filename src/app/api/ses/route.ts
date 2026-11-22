import { enqueueJob } from "@/lib/jobs";
import { snsUrl, verifySns } from "@/lib/email/sns";
import { serviceClient } from "@/lib/serviceClient";

// SES events through SNS (docs/marketing-platform.md M3 "Events"). Every message is checked against SNS's signing
// certificate and our topic before anything trusts it, then queued as a ses_event job keyed by the SNS message id,
// so a redelivery joins the job already waiting and ses_event_apply ignores one it has seen.
//   SES_SNS_TOPIC_ARN: the topic the workspaces' configuration sets publish to.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function POST(request: Request) {
  const topic = process.env.SES_SNS_TOPIC_ARN?.trim();
  const db = serviceClient();
  if (!topic || !db) return Response.json({ error: "Not set up." }, { status: 503 });
  const body = await request.text();
  if (body.length > 256 * 1024) return Response.json({ error: "Too large." }, { status: 413 });
  const v = await verifySns(body, topic);
  if (!v.ok) return Response.json({ error: v.error }, { status: 403 });
  const m = v.message;

  if (m.Type === "SubscriptionConfirmation") {
    const url = snsUrl(m.SubscribeURL);
    if (!url) return Response.json({ error: "Not an SNS URL." }, { status: 400 });
    const res = await fetch(url.href, { redirect: "error", signal: AbortSignal.timeout(10_000) }).catch(() => null);
    return res?.ok ? Response.json({ ok: true }) : Response.json({ error: "Couldn't confirm." }, { status: 502 });
  }
  if (m.Type !== "Notification") return Response.json({ ok: true });

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(m.Message) as Record<string, unknown>;
  } catch {
    // Not an SES event. Answer 200 so SNS doesn't send it again.
    return Response.json({ ok: true, ignored: true });
  }
  const ws = (event.mail as { tags?: Record<string, string[]> } | undefined)?.tags?.ws?.[0];
  try {
    await enqueueJob((fn, args) => db.rpc(fn, args), {
      workspaceId: ws && UUID.test(ws) ? ws : null,
      kind: "ses_event",
      key: m.MessageId,
      payload: { event },
      maxAttempts: 8,
    });
  } catch (e) {
    // 500 makes SNS try again later.
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
