// Fake Google Calendar, Microsoft Graph and Zoom servers for the calendar tests: a fetch that answers the calls
// src/lib/meetings/providers/ makes, shaped like each provider's documented responses, and can be told to fail.

type Call = { method: string; url: URL; body: Record<string, unknown> | null; headers: Headers };
type Busy = { start: number; end: number };

export const json = (x: unknown, status = 200) => new Response(x === undefined ? null : JSON.stringify(x), { status, headers: { "content-type": "application/json" } });
const iso = (ms: number) => new Date(ms).toISOString();

function read(input: RequestInfo | URL, init?: RequestInit): Call {
  const url = new URL(String(input));
  const raw = init?.body;
  const body = typeof raw === "string" ? (JSON.parse(raw) as Record<string, unknown>) : raw instanceof URLSearchParams ? Object.fromEntries(raw) : null;
  return { method: init?.method ?? "GET", url, body, headers: new Headers(init?.headers) };
}

/** Knobs every fake shares. */
type Knobs = {
  calls: Call[];
  /** The token endpoint's answer. */
  token: { status: number; body: Record<string, unknown> };
  /** Answer the next n API calls with 401. */
  unauthorized: number;
  /** Never answer (and ignore the abort), like a provider that hangs. */
  hang: boolean;
};

const knobs = (): Knobs => ({ calls: [], token: { status: 200, body: { access_token: "fresh-access", expires_in: 3600 } }, unauthorized: 0, hang: false });

export function fakeGoogle(busy: Record<string, Busy[]> = {}) {
  const s = {
    ...knobs(),
    busy,
    /** Calendars freeBusy can't read. */
    errors: [] as string[],
    calendars: [
      { id: "me@acme.io", summary: "Me", primary: true, accessRole: "owner" },
      { id: "team@acme.io", summary: "Team", accessRole: "owner" },
      { id: "boss@acme.io", summary: "Boss", accessRole: "freeBusyReader" },
    ] as Record<string, unknown>[],
    events: new Map<string, Record<string, unknown> & { calendar: string; status: string }>(),
    /** Make the next n creates store the event and then answer 500 (the answer is lost). */
    loseCreate: 0,
    /** Answer the next n creates with 503 without storing anything. */
    failCreate: 0,
    channels: [] as Record<string, unknown>[],
    stopped: [] as string[],
  };
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const c = read(input, init);
    s.calls.push(c);
    if (s.hang) return new Promise<Response>(() => {});
    if (c.url.host === "oauth2.googleapis.com") return json(s.token.body, s.token.status);
    if (s.unauthorized > 0) {
      s.unauthorized--;
      return json({ error: { code: 401, message: "Invalid Credentials" } }, 401);
    }
    if (c.url.pathname === "/oauth2/v2/userinfo") return json({ email: "me@acme.io" });
    const p = c.url.pathname.replace("/calendar/v3", "");
    if (p === "/users/me/calendarList") return json({ items: s.calendars });
    if (p === "/freeBusy") {
      const from = Date.parse(String(c.body!.timeMin));
      const to = Date.parse(String(c.body!.timeMax));
      const items = c.body!.items as { id: string }[];
      return json({
        kind: "calendar#freeBusy",
        timeMin: c.body!.timeMin,
        timeMax: c.body!.timeMax,
        calendars: Object.fromEntries(
          items.map(({ id }) => [
            id,
            s.errors.includes(id)
              ? { errors: [{ domain: "global", reason: "notFound" }], busy: [] }
              : { busy: [...(s.busy[id] ?? []), ...[...s.events.values()].filter((e) => e.calendar === id && e.status !== "cancelled").map((e) => ({ start: Date.parse((e.start as { dateTime: string }).dateTime), end: Date.parse((e.end as { dateTime: string }).dateTime) }))].filter((b) => b.start < to && b.end > from).map((b) => ({ start: iso(b.start), end: iso(b.end) })) },
          ]),
        ),
      });
    }
    if (p === "/channels/stop") {
      s.stopped.push(String(c.body!.id));
      return new Response(null, { status: 204 });
    }
    const w = p.match(/^\/calendars\/([^/]+)\/events\/watch$/);
    if (w) {
      const ch = { kind: "api#channel", id: c.body!.id, resourceId: `res-${s.channels.length + 1}`, resourceUri: "https://www.googleapis.com/calendar/v3/calendars/x/events", token: c.body!.token, expiration: String(Date.now() + 7 * 86_400_000) };
      s.channels.push({ ...ch, calendar: decodeURIComponent(w[1]!), address: c.body!.address });
      return json(ch);
    }
    const m = p.match(/^\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/);
    if (m) {
      const cal = decodeURIComponent(m[1]!);
      const id = m[2] ? decodeURIComponent(m[2]) : undefined;
      if (c.method === "POST" && !id) {
        if (s.failCreate > 0) {
          s.failCreate--;
          return json({ error: { code: 503, message: "Backend Error" } }, 503);
        }
        const eid = String(c.body!.id);
        if (s.events.has(eid)) return json({ error: { code: 409, message: "The requested identifier already exists." } }, 409);
        const ev = { ...c.body!, kind: "calendar#event", id: eid, calendar: cal, status: "confirmed", ...(c.body!.conferenceData ? { hangoutLink: `https://meet.google.com/${eid.slice(0, 3)}-${eid.slice(3, 7)}-${eid.slice(7, 10)}` } : {}) };
        s.events.set(eid, ev);
        if (s.loseCreate > 0) {
          s.loseCreate--;
          return json({ error: { code: 500, message: "Backend Error" } }, 500);
        }
        return json(ev);
      }
      const ev = id ? s.events.get(id) : undefined;
      if (!ev) return json({ error: { code: 404, message: "Not Found" } }, 404);
      if (c.method === "GET") return json(ev);
      if (c.method === "PATCH") {
        Object.assign(ev, c.body);
        return json(ev);
      }
      if (c.method === "DELETE") {
        if (ev.status === "cancelled") return json({ error: { code: 410, message: "Resource has been deleted" } }, 410);
        ev.status = "cancelled";
        return new Response(null, { status: 204 });
      }
    }
    return json({ error: { code: 404, message: `No fake for ${c.method} ${p}` } }, 404);
  }) as typeof fetch;
  return { s, fetcher };
}

