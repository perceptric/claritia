// A booking page's Text consent question (docs/integrations-plan.md, Next step 3): ticked, with a phone number the
// guest gave, the contact gets their mobile and a granted text consent. Server only.

import { cleanPhone } from "../contacts/clean.ts";
import type { Rpc } from "../jobs.ts";
import type { QuestionType } from "../meetings/types.ts";

type Question = { id: string; type: QuestionType };
import { SMS_WORDING } from "./words.ts";

/** The guest's mobile as E.164 when they ticked Text consent, else null. */
export function bookingTextPhone(guest: { answers: Record<string, string> }, questions: Pick<Question, "id" | "type">[]): string | null {
  if (!questions.some((q) => q.type === "sms" && guest.answers[q.id] === "Yes")) return null;
  const raw = questions.find((q) => q.type === "phone" && guest.answers[q.id])?.id;
  const phone = cleanPhone(raw ? guest.answers[raw] : guest.answers.phone);
  return phone && /^\+[1-9]\d{6,14}$/.test(phone) ? phone : null;
}

/** Record it. A hiccup costs the consent, never the booking. */
export async function bookingTextConsent(rpc: Rpc, ws: string, guest: { email: string; answers: Record<string, string> }, questions: Pick<Question, "id" | "type">[]): Promise<void> {
  const phone = bookingTextPhone(guest, questions);
  if (!phone) return;
  await Promise.resolve(rpc("text_consent_add", { p_ws: ws, p_contact: null, p_email: guest.email, p_phone: phone, p_wording: SMS_WORDING, p_source: "booking" })).catch(() => undefined);
}
