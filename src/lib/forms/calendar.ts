// The inline calendar's plain helpers (docs/meetings-scheduler.md 2.1): times grouped by the visitor's day, words for
// days and times in their language and zone, and the builder's sample times. No DOM, so the tests run them; bundled
// into <claritia-form>, so they stay small.

/** What the server hands the form when the lead may book (src/lib/forms/booking.ts). Times are epoch ms. */
export type Booking = { token: string; slots: number[]; lengths: number[]; length: number; host?: { name: string; photo?: string } };
/** A booked meeting as the form confirms it. */
export type Booked = { start: number; end: number; host?: { name: string; photo?: string }; manage?: string };

const f = (tz: string, o: Intl.DateTimeFormatOptions, locale?: string) => {
  try {
    return new Intl.DateTimeFormat(locale, { ...o, timeZone: tz });
  } catch {
    return new Intl.DateTimeFormat(locale, o);
  }
};

/** The visitor's own zone, or UTC when the browser won't say. */
export const localZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

/** The zones the visitor can switch to: every zone the browser knows, with theirs first. */
export function zones(mine: string): string[] {
  const all = (Intl as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? ["UTC", "Europe/London", "Europe/Paris", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Asia/Tokyo", "Australia/Sydney"];
  return [mine, ...all.filter((z) => z !== mine)];
}

/** "America/New_York" → "America/New York". */
export const zoneName = (tz: string) => tz.replace(/_/g, " ");

/** The day (YYYY-MM-DD) an instant falls on in a zone. */
export const dayKey = (ms: number, tz: string) => f(tz, { year: "numeric", month: "2-digit", day: "2-digit" }, "en-CA").format(ms);

/** Starts grouped by the visitor's day, in order. */
export function byDay(slots: number[], tz: string): { day: string; starts: number[] }[] {
  const out: { day: string; starts: number[] }[] = [];
  for (const s of [...slots].sort((a, b) => a - b)) {
    const day = dayKey(s, tz);
    const last = out[out.length - 1];
    if (last?.day === day) last.starts.push(s);
    else out.push({ day, starts: [s] });
  }
  return out;
}

/** "Mon, Nov 2" and "9:00 AM" in the visitor's language. */
export const dayText = (ms: number, tz: string, locale?: string) => f(tz, { weekday: "short", month: "short", day: "numeric" }, locale).format(ms);
export const timeText = (ms: number, tz: string, locale?: string) => f(tz, { hour: "numeric", minute: "2-digit" }, locale).format(ms);

/** Sample times for the builder's preview: the next five weekdays, a few times each, from tomorrow on. No network. */
export function sampleSlots(now: number): number[] {
  const out: number[] = [];
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  for (let n = 0; out.length < 40 && n < 14; n++) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    for (const [h, m] of [[9, 0], [9, 30], [10, 30], [11, 0], [13, 30], [14, 0], [15, 30], [16, 0]]) out.push(new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime());
  }
  return out;
}
