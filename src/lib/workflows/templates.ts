// Workflow templates (docs/enrich-workflows-reports.md 2.4). Each starts as a draft with its emails unapproved, so a
// person reads every email before anything goes out.

import { emptyEmail, newStepId, type Body, type EmailBody, type Step } from "./types.ts";

const email = (subject: string, paragraphs: string[], cta?: [string, string]): EmailBody => ({ ...emptyEmail(), subject, paragraphs, cta_label: cta?.[0] ?? "", cta_url: cta?.[1] ?? "" });
type NoId<T> = T extends unknown ? Omit<T, "id"> : never;
const s = (x: NoId<Step>): Step => ({ id: newStepId(), ...x }) as Step;

export type Template = { key: string; name: string; line: string; body: () => Body };

export const TEMPLATES: Template[] = [
  {
    key: "form_announcement",
    name: "Form announcement",
    line: "A thank-you right away, and a Slack note for their owner",
    body: () => ({
      trigger: { kind: "form", forms: [] },
      goals: [],
      entry: { mode: "repeat", gapDays: 1 },
      steps: [
        s({ kind: "email", from: "owner", approved: false, email: email("We got your answers", ["Hi {{first_name|there}},", "Thanks for getting in touch. We read every answer and will get back to you soon."]) }),
        s({ kind: "slack", to: "owner", text: "New form answers just came in." }),
      ],
    }),
  },
  {
    key: "meeting_announcement",
    name: "Meeting announcement",
    line: "A Slack note when it's booked, then reminders a day and an hour before",
    body: () => ({
      trigger: { kind: "meeting", events: ["booked"], types: [] },
      goals: [],
      entry: { mode: "repeat", gapDays: 1 },
      steps: [
        s({ kind: "slack", to: "owner", text: "A new meeting was just booked." }),
        s({ kind: "wait", days: 1, hours: 0, before: "meeting" }),
        s({
          kind: "email",
          from: "owner",
          approved: false,
          email: email("See you tomorrow", ["Hi {{first_name|there}},", "A reminder: we meet {{meeting_time|tomorrow}}.", "Join here: {{meeting_link|the link in your invite}}", "Need another time? {{reschedule_link|Reply to this email}}"]),
        }),
        s({ kind: "wait", days: 0, hours: 1, before: "meeting" }),
        s({
          kind: "email",
          from: "owner",
          approved: false,
          email: email("Starting in an hour", ["Hi {{first_name|there}},", "We meet in an hour, {{meeting_time|soon}}.", "Join here: {{meeting_link|the link in your invite}}"]),
        }),
      ],
    }),
  },
  {
    key: "meeting_followup",
    name: "Meeting follow-up",
    line: "A thank-you a few hours after the meeting",
    body: () => ({
      trigger: { kind: "meeting", events: ["held"], types: [] },
      goals: [],
      entry: { mode: "repeat", gapDays: 1 },
      steps: [
        s({ kind: "wait", days: 0, hours: 2 }),
        s({ kind: "email", from: "owner", approved: false, email: email("Thanks for your time", ["Hi {{first_name|there}},", "Thanks for meeting with us today. Reply to this email with any questions, and we'll send the next steps."]) }),
      ],
    }),
  },
  {
    key: "reminders",
    name: "Meeting reminders",
    line: "A day before and an hour before, following any reschedule",
    body: () => ({
      trigger: { kind: "meeting", events: ["booked"], types: [] },
      goals: [],
      entry: { mode: "repeat", gapDays: 1 },
      steps: [
        s({ kind: "wait", days: 1, hours: 0, before: "meeting" }),
        s({
          kind: "email",
          from: "owner",
          approved: false,
          email: email("See you tomorrow", ["Hi {{first_name|there}},", "A reminder: we meet {{meeting_time|tomorrow}}.", "Join here: {{meeting_link|the link in your invite}}", "Need another time? {{reschedule_link|Reply to this email}}"]),
        }),
        s({ kind: "wait", days: 0, hours: 1, before: "meeting" }),
        s({
          kind: "email",
          from: "owner",
          approved: false,
          email: email("Starting in an hour", ["Hi {{first_name|there}},", "We meet in an hour, {{meeting_time|soon}}.", "Join here: {{meeting_link|the link in your invite}}"]),
        }),
      ],
    }),
  },
  {
    key: "form_followup",
    name: "Form follow-up",
    line: "An email the day after they send a form",
    body: () => ({
      trigger: { kind: "form", forms: [] },
      goals: [{ kind: "meeting_booked" }],
      entry: { mode: "once", gapDays: 30 },
      steps: [
        s({ kind: "wait", days: 1, hours: 0 }),
        s({ kind: "email", from: "owner", approved: false, email: email("Following up", ["Hi {{first_name|there}},", "Thanks for getting in touch. Reply to this email with anything else we can help with."]) }),
      ],
    }),
  },
  {
    key: "demo_request",
    name: "Demo request follow-up",
    line: "Route, and nudge until they book",
    body: () => ({
      trigger: { kind: "form", forms: [] },
      goals: [{ kind: "meeting_booked" }],
      entry: { mode: "once", gapDays: 30 },
      steps: [
        s({ kind: "route" }),
        s({ kind: "wait", days: 1, hours: 0 }),
        s({ kind: "email", from: "owner", approved: false, email: email("Picking a time", ["Hi {{first_name|there}},", "Thanks for asking about a demo. Pick a time that works and we'll show you around."], ["Pick a time", "https://"]) }),
        s({ kind: "wait", days: 2, hours: 0 }),
        s({ kind: "slack", to: "owner", text: "A demo request hasn't booked yet." }),
      ],
    }),
  },
  {
    key: "no_show",
    name: "No-show follow-up",
    line: "An email and a Slack note for their owner",
    body: () => ({
      trigger: { kind: "meeting", events: ["no_show"], types: [] },
      goals: [{ kind: "meeting_booked" }],
      entry: { mode: "repeat", gapDays: 7 },
      steps: [
        s({ kind: "wait", days: 0, hours: 1 }),
        s({ kind: "email", from: "owner", approved: false, email: email("Sorry we missed you", ["Hi {{first_name|there}},", "We missed you earlier. Pick another time and we'll keep it short.", "Pick a new time: {{reschedule_link|reply to this email and we'll find one}}"]) }),
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
        s({ kind: "slack", to: "owner", text: "A lead sent a form and hasn't booked yet." }),
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
];

export const templateByKey = (k: string) => TEMPLATES.find((t) => t.key === k);

/**
 * The starting set every workspace gets the first time Workflows opens (supabase/migrations/119_workflow_defaults.sql):
 * Notification and Follow-up, as drafts with unapproved emails, so nothing sends until someone publishes.
 */
export const STARTING: { folder: string; key: string }[] = [
  { folder: "Notification", key: "form_announcement" },
  { folder: "Notification", key: "meeting_announcement" },
  { folder: "Follow-up", key: "form_followup" },
  { folder: "Follow-up", key: "meeting_followup" },
  { folder: "Follow-up", key: "no_show" },
];

/** The starting set as workflow_defaults takes it: each one's folder, name and draft body. */
export const startingItems = () =>
  STARTING.map(({ folder, key }) => {
    const t = templateByKey(key)!;
    return { folder, name: t.name, draft: t.body() };
  });
