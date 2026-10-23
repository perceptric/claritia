// Time zones without a library: the browser's and Node's Intl gives each zone's offset at an instant, which is all
// the slot engine needs. Dates are YYYY-MM-DD strings in a zone; instants are epoch milliseconds.

import { DAYS, type Day } from "./types.ts";

const formatters = new Map<string, Intl.DateTimeFormat>();
const fmt = (tz: string) => {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    formatters.set(tz, f);
  }
  return f;
};

/** Whether a zone name is one Intl knows. */
export function validZone(tz: string): boolean {
  try {
    fmt(tz);
    return true;
  } catch {
    return false;
  }
}

/** The wall clock in a zone at an instant. */
export function wall(ms: number, tz: string): { y: number; m: number; d: number; h: number; min: number } {
  const p = Object.fromEntries(fmt(tz).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour), min: Number(p.minute) };
}

/** The zone's offset from UTC at an instant, in ms (positive east of Greenwich). */
export function offset(ms: number, tz: string): number {
  const w = wall(ms, tz);
  const asUtc = Date.UTC(w.y, w.m - 1, w.d, w.h, w.min);
  return asUtc - (ms - (ms % 60_000));
}

/**
 * The instant a wall-clock time happens in a zone. A time skipped by a spring-forward change lands just after the
 * gap; a time that happens twice in the fall takes the first.
 */
export function at(date: string, time: string, tz: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  // The wall time read as if it were UTC; the real instant is that minus the zone's offset then.
  const guess = Date.UTC(y!, m! - 1, d!, 0, 0) + (h! * 60 + min!) * 60_000;
  const before = guess - offset(guess - 43_200_000, tz);
  const after = guess - offset(guess + 43_200_000, tz);
  const same = (t: number) => {
    const w = wall(t, tz);
    return Date.UTC(w.y, w.m - 1, w.d, w.h, w.min) === guess;
  };
  const real = [before, after].filter(same).sort((a, b) => a - b);
  // A time in a spring-forward gap doesn't exist: the offset from before the change puts it just after the gap.
  return real[0] ?? before;
}

/** The date (YYYY-MM-DD) in a zone at an instant. */
export function dateIn(ms: number, tz: string): string {
  const w = wall(ms, tz);
  return `${w.y}-${String(w.m).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`;
}

/** The calendar date n days after a date. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
}

/** The weekday of a calendar date. */
export function dayOf(date: string): Day {
  const [y, m, d] = date.split("-").map(Number);
  return DAYS[(new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay() + 6) % 7]!;
}

/** The Monday that starts a date's week. */
export function weekOf(date: string): string {
  return addDays(date, -DAYS.indexOf(dayOf(date)));
}
