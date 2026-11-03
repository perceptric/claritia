// Meeting emails (src/lib/meetings/emails.ts) and their links (src/lib/meetings/links.ts): times in the reader's own
// zone across daylight saving, names and answers escaped, the MIME message with the invite, signed one-meeting
// outcome links, and the booking link with the lead's details.
import assert from "node:assert/strict";
import { test } from "node:test";
import { afterEmail, bookLaterEmail, cancelEmail, confirmEmail, encodeHeader, fmtWhen, hostBookedEmail, mime, reminderEmail, whereOf, type MeetingView } from "../src/lib/meetings/emails.ts";
import { bookingUrl, bookRef, outcomeToken, readBookRef, readOutcomeToken } from "../src/lib/meetings/links.ts";
import { at } from "../src/lib/meetings/time.ts";

const SECRET = "k".repeat(40);
const NOW = Date.UTC(2026, 9, 23, 12);

const v = (o: Partial<MeetingView> = {}): MeetingView => ({
  typeName: "Demo",
  start: at("2026-11-03", "10:00", "America/New_York"),
  end: at("2026-11-03", "10:30", "America/New_York"),
  guestName: "Dana Lee",
  guestEmail: "dana@lead.io",
  hosts: [{ name: "Sam Lee", email: "sam@acme.com" }],
  answers: [],
  tz: "America/New_York",
  where: { label: "Google Meet", url: "https://meet.google.com/abc-defg-hij" },
  manage: "https://app.test/book/m/tok123",
  now: NOW,
  ...o,
});

test("times show in the reader's zone with its abbreviation, right on both sides of a clock change", () => {
  assert.equal(fmtWhen(at("2026-10-30", "10:00", "America/New_York"), "America/New_York", NOW), "Friday, October 30 at 10:00 AM EDT");
  assert.equal(fmtWhen(at("2026-11-02", "10:00", "America/New_York"), "America/New_York", NOW), "Monday, November 2 at 10:00 AM EST");
  // The same instant for a host in Berlin, whose clocks changed a week earlier.
  assert.equal(fmtWhen(at("2026-10-30", "10:00", "America/New_York"), "Europe/Berlin", NOW), "Friday, October 30 at 3:00 PM GMT+1");
  // Next year's dates carry the year; an unknown zone falls back to UTC rather than failing.
  assert.match(fmtWhen(Date.UTC(2027, 0, 5, 15), "America/Chicago", NOW), /January 5, 2027 at 9:00 AM CST/);
  assert.match(fmtWhen(Date.UTC(2026, 10, 3, 15), "Mars/Base", NOW), /3:00 PM UTC/);
});

test("the confirmation says what, when, with whom, where, and has the manage links", () => {
  const e = confirmEmail(v({ answers: [{ label: "Team size", value: "12" }] }));
  assert.equal(e.subject, "Confirmed: Demo with Sam Lee on Tuesday, November 3 at 10:00 AM EST");
  for (const s of ["Hi Dana,", "Demo", "Tuesday, November 3 at 10:00 AM EST (30 min)", "Sam Lee", "https://meet.google.com/abc-defg-hij", "Team size: 12", "Reschedule: https://app.test/book/m/tok123", "Cancel: https://app.test/book/m/tok123"]) {
    assert.ok(e.text.includes(s), `text has ${s}`);
  }
  assert.ok(e.html.includes(`href="https://app.test/book/m/tok123"`));
  // The host's note is in the host's zone.
  const h = hostBookedEmail(v({ tz: "Europe/London", answers: [{ label: "Team size", value: "12" }] }));
  assert.equal(h.subject, "New meeting: Dana Lee on Tuesday, November 3 at 3:00 PM GMT");
  assert.ok(h.text.includes("dana@lead.io") && h.text.includes("Team size: 12"));
});

test("names and answers are escaped, and links that aren't http(s) are dropped", () => {
  const e = confirmEmail(v({ guestName: `<img src=x onerror=alert(1)>`, answers: [{ label: "<b>Q</b>", value: `"><script>x</script>` }], manage: "javascript:alert(1)" }));
  assert.ok(!e.html.includes("<script>") && !e.html.includes("<img") && !e.html.includes("<b>Q"));
  assert.ok(!e.html.includes("javascript:"));
});

test("cancel, reminder and the after-meeting email", () => {
  const c = cancelEmail(v(), { reason: "Out sick", bookAgain: "https://app.test/book/acme/demo" });
  assert.match(c.subject, /^Canceled: Demo with Sam Lee on/);
  assert.ok(c.text.includes("Reason: Out sick") && c.text.includes("Book a new time: https://app.test/book/acme/demo"));
  assert.equal(reminderEmail(v(), 60).subject, "Reminder: Demo with Sam Lee in 1 hour");
  assert.equal(reminderEmail(v(), 1440).subject, "Reminder: Demo with Sam Lee tomorrow");
  const a = afterEmail(v(), { held: "https://app.test/api/meetings/outcome/h", noShow: "https://app.test/api/meetings/outcome/n" });
  assert.equal(a.subject, "How did it go with Dana Lee?");
  assert.ok(a.text.includes("Held: https://app.test/api/meetings/outcome/h") && a.text.includes("No-show: https://app.test/api/meetings/outcome/n"));
});

test("book later lists the host's times in the lead's zone and links to the booking page", () => {
  const times = [at("2026-11-03", "10:00", "America/New_York"), at("2026-11-03", "14:30", "America/New_York")];
  const e = bookLaterEmail({ name: "Dana Lee", host: "Sam Lee", typeName: "Demo", times, tz: "America/New_York", link: "https://app.test/book/acme/demo?email=dana%40lead.io", now: NOW });
  assert.equal(e.subject, "Pick a time with Sam Lee");
  assert.ok(e.text.includes("- Tue, Nov 3, 10:00 AM EST") && e.text.includes("- Tue, Nov 3, 2:30 PM EST"));
  assert.ok(e.text.includes("Pick a time: https://app.test/book/acme/demo?email=dana%40lead.io"));
});

