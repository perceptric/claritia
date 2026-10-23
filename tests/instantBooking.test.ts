// Instant booking on form submit (docs/meetings-scheduler.md Part 2): the booking token (signed, 2 hours, tied to the
// fill, the type and the owner; a forged or expired one is refused), the Claritia calendar setting in the form check,
// the inline calendar's day grouping in the visitor's zone, and the submit's booking step on its flaky cases (a lead who
// doesn't match, no times, the booking read failing). The database side is in tests/pg/instantBooking.pg.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BOOK_TTL, readBooking, signBooking, type Claim } from "../src/lib/forms/booking.ts";
import { byDay, dayKey, sampleSlots, zoneName, zones } from "../src/lib/forms/calendar.ts";
import { linkProblem, outside } from "../src/lib/forms/schedule.ts";
import { checkForm, emptyForm, type Form } from "../src/lib/forms/schema.ts";
import { acceptFill, type PublicForm } from "../src/lib/forms/submit.ts";
import type { Rpc } from "../src/lib/jobs.ts";
import { at } from "../src/lib/meetings/time.ts";
import { DEFAULT_AVAILABILITY, DEFAULT_SETTINGS } from "../src/lib/meetings/types.ts";

const SECRET = "unit-test-secret-0123456789abcdef";
const SID = "0192f3a1-0000-7000-8000-000000000001";
const TYPE = "0192f3a1-0000-7000-8000-0000000000aa";
const OWNER = "0192f3a1-0000-7000-8000-0000000000bb";
const HOST = "0192f3a1-0000-7000-8000-0000000000cc";
const NOW = at("2026-11-02", "06:00", "America/New_York");

test("a booking token reads back as what it was signed for, and nothing else gets in", () => {
  const exp = Date.now() + BOOK_TTL;
  const c: Claim = { submission: SID, type: TYPE, owner: OWNER, exp };
  const t = signBooking(c, SECRET);
  assert.ok(t.length < 200, "short enough for an address");
  assert.deepEqual(readBooking(t, SECRET), { ...c, exp: Math.floor(exp / 1000) * 1000 });
  assert.equal((readBooking(signBooking({ ...c, owner: null }, SECRET), SECRET) as Claim).owner, null);
  // Forged: another secret, a changed fill, type or owner, a changed or cut signature, junk.
  assert.equal(readBooking(t, "another-secret-0123456789abcdef"), null);
  const parts = t.split(".");
  const swap = (i: number, v: string) => parts.map((p, j) => (j === i ? v : p)).join(".");
  assert.equal(readBooking(swap(0, "0192f3a1-0000-7000-8000-000000000002"), SECRET), null, "another fill");
  assert.equal(readBooking(swap(1, OWNER), SECRET), null, "another type");
  assert.equal(readBooking(swap(2, "-"), SECRET), null, "owner dropped");
  assert.equal(readBooking(swap(3, (parseInt(parts[3]!, 36) + 3600).toString(36)), SECRET), null, "expiry pushed out");
  assert.equal(readBooking(swap(4, parts[4]!.slice(0, -1) + (parts[4]!.endsWith("A") ? "B" : "A")), SECRET), null);
  assert.equal(readBooking(swap(4, parts[4]!.slice(0, 10)), SECRET), null);
  for (const junk of ["", "a.b.c.d.e", t + ".x", 42, null, undefined, "x".repeat(400)]) assert.equal(readBooking(junk, SECRET), null);
  assert.equal(readBooking(t, undefined), null, "no secret on the server: nothing reads");
  // Expired: a real token past its two hours.
  const old = signBooking({ ...c, exp: Date.now() - 1000 }, SECRET);
  assert.equal(readBooking(old, SECRET), "expired");
  assert.equal(readBooking(t, SECRET, exp + 1000), "expired");
});

const form = (schedule: Record<string, unknown>) => ({
  ...emptyForm(),
  steps: [
    {
      id: "s1",
      fields: [
        { id: "em", key: "email", type: "email", label: "Email", required: true },
        { id: "size", key: "q.size", type: "number", label: "Team size", required: false },
      ],
    },
  ],
  spam: { minSeconds: 0, turnstile: false },
  after: { end: { kind: "message", title: "Thanks" }, schedule },
});

