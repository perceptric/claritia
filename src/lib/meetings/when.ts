// "Next Tuesday afternoon": the booking page's plain-words box (docs/booking-page-plan.md, Part 5). Common phrases are
// read here for free; only what this can't read goes to Claude Haiku, through the step cache, and its answer comes
// back in the same shape. A range is days in the guest's calendar and, optionally, clock times in the guest's zone.
// Runs in the browser and on the server.

import { addDays, dateIn, dayOf, wall } from "./time.ts";
import type { GuestSlot } from "./guest.ts";

/** Days from `from` to `to` (both included); `after` and `before` are minutes after midnight. */
export type WhenRange = { from: string; to: string; after?: number; before?: number };

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_WORDS: Record<string, number> = { monday: 0, mon: 0, tuesday: 1, tue: 1, tues: 1, wednesday: 2, wed: 2, thursday: 3, thu: 3, thur: 3, thurs: 3, friday: 4, fri: 4, saturday: 5, sat: 5, sunday: 6, sun: 6 };
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const PARTS: Record<string, [number, number]> = {
  "early morning": [0, 9 * 60],
  morning: [0, 12 * 60],
  lunch: [11 * 60 + 30, 13 * 60 + 30],
  lunchtime: [11 * 60 + 30, 13 * 60 + 30],
  noon: [11 * 60 + 30, 13 * 60 + 30],
  afternoon: [12 * 60, 17 * 60],
  "late afternoon": [15 * 60, 18 * 60],
  evening: [17 * 60, 24 * 60],
  tonight: [17 * 60, 24 * 60],
  night: [18 * 60, 24 * 60],
  "end of day": [15 * 60, 24 * 60],
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number) => String(n).padStart(2, "0");
const idx = (date: string) => DAYS.indexOf(dayOf(date) as (typeof DAYS)[number]);
const valid = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
};

/** A clock time in words ("3pm", "15:30", "3:30 pm", "noon") as minutes, or null. */
function clock(raw: string): number | null {
  const s = raw.trim();
  if (s === "noon" || s === "midday") return 12 * 60;
  if (s === "midnight") return 24 * 60;
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.[0];
  if (min > 59 || h > 24) return null;
  if (ap === "p" && h < 12) h += 12;
  if (ap === "a" && h === 12) h = 0;
  // "after 3" with no am/pm: working hours, so 1 to 7 read as afternoon.
  if (!ap && !m[2] && h >= 1 && h <= 7) h += 12;
  return h * 60 + min;
}

/**
 * Reads a phrase against the guest's today. Null when it says nothing this can read, so the caller asks the model.
 * `sundayFirst` sets where "this week" starts.
 */
