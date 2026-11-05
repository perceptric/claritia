import { twilioRequest, twiml } from "@/lib/texts/hooks";
import { keywordOf } from "@/lib/texts/words";

// Replies to a sending number (docs/integrations-plan.md, Next step 3). STOP and the other stop words stop texts
// from that number to that phone; START lets them go again; HELP answers how to stop. Set as the number's or the
// Messaging Service's incoming address: https://app.tryclaritia.com/api/texts/inbound.

export async function POST(request: Request) {
  const r = await twilioRequest(request);
  if (!r) return new Response("Forbidden", { status: 403 });
  const from = (r.params.From ?? "").replace(/^whatsapp:/, "");
  const to = (r.params.To ?? "").replace(/^whatsapp:/, "");
  const sender = r.params.MessagingServiceSid || to;
  const k = keywordOf(r.params.Body ?? "");
  if (k === "stop" || k === "start") {
    // Both the number and its Messaging Service, so the send's check finds it whichever it sent with.
    for (const s of new Set([sender, to].filter(Boolean))) await r.db.rpc("text_optout", { p_sender: s, p_phone: from, p_stop: k === "stop" });
    return twiml();
  }
  if (k === "help") return twiml("Reminders and updates about your bookings. Reply STOP to opt out.");
  return twiml();
}
