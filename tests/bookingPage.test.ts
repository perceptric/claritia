import { test } from "node:test";
import assert from "node:assert/strict";
import { canQuickBook, knownAnswers } from "../src/lib/meetings/known.ts";
import { heldByOthers, holdToken, holds, releaseHold, takeHold, withoutHeld } from "../src/lib/meetings/holds.ts";
import { cleanLines } from "../src/lib/meetings/check.ts";
import { toGuestType, type Question } from "../src/lib/meetings/guest.ts";
import { DEFAULT_SETTINGS } from "../src/lib/meetings/types.ts";
import type { Rpc } from "../src/lib/jobs.ts";

// The booking page, round 2 (docs/booking-page-plan.md): what a form fill already answered, one-click booking from
// the time, holds that never block a booking when the database can't answer, and the host card's data.

const questions: Question[] = [
  { id: "size", label: "Team size", type: "choice", required: true, options: ["1-10", "11-50", "51+"] },
  { id: "goal", label: "What's your goal?", type: "text", required: false },
  { id: "news", label: "Send me news", type: "checkbox", required: false },
];

test("a form fill's answers fill the meeting's questions by label, and bad ones are left for the guest", () => {
  const k = knownAnswers(questions, [
    { label: "team SIZE", value: "11-50" },
    { label: "What is your goal", value: "Grow" },
    { label: "Send me news!", value: true },
    { label: "Unrelated", value: "x" },
  ]);
  assert.deepEqual(k, { size: "11-50", news: "Yes" });
  // A choice that isn't on the list isn't taken.
  assert.deepEqual(knownAnswers(questions, [{ label: "Team size", value: "5000" }]), {});
  // A phone call takes the fill's phone field.
  assert.deepEqual(knownAnswers([], [{ key: "phone", label: "Mobile", value: "+84 90 123 4567" }], { kind: "phone_guest" }), { phone: "+84 90 123 4567" });
  assert.deepEqual(knownAnswers([], [{ key: "phone", value: "call me" }], { kind: "phone_guest" }), {});
});

test("one click books only when the page knows the name, the email and every required answer", () => {
  const base = { name: "Lee Park", email: "lee@acme.com", questions, location: { kind: "google_meet" as const }, paid: false };
  assert.equal(canQuickBook({ ...base, known: { size: "1-10" } }), true);
  assert.equal(canQuickBook({ ...base, known: {} }), false, "a required answer is missing");
  assert.equal(canQuickBook({ ...base, email: "lee@", known: { size: "1-10" } }), false);
  assert.equal(canQuickBook({ ...base, name: " ", known: { size: "1-10" } }), false);
  assert.equal(canQuickBook({ ...base, paid: true, known: { size: "1-10" } }), false, "paid types go through checkout");
  assert.equal(canQuickBook({ ...base, questions: [], location: { kind: "phone_guest" }, known: {} }), false, "a phone call needs the number");
});

test("hold tokens are hashed and only well-formed ones count", () => {
  const t = holdToken("a1b2c3d4e5f6a7b8c9d0");
  assert.match(t ?? "", /^[0-9a-f]{64}$/);
  assert.equal(holdToken("a1b2c3d4e5f6a7b8c9d0"), t);
  assert.equal(holdToken("short"), null);
  assert.equal(holdToken("has spaces in it 1234"), null);
  assert.equal(holdToken(42), null);
  assert.equal(holds("group"), false);
  assert.equal(holds("one"), true);
});

test("holds fail open: a database that errors or throws never hides a time or blocks a booking", async () => {
  const erroring: Rpc = async () => ({ data: null, error: { message: "timeout" } });
  const throwing: Rpc = async () => {
    throw new Error("ECONNRESET");
  };
  for (const rpc of [erroring, throwing]) {
    assert.deepEqual([...(await heldByOthers(rpc, "t", "x"))], []);
    assert.equal(await takeHold(rpc, "t", 1, "x"), null);
    await releaseHold(rpc, "x");
  }
  // A database that answers: the held starts leave the list, nothing else does.
  const answering: Rpc = async (fn) => ({ data: fn === "slot_holds_taken" ? [2000, "bad"] : true, error: null });
  const held = await heldByOthers(answering, "t", "x");
  assert.deepEqual([...held], [2000]);
  assert.deepEqual(withoutHeld([{ start: 1000 }, { start: 2000 }, { start: 3000 }], held), [{ start: 1000 }, { start: 3000 }]);
  assert.equal(await takeHold(answering, "t", 1, "x"), true);
  // Someone else holds it.
  assert.equal(await takeHold(async () => ({ data: false, error: null }), "t", 1, "x"), false);
});