export function parseWhen(text: string, today: string, sundayFirst = false): WhenRange | null {
  if (!DATE.test(today)) return null;
  let s = ` ${text.toLowerCase().replace(/[’']/g, "").replace(/[,.!?]/g, " ").replace(/\s+/g, " ").trim()} `;
  if (s.trim().length === 0 || s.length > 120) return null;
  let from: string | null = null;
  let to: string | null = null;
  let after: number | undefined;
  let before: number | undefined;
  let hit = false;
  const take = (re: RegExp) => {
    const m = re.exec(s);
    if (m) s = s.replace(m[0], " ");
    return m;
  };
  const weekStart = (d: string) => addDays(d, -((idx(d) + (sundayFirst ? 1 : 0)) % 7));

  // Clock times first, so their numbers aren't read as dates.
  let m: RegExpExecArray | null;
  if ((m = take(/ (?:between|from) (\d{1,2}(?::\d{2})?\s*(?:am|pm)?) (?:and|to|-) (\d{1,2}(?::\d{2})?\s*(?:am|pm)?) /))) {
    const a = clock(m[1]!);
    const b = clock(m[2]!);
    if (a !== null && b !== null && b > a) [after, before, hit] = [a, b, true];
  }
  if ((m = take(/ (?:after|from|past|later than) (\d{1,2}(?::\d{2})?\s*(?:am|pm)?|noon|midday) /))) {
    const a = clock(m[1]!);
    if (a !== null) [after, hit] = [a, true];
  }
  if ((m = take(/ (?:before|by|until|till|earlier than) (\d{1,2}(?::\d{2})?\s*(?:am|pm)?|noon|midday) /))) {
    const b = clock(m[1]!);
    if (b !== null) [before, hit] = [b, true];
  }
  if ((m = take(/ (?:at|around|about|~) (\d{1,2}(?::\d{2})?\s*(?:am|pm)?|noon|midday) /))) {
    const c = clock(m[1]!);
    if (c !== null) [after, before, hit] = [Math.max(0, c - 60), Math.min(24 * 60, c + 60), true];
  }
  for (const [w, [a, b]] of Object.entries(PARTS).sort((x, y) => y[0].length - x[0].length)) {
    if (take(new RegExp(` (?:in the |this |any )?${w} `))) {
      after = Math.max(after ?? 0, a);
      before = Math.min(before ?? 24 * 60, b);
      hit = true;
      if (w === "tonight") from = to = today;
      break;
    }
  }
  if (take(/ (?:early) /)) [before, hit] = [Math.min(before ?? 24 * 60, 10 * 60), true];
  if (take(/ (?:late) /)) [after, hit] = [Math.max(after ?? 0, 16 * 60), true];

  // Days.
  if (take(/ (?:asap|soonest|earliest|as soon as possible|first available|next available|any ?time) /)) [from, to, hit] = [today, addDays(today, 365), true];
  if (take(/ day after tomorrow /)) [from, to, hit] = [addDays(today, 2), addDays(today, 2), true];
  if (take(/ (?:tomorrow|tmrw|tmr) /)) [from, to, hit] = [addDays(today, 1), addDays(today, 1), true];
  if (take(/ today /)) [from, to, hit] = [today, today, true];
  if ((m = take(/ in (a|an|one|two|three|four|five|six|\d+) (day|days|week|weeks) /))) {
    const n = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }[m[1]!] ?? Number(m[1]);
    const d = addDays(today, m[2]!.startsWith("week") ? n * 7 : n);
    [from, to, hit] = m[2]!.startsWith("week") ? [weekStart(d), addDays(weekStart(d), 6), true] : [d, d, true];
  }
  if (take(/ (?:next weekend) /)) {
    const sat = addDays(today, ((5 - idx(today) + 7) % 7 || 7) + 7);
    [from, to, hit] = [sat, addDays(sat, 1), true];
  } else if (take(/ (?:this )?weekend /)) {
    const sat = idx(today) === 6 ? addDays(today, -1) : addDays(today, (5 - idx(today) + 7) % 7);
    [from, to, hit] = [sat < today ? today : sat, addDays(sat, 1), true];
  }
  if (take(/ next week /)) [from, to, hit] = [addDays(weekStart(today), 7), addDays(weekStart(today), 13), true];
  else if (take(/ (?:this|rest of the|later this) week /)) [from, to, hit] = [today, addDays(weekStart(today), 6), true];
  if (take(/ (?:next|this) month /)) {
    const [y, mo] = today.split("-").map(Number) as [number, number];
    const next = / next month /.test(` ${text.toLowerCase()} `);
    const yy = next && mo === 12 ? y + 1 : y;
    const mm = next ? (mo % 12) + 1 : mo;
    const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    [from, to, hit] = [next ? `${yy}-${pad(mm)}-01` : today, `${yy}-${pad(mm)}-${pad(last)}`, true];
  }
  // A weekday: the coming one ("next" and "this" alike); today's own name means a week from today.
  if ((m = take(/ (?:on |this |next |coming )?(monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat|sunday|sun)s? /))) {
    const want = DAY_WORDS[m[1]!]!;
    const d = addDays(today, (want - idx(today) + 7) % 7 || 7);
    [from, to, hit] = [d, d, true];
  }
  // Dates: 2026-11-20, nov 20, 20 nov, 11/20.
  if ((m = take(/ (\d{4})-(\d{2})-(\d{2}) /))) {
    const d = valid(Number(m[1]), Number(m[2]), Number(m[3]));
    if (d) [from, to, hit] = [d, d, true];
  } else if ((m = take(/ (jan|feb|mar|apr|may|jun|jul|aug|sept|sep|oct|nov|dec)[a-z]* (\d{1,2})(?:st|nd|rd|th)? /)) || (m = take(/ (\d{1,2})(?:st|nd|rd|th)? (?:of )?(jan|feb|mar|apr|may|jun|jul|aug|sept|sep|oct|nov|dec)[a-z]* /))) {
    const [mon, day] = MONTHS[m[1]!] ? [MONTHS[m[1]!]!, Number(m[2])] : [MONTHS[m[2]!]!, Number(m[1])];
    const y = Number(today.slice(0, 4));
    const d = valid(y, mon, day) && valid(y, mon, day)! >= today ? valid(y, mon, day) : valid(y + 1, mon, day);
    if (d) [from, to, hit] = [d, d, true];
  } else if ((m = take(/ (\d{1,2})\/(\d{1,2}) /))) {
    const y = Number(today.slice(0, 4));
    const d = valid(y, Number(m[1]), Number(m[2])) ?? valid(y, Number(m[2]), Number(m[1]));
    if (d) [from, to, hit] = [d < today ? (valid(y + 1, Number(d.slice(5, 7)), Number(d.slice(8))) ?? d) : d, d < today ? (valid(y + 1, Number(d.slice(5, 7)), Number(d.slice(8))) ?? d) : d, true];
  }
  if (!hit) return null;
  // Words left that mean something this didn't read: let the model try.
  const rest = s.replace(/ (?:a|an|the|on|in|at|for|or|and|any|time|times|please|pls|works|work|good|best|for me|me|i|im|am|free|available|call|meeting|meet|something|some|slot|slots|is|would|be|great|ideally|maybe|prefer|preferably) /g, " ").trim();
  if (rest.replace(/[^a-z0-9]/g, "").length > 3) return null;
  const range: WhenRange = { from: from ?? today, to: to ?? addDays(today, 365) };
  if (after !== undefined && after > 0) range.after = after;
  if (before !== undefined && before < 24 * 60) range.before = before;
  return range;
}

