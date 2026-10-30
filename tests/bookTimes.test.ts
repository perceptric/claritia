import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarLinks, partsOfDay, soonest } from "../src/lib/meetings/guestTimes.ts";

// The booking page's soonest times, day parts and calendar links (docs/meetings-scheduler.md 1.8).

const at = (iso: string) => ({ start: Date.parse(iso) });

test("a day's times split into morning, afternoon and evening in the guest's zone", () => {
  const slots = [at("2026-11-04T02:00:00Z"), at("2026-11-04T06:30:00Z"), at("2026-11-04T11:00:00Z")];
  // 9:00, 13:30 and 18:00 in Ho Chi Minh City.
  const vn = partsOfDay(slots, "Asia/Ho_Chi_Minh");
  assert.deepEqual(vn.map(([p, l]) => [p, l.length]), [["Morning", 1], ["Afternoon", 1], ["Evening", 1]]);
  // The same times are all early morning or evening in New York: no empty parts show.
  const ny = partsOfDay(slots, "America/New_York");
  assert.deepEqual(ny.map(([p]) => p), ["Morning", "Evening"]);
  assert.equal(ny.flatMap(([, l]) => l).length, 3);
});

test("day parts follow a zone's clock change", () => {
  // 13:00 UTC is 9:00 in New York before Nov 1, 2026 and 8:00 after; both stay morning, 17:00 UTC moves to noon.
  const before = partsOfDay([at("2026-10-30T16:30:00Z")], "America/New_York");
  const after = partsOfDay([at("2026-11-02T16:30:00Z")], "America/New_York");
  assert.equal(before[0]![0], "Afternoon");
  assert.equal(after[0]![0], "Morning");
});

test("a zone the browser doesn't know falls back to UTC hours", () => {
  assert.equal(partsOfDay([at("2026-11-04T15:00:00Z")], "Not/AZone")[0]![0], "Afternoon");
  assert.deepEqual(partsOfDay([], "UTC"), []);
});

test("soonest takes the first time of each day, in order, and skips empty days", () => {
  const days = new Map([
    ["2026-10-30", [at("2026-10-30T07:00:00Z"), at("2026-10-30T07:30:00Z")]],
    ["2026-10-31", []],
    ["2026-11-02", [at("2026-11-02T02:00:00Z")]],
    ["2026-11-03", [at("2026-11-03T02:00:00Z")]],
    ["2026-11-04", [at("2026-11-04T02:00:00Z")]],
  ]);
  const s = soonest(days, 3);
  assert.deepEqual(s.map(([d]) => d), ["2026-10-30", "2026-11-02", "2026-11-03"]);
  assert.equal(s[0]![1].start, Date.parse("2026-10-30T07:00:00Z"));
  assert.deepEqual(soonest(new Map(), 3), []);
});

test("calendar links carry the title and exact times", () => {
  const l = calendarLinks({ title: "Intro Call with Vincent", start: Date.parse("2026-11-04T03:00:00Z"), end: Date.parse("2026-11-04T03:30:00Z"), details: "Manage: https://x.test/m" });
  const g = new URL(l.google);
  assert.equal(g.hostname, "calendar.google.com");
  assert.equal(g.searchParams.get("dates"), "20261104T030000Z/20261104T033000Z");
  assert.equal(g.searchParams.get("text"), "Intro Call with Vincent");
  const o = new URL(l.outlook);
  assert.equal(o.searchParams.get("startdt"), "2026-11-04T03:00:00.000Z");
  assert.equal(o.searchParams.get("subject"), "Intro Call with Vincent");
});
