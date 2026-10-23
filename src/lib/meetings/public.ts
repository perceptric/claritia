// Booking without signing in (docs/meetings-scheduler.md 1.6 to 1.8b): pages, one-off and single-use links, polls and
// the guest's manage link. Reads go through the service-role functions in 057_book_public.sql and answer with the
// shapes in guest.ts; every booking, move and cancel goes through book(), meeting_move and meeting_status, and queues
// meeting_sync for the calendars. Server only (the routes and the pg tests), over any Rpc.

import { createHash, randomBytes } from "node:crypto";
import { cleanDomain } from "../company/domains.ts";
import { cleanEmail, isRejected } from "../identity/clean.ts";
import { enqueueJob, type Rpc } from "../jobs.ts";
import { keepManageToken } from "./links.ts";
import { book, hostStates, liveAt, newToken, offer, tokenHash, turnsFor, type BookResult } from "./server.ts";
import { cut, pickHost, pickPair } from "./slots.ts";
import { validZone } from "./time.ts";
import { checkSettings } from "./check.ts";
import { guestLocation, toGuestType, type GuestIn, type GuestSlot, type GuestType, type Profile } from "./guest.ts";
import { DEFAULT_SETTINGS, type Location, type MeetingSource, type MeetingStatus, type MeetingType, type Slot, type Span } from "./types.ts";

const MIN = 60_000;
export type Kit = { tokens: Record<string, unknown>; logo_url: string | null };
export type LiveBusy = (hosts: string[], from: number, to: number) => Promise<Set<string>>;
type Ws = { id: string; name: string; slug: string | null; kit: Kit; turnstile: boolean; pay: { account: string; ready: boolean } | null };

