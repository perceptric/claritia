// The slot engine and round robin (docs/meetings-scheduler.md 1.2 to 1.5 and Part 3): hours across time zones and
// daylight saving, buffers, notice, window, caps, each kind of meeting type, and fairness over many bookings.
import assert from "node:assert/strict";
import { test } from "node:test";
import { hostStarts, pickHost, pickPair, slots, type HostInput, type Turns } from "../src/lib/meetings/slots.ts";
import { at, dateIn, dayOf, offset, weekOf } from "../src/lib/meetings/time.ts";
import { DEFAULT_AVAILABILITY, DEFAULT_SETTINGS, type Host, type TypeSettings } from "../src/lib/meetings/types.ts";

const H = (id: string, tz = "America/New_York", extra: Partial<HostInput> = {}): HostInput => ({ id, availability: DEFAULT_AVAILABILITY(tz), busy: [], booked: [], ...extra });
const S = (p: Partial<TypeSettings> = {}): TypeSettings => ({ ...DEFAULT_SETTINGS, notice: 0, ...p });
const iso = (ms: number) => new Date(ms).toISOString();
// Monday 2026-10-26, 06:00 in New York.
const MON = at("2026-10-26", "06:00", "America/New_York");

test("wall times land on the right instant across daylight saving", () => {
  assert.equal(iso(at("2026-03-08", "02:30", "America/New_York")), "2026-03-08T07:30:00.000Z", "a time in the gap moves past it");
  assert.equal(iso(at("2026-11-01", "01:30", "America/New_York")), "2026-11-01T05:30:00.000Z", "a repeated time takes the first");
  assert.equal(iso(at("2026-03-29", "09:00", "Europe/Berlin")), "2026-03-29T07:00:00.000Z");
  assert.equal(iso(at("2026-04-05", "09:00", "Australia/Sydney")), "2026-04-04T23:00:00.000Z", "after Sydney's change back");
  assert.equal(iso(at("2026-10-24", "24:00", "UTC")), "2026-10-25T00:00:00.000Z");
  assert.equal(offset(Date.UTC(2026, 6, 1), "Asia/Kolkata"), 5.5 * 3_600_000);
  assert.equal(dateIn(Date.UTC(2026, 9, 23, 23, 30), "Asia/Tokyo"), "2026-10-24");
  assert.equal(dayOf("2026-10-23"), "fri");
  assert.equal(weekOf("2026-10-25"), "2026-10-19");
});

test("a day's hours become starts in the host's zone, every step, ending before the hours do", () => {
  const starts = hostStarts(H("a"), 30, S({ window: 1 }), MON);
  assert.equal(iso(starts[0]!), "2026-10-26T13:00:00.000Z", "9:00 in New York");
  assert.equal(iso(starts.at(-1)!), "2026-10-26T20:30:00.000Z", "16:30, the last 30 minutes before 17:00");
  assert.equal(starts.length, 16);
  // The week New York leaves daylight time (Sunday 1 November), 9:00 is an hour later in UTC.
  const after = hostStarts(H("a"), 30, S({ window: 9 }), MON).filter((t) => dateIn(t, "America/New_York") === "2026-11-02");
  assert.equal(iso(after[0]!), "2026-11-02T14:00:00.000Z");
});

test("notice, window, buffers, busy times, booked meetings and date overrides all remove starts", () => {
  const h = H("a", "America/New_York", {
    busy: [{ start: at("2026-10-26", "10:00", "America/New_York"), end: at("2026-10-26", "11:00", "America/New_York") }],
    booked: [{ start: at("2026-10-26", "14:00", "America/New_York"), end: at("2026-10-26", "14:30", "America/New_York") }],
  });
  h.availability.overrides = [{ date: "2026-10-27", ranges: [] }];
  const starts = hostStarts(h, 30, S({ window: 2, bufferBefore: 15, bufferAfter: 15, notice: 4 * 60 }), MON).map((t) => new Date(t).toISOString().slice(11, 16));
  // Notice of 4 hours from 06:00 means 10:00 or later; busy 10-11 with 15-minute buffers blocks 10:00 to 11:00.
  assert.equal(starts[0], "15:30", "11:30 New York is the first start");
  assert.ok(!starts.includes("17:30") && !starts.includes("18:00"), "13:30 and 14:00 sit inside the booked meeting's buffer");
  assert.ok(starts.includes("19:00"), "15:00 is free again");
  assert.equal(starts.length, hostStarts(h, 30, S({ window: 2, bufferBefore: 15, bufferAfter: 15, notice: 4 * 60 }), MON).filter((t) => dateIn(t, "America/New_York") === "2026-10-26").length, "the Tuesday off adds nothing");
});

