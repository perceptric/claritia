// Next step 12 of docs/integrations-plan.md: Webex and Whereby for meeting places, PayPal and Square for payments.
// Every tool is a fake here. The flaky cases: a link that fails to make (the booking stays and the job tries again,
// and a retry never makes a second meeting), a capture that times out (read back before it counts), a webhook with
// a bad signature (refused), and a page that says it paid (only the provider's own answer counts).
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { checkForm, emptyForm, type Field, type Form } from "../src/lib/forms/schema.ts";
import type { Job, Rpc } from "../src/lib/jobs.ts";
import type { FullProvider } from "../src/lib/meetings/providers/index.ts";
import { webexClient, wherebyClient, type VideoClient } from "../src/lib/meetings/video.ts";
import { matches, readReturn, returnUrl, settleForm, settleMeeting, startFormPay, startMeetingPay } from "../src/lib/pay/flow.ts";
import { fromDecimal, paypalClient, paypalOrderOf, paypalVerify, squareClient, squareOrderOf, squareSignatureOk, toDecimal, type PayClient, type PayState } from "../src/lib/pay/providers.ts";
import { makeCtx } from "../src/lib/sources/ctx.ts";
import type { Creds, SourceRow } from "../src/lib/sources/types.ts";
import { meetingSync } from "../worker-intel/jobs/calendars.ts";

const SECRET = "test-secret-key-0123456789abcdef0123456789";
const BASE = "https://app.tryclaritia.com";
const SID = "0192f3a1-0000-7000-8000-00000000aaaa";
const MID = "0192f3a1-0000-7000-8000-00000000bbbb";

