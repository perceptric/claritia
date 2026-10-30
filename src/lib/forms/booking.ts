// Instant booking on form submit (docs/meetings-scheduler.md Part 2). A fill that books with Claritia calendar gets
// times from offer() over the cached busy times (no calendar provider on this path), with a signed booking token tied
// to the submission, the meeting type and the contact's owner, good for 2 hours from when the times were first shown.
// A retry of the same fill gets the same token. The booking itself goes through book() with the live check. The first
// time times are shown, meeting_book_later is queued 10 minutes out (form_booking_shown, once per submission).
// Server only.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { Rpc } from "../jobs.ts";
import { book, offer } from "../meetings/server.ts";
import type { LiveRouter } from "../router/server.ts";
import { DEFAULT_SETTINGS, type MeetingType, type Slot } from "../meetings/types.ts";
import type { Booked, Booking } from "./calendar.ts";

export type { Booked, Booking };

export const BOOK_TTL = 2 * 3_600_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** What a booking token stands for. `owner` is the contact's owner when the times were shown, or null. */
export type Claim = { submission: string; type: string; owner: string | null; exp: number };

const mac = (body: string, secret: string) => createHmac("sha256", secret).update(`form-book:${body}`).digest("base64url").slice(0, 32);

/** submission.type.owner.expiry(base36 seconds).mac: short enough to carry in an address. */
export function signBooking(c: Claim, secret: string): string {
  const body = `${c.submission}.${c.type}.${c.owner ?? "-"}.${Math.floor(c.exp / 1000).toString(36)}`;
  return `${body}.${mac(body, secret)}`;
}

/** The claim in a token, "expired" for a real one past its time, or null for anything forged or malformed. */
export function readBooking(token: unknown, secret: string | undefined, now = Date.now()): Claim | "expired" | null {
  if (!secret || typeof token !== "string" || token.length > 300) return null;
  const p = token.split(".");
  if (p.length !== 5) return null;
  const [s, t, o, e, sig] = p as [string, string, string, string, string];
  if (!UUID.test(s) || !UUID.test(t) || (o !== "-" && !UUID.test(o)) || !/^[0-9a-z]{1,10}$/.test(e)) return null;
  const want = Buffer.from(mac(`${s}.${t}.${o}.${e}`, secret));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const exp = parseInt(e, 36) * 1000;
  if (exp <= now) return "expired";
  return { submission: s, type: t, owner: o === "-" ? null : o, exp };
}

type Profile = { name: string; photo?: string | null };
/** The fill as booking needs it (form_booking_ctx). */
export type FillCtx = {
  workspace_id: string;
  contact_id: string | null;
  spam: boolean;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  owner: string | null;
  shown_at: string | null;
  type: MeetingType | null;
  meeting: { id: string; start: string; end: string; hosts: string[] } | null;
  profiles: Record<string, Profile>;
};

export async function fillCtx(rpc: Rpc, submission: string, type: string): Promise<FillCtx | null> {
  const { data, error } = await rpc("form_booking_ctx", { p_submission: submission, p_type: type });
  if (error) throw new Error(error.message);
  const c = data as FillCtx | null;
  if (c?.type) c.type = { ...c.type, settings: { ...DEFAULT_SETTINGS, ...c.type.settings } };
  return c;
}

