// The meeting description (docs/meetings-scheduler.md): the text on the calendar event and in the invite file, in
// Calendly's layout: who booked and from which form, their answers (the form's and the meeting's own questions), the
// meeting type's own words (its Description, when it has one), then the join link and the guest's reschedule and
// cancel link.
// The guest sees it too, so it holds only what the guest gave and their own links: no score, no routing reason.
// meeting_sync writes it on create and again on every move, so a rescheduled meeting never shows an old link.

import { allFields, type Form } from "../forms/schema.ts";

export type Answer = { label: string; value: string };

export type DescriptionIn = {
  typeName: string;
  /** The meeting type's own words (settings.description), first. */
  about?: string | null;
  guest: { name: string | null; email: string };
  /** The form the meeting was booked from, when there is one. */
  form?: string | null;
  answers: Answer[];
  join?: string | null;
  manage?: string | null;
};

/** Google takes 8,192 characters; the rest is cut at a line. */
export const DESCRIPTION_MAX = 8000;
const SKIP = new Set(["hidden", "consent", "heading", "paragraph"]);

const text = (v: unknown): string => (Array.isArray(v) ? v.map(text).filter(Boolean).join(", ") : typeof v === "string" || typeof v === "number" ? String(v) : typeof v === "boolean" ? (v ? "Yes" : "No") : "").trim();

/** A form fill's answers with the form's labels, in the form's order: no hidden fields, consent or content blocks. */
export function formAnswers(body: Pick<Form, "steps"> | null | undefined, values: Record<string, unknown> | null | undefined): Answer[] {
  if (!body?.steps || !values) return [];
  const out: Answer[] = [];
  for (const f of allFields(body)) {
    if (SKIP.has(f.type)) continue;
    const v = text(values[f.key]);
    if (v) out.push({ label: (f.label || f.key).slice(0, 120), value: v.slice(0, 2000) });
  }
  return out;
}

/**
 * The description, laid out like Calendly's: Event details (who booked, their email, the form), Additional details
 * (each answer under its question), Event type description (the type's own words), then the join and reschedule links.
 */
export function meetingDescription(d: DescriptionIn): string {
  const name = d.guest.name?.trim();
  const about = d.about?.trim() ? d.about.trim().slice(0, 2000) : "";
  const lines = ["Event details:", ...(name ? [`Invitee: ${name}`] : []), `Invitee email: ${d.guest.email}`, `Event: ${d.typeName}`, ...(d.form ? [`Booked from: ${d.form}`] : [])];
  // The guest's name and email are already in Event details; the same question twice keeps the first.
  const seen = new Set<string>();
  const own = new Set([d.guest.email.toLowerCase(), (name ?? "").toLowerCase()].filter(Boolean));
  const answers = d.answers.filter((a) => {
    const k = a.label.trim().toLowerCase();
    if (!a.value.trim() || seen.has(k) || own.has(a.value.trim().toLowerCase())) return false;
    seen.add(k);
    return true;
  });
  const block = answers.length ? `\n\n${["Additional details:", ...answers.flatMap((a, i) => [...(i ? [""] : []), `${a.label}:`, a.value])].join("\n")}` : "";
  const aboutBlock = about ? `\n\nEvent type description:\n${about}` : "";
  const links = [d.join ? `Join: ${d.join}` : "", d.manage ? `Reschedule or cancel: ${d.manage}` : ""].filter(Boolean);
  const tail = links.length ? `\n\n${links.join("\n")}` : "";
  const head = lines.join("\n");
  // Too long: the answers are cut first, at a line, so the type's Description and the links always stay.
  const room = DESCRIPTION_MAX - head.length - aboutBlock.length - tail.length;
  const kept = block.length <= room ? block : `${block.slice(0, Math.max(0, room - 2)).replace(/\n[^\n]*$/, "")}\n…`;
  return `${head}${kept}${aboutBlock}${tail}`;
}
