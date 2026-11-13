// Holds on the booking page (docs/booking-page-plan.md, Part 3; 161_booking_page.sql): the time a guest picked is
// theirs for 5 minutes while they confirm. Other guests' lists leave it out and their bookings of it are refused
// with fresh times. Holds only ever narrow what's offered, and they fail open: when the database can't answer, the
// page works as if there were no holds, so a hiccup never blocks a booking. Group types (several seats) don't hold.

import { createHash } from "node:crypto";
import type { Rpc } from "../jobs.ts";
import type { GuestSlot } from "./guest.ts";

const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

/** The stored form of a page's hold token, or null when it isn't one. */
export function holdToken(raw: unknown): string | null {
  return typeof raw === "string" && TOKEN.test(raw) ? createHash("sha256").update(`hold:${raw}`).digest("hex") : null;
}

export const holds = (kind: string) => kind !== "group";

/** Take a time for a guest: true when it's theirs, false when someone else holds it, null when it couldn't be asked. */
export async function takeHold(rpc: Rpc, type: string, start: number, token: string): Promise<boolean | null> {
  try {
    const r = await rpc("slot_hold", { p_type: type, p_start: new Date(start).toISOString(), p_token: token, p_minutes: 5 });
    return r.error ? null : r.data === true;
  } catch {
    return null;
  }
}

/** The starts other guests hold right now; empty when it couldn't be asked. */
export async function heldByOthers(rpc: Rpc, type: string, token: string | null): Promise<Set<number>> {
  try {
    const r = await rpc("slot_holds_taken", { p_type: type, p_token: token });
    return new Set(!r.error && Array.isArray(r.data) ? (r.data as unknown[]).map(Number).filter(Number.isFinite) : []);
  } catch {
    return new Set();
  }
}

export const withoutHeld = (slots: GuestSlot[], held: Set<number>) => (held.size ? slots.filter((s) => !held.has(s.start)) : slots);

export async function releaseHold(rpc: Rpc, token: string | null): Promise<void> {
  if (!token) return;
  try {
    await rpc("slot_hold_release", { p_token: token });
  } catch {}
}
