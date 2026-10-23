// The slot engine (docs/meetings-scheduler.md 1.2 to 1.5): the times a meeting type can be booked, from each host's
// hours, busy times and meetings, and who is free at each. Pure and fast: it reads only what it's given, so showing
// times never waits on a calendar provider. The booking itself checks again (live free/busy and meeting_book).

import { addDays, at, dateIn, dayOf, weekOf } from "./time.ts";
import type { Availability, Host, Kind, Slot, Span, TypeSettings } from "./types.ts";

export type HostInput = {
  id: string;
  availability: Availability;
  /** Busy times from the host's calendars, out of office included. */
  busy: Span[];
  /** The host's meetings booked in Claritia (any type), buffers included; the type and start are for group seats. */
  booked: (Span & { typeId?: string | null; at?: number; id?: string })[];
  /** Meetings the host already has, by local date and by local week start, for the caps. */
  counts?: { day: Record<string, number>; week: Record<string, number> };
};

const MIN = 60_000;
const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end;

/** Every start a host could take for one length, before combining hosts. */
export function hostStarts(h: HostInput, length: number, s: TypeSettings, now: number, opts: { typeId?: string; group?: Map<number, number> } = {}): number[] {
  const tz = h.availability.tz;
  const from = now + s.notice * MIN;
  const to = now + s.window * 86_400_000;
  const step = Math.max(5, s.step) * MIN;
  const out: number[] = [];
  const last = dateIn(to, tz);
  for (let date = addDays(dateIn(from, tz), -1); date <= last; date = addDays(date, 1)) {
    const override = h.availability.overrides.find((o) => o.date === date);
    const ranges = override ? override.ranges : (h.availability.weekly[dayOf(date)] ?? []);
    for (const [a, b] of ranges) {
      const rs = at(date, a, tz);
      const re = at(date, b, tz);
      for (let t = rs; t + length * MIN <= re; t += step) {
        if (t < from || t > to) continue;
        if (blocked(h, t, length, s, opts)) continue;
        if (capped(h, t, s)) continue;
        out.push(t);
      }
    }
  }
  return [...new Set(out)].sort((x, y) => x - y);
}

/** Spans with one hole cut out of them: what's left before and after it. */
export function cut(spans: Span[], hole: Span): Span[] {
  return spans.flatMap((x) =>
    x.end <= hole.start || x.start >= hole.end
      ? [x]
      : [...(x.start < hole.start ? [{ start: x.start, end: hole.start }] : []), ...(x.end > hole.end ? [{ start: hole.end, end: x.end }] : [])],
  );
}

function blocked(h: HostInput, t: number, length: number, s: TypeSettings, opts: { typeId?: string; group?: Map<number, number> }): boolean {
  const block = { start: t - s.bufferBefore * MIN, end: t + (length + s.bufferAfter) * MIN };
  // A group meeting of this same type at this same start is the seat being offered, not a conflict, and so is its
  // event on the host's calendar.
  const seats = opts.group ? h.booked.filter((m) => m.typeId === opts.typeId && (m.at ?? m.start) === t) : [];
  const busy = seats.reduce((left, m) => cut(left, m), h.busy);
  if (busy.some((b) => overlaps(b, block))) return true;
  return h.booked.some((m) => !seats.includes(m) && overlaps(m, block));
}

function capped(h: HostInput, t: number, s: TypeSettings): boolean {
  if (!h.counts) return false;
  const date = dateIn(t, h.availability.tz);
  if (s.perDay && (h.counts.day[date] ?? 0) >= s.perDay) return true;
  if (s.perWeek && (h.counts.week[weekOf(date)] ?? 0) >= s.perWeek) return true;
  return false;
}

/**
 * The bookable starts for a meeting type, with the hosts free at each.
 *   one, owner_first, round_robin (flexible): any host free; hosts lists who.
 *   round_robin (strict): only `next`'s times.
 *   collective: every host free.
 *   double: at least one free host in each pool.
 *   group: the first host's times, plus starts that still have seats (`group`: guests booked per start).
 */
export function slots(o: { kind: Kind; hosts: HostInput[]; length: number; settings: TypeSettings; now: number; typeId?: string; pools?: Record<string, "a" | "b">; next?: string; group?: Map<number, number> }): Slot[] {
  const s = o.settings;
  if (!o.hosts.length) return [];
  if (o.kind === "group") {
    const h = o.hosts[0]!;
    const seats = Math.max(1, s.seats);
    return hostStarts(h, o.length, s, o.now, { typeId: o.typeId, group: o.group ?? new Map() })
      .filter((t) => (o.group?.get(t) ?? 0) < seats)
      .map((start) => ({ start, hosts: [h.id] }));
  }
  const hosts = o.kind === "round_robin" && s.rrMode === "strict" && o.next ? o.hosts.filter((h) => h.id === o.next) : o.hosts;
  const free = new Map<number, string[]>();
  for (const h of hosts) for (const t of hostStarts(h, o.length, s, o.now)) free.set(t, [...(free.get(t) ?? []), h.id]);
  const out: Slot[] = [];
  for (const [start, ids] of free) {
    if (o.kind === "collective" && ids.length !== hosts.length) continue;
    if (o.kind === "double") {
      const pools = new Set(ids.map((id) => o.pools?.[id] ?? "a"));
      if (!pools.has("a") || !pools.has("b")) continue;
    }
    out.push({ start, hosts: ids });
  }
  return out.sort((a, b) => a.start - b.start);
}

export type Turns = Record<string, { n: number; last: number }>;

/**
 * Round robin: who gets the meeting among the candidates. The lowest (meetings + 1) / weight wins, so a host with
 * weight 2 gets about twice the meetings of one with weight 1; ties go to the lower tier, then the host booked
 * least recently, then the id (so the same inputs always give the same host).
 */
export function pickHost(candidates: string[], hosts: Host[], turns: Turns): string | null {
  if (!candidates.length) return null;
  const by = new Map(hosts.map((h) => [h.user_id, h]));
  const score = (id: string) => ((turns[id]?.n ?? 0) + 1) / Math.min(10, Math.max(1, by.get(id)?.weight ?? 1));
  return [...candidates].sort((a, b) => score(a) - score(b) || (by.get(a)?.tier ?? 0) - (by.get(b)?.tier ?? 0) || (turns[a]?.last ?? 0) - (turns[b]?.last ?? 0) || (a < b ? -1 : 1))[0]!;
}

/** Two teams: one host from each pool among those free. */
export function pickPair(candidates: string[], hosts: Host[], turns: Turns): string[] {
  const pool = (p: "a" | "b") => candidates.filter((id) => (hosts.find((h) => h.user_id === id)?.pool ?? "a") === p);
  const a = pickHost(pool("a"), hosts, turns);
  const b = pickHost(pool("b"), hosts, turns);
  return a && b ? [a, b] : [];
}
