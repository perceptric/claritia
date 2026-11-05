// Tracking (docs/integrations-plan.md, Next step 2; src/lib/forms/track.ts, src/lib/track/server.ts,
// worker-intel/jobs/track.ts): which tags get which events, consent, the ids Meta and Google dedupe on, and the
// flaky cases the reliability rule asks for: a tag that throws never stops the others or the form, Meta down for a
// while is tried again with the same event id, a repeat upload to Google Ads counts as done, and a refusal stops.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import type { Rpc } from "../src/lib/jobs.ts";
import { seal } from "../src/lib/seal.ts";
import { cleanTrack, publicForm, type Form } from "../src/lib/forms/schema.ts";
import { consentState, mayRun, metaEventId, track, trackInfo, type TrackWindow } from "../src/lib/forms/track.ts";
import { adsConversion, adsTime, clickIdOf, metaEvent, serverTracked, trackInfoFor, type TrackTake } from "../src/lib/track/server.ts";
import { trackOnce } from "../worker-intel/jobs/track.ts";

const SUB = "66666666-6666-4666-8666-666666666666";
const argsOf = (...a: unknown[]) => (function () {
  // eslint-disable-next-line prefer-rest-params
  return arguments;
})(...a);

test("Settings › Tracking keeps only well-formed ids, and the page never sees the Google Ads upload", () => {
  assert.deepEqual(cleanTrack({ ga4: " G-ABC123DEF4 ", gtm: true, pixel: "123456789012345", meta: true, ads: { id: "AW-123456789", label: "AbC-D_efG" }, upload: { customer: "123-456-7890", action: "42", login: "9876543210", name: "Lead" } }), {
    ga4: "G-ABC123DEF4",
    gtm: true,
    pixel: "123456789012345",
    meta: true,
    ads: { id: "AW-123456789", label: "AbC-D_efG" },
    upload: { customer: "1234567890", action: "42", login: "9876543210", name: "Lead" },
  });
  assert.equal(cleanTrack({ ga4: "UA-1234", pixel: "abc", ads: { id: "AW-1", label: "x" } }), undefined);
  assert.deepEqual(cleanTrack({ meta: true }), undefined, "server events need a pixel");
  const f = { steps: [], track: { ga4: "G-ABC123DEF4", upload: { customer: "1234567890", action: "42" } } } as unknown as Form;
  assert.deepEqual(publicForm(f).track, { ga4: "G-ABC123DEF4" });
  assert.ok(serverTracked({ pixel: "123456", meta: true }));
  assert.ok(!serverTracked({ ga4: "G-ABC123DEF4" }));
});

test("consent: Consent Mode decides when the page has it; strict regions load nothing of Claritia's own", () => {
  assert.equal(consentState([]), null);
  const dl = [argsOf("consent", "default", { ad_storage: "denied", analytics_storage: "denied" })];
  assert.deepEqual(consentState(dl), { analytics: false, ads: false });
  dl.push(argsOf("consent", "update", { analytics_storage: "granted" }));
  assert.deepEqual(consentState(dl), { analytics: true, ads: false });
  assert.ok(!mayRun("ads", dl, false, false));
  assert.ok(mayRun("analytics", dl, true, true), "granted wins over the region");
  assert.ok(mayRun("ads", [], false, true));
  assert.ok(!mayRun("ads", [], true, true), "no tool on the page, strict region: nothing loaded");
  assert.ok(mayRun("ads", [], true, false), "the page's own tag stays the page's");
});

/** A page in memory: what was loaded and what each tag was told. */
function page(o: { gtag?: boolean; fbq?: boolean; dataLayer?: unknown[]; throwing?: "gtag" | "fbq" } = {}) {
  const loads: string[] = [];
  const g: unknown[][] = [];
  const f: unknown[][] = [];
  const w: TrackWindow = { dataLayer: o.dataLayer ?? [] };
  if (o.gtag) w.gtag = ((...a: unknown[]) => {
    if (o.throwing === "gtag") throw new Error("blocked");
    g.push(a);
  }) as never;
  if (o.fbq) w.fbq = ((...a: unknown[]) => {
    if (o.throwing === "fbq") throw new Error("blocked");
    f.push(a);
  }) as never;
  return { w, loads, g, f, load: (src: string) => loads.push(src) };
}
const D = { formId: "f1", formName: "Book a demo", submissionId: SUB };

