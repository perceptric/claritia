// Offering times and booking them (docs/meetings-scheduler.md 1.5, 1.6 and 2.1). Every way in (the booking page,
// forms, handoff, one-off links) calls offer() to show times and book() to take one, so the rules live in one place.
// Server only: it reads through service-role functions and takes a live free/busy check from the caller.

import { createHash, randomBytes } from "node:crypto";
import { callNewer } from "../forms/newer.ts";
import { enqueueJob, type Rpc } from "../jobs.ts";
import type { LiveRouter } from "../router/server.ts";
import { seal } from "../seal.ts";
import { keepManageToken } from "./links.ts";
import { cut, pickHost, pickPair, slots as engine, type HostInput, type Turns } from "./slots.ts";
import { pickTeamHost, recordTeamRun, teamOf, type Team } from "./team.ts";
import { dateIn, weekOf } from "./time.ts";
import type { Availability, MeetingSource, MeetingType, Slot } from "./types.ts";

const MIN = 60_000;

type Raw = {
  id: string;
  availability: Availability | null;
  connected: boolean;
  reconnect: boolean;
  busy: [string, string][];
  booked: [string, string, string | null, string, string][];
  /** Routing's days off and pause (router_reps). */
  out_dates?: { from: string; to: string }[];
  paused_until?: string | null;
};
export type HostState = { id: string; bookable: boolean; why?: "no_calendar" | "reconnect" | "no_hours"; paused?: boolean; input: HostInput };

const DAY = 86_400_000;

/** A rep's days off as a day off on each date (an empty override), on top of the hours' own overrides. */
export function withDaysOff(a: Availability, out: { from: string; to: string }[] | undefined): Availability {
  const dates = new Set<string>();
  for (const d of out ?? []) {
    const from = Date.parse(`${d.from}T00:00:00Z`);
    const to = Date.parse(`${d.to}T00:00:00Z`);
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    for (let t = from, n = 0; t <= to && n < 400; t += DAY, n++) dates.add(new Date(t).toISOString().slice(0, 10));
  }
  if (!dates.size) return a;
  return { ...a, overrides: [...a.overrides.filter((o) => !dates.has(o.date)), ...[...dates].sort().map((date) => ({ date, ranges: [] as Availability["overrides"][number]["ranges"] }))] };
}

