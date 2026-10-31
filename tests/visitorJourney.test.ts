// One visitor's journey in words (src/lib/visitors/journey.ts). The flaky cases: a link the stitcher ignored (never
// shown as a link), a visit with no source (Direct), events with missing titles or data.
import assert from "node:assert/strict";
import { test } from "node:test";
import { eventWords, fullName, journeyItems, sourceWords, type Visit } from "../src/lib/visitors/journey.ts";

const visit = (id: string, at: string): Visit => ({
  id, started_at: at, ended_at: at, source: null, medium: null, campaign: null, term: null, content: null, referrer_host: null, ref_class: null, landing_path: "/", country: null, region: null, city: null, device_type: null, browser: null, os: null, pageviews: 1, engaged_s: 0, events: [],
} as Visit);

test("where a visit came from", () => {
  assert.equal(sourceWords({ source: "google", medium: "cpc", referrer_host: "www.google.com", ref_class: "search" }), "google, cpc");
  assert.equal(sourceWords({ source: null, medium: null, referrer_host: "www.producthunt.com", ref_class: "referral" }), "producthunt.com");
  assert.equal(sourceWords({ source: null, medium: null, referrer_host: null, ref_class: "email" }), "Email");
  assert.equal(sourceWords({ source: null, medium: null, referrer_host: null, ref_class: null }), "Direct");
});

test("what each event says, with missing parts", () => {
  assert.equal(eventWords({ kind: "view", path: "/pricing", title: "Pricing", data: null, at: "" }), "Pricing");
  assert.equal(eventWords({ kind: "view", path: "/pricing", title: " ", data: null, at: "" }), "/pricing");
  assert.equal(eventWords({ kind: "form", path: "/demo", title: null, data: { form: "Demo request" }, at: "" }), "Sent Demo request");
  assert.equal(eventWords({ kind: "form", path: "/demo", title: null, data: null, at: "" }), "Sent a form");
  assert.equal(eventWords({ kind: "custom", path: null, title: null, data: { n: "Started trial" }, at: "" }), "Started trial");
  assert.equal(fullName({ first_name: null, last_name: null, email: "dana@acme.com" }), "dana@acme.com");
});

test("flaky: the journey is newest first, and a link the stitcher ignored never shows", () => {
  const items = journeyItems({
    sessions: [visit("s1", "2026-10-30T10:00:00Z"), visit("s2", "2026-10-31T09:00:00Z")],
    proof: [
      { source: "form", level: "asserted", at: "2026-10-31T09:05:00Z", ignored: null, email: "dana@acme.com" },
      { source: "form", level: "asserted", at: "2026-10-31T09:06:00Z", ignored: "role", email: "sales@acme.com" },
    ],
    actions: [{ kind: "meeting.booked", data: {}, at: "2026-10-31T09:07:00Z" }],
  });
  assert.deepEqual(items.map((i) => i.kind), ["action", "proof", "visit", "visit"]);
  assert.ok(!items.some((i) => i.kind === "proof" && i.proof.email === "sales@acme.com"));
});
