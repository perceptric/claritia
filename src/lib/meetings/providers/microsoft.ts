// Microsoft 365 through Graph (docs/meetings-scheduler.md 1.1 to 1.3): calendars, busy times from calendarView with
// showAs ("oof" is out of office), events with Teams links, and subscriptions for push. A create carries a
// transactionId made from the booking's key, so Graph drops a retried POST instead of making a second event.
// Outlook emails every attendee, and Claritia sends the lead its own invite (.ics), so the lead is never an attendee:
// their name and email go in the event's body. Co-hosts (team members) stay attendees.

import type { BusySpan, EventResult } from "../provider.ts";
import { iso, keyId, makeHttp, ProviderError, type HttpOpts, type Tok } from "./http.ts";
import type { Channel, FullEventInput, FullProvider, Lead, OwnCalendar } from "./types.ts";

const API = "https://graph.microsoft.com/v1.0";
const enc = encodeURIComponent;
/** Graph allows event subscriptions up to 7 days; 3 leaves room for a missed renewal. */
const SUB_MS = 3 * 86_400_000;
const BUSY = new Set(["busy", "oof", "tentative"]);
const UTC = { Prefer: 'outlook.timezone="UTC"' };

type GTime = { dateTime: string; timeZone?: string };
type GEvent = { id: string; onlineMeeting?: { joinUrl?: string } | null };

