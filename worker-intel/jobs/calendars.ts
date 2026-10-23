// Calendars on claritia-intel (docs/meetings-scheduler.md 1.3, 1.6 and 1.7):
//   calendar_refresh  busy times for the next 60 days from every calendar that counts, into busy_blocks (pushes, the
//                     10-minute safety net from calendars_due(), and "refresh now", which also re-reads the list);
//   calendar_watch    Google channels and Graph subscriptions to /api/calendar/hook, renewed a day before they end;
//   meeting_sync      the meeting's event on the lead host's calendar (create, move, cancel), with the Meet, Teams or
//                     Zoom link, then meeting_notify for the emails.
// A provider that refuses the sign-in turns the account to "reconnect" (supabase/migrations/054_calendars.sql).

import { enqueueJob, JobError, type Handler, type Job, type Rpc } from "../../src/lib/jobs.ts";
import { ReconnectError } from "../../src/lib/meetings/provider.ts";
import type { HttpOpts } from "../../src/lib/meetings/providers/http.ts";
import {
  channelToken,
  hookAddress,
  loadAccount,
  markReconnect,
  openProvider,
  openZoom,
  type AccountRow,
  type Channel,
  type FullProvider,
  type ProviderKind,
  type ZoomClient,
} from "../../src/lib/meetings/providers/index.ts";

const DAY = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** meeting_sync retries: about 14 minutes from the first try to the last of five. */
const RETRY_S = [20, 60, 180, 600];

export type CalendarOpts = {
  http?: HttpOpts;
  /** Tests: the provider for an account (the real one when this gives nothing). */
  provider?: (a: AccountRow) => FullProvider | undefined;
  zoom?: (a: AccountRow) => ZoomClient | undefined;
  /** Where pushes go; null skips them. Defaults to APP_URL's /api/calendar/hook when it's https. */
  hook?: string | null;
  now?: () => number;
};