test("each tag gets its events: dataLayer names, generate_lead, the Ads conversion and Meta's Lead and Schedule", () => {
  const p = page({ gtag: true, fbq: true });
  const cfg = { gtm: true as const, ga4: "G-ABC123DEF4", pixel: "123456789012345", ads: { id: "AW-123456789", label: "lbl1" } };
  track(cfg, "view", { formId: "f1", formName: "Book a demo" }, false, p.w, p.load);
  track(cfg, "submit", D, false, p.w, p.load);
  track(cfg, "booked", D, false, p.w, p.load);
  assert.deepEqual((p.w.dataLayer as { event: string }[]).map((e) => e.event), ["claritia_view", "claritia_submit", "claritia_booked"]);
  assert.equal((p.w.dataLayer![1] as Record<string, unknown>).claritia_submission_id, SUB);
  const events = p.g.filter((a) => a[0] === "event").map((a) => a[1]);
  assert.deepEqual(events, ["claritia_view", "generate_lead", "conversion", "claritia_booked"]);
  assert.deepEqual(p.g.find((a) => a[1] === "conversion")![2], { send_to: "AW-123456789/lbl1", transaction_id: SUB });
  const meta = p.f.filter((a) => a[0] === "trackSingle");
  assert.deepEqual(meta.map((a) => [a[2], (a[4] as { eventID?: string }).eventID]), [["Lead", SUB], ["Schedule", `book_${SUB}`]]);
  assert.equal(metaEventId("submit", SUB), SUB);
  assert.equal(p.loads.length, 0, "the page's own tags are used");
});

test("a page with no tags gets them loaded once; Consent Mode denied loads none and tells Meta nothing", () => {
  const p = page();
  const cfg = { ga4: "G-ABC123DEF4", pixel: "123456789012345" };
  track(cfg, "view", D, false, p.w, p.load);
  track(cfg, "submit", D, false, p.w, p.load);
  assert.deepEqual(p.loads, ["https://www.googletagmanager.com/gtag/js?id=G-ABC123DEF4", "https://connect.facebook.net/en_US/fbevents.js"]);
  const denied = page({ dataLayer: [argsOf("consent", "default", { ad_storage: "denied", analytics_storage: "denied" })] });
  track(cfg, "submit", D, false, denied.w, denied.load);
  assert.deepEqual(denied.loads, []);
  assert.equal(denied.w.fbq, undefined);
  const strict = page();
  track(cfg, "submit", D, true, strict.w, strict.load);
  assert.deepEqual(strict.loads, [], "a strict region with no consent tool loads nothing");
});

test("flaky: a tag that throws never stops the other tags, or the form", () => {
  const p = page({ gtag: true, fbq: true, throwing: "gtag" });
  assert.doesNotThrow(() => track({ gtm: true, ga4: "G-ABC123DEF4", pixel: "123456789012345" }, "submit", D, false, p.w, p.load));
  assert.equal(p.f.filter((a) => a[0] === "trackSingle").length, 1, "Meta still got the Lead");
  assert.equal((p.w.dataLayer as unknown[]).length, 1, "dataLayer still got the event");
});

test("what the send tells the server: Meta's cookies, a click cookie from fbclid, and no details without consent", () => {
  const w: TrackWindow = { dataLayer: [], document: { cookie: "a=1; _fbp=fb.1.1700000000000.123456" }, location: { search: "?fbclid=AbC_123" } };
  assert.deepEqual(trackInfo(false, w, 1700000000000), { ok: true, fbp: "fb.1.1700000000000.123456", fbc: "fb.1.1700000000000.AbC_123" });
  assert.deepEqual(trackInfo(true, { dataLayer: [] }), { ok: false });
  assert.equal(trackInfoFor({ ok: false }, { strict: false }), null);
  assert.equal(trackInfoFor(undefined, { strict: true }), null, "no word from the browser in a strict region: nothing");
  assert.deepEqual(trackInfoFor({ ok: true, fbp: "fb.1.1.2", fbc: "javascript:x" }, { ip: "203.0.113.9", ua: "Mozilla", page: "https://acme.com/demo", strict: true }), { ip: "203.0.113.9", ua: "Mozilla", fbp: "fb.1.1.2", url: "https://acme.com/demo" });
});