test("agenda and prep lines are cleaned, and the guest sees hosts' zones and headlines", () => {
  assert.deepEqual(cleanLines([" Goals ", "", "\u0007Tour", 3, ...Array(10).fill("x")]), ["Goals", "Tour", "x", "x", "x", "x", "x", "x"]);
  assert.deepEqual(cleanLines("nope"), []);
  const t = toGuestType(
    { slug: "intro", name: "Intro", kind: "one", hosts: [{ user_id: "u1" }] as never, settings: { ...DEFAULT_SETTINGS, agenda: ["Goals", " "], prep: ["Bring numbers"] } },
    [{ user_id: "u1", slug: "v", name: "Vincent", headline: " Founder ", photo_url: null, tz: "Asia/Ho_Chi_Minh" }],
  );
  assert.deepEqual(t.agenda, ["Goals"]);
  assert.deepEqual(t.prep, ["Bring numbers"]);
  assert.deepEqual(t.hosts[0], { name: "Vincent", photo: null, slug: "v", tz: "Asia/Ho_Chi_Minh", headline: "Founder" });
  // A zone that isn't one is dropped.
  const bad = toGuestType({ slug: "i", name: "I", kind: "one", hosts: [{ user_id: "u1" }] as never, settings: DEFAULT_SETTINGS }, [{ user_id: "u1", slug: "v", name: "V", headline: null, photo_url: null, tz: "Mars/Base" }]);
  assert.equal(bad.hosts[0]!.tz, undefined);
});

// The plain-words box (src/lib/meetings/when.ts). Today is Friday, 13 November 2026.
import { parseWhen, readWhen, slotsIn } from "../src/lib/meetings/when.ts";

test("common phrases are read without the model", () => {
  const T = "2026-11-13";
  assert.deepEqual(parseWhen("next Tuesday afternoon", T), { from: "2026-11-17", to: "2026-11-17", after: 720, before: 1020 });
  assert.deepEqual(parseWhen("tomorrow morning", T), { from: "2026-11-14", to: "2026-11-14", before: 720 });
  assert.deepEqual(parseWhen("Friday", T), { from: "2026-11-20", to: "2026-11-20" }, "today's own name is a week out");
  assert.deepEqual(parseWhen("next week", T), { from: "2026-11-16", to: "2026-11-22" });
  assert.deepEqual(parseWhen("next week", T, true), { from: "2026-11-15", to: "2026-11-21" });
  assert.deepEqual(parseWhen("this week after 3pm", T), { from: "2026-11-13", to: "2026-11-15", after: 900 });
  assert.deepEqual(parseWhen("after 3", T), { from: T, to: "2027-11-13", after: 900 });
  assert.deepEqual(parseWhen("before 10:30am on Monday", T), { from: "2026-11-16", to: "2026-11-16", before: 630 });
  assert.deepEqual(parseWhen("Nov 20 around 2pm", T), { from: "2026-11-20", to: "2026-11-20", after: 780, before: 900 });
  assert.deepEqual(parseWhen("3rd of jan", T), { from: "2027-01-03", to: "2027-01-03" }, "a date gone by this year is next year's");
  assert.deepEqual(parseWhen("between 9 and 11am tomorrow", T), { from: "2026-11-14", to: "2026-11-14", after: 540, before: 660 });
  assert.deepEqual(parseWhen("asap", T), { from: T, to: "2027-11-13" });
  assert.deepEqual(parseWhen("in 2 days", T), { from: "2026-11-15", to: "2026-11-15" });
  assert.deepEqual(parseWhen("this weekend", T), { from: "2026-11-14", to: "2026-11-15" });
  // Words this can't read go to the model.
  assert.equal(parseWhen("the week after thanksgiving", T), null);
  assert.equal(parseWhen("whenever the moon is full", T), null);
  assert.equal(parseWhen("", T), null);
});