async function call<T>(rpc: Rpc, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

const codeOf = <C extends string>(message: string, codes: readonly C[]): C | null => codes.find((c) => message.includes(c)) ?? null;

// Pages ----------------------------------------------------------------------------------------------------------

export type Target = {
  ws: { id: string; name: string; slug: string };
  kit: Kit;
  turnstile: boolean;
  pay: boolean;
  type: MeetingType | null;
  profile: Profile | null;
  types: MeetingType[];
  profiles: Profile[];
};

const SLUG = /^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** /book/<ws> or /book/<ws>/<slug>: a type first, then a person. Null when nothing is there. */
export async function loadTarget(rpc: Rpc, ws: string, slug: string | null, form?: string | null): Promise<Target | null> {
  const w = ws.toLowerCase();
  const s = slug?.toLowerCase() ?? null;
  if (!SLUG.test(w) || (s !== null && !SLUG.test(s))) return null;
  const t = await call<Target | null>(rpc, "book_target", { p_ws: w, p_slug: s, p_form: form && UUID.test(form) ? form : null });
  if (!t) return null;
  return { ...t, type: t.type ? withDefaults(t.type) : null, types: (t.types ?? []).map(withDefaults) };
}

/** A type as stored, with any setting it doesn't have taken from the defaults. */
export function withDefaults(t: MeetingType): MeetingType {
  return { ...t, hosts: t.hosts ?? [], settings: { ...DEFAULT_SETTINGS, ...(t.settings ?? {}) } };
}

/** A paid type can only be booked once the workspace's Stripe account takes payments. */
export const isPaid = (t: MeetingType) => !!t.settings.price && t.settings.price.amount > 0;

export function guestTypeOf(t: MeetingType, profiles: Profile[], pay = true): GuestType {
  return toGuestType(t, profiles, { pay });
}

/**
 * The times a guest can pick for one length, without hosts. Group types carry the seats left at each start (taken
 * from the same read the offer made, so it's one query).
 */
export async function guestSlots(rpc: Rpc, o: { ws: string; type: MeetingType; length: number; now?: number; from?: number; to?: number }): Promise<GuestSlot[]> {
  if (!o.type.settings.lengths.includes(o.length)) return [];
  let seen: { booked: [string, string, string | null, string, string][] }[] = [];
  const spy: Rpc = async (fn, args) => {
    const r = await rpc(fn, args);
    if (fn === "meeting_inputs" && !r.error) seen = (r.data as typeof seen) ?? [];
    return r;
  };
  const off = await offer(spy, { ws: o.ws, type: o.type, length: o.length, now: o.now });
  const inRange = (s: Slot) => (o.from === undefined || s.start >= o.from) && (o.to === undefined || s.start < o.to);
  if (o.type.kind !== "group") return off.slots.filter(inRange).map((s) => ({ start: s.start }));
  const taken = new Map<number, Set<string>>();
  for (const h of seen) for (const [, , typeId, atIso, id] of h.booked ?? []) {
    if (typeId !== o.type.id) continue;
    const t = new Date(atIso).getTime();
    taken.set(t, (taken.get(t) ?? new Set()).add(id));
  }
  const seats = Math.max(1, o.type.settings.seats);
  return off.slots.filter(inRange).map((s) => ({ start: s.start, seats: Math.max(0, seats - (taken.get(s.start)?.size ?? 0)) }));
}

/**
 * A booking link that names a host (?host=<user id or page slug>, e.g. the "book later" email): the type narrowed to
 * that host when they host it and the kind picks one host. Null when it doesn't apply.
 */
export function preferHost(t: MeetingType, host: string | null | undefined, profiles: Profile[]): MeetingType | null {
  if (!host || !["one", "round_robin", "owner_first", "group"].includes(t.kind)) return null;
  const id = UUID.test(host) ? host : profiles.find((p) => p.slug === host)?.user_id;
  const h = t.hosts.find((x) => x.user_id === id);
  if (!h || t.hosts.length < 2) return null;
  return { ...t, hosts: [h], ...(t.kind === "round_robin" && t.settings.rrMode === "strict" ? { settings: { ...t.settings, rrMode: "flexible" as const } } : {}) };
}

/** The times for a page that prefers a host: theirs when they have any, else the whole type's. */
export async function preferredSlots(rpc: Rpc, o: { ws: string; type: MeetingType; length: number; host?: string | null; profiles: Profile[]; now?: number; from?: number; to?: number }): Promise<GuestSlot[]> {
  const narrow = preferHost(o.type, o.host, o.profiles);
  if (narrow) {
    const mine = await guestSlots(rpc, { ...o, type: narrow });
    if (mine.length) return mine;
  }
  return guestSlots(rpc, o);
}

export type BookOutcome =
  | { ok: true; meetingId: string; token: string; start: number; end: number; hosts: string[]; pending: boolean }
  | { ok: false; error: "slot_taken" | "full" | "link_used" | "link_closed" | "not_offered" | "no_payments"; slots: GuestSlot[] };

const guestSlotsOf = (slots: Slot[], from?: number) => slots.filter((s) => from === undefined || s.start >= from).map((s) => ({ start: s.start }));

/**
 * The guest becomes a contact once the booking stands (meeting_contact_make, 061_meeting_contacts.sql), when the CRM
 * doesn't have them yet. The meeting stands without it.
 */
export async function guestContact(rpc: Rpc, meetingId: string, g: { email: string; name?: string | null; tz?: string | null }): Promise<void> {
  const e = cleanEmail(g.email);
  if (isRejected(e) || e.class === "own") return;
  const [first, ...rest] = (g.name ?? "").trim().split(/\s+/).filter(Boolean);
  const domain = (e.class === "work" || e.class === "role") && e.domain ? cleanDomain(e.domain)?.domain : undefined;
  const row = {
    email: e.raw,
    email_clean: e.clean,
    email_class: e.class,
    ...(first ? { first_name: first.slice(0, 100) } : {}),
    ...(rest.length ? { last_name: rest.join(" ").slice(0, 100) } : {}),
    ...(g.tz && validZone(g.tz) ? { timezone: g.tz } : {}),
    ...(domain ? { company_domain: domain } : {}),
  };
  try {
    await rpc("meeting_contact_make", { p_meeting: meetingId, p_row: row });
  } catch {
    // The meeting stands; the contact can be added later.
  }
}

/**
 * A guest books a type from a page, a single-use link or the embed. Paid types hold the time (pending) until
 * Stripe says the guest paid. The contact is linked when the CRM already has this email.
 */
export async function bookType(
  rpc: Rpc,
  o: { ws: string; type: MeetingType; length: number; start: number; guest: GuestIn; source: MeetingSource; linkId?: string | null; submissionId?: string | null; prefer?: { host: string; profiles: Profile[] } | null; payReady: boolean; liveBusy: LiveBusy; now?: number },
): Promise<BookOutcome> {
  const narrow = o.prefer ? preferHost(o.type, o.prefer.host, o.prefer.profiles) : null;
  if (narrow) {
    // The preferred host's time first; a time only the rest of the team had books with the whole type.
    const r = await bookType(rpc, { ...o, type: narrow, prefer: null });
    if (r.ok || r.error !== "not_offered") return r;
  }
  const pending = isPaid(o.type);
  if (pending && !o.payReady) return { ok: false, error: "no_payments", slots: [] };
  const contactId = await call<string | null>(rpc, "book_contact", { p_ws: o.ws, p_email: o.guest.email });
  const r: BookResult = await book(rpc, {
    ws: o.ws,
    type: o.type,
    length: o.length,
    start: o.start,
    guest: { email: o.guest.email, name: o.guest.name, tz: o.guest.tz, answers: o.guest.answers },
    source: o.source,
    contactId,
    linkId: o.linkId ?? null,
    submissionId: o.submissionId ?? null,
    pending,
    now: o.now,
    liveBusy: o.liveBusy,
  });
  if (!r.ok) {
    // Group types: the fresh times carry their seats.
    const slots = r.error.startsWith("link") ? [] : o.type.kind === "group" ? await guestSlots(rpc, { ws: o.ws, type: o.type, length: o.length, now: o.now }) : guestSlotsOf(r.slots);
    return { ok: false, error: r.error, slots: slots.filter((s) => s.start !== o.start) };
  }
  if (!contactId) await guestContact(rpc, r.meetingId, o.guest);
  return { ok: true, meetingId: r.meetingId, token: r.token, start: r.start, end: r.end, hosts: r.hosts, pending };
}

// Links ----------------------------------------------------------------------------------------------------------

export type LinkView = {
  link: {
    id: string;
    workspace_id: string;
    kind: "single_use" | "one_off" | "poll";
    type_id: string | null;
    owner_user_id: string;
    title: string | null;
    offered: { start: string; end: string }[];
    length_min: number | null;
    location: Location | null;
    used: boolean;
    closed: boolean;
    meeting_id: string | null;
  };
  type: MeetingType | null;
  ws: Ws;
  owner: Profile | null;
  profiles: Profile[];
  votes: { start: string; n: number }[];
  /** A count for guests; the list for the host. */
  voters: number | { email: string; name: string | null; picks: string[] }[];
};

export async function loadLink(rpc: Rpc, by: { token: string } | { id: string }): Promise<LinkView | null> {
  if ("token" in by && !/^[A-Za-z0-9_-]{20,64}$/.test(by.token)) return null;
  if ("id" in by && !UUID.test(by.id)) return null;
  const v = await call<LinkView | null>(rpc, "book_link", "token" in by ? { p_hash: tokenHash(by.token), p_id: null } : { p_hash: null, p_id: by.id });
  if (!v) return null;
  return { ...v, type: v.type ? withDefaults(v.type) : null };
}

/** A one-off or poll link's length, from what it offered. */
export function linkLength(l: LinkView["link"]): number {
  if (l.length_min) return l.length_min;
  const o = l.offered[0];
  return o ? Math.round((Date.parse(o.end) - Date.parse(o.start)) / MIN) : 30;
}

/** What a guest sees of a link: its type for a single-use link; the link's own length, place and host otherwise. */
export function linkGuestType(v: LinkView): GuestType {
  if (v.link.kind === "single_use" && v.type) return guestTypeOf(v.type, v.profiles, !!v.ws.pay?.ready);
  const owner = v.owner;
  return {
    slug: "",
    name: v.link.title || (owner ? `Meeting with ${owner.name}` : "Meeting"),
    kind: "one",
    lengths: [linkLength(v.link)],
    location: guestLocation(linkLocation(v)),
    questions: v.type?.settings.questions ?? [],
    price: null,
    seats: null,
    hosts: owner ? [{ name: owner.name, photo: owner.photo_url, slug: owner.slug }] : [],
  };
}

const linkLocation = (v: LinkView): Location => v.link.location ?? v.type?.settings.location ?? { kind: "google_meet" };
const buffers = (v: LinkView) => ({ before: v.type?.settings.bufferBefore ?? 0, after: v.type?.settings.bufferAfter ?? 0 });

/**
 * Which of some starts one host is free for, from the cached busy times and meetings (buffers included). A host
 * whose calendar can't be checked or written (none connected, or waiting on a reconnect) is free at none of them.
 */
async function freeStarts(rpc: Rpc, ws: string, host: string, starts: number[], length: number, buf: { before: number; after: number }, skipMeeting?: string): Promise<Set<number>> {
  if (!starts.length) return new Set();
  const from = Math.min(...starts) - buf.before * MIN;
  const to = Math.max(...starts) + (length + buf.after) * MIN;
  const [h] = await hostStates(rpc, ws, [host], from, to);
  if (!h || h.why === "no_calendar" || h.why === "reconnect") return new Set();
  const spans = [...h.input.busy, ...h.input.booked.filter((m) => m.id !== skipMeeting)];
  return new Set(starts.filter((t) => {
    const a = t - buf.before * MIN;
    const b = t + (length + buf.after) * MIN;
    return !spans.some((s) => s.start < b && a < s.end);
  }));
}

/** The one-off link's offered times still ahead and still free. */
export async function oneOffSlots(rpc: Rpc, v: LinkView, now = Date.now()): Promise<GuestSlot[]> {
  if (v.link.kind !== "one_off" || v.link.used || v.link.closed) return [];
  const length = linkLength(v.link);
  const starts = v.link.offered.map((o) => Date.parse(o.start)).filter((t) => Number.isFinite(t) && t > now);
  const free = await freeStarts(rpc, v.link.workspace_id, v.link.owner_user_id, starts, length, buffers(v));
  return starts.filter((t) => free.has(t)).sort((a, b) => a - b).map((start) => ({ start }));
}

/** A guest books one of a one-off link's times. The link closes with the booking (meeting_book marks it used). */
export async function bookOneOff(rpc: Rpc, o: { view: LinkView; start: number; guest: GuestIn; liveBusy: LiveBusy; now?: number }): Promise<BookOutcome> {
  const v = o.view;
  const now = o.now ?? Date.now();
  if (v.link.kind !== "one_off") return { ok: false, error: "not_offered", slots: [] };
  if (v.link.used) return { ok: false, error: "link_used", slots: [] };
  if (v.link.closed) return { ok: false, error: "link_closed", slots: [] };
  const length = linkLength(v.link);
  const open = await oneOffSlots(rpc, v, now);
  const rest = () => open.filter((s) => s.start !== o.start);
  if (!open.some((s) => s.start === o.start)) return { ok: false, error: "not_offered", slots: open };
  const host = v.link.owner_user_id;
  const b = buffers(v);
  const end = o.start + length * MIN;
  const live = await o.liveBusy([host], o.start - b.before * MIN, end + b.after * MIN);
  if (live.has(host)) return { ok: false, error: "slot_taken", slots: rest() };
  const contactId = await call<string | null>(rpc, "book_contact", { p_ws: v.link.workspace_id, p_email: o.guest.email });
  const token = newToken();
  const { data, error } = await rpc("meeting_book", {
    p_ws: v.link.workspace_id,
    p_type: v.link.type_id,
    p_hosts: [host],
    p_start: new Date(o.start).toISOString(),
    p_end: new Date(end).toISOString(),
    p_block_start: new Date(o.start - b.before * MIN).toISOString(),
    p_block_end: new Date(end + b.after * MIN).toISOString(),
    p_guest: { email: o.guest.email, name: o.guest.name, tz: o.guest.tz, answers: o.guest.answers },
    p_source: "one_off",
    p_token_hash: tokenHash(token),
    p_status: "booked",
    p_contact: contactId,
    p_submission: null,
    p_link: v.link.id,
    p_seats: 0,
    p_rr: false,
    p_location: linkLocation(v),
    p_booked_by: null,
  });
  if (error) {
    const code = codeOf(error.message, ["slot_taken", "link_used", "link_closed"] as const);
    if (!code) throw new Error(error.message);
    return { ok: false, error: code, slots: code === "slot_taken" ? rest() : [] };
  }
  const meetingId = data as string;
  await keepManageToken(rpc, meetingId, token).catch(() => undefined);
  if (!contactId) await guestContact(rpc, meetingId, o.guest);
  await enqueueJob(rpc, { workspaceId: v.link.workspace_id, kind: "meeting_sync", key: `create:${meetingId}`, payload: { meeting: meetingId, action: "create" } });
  return { ok: true, meetingId, token, start: o.start, end, hosts: [host], pending: false };
}

// Polls ----------------------------------------------------------------------------------------------------------

/** What a guest sees of a poll: the times ahead, how many picked each, and whether it's still open. */
export function pollView(v: LinkView, now = Date.now()) {
  const counts = new Map(v.votes.map((x) => [Date.parse(x.start), x.n]));
  const owner = v.owner;
  return {
    title: v.link.title || (owner ? `Meeting with ${owner.name}` : "Meeting"),
    host: owner ? { name: owner.name, photo: owner.photo_url, slug: owner.slug } : null,
    length: linkLength(v.link),
    location: guestLocation(linkLocation(v)),
    times: v.link.offered.map((o) => Date.parse(o.start)).filter((t) => t > now).sort((a, b) => a - b).map((start) => ({ start, n: counts.get(start) ?? 0 })),
    voters: typeof v.voters === "number" ? v.voters : v.voters.length,
    closed: v.link.closed || !!v.link.meeting_id,
  };
}
export type PollView = ReturnType<typeof pollView>;

export async function pollVote(rpc: Rpc, token: string, vote: { email: string; name: string; picks: number[] }): Promise<{ ok: true } | { ok: false; error: "link_closed" | "bad_pick" }> {
  const { error } = await rpc("poll_vote", { p_hash: tokenHash(token), p_email: vote.email, p_name: vote.name, p_picks: vote.picks.map((t) => new Date(t).toISOString()) });
  if (!error) return { ok: true };
  const code = codeOf(error.message, ["link_closed", "bad_pick"] as const);
  if (!code) throw new Error(error.message);
  return { ok: false, error: code };
}

export type PollBook =
  | { ok: true; meetingId: string; token: string; guests: string[] }
  | { ok: false; error: "slot_taken" | "link_closed" | "not_offered" | "no_votes"; free: number[] };

/**
 * The host books a poll's winning time. The time must still be free in the host's calendar (cached and live) and in
 * Claritia; otherwise nothing is written and the host gets the poll's times that are still free, to pick again.
 * Every voter is a guest: the first to pick this time is the meeting's guest, and every voter's address goes in
 * answers.guests (comma separated) for the calendar invite and the emails.
 */
export async function pollBookWinner(rpc: Rpc, o: { view: LinkView; start: number; bookedBy: string; liveBusy: LiveBusy; now?: number }): Promise<PollBook> {
  const v = o.view;
  const now = o.now ?? Date.now();
  const voters = Array.isArray(v.voters) ? v.voters : [];
  const length = linkLength(v.link);
  const starts = v.link.offered.map((x) => Date.parse(x.start)).filter((t) => t > now);
  const host = v.link.owner_user_id;
  const b = buffers(v);
  const free = async (except?: number) => [...(await freeStarts(rpc, v.link.workspace_id, host, starts, length, b))].filter((t) => t !== except).sort((x, y) => x - y);
  if (v.link.kind !== "poll") return { ok: false, error: "not_offered", free: [] };
  if (v.link.closed || v.link.meeting_id) return { ok: false, error: "link_closed", free: [] };
  if (!starts.includes(o.start)) return { ok: false, error: "not_offered", free: await free() };
  if (!voters.length) return { ok: false, error: "no_votes", free: await free() };
  const cached = await freeStarts(rpc, v.link.workspace_id, host, [o.start], length, b);
  const end = o.start + length * MIN;
  if (!cached.has(o.start) || (await o.liveBusy([host], o.start - b.before * MIN, end + b.after * MIN)).has(host)) return { ok: false, error: "slot_taken", free: await free(o.start) };
  const iso = new Date(o.start).toISOString();
  const pickedIt = voters.filter((x) => x.picks.some((p) => Date.parse(p) === o.start));
  const lead = pickedIt[0] ?? voters[0]!;
  const guests = [...new Set(voters.map((x) => x.email))];
  const token = newToken();
  const { data, error } = await rpc("poll_book", {
    p_link: v.link.id,
    p_hosts: [host],
    p_start: iso,
    p_end: new Date(end).toISOString(),
    p_block_start: new Date(o.start - b.before * MIN).toISOString(),
    p_block_end: new Date(end + b.after * MIN).toISOString(),
    p_guest: { email: lead.email, name: lead.name ?? "", tz: "", answers: { guests: guests.join(", "), poll: v.link.title ?? "" } },
    p_token_hash: tokenHash(token),
    p_location: linkLocation(v),
    p_booked_by: o.bookedBy,
  });
  if (error) {
    const code = codeOf(error.message, ["slot_taken", "link_closed", "not_offered"] as const);
    if (!code) throw new Error(error.message);
    return { ok: false, error: code, free: code === "slot_taken" ? await free(o.start) : [] };
  }
  const meetingId = data as string;
  await keepManageToken(rpc, meetingId, token).catch(() => undefined);
  await guestContact(rpc, meetingId, { email: lead.email, name: lead.name });
  await enqueueJob(rpc, { workspaceId: v.link.workspace_id, kind: "meeting_sync", key: `create:${meetingId}`, payload: { meeting: meetingId, action: "create" } });
  return { ok: true, meetingId, token, guests };
}

// Making links (members) -----------------------------------------------------------------------------------------

export type LinkIn = { kind: "single_use" | "one_off" | "poll"; typeId?: string | null; title?: string; offered?: { start: number | string; end?: number | string }[]; length?: number; location?: unknown; expiresAt?: number | string | null };
export type LinkRow = { kind: LinkIn["kind"]; type_id: string | null; owner_user_id: string; title: string | null; offered: { start: string; end: string }[]; length_min: number | null; location: Location | null; expires_at: string | null; token_hash: string };

/**
 * Check a new link. Single-use links need a type; one-off links and polls need 1 to 40 times ahead, all one length.
 * The token goes back to the caller once (only its hash is kept).
 */
export function checkLink(raw: LinkIn, o: { owner: string; type: MeetingType | null; now?: number }): { row: LinkRow; token: string } | { errors: string[] } {
  const now = o.now ?? Date.now();
  const errors: string[] = [];
  const kind = raw.kind;
  if (!["single_use", "one_off", "poll"].includes(kind)) return { errors: ["Pick a kind of link."] };
  if (kind === "single_use" && !o.type) return { errors: ["Pick a meeting type."] };
  const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 120) : "";
  let offered: { start: string; end: string }[] = [];
  let length: number | null = null;
  if (kind !== "single_use") {
    length = Math.round(Number(raw.length ?? o.type?.settings.lengths[0] ?? 30));
    if (!Number.isFinite(length) || length < 5 || length > 480) errors.push("A meeting is 5 minutes to 8 hours.");
    const starts = [...new Set((Array.isArray(raw.offered) ? raw.offered : []).map((x) => new Date(x?.start as string | number).getTime()))].filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
    if (!starts.length) errors.push("Pick at least one time.");
    if (starts.length > 40) errors.push("Offer 40 times at most.");
    if (starts.some((t) => t <= now)) errors.push("Every time must be ahead.");
    if (starts.some((t) => t > now + 365 * 86_400_000)) errors.push("Times must be within a year.");
    if (length && starts.some((t, i) => i > 0 && t < starts[i - 1]! + length! * MIN && kind === "one_off")) errors.push("Two times overlap.");
    offered = starts.map((t) => ({ start: new Date(t).toISOString(), end: new Date(t + (length ?? 30) * MIN).toISOString() }));
  }
  let location: Location | null = null;
  if (raw.location !== undefined && raw.location !== null) {
    const c = checkSettings({ ...DEFAULT_SETTINGS, location: raw.location }, "one");
    const locErrors = c.errors.filter((e) => /address|phone|link|location/i.test(e));
    if (locErrors.length) errors.push(...locErrors);
    else location = c.settings.location;
  }
  let expires: string | null = null;
  if (raw.expiresAt !== undefined && raw.expiresAt !== null && raw.expiresAt !== "") {
    const t = new Date(raw.expiresAt).getTime();
    if (!Number.isFinite(t) || t <= now) errors.push("The link must end in the future.");
    else expires = new Date(t).toISOString();
  }
  if (errors.length) return { errors: [...new Set(errors)] };
  const token = randomBytes(18).toString("base64url");
  return {
    token,
    row: { kind, type_id: o.type?.id ?? null, owner_user_id: o.owner, title: title || null, offered, length_min: kind === "single_use" ? null : length, location, expires_at: expires, token_hash: createHash("sha256").update(token).digest("hex") },
  };
}

