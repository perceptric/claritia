// Meetings screens' helpers (src/components/app/meetings/model.ts): the one-line time range, when Join shows, the
// numbers on Upcoming, the week grid's hours and painting hours in half-hour cells.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cellsToRanges, joinOpen, joinUrl, meetingStats, paintRows, rangesToCells, timeRange, weekHours } from "../src/components/app/meetings/model.ts";
import { DEFAULT_AVAILABILITY } from "../src/lib/meetings/types.ts";
import { buildIcs } from "../src/lib/meetings/ics.ts";

const at = (h: number, m = 0, d = 3) => new Date(2026, 10, d, h, m).getTime();

test("a time range sits on one line and says am or pm once when both ends share it", () => {
  assert.equal(timeRange(at(20), at(20, 30)), "8:00 to 8:30 PM");
  assert.equal(timeRange(at(11, 30), at(12, 30)), "11:30 AM to 12:30 PM");
  assert.ok(!timeRange(at(9), at(9, 45)).includes("\n"));
});

test("Join shows from 10 minutes before a booked meeting until it ends, and only with a real https link", () => {
  const m = { status: "booked" as const, start_at: new Date(at(10)).toISOString(), end_at: new Date(at(10, 30)).toISOString() };
  assert.equal(joinOpen(m, at(9, 49)), false);
  assert.equal(joinOpen(m, at(9, 50)), true);
  assert.equal(joinOpen(m, at(10, 29)), true);
  assert.equal(joinOpen(m, at(10, 30)), false);
  assert.equal(joinOpen({ ...m, status: "canceled" }, at(10)), false);
  assert.equal(joinUrl({ kind: "google_meet", url: "https://meet.google.com/abc-defg-hij" }), "https://meet.google.com/abc-defg-hij");
  assert.equal(joinUrl({ url: "javascript:alert(1)" }), null);
  assert.equal(joinUrl({ url: "http://zoom.us/j/1" }), null);
  assert.equal(joinUrl(null), null);
});

test("Upcoming's numbers: booked since Monday, show rate and no-shows over 30 days, the top source", () => {
  const now = at(12, 0, 4); // Wednesday, November 4 2026
  const oct = (d: number) => new Date(2026, 9, d, 9).getTime();
  const row = (status: string, source: string, start: number, created: number) => ({ status, source, start_at: new Date(start).toISOString(), created_at: new Date(created).toISOString() }) as Parameters<typeof meetingStats>[0][number];
  const rows = [
    row("booked", "form", at(15, 0, 6), at(9, 0, 3)),
    row("booked", "form", at(15, 0, 7), at(9, 0, 4)),
    row("booked", "page", at(15, 0, 7), at(9, 0, 4)),
    row("canceled", "page", at(15, 0, 7), at(9, 0, 4)),
    row("held", "page", at(10, 0, 2), oct(28)),
    row("held", "page", at(10, 0, 1), oct(27)),
    row("no_show", "form", at(11, 0, 2), oct(27)),
    row("booked", "form", oct(30), oct(29)), // last week's
  ];
  const s = meetingStats(rows, now);
  assert.equal(s.booked, 3, "canceled ones don't count");
  assert.equal(s.noShows, 1);
  assert.equal(s.showRate, 67);
  assert.equal(s.topSource, "form");
  assert.deepEqual(meetingStats([], now), { booked: 0, showRate: null, noShows: 0, topSource: null });
});

test("the week grid shows 8 to 18, stretched to fit early and late meetings", () => {
  assert.deepEqual(weekHours([]), { from: 8, to: 18 });
  assert.deepEqual(weekHours([{ start: at(7, 30), end: at(8) }, { start: at(19), end: at(19, 30) }]), { from: 7, to: 20 });
  assert.equal(weekHours([{ start: at(23), end: at(0, 0, 4) }]).to, 24);
});

test("painting hours: ranges to half-hour cells and back, joined where they touch", () => {
  const cells = rangesToCells([["09:00", "12:00"], ["13:00", "17:00"]]);
  assert.equal(cells.size, 14);
  assert.ok(cells.has(18) && cells.has(23) && !cells.has(24) && cells.has(26));
  assert.deepEqual(cellsToRanges(cells), [["09:00", "12:00"], ["13:00", "17:00"]]);
  cells.add(24);
  cells.add(25);
  assert.deepEqual(cellsToRanges(cells), [["09:00", "17:00"]], "filling the gap joins the ranges");
  assert.deepEqual(cellsToRanges([47]), [["23:30", "24:00"]]);
  assert.deepEqual(cellsToRanges([]), []);
  // A quarter-hour start covers its whole cell.
  assert.deepEqual(cellsToRanges(rangesToCells([["09:15", "10:00"]])), [["09:00", "10:00"]]);
});

test("the paint grid shows 7:00 to 19:00, stretched to the week's hours", () => {
  const w = DEFAULT_AVAILABILITY("UTC").weekly;
  assert.deepEqual(paintRows(w), { from: 14, to: 38 });
  assert.deepEqual(paintRows({ ...w, sat: [["06:00", "21:30"]] }), { from: 12, to: 43 });
});

test("the calendar file a guest adds by hand is PUBLISH, with the join link", () => {
  const f = buildIcs({ meetingId: "m1", sequence: 0, method: "PUBLISH", start: at(10), end: at(10, 30), stamp: at(9), summary: "Intro call with Dana", location: "https://meet.google.com/x", url: "https://meet.google.com/x", organizer: { email: "meetings@tryclaritia.com", name: "Dana" }, attendees: [{ email: "lee@acme.com" }] });
  assert.match(f, /METHOD:PUBLISH/);
  assert.match(f, /STATUS:CONFIRMED/);
  assert.match(f, /URL:https:\/\/meet\.google\.com\/x/);
});

test("visibility: one choice over secret and active, and Off keeps whether it was hidden", async () => {
  const { visibilityOf, visibilityPatch, VISIBILITY } = await import("../src/components/app/meetings/model.ts");
  assert.deepEqual(VISIBILITY.map((v) => v.label), ["Public", "Link only", "Off"]);
  assert.ok(VISIBILITY.every((v) => v.hint), "every choice has a helper line");
  assert.equal(visibilityOf({ secret: false, active: true }), "public");
  assert.equal(visibilityOf({ secret: true, active: true }), "link");
  assert.equal(visibilityOf({ secret: true, active: false }), "off");
  assert.deepEqual(visibilityPatch("public", { secret: true }), { secret: false, active: true });
  assert.deepEqual(visibilityPatch("link", { secret: false }), { secret: true, active: true });
  assert.deepEqual(visibilityPatch("off", { secret: true }), { secret: true, active: false });
});

test("questions move to a new spot, the others keep their order, and a bad move changes nothing", async () => {
  const { moveItem } = await import("../src/components/app/meetings/model.ts");
  assert.deepEqual(moveItem(["a", "b", "c", "d"], 0, 2), ["b", "c", "a", "d"]);
  assert.deepEqual(moveItem(["a", "b", "c", "d"], 3, 0), ["d", "a", "b", "c"]);
  const same = ["a", "b"];
  assert.equal(moveItem(same, 1, 1), same);
  assert.equal(moveItem(same, 0, 5), same);
  assert.equal(moveItem(same, -1, 0), same);
});
