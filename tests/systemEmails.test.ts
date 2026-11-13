// System emails (docs/system-emails.md; src/lib/meetings/systemEmails.ts, systemSend.ts): every starting design
// builds, uses only fields its email has, and leaves no merge field unfilled; values are escaped in HTML; parts with no
// value are left out; Off works except for the emails with the invite; anything that can't be built falls back.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readEmailDoc } from "../src/lib/design/email/doc.ts";
import { MERGE } from "../src/lib/workflows/merge.ts";
import { FIELDS_FOR, HTML_FIELDS, sampleVars, SYSTEM_FIELDS, SYSTEM_KEYS, SYSTEM_META, systemDefault, systemEnsurePayload } from "../src/lib/meetings/systemEmails.ts";
import { fillFields, meetingFields, readSystemSet, systemOff, systemParts, timesFields, type SystemSet, type Vars } from "../src/lib/meetings/systemSend.ts";
import type { MeetingView } from "../src/lib/meetings/emails.ts";

const fallback = () => ({ subject: "BUILT-IN", html: "<p>built-in</p>", text: "built-in\n" });
const sample = (): Vars => {
  const s = sampleVars(Date.UTC(2026, 10, 13, 12));
  return { text: Object.fromEntries(Object.entries(s).map(([k, v]) => [k, HTML_FIELDS.includes(k as never) ? v.replace(/<br>/g, "\n").replace(/<[^>]+>/g, "") : v])), html: { answers: s.answers, open_times: s.open_times, about: s.about } };
};
const setOf = (key: (typeof SYSTEM_KEYS)[number], over: Partial<{ subject: string; doc: unknown; off: boolean }> = {}): SystemSet => {
  const d = systemDefault(key);
  return { emails: [{ key, subject: over.subject ?? d.subject, preheader: d.doc.settings.preheader, doc: over.doc ?? d.doc, off: over.off ?? false }], kits: [] };
};
const view = (o: Partial<MeetingView> = {}): MeetingView => ({
  typeName: "Demo",
  start: Date.UTC(2026, 10, 17, 15),
  end: Date.UTC(2026, 10, 17, 15, 30),
  guestName: "Dana Lee",
  guestEmail: "dana@lead.test",
  hosts: [{ name: "Sam Lee", email: "sam@acme.test" }],
  answers: [{ label: "Team size", value: "12" }],
  tz: "America/New_York",
  where: { label: "Google Meet", url: "https://meet.google.com/abc" },
  manage: "https://app.test/book/m/tok",
  brand: "Acme",
  now: Date.UTC(2026, 10, 13),
  ...o,
});

test("every starting design reads back as it is and uses only fields its email has", () => {
  for (const key of SYSTEM_KEYS) {
    const d = systemDefault(key);
    assert.deepEqual(readEmailDoc(d.doc, { allowHtml: true }), d.doc, `${key} survives the reader unchanged`);
    const used = [...JSON.stringify(d.doc).matchAll(MERGE), ...d.subject.matchAll(MERGE)].map((m) => m[1]!);
    for (const f of used) assert.ok((FIELDS_FOR[key] as string[]).includes(f), `${key} uses ${f}, which it has`);
    for (const f of FIELDS_FOR[key]) assert.ok(f in SYSTEM_FIELDS);
  }
  assert.deepEqual(systemEnsurePayload().map((r) => r.key), [...SYSTEM_KEYS]);
});

test("each starting design builds with every field filled", () => {
  for (const key of SYSTEM_KEYS) {
    const p = systemParts(setOf(key), key, sample(), fallback);
    assert.notEqual(p.subject, "BUILT-IN", key);
    assert.ok(!p.html.includes("{{") && !p.text.includes("{{") && !p.subject.includes("{{"), `${key} has no merge field left`);
    assert.ok(!p.html.includes("clr-if"), `${key} has no condition markers left`);
  }
});

test("a meeting's values: escaped in HTML, raw in the subject, lists as lines", () => {
  const v = meetingFields(view({ guestName: 'Dana "<b>" Lee', answers: [{ label: "Notes", value: "a < b\nsecond" }] }));
  assert.equal(v.text.first_name, "Dana");
  assert.equal(v.text.reschedule_link, "https://app.test/book/m/tok");
  assert.match(v.text.meeting_time!, /Tuesday, November 17 at 10:00 AM EST/);
  assert.equal(v.html.answers, "<strong>Notes</strong>: a &lt; b<br>second");
  const p = systemParts(setOf("host_booked"), "host_booked", meetingFields(view({ guestName: "<i>Eve</i>" }), { forHost: true }), fallback);
  assert.ok(p.subject.startsWith("New meeting: <i>Eve</i> on "));
  assert.ok(p.html.includes("&lt;i&gt;Eve&lt;/i&gt;") && !p.html.includes("<i>Eve</i>"));
  // The host's email never carries the guest's reschedule link.
  assert.equal(meetingFields(view(), { forHost: true }).text.reschedule_link, null);
});

