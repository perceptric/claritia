// Meetings screens (docs/meetings-scheduler.md 1.9): the plain helpers behind them, with no React, so the server
// routes and the tests use the same ones. Times are ISO strings or epoch ms; days and clocks are in a person's zone.

import { DAYS, KINDS, type Availability, type Day, type Kind, type MeetingSource, type MeetingStatus, type MeetingType, type Range } from "../../../lib/meetings/types.ts";

export type Tone = "gray" | "brand" | "violet" | "green" | "amber" | "red" | "sky";

export const STATUS: Record<MeetingStatus, { label: string; tone: Tone }> = {
  booked: { label: "Booked", tone: "sky" },
  pending_payment: { label: "Awaiting payment", tone: "amber" },
  canceled: { label: "Canceled", tone: "gray" },
  held: { label: "Held", tone: "green" },
  no_show: { label: "No-show", tone: "red" },
};

export const SOURCES: Record<MeetingSource, string> = { page: "Page", form: "Form", handoff: "Handoff", one_off: "One-off", poll: "Poll", api: "API" };

export const kindLabel = (k: Kind) => KINDS.find((x) => x.value === k)?.label ?? k;

export const DAY_LABEL: Record<Day, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

/** 30 → "30 min", 90 → "1 h 30 min", 1440 → "1 day". */
export function minutesText(n: number): string {
  if (n >= 1440 && n % 1440 === 0) return n === 1440 ? "1 day" : `${n / 1440} days`;
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** "15, 30 or 45 min" */
export function lengthsText(lengths: number[]): string {
  const xs = [...lengths].sort((a, b) => a - b);
  if (xs.length <= 1) return minutesText(xs[0] ?? 30);
  if (xs.every((x) => x < 60)) return `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]} min`;
  return `${xs.slice(0, -1).map(minutesText).join(", ")} or ${minutesText(xs[xs.length - 1]!)}`;
}

/** A link name from a name: "Intro call" → "intro-call". */
export function slugify(name: string, max = 60): string {
  const s = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/, "");
  return s.length >= 2 ? s : s ? `${s}-1` : "meeting";
}

/** The first of base, base-2, base-3... not in `taken`. */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const t = new Set(taken);
  if (!t.has(base)) return base;
  for (let i = 2; ; i++) {
    const s = `${base.slice(0, 56).replace(/-+$/, "")}-${i}`;
    if (!t.has(s)) return s;
  }
}

/** Who can change a type: owners, whoever made it, its hosts, and the person a personal copy belongs to. */
export function canEditType(role: "owner" | "member" | null, user: string, t: Pick<MeetingType, "hosts" | "owner_user_id"> & { created_by?: string | null }): boolean {
  if (!role) return false;
  if (role === "owner") return true;
  return t.created_by === user || t.owner_user_id === user || t.hosts.some((h) => h.user_id === user);
}

// Meetings ---------------------------------------------------------------------------------------------------------

export type MeetingRow = {
  id: string;
  type_id: string | null;
  hosts: string[];
  status: MeetingStatus;
  source: MeetingSource;
  start_at: string;
  end_at: string;
};

/** Held and No-show show once a meeting has started, on meetings still booked (or to fix a click). */
export const canMark = (m: Pick<MeetingRow, "status" | "start_at">, now = Date.now()) => ["booked", "held", "no_show"].includes(m.status) && new Date(m.start_at).getTime() <= now;

/** A host can cancel a meeting that's still to come. */
export const canCancel = (m: Pick<MeetingRow, "status" | "end_at">, now = Date.now()) => (m.status === "booked" || m.status === "pending_payment") && new Date(m.end_at).getTime() > now;

/** Upcoming: still to end and not canceled. Past: the rest, newest first. */
export function splitMeetings<T extends MeetingRow>(rows: T[], now = Date.now()): { upcoming: T[]; past: T[] } {
  const upcoming: T[] = [];
  const past: T[] = [];
  for (const m of rows) (new Date(m.end_at).getTime() > now && m.status !== "canceled" ? upcoming : past).push(m);
  upcoming.sort((a, b) => a.start_at.localeCompare(b.start_at));
  past.sort((a, b) => b.start_at.localeCompare(a.start_at));
  return { upcoming, past };
}

export type MeetingFilter = { host: string; type: string; status: MeetingStatus | "" };

export const filterMeetings = <T extends MeetingRow>(rows: T[], f: MeetingFilter) =>
  rows.filter((m) => (!f.host || m.hosts.includes(f.host)) && (!f.type || m.type_id === f.type) && (!f.status || m.status === f.status));

// Copy times (1.8b) ------------------------------------------------------------------------------------------------

/**
 * The next free times as plain text for an email, one line each with its own booking link, grouped under each day:
 *
 *   Intro call, 30 min (times in New York)
 *   Tue 3 Nov
 *   9:00 https://…
 */