test("the model's answer is checked before it's used", () => {
  const T = "2026-11-13";
  assert.deepEqual(readWhen({ from: "2026-11-30", to: "2026-12-04", after: 600, before: null }, T), { from: "2026-11-30", to: "2026-12-04", after: 600 });
  assert.deepEqual(readWhen({ from: "2026-11-01", to: "2026-11-20" }, T), { from: T, to: "2026-11-20" }, "never before today");
  assert.equal(readWhen({ from: "2026-12-04", to: "2026-11-30" }, T), null);
  assert.equal(readWhen({ none: true }, T), null);
  assert.equal(readWhen({ from: "2030-01-01" }, T), null, "too far out");
  assert.deepEqual(readWhen({ from: T, after: 900, before: 600 }, T), { from: T, to: T, after: 900 }, "a before earlier than after is dropped");
});

test("a range keeps the times it covers, in the guest's zone", () => {
  // 9:00, 13:30 and 18:00 in Ho Chi Minh City on 17 November.
  const s = [{ start: Date.parse("2026-11-17T02:00:00Z") }, { start: Date.parse("2026-11-17T06:30:00Z") }, { start: Date.parse("2026-11-17T11:00:00Z") }, { start: Date.parse("2026-11-18T06:30:00Z") }];
  assert.deepEqual(slotsIn(s, { from: "2026-11-17", to: "2026-11-17", after: 720, before: 1020 }, "Asia/Ho_Chi_Minh"), [s[1]]);
  assert.equal(slotsIn(s, { from: "2026-11-17", to: "2026-11-18" }, "Asia/Ho_Chi_Minh").length, 4);
});

// The guest's own calendar (src/lib/meetings/overlay.ts).
import { clashes, cleanBusy, googleBusy, microsoftBusy, overlayOrigins } from "../src/lib/meetings/overlay.ts";

test("busy times are cleaned, merged and checked against a meeting's length", () => {
  const h = 3_600_000;
  assert.deepEqual(cleanBusy([[3 * h, 4 * h], [h, 2 * h], [1.5 * h, 2.5 * h], ["x", 1], [5 * h, 4 * h], "bad"]), [[h, 2.5 * h], [3 * h, 4 * h]]);
  const busy = cleanBusy([[10 * h, 11 * h]]);
  assert.equal(clashes(busy, 9.5 * h, 30), false, "ends as the busy time starts");
  assert.equal(clashes(busy, 9.5 * h, 45), true);
  assert.equal(clashes(busy, 11 * h, 30), false);
  assert.equal(clashes([], 10 * h, 30), false);
});

test("Google's and Microsoft's answers become busy spans; free events don't count", () => {
  assert.deepEqual(googleBusy({ calendars: { primary: { busy: [{ start: "2026-11-17T02:00:00Z", end: "2026-11-17T03:00:00Z" }] } } }), [[Date.parse("2026-11-17T02:00:00Z"), Date.parse("2026-11-17T03:00:00Z")]]);
  assert.deepEqual(googleBusy(null), []);
  assert.deepEqual(
    microsoftBusy([
      { showAs: "busy", start: { dateTime: "2026-11-17T02:00:00.0000000" }, end: { dateTime: "2026-11-17T03:00:00.0000000" } },
      { showAs: "free", start: { dateTime: "2026-11-17T05:00:00" }, end: { dateTime: "2026-11-17T06:00:00" } },
    ]),
    [[Date.parse("2026-11-17T02:00:00Z"), Date.parse("2026-11-17T03:00:00Z")]],
  );
});

test("busy times only ever go back to the app's and the booking site's own pages", () => {
  assert.deepEqual(overlayOrigins("https://app.tryclaritia.com"), ["https://app.tryclaritia.com", "https://tryclaritia.com"]);
  assert.deepEqual(overlayOrigins("http://localhost:3000"), ["http://localhost:3000"]);
});
