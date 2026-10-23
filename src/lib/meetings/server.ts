// Offering times and booking them (docs/meetings-scheduler.md 1.5, 1.6 and 2.1). Every way in (the booking page,
// forms, handoff, one-off links) calls offer() to show times and book() to take one, so the rules live in one place.
// Server only: it reads through service-role functions and takes a live free/busy check from the caller.

import { createHash, randomBytes } from "node:crypto";
import { enqueueJob, type Rpc } from "../jobs.ts";
import { pickHost, pickPair, slots as engine, type HostInput, type Turns } from "./slots.ts";
import { dateIn, weekOf } from "./time.ts";
import type { Availability, MeetingSource, MeetingType, Slot } from "./types.ts";

const MIN = 60_000;

type Raw = { id: string; availability: Availability | null; connected: boolean; reconnect: boolean; busy: [string, string][]; booked: [string, string, string | null, string, string][] };
export type HostState = { id: string; bookable: boolean; why?: "no_calendar" | "reconnect" | "no_hours"; input: HostInput };

async function call<T>(rpc: Rpc, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/**
 * The hosts' state and engine input over a span. A host is bookable only with a working calendar to write to, no
 * calendar waiting on a reconnect, and hours set: times are never shown for someone whose calendar can't be checked.
 */
export async function hostStates(rpc: Rpc, ws: string, users: string[], from: number, to: number): Promise<HostState[]> {
  if (!users.length) return [];
  const raw = await call<Raw[]>(rpc, "meeting_inputs", { p_ws: ws, p_users: users, p_from: new Date(from).toISOString(), p_to: new Date(to).toISOString() });
  return (raw ?? []).map((r) => {
    const why = r.reconnect ? "reconnect" : !r.connected ? "no_calendar" : !r.availability ? "no_hours" : undefined;
    const ms = (s: string) => new Date(s).getTime();
    return {
      id: r.id,
      bookable: !why,
      ...(why ? { why } : {}),
      input: {
        id: r.id,
        availability: r.availability ?? { tz: "UTC", weekly: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }, overrides: [] },
        busy: r.busy.map(([s, e]) => ({ start: ms(s), end: ms(e) })),
        booked: r.booked.map(([s, e, typeId, at, id]) => ({ start: ms(s), end: ms(e), typeId, at: ms(at), id })),
      },
    };
  });
}

/** This type's meetings per host per local day and week, for the caps. */
function withCounts(h: HostInput, typeId: string): HostInput {
  const day: Record<string, number> = {};
  const week: Record<string, number> = {};
  for (const m of h.booked) {
    if (m.typeId !== typeId || m.at === undefined) continue;
    const d = dateIn(m.at, h.availability.tz);
    day[d] = (day[d] ?? 0) + 1;
    week[weekOf(d)] = (week[weekOf(d)] ?? 0) + 1;
  }
  return { ...h, counts: { day, week } };
}

export async function turnsFor(rpc: Rpc, typeId: string): Promise<Turns> {
  const rows = await call<{ user_id: string; n: number; last: string }[]>(rpc, "rr_turns", { p_type: typeId });
  return Object.fromEntries((rows ?? []).map((r) => [r.user_id, { n: r.n, last: new Date(r.last).getTime() }]));
}

export type Offer = {
  slots: Slot[];
  /** Who the times are for: the owner for owner-first, the next host for a strict round robin, else the pool. */
  owner?: string;
  next?: string;
  /** Hosts left out, and why, for the screens. */
  out: { id: string; why: NonNullable<HostState["why"]> }[];
};

/** The times a meeting type can be booked now, for one length. `owner` is the contact's owner for owner-first. */
export async function offer(rpc: Rpc, o: { ws: string; type: MeetingType; length: number; now?: number; owner?: string | null }): Promise<Offer> {
  const now = o.now ?? Date.now();
  const s = o.type.settings;
  const states = await hostStates(rpc, o.ws, o.type.hosts.map((h) => h.user_id), now, now + (s.window + 1) * 86_400_000);
  const out = states.filter((h) => !h.bookable).map((h) => ({ id: h.id, why: h.why! }));
  const inputs = states.filter((h) => h.bookable).map((h) => withCounts(h.input, o.type.id));
  const pools = Object.fromEntries(o.type.hosts.map((h) => [h.user_id, h.pool ?? "a"])) as Record<string, "a" | "b">;
  const group = new Map<number, number>();
  if (o.type.kind === "group") {
    const seen = new Set<string>();
    for (const m of inputs.flatMap((h) => h.booked)) if (m.typeId === o.type.id && m.at !== undefined && !seen.has(m.id ?? "")) {
      seen.add(m.id ?? "");
      group.set(m.at, (group.get(m.at) ?? 0) + 1);
    }
  }
  const run = (hosts: HostInput[], next?: string) => engine({ kind: o.type.kind === "owner_first" ? "round_robin" : o.type.kind, hosts, length: o.length, settings: s, now, typeId: o.type.id, pools, next, group });
  if (o.type.kind === "owner_first" && o.owner) {
    const own = inputs.filter((h) => h.id === o.owner);
    const mine = own.length ? run(own) : [];
    if (mine.length) return { slots: mine, owner: o.owner, out };
  }
  if (o.type.kind === "round_robin" && s.rrMode === "strict") {
    const next = pickHost(inputs.map((h) => h.id), o.type.hosts, await turnsFor(rpc, o.type.id)) ?? undefined;
    return { slots: next ? run(inputs, next) : [], ...(next ? { next } : {}), out };
  }
  return { slots: run(inputs), out };
}

