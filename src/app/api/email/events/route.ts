import { checkSvix, parseResendEvent } from "@/lib/email/webhook";
import { serviceClient } from "@/lib/serviceClient";

// Resend's email events (docs/enrich-workflows-reports.md Part 0). The signature and its age are checked before
// anything changes. Resend retries anything that isn't 2xx, and email_event_apply counts each event once.
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  const db = serviceClient();
  if (!secret || !db) return Response.json({ error: "Not set up." }, { status: 503 });
  const raw = await request.text();
  if (raw.length > 256_000) return Response.json({ error: "Too large." }, { status: 413 });
  const h = request.headers;
  const id = h.get("svix-id");
  const bad = checkSvix({ secret, id, timestamp: h.get("svix-timestamp"), signature: h.get("svix-signature"), body: raw });
  if (bad) return Response.json({ error: bad }, { status: 401 });

  const event = parseResendEvent(id!, raw);
  if (!event) return Response.json({ ok: true, ignored: true });
  const { data, error } = await db.rpc("email_event_apply", { p_event: event });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  // Not a campaign message: maybe a meeting or routing email (meeting_mails).
  if (data === "unknown_message") {
    const meeting = await db.rpc("meeting_mail_event", { p_event: event });
    if (meeting.error) return Response.json({ error: meeting.error.message }, { status: 500 });
    return Response.json({ ok: true, result: meeting.data });
  }
  return Response.json({ ok: true, result: data });
}