test("daily and weekly caps close a host's days", () => {
  const day = hostStarts(H("a", "America/New_York", { counts: { day: { "2026-10-26": 2 }, week: {} } }), 30, S({ window: 2, perDay: 2 }), MON);
  assert.ok(day.every((t) => dateIn(t, "America/New_York") !== "2026-10-26"));
  const week = hostStarts(H("a", "America/New_York", { counts: { day: {}, week: { "2026-10-26": 5 } } }), 30, S({ window: 10, perWeek: 5 }), MON);
  assert.ok(week.every((t) => dateIn(t, "America/New_York") >= "2026-11-02"), "the next week opens");
});

test("each kind combines hosts its own way", () => {
  const busyA = { start: at("2026-10-26", "09:00", "America/New_York"), end: at("2026-10-26", "12:00", "America/New_York") };
  const a = H("a", "America/New_York", { busy: [busyA] });
  const b = H("b", "Europe/London");
  const nine = at("2026-10-26", "09:00", "America/New_York");
  const noon = at("2026-10-26", "12:00", "America/New_York");
  const rr = slots({ kind: "round_robin", hosts: [a, b], length: 30, settings: S({ window: 1 }), now: MON });
  // London works 9 to 17 local, which is 5:00 to 13:00 in New York this week.
  assert.deepEqual(rr.find((x) => x.start === nine)?.hosts, ["b"]);
  assert.deepEqual(rr.find((x) => x.start === noon)?.hosts.sort(), ["a", "b"]);
  const all = slots({ kind: "collective", hosts: [a, b], length: 30, settings: S({ window: 1 }), now: MON });
  assert.ok(all.every((x) => x.start >= noon && x.hosts.length === 2), "everyone free: only from noon until London's day ends");
  const strict = slots({ kind: "round_robin", hosts: [a, b], length: 30, settings: S({ window: 1, rrMode: "strict" }), now: MON, next: "a" });
  assert.ok(strict.every((x) => x.hosts.join() === "a"));
  const double = slots({ kind: "double", hosts: [a, b, H("c")], length: 30, settings: S({ window: 1 }), now: MON, pools: { a: "a", c: "a", b: "b" } });
  assert.ok(double.length > 0 && double.every((x) => x.hosts.includes("b")), "every start has the one pool-b host");
});

test("a group type keeps offering a start until its seats are taken", () => {
  const t = at("2026-10-26", "10:00", "America/New_York");
  const host = H("a", "America/New_York", { booked: [{ start: t, end: t + 30 * 60_000, typeId: "g" }] });
  const open = slots({ kind: "group", typeId: "g", hosts: [host], length: 30, settings: S({ window: 1, seats: 3 }), now: MON, group: new Map([[t, 2]]) });
  assert.ok(open.some((x) => x.start === t), "1 seat left");
  const full = slots({ kind: "group", typeId: "g", hosts: [host], length: 30, settings: S({ window: 1, seats: 3 }), now: MON, group: new Map([[t, 3]]) });
  assert.ok(!full.some((x) => x.start === t));
  assert.ok(!full.some((x) => x.start === t + 15 * 60_000), "the group meeting still blocks the host's other times");
});

test("round robin stays fair over 1,000 bookings, with weights held within 2%", () => {
  const hosts: Host[] = [{ user_id: "a", weight: 1 }, { user_id: "b", weight: 2 }, { user_id: "c", weight: 1 }];
  const turns: Turns = {};
  for (let i = 0; i < 1000; i++) {
    // Each time a random host is busy, as on real calendars.
    const busy = ["a", "b", "c"][i % 7 === 0 ? i % 3 : 3];
    const id = pickHost(["a", "b", "c"].filter((x) => x !== busy), hosts, turns)!;
    turns[id] = { n: (turns[id]?.n ?? 0) + 1, last: i };
  }
  const share = (id: string) => turns[id]!.n / 1000;
  assert.ok(Math.abs(share("b") - 0.5) <= 0.02, `b got ${share("b")}`);
  assert.ok(Math.abs(share("a") - 0.25) <= 0.02 && Math.abs(share("c") - 0.25) <= 0.02, `a ${share("a")}, c ${share("c")}`);
});

test("ties go to the lower tier, then the host booked longest ago; pairs need both pools", () => {
  const hosts: Host[] = [{ user_id: "a", tier: 1 }, { user_id: "b", tier: 0 }, { user_id: "c", tier: 0 }];
  assert.equal(pickHost(["a", "b", "c"], hosts, {}), "b");
  assert.equal(pickHost(["a", "b", "c"], hosts, { b: { n: 0, last: 9 }, c: { n: 0, last: 3 } }), "c");
  assert.equal(pickHost([], hosts, {}), null);
  const pools: Host[] = [{ user_id: "ae1", pool: "a" }, { user_id: "ae2", pool: "a" }, { user_id: "se1", pool: "b" }];
  assert.deepEqual(pickPair(["ae1", "ae2", "se1"], pools, { ae1: { n: 3, last: 1 } }), ["ae2", "se1"]);
  assert.deepEqual(pickPair(["ae1", "ae2"], pools, {}), [], "no one free in the second pool");
});