// The guest's manage link ------------------------------------------------------------------------------------------

export type MeetingView = {
  meeting: {
    id: string;
    workspace_id: string;
    type_id: string | null;
    link_id: string | null;
    hosts: string[];
    guest_email: string;
    guest_name: string | null;
    guest_tz: string | null;
    start_at: string;
    end_at: string;
    status: MeetingStatus;
    source: MeetingSource;
    location: Location | Record<string, never>;
    payment: { session?: string; url?: string; account?: string; intent?: string; amount?: number; currency?: string; status?: string; refund?: string } | null;
    cancel_reason: string | null;
    created_at: string;
    holds: boolean;
  };
  type: MeetingType | null;
  link: { kind: string; title: string | null; length_min: number | null } | null;
  ws: Ws;
  profiles: Profile[];
};

export async function loadMeeting(rpc: Rpc, by: { token: string } | { id: string }): Promise<MeetingView | null> {
  if ("token" in by && !/^[A-Za-z0-9_-]{20,64}$/.test(by.token)) return null;
  if ("id" in by && !UUID.test(by.id)) return null;
  const v = await call<MeetingView | null>(rpc, "book_meeting", "token" in by ? { p_hash: tokenHash(by.token), p_id: null } : { p_hash: null, p_id: by.id });
  if (!v) return null;
  return { ...v, type: v.type ? withDefaults(v.type) : null };
}

