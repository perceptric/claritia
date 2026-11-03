// What Use template sets up beside the form (docs/form-templates-plan.md 5.1). A booking template books the
// workspace's meeting when it has just one, so it can never pick the wrong one; with more, the owner picks it in On
// Submission. Follow-ups are the Workflows templates (src/lib/workflows/templates.ts), made as drafts with every email
// unapproved and started on the new form, so nothing goes out until a person reads it and turns it on.

import type { FormTemplate } from "./types.ts";

const has = (t: FormTemplate, ...cats: string[]) => (t.categories ?? []).some((c) => cats.includes(c));

/** The Workflows template keys a template's follow-up uses, its own when it names them. */
export function kitWorkflows(t: FormTemplate): string[] {
  if (t.kit?.workflows) return t.kit.workflows;
  if (t.internal) return [];
  if (has(t, "demo-request") && t.schema.end.booking) return ["demo_request"];
  if (t.schema.end.booking) return ["not_booked"];
  if (has(t, "event-registration", "webinar", "rsvp")) return ["event"];
  if (has(t, "newsletter", "waitlist")) return ["welcome"];
  if (has(t, "contact", "lead-generation", "quote", "estimate", "consultation", "qualify", "callback")) return ["form_followup"];
  return [];
}

/** Whether Use template books a meeting: the template ends on the calendar. */
export const kitBooks = (t: FormTemplate) => !!t.schema.end.booking;

/** The meeting a booking template books: the workspace's one active meeting, or none (the owner picks it). */
export function kitMeeting(types: { id: string; active: boolean }[]): string | null {
  const on = types.filter((x) => x.active);
  return on.length === 1 ? on[0]!.id : null;
}
