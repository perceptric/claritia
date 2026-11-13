// Meetings (docs/meetings-scheduler.md): the shapes shared by the slot engine, the booking routes, the screens and the
// jobs. Times inside the engine are epoch milliseconds; days and clock times are in a person's own time zone. Runs in
// the browser and on the server.

import type { Dynamic } from "../routing/compile.ts";

export type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export const DAYS: Day[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** A clock range in a person's time zone, "09:00" to "17:00". */
export type Range = [string, string];

export type Availability = {
  tz: string;
  weekly: Record<Day, Range[]>;
  /** One date's own hours (YYYY-MM-DD); an empty list is a day off. */
  overrides: { date: string; ranges: Range[] }[];
};

export const DEFAULT_AVAILABILITY = (tz = "UTC"): Availability => ({
  tz,
  weekly: { mon: [["09:00", "17:00"]], tue: [["09:00", "17:00"]], wed: [["09:00", "17:00"]], thu: [["09:00", "17:00"]], fri: [["09:00", "17:00"]], sat: [], sun: [] },
  overrides: [],
});

/** A busy or booked span, epoch ms, end not included. */
export type Span = { start: number; end: number };

export type Kind = "one" | "round_robin" | "collective" | "owner_first" | "double" | "group";

export const KINDS: { value: Kind; label: string }[] = [
  { value: "one", label: "One-on-one" },
  { value: "round_robin", label: "Round robin" },
  { value: "collective", label: "Collective" },
  { value: "owner_first", label: "Account owner first" },
  { value: "double", label: "Paired round robin" },
  { value: "group", label: "Group" },
];

export type Host = {
  user_id: string;
  /** Round robin: a bigger weight gets more meetings (1 to 10). */
  weight?: number;
  /** Round robin: a lower tier is picked first when counts tie. */
  tier?: number;
  /** Two teams: which pool the host is in. */
  pool?: "a" | "b";
};

export type Location =
  | { kind: "google_meet" }
  | { kind: "teams" }
  | { kind: "zoom" }
  /** A Webex meeting or a Whereby room per booking, on the team's own Webex or Whereby (Next step 12). */
  | { kind: "webex" }
  | { kind: "whereby" }
  | { kind: "phone_guest" }
  | { kind: "phone_host"; number: string }
  | { kind: "in_person"; address: string }
  | { kind: "link"; url: string };

export type TypeSettings = {
  /** Minutes; the guest picks when there are several. */
  lengths: number[];
  location: Location;
  /** Minutes kept free before and after each meeting. */
  bufferBefore: number;
  bufferAfter: number;
  /** Minutes from now before the first bookable start. */
  notice: number;
  /** Days ahead that can be booked. */
  window: number;
  /** Meetings per host per day and per week (Monday to Sunday in the host's zone); 0 is no cap. */
  perDay: number;
  perWeek: number;
  /** Minutes between possible starts. */
  step: number;
  /** Round robin: flexible shows every free host's times; strict only the next host's. */
  rrMode: "flexible" | "strict";
  /** Group types: guests per meeting. */
  seats: number;
  /** Who a reschedule can move to. */
  reschedule: "same_host" | "pool";
  /** Minutes before the start that reminder emails go out. */
  reminders: number[];
  /** After a no-show, one email to the guest with the host's next times. */
  noShowFollowUp: boolean;
  confirmation: { kind: "message"; text?: string } | { kind: "redirect"; url: string };
  /**
   * The meeting's own words (what it's for, what to bring): under its name on the booking page, at the top of the
   * calendar event and the invite, and in the confirmation email. Plain text, line breaks kept, 2,000 characters.
   */
  description?: string;
  /** "What we'll cover": short lines on the booking page under the description (at most 8). */
  agenda?: string[];
  /** "Before the call": short lines on the confirmed screen (at most 8). */
  prep?: string[];
  /** Paid types: amount in the smallest unit (cents) and the currency; refunded when the host cancels. */
  /** provider: who takes the payment; Stripe when left out (Next step 12 adds PayPal and Square). */
  price?: { amount: number; currency: string; provider?: "paypal" | "square" };
  /** A named schedule (availability_schedules): each host's schedule of this name, else their default hours. */
  schedule?: string;
  /**
   * Round robin and owner first: a Routing team (a live router queue's id). Its members are the hosts and the confirm
   * takes the queue's turn (src/lib/meetings/team.ts); `hosts` keeps the last members seen, for when the router is down.
   */
  team?: string;
  /**
   * A form's own meeting (docs/on-submission.md): the form it belongs to. It's set up in the form's On Submission,
   * kept off booking pages (secret) and listed under "In forms" in Meetings, not with the standalone meetings.
   */
  form?: string;
  /**
   * A Dynamic meeting (docs/on-submission.md): its own routing, rules to a rep or a team and Otherwise. Left out, the
   * meeting is Individual (or one of the older kinds). Forms compile it into their routing policy at publish.
   */
  dynamic?: Dynamic;
  /** Extra questions on the booking page: the form studio's fields. */
  questions: { id: string; label: string; type: QuestionType; required: boolean; options?: string[] }[];
};

export const DEFAULT_SETTINGS: TypeSettings = {
  lengths: [30],
  location: { kind: "google_meet" },
  bufferBefore: 0,
  bufferAfter: 0,
  notice: 240,
  window: 14,
  perDay: 0,
  perWeek: 0,
  step: 30,
  rrMode: "flexible",
  seats: 1,
  reschedule: "same_host",
  reminders: [1440, 60],
  noShowFollowUp: true,
  confirmation: { kind: "message" },
  questions: [],
};

/** Booking question kinds (src/lib/meetings/questions.ts). */
export type QuestionType = "text" | "textarea" | "email" | "phone" | "number" | "url" | "date" | "choice" | "multi" | "yesno" | "rating" | "country" | "checkbox" | "sms";

export type MeetingType = {
  id: string;
  workspace_id: string;
  slug: string;
  name: string;
  kind: Kind;
  hosts: Host[];
  settings: TypeSettings;
  /** Hidden from booking pages; shared by link only. */
  secret: boolean;
  active: boolean;
  /** A personal type belongs to one person's page. */
  owner_user_id: string | null;
  /** Managed types: the template it was made from and the settings people can't change. */
  template_id: string | null;
  locked: (keyof TypeSettings | "name" | "kind")[];
};

export type MeetingStatus = "pending_payment" | "booked" | "canceled" | "held" | "no_show";
export type MeetingSource = "page" | "form" | "handoff" | "one_off" | "poll" | "api";

/** A bookable start and the hosts free at it. */
export type Slot = { start: number; hosts: string[] };