const take = (o: Partial<TrackTake> = {}): TrackTake => ({
  workspace_id: "ws1",
  submission: { id: SUB, created_at: "2026-11-05T12:00:00.000Z", hidden: { gclid: "Cj0KCQiA_abc123XYZ" }, contact_id: "c1" },
  form: { id: "f1", name: "Book a demo" },
  track: { pixel: "123456789012345", meta: true, upload: { customer: "1234567890", action: "42", login: "9876543210" } },
  info: { ip: "203.0.113.9", ua: "Mozilla", fbp: "fb.1.1.2" },
  booked_at: "2026-11-05T12:05:00.000Z",
  contact: { id: "c1", email: "Ada@Acme.com ", phone: "+1 (555) 123-4567", first_name: "Ada", last_name: null, country: "US" },
  meta_source: "s-meta",
  ads_source: "s-ads",
  ...o,
});
const h = (v: string) => createHash("sha256").update(v).digest("hex");

test("Meta's event: hashed contact, the browser's event id, the booking's own time; Google's conversion by order id", () => {
  const lead = metaEvent(take(), "submit");
  assert.equal(lead.event_name, "Lead");
  assert.equal(lead.event_id, SUB);
  assert.deepEqual(lead.user_data.em, [h("ada@acme.com")]);
  assert.deepEqual(lead.user_data.ph, [h("15551234567")]);
  assert.deepEqual(lead.user_data.country, [h("us")]);
  assert.equal(lead.user_data.ln, undefined);
  assert.equal(lead.user_data.client_ip_address, "203.0.113.9");
  const book = metaEvent(take(), "booked");
  assert.equal(book.event_id, `book_${SUB}`);
  assert.equal(book.event_time, Date.parse("2026-11-05T12:05:00Z") / 1000);
  assert.deepEqual(clickIdOf({ first_gbraid: "0AAAAA_abcdefg" }), { gbraid: "0AAAAA_abcdefg" });
  assert.equal(clickIdOf({ gclid: "bad id!" }), null);
  assert.equal(adsTime("2026-11-05T12:00:00.000Z"), "2026-11-05 12:00:00+00:00");
  assert.deepEqual(adsConversion(take()), { gclid: "Cj0KCQiA_abc123XYZ", conversionAction: "customers/1234567890/conversionActions/42", conversionDateTime: "2026-11-05 12:00:00+00:00", orderId: SUB, consent: { adUserData: "GRANTED" } });
  assert.equal(adsConversion(take({ submission: { ...take().submission, hidden: {} } })), null);
});

/** The job's database side and the two tools, in memory. */
function world(o: { meta?: (Response | Error)[]; ads?: (Response | Error)[]; take?: Partial<TrackTake> } = {}) {
  process.env.SECRETS_KEY = "t".repeat(40);
  const logs: Record<string, unknown>[] = [];
  const sent: { url: string; body: string }[] = [];
  const sources: Record<string, unknown> = {
    "s-meta": { source: { id: "s-meta", workspace_id: "ws1", kind: "meta_ads", status: "active" }, sealed: seal(JSON.stringify({ type: "key", values: { access_token: "EAAtoken" } })), mappings: [] },
    "s-ads": { source: { id: "s-ads", workspace_id: "ws1", kind: "google_ads", status: "active" }, sealed: seal(JSON.stringify({ type: "oauth", access: "ya29", refresh: null, expiresAt: Date.now() + 3600_000 })), mappings: [] },
  };
  const rpc: Rpc = async (fn, args) => {
    if (fn === "track_take") return { data: take(o.take), error: null };
    if (fn === "source_load") return { data: sources[String(args.p_id)] ?? null, error: null };
    if (fn === "source_run_log") return (logs.push(args), { data: null, error: null });
    return { data: null, error: { message: `unexpected ${fn}` } };
  };
  const meta = [...(o.meta ?? [])],
    ads = [...(o.ads ?? [])];
  const fetcher = (async (url: string, init: RequestInit) => {
    sent.push({ url, body: String(init.body ?? "") });
    const next = (url.includes("graph.facebook.com") ? meta : ads).shift();
    if (!next) throw new Error("no more answers");
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  const d = { clean: async () => ({ custom: [] }) as never, fetcher, sleep: async () => {}, developerToken: () => "dev-token" };
  return { rpc, d, logs, sent };
}
const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200, headers: { "content-type": "application/json" } });
const down = () => new Response("down", { status: 503 });

