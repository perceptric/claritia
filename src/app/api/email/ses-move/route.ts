import { sesMoveOn } from "../../../../lib/email/senders.ts";

// Whether Settings › Sending offers "Move to new sending" (docs/ses-plan.md, Step 4): on wherever the server has SES
// keys, unless EMAIL_SES_MOVE=off. The worker makes new domains on SES under the same switch.
export function GET() {
  const on = sesMoveOn();
  return Response.json({ on }, { headers: { "Cache-Control": "no-store" } });
}
