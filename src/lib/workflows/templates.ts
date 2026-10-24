// Workflow templates (docs/enrich-workflows-reports.md 2.4). Each starts as a draft with its emails unapproved, so a
// person reads every email before anything goes out.

import { emptyEmail, newStepId, type Body, type EmailBody, type Step } from "./types.ts";

const email = (subject: string, paragraphs: string[], cta?: [string, string]): EmailBody => ({ ...emptyEmail(), subject, paragraphs, cta_label: cta?.[0] ?? "", cta_url: cta?.[1] ?? "" });
type NoId<T> = T extends unknown ? Omit<T, "id"> : never;
const s = (x: NoId<Step>): Step => ({ id: newStepId(), ...x }) as Step;

export type Template = { key: string; name: string; line: string; body: () => Body };

export const TEMPLATES: Template[] = [
  {
    key: "demo_request",
    name: "Demo request follow-up",
    line: "Qualify, route, and nudge until they book",
    body: () => ({
      trigger: { kind: "form", forms: [] },
      goals: [{ kind: "meeting_booked" }],
      entry: { mode: "once", gapDays: 30 },
      steps: [
        s({ kind: "enrich" }),
        s({ kind: "qualify" }),
        s({ kind: "route" }),
        s({ kind: "wait", days: 1, hours: 0 }),
        s({ kind: "email", from: "owner", approved: false, email: email("Picking a time", ["Hi {{first_name|there}},", "Thanks for asking about a demo. Pick a time that works and we'll show you around."], ["Pick a time", "https://"]) }),
        s({ kind: "wait", days: 2, hours: 0 }),
        s({ kind: "task", title: "Call about the demo request", assignee: "owner", dueDays: 1 }),
      ],
    }),
  },
  {
    key: "no_show",
    name: "No-show follow-up",
    line: "An email, a task and a Slack note for the rep",
    body: () => ({
      trigger: { kind: "meeting", events: ["no_show"], types: [] },
      goals: [{ kind: "meeting_booked" }],
      entry: { mode: "repeat", gapDays: 7 },
      steps: [
        s({ kind: "wait", days: 0, hours: 1 }),
        s({ kind: "email", from: "owner", approved: false, email: email("Sorry we missed you", ["Hi {{first_name|there}},", "We missed you earlier. Pick another time and we'll keep it short."], ["Pick a new time", "https://"]) }),
        s({ kind: "task", title: "Reach out after the missed meeting", assignee: "owner", dueDays: 1 }),
        s({ kind: "slack", to: "owner", text: "A lead missed their meeting. They got a note with a link to pick a new time." }),
      ],
    }),
  },
  {
    key: "not_booked",
    name: "Not booked follow-up",
    line: "For leads who sent a form but didn't pick a time",
    body: () => ({
      trigger: { kind: "not_booked", forms: [] },
      goals: [{ kind: "meeting_booked" }],
      entry: { mode: "once", gapDays: 30 },
      steps: [
        s({ kind: "wait", days: 0, hours: 2 }),
        s({ kind: "email", from: "owner", approved: false, email: email("Still want to talk?", ["Hi {{first_name|there}},", "You were picking a time earlier. Here's the link again."], ["Pick a time", "https://"]) }),
        s({ kind: "wait", days: 2, hours: 0 }),
        s({ kind: "task", title: "Follow up on the form", assignee: "owner", dueDays: 1 }),
      ],
    }),
  },
  {
    key: "not_a_fit",
    name: "Not a fit nurture",
    line: "Monthly emails for leads that aren't ready",
    body: () => ({
      trigger: { kind: "outcome", outcomes: ["Not a fit"] },
      goals: [{ kind: "meeting_booked" }],
      entry: { mode: "once", gapDays: 30 },
      steps: [
        s({ kind: "wait", days: 3, hours: 0 }),
        s({ kind: "email", from: "team", approved: false, email: email("A few things we wrote for you", ["Hi {{first_name|there}},", "Here are a few guides teams like yours read first."]) }),
        s({ kind: "wait", days: 30, hours: 0 }),
        s({ kind: "email", from: "team", approved: false, email: email("What changed this month", ["Hi {{first_name|there}},", "A short note on what's new."]) }),
      ],
    }),
  },
  {
    key: "event",
    name: "Event registration",
    line: "Confirm, remind the day before, follow up after",
    body: () => ({
      trigger: { kind: "form", forms: [] },
      goals: [],
      entry: { mode: "once", gapDays: 30 },
      steps: [
        s({ kind: "email", from: "team", approved: false, email: email("You're in", ["Hi {{first_name|there}},", "You're registered. We'll send a reminder the day before."]) }),
        s({ kind: "wait", days: 6, hours: 0, at: "09:00" }),
        s({ kind: "email", from: "team", approved: false, email: email("See you tomorrow", ["Hi {{first_name|there}},", "A reminder: it's tomorrow."]) }),
      ],
    }),
  },
  {
    key: "welcome",
    name: "Welcome",
    line: "Three emails over two weeks for new subscribers",
    body: () => ({
      trigger: { kind: "form", forms: [] },
      goals: [],
      entry: { mode: "once", gapDays: 30 },
      steps: [
        s({ kind: "email", from: "team", approved: false, email: email("Welcome", ["Hi {{first_name|there}},", "Thanks for signing up. Here's where to start."]) }),
        s({ kind: "wait", days: 4, hours: 0 }),
        s({ kind: "email", from: "team", approved: false, email: email("The one thing to try first", ["Hi {{first_name|there}},", "Most teams start here."]) }),
        s({ kind: "wait", days: 10, hours: 0 }),
        s({ kind: "email", from: "team", approved: false, email: email("Questions?", ["Hi {{first_name|there}},", "Reply to this email and a person will answer."]) }),
      ],
    }),
  },
  {
    key: "customer",
    name: "New customer handoff",
    line: "When a lead becomes a customer: a task, the CRM and a list",
    body: () => ({
      trigger: { kind: "field", key: "lifecycle", to: "customer" },
      goals: [],
      entry: { mode: "once", gapDays: 30 },
      steps: [s({ kind: "crm" }), s({ kind: "task", title: "Introduce their success contact", assignee: "owner", dueDays: 2 }), s({ kind: "slack", to: "owner", text: "A new customer. Their success contact needs an intro." })],
    }),
  },
  {
    key: "broadcast",
    name: "Broadcast",
    line: "One email to a segment, once",
    body: () => ({
      trigger: { kind: "broadcast", segment: "", at: "" },
      goals: [],
      entry: { mode: "once", gapDays: 30 },
      steps: [s({ kind: "email", from: "team", approved: false, email: email("", ["Hi {{first_name|there}},", ""]) })],
    }),
  },
];

export const templateByKey = (k: string) => TEMPLATES.find((t) => t.key === k);
