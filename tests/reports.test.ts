// Reports' pure parts (docs/enrich-workflows-reports.md Part 3): date presets in the workspace's time zone, the period
// before, change words, durations, compact numbers, CSV that spreadsheets can't run, and the bot check for beacons.
import assert from "node:assert/strict";
import { test } from "node:test";
import { isBotUa } from "../src/lib/reports/bots.ts";
import { compact, daysIn, delta, duration, pct, presetRange, previous, rangeWords, todayIn, toCsv } from "../src/lib/reports/range.ts";

test("presets: this month, last month (across a year), last 90 days, this quarter", () => {
  assert.deepEqual(presetRange("this_month", "2026-10-24"), { from: "2026-10-01", to: "2026-10-24" });
  assert.deepEqual(presetRange("last_month", "2026-01-10"), { from: "2025-12-01", to: "2025-12-31" });
  assert.deepEqual(presetRange("last_month", "2026-03-31"), { from: "2026-02-01", to: "2026-02-28" });
  const l90 = presetRange("last_90", "2026-10-24");
  assert.equal(daysIn(l90), 90);
  assert.equal(l90.to, "2026-10-24");
  assert.deepEqual(presetRange("this_quarter", "2026-11-05"), { from: "2026-10-01", to: "2026-11-05" });
  assert.deepEqual(presetRange("this_quarter", "2026-03-31"), { from: "2026-01-01", to: "2026-03-31" });
});

test("the period before has the same number of days and ends the day before", () => {
  assert.deepEqual(previous({ from: "2026-10-01", to: "2026-10-31" }), { from: "2026-08-31", to: "2026-09-30" });
  assert.deepEqual(previous({ from: "2026-03-01", to: "2026-03-01" }), { from: "2026-02-28", to: "2026-02-28" });
  const r = { from: "2026-01-01", to: "2026-03-31" };
  assert.equal(daysIn(previous(r)), daysIn(r));
});

test("today in the workspace's time zone: 23:30 in New York is still the day before in UTC terms", () => {
  const at = new Date("2026-10-02T03:30:00Z");
  assert.equal(todayIn("America/New_York", at), "2026-10-01");
  assert.equal(todayIn("UTC", at), "2026-10-02");
  assert.equal(todayIn("Not/AZone", at), "2026-10-02");
});

test("words: ranges, change, shares, durations and compact numbers", () => {
  assert.equal(rangeWords({ from: "2026-10-01", to: "2026-10-31" }), "Oct 1 – 31");
  assert.equal(rangeWords({ from: "2026-09-15", to: "2026-10-14" }), "Sep 15 – Oct 14");
  assert.equal(rangeWords({ from: "2025-12-20", to: "2026-01-03" }), "Dec 20, 2025 – Jan 3, 2026");
  assert.equal(delta(112, 100), "+12%");
  assert.equal(delta(97, 100), "−3%");
  assert.equal(delta(5, 0), "new");
  assert.equal(delta(0, 0), null);
  assert.equal(delta(100, 100), "same");
  assert.equal(pct(1, 3), "33%");
  assert.equal(pct(1, 0), "–");
  assert.deepEqual([duration(45), duration(180), duration(7800), duration(273600), duration(null)], ["45s", "3m", "2h 10m", "3d 4h", "–"]);
  assert.deepEqual([compact(1284), compact(12_900), compact(4_200_000)], ["1,284", "12.9K", "4.2M"]);
});

test("CSV: quoted when needed, and a cell that starts like a formula can't run in a spreadsheet", () => {
  const csv = toCsv(["Name", "Leads"], [["Acme, Inc", 3], ['Say "hi"', null], ["=HYPERLINK(\"x\")", 1], ["-2", -2]]);
  assert.equal(csv, 'Name,Leads\r\n"Acme, Inc",3\r\n"Say ""hi""",\r\n"\'=HYPERLINK(""x"")",1\r\n\'-2,-2\r\n');
});

test("beacons from bots, previews and scripts aren't counted", () => {
  for (const ua of ["", "Googlebot/2.1", "Mozilla/5.0 (compatible; bingbot/2.0)", "facebookexternalhit/1.1", "curl/8.4.0", "Mozilla/5.0 HeadlessChrome/120", "Slackbot-LinkExpanding 1.0"]) assert.equal(isBotUa(ua), true, ua);
  assert.equal(isBotUa("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"), false);
});