test("Claritia calendar needs a meeting type and takes no link; outside schedulers check as before", () => {
  const ok = checkForm(form({ tool: "claritia", meetingTypeId: TYPE, url: "https://calendly.com/x", perOwner: true, prefill: false }));
  assert.ok("form" in ok, JSON.stringify(ok));
  assert.deepEqual(ok.form.after.schedule, { tool: "claritia", url: "", perOwner: false, meetingTypeId: TYPE });
  const none = checkForm(form({ tool: "claritia", url: "", perOwner: false }));
  assert.ok("errors" in none && none.errors.includes("Booking: Pick a meeting type."));
  const bad = checkForm(form({ tool: "claritia", meetingTypeId: "nope", url: "", perOwner: false }));
  assert.ok("errors" in bad);
  const rules = checkForm(form({ tool: "claritia", meetingTypeId: TYPE, url: "", perOwner: false, who: "match", rules: [{ field: "size", op: "gte", value: "50" }] }));
  assert.ok("form" in rules && rules.form.after.schedule?.who === "match");
  const cal = checkForm(form({ tool: "calendly", url: "https://calendly.com/acme/demo", perOwner: false, meetingTypeId: TYPE }));
  assert.ok("form" in cal);
  assert.deepEqual(cal.form.after.schedule, { tool: "calendly", url: "https://calendly.com/acme/demo", perOwner: false });
  assert.ok("errors" in checkForm(form({ tool: "calendly", url: "https://cal.com/x", perOwner: false })));
  assert.ok("errors" in checkForm(form({ tool: "nope", url: "", perOwner: false })));
  assert.equal(outside("claritia"), false);
  assert.equal(outside("savvycal"), true);
  assert.equal(linkProblem("claritia", "https://calendly.com/x"), "Pick a scheduler.", "Claritia calendar never opens a link");
});

test("times group by the visitor's own day, in their zone", () => {
  // 23:30 UTC on Monday is Monday evening in New York and Tuesday morning in Tokyo.
  const late = Date.UTC(2026, 10, 2, 23, 30);
  const early = Date.UTC(2026, 10, 2, 14, 0);
  assert.deepEqual(byDay([late, early], "America/New_York"), [{ day: "2026-11-02", starts: [early, late] }]);
  assert.deepEqual(byDay([late, early], "Asia/Tokyo"), [
    { day: "2026-11-02", starts: [early] },
    { day: "2026-11-03", starts: [late] },
  ]);
  assert.equal(dayKey(late, "Asia/Tokyo"), "2026-11-03");
  assert.equal(dayKey(late, "Not/AZone"), dayKey(late, "UTC"), "a zone the browser doesn't know falls back");
  assert.equal(zoneName("America/New_York"), "America/New York");
  assert.equal(zones("Europe/Paris")[0], "Europe/Paris");
  assert.equal(new Set(zones("Europe/Paris")).size, zones("Europe/Paris").length);
});

test("the builder's sample times are weekdays from tomorrow, made without the network", () => {
  const now = new Date(2026, 9, 23, 15, 0).getTime(); // a Friday
  const s = sampleSlots(now);
  assert.ok(s.length >= 32);
  assert.ok(s.every((t) => t > now && new Date(t).getDay() !== 0 && new Date(t).getDay() !== 6));
  assert.equal(new Date(s[0]!).getDate(), 26, "Monday next");
});

// The submit's booking step over a stand-in database: the fill is saved first, whatever booking does.
function demo(schedule: Record<string, unknown>): Form {
  const r = checkForm(form({ tool: "claritia", url: "", perOwner: false, meetingTypeId: TYPE, ...schedule }));
  if ("errors" in r) throw new Error(r.errors.join(" "));
  return r.form;
}

