// A workflow (docs/enrich-workflows-reports.md Part 2): a trigger, then a column of steps. Branch, Split and Wait
// until hold two paths, which hold more steps, three levels deep at most. The editor, the checks, Try a contact and
// the worker all read this one shape.

import type { Cond } from "../router/types.ts";
import type { EmailDoc } from "../design/email/doc.ts";

/** What starts a workflow: a form, a meeting, a form with no booking after it, routing, or a click on its email. */
export type TriggerKind = "form" | "meeting" | "not_booked" | "routed" | "clicked";

export type Trigger =
  | { kind: "form"; forms: string[] }
  | { kind: "meeting"; events: ("booked" | "canceled" | "held" | "no_show")[]; types: string[] }
  | { kind: "not_booked"; forms: string[] }
  | { kind: "routed"; result: "routed" | "unassigned" | "any" }
  | { kind: "clicked"; emails: string[] };

/**
 * One email in a workflow: the step form's words (src/lib/nurture/email.ts), approved before it can go. With `doc`
 * it was built with blocks (docs/design-system.md Part 4), and the words are kept only as they were.
 */
export type EmailBody = { subject: string; preheader: string; paragraphs: string[]; cta_label: string; cta_url: string; doc?: EmailDoc };

export type WaitEvent = "meeting.booked" | "email.clicked" | "form.submitted";

export type Step =
  | { id: string; kind: "email"; email: EmailBody; from: "team" | "owner"; approved: boolean; ai?: boolean; notes?: string[] }
  /** With `before: "meeting"`: until that long before the contact's next booked meeting (a reminder), not after the step before. */
  | { id: string; kind: "wait"; days: number; hours: number; weekday?: number[]; at?: string; before?: "meeting" }
  | { id: string; kind: "wait_until"; event: WaitEvent; days: number; yes: Step[]; no: Step[] }
  | { id: string; kind: "branch"; match: "all" | "any"; conds: Cond[]; yes: Step[]; no: Step[] }
  | { id: string; kind: "split"; percent: number; a: Step[]; b: Step[] }
  | { id: string; kind: "route" }
  | { id: string; kind: "slack"; to: string; text: string }
  | { id: string; kind: "webhook"; url: string }
  /** A text to the contact's mobile, with their text consent (src/lib/texts). fallback: the email that goes instead when the text can't. */
  | { id: string; kind: "sms"; text: string; fallback?: { subject: string } }
  /** A WhatsApp message on an approved template (its Content SID), its variables in order, through the team's own Twilio. */
  | { id: string; kind: "whatsapp"; template: string; vars: string[] }
  /** A post in a Teams or Discord channel (src/lib/sources/chat.ts): the connection, Teams' channel, and the words. */
  | { id: string; kind: "chat"; source: string; target?: { id: string; name: string }; text: string }
  /** An event for the contact in Segment, PostHog, Mixpanel or Amplitude (src/lib/sources/analytics.ts). */
  | { id: string; kind: "event"; source: string; name: string }
  | { id: string; kind: "exit" };

export type StepKind = Step["kind"];

export type Goal = { kind: "meeting_booked" };

export type Entry = { mode: "once" | "repeat"; gapDays: number };

export type Body = { trigger: Trigger; steps: Step[]; goals: Goal[]; entry: Entry; only?: { match: "all" | "any"; conds: Cond[] } };

/** The steps a person can add, in the order the picker shows them, grouped. */
export const STEP_KINDS: { kind: StepKind; label: string; group: "Email" | "Time" | "Logic" | "Lead" | "Outside" | "End" }[] = [
  { kind: "email", label: "Email", group: "Email" },
  { kind: "wait", label: "Delay", group: "Time" },
  { kind: "wait_until", label: "Event wait", group: "Time" },
  { kind: "branch", label: "Branch", group: "Logic" },
  { kind: "split", label: "Split", group: "Logic" },
  { kind: "route", label: "Route", group: "Lead" },
  { kind: "slack", label: "Slack message", group: "Outside" },
  { kind: "sms", label: "Text message", group: "Outside" },
  { kind: "whatsapp", label: "WhatsApp message", group: "Outside" },
  { kind: "chat", label: "Teams or Discord message", group: "Outside" },
  { kind: "event", label: "Analytics event", group: "Outside" },
  { kind: "webhook", label: "Webhook", group: "Outside" },
  { kind: "exit", label: "Exit", group: "End" },
];

export const TRIGGERS: { kind: TriggerKind; label: string }[] = [
  { kind: "form", label: "Form submitted" },
  { kind: "meeting", label: "Meeting event" },
  { kind: "not_booked", label: "No booking after form" },
  { kind: "routed", label: "Lead routed" },
  { kind: "clicked", label: "Email clicked" },
];

export const LIMITS = { steps: 50, depth: 3, workflows: 100, runsPerContact: 20 };

export const emptyEmail = (): EmailBody => ({ subject: "", preheader: "", paragraphs: [""], cta_label: "", cta_url: "" });

export const emptyBody = (): Body => ({ trigger: { kind: "form", forms: [] }, steps: [], goals: [], entry: { mode: "once", gapDays: 30 } });

export function newStepId(): string {
  return `s${Math.random().toString(36).slice(2, 9)}`;
}

/** A new step of a kind, with sensible values. */
export function newStep(kind: StepKind): Step {
  const id = newStepId();
  switch (kind) {
    case "email":
      return { id, kind, email: emptyEmail(), from: "team", approved: false };
    case "wait":
      return { id, kind, days: 1, hours: 0 };
    case "wait_until":
      return { id, kind, event: "meeting.booked", days: 3, yes: [], no: [] };
    case "branch":
      return { id, kind, match: "all", conds: [{ field: "contact.email_class", op: "one_of", value: ["work"] }], yes: [], no: [] };
    case "split":
      return { id, kind, percent: 50, a: [], b: [] };
    case "slack":
      return { id, kind, to: "owner", text: "" };
    case "webhook":
      return { id, kind, url: "" };
    case "sms":
      return { id, kind, text: "Hi {{first_name|there}}, a reminder: we meet {{meeting_time|soon}}. {{meeting_link|}}" };
    case "whatsapp":
      return { id, kind, template: "", vars: [] };
    case "chat":
      return { id, kind, source: "", text: "A new meeting was just booked." };
    case "event":
      return { id, kind, source: "", name: "Meeting Booked" };
    default:
      return { id, kind } as Step;
  }
}
