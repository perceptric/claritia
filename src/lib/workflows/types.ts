// A workflow (docs/enrich-workflows-reports.md Part 2): a trigger, then a column of steps. Branch, Split and Wait
// until hold two paths, which hold more steps, three levels deep at most. The editor, the checks, Try a contact and
// the worker all read this one shape.

import type { Cond } from "../router/types.ts";

export type TriggerKind = "form" | "meeting" | "not_booked" | "outcome" | "band" | "routed" | "segment" | "field" | "clicked" | "date" | "broadcast" | "manual";

export type Trigger =
  | { kind: "form"; forms: string[] }
  | { kind: "meeting"; events: ("booked" | "canceled" | "held" | "no_show")[]; types: string[] }
  | { kind: "not_booked"; forms: string[] }
  | { kind: "outcome"; outcomes: string[] }
  | { kind: "band"; bands: string[] }
  | { kind: "routed"; result: "routed" | "unassigned" | "any" }
  | { kind: "segment"; segment: string; on: "entered" | "left" }
  | { kind: "field"; key: string; to?: string }
  | { kind: "clicked"; emails: string[] }
  | { kind: "date"; field: string; days: number; time: string }
  | { kind: "broadcast"; segment: string; at: string }
  | { kind: "manual" };

/** One email in a workflow: the step form's words (src/lib/nurture/email.ts), approved before it can go. */
export type EmailBody = { subject: string; preheader: string; paragraphs: string[]; cta_label: string; cta_url: string };

export type WaitEvent = "meeting.booked" | "email.clicked" | "form.submitted" | "lead.outcome" | "segment.entered";

export type Step =
  | { id: string; kind: "email"; email: EmailBody; from: "team" | "owner"; approved: boolean; ai?: boolean; notes?: string[] }
  | { id: string; kind: "wait"; days: number; hours: number; weekday?: number[]; at?: string }
  | { id: string; kind: "wait_until"; event: WaitEvent; days: number; yes: Step[]; no: Step[] }
  | { id: string; kind: "branch"; match: "all" | "any"; conds: Cond[]; yes: Step[]; no: Step[] }
  | { id: string; kind: "split"; percent: number; a: Step[]; b: Step[] }
  | { id: string; kind: "enrich" }
  | { id: string; kind: "qualify" }
  | { id: string; kind: "route" }
  | { id: string; kind: "update"; field: string; value: string }
  | { id: string; kind: "list"; action: "add" | "remove"; segment: string }
  | { id: string; kind: "task"; title: string; assignee: string; dueDays: number }
  | { id: string; kind: "slack"; to: string; text: string }
  | { id: string; kind: "webhook"; url: string }
  | { id: string; kind: "crm" }
  | { id: string; kind: "exit" };

export type StepKind = Step["kind"];

export type Goal = { kind: "meeting_booked" } | { kind: "lifecycle"; stages: string[] } | { kind: "outcome"; outcomes: string[] };

export type Entry = { mode: "once" | "repeat"; gapDays: number };

export type Body = { trigger: Trigger; steps: Step[]; goals: Goal[]; entry: Entry; only?: { match: "all" | "any"; conds: Cond[] } };

/** The steps a person can add, in the order the picker shows them, grouped. */
export const STEP_KINDS: { kind: StepKind; label: string; group: "Email" | "Time" | "Logic" | "Lead" | "Record" | "Outside" | "End" }[] = [
  { kind: "email", label: "Send email", group: "Email" },
  { kind: "wait", label: "Wait", group: "Time" },
  { kind: "wait_until", label: "Wait until", group: "Time" },
  { kind: "branch", label: "Branch", group: "Logic" },
  { kind: "split", label: "Split", group: "Logic" },
  { kind: "enrich", label: "Enrich", group: "Lead" },
  { kind: "qualify", label: "Qualify", group: "Lead" },
  { kind: "route", label: "Route", group: "Lead" },
  { kind: "update", label: "Update field", group: "Record" },
  { kind: "list", label: "Add to list", group: "Record" },
  { kind: "task", label: "Create task", group: "Record" },
  { kind: "slack", label: "Slack", group: "Outside" },
  { kind: "webhook", label: "Webhook", group: "Outside" },
  { kind: "crm", label: "Push to CRM", group: "Outside" },
  { kind: "exit", label: "Exit", group: "End" },
];

export const TRIGGERS: { kind: TriggerKind; label: string }[] = [
  { kind: "form", label: "Form submitted" },
  { kind: "meeting", label: "Meeting booked, canceled, held or no-show" },
  { kind: "not_booked", label: "Didn't book after a form" },
  { kind: "outcome", label: "Qualify outcome set" },
  { kind: "band", label: "Score band changed" },
  { kind: "routed", label: "Routed, or no rep found" },
  { kind: "segment", label: "Joined or left a segment" },
  { kind: "field", label: "Field changed" },
  { kind: "clicked", label: "Email clicked" },
  { kind: "date", label: "A date on the contact" },
  { kind: "broadcast", label: "Once, to a segment" },
  { kind: "manual", label: "Added by hand" },
];

export const UPDATABLE = ["lifecycle", "lead_status", "title", "country", "region", "phone"] as const;

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
    case "update":
      return { id, kind, field: "lifecycle", value: "mql" };
    case "list":
      return { id, kind, action: "add", segment: "" };
    case "task":
      return { id, kind, title: "Follow up", assignee: "owner", dueDays: 1 };
    case "slack":
      return { id, kind, to: "owner", text: "" };
    case "webhook":
      return { id, kind, url: "" };
    default:
      return { id, kind } as Step;
  }
}
