import { twilioRequest } from "@/lib/texts/hooks";

// Twilio's delivery answers for texts Claritia sent (docs/integrations-plan.md, Next step 3): delivered, or failed
// with the carrier's reason.

export async function POST(request: Request) {
  const r = await twilioRequest(request);
  if (!r) return new Response("Forbidden", { status: 403 });
  const sid = r.params.MessageSid ?? r.params.SmsSid ?? "";
  const status = r.params.MessageStatus ?? r.params.SmsStatus ?? "";
  if (/^(SM|MM)[0-9a-f]{32}$/.test(sid) && status) await r.db.rpc("text_status", { p_sid: sid, p_status: status, p_error: r.params.ErrorCode ? `Carrier error ${r.params.ErrorCode}` : null });
  return new Response(null, { status: 204 });
}