test("where: each kind of place, from the guest's side and the host's", () => {
  const o = { joinUrl: "https://zoom.us/j/1", host: "Sam", guest: "Dana", forHost: false };
  assert.deepEqual(whereOf({ kind: "zoom" }, o), { label: "Zoom", url: "https://zoom.us/j/1" });
  assert.deepEqual(whereOf({ kind: "phone_host", number: "+1 555 0100" }, o), { label: "Phone", detail: "Call +1 555 0100" });
  assert.deepEqual(whereOf({ kind: "phone_guest" }, { ...o, forHost: true, guestPhone: "+1 555 0199" }), { label: "Phone", detail: "Call Dana at +1 555 0199" });
  assert.deepEqual(whereOf({ kind: "in_person", address: "1 Main St" }, o), { label: "In person", detail: "1 Main St" });
  assert.equal(whereOf({ kind: "google_meet" }, { ...o, joinUrl: null }).url, null, "no link yet: no made-up link");
});

test("the MIME message carries text, HTML, the inline invite and the attachment, with safe headers", () => {
  const e = confirmEmail(v({ typeName: "Démo für Sie" }));
  const raw = mime({ from: { name: "Sam Lee", email: "meetings@tryclaritia.com" }, to: "dana@lead.io", replyTo: "sam@acme.com", subject: e.subject, html: e.html, text: e.text, ics: { method: "REQUEST", body: "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n" }, boundary: "b1", date: new Date(NOW) });
  const head = raw.split("\r\n\r\n")[0]!;
  assert.match(head, /^From: "Sam Lee" <meetings@tryclaritia.com>\r\nTo: dana@lead.io\r\nReply-To: sam@acme.com\r\nSubject: =\?UTF-8\?B\?/);
  assert.ok(head.includes(`Content-Type: multipart/mixed; boundary="mixed_b1"`));
  assert.ok(raw.includes("Content-Type: text/calendar; charset=UTF-8; method=REQUEST"));
  assert.ok(raw.includes(`Content-Disposition: attachment; filename="invite.ics"`));
  assert.ok(raw.includes("--alt_b1--") && raw.trimEnd().endsWith("--mixed_b1--"));
  // The subject decodes back to the original.
  const words = [...head.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)].map((m) => Buffer.from(m[1]!, "base64").toString("utf8")).join("");
  assert.equal(words, e.subject);
  for (const w of head.matchAll(/=\?UTF-8\?B\?[^?]+\?=/g)) assert.ok(w[0].length <= 75);
  // A plain email has no mixed part.
  assert.ok(mime({ from: { email: "a@b.co" }, to: "c@d.co", subject: "Hi", html: "<p>Hi</p>", text: "Hi" }).includes("multipart/alternative"));
});

test("addresses and names that could add headers are refused or flattened", () => {
  const base = { from: { email: "meetings@tryclaritia.com" }, subject: "Hi", html: "", text: "" };
  assert.throws(() => mime({ ...base, to: "dana@lead.io\r\nBcc: x@evil.com" }));
  assert.throws(() => mime({ ...base, to: "dana@lead.io", replyTo: "x@y.co>, z@evil.com" }));
  const raw = mime({ ...base, to: "dana@lead.io", from: { name: "Sam\r\nBcc: x@evil.com", email: "meetings@tryclaritia.com" }, subject: "Hi\r\nBcc: y@evil.com" });
  assert.ok(!/^Bcc:/m.test(raw));
  assert.equal(encodeHeader("plain"), "plain");
});

test("outcome links name one meeting and outcome, can't be changed, and need the key", () => {
  const meeting = "3f2a6c1e-8b9d-4e2f-a1b3-5c7d9e0f1a2b";
  const t = outcomeToken({ meeting, outcome: "no_show", nonce: "00112233aabbccdd" }, SECRET);
  assert.deepEqual(readOutcomeToken(t, SECRET), { meeting, outcome: "no_show", nonce: "00112233aabbccdd" });
  assert.equal(readOutcomeToken(t, "x".repeat(40)), null, "another key");
  // Flip one byte of the body (the meeting id): the signature no longer matches.
  const [b, mac] = t.split(".");
  const body = Buffer.from(b!, "base64url");
  body[5] ^= 1;
  assert.equal(readOutcomeToken(`${body.toString("base64url")}.${mac}`, SECRET), null);
  assert.equal(readOutcomeToken("nonsense", SECRET), null);
  assert.equal(readOutcomeToken("", SECRET), null);
});

test("the booking link carries the lead's details and a signed ref to the submission", () => {
  const sub = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const ref = bookRef(sub, NOW, SECRET);
  assert.equal(readBookRef(ref, NOW + 86_400_000, SECRET), sub);
  assert.equal(readBookRef(ref, NOW + 31 * 86_400_000, SECRET), null, "a month later it's stale");
  assert.equal(readBookRef(ref, NOW, "y".repeat(40)), null);
  const url = new URL(bookingUrl("https://app.test", { workspace: "acme", type: "demo", name: "Dana Lee", email: "dana+x@lead.io", host: "u1", ref }));
  assert.equal(url.pathname, "/book/acme/demo");
  assert.equal(url.searchParams.get("email"), "dana+x@lead.io");
  assert.equal(url.searchParams.get("name"), "Dana Lee");
  assert.equal(url.searchParams.get("ref"), ref);
});