/** What the guest can still do. A meeting from a type moves within that type (a group seat to another start); links only cancel. */
export function canChange(v: MeetingView, now = Date.now()): { reschedule: boolean; cancel: boolean } {
  const m = v.meeting;
  const ahead = Date.parse(m.start_at) > now;
  const live = m.status === "booked" || (m.status === "pending_payment" && m.holds);
  return {
    reschedule: ahead && m.status === "booked" && !!v.type && v.type.active && m.source !== "one_off" && m.source !== "poll",
    cancel: ahead && live,
  };
}

const spanOf = (v: MeetingView): Span => ({ start: Date.parse(v.meeting.start_at), end: Date.parse(v.meeting.end_at) });

/**
 * An Rpc that leaves one meeting out of its hosts' booked and busy times, so a meeting can move next to where it is
 * or overlap its old time. Its own calendar event comes back from the providers as busy, so that span is cut out.
 */
const without = (rpc: Rpc, v: MeetingView): Rpc => async (fn, args) => {
  const r = await rpc(fn, args);
  if (fn !== "meeting_inputs" || r.error || !Array.isArray(r.data)) return r;
  const hole = spanOf(v);
  const iso = (n: number) => new Date(n).toISOString();
  return {
    data: (r.data as { id: string; booked: unknown[][]; busy: [string, string][] }[]).map((h) => ({
      ...h,
      booked: (h.booked ?? []).filter((b) => b[4] !== v.meeting.id),
      busy: v.meeting.hosts.includes(h.id) ? cut((h.busy ?? []).map(([a, b]) => ({ start: Date.parse(a), end: Date.parse(b) })), hole).map((x) => [iso(x.start), iso(x.end)]) : h.busy,
    })),
    error: null,
  };
};

