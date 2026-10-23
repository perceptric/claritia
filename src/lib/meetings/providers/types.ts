// What Meetings asks of a connected calendar beyond the core interface (src/lib/meetings/provider.ts): busy times per
// calendar (so each calendar's cache is replaced on its own), changing an event's guests, and push channels.

import type { BusySpan, Calendar, CalendarProvider, EventInput } from "../provider.ts";

/**
 * The meeting's guests outside the team: the lead, and a poll's other voters. Claritia sends them its own invite with
 * an .ics, so providers never email them: Google keeps them on the event with sendUpdates=none, and Microsoft (which
 * always emails attendees) names them in the event's body instead. `guests` is then the co-hosts only, who are
 * invited by the provider as usual on Microsoft.
 */
export type Lead = { email: string; name?: string | null };
export type FullEventInput = EventInput & { leads?: Lead[] };
export type EventUpdate = { start: number; end: number; guests?: string[]; leads?: Lead[] };

/** A listed calendar; `own` when the person owns it (theirs count as busy by default, others' shared ones don't). */
export type OwnCalendar = Calendar & { own?: boolean };

/** A push channel: a Google events.watch channel or a Graph subscription. `expires` is epoch ms. */
export type Channel = { id: string; resource: string; expires: number };

export interface FullProvider extends CalendarProvider {
  calendars(): Promise<OwnCalendar[]>;
  create(calendarId: string, e: FullEventInput): ReturnType<CalendarProvider["create"]>;
  /** Busy times by calendar. A calendar the provider couldn't read is left out, so its cache stays as it was. */
  busyBy(calendarIds: string[], from: number, to: number): Promise<Record<string, BusySpan[]>>;
  /** Move an event and, when given, replace its co-hosts (and the lead, as on create). */
  update(calendarId: string, eventId: string, c: EventUpdate): Promise<void>;
  /** Start a push channel on one calendar to `address`, signed with `token`. */
  watch?(calendarId: string, address: string, token: string): Promise<Channel>;
  /** Push a channel's end further out; false when the provider can't (Google), so a new one is made. */
  renew?(c: Channel): Promise<Channel | null>;
  unwatch?(c: Channel): Promise<void>;
  /** The signed-in account's email. */
  email?(): Promise<string>;
}

/** A Zoom meeting made for a booking whose location is Zoom. */
export interface ZoomClient {
  create(m: { topic: string; start: number; end: number; key: string }): Promise<{ id: string; joinUrl: string }>;
  move(id: string, start: number, end: number): Promise<void>;
  cancel(id: string): Promise<void>;
  email(): Promise<string | null>;
}
