// The booking page's time helpers (docs/meetings-scheduler.md 1.8): a day's times by part of the day in the guest's
// zone, the soonest times across days, and add-to-calendar links. Runs in the browser and in tests.

import type { GuestSlot } from "./guest.ts";

const hourIn = (ms: number, tz: string) => {
  try {
    return Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(ms)) % 24;
  } catch {
    return new Date(ms).getUTCHours();
  }
};

/** A day's times by part of the day, in the guest's zone. */
export function partsOfDay(slots: GuestSlot[], tz: string): [string, GuestSlot[]][] {
  const out: [string, GuestSlot[]][] = [["Morning", []], ["Afternoon", []], ["Evening", []]];
  for (const s of slots) {
    const h = hourIn(s.start, tz);
    out[h < 12 ? 0 : h < 17 ? 1 : 2]![1].push(s);
  }
  return out.filter(([, l]) => l.length);
}

/** The first time on each of the next few days with times. */
export function soonest(days: Map<string, GuestSlot[]>, n: number): [string, GuestSlot][] {
  const out: [string, GuestSlot][] = [];
  for (const [d, list] of days) {
    if (out.length >= n) break;
    if (list[0]) out.push([d, list[0]]);
  }
  return out;
}

const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** Links that add the meeting to Google Calendar and Outlook. */
export function calendarLinks(o: { title: string; start: number; end: number; details?: string }) {
  const g = new URLSearchParams({ action: "TEMPLATE", text: o.title, dates: `${stamp(o.start)}/${stamp(o.end)}`, details: o.details ?? "" });
  const m = new URLSearchParams({ path: "/calendar/action/compose", rru: "addevent", subject: o.title, startdt: new Date(o.start).toISOString(), enddt: new Date(o.end).toISOString(), body: o.details ?? "" });
  return { google: `https://calendar.google.com/calendar/render?${g}`, outlook: `https://outlook.live.com/calendar/0/deeplink/compose?${m}` };
}

/** How long until a meeting starts, for the confirmed screen: "Starts in 45 minutes", "in 3 hours", "in 2 days". */
export function startsIn(start: number, now: number): string {
  const min = Math.round((start - now) / 60_000);
  if (min <= 0) return "Starting now";
  if (min < 60) return `Starts in ${min} ${min === 1 ? "minute" : "minutes"}`;
  const h = Math.round(min / 60);
  if (min < 36 * 60) return `Starts in ${h} ${h === 1 ? "hour" : "hours"}`;
  const d = Math.round(min / 1440);
  return `Starts in ${d} days`;
}