/**
 * The live check for a move: the meeting's own hosts are asked only about the part outside its old time, and a
 * group start that already has seats leaves out its own event too.
 */
async function liveForMove(live: LiveBusy, v: MeetingView, hosts: string[], block: Span, session: Span | null): Promise<Set<string>> {
  const mine = hosts.filter((h) => v.meeting.hosts.includes(h));
  const others = hosts.filter((h) => !v.meeting.hosts.includes(h));
  const sets = await Promise.all([
    others.length ? liveAt(live, others, block, session) : new Set<string>(),
    mine.length ? liveAt((h, from, to) => liveAt(live, h, { start: from, end: to }, spanOf(v)), mine, block, session) : new Set<string>(),
  ]);
  return new Set(sets.flatMap((x) => [...x]));
}

const meetingLength = (v: MeetingView) => Math.round((Date.parse(v.meeting.end_at) - Date.parse(v.meeting.start_at)) / MIN);

/** The times this meeting can move to: same length, same type; only its own hosts' when the type keeps the host. */
async function moveSlots(rpc: Rpc, v: MeetingView, now: number): Promise<Slot[] & { seated?: number[] }> {
  if (!v.type) return [];
  const type = v.type;
  const length = meetingLength(v);
  const t: MeetingType = type.settings.lengths.includes(length) ? type : { ...type, settings: { ...type.settings, lengths: [...type.settings.lengths, length] } };
  const off = await offer(without(rpc, v), { ws: v.meeting.workspace_id, type: t, length, now });
  const mine = v.meeting.hosts;
  const out: Slot[] & { seated?: number[] } = off.slots.filter((s) => s.start !== Date.parse(v.meeting.start_at) && (type.settings.reschedule !== "same_host" || mine.every((h) => s.hosts.includes(h))));
  if (off.seated) out.seated = off.seated;
  return out;
}