async function call<T>(rpc: Rpc, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/**
 * The hosts' state and engine input over a span. A host is bookable only with a working calendar to write to, no
 * calendar waiting on a reconnect, and hours set: times are never shown for someone whose calendar can't be checked.
 */
export async function hostStates(rpc: Rpc, ws: string, users: string[], from: number, to: number, schedule?: string | null, now = Date.now()): Promise<HostState[]> {
  if (!users.length) return [];
  const raw = await call<Raw[]>(rpc, "meeting_inputs", { p_ws: ws, p_users: users, p_from: new Date(from).toISOString(), p_to: new Date(to).toISOString(), ...(schedule ? { p_schedule: schedule } : {}) });
  return (raw ?? []).map((r) => {
    const why = r.reconnect ? "reconnect" : !r.connected ? "no_calendar" : !r.availability ? "no_hours" : undefined;
    const ms = (s: string) => new Date(s).getTime();
    const paused = !!r.paused_until && Date.parse(r.paused_until) > now;
    return {
      id: r.id,
      bookable: !why,
      ...(why ? { why } : {}),
      ...(paused ? { paused } : {}),
      input: {
        id: r.id,
        availability: withDaysOff(r.availability ?? { tz: "UTC", weekly: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }, overrides: [] }, r.out_dates),
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
  /** Group types: the starts that already have a seat booked (their event is on the host's calendar). */
  seated?: number[];
};

/**
 * The times a meeting type can be booked now, for one length. `owner` is the contact's owner for owner-first. A type
 * hosted by a Routing team is offered over the team's members (teamOf); `team` passes one already read.
 */
export async function offer(
  rpc: Rpc,
  o: { ws: string; type: MeetingType; length: number; now?: number; owner?: string | null; team?: { team: Team | null; type: MeetingType }; live?: LiveRouter | null },
): Promise<Offer> {
  const now = o.now ?? Date.now();
  if (o.type.settings.team && !o.team) return offer(rpc, { ...o, team: await teamOf(rpc, o.ws, o.type, undefined, o.live) });
  if (o.team) o = { ...o, type: o.team.type };
  const s = o.type.settings;
  const hostIds = o.type.hosts.map((h) => h.user_id);
  // Owner first: the contact's owner (often the router's pick, docs/router.md Part 7) is offered first even when
  // they aren't one of the type's hosts; the round robin after them stays among the hosts.
  const extra = o.type.kind === "owner_first" && o.owner && !hostIds.includes(o.owner) ? o.owner : null;
  // A paused rep takes no new team meetings; their own types are untouched.
  const states = (await hostStates(rpc, o.ws, extra ? [...hostIds, extra] : hostIds, now, now + (s.window + 1) * 86_400_000, s.schedule, now)).filter((h) => !(s.team && h.paused && h.id !== extra));
  const out = states.filter((h) => !h.bookable && h.id !== extra).map((h) => ({ id: h.id, why: h.why! }));
  const all = states.filter((h) => h.bookable).map((h) => withCounts(h.input, o.type.id));
  const inputs = all.filter((h) => h.id !== extra);
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
    const own = all.filter((h) => h.id === o.owner);
    const mine = own.length ? run(own) : [];
    if (mine.length) return { slots: mine, owner: o.owner, out };
  }
  if (o.type.kind === "round_robin" && s.rrMode === "strict") {
    const next = pickHost(inputs.map((h) => h.id), o.type.hosts, await turnsFor(rpc, o.type.id)) ?? undefined;
    return { slots: next ? run(inputs, next) : [], ...(next ? { next } : {}), out };
  }
  return { slots: run(inputs), out, ...(o.type.kind === "group" ? { seated: [...group.keys()] } : {}) };
}

/**
 * The live check for one start. A group start that already has seats has its own event on the host's calendar, so
 * only the parts outside it are asked about.
 */
export async function liveAt(live: BookInput["liveBusy"], hosts: string[], block: { start: number; end: number }, session?: { start: number; end: number } | null): Promise<Set<string>> {
  const parts = session ? cut([block], session) : [block];
  const sets = await Promise.all(parts.map((p) => live(hosts, p.start, p.end)));
  return new Set(sets.flatMap((x) => [...x]));
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
  /** The guest's contact, or a read of it already under way (book_contact), awaited just before the write. */
  contactId?: string | null | Promise<string | null>;
  /** A new guest as a contact row (guestContactRow), made with the meeting when the CRM doesn't have them. */
  guestRow?: Record<string, unknown> | null | Promise<Record<string, unknown> | null>;
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
  /** tail: the manage token, team run, guest contact and meeting_sync were written with the meeting (090). */
  | { ok: true; meetingId: string; token: string; hosts: string[]; start: number; end: number; tail?: boolean }
  | { ok: false; error: "slot_taken" | "full" | "link_used" | "link_closed" | "not_offered"; slots: Slot[] };

export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(24).toString("base64url");

/** The sealed copy of a manage token, or null without SECRETS_KEY (the emails then go without the manage links). */
export function sealedToken(token: string): string | null {
  try {
    return seal(token);
  } catch {
    return null;
  }
}

/** A promise that may be awaited later or never: its failure is never an unhandled rejection. */
export function quiet<T>(p: Promise<T>): Promise<T> {
  p.catch(() => undefined);
  return p;
}

/**
 * Book one start. The start must still be offered; the hosts free at it are checked live; the round robin picks
 * among those still free; then meeting_book locks the hosts and refuses an overlap. Losing any of those races gives
 * back the fresh times, so the guest can pick again at once.
 */
export async function book(rpc: Rpc, b0: BookInput): Promise<BookResult> {
  const now = b0.now ?? Date.now();
  const team = b0.type.settings.team ? await teamOf(rpc, b0.ws, b0.type) : undefined;
  const b = team ? { ...b0, type: team.type } : b0;
  const s = b.type.settings;
  const fresh = async () => (await offer(rpc, { ws: b.ws, type: b.type, length: b.length, now, owner: b.owner, ...(team ? { team } : {}) })).slots;
  if (!s.lengths.includes(b.length)) return { ok: false, error: "not_offered", slots: [] };
  const offered = await offer(rpc, { ws: b.ws, type: b.type, length: b.length, now, owner: b.owner, ...(team ? { team } : {}) });
  const slot = offered.slots.find((x) => x.start === b.start);
  if (!slot) return { ok: false, error: "not_offered", slots: offered.slots };
  const end = b.start + b.length * MIN;
  const blockStart = b.start - s.bufferBefore * MIN;
  const blockEnd = end + s.bufferAfter * MIN;
  const kind = b.type.kind;
  // The round robin's turns are read alongside the live check (a team reads them only when the router can't answer).
  const rotates = kind === "double" || (!team && (kind === "round_robin" || (kind === "owner_first" && !offered.owner)));
  const turns = rotates ? quiet(turnsFor(rpc, b.type.id)) : null;
  const busy = await liveAt(b.liveBusy, slot.hosts, { start: blockStart, end: blockEnd }, offered.seated?.includes(b.start) ? { start: b.start, end } : null);
  const free = slot.hosts.filter((h) => !busy.has(h));
  let hosts: string[];
  let teamPick: Awaited<ReturnType<typeof pickTeamHost>> = null;
  if (kind === "collective") hosts = free.length === slot.hosts.length ? free : [];
  else if (kind === "double") hosts = pickPair(free, b.type.hosts, await turns!);
  else if (team && (kind === "round_robin" || (kind === "owner_first" && !offered.owner))) {
    // A Routing team: the owner when free, else the queue's turn (src/lib/meetings/team.ts).
    teamPick = await pickTeamHost(rpc, { ws: b.ws, team: team.team, type: b.type, free, owner: b.owner, turns: () => turnsFor(rpc, b.type.id) });
    hosts = teamPick ? [teamPick.user] : [];
  } else if (kind === "round_robin" || (kind === "owner_first" && !offered.owner)) {
    const one = pickHost(free, b.type.hosts, await turns!);
    hosts = one ? [one] : [];
  } else hosts = free.slice(0, 1);
  if (!hosts.length) return { ok: false, error: "slot_taken", slots: (await fresh()).filter((x) => x.start !== b.start) };
  const token = newToken();
  const contactId = (await b.contactId) ?? null;
  const args = {
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
    p_contact: contactId,
    p_submission: b.submissionId ?? null,
    p_link: b.linkId ?? null,
    p_seats: kind === "group" ? s.seats : 0,
    p_rr: kind === "round_robin" || kind === "double" || (kind === "owner_first" && !offered.owner),
    p_location: s.location,
    p_booked_by: b.bookedBy ?? null,
  };
  const refused = async (message: string): Promise<BookResult> => {
    const code = (["slot_taken", "full", "link_used", "link_closed"] as const).find((c) => message.includes(c));
    if (!code) throw new Error(message);
    return { ok: false, error: code, slots: code.startsWith("link") ? [] : (await fresh()).filter((x) => x.start !== b.start) };
  };
  // One transaction (090): the meeting, its sealed manage token, the team's run (the owner's pick isn't a new turn),
  // the new guest's contact and meeting_sync, so the guest's link and the confirmation exist exactly when it does.
  const queue = team?.team?.queue.id ?? b.type.settings.team;
  const teamArg = teamPick && teamPick.by !== "owner" && queue ? { queue, owner: teamPick.user, version: team?.team?.version ?? null } : null;
  const all = await callNewer(rpc, "meeting_book_all", { ...args, p_sealed: sealedToken(token), p_team: teamArg, p_contact_row: contactId ? null : ((await b.guestRow) ?? null), p_sync: !b.pending });
  if (all) {
    if (all.error) return refused(all.error.message);
    return { ok: true, meetingId: (all.data as { id: string }).id, token, hosts, start: b.start, end, tail: true };
  }
  // Before 090: the same steps, one call each.
  const { data, error } = await rpc("meeting_book", args);
  if (error) return refused(error.message);
  const meetingId = data as string;
  if (teamPick) await recordTeamRun(rpc, { ws: b.ws, type: b.type, team: team!.team, meetingId, contactId, pick: teamPick }).catch(() => undefined);
  // A sealed copy of the guest's link, so the emails sent later can carry it (only its hash is the key). The meeting
  // stands without it: the emails then go without the manage links.
  await keepManageToken(rpc, meetingId, token).catch(() => undefined);
  // The calendar events and the confirmation email follow in the worker (meeting_sync), so the guest never waits on
  // a provider; a failed create is retried there and can't make a second event (the meeting id is its key).
  if (!b.pending) await enqueueJob(rpc, { workspaceId: b.ws, kind: "meeting_sync", key: `create:${meetingId}`, payload: { meeting: meetingId, action: "create" } });
  return { ok: true, meetingId, token, hosts, start: b.start, end };
}
