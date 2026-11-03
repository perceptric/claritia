// Calendar files for meeting emails (src/lib/meetings/ics.ts): the same UID for a meeting's whole life, SEQUENCE
// going up with each change, UTC times that stay right across daylight saving in the US, the EU and Australia, and
// text that can't break the file.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildIcs, fold, icsSequence, icsText, meetingUid, utc } from "../src/lib/meetings/ics.ts";
import { at } from "../src/lib/meetings/time.ts";

const ID = "3f2a6c1e-8b9d-4e2f-a1b3-5c7d9e0f1a2b";
const base = {
  meetingId: ID,
  sequence: 0,
  method: "REQUEST" as const,
  stamp: Date.UTC(2026, 9, 23, 12, 0, 0),
  summary: "Demo with Sam Lee",
  organizer: { name: "Sam Lee", email: "sam@acme.com" },
  attendees: [{ name: "Dana Lee", email: "dana@lead.io" }],
};
const line = (ics: string, name: string) => ics.replace(/\r\n /g, "").split("\r\n").find((l) => l.startsWith(`${name}:`) || l.startsWith(`${name};`));

test("times are UTC, so the same wall time either side of a clock change lands on the right instant", () => {
  const cases: [string, string, string, string][] = [
    // New York: EST (-5) before 8 March 2026, EDT (-4) after; back on 1 November.
    ["2026-03-06", "09:00", "America/New_York", "20260306T140000Z"],
    ["2026-03-09", "09:00", "America/New_York", "20260309T130000Z"],
    ["2026-10-30", "09:00", "America/New_York", "20261030T130000Z"],
    ["2026-11-02", "09:00", "America/New_York", "20261102T140000Z"],
    // Berlin: CET (+1) and CEST (+2); the EU changes on 29 March and 25 October 2026.
    ["2026-03-27", "10:00", "Europe/Berlin", "20260327T090000Z"],
    ["2026-03-30", "10:00", "Europe/Berlin", "20260330T080000Z"],
    ["2026-10-26", "10:00", "Europe/Berlin", "20261026T090000Z"],
    // Sydney: AEDT (+11) until 5 April 2026, AEST (+10) until 4 October.
    ["2026-04-03", "09:00", "Australia/Sydney", "20260402T220000Z"],
    ["2026-04-06", "09:00", "Australia/Sydney", "20260405T230000Z"],
    ["2026-10-05", "09:00", "Australia/Sydney", "20261004T220000Z"],
  ];
  for (const [date, time, tz, want] of cases) {
    const start = at(date, time, tz);
    const ics = buildIcs({ ...base, start, end: start + 30 * 60_000 });
    assert.equal(line(ics, "DTSTART"), `DTSTART:${want}`, `${date} ${time} ${tz}`);
    assert.equal(line(ics, "DTEND"), `DTEND:${utc(start + 30 * 60_000)}`);
  }
});

test("a meeting across the night the clocks change keeps its real length", () => {
  // 01:30 to 03:30 local on 8 March 2026 in New York is one hour of real time.
  const start = at("2026-03-08", "01:30", "America/New_York");
  const end = at("2026-03-08", "03:30", "America/New_York");
  assert.equal(end - start, 60 * 60_000);
  const ics = buildIcs({ ...base, start, end });
  assert.equal(line(ics, "DTSTART"), "DTSTART:20260308T063000Z");
  assert.equal(line(ics, "DTEND"), "DTEND:20260308T073000Z");
});

test("one UID per meeting; SEQUENCE counts moves and the cancel, and never goes down", () => {
  const start = Date.UTC(2026, 10, 3, 15);
  const invite = buildIcs({ ...base, start, end: start + 1_800_000, sequence: icsSequence(["booked"]) });
  const update = buildIcs({ ...base, start: start + 86_400_000, end: start + 86_400_000 + 1_800_000, sequence: icsSequence(["booked", "reminder_sent", "moved"]) });
  const cancel = buildIcs({ ...base, method: "CANCEL", start, end: start + 1_800_000, sequence: icsSequence(["booked", "moved", "moved", "canceled"]) });
  for (const f of [invite, update, cancel]) assert.equal(line(f, "UID"), `UID:${meetingUid(ID)}`);
  assert.deepEqual([invite, update, cancel].map((f) => line(f, "SEQUENCE")), ["SEQUENCE:0", "SEQUENCE:1", "SEQUENCE:3"]);
  assert.equal(line(invite, "METHOD"), "METHOD:REQUEST");
  assert.equal(line(invite, "STATUS"), "STATUS:CONFIRMED");
  assert.equal(line(cancel, "METHOD"), "METHOD:CANCEL");
  assert.equal(line(cancel, "STATUS"), "STATUS:CANCELLED");
  assert.equal(meetingUid(ID.toUpperCase()), meetingUid(ID), "the same meeting always has the same UID");
});

test("text is escaped, people can't inject lines, and every line is CRLF and 75 octets at most", () => {
  const start = Date.UTC(2026, 10, 3, 15);
  const ics = buildIcs({
    ...base,
    start,
    end: start + 1_800_000,
    summary: "Intro; pricing, and next steps",
    description: `Line one\nLine two \\ done\r\nEND:VEVENT\r\nBEGIN:VEVENT ${"ü".repeat(80)}`,
    location: "Room 4, Floor 2; Berlin",
    url: "https://meet.example/abc-defg-hij",
    organizer: { name: 'Sam "The Host" Lee\r\nX-EVIL:1', email: "sam@acme.com" },
    attendees: [{ name: "Dana, Lee", email: "dana@lead.io\r\nX-EVIL:1" }],
  });
  assert.equal(line(ics, "SUMMARY"), "SUMMARY:Intro\\; pricing\\, and next steps");
  assert.equal(line(ics, "LOCATION"), "LOCATION:Room 4\\, Floor 2\\; Berlin");
  assert.equal(ics.match(/^BEGIN:VEVENT/gm)?.length, 1, "a description can't open another event");
  assert.ok(!/^X-EVIL/m.test(ics.replace(/\r\n /g, "")), "names and addresses can't add properties");
  assert.equal(line(ics, "ORGANIZER"), 'ORGANIZER;CN="Sam The Host LeeX-EVIL:1":mailto:sam@acme.com');
  assert.ok(ics.endsWith("\r\n") && !/[^\r]\n/.test(ics), "CRLF everywhere");
  for (const l of ics.split("\r\n")) assert.ok(Buffer.byteLength(l, "utf8") <= 75, `too long: ${l}`);
  assert.equal(icsText("a\\b"), "a\\\\b");
});

test("folding never splits a character and unfolds to the original", () => {
  const long = `DESCRIPTION:${"日本語のテキスト".repeat(20)}`;
  const folded = fold(long);
  for (const l of folded.split("\r\n")) assert.ok(Buffer.byteLength(l, "utf8") <= 75);
  assert.equal(folded.replace(/\r\n /g, ""), long);
  assert.ok(!folded.includes("�"));
});

test("a meeting that ends before it starts is refused", () => {
  assert.throws(() => buildIcs({ ...base, start: 10, end: 10 }));
});
