// What every calendar provider does for Meetings (docs/meetings-scheduler.md 1.1 to 1.3): list calendars, read busy
// times, and create, move and cancel events. Google, Microsoft and Zoom implement it in src/lib/meetings/providers/;
// the fake one here stands in for tests and the local stack, so a booking can run end to end without a real account.

import type { Span } from "./types.ts";

export type Calendar = { id: string; name: string; primary: boolean };
export type BusySpan = Span & { ooo?: boolean };

export type EventInput = {
  title: string;
  description: string;
  start: number;
  end: number;
  /** The lead's and any co-host's emails. */
  guests: string[];
  /** Ask the provider for a video link (Meet on Google, Teams on Microsoft). */
  conference: boolean;
  /** A location line (address, phone, or a Zoom link made separately). */
  where?: string;
  /** The meeting id, so a retried create never makes a second event. */
  key: string;
};

export type EventResult = { id: string; joinUrl?: string };

export interface CalendarProvider {
  calendars(): Promise<Calendar[]>;
  busy(calendarIds: string[], from: number, to: number): Promise<BusySpan[]>;
  create(calendarId: string, e: EventInput): Promise<EventResult>;
  move(calendarId: string, eventId: string, start: number, end: number): Promise<void>;
  cancel(calendarId: string, eventId: string): Promise<void>;
}

/** Thrown when the provider says the sign-in no longer works: the account goes to "reconnect". */
export class ReconnectError extends Error {}

/**
 * An in-memory calendar. `busy` starts with the spans given; created events are kept so tests can read them, and
 * a create with a key that was seen returns the first event (as Google does with a request id).
 */
export function fakeProvider(o: { busy?: BusySpan[]; fail?: { create?: number; busy?: boolean; revoked?: boolean } } = {}) {
  const events = new Map<string, EventInput & { id: string; calendarId: string; canceled?: boolean }>();
  let createFails = o.fail?.create ?? 0;
  const p: CalendarProvider & { events: typeof events; busySpans: BusySpan[] } = {
    events,
    busySpans: [...(o.busy ?? [])],
    async calendars() {
      if (o.fail?.revoked) throw new ReconnectError("revoked");
      return [{ id: "primary", name: "Work", primary: true }];
    },
    async busy(_ids, from, to) {
      if (o.fail?.revoked) throw new ReconnectError("revoked");
      if (o.fail?.busy) throw new Error("provider down");
      const live = [...events.values()].filter((e) => !e.canceled).map((e) => ({ start: e.start, end: e.end }));
      return [...p.busySpans, ...live].filter((b) => b.start < to && b.end > from);
    },
    async create(calendarId, e) {
      if (createFails > 0) {
        createFails--;
        throw new Error("provider down");
      }
      const seen = [...events.values()].find((x) => x.key === e.key);
      if (seen) return { id: seen.id, joinUrl: `https://meet.example/${seen.id}` };
      const id = `ev_${events.size + 1}`;
      events.set(id, { ...e, id, calendarId });
      return { id, joinUrl: e.conference ? `https://meet.example/${id}` : undefined };
    },
    async move(_c, id, start, end) {
      const e = events.get(id);
      if (e) Object.assign(e, { start, end });
    },
    async cancel(_c, id) {
      const e = events.get(id);
      if (e) e.canceled = true;
    },
  };
  return p;
}
