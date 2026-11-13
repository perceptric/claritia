// What the booking page already knows about a guest (docs/booking-page-plan.md, Part 3): the answers a form fill gave
// to questions the meeting asks again, matched by label (or the phone field for a phone call), and whether that's
// enough to book in one click from the time itself. Runs in the browser and on the server.

import { validEmail, type GuestLocation, type Question } from "./guest.ts";
import { checkAnswer } from "./questions.ts";

/** One answered field of a form fill (fill_answers, 161_booking_page.sql). */
export type FillAnswer = { label?: string | null; key?: string | null; type?: string | null; value: unknown };

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const asText = (v: unknown): string => {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return v ? "Yes" : "";
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string" || typeof x === "number").map(String).join("\n");
  return "";
};

/**
 * The meeting's questions the fill already answered, by question id. A question matches a field with the same label
 * (case and punctuation aside); the guest's phone for a phone call matches the fill's phone field. An answer that
 * doesn't pass the question's own check (a choice that isn't on the list) is left for the guest.
 */
export function knownAnswers(questions: Question[], fill: FillAnswer[], location?: GuestLocation): Record<string, string> {
  const out: Record<string, string> = {};
  const byLabel = new Map<string, unknown>();
  for (const f of fill) if (norm(f.label) && !byLabel.has(norm(f.label))) byLabel.set(norm(f.label), f.value);
  for (const q of questions) {
    if (!byLabel.has(norm(q.label))) continue;
    const a = checkAnswer(q, asText(byLabel.get(norm(q.label))));
    if (!("error" in a) && a.value) out[q.id] = a.value;
  }
  if (location?.kind === "phone_guest") {
    const phone = fill.find((f) => f.key === "phone" || f.type === "phone");
    const v = phone ? asText(phone.value).slice(0, 40) : "";
    if (/^\+?[\d\s().-]{6,40}$/.test(v)) out.phone = v;
  }
  return out;
}

/**
 * Whether a time can be booked from the time itself: the page knows the guest's name and email, every required
 * question is answered, a phone call has the number, and nothing is paid (checkout needs the details step).
 */
export function canQuickBook(o: { name?: string; email?: string; questions: Question[]; known: Record<string, string>; location: GuestLocation; paid: boolean }): boolean {
  if (o.paid) return false;
  if (!o.name?.trim() || !o.email || !validEmail(o.email.trim().toLowerCase())) return false;
  if (o.location.kind === "phone_guest" && !o.known.phone) return false;
  return o.questions.every((q) => !q.required || !!o.known[q.id]);
}
