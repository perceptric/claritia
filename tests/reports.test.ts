// Reports' pure parts (docs/enrich-workflows-reports.md Part 3): date presets in the workspace's time zone, the period
// before, change words, durations, compact numbers, CSV that spreadsheets can't run, and the bot check for beacons.
import assert from "node:assert/strict";
import { test } from "node:test";
import { isBotUa } from "../src/lib/reports/bots.ts";

test("beacons from bots, previews and scripts aren't counted", () => {
  for (const ua of ["", "Googlebot/2.1", "Mozilla/5.0 (compatible; bingbot/2.0)", "facebookexternalhit/1.1", "curl/8.4.0", "Mozilla/5.0 HeadlessChrome/120", "Slackbot-LinkExpanding 1.0"]) assert.equal(isBotUa(ua), true, ua);
  assert.equal(isBotUa("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"), false);
});
