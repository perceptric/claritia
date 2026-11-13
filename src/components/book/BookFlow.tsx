"use client";

import { useCallback, useRef, useState } from "react";
import type { RouteQuestion } from "@/lib/meetings/dynamic";
import type { BookReply, GuestSlot, GuestType } from "@/lib/meetings/guest";
import { postToParent } from "./browser";
import { Calendar, type BookRequest } from "./Calendar";
import { RouteQuestions } from "./RouteQuestions";

// A booking page's calendar wired to its public route (/api/book/t/<ws>/<slug> or /api/book/l/<token>): times
// for a length, then the booking. A Dynamic meeting's questions come first; their answers go with each read and the
// booking, so the server shows and books the reps they pick.

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
  /** Form Studio's preview of a form's Ending: Book shows the confirmation and books nothing. */
  preview?: boolean;
  prefill?: { name?: string; email?: string };
  /** From a booking link: the host to prefer and the signed ref of the form fill it came from. */
  link?: { host?: string; ref?: string };
  /** A Dynamic meeting's questions, asked before the times. */
  questions?: RouteQuestion[];
  /** The meeting's questions the form fill already answered (src/lib/meetings/known.ts). */
  known?: Record<string, string>;
}) {
  const { endpoint } = p;
  const host = p.link?.host;
  const ref = p.link?.ref;
  const asks = !!p.questions?.length;
  const [route, setRoute] = useState<Record<string, string> | null>(null);
  const [last, setLast] = useState<Record<string, string>>({});
  const waiting = asks && !route;
  // This page's hold token: the time the guest picks is kept for them for 5 minutes (src/lib/meetings/holds.ts).
  const [holdId] = useState(() => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, "").slice(0, 32).padEnd(16, "0"));
  const load = useCallback(
    async (len: number) => {
      if (waiting) return [];
      const q = new URLSearchParams({ len: String(len), hold: holdId, ...(host ? { host } : {}), ...(route ? { a: JSON.stringify(route) } : {}) });
      const res = await fetch(`${endpoint}?${q}`, { cache: "no-store" });
      if (!res.ok) throw new Error("load");
      return ((await res.json()) as { slots: GuestSlot[] }).slots;
    },
    [endpoint, host, route, waiting, holdId],
  );
  // A hold that can't be asked lets the guest carry on: the booking's own checks stay in charge.
  const hold = useCallback(
    async (start: number) => {
      if (p.preview) return true;
      try {
        const res = await fetch(endpoint, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ start, hold: holdId }) });
        if (!res.ok) return true;
        return ((await res.json()) as { ok?: boolean }).ok !== false;
      } catch {
        return true;
      }
    },
    [endpoint, holdId, p.preview],
  );
  // The guest's email, for the page around an embed: its tracking links the visitor to them (bookElement.ts).
  const guest = useRef("");
  const book = useCallback(
    async (req: BookRequest) => {
      guest.current = req.email;
      if (p.preview) return { ok: true, start: req.start, end: req.start + req.length * 60_000, manage: "", hosts: [], confirmation: { kind: "message", text: "Preview only: nothing was booked." } } as BookReply;
      return readReply(await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...req, host, ref, hold: holdId, ...(route ? { route } : {}) }) }));
    },
    [endpoint, host, ref, route, p.preview, holdId],
  );
  return (
    <Calendar
      // New answers, a fresh calendar: its times are read again for the reps they pick.
      key={route ? JSON.stringify(route) : "q"}
      type={p.type}
      load={load}
      initialSlots={asks ? undefined : p.initialSlots}
      book={book}
      hold={hold}
      overlay={!p.preview}
      known={p.known}
      before={waiting ? <RouteQuestions questions={p.questions!} initial={last} onDone={(a) => (setLast(a), setRoute(a))} /> : undefined}
      banner={
        asks && route ? (
          <button type="button" className="cb-back" onClick={() => setRoute(null)}>
            Change answers
          </button>
        ) : undefined
      }
      logo={p.logo}
      turnstileKey={p.turnstileKey}
      embedded={p.embed}
      prefill={route?.email ? { ...p.prefill, email: route.email } : p.prefill}
      onBooked={(r) => postToParent({ type: "book:booked", start: r.start, end: r.end, email: guest.current })}
    />
  );
}
