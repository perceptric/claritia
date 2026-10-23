// The plain helpers behind the Meetings screens (src/components/app/meetings/model.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bookUrl,
  canCancel,
  canEditType,
  canMark,
  checkProfile,
  copyToAll,
  filterMeetings,
  hoursSummary,
  lengthsText,
  minutesText,
  nextRange,
  slugify,
  splitMeetings,
  timesText,
  uniqueSlug,
  type MeetingRow,
} from "../src/components/app/meetings/model.ts";
import { at } from "../src/lib/meetings/time.ts";
import { DEFAULT_AVAILABILITY } from "../src/lib/meetings/types.ts";

const NOW = Date.UTC(2026, 10, 2, 15, 0);
const iso = (minFromNow: number) => new Date(NOW + minFromNow * 60_000).toISOString();
const row = (id: string, start: number, status: MeetingRow["status"] = "booked", extra: Partial<MeetingRow> = {}): MeetingRow => ({
  id,
  type_id: "t1",
  hosts: ["u1"],
  status,
  source: "page",
  start_at: iso(start),
  end_at: iso(start + 30),
  ...extra,
});

test("lengths and minutes read like people write them", () => {
  assert.equal(minutesText(30), "30 min");
  assert.equal(minutesText(90), "1 h 30 min");
  assert.equal(minutesText(120), "2 h");
  assert.equal(minutesText(1440), "1 day");
  assert.equal(lengthsText([30]), "30 min");
  assert.equal(lengthsText([45, 15, 30]), "15, 30 or 45 min");
  assert.equal(lengthsText([30, 60]), "30 min or 1 h");
});

test("link names come from names and stay free", () => {
  assert.equal(slugify("Intro call"), "intro-call");
  assert.equal(slugify("  Démo / Q&A!! "), "demo-q-a");
  assert.equal(slugify("!!"), "meeting");
  assert.equal(slugify("a"), "a-1");
  assert.equal(uniqueSlug("call", ["call", "call-2"]), "call-3");
  assert.equal(uniqueSlug("call", []), "call");
});

test("who can change a type", () => {
  const t = { hosts: [{ user_id: "h" }], owner_user_id: null, created_by: "c" };
  assert.ok(canEditType("owner", "x", t));
  assert.ok(canEditType("member", "h", t));
  assert.ok(canEditType("member", "c", t));
  assert.ok(!canEditType("member", "x", t));
  assert.ok(!canEditType(null, "h", t));
  assert.ok(canEditType("member", "o", { hosts: [], owner_user_id: "o" }));
});

test("upcoming and past: canceled meetings and ended ones are past, in the right order", () => {
  const rows = [row("a", 60), row("b", -120), row("c", 10), row("d", 120, "canceled"), row("e", -10)];
  const { upcoming, past } = splitMeetings(rows, NOW);
  assert.deepEqual(upcoming.map((m) => m.id), ["e", "c", "a"], "a meeting under way is still upcoming");
  assert.deepEqual(past.map((m) => m.id), ["d", "b"]);
});

test("held and no-show wait for the start; cancel is for meetings still to come", () => {
  assert.ok(!canMark(row("a", 5), NOW));
  assert.ok(canMark(row("a", -5), NOW));
  assert.ok(canMark(row("a", -60, "no_show"), NOW), "a host can fix a click");
  assert.ok(!canMark(row("a", -60, "canceled"), NOW));
  assert.ok(canCancel(row("a", 60), NOW));
  assert.ok(canCancel(row("a", 60, "pending_payment"), NOW));
  assert.ok(!canCancel(row("a", -60), NOW));
  assert.ok(!canCancel(row("a", 60, "canceled"), NOW));
});

test("filters by host, type and status together", () => {
  const rows = [row("a", 1, "booked", { hosts: ["u1", "u2"] }), row("b", 2, "held", { type_id: "t2" }), row("c", 3, "booked", { hosts: ["u3"] })];
  assert.deepEqual(filterMeetings(rows, { host: "u2", type: "", status: "" }).map((m) => m.id), ["a"]);
  assert.deepEqual(filterMeetings(rows, { host: "", type: "t1", status: "booked" }).map((m) => m.id), ["a", "c"]);
  assert.deepEqual(filterMeetings(rows, { host: "", type: "", status: "" }).length, 3);
});

test("copy times: grouped by the reader's day, a few a day, each with its own link", () => {
  const tz = "America/New_York";
  const starts = [at("2026-11-03", "09:00", tz), at("2026-11-03", "09:30", tz), at("2026-11-03", "10:00", tz), at("2026-11-03", "10:30", tz), at("2026-11-04", "14:00", tz)];
  const text = timesText({ name: "Intro call", length: 30, starts, tz, url: (s) => bookUrl("https://app.x.io/", "acme", "intro", { start: s, length: 30 }) });
  const lines = text.split("\n");
  assert.equal(lines[0], "Intro call, 30 min (times in New York)");
  assert.equal(lines[2], "Tue 3 Nov");
  assert.equal(lines[3], `9:00 https://app.x.io/book/acme/intro?start=2026-11-03T14%3A00%3A00.000Z&length=30`);
  assert.equal(lines.filter((l) => l.startsWith("1") || l.startsWith("9")).length, 4, "three on the first day, one on the next");
  assert.ok(lines.includes("Wed 4 Nov"));
  assert.ok(timesText({ name: "x", length: 30, starts, tz, url: () => "u", hour12: true }).includes("9:00 AM u"));
  assert.equal(timesText({ name: "x", length: 30, starts: [], tz, url: () => "u" }), "");
});

test("hours: a new range after the last, copy to all days, and a short summary", () => {
  assert.deepEqual(nextRange([]), ["09:00", "17:00"]);
  assert.deepEqual(nextRange([["09:00", "12:00"]]), ["13:00", "14:00"]);
  assert.deepEqual(nextRange([["09:00", "22:30"]]), ["23:00", "24:00"]);
  assert.equal(nextRange([["09:00", "23:30"]]), null);
  const a = DEFAULT_AVAILABILITY("UTC");
  const w = { ...a.weekly, mon: [["09:00", "12:00"], ["13:00", "17:00"]] as [string, string][] };
  const copied = copyToAll(w, "mon");
  assert.deepEqual(copied.fri, w.mon);
  assert.deepEqual(copied.sat, [], "days off stay off");
  assert.deepEqual(copyToAll(w, "mon", true).sun, w.mon);
  assert.equal(hoursSummary(a.weekly), "Mon to Fri 09:00 to 17:00");
  assert.equal(hoursSummary({ ...a.weekly, sat: [["10:00", "12:00"]] }), "Mon to Fri 09:00 to 17:00; Sat 10:00 to 12:00");
  assert.equal(hoursSummary({ ...a.weekly, wed: [] }), "Mon, Tue 09:00 to 17:00; Thu, Fri 09:00 to 17:00");
  assert.equal(hoursSummary({ mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }), "No hours");
});

test("booking profiles are checked before they're saved", () => {
  assert.deepEqual(checkProfile({ slug: " Sam-Lee ", name: "Sam", headline: "", photo_url: "" }), { profile: { slug: "sam-lee", name: "Sam", headline: "", photo_url: "" } });
  const bad = checkProfile({ slug: "-x", name: "", photo_url: "http://x.io/p.png" });
  assert.ok("errors" in bad && bad.errors.length === 3);
});
