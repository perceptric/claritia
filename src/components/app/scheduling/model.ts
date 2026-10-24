// Scheduling's words and groupings (docs/app-structure.md Part 6), kept apart from the screens so they can be
// tested: a type's kind in plain words, its one-line summary, a week of hours as a sentence, how types group by
// person, and a link's state.

import { DAYS, type Availability, type Day, type Kind, type Location, type MeetingType } from "../../../lib/meetings/types.ts";

/** The kinds in plain words (Calendly's One-on-One, Round Robin, Collective, Group, plus ours). */
export const KIND_WORDS: Record<Kind, string> = {
  one: "One person",
  round_robin: "Take turns",
  collective: "Everyone attends",
  owner_first: "Lead's owner first",
  double: "Two teams",
  group: "Group event",
};

/** A color for the card's left bar, by kind, from the brand washes' deep tones. */
export const KIND_TONE: Record<Kind, "sky" | "sage" | "clay" | "butter" | "rose" | "lilac"> = {
  one: "sky",
  round_robin: "sage",
  collective: "clay",
  owner_first: "butter",
  double: "rose",
  group: "sky",
};

export const LOCATION_WORDS: Record<Location["kind"], string> = {
  google_meet: "Google Meet",
  teams: "Microsoft Teams",
  zoom: "Zoom",
  phone_guest: "Phone (guest gives number)",
  phone_host: "Phone",
  in_person: "In person",
  link: "Video link",
};

const minutes = (n: number) => (n >= 60 && n % 60 === 0 ? `${n / 60} h` : n > 60 ? `${Math.floor(n / 60)} h ${n % 60} min` : `${n} min`);

/** "30 min · Google Meet · Take turns · 3 hosts". */
export function typeSummary(t: Pick<MeetingType, "kind" | "hosts" | "settings">): string {
  const lengths = [...t.settings.lengths].sort((a, b) => a - b);
  const len = lengths.length > 1 ? `${minutes(lengths[0]!)} to ${minutes(lengths[lengths.length - 1]!)}` : minutes(lengths[0] ?? 30);
  const parts = [len, LOCATION_WORDS[t.settings.location.kind] ?? "Video", KIND_WORDS[t.kind]];
  if (t.kind !== "one" && t.hosts.length > 1) parts.push(`${t.hosts.length} hosts`);
  if (t.kind === "group" && t.settings.seats > 1) parts.push(`${t.settings.seats} seats`);
  return parts.join(" · ");
}

const WEEKDAYS: Day[] = ["mon", "tue", "wed", "thu", "fri"];
const DAY_NAME: Record<Day, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

/**
 * A week of hours as a sentence: "Weekdays, 9:00 to 17:00", "Mon to Thu, 9:00 to 12:00 and 13:00 to 17:00", or
 * "Weekdays, 9:00 to 17:00, +1 more time" when days differ (as Calendly says it). Empty: "No hours set".
 */
export function weeklyWords(a: Pick<Availability, "weekly"> | null | undefined): string {
  if (!a?.weekly) return "No hours set";
  const key = (d: Day) => (a.weekly[d] ?? []).map(([s, e]) => `${s}-${e}`).join(",");
  const groups: { days: Day[]; key: string }[] = [];
  for (const d of DAYS) {
    const k = key(d);
    if (!k) continue;
    const g = groups.find((x) => x.key === k);
    if (g) g.days.push(d);
    else groups.push({ days: [d], key: k });
  }
  if (!groups.length) return "No hours set";
  groups.sort((x, y) => y.days.length - x.days.length || DAYS.indexOf(x.days[0]!) - DAYS.indexOf(y.days[0]!));
  const g = groups[0]!;
  const ranges = (a.weekly[g.days[0]!] ?? []).map(([s, e]) => `${s} to ${e}`).join(" and ");
  const more = groups.length - 1;
  return `${daysWords(g.days)}, ${ranges}${more ? `, +${more} more ${more === 1 ? "time" : "times"}` : ""}`;
}

/** Mon, Tue, Wed → "Mon to Wed"; Mon to Fri → "Weekdays"; every day → "Every day". */
export function daysWords(days: Day[]): string {
  const idx = days.map((d) => DAYS.indexOf(d)).sort((a, b) => a - b);
  if (idx.length === 7) return "Every day";
  if (idx.length === 5 && WEEKDAYS.every((d) => days.includes(d))) return "Weekdays";
  if (idx.length === 2 && days.includes("sat") && days.includes("sun")) return "Weekends";
  const run = idx.every((x, i) => i === 0 || x === idx[i - 1]! + 1);
  if (run && idx.length > 2) return `${DAY_NAME[DAYS[idx[0]!]!]} to ${DAY_NAME[DAYS[idx[idx.length - 1]!]!]}`;
  return idx.map((i) => DAY_NAME[DAYS[i]!]).join(", ");
}

export type TypeGroup<T> = { key: string; person: string | null; types: T[] };

/**
 * Types grouped as on Calendly's Event types: yours first, then the team's (types no one person owns), then each
 * teammate's, by name. `me` is the signed-in person.
 */
export function groupTypes<T extends Pick<MeetingType, "owner_user_id">>(types: T[], me: string, nameOf: (id: string) => string): TypeGroup<T>[] {
  const mine = types.filter((t) => t.owner_user_id === me);
  const team = types.filter((t) => !t.owner_user_id);
  const others = new Map<string, T[]>();
  for (const t of types) if (t.owner_user_id && t.owner_user_id !== me) others.set(t.owner_user_id, [...(others.get(t.owner_user_id) ?? []), t]);
  const out: TypeGroup<T>[] = [];
  if (mine.length) out.push({ key: "me", person: me, types: mine });
  if (team.length) out.push({ key: "team", person: null, types: team });
  for (const [id, list] of [...others].sort((a, b) => nameOf(a[0]).localeCompare(nameOf(b[0])))) out.push({ key: id, person: id, types: list });
  return out;
}

export type LinkRow = {
  id: string;
  kind: "single_use" | "one_off" | "poll";
  type_id: string | null;
  owner_user_id: string;
  title: string | null;
  offered: { start: string; end: string }[];
  length_min: number | null;
  used_at: string | null;
  meeting_id: string | null;
  closed_at: string | null;
  expires_at: string | null;
  created_at: string;
};

export type LinkState = "waiting" | "voting" | "booked" | "closed" | "expired";

/** Where a link stands: booked once used, closed by hand, expired by date or when every offered time passed. */
export function linkState(l: Pick<LinkRow, "kind" | "used_at" | "meeting_id" | "closed_at" | "expires_at" | "offered">, now = Date.now()): LinkState {
  if (l.meeting_id || l.used_at) return "booked";
  if (l.closed_at) return "closed";
  if (l.expires_at && Date.parse(l.expires_at) <= now) return "expired";
  if (l.kind !== "single_use" && l.offered.length && l.offered.every((o) => Date.parse(o.start) <= now)) return "expired";
  return l.kind === "poll" ? "voting" : "waiting";
}

export const LINK_STATE: Record<LinkState, { label: string; tone: "gray" | "green" | "amber" | "sky" | "violet" }> = {
  waiting: { label: "Waiting", tone: "sky" },
  voting: { label: "Voting", tone: "amber" },
  booked: { label: "Booked", tone: "green" },
  closed: { label: "Closed", tone: "gray" },
  expired: { label: "Expired", tone: "gray" },
};

export const LINK_KIND: Record<LinkRow["kind"], string> = { single_use: "Single-use link", one_off: "One-off meeting", poll: "Meeting poll" };