const hostView = (ctx: FillCtx, id: string | undefined): Booking["host"] => {
  const p = id ? ctx.profiles?.[id] : undefined;
  return p?.name ? { name: p.name, ...(p.photo && /^https:\/\//.test(p.photo) ? { photo: p.photo } : {}) } : undefined;
};

/** Who the lead sees on the calendar: the one host every time is with (the owner, the next host or a lone host). */
function shownHost(t: MeetingType, slots: Slot[]): string | undefined {
  if (t.kind === "collective" || t.kind === "double") return undefined;
  const all = new Set(slots.flatMap((s) => s.hosts));
  return all.size === 1 ? [...all][0] : undefined;
}

async function times(rpc: Rpc, ctx: FillCtx, owner: string | null, length: number | undefined, now: number, live?: LiveRouter | null) {
  const t = ctx.type!;
  const lengths = t.settings.lengths;
  const len = length !== undefined && lengths.includes(length) ? length : lengths[0]!;
  const o = await offer(rpc, { ws: ctx.workspace_id, type: t, length: len, now, owner, live });
  return { slots: o.slots.map((s) => s.start), lengths, length: len, host: hostView(ctx, shownHost(t, o.slots)) };
}

/**
 * Times for a fill that books with Claritia calendar, or null when there are none to show (no calendar connected,
 * no free time, the type gone): the form then shows its message. Marks the times shown the first time. `live` is the
 * router the send already read for routing, so a team type doesn't read it again.
 */
export async function offerForFill(rpc: Rpc, o: { submission: string; typeId: string; secret: string; now?: number; clock?: number; live?: LiveRouter | null }): Promise<Booking | null> {
  const now = o.now ?? Date.now();
  const ctx = await fillCtx(rpc, o.submission, o.typeId);
  if (!ctx?.type || !ctx.contact_id || ctx.spam || !ctx.email) return null;
  const r = await times(rpc, ctx, ctx.owner, undefined, now, o.live);
  if (!r.slots.length) return null;
  const { data, error } = await rpc("form_booking_shown", { p_submission: o.submission, p_type: o.typeId, p_owner: ctx.owner });
  if (error) throw new Error(error.message);
  // The token's time runs from the first showing, so a retried send gets the same token.
  const exp = new Date(data as string).getTime() + BOOK_TTL;
  if (!(exp > (o.clock ?? Date.now()))) return null;
  const token = signBooking({ submission: o.submission, type: o.typeId, owner: ctx.owner, exp }, o.secret);
  return { token, slots: r.slots, lengths: r.lengths, length: r.length, ...(r.host ? { host: r.host } : {}) };
}

export type BookAnswer = { status: number; body: { booked?: Booked; booking?: Booking; taken?: boolean; error?: string } };

const gone: BookAnswer = { status: 410, body: { error: "This booking isn't open anymore." } };

/** Fresh times for a token: another length, or the calendar opening on a thank-you page. */
export async function timesForClaim(rpc: Rpc, token: string, c: Claim, o: { length?: number; now?: number } = {}): Promise<BookAnswer> {
  const ctx = await fillCtx(rpc, c.submission, c.type);
  if (!ctx?.type || !ctx.contact_id || !ctx.email) return gone;
  if (ctx.meeting) return { status: 200, body: { booked: bookedView(ctx, ctx.meeting) } };
  const r = await times(rpc, ctx, c.owner, o.length, o.now ?? Date.now());
  return { status: 200, body: { booking: { token, slots: r.slots, lengths: r.lengths, length: r.length, ...(r.host ? { host: r.host } : {}) } } };
}

const bookedView = (ctx: FillCtx, m: { start: string; end: string; hosts: string[] }, manage?: string): Booked => {
  const host = hostView(ctx, m.hosts.length === 1 ? m.hosts[0] : undefined);
  return { start: new Date(m.start).getTime(), end: new Date(m.end).getTime(), ...(host ? { host } : {}), ...(manage ? { manage } : {}) };
};

/**
 * Book one start for the lead behind a token. The guest is the fill's contact, never what the browser says. A fill
 * that already has its meeting (a second click, a retry) gets that meeting back; a lost race gets fresh times.
 */
export async function bookForClaim(
  rpc: Rpc,
  token: string,
  c: Claim,
  o: { start: number; length?: number; tz?: string; now?: number; base?: string; liveBusyFor: (ws: string) => (hosts: string[], from: number, to: number) => Promise<Set<string>> },
): Promise<BookAnswer> {
  const ctx = await fillCtx(rpc, c.submission, c.type);
  if (!ctx?.type || !ctx.contact_id || !ctx.email) return gone;
  if (ctx.meeting) return { status: 200, body: { booked: bookedView(ctx, ctx.meeting) } };
  const t = ctx.type;
  const length = o.length !== undefined && t.settings.lengths.includes(o.length) ? o.length : t.settings.lengths[0]!;
  const name = [ctx.first_name, ctx.last_name].filter(Boolean).join(" ");
  let r;
  try {
    r = await book(rpc, {
      ws: ctx.workspace_id,
      type: t,
      length,
      start: o.start,
      guest: { email: ctx.email, ...(name ? { name } : {}), ...(o.tz ? { tz: o.tz } : {}) },
      source: "form",
      owner: c.owner,
      contactId: ctx.contact_id,
      submissionId: c.submission,
      now: o.now,
      liveBusy: o.liveBusyFor(ctx.workspace_id),
    });
  } catch (e) {
    // Two clicks at once on different times: the database keeps one meeting per fill, and both get that one.
    if (!/meetings_one_per_submission/.test(e instanceof Error ? e.message : "")) throw e;
    const again = await fillCtx(rpc, c.submission, c.type);
    if (again?.meeting) return { status: 200, body: { booked: bookedView(again, again.meeting) } };
    throw e;
  }
  if (r.ok) {
    const manage = o.base ? `${o.base}/book/m/${r.token}` : undefined;
    return { status: 200, body: { booked: bookedView(ctx, { start: new Date(r.start).toISOString(), end: new Date(r.end).toISOString(), hosts: r.hosts }, manage) } };
  }
  if (r.error === "link_used" || r.error === "link_closed") return gone;
  const host = hostView(ctx, shownHost(t, r.slots));
  return { status: 409, body: { taken: true, booking: { token, slots: r.slots.map((s) => s.start), lengths: t.settings.lengths, length, ...(host ? { host } : {}) } } };
}