export function timesText(o: { name: string; length: number; starts: number[]; tz: string; url: (start: number) => string; max?: number; perDay?: number; hour12?: boolean }): string {
  const max = o.max ?? 8;
  const perDay = o.perDay ?? 3;
  const days = new Map<string, number[]>();
  for (const s of [...o.starts].sort((a, b) => a - b)) {
    const d = new Date(s).toLocaleDateString("en-CA", { timeZone: o.tz });
    const list = days.get(d) ?? [];
    if (list.length < perDay) list.push(s);
    days.set(d, list);
  }
  const city = o.tz.split("/").pop()!.replace(/_/g, " ");
  const lines = [`${o.name}, ${minutesText(o.length)} (times in ${city})`];
  let n = 0;
  for (const starts of days.values()) {
    if (n >= max) break;
    lines.push("", new Date(starts[0]!).toLocaleDateString("en-GB", { timeZone: o.tz, weekday: "short", day: "numeric", month: "short" }));
    for (const s of starts) {
      if (n >= max) break;
      lines.push(`${new Date(s).toLocaleTimeString(o.hour12 ? "en-US" : "en-GB", { timeZone: o.tz, hour: "numeric", minute: "2-digit", hour12: !!o.hour12 })} ${o.url(s)}`);
      n++;
    }
  }
  return n ? lines.join("\n") : "";
}

/** A type's booking page, optionally opened at one time. */
export function bookUrl(origin: string, wsSlug: string, typeSlug: string, at?: { start: number; length: number }): string {
  const base = `${origin.replace(/\/+$/, "")}/book/${wsSlug}/${typeSlug}`;
  return at ? `${base}?start=${encodeURIComponent(new Date(at.start).toISOString())}&length=${at.length}` : base;
}

// Hours (1.2) ------------------------------------------------------------------------------------------------------

const toMin = (c: string) => Number(c.slice(0, 2)) * 60 + Number(c.slice(3, 5));
const toClock = (m: number) => (m >= 1440 ? "24:00" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);

/** One more range on a day: an hour after the last one ends, or 9 to 17 on an empty day. Null when the day is full. */
export function nextRange(ranges: Range[]): Range | null {
  if (!ranges.length) return ["09:00", "17:00"];
  const end = Math.max(...ranges.map((r) => toMin(r[1])));
  if (end >= 1380) return null;
  const s = Math.min(end + 60, 1380);
  return [toClock(s), toClock(Math.min(s + 60, 1440))];
}

/** Every day takes one day's ranges; days off stay off unless `all`. */
export function copyToAll(weekly: Availability["weekly"], from: Day, all = false): Availability["weekly"] {
  const src = weekly[from];
  return Object.fromEntries(DAYS.map((d) => [d, d === from || all || weekly[d].length ? src.map((r) => [...r] as Range) : []])) as Availability["weekly"];
}

/** Clock options for a hours picker, every 15 minutes. */
export const CLOCKS: string[] = Array.from({ length: 97 }, (_, i) => toClock(i * 15));

/** "Mon to Fri 09:00 to 17:00; Sat 10:00 to 12:00", or "No hours". */
export function hoursSummary(weekly: Availability["weekly"]): string {
  const key = (d: Day) => weekly[d].map((r) => `${r[0]} to ${r[1]}`).join(", ");
  const parts: string[] = [];
  let i = 0;
  while (i < DAYS.length) {
    const d = DAYS[i]!;
    if (!weekly[d].length) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < DAYS.length && key(DAYS[j + 1]!) === key(d)) j++;
    const span = j === i ? DAY_LABEL[d] : j === i + 1 ? `${DAY_LABEL[d]}, ${DAY_LABEL[DAYS[j]!]}` : `${DAY_LABEL[d]} to ${DAY_LABEL[DAYS[j]!]}`;
    parts.push(`${span} ${key(d)}`);
    i = j + 1;
  }
  return parts.length ? parts.join("; ") : "No hours";
}

/** Every zone the browser or Node knows, with the person's own first. */
export function zones(own?: string): string[] {
  let all: string[] = [];
  try {
    all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {}
  if (!all.includes("UTC")) all = ["UTC", ...all];
  return own && all.includes(own) ? [own, ...all.filter((z) => z !== own)] : all;
}

// Booking profile ----------------------------------------------------------------------------------------------------

const PROFILE_SLUG = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;

export type Profile = { slug: string; name: string; headline: string; photo_url: string };

/** A booking profile as saved: a clean copy, or the problems in plain words. */
export function checkProfile(raw: unknown): { profile: Profile } | { errors: string[] } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const errors: string[] = [];
  const slug = s(r.slug, 40).toLowerCase();
  const name = s(r.name, 120);
  const headline = s(r.headline, 200);
  const photo_url = s(r.photo_url, 1000);
  if (!PROFILE_SLUG.test(slug)) errors.push("Your link uses letters, numbers and dashes, like sam-lee.");
  if (!name) errors.push("Add your name.");
  if (photo_url && !/^https:\/\/\S+$/.test(photo_url)) errors.push("The photo link needs https://.");
  return errors.length ? { errors } : { profile: { slug, name, headline, photo_url } };
}
