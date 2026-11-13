// The meeting workflows (docs/workflows-plan.md, Part A): the emails Claritia sends for every meeting, shown and
// edited as workflows. Each is a live workflow with a `meeting_kind` (165_meeting_flows.sql) whose Meeting email steps
// name a System email (164). The meeting worker still sends those emails (the calendar invite, one send per meeting,
// the host's own inbox and the retries stay as they are); it reads from these workflows which emails are on and, from
// the Reminders workflow's Delay steps, when reminders go. Any other step added to them runs like any workflow's.
// Runs in the browser and on the server.

import { SYSTEM_META, type SystemKey } from "../meetings/systemEmails.ts";
import type { Body, Step } from "./types.ts";

export const MEETING_FLOW_KINDS = ["confirmed", "reminders", "moved", "canceled", "after", "no_show", "pick_time"] as const;
export type MeetingFlowKind = (typeof MEETING_FLOW_KINDS)[number];
export const isMeetingFlowKind = (k: unknown): k is MeetingFlowKind => (MEETING_FLOW_KINDS as readonly unknown[]).includes(k);

/** The workflow each System email belongs to. */
export const FLOW_OF: Record<SystemKey, MeetingFlowKind> = {
  confirm: "confirmed",
  host_booked: "confirmed",
  reminder: "reminders",
  update: "moved",
  host_moved: "moved",
  cancel: "canceled",
  host_canceled: "canceled",
  after: "after",
  no_show: "no_show",
  book_later: "pick_time",
};

/** Workflows that carry the calendar invite: never paused or deleted. */
export const REQUIRED_FLOWS: readonly MeetingFlowKind[] = ["confirmed", "moved", "canceled"];
export const isRequiredFlow = (k: string | null | undefined) => !!k && (REQUIRED_FLOWS as readonly string[]).includes(k);
/** A Meeting email step that can't be removed: the guest's email with the invite. */
export const lockedStep = (s: Step) => s.kind === "meeting_email" && SYSTEM_META[s.key].required;

/** The folder the meeting workflows go in. */
export const MEETING_FOLDER = "Meetings";
/** The older starting workflows these replace; removed where they were never published (165). */
export const RETIRED_STARTING = ["Meeting announcement", "Meeting follow-up", "No-show follow-up"];

const DEFAULT_ENTRY = { mode: "repeat" as const, gapDays: 1 };
let n = 0;
const sid = (k: string) => `${k.replace(/_/g, "").slice(0, 8)}${(n++).toString(36)}`;
const mail = (key: SystemKey): Step => ({ id: sid(key), kind: "meeting_email", key });
const before = (days: number, hours: number): Step => ({ id: sid("wait"), kind: "wait", days, hours, before: "meeting" });

/** Each meeting workflow as it starts: its name and body. */
export function meetingFlow(kind: MeetingFlowKind, reminders: number[] = [1440, 60]): { name: string; body: Body } {
  const meeting = (events: ("booked" | "canceled" | "held" | "no_show" | "rescheduled")[]): Body["trigger"] => ({ kind: "meeting", events, types: [] });
  const body = (trigger: Body["trigger"], steps: Step[]): Body => ({ trigger, steps, goals: [], entry: DEFAULT_ENTRY });
  switch (kind) {
    case "confirmed":
      return { name: "Booking confirmed", body: body(meeting(["booked"]), [mail("confirm"), mail("host_booked")]) };
    case "reminders": {
      const times = [...new Set(reminders.filter((m) => Number.isInteger(m) && m > 0))].sort((a, b) => b - a);
      return { name: "Reminders", body: body(meeting(["booked"]), times.flatMap((m) => [before(Math.floor(m / 1440), Math.floor((m % 1440) / 60)), mail("reminder")])) };
    }
    case "moved":
      return { name: "Meeting moved", body: body(meeting(["rescheduled"]), [mail("update"), mail("host_moved")]) };
    case "canceled":
      return { name: "Meeting canceled", body: body(meeting(["canceled"]), [mail("cancel"), mail("host_canceled")]) };
    case "after":
      return { name: "After the meeting", body: body(meeting(["booked"]), [mail("after")]) };
    case "no_show":
      return { name: "No-show follow-up", body: body(meeting(["no_show"]), [mail("no_show")]) };
    case "pick_time":
      return { name: "Pick a time", body: body({ kind: "not_booked", forms: [] }, [mail("book_later")]) };
  }
}

/** Reminder times in whole hours (a Delay counts days and hours): 15 minutes becomes an hour. */
export const hourly = (mins: unknown[]): number[] => [...new Set(mins.filter((m): m is number => typeof m === "number" && m > 0).map((m) => Math.max(60, Math.round(m / 60) * 60)))];

/** What meeting_flows_ensure takes: every meeting workflow, in order. */
export const meetingFlowsPayload = (reminders?: number[]) => MEETING_FLOW_KINDS.map((kind) => ({ kind, ...meetingFlow(kind, reminders) }));

/** The Meeting email keys a body sends, at any depth. */
export function flowKeys(body: Pick<Body, "steps">): SystemKey[] {
  const out: SystemKey[] = [];
  const walk = (steps: Step[]) => {
    for (const s of steps) {
      if (s.kind === "meeting_email") out.push(s.key);
      if (s.kind === "branch" || s.kind === "wait_until") (walk(s.yes), walk(s.no));
      if (s.kind === "split") (walk(s.a), walk(s.b));
    }
  };
  walk(body.steps ?? []);
  return out;
}

/**
 * When reminders go, in minutes before the meeting, from the Reminders workflow: each Reminder email after a "Before
 * the meeting" Delay goes that long before. A Reminder with no such Delay before it doesn't go.
 */
export function reminderMinutes(body: Pick<Body, "steps">): number[] {
  const out: number[] = [];
  let wait: number | null = null;
  for (const s of body.steps ?? []) {
    if (s.kind === "wait" && s.before === "meeting") wait = (s.days || 0) * 1440 + (s.hours || 0) * 60;
    else if (s.kind === "meeting_email" && s.key === "reminder" && wait && wait > 0) {
      out.push(wait);
      wait = null;
    }
  }
  return [...new Set(out)].sort((a, b) => b - a);
}

/** A meeting workflow as the worker reads it: its kind, status and live body. */
export type FlowState = { kind: string; status: string; body: unknown };

const bodyOf = (raw: unknown): Pick<Body, "steps"> => (raw && typeof raw === "object" && Array.isArray((raw as { steps?: unknown }).steps) ? (raw as Body) : { steps: [] });

/**
 * Whether a System email goes, by its workflow: when the workspace has no such workflow (before 165, or never opened),
 * it goes as before. The emails with the invite always go.
 */
export function keyOn(flows: FlowState[] | null | undefined, key: SystemKey): boolean {
  if (SYSTEM_META[key].required) return true;
  const f = flows?.find((x) => x.kind === FLOW_OF[key as SystemKey]);
  if (!f) return true;
  if (f.status !== "live") return false;
  return flowKeys(bodyOf(f.body)).includes(key);
}

/** Reminder times from the workspace's Reminders workflow; null when it has none (the meeting type's then count). */
export function flowReminders(flows: FlowState[] | null | undefined): number[] | null {
  const f = flows?.find((x) => x.kind === "reminders");
  if (!f) return null;
  if (f.status !== "live") return [];
  return reminderMinutes(bodyOf(f.body));
}
