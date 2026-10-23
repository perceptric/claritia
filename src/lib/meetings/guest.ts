// What a guest sees of a meeting type, and the checks on what a guest sends (docs/meetings-scheduler.md 1.8 and
// 1.8b). The booking pages, the embed and the type editor's preview all draw from these shapes, so a guest is never
// handed a host's id, calendar or settings beyond what the page shows. Runs in the browser and on the server.

import { addDays, at, dateIn, validZone } from "./time.ts";
import type { Location, MeetingType, TypeSettings } from "./types.ts";

export type Profile = { user_id: string; slug: string; name: string; headline: string | null; photo_url: string | null };
export type GuestHost = { name: string; photo: string | null; slug?: string };
export type GuestLocation = { kind: Location["kind"]; detail?: string };
export type Question = TypeSettings["questions"][number];

export type GuestType = {
  slug: string;
  name: string;
  kind: MeetingType["kind"];
  lengths: number[];
  location: GuestLocation;
  questions: Question[];
  price: { amount: number; currency: string } | null;
  /** Group types: guests per meeting. */
  seats: number | null;
  hosts: GuestHost[];
};

/** A bookable start; group types say how many seats are left. */
export type GuestSlot = { start: number; seats?: number };

export type Confirmation = { kind: "message"; text?: string } | { kind: "redirect"; url: string };

/** What the booking routes answer: the manage link and what to show, or why not with fresh times. */
export type BookReply =
  | { ok: true; start: number; end: number; manage: string; hosts: GuestHost[]; confirmation: Confirmation; checkout?: string }
  | { ok: false; error: string; code: string; slots: GuestSlot[] };

export function guestLocation(l: Location | null | undefined): GuestLocation {
  if (!l) return { kind: "google_meet" };
  // The address is what a guest needs to arrive; a host's phone number and private links go in the invite only.
  return l.kind === "in_person" ? { kind: l.kind, detail: l.address } : { kind: l.kind };
}

export function toGuestType(t: Pick<MeetingType, "slug" | "name" | "kind" | "hosts" | "settings">, profiles: Profile[], opts: { pay?: boolean } = {}): GuestType {
  const s = t.settings;
  const byId = new Map(profiles.map((p) => [p.user_id, p]));
  const hosts = t.hosts.map((h) => byId.get(h.user_id)).filter((p): p is Profile => !!p);
  const price = s.price && s.price.amount > 0 && opts.pay !== false ? { amount: s.price.amount, currency: s.price.currency } : null;
  return {
    slug: t.slug,
    name: t.name,
    kind: t.kind,
    lengths: [...s.lengths].sort((a, b) => a - b),
    location: guestLocation(s.location),
    questions: s.questions ?? [],
    price,
    seats: t.kind === "group" ? Math.max(1, s.seats) : null,
    hosts: (t.kind === "group" || t.kind === "one" ? hosts.slice(0, 1) : hosts).map((p) => ({ name: p.name, photo: p.photo_url, slug: p.slug })),
  };
}

export const LOCATION_LABEL: Record<Location["kind"], string> = {
  google_meet: "Google Meet",
  teams: "Microsoft Teams",
  zoom: "Zoom",
  phone_guest: "Phone call",
  phone_host: "Phone call",
  in_person: "In person",
  link: "Video call",
};

export function lengthLabel(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function priceLabel(p: { amount: number; currency: string }): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: p.currency.toUpperCase() }).format(p.amount / 100);
  } catch {
    return `${(p.amount / 100).toFixed(2)} ${p.currency.toUpperCase()}`;
  }
}

// What a guest sends ---------------------------------------------------------------------------------------------

const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
export const validEmail = (s: string) => s.length <= 254 && EMAIL.test(s);

export type GuestIn = { email: string; name: string; tz: string; answers: Record<string, string> };

/**
 * A guest's details and answers, checked against the type's questions: required ones answered, choices from the
 * list, text kept short. A phone call to the guest needs their number, asked as `phone`.
 */
export function checkGuest(raw: unknown, questions: Question[], location?: GuestLocation): { guest: GuestIn } | { error: string; field?: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const name = s(r.name, 200);
  const email = s(r.email, 320).toLowerCase();
  if (!name) return { error: "Add your name.", field: "name" };
  if (!validEmail(email)) return { error: "Add a valid email.", field: "email" };
  const tzRaw = s(r.tz, 60);
  const tz = tzRaw && validZone(tzRaw) ? tzRaw : "UTC";
  const given = (r.answers && typeof r.answers === "object" ? r.answers : {}) as Record<string, unknown>;
  const answers: Record<string, string> = {};
  for (const q of questions) {
    const v = s(given[q.id], q.type === "textarea" ? 2000 : 300);
    if (!v) {
      if (q.required) return { error: `${q.label} is required.`, field: q.id };
      continue;
    }
    if (q.type === "choice" && !(q.options ?? []).includes(v)) return { error: `Pick an answer for ${q.label}.`, field: q.id };
    if (q.type === "phone" && !/^\+?[\d\s().-]{6,40}$/.test(v)) return { error: `${q.label} needs a phone number.`, field: q.id };
    answers[q.id] = v;
  }
  if (location?.kind === "phone_guest") {
    const phone = s(given.phone, 40);
    if (!/^\+?[\d\s().-]{6,40}$/.test(phone)) return { error: "Add the phone number to call.", field: "phone" };
    answers.phone = phone;
  }
  return { guest: { email, name, tz, answers } };
}

// Showing times --------------------------------------------------------------------------------------------------

/** Starts grouped by their date in a zone, in order. */
export function byDay(slots: GuestSlot[], tz: string): Map<string, GuestSlot[]> {
  const out = new Map<string, GuestSlot[]>();
  for (const s of [...slots].sort((a, b) => a.start - b.start)) {
    const d = dateIn(s.start, tz);
    out.set(d, [...(out.get(d) ?? []), s]);
  }
  return out;
}

/** Sample times for previews (the type editor): weekdays 9 to 17 in a zone, every 30 minutes, some taken. */
export function sampleSlots(length: number, tz: string, now = Date.now(), days = 21): GuestSlot[] {
  const out: GuestSlot[] = [];
  const first = dateIn(now, tz);
  for (let i = 1; i <= days; i++) {
    const d = addDays(first, i);
    const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    for (let m = 9 * 60; m + length <= 17 * 60; m += 30) {
      if ((i * 7 + m / 30) % 3 === 0) continue;
      out.push({ start: at(d, `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`, tz) });
    }
  }
  return out;
}
