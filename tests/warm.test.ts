// The warm-up days the Send panel shows (src/lib/emails/warm.ts), the same rule as domain_warm_cap (155).
import assert from "node:assert/strict";
import { test } from "node:test";
import { warmCap, warmDays } from "../src/lib/emails/warm.ts";

const DAY = 86_400_000;
const now = Date.parse("2026-11-12T12:00:00Z");
const since = (days: number) => new Date(now - days * DAY).toISOString();

test("500 a day the first week, doubling weekly, none from week 8", () => {
  assert.deepEqual([0, 6, 7, 14, 42, 48, 49].map((d) => warmCap(now - d * DAY, now)), [500, 500, 1000, 2000, 32000, 32000, null]);
});

test("a big first campaign takes days; a warm domain or a small list goes today", () => {
  assert.equal(warmDays(400, { since: since(0), left_today: 500 }, now).days, 1);
  assert.equal(warmDays(400, null, now).days, 1);
  assert.equal(warmDays(1200, { since: since(0), left_today: 500 }, now).days, 3);
  // Day 6 of week 1: today 500, then week 2 gives 1,000 a day.
  const r = warmDays(3000, { since: since(6), left_today: 500 }, now);
  assert.equal(r.days, 4);
  assert.equal(r.last.toISOString().slice(0, 10), "2026-11-15");
  // Past week 7 the rest goes at once.
  assert.equal(warmDays(1_000_000, { since: since(48), left_today: 0 }, now).days, 2);
});
