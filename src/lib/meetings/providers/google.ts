// Google Calendar (docs/meetings-scheduler.md 1.1 to 1.3): the calendar list, free/busy, events with Meet links, and
// events.watch push channels. Event ids are made from the booking's key, so a retried create finds the first event
// (Google answers 409) instead of making a second one. Only busy start and end times are read, never titles.
// Every write uses sendUpdates=none: Claritia sends the lead its own invite (.ics), so Google never sends a second.

import type { BusySpan, EventResult } from "../provider.ts";
import { iso, keyId, makeHttp, ProviderError, type HttpOpts, type Tok } from "./http.ts";
import type { Channel, FullEventInput, FullProvider, Lead, OwnCalendar } from "./types.ts";

const API = "https://www.googleapis.com/calendar/v3";
const DAY = 86_400_000;
const enc = encodeURIComponent;

type GEvent = { id: string; status?: string; hangoutLink?: string; conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] } };

/** The guests and the co-hosts, shown on the event; with sendUpdates=none none of them is emailed by Google. */
const attendees = (guests: string[], leads: Lead[] = []) => [...leads.map((l) => ({ email: l.email, ...(l.name ? { displayName: l.name } : {}) })), ...guests.map((email) => ({ email }))];

const joinUrl = (e: GEvent) => e.hangoutLink ?? e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri;

export function googleProvider(token: Tok | null, o: HttpOpts = {}): FullProvider {
  const http = makeHttp("google", token, o);

  const busyBy = async (ids: string[], from: number, to: number) => {
    const out: Record<string, BusySpan[]> = {};
    const failed = new Set<string>();
    // Free/busy takes up to 50 calendars a call; long spans go in 30-day pieces.
    for (let i = 0; i < ids.length; i += 50) {
      const items = ids.slice(i, i + 50);
      for (let a = from; a < to; a += 30 * DAY) {
        const b = Math.min(to, a + 30 * DAY);
        const { data } = await http<{ calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: unknown[] }> }>(`${API}/freeBusy`, {
          method: "POST",
          body: JSON.stringify({ timeMin: iso(a), timeMax: iso(b), items: items.map((id) => ({ id })) }),
        });
        for (const id of items) {
          const c = data.calendars?.[id];
          if (!c || c.errors?.length) {
            failed.add(id);
            continue;
          }
          (out[id] ??= []).push(...(c.busy ?? []).map((x) => ({ start: Date.parse(x.start), end: Date.parse(x.end) })));
        }
      }
    }
    for (const id of failed) delete out[id];
    return out;
  };

  const update: FullProvider["update"] = async (calendarId, eventId, c) => {
    const body = { start: { dateTime: iso(c.start) }, end: { dateTime: iso(c.end) }, ...(c.guests || c.leads ? { attendees: attendees(c.guests ?? [], c.leads) } : {}) };
    await http(`${API}/calendars/${enc(calendarId)}/events/${enc(eventId)}?sendUpdates=none`, { method: "PATCH", body: JSON.stringify(body) });
  };

  return {
    async calendars() {
      const all: OwnCalendar[] = [];
      let page = "";
      do {
        const q = new URLSearchParams({ minAccessRole: "freeBusyReader", maxResults: "250", ...(page ? { pageToken: page } : {}) });
        const { data } = await http<{ items?: { id: string; summary?: string; summaryOverride?: string; primary?: boolean; accessRole?: string }[]; nextPageToken?: string }>(
          `${API}/users/me/calendarList?${q}`,
        );
        for (const c of data.items ?? []) all.push({ id: c.id, name: (c.summaryOverride || c.summary || c.id).slice(0, 300), primary: !!c.primary, own: c.accessRole === "owner" });
        page = data.nextPageToken ?? "";
      } while (page);
      return all;
    },

    busyBy,

    async busy(ids, from, to) {
      const by = await busyBy(ids, from, to);
      if (ids.length && !Object.keys(by).length) throw new ProviderError("google: no calendar could be read", 502);
      return Object.values(by).flat();
    },

    async create(calendarId: string, e: FullEventInput): Promise<EventResult> {
      const id = keyId(e.key);
      const body = {
        id,
        summary: e.title,
        description: e.description,
        start: { dateTime: iso(e.start) },
        end: { dateTime: iso(e.end) },
        attendees: attendees(e.guests, e.leads),
        ...(e.where ? { location: e.where } : {}),
        ...(e.conference ? { conferenceData: { createRequest: { requestId: id, conferenceSolutionKey: { type: "hangoutsMeet" } } } } : {}),
      };
      try {
        const { data } = await http<GEvent>(`${API}/calendars/${enc(calendarId)}/events?conferenceDataVersion=1&sendUpdates=none`, { method: "POST", body: JSON.stringify(body) });
        return { id: data.id, joinUrl: joinUrl(data) };
      } catch (err) {
        // The id is taken: an earlier try made the event. Return that one.
        if (!(err instanceof ProviderError) || err.status !== 409) throw err;
        const { data } = await http<GEvent>(`${API}/calendars/${enc(calendarId)}/events/${id}`);
        return { id: data.id, joinUrl: joinUrl(data) };
      }
    },

    move: (calendarId, eventId, start, end) => update(calendarId, eventId, { start, end }),

    update,

    async cancel(calendarId, eventId) {
      await http(`${API}/calendars/${enc(calendarId)}/events/${enc(eventId)}?sendUpdates=none`, { method: "DELETE", ok404: true });
    },

    async watch(calendarId, address, token): Promise<Channel> {
      const id = crypto.randomUUID();
      const { data } = await http<{ id: string; resourceId: string; expiration?: string }>(`${API}/calendars/${enc(calendarId)}/events/watch`, {
        method: "POST",
        body: JSON.stringify({ id, type: "web_hook", address, token, params: { ttl: String(7 * 86_400) } }),
      });
      return { id: data.id, resource: data.resourceId, expires: Number(data.expiration) || Date.now() + 7 * DAY };
    },

    // Google channels can't be extended: a new one is made and the old one stopped.
    async renew() {
      return null;
    },

    async unwatch(c) {
      await http(`${API}/channels/stop`, { method: "POST", body: JSON.stringify({ id: c.id, resourceId: c.resource }), ok404: true });
    },

    async email() {
      const { data } = await http<{ email?: string }>("https://www.googleapis.com/oauth2/v2/userinfo");
      if (!data.email) throw new ProviderError("google: no email on the account", 502);
      return data.email;
    },
  };
}