function db(o: { slots?: boolean; ctxFails?: boolean } = {}) {
  const calls: string[] = [];
  const rpc: Rpc = async (fn) => {
    calls.push(fn);
    if (fn === "form_submit") return { data: { id: SID, contact_id: "c1" }, error: null };
    if (fn === "form_booking_ctx") {
      if (o.ctxFails) return { data: null, error: { message: "connection reset" } };
      return {
        data: {
          workspace_id: "w",
          contact_id: "c1",
          spam: false,
          email: "ana@acme.com",
          first_name: "Ana",
          last_name: null,
          owner: OWNER,
          shown_at: null,
          type: { id: TYPE, workspace_id: "w", slug: "demo", name: "Demo", kind: "one", hosts: [{ user_id: HOST }], settings: { ...DEFAULT_SETTINGS, notice: 0, window: 1 }, secret: false, active: true, owner_user_id: null, template_id: null, locked: [] },
          meeting: null,
          profiles: { [HOST]: { name: "Sam Lee", photo: "javascript:alert(1)" } },
        },
        error: null,
      };
    }
    if (fn === "meeting_inputs") {
      const a = DEFAULT_AVAILABILITY("America/New_York");
      return { data: [{ id: HOST, availability: o.slots === false ? null : a, connected: true, reconnect: false, busy: [], booked: [] }], error: null };
    }
    if (fn === "form_booking_shown") return { data: new Date().toISOString(), error: null };
    return { data: null, error: { message: `unexpected ${fn}` } };
  };
  return { rpc, calls };
}

const pub = (body: Form): PublicForm => ({ id: "0192f3a1-0000-7000-8000-0000000000ff", workspace_id: "w", version: 1, status: "live", body, tokens: {}, logo_url: null });
const send = (rpc: Rpc, body: Form, answers: Record<string, unknown>, secret = SECRET) =>
  acceptFill(rpc, pub(body), { v: 1, version: 1, key: "k".repeat(20), answers, ms: 5000, trap: "" }, { custom: [] }, { secret, now: NOW });

test("a lead who matches gets times, the host and a token for this fill; one who doesn't gets the message", async () => {
  const yes = db();
  const r = await send(yes.rpc, demo({ who: "match", rules: [{ field: "size", op: "gte", value: "50" }] }), { em: "ana@acme.com", size: "80" });
  assert.equal(r.status, 200);
  const b = r.body.booking as { token: string; slots: number[]; lengths: number[]; length: number; host?: { name: string; photo?: string } };
  assert.ok(b.slots.length > 0 && b.slots.every((s) => s >= NOW));
  assert.deepEqual([b.lengths, b.length], [[30], 30]);
  assert.deepEqual(b.host, { name: "Sam Lee" }, "a photo that isn't https is left out");
  assert.deepEqual(readBooking(b.token, SECRET), { ...(readBooking(b.token, SECRET) as Claim), submission: SID, type: TYPE, owner: OWNER });
  assert.equal(r.body.schedule, null);
  assert.deepEqual(yes.calls, ["form_submit", "form_booking_ctx", "meeting_inputs", "form_booking_shown"]);
  const no = db();
  const m = await send(no.rpc, demo({ who: "match", rules: [{ field: "size", op: "gte", value: "50" }] }), { em: "ana@acme.com", size: "5" });
  assert.equal(m.body.booking, undefined);
  assert.deepEqual(no.calls, ["form_submit"], "nothing read for a lead who doesn't match");
  const skipped = db();
  assert.equal((await send(skipped.rpc, demo({ who: "match", rules: [{ field: "size", op: "gte", value: "50" }] }), { em: "ana@acme.com" })).body.booking, undefined);
});

test("no times, a failing read or no secret: the fill is kept and the lead gets the message", async () => {
  const empty = db({ slots: false });
  const r = await send(empty.rpc, demo({}), { em: "ana@acme.com" });
  assert.equal(r.status, 200);
  assert.equal(r.body.booking, undefined);
  assert.ok(!empty.calls.includes("form_booking_shown"), "times never shown, so book later isn't queued");
  const broken = db({ ctxFails: true });
  const b = await send(broken.rpc, demo({}), { em: "ana@acme.com" });
  assert.deepEqual([b.status, b.body.id, b.body.booking], [200, SID, undefined]);
  const unsigned = db();
  const u = await send(unsigned.rpc, demo({}), { em: "ana@acme.com" }, "");
  assert.deepEqual([u.status, u.body.booking], [200, undefined]);
  assert.deepEqual(unsigned.calls, ["form_submit"]);
});
