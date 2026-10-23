"use client";

import { useCallback } from "react";
import type { BookReply, GuestSlot, GuestType } from "@/lib/meetings/guest";
import { BookingCalendar, type BookRequest } from "./BookingCalendar";
import { postToParent } from "./BookShell";

// A booking page's calendar wired to its public route (/api/book/t/<ws>/<slug> or /api/book/l/<token>): times
// for a length, then the booking.

export async function readReply(res: Response): Promise<BookReply> {
  const j = (await res.json().catch(() => ({}))) as Partial<BookReply> & { error?: string; code?: string; slots?: GuestSlot[]; field?: string };
  if (res.ok && j.ok === true) return j as BookReply;
  return { ok: false, error: j.error ?? "Try again in a moment.", code: j.code ?? "error", slots: j.slots ?? [], ...(j.field ? { field: j.field } : {}) } as BookReply;
}

export function BookFlow(p: {
  endpoint: string;
  type: GuestType;
  initialSlots?: GuestSlot[];
  turnstileKey?: string | null;
  logo?: string | null;
  embed?: boolean;
  prefill?: { name?: string; email?: string };
  /** From a booking link: the host to prefer and the signed ref of the form fill it came from. */
  link?: { host?: string; ref?: string };
}) {
  const { endpoint } = p;
  const host = p.link?.host;
  const ref = p.link?.ref;
  const load = useCallback(async (len: number) => {
    const q = new URLSearchParams({ len: String(len), ...(host ? { host } : {}) });
    const res = await fetch(`${endpoint}?${q}`, { cache: "no-store" });
    if (!res.ok) throw new Error("load");
    return ((await res.json()) as { slots: GuestSlot[] }).slots;
  }, [endpoint, host]);
  const book = useCallback(
    async (req: BookRequest) => readReply(await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...req, host, ref }) })),
    [endpoint, host, ref],
  );
  return (
    <BookingCalendar
      type={p.type}
      load={load}
      initialSlots={p.initialSlots}
      book={book}
      logo={p.logo}
      turnstileKey={p.turnstileKey}
      embedded={p.embed}
      prefill={p.prefill}
      onBooked={(r) => postToParent({ type: "book:booked", start: r.start, end: r.end })}
    />
  );
}