type Call = { url: string; method: string; body: string; headers: Headers };
/** A fake network: each answer in turn (a Response, a function of the call, or an Error to throw). */
function net(answers: (Response | Error | ((c: Call) => Response))[]) {
  const calls: Call[] = [];
  const list = [...answers];
  const fetcher = (async (url: string, init: RequestInit = {}) => {
    const c = { url: String(url), method: init.method ?? "GET", body: String(init.body ?? ""), headers: new Headers(init.headers) };
    calls.push(c);
    const a = list.shift();
    if (!a) throw new Error(`no answer left for ${c.method} ${c.url}`);
    if (a instanceof Error) throw a;
    return typeof a === "function" ? a(c) : a;
  }) as typeof fetch;
  return { calls, fetcher };
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
const src = (kind: string): SourceRow => ({ id: "s1", workspace_id: "ws1", kind, name: kind, account: null, status: "active", settings: {}, cursors: {}, push_cursor: null });
const ctx = (kind: string, creds: Creds, fetcher: typeof fetch) => makeCtx({ source: src(kind), creds, fetcher, sleep: async () => undefined });
const OAUTH: Creds = { type: "oauth", access: "wx-token", refresh: "wx-refresh", expiresAt: Date.now() + 3_600_000 };
const START = Date.UTC(2026, 10, 2, 15);
const END = Date.UTC(2026, 10, 2, 15, 30);

// Webex and Whereby ----------------------------------------------------------------------------------------------

test("Webex: a meeting per booking, moved with PATCH and taken down with DELETE", async () => {
  const n = net([json({ id: "wx1", webLink: "https://acme.webex.com/meet/wx1" }), json({}), new Response(null, { status: 204 }), json({ message: "gone" }, 404)]);
  const c = webexClient(ctx("webex", OAUTH, n.fetcher));
  assert.deepEqual(await c.create({ topic: "Intro call with Dana", start: START, end: END }), { id: "wx1", joinUrl: "https://acme.webex.com/meet/wx1" });
  const made = n.calls[0]!;
  assert.equal(made.method, "POST");
  assert.equal(made.url, "https://webexapis.com/v1/meetings");
  assert.equal(made.headers.get("authorization"), "Bearer wx-token");
  assert.deepEqual(JSON.parse(made.body), { title: "Intro call with Dana", start: "2026-11-02T15:00:00Z", end: "2026-11-02T15:30:00Z", timezone: "UTC", enabledAutoRecordMeeting: false, allowAnyUserToBeCoHost: false });
  assert.equal(await c.move("wx1", START + 3_600_000, END + 3_600_000, "Intro call with Dana"), null, "the same meeting moves, so the link stays");
  assert.equal(n.calls[1]!.method, "PATCH");
  assert.equal(JSON.parse(n.calls[1]!.body).start, "2026-11-02T16:00:00Z");
  await c.cancel("wx1");
  assert.equal(n.calls[2]!.method, "DELETE");
  await c.cancel("wx1"); // Already gone: no error.
});

test("Whereby: a room that ends an hour after the meeting, on the team's key; a move makes a new room", async () => {
  const n = net([json({ meetingId: 123, roomUrl: "https://acme.whereby.com/r1" }), json({ meetingId: 456, roomUrl: "https://acme.whereby.com/r2" }), new Response(null, { status: 204 })]);
  const c = wherebyClient(ctx("whereby", { type: "key", values: { api_key: "wb-key" } }, n.fetcher));
  assert.deepEqual(await c.create({ topic: "Intro", start: START, end: END }), { id: "123", joinUrl: "https://acme.whereby.com/r1" });
  const made = n.calls[0]!;
  assert.equal(made.url, "https://api.whereby.dev/v1/meetings");
  assert.equal(made.headers.get("authorization"), "Bearer wb-key");
  assert.deepEqual(JSON.parse(made.body), { startDate: "2026-11-02T15:00:00Z", endDate: "2026-11-02T16:30:00Z", isLocked: false, roomMode: "normal" });
  assert.deepEqual(await c.move("123", START + 86_400_000, END + 86_400_000, "Intro"), { id: "456", joinUrl: "https://acme.whereby.com/r2" });
  assert.equal(n.calls[2]!.method, "DELETE");
  assert.equal(n.calls[2]!.url, "https://api.whereby.dev/v1/meetings/123");
});

test("flaky: a Webex hiccup is tried again on its own; one that lasts throws so the job tries again", async () => {
  const n = net([json({ message: "busy" }, 503), json({ id: "wx2", webLink: "https://acme.webex.com/meet/wx2" })]);
  assert.equal((await webexClient(ctx("webex", OAUTH, n.fetcher)).create({ topic: "Call", start: START, end: END })).id, "wx2");
  const down = net([json({}, 503), json({}, 503), json({}, 503), json({}, 503)]);
  await assert.rejects(() => webexClient(ctx("webex", OAUTH, down.fetcher)).create({ topic: "Call", start: START, end: END }));
});

// The calendar job with a Webex or Whereby place, over a fake database, calendar and video tool.
function world(kind: "webex" | "whereby", o: { connected?: boolean } = {}) {
  const events: { where?: string; conference?: boolean }[] = [];
  const saves: Record<string, unknown>[] = [];
  const failed: unknown[] = [];
  let videoCalls = 0;
  let videoFails = 0;
  let calendarFails = 0;
  const cal = { id: "acc1", workspace_id: "w", user_id: "u1", provider: "google", account_email: "lee@team.io", status: "ok", channels: {}, watch_due: null, sealed: null, lists: [], write: "primary" };
  const meeting = {
    id: "0192f3a1-0000-7000-8000-000000000001",
    workspace_id: "w",
    guest_email: "dana@acme.com",
    guest_name: "Dana Lee",
    answers: {},
    start_at: new Date(START).toISOString(),
    end_at: new Date(END).toISOString(),
    status: "booked",
    location: { kind } as Record<string, unknown>,
    events: {} as Record<string, unknown>,
  };
  const rpc: Rpc = async (fn, args) => {
    if (fn === "meeting_sync_lease") return { data: true, error: null };
    if (fn === "meeting_sync_inputs") return { data: { meeting: structuredClone(meeting), title: "Intro call", questions: [], hosts: [{ user_id: "u1", email: "lee@team.io", cal, zoom: null }], group: false, session: [], anchor: null, sharing: [] }, error: null };
    if (fn === "workspace_source") return { data: o.connected === false ? null : "src-video", error: null };
    if (fn === "meeting_calendar_save") {
      saves.push(args);
      meeting.events = { ...meeting.events, ...(args.p_events as object) };
      const url = (args.p_location as { url?: string })?.url;
      if (url) meeting.location = { ...meeting.location, url };
      return { data: null, error: null };
    }
    if (fn === "meeting_calendar_failed") failed.push(args.p_detail);
    return { data: null, error: null };
  };
  const video: VideoClient = {
    async create() {
      videoCalls++;
      if (videoFails > 0) {
        videoFails--;
        throw new Error(`${kind}: answered 503`);
      }
      return { id: `v${videoCalls}`, joinUrl: `https://acme.${kind}.com/v${videoCalls}` };
    },
    async move() {
      return null;
    },
    async cancel() {},
  };
  const provider = {
    async create(_c: string, e: { where?: string; conference?: boolean }) {
      if (calendarFails > 0) {
        calendarFails--;
        throw new Error("calendar answered 503");
      }
      events.push({ where: e.where, conference: e.conference });
      return { id: `ev_${events.length}`, joinUrl: e.conference ? "https://meet.google.com/abc-defg-hij" : undefined };
    },
    async update() {},
    async cancel() {},
  } as unknown as FullProvider;
  const run = meetingSync(rpc, { provider: () => provider, video: () => video, base: BASE, secret: SECRET });
  const job = (attempts: number): Job => ({ id: `j${attempts}`, workspace_id: "w", kind: "meeting_sync", key: "create:m", payload: { meeting: meeting.id, action: "create" }, attempts, max_attempts: 5 });
  return {
    events,
    saves,
    failed,
    meeting,
    calls: () => videoCalls,
    failVideo: (n: number) => void (videoFails = n),
    failCalendar: (n: number) => void (calendarFails = n),
    sync: (attempts = 1) => run(job(attempts), new AbortController().signal),
  };
}

for (const kind of ["webex", "whereby"] as const) {
  test(`${kind}: the booking's link is its own meeting, on the event and the meeting`, async () => {
    const w = world(kind);
    await w.sync();
    assert.equal(w.events.length, 1);
    assert.equal(w.events[0]!.where, `https://acme.${kind}.com/v1`);
    assert.equal(w.events[0]!.conference, false, "no second video link from the calendar");
    assert.equal(w.meeting.location.url, `https://acme.${kind}.com/v1`);
    assert.deepEqual((w.meeting.events.u1 as { video: unknown }).video, { kind, source: "src-video", id: "v1", url: `https://acme.${kind}.com/v1` });
  });

  test(`flaky ${kind}: the link fails to make, the booking stays and the job tries again`, async () => {
    const w = world(kind);
    w.failVideo(1);
    await assert.rejects(() => w.sync(1), (e: Error & { retryAfterS?: number }) => /answered 503/.test(e.message));
    assert.equal(w.events.length, 0);
    assert.equal(w.failed.length, 0, "not marked failed while tries are left");
    await w.sync(2);
    assert.equal(w.events.length, 1);
    assert.equal(w.events[0]!.where, `https://acme.${kind}.com/v2`);
  });

  test(`flaky ${kind}: the calendar fails after the link was made, the retry uses the same link`, async () => {
    const w = world(kind);
    w.failCalendar(1);
    await assert.rejects(() => w.sync(1));
    await w.sync(2);
    assert.equal(w.calls(), 1, "one meeting on the video tool, never two");
    assert.equal(w.events[0]!.where, `https://acme.${kind}.com/v1`);
  });
}

test("flaky: the last try fails, the booking stands and the history says the link failed", async () => {
  const w = world("webex");
  w.failVideo(9);
  await assert.rejects(() => w.sync(5));
  assert.equal(w.failed.length, 1);
  assert.equal(w.meeting.status, "booked");
});

test("not connected: the calendar's own video link stands in", async () => {
  const w = world("whereby", { connected: false });
  await w.sync();
  assert.equal(w.calls(), 0);
  assert.equal(w.events[0]!.conference, true);
});

// PayPal and Square ----------------------------------------------------------------------------------------------

const PAYPAL = { client_id: "pp-id", client_secret: "pp-secret", mode: "sandbox" };
const ppToken = () => json({ access_token: "pp-token", expires_in: 32400 });
const ppOrder = (o: { status: string; ref?: string; value?: string; captured?: boolean }) => ({
  id: "ORDER1",
  status: o.status,
  purchase_units: [
    {
      custom_id: o.ref ?? `f:${SID}`,
      amount: { currency_code: "USD", value: o.value ?? "37.50" },
      ...(o.captured ? { payments: { captures: [{ id: "CAP1", status: "COMPLETED", amount: { currency_code: "USD", value: o.value ?? "37.50" } }] } } : {}),
    },
  ],
  links: [{ rel: "payer-action", href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER1" }],
});

test("amounts: the server's cents as each tool's decimal, and back", () => {
  assert.equal(toDecimal(3750, "usd"), "37.50");
  assert.equal(toDecimal(5000, "jpy"), "5000");
  assert.equal(fromDecimal("37.50", "USD"), 3750);
  assert.equal(fromDecimal("5000", "JPY"), 5000);
});

test("PayPal: an order for the server's amount with return and cancel addresses and a request id", async () => {
  const n = net([ppToken(), json(ppOrder({ status: "PAYER_ACTION_REQUIRED" }), 201)]);
  const c = paypalClient({ ...PAYPAL, client_id: "pp-id-1" }, { fetcher: n.fetcher });
  const made = await c.create({ ref: { kind: "form", id: SID }, name: "Workshop", amount: 3750, currency: "usd", email: null, successUrl: `${BASE}/ok`, cancelUrl: `${BASE}/no` });
  assert.deepEqual(made, { id: "ORDER1", url: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER1" });
  assert.equal(n.calls[0]!.url, "https://api-m.sandbox.paypal.com/v1/oauth2/token");
  const o = n.calls[1]!;
  assert.equal(o.url, "https://api-m.sandbox.paypal.com/v2/checkout/orders");
  assert.equal(o.headers.get("authorization"), "Bearer pp-token");
  assert.equal(o.headers.get("paypal-request-id"), `order-f:${SID}`);
  const body = JSON.parse(o.body);
  assert.equal(body.intent, "CAPTURE");
  assert.deepEqual(body.purchase_units[0].amount, { currency_code: "USD", value: "37.50" });
  assert.equal(body.payment_source.paypal.experience_context.return_url, `${BASE}/ok`);
  assert.equal(body.payment_source.paypal.experience_context.cancel_url, `${BASE}/no`);
});

test("flaky PayPal: a capture that times out is read back with GET before it counts", async () => {
  const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
  const n = net([ppToken(), timeout, json(ppOrder({ status: "COMPLETED", captured: true }))]);
  const s = await paypalClient({ ...PAYPAL, client_id: "pp-id-2" }, { fetcher: n.fetcher }).settle("ORDER1");
  assert.equal(n.calls[1]!.url, "https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER1/capture");
  assert.equal(n.calls[1]!.headers.get("paypal-request-id"), "capture-ORDER1");
  assert.equal(n.calls[2]!.method, "GET");
  assert.equal(n.calls[2]!.url, "https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER1");
  assert.deepEqual(s, { paid: true, state: "COMPLETED", amount: 3750, currency: "usd", ref: { kind: "form", id: SID }, capture: "CAP1" });
  // Timed out and never captured: still open, never paid.
  const open = net([ppToken(), timeout, json(ppOrder({ status: "APPROVED" }))]);
  assert.equal((await paypalClient({ ...PAYPAL, client_id: "pp-id-3" }, { fetcher: open.fetcher }).settle("ORDER1")).paid, false);
});

test("PayPal webhook: a bad signature is refused, and without the webhook's id nothing is believed", async () => {
  const headers = new Headers({ "paypal-transmission-id": "t1", "paypal-transmission-sig": "sig", "paypal-transmission-time": "now", "paypal-auth-algo": "SHA256withRSA", "paypal-cert-url": "https://api.paypal.com/cert" });
  const event = { event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { supplementary_data: { related_ids: { order_id: "ORDER1" } } } };
  const bad = net([ppToken(), json({ verification_status: "FAILURE" })]);
  assert.equal(await paypalVerify({ ...PAYPAL, webhook_id: "WH1" }, headers, event, { fetcher: bad.fetcher }), false);
  assert.equal(JSON.parse(bad.calls[1]!.body).webhook_id, "WH1");
  const good = net([ppToken(), json({ verification_status: "SUCCESS" })]);
  assert.equal(await paypalVerify({ ...PAYPAL, webhook_id: "WH1" }, headers, event, { fetcher: good.fetcher }), true);
  assert.equal(await paypalVerify(PAYPAL, headers, event, { fetcher: net([]).fetcher }), false, "no webhook id: refused without a call");
  assert.equal(await paypalVerify({ ...PAYPAL, webhook_id: "WH1" }, new Headers(), event, { fetcher: net([]).fetcher }), false, "no signature: refused");
  assert.equal(paypalOrderOf(event), "ORDER1");
  assert.equal(paypalOrderOf({ event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: "ORDER2" } }), "ORDER2");
  assert.equal(paypalOrderOf({ event_type: "BILLING.PLAN.CREATED", resource: { id: "X" } }), null);
});

const SQUARE = { access_token: "sq-token", location_id: "LOC1", env: "sandbox" };

test("Square: a payment link for the server's amount; its order is what's checked back", async () => {
  const n = net([json({ payment_link: { id: "PL1", url: "https://square.link/u/abc", order_id: "SQO1" } })]);
  const made = await squareClient(SQUARE, { fetcher: n.fetcher }).create({ ref: { kind: "meeting", id: MID }, name: "Consult", amount: 9900, currency: "usd", email: "dana@acme.com", successUrl: `${BASE}/ok`, cancelUrl: `${BASE}/no` });
  assert.deepEqual(made, { id: "SQO1", url: "https://square.link/u/abc" });
  const c = n.calls[0]!;
  assert.equal(c.url, "https://connect.squareupsandbox.com/v2/online-checkout/payment-links");
  assert.equal(c.headers.get("authorization"), "Bearer sq-token");
  assert.ok(c.headers.get("square-version"));
  const body = JSON.parse(c.body);
  assert.equal(body.idempotency_key, `link-m:${MID}`);
  assert.deepEqual(body.order.line_items[0].base_price_money, { amount: 9900, currency: "USD" });
  assert.equal(body.order.reference_id, `m:${MID}`);
  assert.equal(body.checkout_options.redirect_url, `${BASE}/ok`);
});

test("Square: paid only when the order is settled and its payment is COMPLETED", async () => {
  const order = (due: number) => json({ order: { id: "SQO1", state: "OPEN", reference_id: `m:${MID}`, total_money: { amount: 9900, currency: "USD" }, net_amount_due_money: { amount: due }, tenders: [{ id: "T1", payment_id: "PAY1" }] } });
  const paid = net([order(0), json({ payment: { id: "PAY1", status: "COMPLETED" } })]);
  assert.deepEqual(await squareClient(SQUARE, { fetcher: paid.fetcher }).status("SQO1"), { paid: true, state: "COMPLETED", amount: 9900, currency: "usd", ref: { kind: "meeting", id: MID }, capture: "PAY1" });
  const pending = net([order(0), json({ payment: { id: "PAY1", status: "APPROVED" } })]);
  assert.equal((await squareClient(SQUARE, { fetcher: pending.fetcher }).status("SQO1")).paid, false);
  const none = net([json({ order: { id: "SQO1", state: "OPEN", reference_id: `m:${MID}`, total_money: { amount: 9900, currency: "USD" }, net_amount_due_money: { amount: 9900 } } })]);
  assert.equal((await squareClient(SQUARE, { fetcher: none.fetcher }).status("SQO1")).paid, false);
});

test("Square webhook: the signature over the address and body must match the signature key", () => {
  const url = `${BASE}/api/pay/square?w=ws1`;
  const body = JSON.stringify({ type: "payment.updated", data: { object: { payment: { order_id: "SQO1" } } } });
  const sig = createHmac("sha256", "sig-key").update(url + body).digest("base64");
  assert.equal(squareSignatureOk("sig-key", url, body, sig), true);
  assert.equal(squareSignatureOk("sig-key", url, body.replace("SQO1", "SQO2"), sig), false, "a changed body");
  assert.equal(squareSignatureOk("other-key", url, body, sig), false, "the wrong key");
  assert.equal(squareSignatureOk("sig-key", url, body, null), false, "no signature");
  assert.equal(squareSignatureOk("sig-key", url, body, "short"), false);
  assert.equal(squareOrderOf(JSON.parse(body)), "SQO1");
  assert.equal(squareOrderOf({ type: "refund.updated" }), null);
});

// The flow: the server's amount, a signed return, and the provider's word before anything counts.

test("the return address is signed: a changed one is refused", () => {
  const u = returnUrl(BASE, { ref: { kind: "form", id: SID }, provider: "paypal", ws: "ws1", to: `${BASE}/f/x`, paid: true }, SECRET);
  const s = new URL(u).searchParams.get("s")!;
  assert.deepEqual(readReturn(s, SECRET), { ref: { kind: "form", id: SID }, provider: "paypal", ws: "ws1", to: `${BASE}/f/x`, paid: true });
  const [body, sig] = s.split(".");
  const evil = Buffer.from(JSON.stringify({ ref: { kind: "form", id: SID }, provider: "paypal", ws: "ws1", to: "https://evil.example", paid: true })).toString("base64url");
  assert.equal(readReturn(`${evil}.${sig}`, SECRET), null);
  assert.equal(readReturn(`${body}.${sig}x`, SECRET), null);
  assert.equal(readReturn(s, "another-secret-key-0123456789abcdef0123"), null);
  assert.equal(readReturn(null, SECRET), null);
});

const EMAIL: Field = { id: "e", key: "email", type: "email", label: "Email", required: true };
const QTY: Field = { id: "qty", key: "q.qty", type: "number", label: "How many?", required: true };
const TOTAL: Field = { id: "tot", key: "q.tot", type: "calc", label: "Total", required: false, calc: { formula: "{qty} * 12.5" } };
const PAY: Field = { id: "pay", key: "c.pay", type: "payment", label: "Total", required: false, pay: { field: "tot", currency: "USD", provider: "paypal" } };
const FORM = (() => {
  const r = checkForm({ ...emptyForm(), steps: [{ id: "s1", fields: [EMAIL, QTY, TOTAL, PAY] }] });
  if ("errors" in r) throw new Error(r.errors.join(" "));
  return r.form as Form;
})();

/** A fake database holding one fill's payment as submission_payment does (a merge patch that returns the row). */
function formDb() {
  let pay: Record<string, unknown> | null = null;
  const rpc: Rpc = async (fn, args) => {
    if (fn === "submission_payment") {
      const patch = args.p_patch as Record<string, unknown>;
      if (Object.keys(patch).length) pay = { ...(pay ?? {}), ...patch };
      return { data: pay, error: null };
    }
    return { data: null, error: null };
  };
  return { rpc, pay: () => pay };
}
const fake = (provider: "paypal" | "square", states: PayState[], made: { amount?: number }[] = []): PayClient => ({
  provider,
  async create(p) {
    made.push({ amount: p.amount });
    return { id: "ORDER1", url: "https://pay.example/ORDER1" };
  },
  async settle() {
    return states.shift()!;
  },
  async status() {
    return states.shift()!;
  },
  async refund() {
    return "REF1";
  },
});
const state = (o: Partial<PayState>): PayState => ({ paid: true, state: "COMPLETED", amount: 3750, currency: "usd", ref: { kind: "form", id: SID }, capture: "CAP1", ...o });

test("forms: the amount is the server's own math, whatever the page sent", async () => {
  const db = formDb();
  const made: { amount?: number }[] = [];
  const r = await startFormPay(db.rpc, fake("paypal", [], made), { form: FORM, formName: "Workshop", workspaceId: "ws1", submissionId: SID, answers: { qty: "3", tot: "0.01", pay: 1 }, email: null, hosted: `${BASE}/f/x`, base: BASE, secret: SECRET });
  assert.deepEqual(r, { url: "https://pay.example/ORDER1" });
  assert.deepEqual(made, [{ amount: 3750 }]);
  assert.equal(db.pay()?.amount, 3750);
  assert.equal(db.pay()?.status, "open");
});

test("forms: the page saying it paid isn't enough; only the provider's match counts", async () => {
  const db = formDb();
  await startFormPay(db.rpc, fake("paypal", []), { form: FORM, formName: "W", workspaceId: "ws1", submissionId: SID, answers: { qty: "3" }, email: null, hosted: `${BASE}/f/x`, base: BASE, secret: SECRET });
  // Back on the page, but PayPal holds it unpaid.
  assert.equal(await settleForm(db.rpc, fake("paypal", [state({ paid: false, state: "APPROVED", capture: null })]), SID), "open");
  assert.equal(db.pay()?.status, "open");
  // Paid, but for less than the server asked: not paid.
  assert.equal(await settleForm(db.rpc, fake("paypal", [state({ amount: 1 })]), SID), "mismatch");
  assert.equal(db.pay()?.status, "failed");
  // Another provider's webhook for this fill: nothing changes.
  const db2 = formDb();
  await startFormPay(db2.rpc, fake("paypal", []), { form: FORM, formName: "W", workspaceId: "ws1", submissionId: SID, answers: { qty: "3" }, email: null, hosted: `${BASE}/f/x`, base: BASE, secret: SECRET });
  assert.equal(await settleForm(db2.rpc, fake("square", [state({})]), SID), "none");
  // The guest never came back: the webhook reads it back, and it's paid once.
  assert.equal(await settleForm(db2.rpc, fake("paypal", [state({})]), SID), "paid");
  assert.equal(db2.pay()?.status, "paid");
  assert.equal(db2.pay()?.capture, "CAP1");
  assert.equal(await settleForm(db2.rpc, fake("paypal", []), SID), "paid", "a paid fill isn't read again");
});

test("matches: the same reference, amount and currency", () => {
  const ref = { kind: "form" as const, id: SID };
  assert.equal(matches(state({}), ref, 3750, "USD"), true);
  assert.equal(matches(state({ currency: "eur" }), ref, 3750, "usd"), false);
  assert.equal(matches(state({ ref: { kind: "meeting", id: SID } }), ref, 3750, "usd"), false);
  assert.equal(matches(state({ ref: null }), ref, 3750, "usd"), false);
});

/** A fake database with one paid meeting type's held meeting. */
function meetingDb(o: { taken?: boolean } = {}) {
  const meeting: Record<string, unknown> = {
    id: MID,
    workspace_id: "ws1",
    status: "pending_payment",
    guest_email: "dana@acme.com",
    guest_name: "Dana Lee",
    guest_tz: "UTC",
    start_at: new Date(START).toISOString(),
    end_at: new Date(END).toISOString(),
    payment: null,
  };
  const calls: string[] = [];
  const rpc: Rpc = async (fn, args) => {
    calls.push(fn);
    if (fn === "book_meeting") return { data: { meeting: structuredClone(meeting), type: { id: "t1", name: "Consult", settings: { price: { amount: 9900, currency: "USD", provider: "square" } } } }, error: null };
    if (fn === "meeting_payment") {
      meeting.payment = { ...((meeting.payment as object) ?? {}), ...(args.p_patch as object) };
      return { data: null, error: null };
    }
    if (fn === "meeting_pay") {
      if (o.taken) return { data: "refund", error: null };
      meeting.status = "booked";
      meeting.payment = { ...((meeting.payment as object) ?? {}), ...(args.p_payment as object) };
      return { data: "booked", error: null };
    }
    if (fn === "meeting_status") meeting.status = args.p_status;
    return { data: null, error: null };
  };
  return { rpc, meeting, calls };
}
const mstate = (o: Partial<PayState>) => state({ amount: 9900, ref: { kind: "meeting", id: MID }, capture: "PAY1", ...o });

test("meetings: the type's price is charged, the time is booked only once Square says it's paid", async () => {
  const db = meetingDb();
  const made: { amount?: number }[] = [];
  const r = await startMeetingPay(db.rpc, fake("square", [], made), { meetingId: MID, token: "tok", base: BASE, secret: SECRET });
  assert.equal(r.ok, true);
  assert.deepEqual(made, [{ amount: 9900 }]);
  assert.equal(await settleMeeting(db.rpc, fake("square", [mstate({ paid: false, state: "APPROVED" })]), MID), "open");
  assert.equal(db.meeting.status, "pending_payment");
  assert.equal(await settleMeeting(db.rpc, fake("square", [mstate({ amount: 100 })]), MID), "mismatch");
  assert.equal(db.meeting.status, "pending_payment");
  assert.equal(await settleMeeting(db.rpc, fake("square", [mstate({})]), MID), "booked");
  assert.equal(db.meeting.status, "booked");
  assert.ok(db.calls.includes("enqueue_job"), "the calendar event and emails follow");
});

test("flaky meetings: the time went while they paid, the payment goes back at once", async () => {
  const db = meetingDb({ taken: true });
  await startMeetingPay(db.rpc, fake("square", []), { meetingId: MID, token: "tok", base: BASE, secret: SECRET });
  assert.equal(await settleMeeting(db.rpc, fake("square", [mstate({})]), MID), "refunded");
  assert.equal((db.meeting.payment as { status?: string }).status, "refunded");
});

test("flaky meetings: a checkout that can't open lets the time go", async () => {
  const db = meetingDb();
  const broken: PayClient = { ...fake("square", []), create: async () => Promise.reject(new Error("Square: answered 500")) };
  assert.deepEqual(await startMeetingPay(db.rpc, broken, { meetingId: MID, token: "tok", base: BASE, secret: SECRET }), { ok: false });
  assert.equal(db.meeting.status, "canceled");
});