export function fakeMicrosoft() {
  const s = {
    ...knobs(),
    pageSize: 2,
    view: {} as Record<string, { start: string; end: string; showAs: string; isCancelled?: boolean }[]>,
    events: new Map<string, Record<string, unknown>>(),
    byTransaction: new Map<string, string>(),
    /** A personal account: Teams meetings are refused. */
    personal: false,
    subscriptions: new Map<string, Record<string, unknown>>(),
    canceled: [] as string[],
  };
  const API = "https://graph.microsoft.com/v1.0";
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const c = read(input, init);
    s.calls.push(c);
    if (s.hang) return new Promise<Response>(() => {});
    if (c.url.host === "login.microsoftonline.com") return json(s.token.body, s.token.status);
    if (s.unauthorized > 0) {
      s.unauthorized--;
      return json({ error: { code: "InvalidAuthenticationToken", message: "Access token has expired or is not yet valid." } }, 401);
    }
    const p = c.url.pathname.replace("/v1.0", "");
    if (p === "/me") return json({ mail: null, userPrincipalName: "sam@contoso.com" });
    if (p === "/me/calendars")
      return json({
        value: [
          { id: "AAMkDef", name: "Calendar", isDefaultCalendar: true, owner: { name: "Sam", address: "sam@contoso.com" } },
          { id: "AAMkSide", name: "Side", isDefaultCalendar: false, owner: { name: "Sam", address: "Sam@Contoso.com" } },
          { id: "AAMkBoss", name: "Boss", isDefaultCalendar: false, owner: { name: "Boss", address: "boss@contoso.com" } },
        ],
      });
    const v = p.match(/^\/me\/calendars\/([^/]+)\/calendarView$/);
    if (v) {
      const all = s.view[decodeURIComponent(v[1]!)] ?? [];
      const skip = Number(c.url.searchParams.get("$skip") ?? 0);
      const page = all.slice(skip, skip + s.pageSize).map((e) => ({ start: { dateTime: e.start, timeZone: "UTC" }, end: { dateTime: e.end, timeZone: "UTC" }, showAs: e.showAs, isCancelled: !!e.isCancelled }));
      const next = skip + s.pageSize < all.length ? `${API}${p}?${new URLSearchParams({ ...Object.fromEntries(c.url.searchParams), $skip: String(skip + s.pageSize) })}` : undefined;
      return json({ value: page, ...(next ? { "@odata.nextLink": next } : {}) });
    }
    const create = p.match(/^\/me\/calendars\/([^/]+)\/events$/);
    if (create && c.method === "POST") {
      if (c.body!.isOnlineMeeting && s.personal) return json({ error: { code: "ErrorInvalidRequest", message: "Online meeting provider is not supported." } }, 400);
      const tx = String(c.body!.transactionId);
      const known = s.byTransaction.get(tx);
      if (known) return json(s.events.get(known), 201);
      const id = `AAMkEv${s.events.size + 1}`;
      const ev = { ...c.body!, id, calendar: decodeURIComponent(create[1]!), onlineMeeting: c.body!.isOnlineMeeting ? { joinUrl: `https://teams.microsoft.com/l/meetup-join/${id}` } : null };
      s.events.set(id, ev);
      s.byTransaction.set(tx, id);
      return json(ev, 201);
    }
    const ev = p.match(/^\/me\/events\/([^/]+)(\/cancel)?$/);
    if (ev) {
      const e = s.events.get(decodeURIComponent(ev[1]!));
      if (!e) return json({ error: { code: "ErrorItemNotFound", message: "The specified object was not found in the store." } }, 404);
      if (ev[2]) {
        s.canceled.push(String(e.id));
        return new Response(null, { status: 202 });
      }
      if (c.method === "PATCH") {
        Object.assign(e, c.body);
        return json(e);
      }
      return json(e);
    }
    if (p === "/subscriptions" && c.method === "POST") {
      const id = `sub-${s.subscriptions.size + 1}`;
      const sub = { id, ...c.body! };
      s.subscriptions.set(id, sub);
      return json(sub, 201);
    }
    const sub = p.match(/^\/subscriptions\/([^/]+)$/);
    if (sub) {
      const x = s.subscriptions.get(sub[1]!);
      if (!x) return json({ error: { code: "ResourceNotFound", message: "Subscription not found" } }, 404);
      if (c.method === "DELETE") {
        s.subscriptions.delete(sub[1]!);
        return new Response(null, { status: 204 });
      }
      Object.assign(x, c.body);
      return json(x);
    }
    return json({ error: { code: "NotFound", message: `No fake for ${c.method} ${p}` } }, 404);
  }) as typeof fetch;
  return { s, fetcher };
}