/** Graph's times come back without a zone (UTC, from the Prefer header) and with 7 decimals. */
const parse = (t: GTime) => Date.parse(`${t.dateTime.replace(/(\.\d{3})\d*$/, "$1")}${/[zZ]|[+-]\d\d:\d\d$/.test(t.dateTime) ? "" : "Z"}`);
const at = (ms: number): GTime => ({ dateTime: iso(ms).slice(0, 19), timeZone: "UTC" });
const people = (guests: string[]) => guests.map((address) => ({ emailAddress: { address }, type: "required" }));
const leadLine = (l: Lead) => `Guest: ${l.name ? `${l.name} <${l.email}>` : l.email}`;
const asGuid = (h: string) => `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;

export function microsoftProvider(token: Tok | null, o: HttpOpts = {}): FullProvider {
  const http = makeHttp("microsoft", token, o);

  const busyBy = async (ids: string[], from: number, to: number) => {
    const out: Record<string, BusySpan[]> = {};
    for (const id of ids) {
      try {
        const spans: BusySpan[] = [];
        const q = new URLSearchParams({ startDateTime: iso(from), endDateTime: iso(to), $select: "start,end,showAs,isCancelled", $top: "500" });
        let next: string | undefined = `${API}/me/calendars/${enc(id)}/calendarView?${q}`;
        while (next) {
          const { data }: { data: { value?: { start: GTime; end: GTime; showAs?: string; isCancelled?: boolean }[]; "@odata.nextLink"?: string } } = await http(next, { headers: UTC });
          for (const e of data.value ?? []) {
            if (e.isCancelled || !BUSY.has(e.showAs ?? "busy")) continue;
            spans.push({ start: parse(e.start), end: parse(e.end), ...(e.showAs === "oof" ? { ooo: true } : {}) });
          }
          next = data["@odata.nextLink"];
        }
        out[id] = spans;
      } catch (e) {
        // One calendar that can't be read keeps its cache; a sign-in that's gone stops everything.
        if (!(e instanceof ProviderError)) throw e;
      }
    }
    return out;
  };

  const update: FullProvider["update"] = async (_calendarId, eventId, c) => {
    const body = { start: at(c.start), end: at(c.end), ...(c.guests ? { attendees: people(c.guests) } : {}) };
    await http(`${API}/me/events/${enc(eventId)}`, { method: "PATCH", body: JSON.stringify(body) });
  };

  return {
    async calendars() {
      type C = { id: string; name?: string; isDefaultCalendar?: boolean; owner?: { address?: string } };
      const all: C[] = [];
      let next: string | undefined = `${API}/me/calendars?$select=id,name,isDefaultCalendar,owner&$top=100`;
      while (next) {
        const { data }: { data: { value?: C[]; "@odata.nextLink"?: string } } = await http(next);
        all.push(...(data.value ?? []));
        next = data["@odata.nextLink"];
      }
      // Calendars the person owns share the default calendar's owner; others' shared calendars don't.
      const me = all.find((c) => c.isDefaultCalendar)?.owner?.address?.toLowerCase();
      return all.map((c): OwnCalendar => ({
        id: c.id,
        name: (c.name || "Calendar").slice(0, 300),
        primary: !!c.isDefaultCalendar,
        own: !!c.isDefaultCalendar || (!!me && c.owner?.address?.toLowerCase() === me),
      }));
    },

    busyBy,

    async busy(ids, from, to) {
      const by = await busyBy(ids, from, to);
      if (ids.length && !Object.keys(by).length) throw new ProviderError("microsoft: no calendar could be read", 502);
      return Object.values(by).flat();
    },

    async create(calendarId: string, e: FullEventInput): Promise<EventResult> {
      const body = (teams: boolean) => ({
        subject: e.title,
        body: { contentType: "text", content: [e.lead ? leadLine(e.lead) : "", e.description].filter(Boolean).join("\n\n") },
        start: at(e.start),
        end: at(e.end),
        attendees: people(e.guests),
        ...(e.where ? { location: { displayName: e.where } } : {}),
        ...(teams ? { isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness" } : {}),
        transactionId: asGuid(keyId(e.key)),
      });
      const url = `${API}/me/calendars/${enc(calendarId)}/events`;
      let data: GEvent;
      try {
        ({ data } = await http<GEvent>(url, { method: "POST", body: JSON.stringify(body(e.conference)) }));
      } catch (err) {
        // Personal Outlook accounts can't make Teams meetings: the event goes in without one.
        if (!e.conference || !(err instanceof ProviderError) || err.status !== 400) throw err;
        ({ data } = await http<GEvent>(url, { method: "POST", body: JSON.stringify(body(false)) }));
      }
      let join = data.onlineMeeting?.joinUrl;
      if (e.conference && !join) {
        const again = await http<GEvent>(`${API}/me/events/${enc(data.id)}?$select=onlineMeeting`).catch(() => null);
        join = again?.data.onlineMeeting?.joinUrl;
      }
      return { id: data.id, joinUrl: join ?? undefined };
    },

    move: (calendarId, eventId, start, end) => update(calendarId, eventId, { start, end }),

    update,

    async cancel(_calendarId, eventId) {
      try {
        // Cancel (not delete) sends the co-hosts Outlook's own cancel notice; the lead hears from Claritia.
        await http(`${API}/me/events/${enc(eventId)}/cancel`, { method: "POST", body: JSON.stringify({ comment: "" }), ok404: true });
      } catch (err) {
        if (!(err instanceof ProviderError) || err.status !== 400) throw err;
        await http(`${API}/me/events/${enc(eventId)}`, { method: "DELETE", ok404: true });
      }
    },

    async watch(calendarId, address, token): Promise<Channel> {
      const { data } = await http<{ id: string; resource?: string; expirationDateTime: string }>(`${API}/subscriptions`, {
        method: "POST",
        body: JSON.stringify({
          changeType: "created,updated,deleted",
          notificationUrl: address,
          resource: `me/calendars/${calendarId}/events`,
          expirationDateTime: iso(Date.now() + SUB_MS),
          clientState: token,
        }),
      });
      return { id: data.id, resource: data.resource ?? `me/calendars/${calendarId}/events`, expires: Date.parse(data.expirationDateTime) };
    },

    async renew(c) {
      const { status, data } = await http<{ expirationDateTime?: string }>(`${API}/subscriptions/${enc(c.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ expirationDateTime: iso(Date.now() + SUB_MS) }),
        ok404: true,
      });
      if (status === 404 || status === 410 || !data?.expirationDateTime) return null;
      return { ...c, expires: Date.parse(data.expirationDateTime) };
    },

    async unwatch(c) {
      await http(`${API}/subscriptions/${enc(c.id)}`, { method: "DELETE", ok404: true });
    },

    async email() {
      const { data } = await http<{ mail?: string | null; userPrincipalName?: string }>(`${API}/me?$select=mail,userPrincipalName`);
      const email = data.mail || data.userPrincipalName;
      if (!email) throw new ProviderError("microsoft: no email on the account", 502);
      return email;
    },
  };
}
