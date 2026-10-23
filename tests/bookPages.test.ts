// The public booking pages' pure parts (docs/meetings-scheduler.md 1.8 and 1.8b): what a guest is shown of a type,
// the guest's answers, new links, the embed's addresses, the kit's look, and times by day across zones.
import assert from "node:assert/strict";
import { test } from "node:test";
import { themeOf } from "../src/components/book/theme.ts";
import { bookUrl } from "../src/lib/meetings/bookElement.ts";
import { byDay, checkGuest, priceLabel, sampleSlots, toGuestType } from "../src/lib/meetings/guest.ts";
import { checkLink, preferHost } from "../src/lib/meetings/public.ts";
import { at } from "../src/lib/meetings/time.ts";
import { DEFAULT_SETTINGS, type MeetingType } from "../src/lib/meetings/types.ts";

const NOW = at("2026-11-02", "06:00", "America/New_York");
const type = (p: Partial<MeetingType> = {}): MeetingType => ({
  id: "t1", workspace_id: "w1", slug: "demo", name: "Demo", kind: "round_robin",
  hosts: [{ user_id: "11111111-1111-1111-1111-111111111111" }, { user_id: "22222222-2222-2222-2222-222222222222" }],
  settings: { ...DEFAULT_SETTINGS, lengths: [45, 15, 30], location: { kind: "phone_host", number: "+1 555 0100" } },
  secret: false, active: true, owner_user_id: null, template_id: null, locked: [], ...p,
});
const profiles = [
  { user_id: "11111111-1111-1111-1111-111111111111", slug: "sam", name: "Sam Ortiz", headline: null, photo_url: "https://x.io/s.png" },
  { user_id: "22222222-2222-2222-2222-222222222222", slug: "ana", name: "Ana Diaz", headline: null, photo_url: null },
];

test("a guest sees names, lengths in order and the kind of place, never ids, numbers or private links", () => {
  const g = toGuestType(type(), profiles);
  assert.deepEqual(g.lengths, [15, 30, 45]);
  assert.deepEqual(g.location, { kind: "phone_host" }, "the host's phone number goes in the invite only");
  assert.deepEqual(g.hosts.map((h) => h.name), ["Sam Ortiz", "Ana Diaz"]);
  assert.ok(!JSON.stringify(g).includes("1111"), "no user ids");
  const inPerson = toGuestType(type({ settings: { ...DEFAULT_SETTINGS, location: { kind: "in_person", address: "1 Main St" } } }), profiles);
  assert.equal(inPerson.location.detail, "1 Main St");
  const paid = type({ settings: { ...DEFAULT_SETTINGS, price: { amount: 5000, currency: "eur" } } });
  assert.equal(toGuestType(paid, profiles).price?.amount, 5000);
  assert.equal(toGuestType(paid, profiles, { pay: false }).price, null, "no price shown before the workspace takes payments");
  assert.match(priceLabel({ amount: 5000, currency: "eur" }), /50/);
  assert.equal(toGuestType(type({ kind: "group", settings: { ...DEFAULT_SETTINGS, seats: 20 } }), profiles).seats, 20);
});

test("guest answers: required, choices from the list, phone for a call to the guest", () => {
  const qs = [{ id: "co", label: "Company", type: "text" as const, required: true }];
  assert.deepEqual(checkGuest({ name: "A", email: "a@b.io" }, qs), { error: "Company is required.", field: "co" });
  const ok = checkGuest({ name: "A", email: "a@b.io", tz: "Mars/Base", answers: { co: "Acme" } }, qs);
  assert.ok("guest" in ok && ok.guest.tz === "UTC", "an unknown zone falls back to UTC");
  assert.deepEqual(checkGuest({ name: "A", email: "a@b.io", answers: { co: "Acme", phone: "+1 (555) 010-0100" } }, qs, { kind: "phone_guest" }), {
    guest: { email: "a@b.io", name: "A", tz: "UTC", answers: { co: "Acme", phone: "+1 (555) 010-0100" } },
  });
});