test("parts with no value are left out", () => {
  const html = (o: Partial<MeetingView>, extra = {}) => systemParts(setOf("confirm"), "confirm", meetingFields(view(o), extra), fallback).html;
  assert.ok(html({}).includes("Join the meeting"));
  assert.ok(!html({ where: { label: "Phone call", detail: "+1 555 0100" } }).includes("Join the meeting"));
  assert.ok(!html({ manage: null }).includes("Reschedule or cancel"));
  assert.ok(!html({ answers: [] }).includes("Your answers"));
  const cancel = (reason: string | null) => systemParts(setOf("cancel"), "cancel", meetingFields(view(), { reason, bookLink: null }), fallback).html;
  assert.ok(cancel("Busy").includes("Reason: Busy") && !cancel(null).includes("Reason:"));
  assert.ok(!cancel(null).includes("Book a new time"));
});

test("the reminder says the time left; pick-a-time lists the open times", () => {
  const r = systemParts(setOf("reminder"), "reminder", meetingFields(view(), { timeLeft: "in 1 hour" }), fallback);
  assert.equal(r.subject, "Reminder: Demo with Sam Lee in 1 hour");
  const t = systemParts(setOf("book_later"), "book_later", timesFields({ name: "Dana", host: "Sam Lee", typeName: "Demo", times: [Date.UTC(2026, 10, 17, 15)], tz: "UTC", link: "https://app.test/book/x" }), fallback);
  assert.ok(t.html.includes("Tue, Nov 17, 3:00 PM UTC") && t.html.includes("https://app.test/book/x"));
  const none = systemParts(setOf("book_later"), "book_later", timesFields({ name: "Dana", host: "Sam Lee", typeName: "Demo", times: [], tz: "UTC", link: "https://app.test/book/x" }), fallback);
  assert.ok(!none.html.includes("Open times"));
});

test("Off turns an email off, except the ones with the calendar invite", () => {
  for (const key of SYSTEM_KEYS) assert.equal(systemOff(setOf(key, { off: true }), key), !SYSTEM_META[key].required, key);
  assert.equal(systemOff(null, "reminder"), false);
  assert.ok(SYSTEM_META.confirm.required && SYSTEM_META.update.required && SYSTEM_META.cancel.required);
});

test("anything that can't be built sends the built-in email", () => {
  assert.equal(systemParts(null, "confirm", sample(), fallback).subject, "BUILT-IN");
  assert.equal(systemParts(setOf("confirm", { doc: { v: 1, sections: [] } }), "confirm", sample(), fallback).subject, "BUILT-IN");
  assert.equal(systemParts(setOf("confirm", { subject: "   " }), "confirm", sample(), fallback).subject, "BUILT-IN", "an empty subject");
  assert.equal(systemParts(setOf("confirm", { doc: "nonsense" }), "confirm", sample(), fallback).subject, "BUILT-IN");
  assert.equal(systemParts(setOf("confirm"), "confirm", () => { throw new Error("bad values"); }, fallback).subject, "BUILT-IN");
  assert.equal(readSystemSet(null), null);
  assert.deepEqual(readSystemSet({ emails: [{ key: "nope" }, { key: "reminder", subject: "x", doc: {}, off: true }] })!.emails.map((e) => [e.key, e.off]), [["reminder", true]]);
});

test("unknown fields take their fallback; a footer's unsubscribe link is left out", () => {
  assert.equal(fillFields("Hi {{nickname|friend}} {{first_name|there}}", { text: { first_name: "" }, html: {} }, false), "Hi friend there");
  const footer = { v: 1, settings: { preheader: "" }, sections: [{ id: "s1", columns: [{ id: "c1", width: 100, blocks: [{ id: "t1", type: "text", html: "<p>Hello</p>" }, { id: "f1", type: "footer", text: "Acme" }] }] }] };
  const p = systemParts(setOf("confirm", { doc: footer }), "confirm", sample(), fallback);
  assert.ok(p.html.includes("Hello") && !p.html.includes("unsubscribe") && !p.html.includes("Unsubscribe"));
  assert.ok(!p.text.includes("Unsubscribe"));
});

test("the System emails open as their own group on Emails", async () => {
  const { emailsPage } = await import("../src/lib/nav.ts");
  assert.deepEqual(emailsPage("campaigns/group/system"), { page: "campaigns", id: "campaigns/group/system", group: "system" });
});

test("the meeting band keeps its date tile beside the details on a phone", () => {
  const p = systemParts(setOf("confirm"), "confirm", sample(), fallback);
  const band = systemDefault("confirm").doc.sections.find((s) => s.columns.length === 2 && !s.stackOnPhone)!;
  for (const c of band.columns) assert.ok(p.html.includes(`.clr-k${c.id}{max-width:${c.width}%!important}`), `column ${c.id} keeps ${c.width}% on a phone`);
  assert.ok(p.html.includes(">Nov<") && p.html.includes(">14<"), "the tile says the month and day");
});