/** A model's answer, checked: dates in order, clock minutes in range. Null when it isn't one. */
export function readWhen(raw: unknown, today: string): WhenRange | null {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const from = typeof r.from === "string" && DATE.test(r.from) ? r.from : null;
  const to = typeof r.to === "string" && DATE.test(r.to) ? r.to : from;
  if (!from || !to || to < from || to < today || to > addDays(today, 400)) return null;
  const mins = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 && v < 24 * 60 ? v : undefined);
  const after = mins(r.after);
  const before = mins(r.before);
  return { from: from < today ? today : from, to, ...(after !== undefined ? { after } : {}), ...(before !== undefined && (after === undefined || before > after) ? { before } : {}) };
}

/** The times a range keeps, in the guest's zone. */
export function slotsIn(slots: GuestSlot[], r: WhenRange, tz: string): GuestSlot[] {
  return slots.filter((s) => {
    const d = dateIn(s.start, tz);
    if (d < r.from || d > r.to) return false;
    const w = wall(s.start, tz);
    const min = w.h * 60 + w.min;
    return (r.after === undefined || min >= r.after) && (r.before === undefined || min < r.before);
  });
}

export const WHEN_MODEL = "claude-haiku-5-5";
export const WHEN_SYSTEM =
  'You turn a short phrase about when someone wants a meeting into a date range. Today\'s date is given. Answer with one JSON object and nothing else: {"from":"YYYY-MM-DD","to":"YYYY-MM-DD","after":minutes after midnight or null,"before":minutes after midnight or null}. "from" and "to" are the first and last days that fit, both included, never before today. Use after and before only for times of day the phrase names. If the phrase names no time at all, answer {"none":true}.';