export function fakeZoom() {
  const s = { ...knobs(), meetings: new Map<string, Record<string, unknown>>(), deleted: [] as string[] };
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const c = read(input, init);
    s.calls.push(c);
    if (c.url.host === "zoom.us") return json(s.token.body, s.token.status);
    const p = c.url.pathname.replace("/v2", "");
    if (p === "/users/me/meetings" && c.method === "POST") {
      const id = 85_000_000_000 + s.meetings.size + 1;
      const m = { id, ...c.body!, join_url: `https://us02web.zoom.us/j/${id}` };
      s.meetings.set(String(id), m);
      return json(m, 201);
    }
    if (p === "/users/me") return json({ code: 4711, message: "Invalid access token, does not contain scopes:[user:read:user]." }, 400);
    const m = p.match(/^\/meetings\/(\d+)$/);
    if (m) {
      if (!s.meetings.has(m[1]!)) return json({ code: 3001, message: "Meeting does not exist" }, 404);
      if (c.method === "DELETE") {
        s.deleted.push(m[1]!);
        s.meetings.delete(m[1]!);
      } else Object.assign(s.meetings.get(m[1]!)!, c.body);
      return new Response(null, { status: 204 });
    }
    return json({ code: 404, message: "No fake" }, 404);
  }) as typeof fetch;
  return { s, fetcher };
}

/** Send each call to the fake for its host. */
export function byHost(f: { google?: typeof fetch; microsoft?: typeof fetch; zoom?: typeof fetch }): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const h = new URL(String(input)).host;
    const pick = /google/.test(h) ? f.google : /microsoft/.test(h) ? f.microsoft : /zoom/.test(h) ? f.zoom : undefined;
    return pick ? pick(input, init) : Promise.resolve(json({ error: "no fake" }, 404));
  }) as typeof fetch;
}
