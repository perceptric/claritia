// The meeting description (docs/meetings-scheduler.md): the text on the calendar event and in the invite file, made
// from the meeting itself, so every booking has one without anyone writing it. Who booked, from which form, their
// answers (the form's and the meeting's own questions), the join link and the guest's reschedule and cancel link.
// The guest sees it too, so it holds only what the guest gave and their own links: no score, no routing reason.
// meeting_sync writes it on create and again on every move, so a rescheduled meeting never shows an old link.

import { allFields, type Form } from "../forms/schema.ts";

export type Answer = { label: string; value: string };

export type DescriptionIn = {
  typeName: string;
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

export function meetingDescription(d: DescriptionIn): string {
  const who = d.guest.name?.trim() ? `${d.guest.name.trim()} (${d.guest.email})` : d.guest.email;
  const lines = [`${who} booked ${d.typeName}${d.form ? ` from ${d.form}` : ""}.`];
  // The guest's name and email are already in the first line; the same label twice keeps the first.
  const seen = new Set<string>();
  const own = new Set([d.guest.email.toLowerCase(), (d.guest.name ?? "").trim().toLowerCase()].filter(Boolean));
  const answers = d.answers.filter((a) => {
    const k = a.label.trim().toLowerCase();
    if (!a.value.trim() || seen.has(k) || own.has(a.value.trim().toLowerCase())) return false;
    seen.add(k);
    return true;
  });
  if (answers.length) lines.push("", ...answers.map((a) => `${a.label}: ${a.value}`));
  const links = [d.join ? `Join: ${d.join}` : "", d.manage ? `Reschedule or cancel: ${d.manage}` : ""].filter(Boolean);
  if (links.length) lines.push("", ...links);
  // Too long: answers are cut first, so the links at the end always stay.
  let out = lines.join("\n");
  if (out.length > DESCRIPTION_MAX) {
    const tail = links.length ? `\n\n${links.join("\n")}` : "";
    out = `${out.slice(0, DESCRIPTION_MAX - tail.length - 2).replace(/\n[^\n]*$/, "")}\n…${tail}`;
  }
  return out;
}