export async function rescheduleSlots(rpc: Rpc, v: MeetingView, now = Date.now()): Promise<GuestSlot[]> {
  if (!canChange(v, now).reschedule) return [];
  return (await moveSlots(rpc, v, now)).map((s) => ({ start: s.start }));
}

export type MoveOutcome = { ok: true; start: number; end: number; hosts: string[] } | { ok: false; error: "slot_taken" | "not_offered" | "not_movable"; slots: GuestSlot[] };

/**
 * The guest moves their meeting. The new time must be offered for this meeting (same type and length); the hosts
 * are kept when they're free, else the round robin picks among those free; the live check runs; then meeting_move
 * locks the hosts and refuses an overlap. The calendar event is moved by meeting_sync.
 */
export async function reschedule(rpc: Rpc, o: { view: MeetingView; start: number; liveBusy: LiveBusy; now?: number }): Promise<MoveOutcome> {
  const now = o.now ?? Date.now();
  const v = o.view;
  if (!canChange(v, now).reschedule) return { ok: false, error: "not_movable", slots: [] };
  const type = v.type!;
  const slots = await moveSlots(rpc, v, now);
  const rest = () => slots.filter((s) => s.start !== o.start).map((s) => ({ start: s.start }));
  const slot = slots.find((s) => s.start === o.start);
  if (!slot) return { ok: false, error: "not_offered", slots: rest() };
  const length = meetingLength(v);
  const s = type.settings;
  const end = o.start + length * MIN;
  const blockStart = o.start - s.bufferBefore * MIN;
  const blockEnd = end + s.bufferAfter * MIN;
  const busy = await liveForMove(o.liveBusy, v, slot.hosts, { start: blockStart, end: blockEnd }, slots.seated?.includes(o.start) ? { start: o.start, end } : null);
  const free = slot.hosts.filter((h) => !busy.has(h));
  const mine = v.meeting.hosts;
  let hosts: string[] = [];
  if (mine.every((h) => free.includes(h))) hosts = mine;
  else if (s.reschedule === "pool") {
    if (type.kind === "collective") hosts = free.length === slot.hosts.length ? free : [];
    else if (type.kind === "double") hosts = pickPair(free, type.hosts, await turnsFor(rpc, type.id));
    else if (type.kind === "round_robin" || type.kind === "owner_first") {
      const one = pickHost(free, type.hosts, await turnsFor(rpc, type.id));
      hosts = one ? [one] : [];
    }
  }
  if (!hosts.length) return { ok: false, error: "slot_taken", slots: rest() };
  const { error } = await rpc("meeting_move", {
    p_id: v.meeting.id,
    p_hosts: hosts,
    p_start: new Date(o.start).toISOString(),
    p_end: new Date(end).toISOString(),
    p_block_start: new Date(blockStart).toISOString(),
    p_block_end: new Date(blockEnd).toISOString(),
  });
  if (error) {
    const found = codeOf(error.message, ["slot_taken", "full", "not_movable"] as const);
    if (!found) throw new Error(error.message);
    const code = found === "full" ? "slot_taken" : found;
    return { ok: false, error: code, slots: code === "slot_taken" ? (await moveSlots(rpc, v, now)).filter((x) => x.start !== o.start).map((x) => ({ start: x.start })) : [] };
  }
  await enqueueJob(rpc, { workspaceId: v.meeting.workspace_id, kind: "meeting_sync", key: `move:${v.meeting.id}:${Date.now()}`, payload: { meeting: v.meeting.id, action: "move" } });
  return { ok: true, start: o.start, end, hosts };
}

