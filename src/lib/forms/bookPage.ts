// The meeting's own booking page inside a form (docs/ending-plan.md Part 4). After the send, a form that books with
// Claritia calendar shows /book/f/<token> in a frame: the meeting type's page (description, lengths, questions,
// location, the brand's look) with the times of the rep Routing picked. The token is the form's signed booking token
// (booking.ts), so everything the form's own calendar keeps holds here too: a retried send gets the same token, the
// meeting is booked with that rep alone when Routing named one, it joins the fill and its contact, and a fill has one
// meeting at most (a second booking gets the first one back). The guest is the fill's contact, never what the
// browser says. Server only.

import type { Rpc } from "../jobs.ts";
import { bookForClaim, fillCtx, timesForClaim, type Claim } from "./booking.ts";
import { checkGuest, type BookReply, type Confirmation, type GuestSlot } from "../meetings/guest.ts";
import type { MeetingType } from "../meetings/types.ts";

/**
 * Whether a workspace's forms show the booking page (FORM_BOOK_PAGE on the server: "all", or workspace ids with commas
 * between). Off by default; the form's own calendar shows when it's off.
 */
export function bookPageOn(ws: string, env = process.env.FORM_BOOK_PAGE): boolean {
  const v = (env ?? "").trim().toLowerCase();
  if (!v) return false;
  if (v === "all") return true;
  return v.split(",").map((x) => x.trim()).includes(ws.toLowerCase());
}

/** The page's address on the app (tryclaritia.com/book sends people there anyway, so the frame skips that hop). */
export const bookPageUrl = (base: string, token: string) => `${base.replace(/\/+$/, "")}/book/f/${encodeURIComponent(token)}`;

/** The type as the page shows it: a collective fill's whole team, or with Routing's rep, that rep alone. */
export function pageType(t: MeetingType, c: Claim, hosts?: string[] | null): MeetingType {
  if (hosts?.length) return { ...t, kind: "collective", hosts: hosts.map((user_id) => ({ user_id })) as MeetingType["hosts"] };
  return c.only && c.owner ? { ...t, hosts: [{ user_id: c.owner }] as MeetingType["hosts"] } : t;
}

const gone = (error = "This booking isn't open anymore."): { status: number; reply: BookReply } => ({ status: 410, reply: { ok: false, error, code: "link_used", slots: [] } });

function confirmation(c: MeetingType["settings"]["confirmation"] | undefined): Confirmation {
  if (c?.kind === "redirect" && /^https:\/\/\S+$/.test(c.url)) return { kind: "redirect", url: c.url };
  return { kind: "message", ...(c?.kind === "message" && c.text ? { text: c.text.slice(0, 1000) } : {}) };
}

/** The times for one length, as the booking page reads them. A fill that already booked has none left. */
export async function claimSlots(rpc: Rpc, token: string, c: Claim, length?: number, now?: number): Promise<{ status: number; slots: GuestSlot[] }> {
  const r = await timesForClaim(rpc, token, c, { length, now });
  if (r.status !== 200 || r.body.booked || !r.body.booking) return { status: r.status === 200 ? 200 : r.status, slots: [] };
  return { status: 200, slots: r.body.booking.slots.map((start) => ({ start })) };
}

/**
 * Book from the page: the type's questions are checked as on any booking page, the name and email are the fill's,
 * and the booking goes through bookForClaim (the live check, Routing's rep, one meeting per fill).
 */
export async function claimBook(
  rpc: Rpc,
  token: string,
  c: Claim,
  raw: Record<string, unknown>,
  o: { now?: number; liveBusyFor: (ws: string) => (hosts: string[], from: number, to: number) => Promise<Set<string>> },
): Promise<{ status: number; reply: BookReply; guest?: { ws: string; email: string; answers: Record<string, string>; questions: MeetingType["settings"]["questions"] } }> {
  const ctx = await fillCtx(rpc, c.submission, c.type);
  if (!ctx?.type || !ctx.contact_id || !ctx.email) return gone();
  const t = ctx.type;
  const name = [ctx.first_name, ctx.last_name].filter(Boolean).join(" ") || (typeof raw.name === "string" ? raw.name : "");
  const g = checkGuest({ ...raw, name: name || ctx.email, email: ctx.email }, t.settings.questions, t.settings.location);
  if ("error" in g) return { status: 400, reply: { ok: false, error: g.error, code: "guest", slots: [] } };
  const start = typeof raw.start === "number" && Number.isFinite(raw.start) ? Math.round(raw.start) : NaN;
  if (!Number.isFinite(start)) return { status: 400, reply: { ok: false, error: "Pick a time.", code: "time", slots: [] } };
  const length = typeof raw.length === "number" && Number.isInteger(raw.length) ? raw.length : undefined;
  const r = await bookForClaim(rpc, token, c, { start, length, tz: g.guest.tz || undefined, now: o.now, base: "", answers: g.guest.answers, liveBusyFor: o.liveBusyFor });
  const b = r.body.booked;
  if (b) {
    const hosts = b.host ? [{ name: b.host.name, photo: b.host.photo ?? null }] : [];
    return { status: 200, reply: { ok: true, start: b.start, end: b.end, manage: b.manage ?? "", hosts, confirmation: confirmation(t.settings.confirmation) }, guest: { ws: ctx.workspace_id, email: ctx.email, answers: g.guest.answers, questions: t.settings.questions } };
  }
  if (r.body.taken) return { status: 409, reply: { ok: false, error: "That time was just taken. Pick another.", code: "slot_taken", slots: (r.body.booking?.slots ?? []).map((s) => ({ start: s })) } };
  if (r.status === 410) return gone();
  return { status: r.status >= 400 ? r.status : 503, reply: { ok: false, error: r.body.error ?? "Booking didn't go through. Try again in a moment.", code: "error", slots: [] } };
}
