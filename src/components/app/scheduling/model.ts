// Scheduling's words and groupings (docs/app-structure.md Part 6), kept apart from the screens so they can be
// tested: a type's kind in plain words, its one-line summary, a week of hours as a sentence, how types group by
// person, and a link's state.

import { DAYS, type Availability, type Day, type Kind, type Location, type MeetingType, type TypeSettings } from "../../../lib/meetings/types.ts";

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
/** A type's length, place and who takes it, as short parts (the list shows each as a pill). */
export function typeParts(t: Pick<MeetingType, "kind" | "hosts" | "settings">): string[] {
  const lengths = [...t.settings.lengths].sort((a, b) => a - b);
  const len = lengths.length > 1 ? `${minutes(lengths[0]!)} to ${minutes(lengths[lengths.length - 1]!)}` : minutes(lengths[0] ?? 30);
  const parts = [len, LOCATION_WORDS[t.settings.location.kind] ?? "Video", KIND_WORDS[t.kind]];
  if (t.kind !== "one" && t.hosts.length > 1) parts.push(`${t.hosts.length} hosts`);
  if (t.kind === "group" && t.settings.seats > 1) parts.push(`${t.settings.seats} seats`);
  return parts;
}

export const typeSummary = (t: Pick<MeetingType, "kind" | "hosts" | "settings">): string => typeParts(t).join(", ");

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

// The meeting type panel's one-line summaries (docs/scheduling-plan.md 11.2) ---------------------------------------

/** Where the meeting happens, as the panel and the list say it. */
export const PLACE_WORDS: Record<Location["kind"], string> = {
  google_meet: "Google Meet",
  teams: "Microsoft Teams",
  zoom: "Zoom",
  phone_guest: "Phone call",
  phone_host: "Phone call",
  in_person: "In person",
  link: "Custom link",
};

/** How a Routing team shares leads. */
export const METHOD_WORDS: Record<"rr" | "weighted" | "load", string> = { rr: "Take turns", weighted: "Some get more", load: "Fewest meetings first" };

/** "30 min", "30, 45 min", or "30 min, 1 h" once an hour is in it. */
export function lengthWords(lengths: number[]): string {
  const l = [...lengths].sort((a, b) => a - b);
  if (!l.length) return "30 min";
  return l.every((n) => n < 60) ? `${l.join(", ")} min` : l.map(minutes).join(", ");
}

const span = (n: number) => (n >= 1440 && n % 1440 === 0 ? (n === 1440 ? "1 day" : `${n / 1440} days`) : minutes(n));

/** "10 min after, 4 h notice"; with no buffers just the notice, "No notice" when there's none. */
export function limitsWords(s: Pick<TypeSettings, "bufferBefore" | "bufferAfter" | "notice">): string {
  const parts = [s.bufferBefore ? `${minutes(s.bufferBefore)} before` : "", s.bufferAfter ? `${minutes(s.bufferAfter)} after` : "", s.notice ? `${span(s.notice)} notice` : "No notice"];
  return parts.filter(Boolean).join(", ");
}

/** "Name, email, 1 more". */
export const questionsWords = (questions: unknown[]): string => `Name, email${questions.length ? `, ${questions.length} more` : ""}`;

/** "Confirmation, 2 reminders". */

/** Who takes the meeting, as the Host section picks it: one person, a Routing team, or everyone together. */
export type HostMode = "one" | "team" | "everyone";
export const hostMode = (kind: Kind): HostMode => (kind === "one" || kind === "group" ? "one" : kind === "collective" ? "everyone" : "team");

/** The Routing team a type books for (settings.team), if it has one. */
export const teamOf = (settings: object): string | null => {
  const t = (settings as { team?: unknown }).team;
  return typeof t === "string" && t ? t : null;
};

/** A day or days off in short words: "Off Nov 3" or "Off Nov 3 to Nov 5". */
export function offWords(o: { from: string; to: string }): string {
  const d = (x: string) => new Date(`${x}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return o.from === o.to ? `Off ${d(o.from)}` : `Off ${d(o.from)} to ${d(o.to)}`;
}

/** The next days off that haven't ended, from a rep's out dates. */
export function nextOff(out: { from: string; to: string }[] | null | undefined, today: string): { from: string; to: string } | null {
  return [...(out ?? [])].filter((o) => o.to >= today).sort((a, b) => a.from.localeCompare(b.from))[0] ?? null;
}

/** "$100, Stripe" or "Off". */
export function priceWords(price: TypeSettings["price"]): string {
  if (!price || !price.amount) return "Off";
  const zero = ["jpy"].includes(price.currency);
  try {
    const n = new Intl.NumberFormat("en-US", { style: "currency", currency: price.currency.toUpperCase(), minimumFractionDigits: 0, maximumFractionDigits: zero ? 0 : 2 }).format(zero ? price.amount : price.amount / 100);
    return `${n}, Stripe`;
  } catch {
    return `${price.amount / 100} ${price.currency.toUpperCase()}, Stripe`;
  }
}

/** "Message", or "Redirect to acme.com". */
export function confirmationWords(c: TypeSettings["confirmation"]): string {
  if (c.kind === "message") return "Message";
  try {
    return `Redirect to ${new URL(c.url).host.replace(/^www\./, "")}`;
  } catch {
    return "Redirect";
  }
}