test("flaky: Meta down for a while is tried again with the same event id; Google Ads takes the fill once", async () => {
  const w = world({ meta: [down(), down(), down(), down(), ok({ events_received: 1 })], ads: [ok({})] });
  await assert.rejects(trackOnce(w.rpc, w.d, SUB, "submit"), "four 503s in a row go back to the jobs queue");
  const r = await trackOnce(w.rpc, w.d, SUB, "submit");
  assert.deepEqual(r, { meta: { status: "done" }, ads: { status: "done" } });
  const metaBodies = w.sent.filter((s) => s.url.includes("graph.facebook.com")).map((s) => JSON.parse(s.body).data[0].event_id);
  assert.ok(metaBodies.length >= 2 && metaBodies.every((id: string) => id === SUB), "every try carries the fill's id");
  const adsCall = w.sent.find((s) => s.url.includes("googleads"))!;
  assert.match(adsCall.url, /customers\/1234567890:uploadClickConversions$/);
  assert.equal(JSON.parse(adsCall.body).conversions[0].orderId, SUB);
});

test("a repeat upload Google already has counts as done; a refusal is logged on the connection and stops", async () => {
  const dup = { partialFailureError: { message: "x", details: [{ errors: [{ errorCode: { conversionUploadError: "CLICK_CONVERSION_ALREADY_EXISTS" }, message: "Already there" }] }] } };
  const w = world({ meta: [new Response(JSON.stringify({ error: { message: "Invalid parameter" } }), { status: 400 })], ads: [ok(dup)] });
  const r = await trackOnce(w.rpc, w.d, SUB, "submit");
  assert.deepEqual(r.ads, { status: "done" });
  assert.equal(r.meta?.status, "failed");
  assert.match((r.meta as { error: string }).error, /Invalid parameter/);
  assert.ok(w.logs.some((l) => l.p_id === "s-meta" && /Invalid parameter/.test(String(l.p_error))));
});

test("a booking sends only Meta's Schedule; no click id, no connection or no server setup skips Google without a call", async () => {
  const b = world({ meta: [ok({ events_received: 1 })] });
  const r = await trackOnce(b.rpc, b.d, SUB, "booked");
  assert.deepEqual(r, { meta: { status: "done" } });
  assert.equal(JSON.parse(b.sent[0]!.body).data[0].event_name, "Schedule");
  const noClick = world({ take: { submission: { ...take().submission, hidden: {} }, track: { upload: { customer: "1234567890", action: "42" } } } });
  assert.deepEqual(await trackOnce(noClick.rpc, noClick.d, SUB, "submit"), { ads: { status: "skipped", reason: "No Google click id on this fill." } });
  const noSource = world({ take: { ads_source: null, track: { upload: { customer: "1234567890", action: "42" } } } });
  assert.equal((await trackOnce(noSource.rpc, noSource.d, SUB, "submit")).ads?.status, "skipped");
  const noToken = world({ take: { track: { upload: { customer: "1234567890", action: "42" } } } });
  assert.match(((await trackOnce(noToken.rpc, { ...noToken.d, developerToken: () => "" }, SUB, "submit")).ads as { reason: string }).reason, /isn't set up/);
  assert.equal(noClick.sent.length + noSource.sent.length + noToken.sent.length, 0);
});
