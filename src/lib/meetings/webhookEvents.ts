// The meeting webhook events (docs/scheduling-plan.md 5.1), with their labels. Runs anywhere; the sender is in
// webhooks.ts (server only).

export const WEBHOOK_EVENTS = ["meeting.booked", "meeting.rescheduled", "meeting.canceled", "meeting.held", "meeting.no_show"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
export const EVENT_LABEL: Record<WebhookEvent, string> = {
  "meeting.booked": "Booked",
  "meeting.rescheduled": "Rescheduled",
  "meeting.canceled": "Canceled",
  "meeting.held": "Held",
  "meeting.no_show": "No-show",
};
export const isEvent = (v: unknown): v is WebhookEvent => typeof v === "string" && (WEBHOOK_EVENTS as readonly string[]).includes(v);