async function call<T>(rpc: Rpc, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

const providerOf = (rpc: Rpc, o: CalendarOpts, a: AccountRow, signal?: AbortSignal) => o.provider?.(a) ?? openProvider(rpc, a, { ...o.http, signal });
const zoomOf = (rpc: Rpc, o: CalendarOpts, a: AccountRow, signal?: AbortSignal) => o.zoom?.(a) ?? openZoom(rpc, a, { ...o.http, signal });

function accountOf(job: Job) {
  const id = String(job.payload.account ?? "");
  if (!UUID.test(id)) throw new JobError(`${job.kind} needs an account`, { retry: false });
  return id;
}

/** Turn a refused sign-in into "reconnect" (the person is told once) and stop retrying. */
async function reconnect(rpc: Rpc, a: AccountRow, e: ReconnectError): Promise<never> {
  await markReconnect(rpc, a.id, e.message);
  throw new JobError(`Reconnect: ${e.message}`, { retry: false });
}

// Busy times ---------------------------------------------------------------------------------------------------

export const calendarRefresh =
  (rpc: Rpc, o: CalendarOpts = {}): Handler =>
  async (job, signal) => {
    let a = await loadAccount(rpc, accountOf(job));
    if (!a || a.status !== "ok" || a.provider === "zoom") return;
    const now = (o.now ?? Date.now)();
    const from = now;
    const to = now + 60 * DAY;
    // The fake calendar's busy times are its cache; only the stamp moves.
    if (a.provider === "fake") {
      await call(rpc, "calendar_busy_save", { p_account: a.id, p_from: new Date(from).toISOString(), p_to: new Date(to).toISOString(), p_rows: {} });
      return;
    }
    const p = providerOf(rpc, o, a, signal);
    try {
      if (job.payload.lists === true) {
        await call(rpc, "calendar_lists_sync", { p_account: a.id, p_calendars: await p.calendars() });
        a = (await loadAccount(rpc, a.id)) ?? a;
      }
      const ids = a.lists.filter((l) => l.busy).map((l) => l.calendar_id);
      const by = ids.length ? await p.busyBy(ids, from, to) : {};
      if (ids.length && !Object.keys(by).length) throw new Error("No calendar could be read");
      const rows = Object.fromEntries(
        Object.entries(by).map(([id, spans]) => [id, spans.map((s) => ({ start: new Date(s.start).toISOString(), end: new Date(s.end).toISOString(), ...(s.ooo ? { ooo: true } : {}) }))]),
      );
      await call(rpc, "calendar_busy_save", { p_account: a.id, p_from: new Date(from).toISOString(), p_to: new Date(to).toISOString(), p_rows: rows });
    } catch (e) {
      if (e instanceof ReconnectError) await reconnect(rpc, a, e);
      throw e;
    }
  };

// Push channels -------------------------------------------------------------------------------------------------

export const calendarWatch =
  (rpc: Rpc, o: CalendarOpts = {}): Handler =>
  async (job, signal) => {
    const a = await loadAccount(rpc, accountOf(job));
    if (!a || a.status !== "ok" || (a.provider !== "google" && a.provider !== "microsoft")) return;
    const now = (o.now ?? Date.now)();
    const address = o.hook === undefined ? hookAddress() : o.hook;
    const channels: Record<string, Channel> = { ...(a.channels ?? {}) };
    if (!address) {
      // No public address (a local run): the 10-minute refresh does the work; look again in 6 hours.
      await call(rpc, "calendar_channels_save", { p_account: a.id, p_channels: {}, p_watch_due: new Date(now + 6 * 3_600_000).toISOString() });
      return;
    }
    const p = providerOf(rpc, o, a, signal);
    const want = new Set(a.lists.filter((l) => l.busy).map((l) => l.calendar_id));
    let failed = false;
    try {
      for (const [cid, ch] of Object.entries(channels)) {
        if (want.has(cid)) continue;
        await p.unwatch?.(ch).catch((e) => {
          if (e instanceof ReconnectError) throw e;
        });
        delete channels[cid];
      }
      for (const cid of want) {
        const ch = channels[cid];
        if (ch && ch.expires > now + DAY) continue;
        try {
          const renewed = ch && p.renew ? await p.renew(ch) : null;
          if (renewed) {
            channels[cid] = renewed;
            continue;
          }
          if (!p.watch) continue;
          channels[cid] = await p.watch(cid, address, channelToken(a.id));
          // Google can't extend a channel: the new one is up, so the old one stops.
          if (ch) await p.unwatch?.(ch).catch(() => undefined);
        } catch (e) {
          if (e instanceof ReconnectError) throw e;
          // Some calendars can't push (Google's holiday calendars); the 10-minute refresh covers them.
          failed = true;
          if (ch && ch.expires <= now) delete channels[cid];
        }
      }
    } catch (e) {
      if (e instanceof ReconnectError) await reconnect(rpc, a, e);
      throw e;
    }
    const ends = Object.values(channels).map((c) => c.expires);
    const due = Math.min(ends.length ? Math.min(...ends) - DAY : now + 6 * 3_600_000, failed ? now + 3_600_000 : Infinity);
    await call(rpc, "calendar_channels_save", { p_account: a.id, p_channels: channels, p_watch_due: new Date(Math.max(due, now + 60_000)).toISOString() });
  };

// Meetings on calendars -----------------------------------------------------------------------------------------

type Ref = { provider: ProviderKind; account: string; calendar: string; event?: string; zoom?: { account: string; id: string; url?: string } };
type HostIn = { user_id: string; email: string | null; cal: (AccountRow & { write: string }) | null; zoom: AccountRow | null };
type Inputs = {
  meeting: {
    id: string;
    workspace_id: string;
    hosts: string[];
    guest_email: string;
    guest_name: string | null;
    answers: Record<string, string>;
    start_at: string;
    end_at: string;
    status: string;
    location: { kind?: string; number?: string; address?: string; url?: string };
    events: Record<string, Ref>;
  };
  title: string;
  questions: { id: string; label: string }[] | null;
  hosts: HostIn[];
};

/** A failure that more tries won't fix: no calendar to write to, or a sign-in that's gone. */
class Final extends Error {}

const EVENT = { create: "booked", move: "moved", cancel: "canceled" } as const;

export const meetingSync =
  (rpc: Rpc, o: CalendarOpts = {}): Handler =>
  async (job, signal) => {
    const meeting = String(job.payload.meeting ?? "");
    const action = job.payload.action as keyof typeof EVENT;
    if (!UUID.test(meeting) || !(action in EVENT)) throw new JobError("meeting_sync needs a meeting and an action", { retry: false });

    // One change at a time per meeting. While another runs, this one goes back in line without using up a try.
    if (!(await call<boolean>(rpc, "meeting_sync_lease", { p_meeting: meeting, p_job: job.id, p_s: 300 }))) {
      await enqueueJob(rpc, { workspaceId: job.workspace_id, kind: "meeting_sync", key: job.key, payload: job.payload, delayS: 15, maxAttempts: job.max_attempts });
      return;
    }
    const notify = (event: string) =>
      enqueueJob(rpc, { workspaceId: job.workspace_id, kind: "meeting_notify", key: event === "booked" ? `booked:${meeting}` : `${event}:${job.id}`, payload: { meeting, event } });
    try {
      const inp = await call<Inputs | null>(rpc, "meeting_sync_inputs", { p_meeting: meeting });
      if (!inp) return;
      let send = true;
      try {
        send = await run(rpc, o, job, inp, action, signal);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const final = e instanceof Final || job.attempts >= job.max_attempts;
        if (!final) throw new JobError(msg, { retryAfterS: RETRY_S[Math.min(Math.max(job.attempts, 1), RETRY_S.length) - 1] });
        // The meeting stands; the history says the calendar side failed, and the emails still go.
        await call(rpc, "meeting_calendar_failed", { p_meeting: meeting, p_detail: { action, error: msg.slice(0, 300), attempts: job.attempts } });
        await notify(EVENT[action]);
        throw new JobError(msg, { retry: false });
      }
      if (send) await notify(EVENT[action]);
    } finally {
      await call(rpc, "meeting_sync_release", { p_meeting: meeting, p_job: job.id }).catch(() => undefined);
    }
  };

/** Do the calendar work for one action. False when there's nothing to tell anyone (the meeting changed since). */
async function run(rpc: Rpc, o: CalendarOpts, job: Job, inp: Inputs, action: keyof typeof EVENT, signal: AbortSignal): Promise<boolean> {
  const m = inp.meeting;
  const events = { ...(m.events ?? {}) };
  // Everything on a calendar or on Zoom for this meeting (a Zoom meeting alone is a create cut short).
  const placed = Object.entries(events).filter(([, r]) => r.event || r.zoom);

  if (action === "cancel") {
    if (m.status !== "canceled") return false;
    for (const [, r] of placed) await takeDown(rpc, o, r, signal);
    return true;
  }

  // Create and move only touch a meeting that still stands; a cancel that came first has its own job.
  if (m.status !== "booked") return false;
  if (action === "create" && placed.some(([, r]) => r.event)) return true;

  const org = inp.hosts.find((h) => h.cal);
  if (!org?.cal) throw new Final("No host has a calendar to write to");
  const guests = guestsFor(inp, org);
  const start = Date.parse(m.start_at);
  const end = Date.parse(m.end_at);

  if (action === "move" && events[org.user_id]?.event) {
    const r = events[org.user_id]!;
    const acc = r.account === org.cal.id ? org.cal : await loadAccount(rpc, r.account);
    if (acc && acc.status === "ok") {
      await guarded(rpc, acc, () => providerOf(rpc, o, acc, signal).update(r.calendar, r.event!, { start, end, guests, lead: leadOf(m) }));
      if (r.zoom) await moveZoom(rpc, o, r.zoom, start, end, signal);
      // Anyone else's old event (an earlier lead host) comes off.
      for (const [u, x] of placed) if (u !== org.user_id) await takeDown(rpc, o, x, signal);
      await call(rpc, "meeting_calendar_save", { p_meeting: m.id, p_events: { [org.user_id]: r }, p_location: {} });
      return true;
    }
  }
  if (action === "move") for (const [, r] of placed) if (r.event) await takeDown(rpc, o, r, signal);
  await place(rpc, o, job, inp, org, guests, start, end, signal);
  return true;
}

/** The event on the lead host's write calendar, with a Zoom meeting first when the type meets on Zoom. */
async function place(rpc: Rpc, o: CalendarOpts, job: Job, inp: Inputs, org: HostIn, guests: string[], start: number, end: number, signal: AbortSignal) {
  const m = inp.meeting;
  const cal = org.cal!;
  const loc = m.location ?? {};
  const title = `${inp.title} with ${m.guest_name || m.guest_email}`.slice(0, 250);
  let conference = loc.kind === "google_meet" || loc.kind === "teams";
  let where = loc.kind === "phone_host" ? loc.number : loc.kind === "in_person" ? loc.address : loc.kind === "link" ? loc.url : undefined;
  // A Zoom meeting made by an earlier try of this create (no event yet) is used again.
  const partial = m.events?.[org.user_id];
  let zoom = partial && !partial.event ? partial.zoom : undefined;
  if (loc.kind === "zoom") {
    if (org.zoom && !zoom) {
      const z = org.zoom;
      const made = await guarded(rpc, z, () => zoomOf(rpc, o, z, signal).create({ topic: title, start, end, key: job.key }));
      zoom = { account: z.id, id: made.id, url: made.joinUrl };
      // Kept at once: Zoom has no idempotency key, so a retry must find this meeting instead of making another.
      await call(rpc, "meeting_calendar_save", { p_meeting: m.id, p_events: { [org.user_id]: { provider: cal.provider, account: cal.id, calendar: cal.write, zoom } }, p_location: { url: made.joinUrl } });
    }
    if (zoom?.url) where = zoom.url;
    // No Zoom connected: the calendar's own video link stands in.
    else conference = true;
  }
  const answers = (inp.questions ?? []).filter((q) => m.answers?.[q.id]).map((q) => `${q.label}: ${m.answers[q.id]}`);
  const made = await guarded(rpc, cal, () =>
    providerOf(rpc, o, cal, signal).create(cal.write, { title, description: answers.join("\n"), start, end, guests, lead: leadOf(m), conference, where, key: `${job.key}|${org.user_id}` }),
  );
  const ref: Ref = { provider: cal.provider, account: cal.id, calendar: cal.write, event: made.id, ...(zoom ? { zoom } : {}) };
  const url = zoom?.url ?? made.joinUrl;
  await call(rpc, "meeting_calendar_save", { p_meeting: m.id, p_events: { [org.user_id]: ref }, p_location: url ? { url } : {} });
}

/** Cancel an event and its Zoom meeting. A calendar since disconnected is skipped. */
async function takeDown(rpc: Rpc, o: CalendarOpts, r: Ref, signal: AbortSignal) {
  const acc = await loadAccount(rpc, r.account);
  if (acc && acc.status === "ok" && r.event) await guarded(rpc, acc, () => providerOf(rpc, o, acc, signal).cancel(r.calendar, r.event!));
  if (r.zoom) {
    const z = await loadAccount(rpc, r.zoom.account);
    if (z && z.status === "ok") await guarded(rpc, z, () => zoomOf(rpc, o, z, signal).cancel(r.zoom!.id));
  }
}

async function moveZoom(rpc: Rpc, o: CalendarOpts, zoom: NonNullable<Ref["zoom"]>, start: number, end: number, signal: AbortSignal) {
  const z = await loadAccount(rpc, zoom.account);
  if (z && z.status === "ok") await guarded(rpc, z, () => zoomOf(rpc, o, z, signal).move(zoom.id, start, end));
}

/** A refused sign-in turns that account to "reconnect" and ends the retries. */
async function guarded<T>(rpc: Rpc, a: AccountRow, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!(e instanceof ReconnectError)) throw e;
    await markReconnect(rpc, a.id, e.message);
    throw new Final(`Reconnect ${a.provider}: ${e.message}`);
  }
}

/**
 * The co-hosts, never the lead host's own address or the guest's. The guest goes to the provider as `lead`: Claritia
 * sends them its own invite (.ics), so the providers must not email them (sendUpdates=none on Google; not an
 * attendee on Microsoft).
 */
function guestsFor(inp: Inputs, org: HostIn): string[] {
  const skip = new Set([(org.cal?.account_email ?? org.email ?? "").toLowerCase(), inp.meeting.guest_email.trim().toLowerCase()]);
  const all = inp.hosts.filter((h) => h.user_id !== org.user_id).map((h) => h.cal?.account_email || h.email || "");
  return [...new Set(all.map((e) => e.trim().toLowerCase()).filter((e) => e && !skip.has(e)))];
}

const leadOf = (m: Inputs["meeting"]) => ({ email: m.guest_email, name: m.guest_name });