/**
 * The guest cancels, with an optional reason. A booked meeting's calendar event is canceled by meeting_sync; a time
 * held for payment just lets go (no event was made). Guests aren't refunded here: refunds follow a host's cancel.
 */
export async function cancelByGuest(rpc: Rpc, o: { view: MeetingView; reason?: string; now?: number }): Promise<{ ok: true } | { ok: false; error: "not_cancelable" }> {
  const v = o.view;
  if (!canChange(v, o.now).cancel) return { ok: false, error: "not_cancelable" };
  const was = v.meeting.status;
  const { error } = await rpc("meeting_status", { p_id: v.meeting.id, p_status: "canceled", p_reason: o.reason?.trim().slice(0, 500) || null, p_by: null });
  if (error) {
    if (error.message.includes("bad_change")) return { ok: false, error: "not_cancelable" };
    throw new Error(error.message);
  }
  if (was === "booked") await enqueueJob(rpc, { workspaceId: v.meeting.workspace_id, kind: "meeting_sync", key: `cancel:${v.meeting.id}:${Date.now()}`, payload: { meeting: v.meeting.id, action: "cancel" } });
  return { ok: true };
}

/** What the manage page shows the guest. */
export function guestMeeting(v: MeetingView, now = Date.now()) {
  const m = v.meeting;
  const byId = new Map(v.profiles.map((p) => [p.user_id, p]));
  const loc = (m.location && "kind" in m.location ? m.location : null) as Location | null;
  return {
    name: v.type?.name ?? v.link?.title ?? "Meeting",
    start: Date.parse(m.start_at),
    end: Date.parse(m.end_at),
    status: m.status,
    holds: m.holds,
    guest: { name: m.guest_name ?? "", email: m.guest_email, tz: m.guest_tz },
    hosts: m.hosts.map((h) => byId.get(h)).filter((p): p is Profile => !!p).map((p) => ({ name: p.name, photo: p.photo_url, slug: p.slug })),
    location: loc ? { kind: loc.kind, ...(loc.kind === "in_person" ? { detail: loc.address } : {}) } : null,
    reason: m.cancel_reason,
    payment: m.payment?.amount ? { amount: m.payment.amount, currency: m.payment.currency ?? "usd", url: m.status === "pending_payment" && m.holds ? (m.payment.url ?? null) : null, refunded: !!m.payment.refund } : null,
    ...canChange(v, now),
    wsSlug: v.ws.slug,
    typeSlug: v.type && !v.type.secret ? v.type.slug : null,
  };
}
export type GuestMeeting = ReturnType<typeof guestMeeting>;
