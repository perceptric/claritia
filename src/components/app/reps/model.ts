// The plain helpers behind Routing › Sales reps: working hours in short words and the usual presets, a rep's status as
// In, Away or Paused with the words under their name, the daily limits offered, and the calendar's short name. No
// React, so the tests can run them (tests/inboundSetup.test.ts).

import type { Day, Range } from "../../../lib/meetings/types.ts";
import { repStatus, type RepRow } from "../routing/screensModel.ts";

const DAYS: Day[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const SHORT: Record<Day, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

type Weekly = Record<Day, Range[]>;

const week = (days: Day[], from: string, to: string): Weekly => Object.fromEntries(DAYS.map((d) => [d, days.includes(d) ? [[from, to]] : []])) as unknown as Weekly;
const WEEKDAYS: Day[] = ["mon", "tue", "wed", "thu", "fri"];

/** The hours a person can pick in one step; anything else is set in the availability editor. */
export const HOUR_PRESETS: { key: string; weekly: Weekly }[] = [
  { key: "Mon–Fri, 9–5", weekly: week(WEEKDAYS, "09:00", "17:00") },
  { key: "Mon–Fri, 10–6", weekly: week(WEEKDAYS, "10:00", "18:00") },
  { key: "Mon–Thu, 8–4", weekly: week(["mon", "tue", "wed", "thu"], "08:00", "16:00") },
  { key: "Every day, 8–8", weekly: week(DAYS, "08:00", "20:00") },
];

/** "09:00" → "9", "17:30" → "5:30" (a 12-hour clock without am or pm, like the demo's "9–5"). */
function clock(t: string): string {
  const [h = 0, m = 0] = t.split(":").map(Number);
  const hh = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hh}:${String(m).padStart(2, "0")}` : String(hh);
}

/**
 * Working hours in a few words: "Mon–Fri, 9–5", "Mon, Wed, Fri, 10–6", "Every day, 8–8". Days with different hours
 * read "Custom hours"; none at all, "No hours set".
 */
export function hoursWords(weekly: Partial<Weekly> | null | undefined): string {
  if (!weekly) return "No hours set";
  const on = DAYS.filter((d) => (weekly[d] ?? []).length);
  if (!on.length) return "No hours set";
  const key = (d: Day) => (weekly[d] ?? []).map(([a, b]) => `${a}-${b}`).join(",");
  if (on.some((d) => key(d) !== key(on[0]!)) || (weekly[on[0]!] ?? []).length !== 1) return "Custom hours";
  const [from, to] = weekly[on[0]!]![0]!;
  const idx = on.map((d) => DAYS.indexOf(d));
  const run = idx.every((x, i) => i === 0 || x === idx[i - 1]! + 1);
  const days = on.length === 7 ? "Every day" : run && on.length > 2 ? `${SHORT[on[0]!]}–${SHORT[on[on.length - 1]!]}` : on.map((d) => SHORT[d]).join(", ");
  return `${days}, ${clock(from)}–${clock(to)}`;
}

export type RepState = "in" | "away" | "paused";

/** In, Away (out of office, from the dates set or the calendar) or Paused, with the words for the team table. */
export function repState(r: Pick<RepRow, "paused_until" | "out_dates"> | null | undefined, now = Date.now()): { state: RepState; until: number | null } {
  const s = repStatus(r, now);
  return { state: s.kind === "out" ? "away" : s.kind, until: s.until };
}

export const STATE_WORDS: Record<RepState, { label: string; hint: string; tone: "green" | "amber" | "gray" }> = {
  in: { label: "Available", hint: "Receives new leads", tone: "green" },
  away: { label: "Away", hint: "Their backup receives their leads", tone: "amber" },
  paused: { label: "Paused", hint: "Receives no new leads", tone: "gray" },
};

/** "Mon, Nov 2" for a time, in the browser's zone. */
export const dayWords = (ms: number) => new Date(ms).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

/** The daily limits offered; a limit set elsewhere shows too. */
export function capOptions(current: number | null): (number | null)[] {
  const base: (number | null)[] = [null, 5, 8, 10, 15];
  return current !== null && !base.includes(current) ? [...base, current].sort((a, b) => (a ?? 0) - (b ?? 0)) : base;
}

export const capWords = (c: number | null) => (c === null ? "No limit" : `${c} per day`);

/** A status as its badge reads: "Available", "Away until Nov 2", "Paused". */
export function stateBadge(s: { state: RepState; until: number | null }): string {
  const w = STATE_WORDS[s.state].label;
  if (s.state === "away" && s.until) return `${w} until ${new Date(s.until - 1).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  return w;
}

/** The calendar's short name for its badge. */
export const calendarWords = (provider: string) => (provider === "google" ? "Google" : provider === "microsoft" ? "Outlook" : "Calendar");

/** Today's out-of-office dates taken away, for "In". */
export function withoutToday(dates: { from: string; to: string }[] | null | undefined, today: string): { from: string; to: string }[] {
  return (dates ?? []).filter((d) => !(d.from <= today && today <= d.to));
}