test("new links: single-use needs a type; one-off and polls need times ahead that don't overlap", () => {
  const owner = "11111111-1111-1111-1111-111111111111";
  assert.deepEqual(checkLink({ kind: "single_use" }, { owner, type: null, now: NOW }), { errors: ["Pick a meeting type."] });
  const su = checkLink({ kind: "single_use" }, { owner, type: type(), now: NOW });
  assert.ok("row" in su && su.row.type_id === "t1" && su.row.token_hash.length === 64 && !su.row.token_hash.includes(su.token));
  const past = checkLink({ kind: "one_off", offered: [{ start: NOW - 1 }], length: 30 }, { owner, type: null, now: NOW });
  assert.ok("errors" in past && past.errors.includes("Every time must be ahead."));
  const overlap = checkLink({ kind: "one_off", offered: [{ start: NOW + 3_600_000 }, { start: NOW + 3_600_000 + 15 * 60_000 }], length: 30 }, { owner, type: null, now: NOW });
  assert.ok("errors" in overlap && overlap.errors.includes("Two times overlap."));
  const poll = checkLink({ kind: "poll", offered: [{ start: NOW + 7_200_000 }, { start: NOW + 3_600_000 }, { start: NOW + 3_600_000 }], length: 30, location: { kind: "in_person", address: "HQ" } }, { owner, type: null, now: NOW });
  assert.ok("row" in poll && poll.row.offered.length === 2 && poll.row.offered[0]!.start < poll.row.offered[1]!.start, "sorted, without repeats");
  assert.deepEqual(poll.row.location, { kind: "in_person", address: "HQ" });
  const badPlace = checkLink({ kind: "poll", offered: [{ start: NOW + 7_200_000 }], location: { kind: "link", url: "http://x" } }, { owner, type: null, now: NOW });
  assert.ok("errors" in badPlace);
});

test("a booking link's host: only for kinds that pick one host, by id or page slug", () => {
  assert.equal(preferHost(type(), "ana", profiles)!.hosts.length, 1);
  assert.equal(preferHost(type(), "22222222-2222-2222-2222-222222222222", profiles)!.hosts[0]!.user_id, "22222222-2222-2222-2222-222222222222");
  assert.equal(preferHost(type({ kind: "collective" }), "ana", profiles), null, "everyone must still come");
  assert.equal(preferHost(type(), "someone-else", profiles), null);
  assert.equal(preferHost(type({ settings: { ...DEFAULT_SETTINGS, rrMode: "strict" } }), "ana", profiles)!.settings.rrMode, "flexible");
});

test("the embed only frames Claritia's own booking pages", () => {
  const base = "https://app.tryclaritia.com";
  assert.equal(bookUrl("acme/demo", base), `${base}/book/acme/demo?embed=1`);
  assert.equal(bookUrl("/book/acme", base), `${base}/book/acme?embed=1`);
  assert.equal(bookUrl(`${base}/book/acme/sam/`, base, { email: "a@b.io", name: null }), `${base}/book/acme/sam?embed=1&email=a%40b.io`);
  assert.equal(bookUrl("https://evil.com/book/acme/demo", base), null);
  assert.equal(bookUrl("acme/demo/../../api/keys", base), null);
  assert.equal(bookUrl("javascript:alert(1)", base), null);
  assert.ok(bookUrl(`${base}/book/l/${"a".repeat(24)}`, base));
});

test("the kit's look: checked values only, dark kits read as dark, Geist without a kit", () => {
  const light = themeOf(null);
  assert.match(light.vars["--clr-font"]!, /^Geist/);
  assert.equal(light.dark, false);
  const dark = themeOf({ background: "#0b0b0f", text: "#f4f4f5", accent: "#7c5cff", font: "Inter", fontUrl: "https://fonts.googleapis.com/css2?family=Inter" });
  assert.equal(dark.dark, true);
  assert.equal(dark.vars["--clr-font"], "Inter");
  assert.equal(dark.fontUrl, "https://fonts.googleapis.com/css2?family=Inter");
  const evil = themeOf({ background: "red;}body{display:none", font: "x;}*{}", fontUrl: "https://evil.com/x.css" });
  assert.equal(evil.vars["--clr-bg"], "#ffffff");
  assert.equal(evil.fontUrl, "");
  assert.ok(!Object.values(evil.vars).some((v) => v.includes("}")));
});

test("times group by the guest's own date, across the date line", () => {
  const s = [{ start: Date.UTC(2026, 10, 2, 23, 30) }, { start: Date.UTC(2026, 10, 2, 14, 0) }];
  assert.deepEqual([...byDay(s, "America/New_York").keys()], ["2026-11-02"]);
  assert.deepEqual([...byDay(s, "Asia/Tokyo").keys()], ["2026-11-02", "2026-11-03"]);
  const sample = sampleSlots(30, "Europe/Paris", NOW);
  assert.ok(sample.length > 50 && sample.every((x) => x.start > NOW));
});
