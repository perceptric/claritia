// What people save for Meetings (docs/meetings-scheduler.md 1.2 and 1.4): hours and meeting types come back clean,
// or with the problem in plain words.
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkAvailability, checkType } from "../src/lib/meetings/check.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const members = new Set([A, B]);

test("hours: a zone, ordered ranges per day, and date changes", () => {
  const r = checkAvailability({ tz: "Europe/Berlin", weekly: { mon: [["13:00", "17:00"], ["09:00", "12:00"]], sat: [] }, overrides: [{ date: "2026-12-24", ranges: [] }] });
  assert.ok("availability" in r);
  assert.deepEqual(r.availability.weekly.mon, [["09:00", "12:00"], ["13:00", "17:00"]]);
  assert.deepEqual(r.availability.weekly.tue, []);
  assert.equal(r.availability.overrides[0]!.date, "2026-12-24");
  const bad = checkAvailability({ tz: "Mars/Base", weekly: { mon: [["09:00", "12:00"], ["11:00", "13:00"]], tue: [["17:00", "09:00"]], wed: [["9am", "5pm"]] } });
  assert.ok("errors" in bad);
  assert.match(bad.errors.join(" "), /Pick a time zone/);
  assert.match(bad.errors.join(" "), /overlap/);
  assert.match(bad.errors.join(" "), /ends before it starts/);
  assert.match(bad.errors.join(" "), /look like 09:00/);
});

test("meeting types: each kind's host rules, and settings kept in range", () => {
  const ok = checkType({ name: "Demo", slug: "demo", kind: "round_robin", hosts: [{ user_id: A, weight: 40 }, { user_id: B }], settings: { lengths: [60, 30, 30, 3], step: 7, window: 900, notice: -5, perDay: 4 } }, members);
  assert.ok("type" in ok);
  assert.deepEqual(ok.type.hosts, [{ user_id: A, weight: 10, tier: 0 }, { user_id: B, weight: 1, tier: 0 }]);
  assert.deepEqual(ok.type.settings.lengths, [30, 60]);
  assert.equal(ok.type.settings.step, 30);
  assert.equal(ok.type.settings.window, 365);
  assert.equal(ok.type.settings.notice, 0);
  assert.equal(ok.type.settings.perDay, 4);
  const errs = (raw: object) => {
    const r = checkType(raw, members);
    return "errors" in r ? r.errors.join(" ") : "";
  };
  assert.match(errs({ name: "", slug: "Demo Call", kind: "one", hosts: [] }), /Name the meeting type.*letters, numbers and dashes.*Add a host/);
  assert.match(errs({ name: "x", slug: "x1", kind: "one", hosts: [{ user_id: A }, { user_id: B }] }), /one host/);
  assert.match(errs({ name: "x", slug: "x1", kind: "collective", hosts: [{ user_id: A }] }), /two or more hosts/);
  assert.match(errs({ name: "x", slug: "x1", kind: "double", hosts: [{ user_id: A }, { user_id: B }] }), /a host in each team/);
  assert.match(errs({ name: "x", slug: "x1", kind: "one", hosts: [{ user_id: "33333333-3333-4333-8333-333333333333" }] }), /isn't in this workspace/);
  assert.match(errs({ name: "x", slug: "x1", kind: "one", hosts: [{ user_id: A }], settings: { location: { kind: "link", url: "http://x" }, confirmation: { kind: "redirect", url: "ftp://y" } } }), /https.*https/);
  const group = checkType({ name: "Weekly demo", slug: "weekly", kind: "group", hosts: [{ user_id: A }], settings: { seats: 1 } }, members);
  assert.ok("type" in group && group.type.settings.seats === 2, "a group has at least two seats");
  const paid = checkType({ name: "Audit", slug: "audit", kind: "one", hosts: [{ user_id: A }], settings: { price: { amount: 15000, currency: "USD" } } }, members);
  assert.ok("type" in paid && paid.type.settings.price?.currency === "usd");
});