export type Guest = { email: string; name?: string; tz?: string; answers?: Record<string, string> };

export type BookInput = {
  ws: string;
  type: MeetingType;
  length: number;
  start: number;
  guest: Guest;
  source: MeetingSource;
  owner?: string | null;
  contactId?: string | null;
  submissionId?: string | null;
  linkId?: string | null;
  bookedBy?: string | null;
  /** Paid types hold the time while the guest pays. */
  pending?: boolean;
  now?: number;
  /**
   * The hosts busy on their calendars right now over a span, from the providers (src/lib/meetings/live.ts). Hosts it
   * couldn't ask are left out of the set, so a provider outage falls back to the cached busy times.
   */
  liveBusy: (hosts: string[], from: number, to: number) => Promise<Set<string>>;
};

export type BookResult =
  | { ok: true; meetingId: string; token: string; hosts: string[]; start: number; end: number }
  | { ok: false; error: "slot_taken" | "full" | "link_used" | "link_closed" | "not_offered"; slots: Slot[] };

export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(24).toString("base64url");

/**
 * Book one start. The start must still be offered; the hosts free at it are checked live; the round robin picks
 * among those still free; then meeting_book locks the hosts and refuses an overlap. Losing any of those races gives
 * back the fresh times, so the guest can pick again at once.
 */
export async function book(rpc: Rpc, b: BookInput): Promise<BookResult> {
  const now = b.now ?? Date.now();
  const s = b.type.settings;
  const fresh = async () => (await offer(rpc, { ws: b.ws, type: b.type, length: b.length, now, owner: b.owner })).slots;
  if (!s.lengths.includes(b.length)) return { ok: false, error: "not_offered", slots: [] };
  const offered = await offer(rpc, { ws: b.ws, type: b.type, length: b.length, now, owner: b.owner });
  const slot = offered.slots.find((x) => x.start === b.start);
  if (!slot) return { ok: false, error: "not_offered", slots: offered.slots };
  const end = b.start + b.length * MIN;
  const blockStart = b.start - s.bufferBefore * MIN;
  const blockEnd = end + s.bufferAfter * MIN;
  const busy = await b.liveBusy(slot.hosts, blockStart, blockEnd);
  const free = slot.hosts.filter((h) => !busy.has(h));
  let hosts: string[];
  const kind = b.type.kind;
  if (kind === "collective") hosts = free.length === slot.hosts.length ? free : [];
  else if (kind === "double") hosts = pickPair(free, b.type.hosts, await turnsFor(rpc, b.type.id));
  else if (kind === "round_robin" || (kind === "owner_first" && !offered.owner)) {
    const one = pickHost(free, b.type.hosts, await turnsFor(rpc, b.type.id));
    hosts = one ? [one] : [];
  } else hosts = free.slice(0, 1);
  if (!hosts.length) return { ok: false, error: "slot_taken", slots: (await fresh()).filter((x) => x.start !== b.start) };
  const token = newToken();
  const { data, error } = await rpc("meeting_book", {
    p_ws: b.ws,
    p_type: b.type.id,
    p_hosts: hosts,
    p_start: new Date(b.start).toISOString(),
    p_end: new Date(end).toISOString(),
    p_block_start: new Date(blockStart).toISOString(),
    p_block_end: new Date(blockEnd).toISOString(),
    p_guest: { email: b.guest.email, name: b.guest.name ?? "", tz: b.guest.tz ?? "", answers: b.guest.answers ?? {} },
    p_source: b.source,
    p_token_hash: tokenHash(token),
    p_status: b.pending ? "pending_payment" : "booked",
    p_contact: b.contactId ?? null,
    p_submission: b.submissionId ?? null,
    p_link: b.linkId ?? null,
    p_seats: kind === "group" ? s.seats : 0,
    p_rr: kind === "round_robin" || kind === "double" || (kind === "owner_first" && !offered.owner),
    p_location: s.location,
    p_booked_by: b.bookedBy ?? null,
  });
  if (error) {
    const code = (["slot_taken", "full", "link_used", "link_closed"] as const).find((c) => error.message.includes(c));
    if (!code) throw new Error(error.message);
    return { ok: false, error: code, slots: code.startsWith("link") ? [] : (await fresh()).filter((x) => x.start !== b.start) };
  }
  const meetingId = data as string;
  // The calendar events and the confirmation email follow in the worker (meeting_sync), so the guest never waits on
  // a provider; a failed create is retried there and can't make a second event (the meeting id is its key).
  if (!b.pending) await enqueueJob(rpc, { workspaceId: b.ws, kind: "meeting_sync", key: `create:${meetingId}`, payload: { meeting: meetingId, action: "create" } });
  return { ok: true, meetingId, token, hosts, start: b.start, end };
}
