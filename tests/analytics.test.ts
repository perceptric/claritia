// Product analytics (docs/integrations-plan.md, Next step 8; src/lib/sources/analytics.ts, fillEvent in
// src/lib/delivery/send.ts): each tool's request and its dedupe id, the same id on a repeat, and the flaky cases the
// reliability rule asks for: a wrong key stops with what to do, a 503 is tried again, and the workflow step's checks.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fillEvent, sendDelivery, type Taken } from "../src/lib/delivery/send.ts";
import { amplitude, ANALYTICS, insertIdOf, mixpanel, posthog, segment, uuidOf, type AnalyticsEvent } from "../src/lib/sources/analytics.ts";
import { CATALOG } from "../src/lib/sources/catalog.ts";
import { makeCtx } from "../src/lib/sources/ctx.ts";
import { connectorFor } from "../src/lib/sources/registry.ts";
import { seal } from "../src/lib/seal.ts";
import type { Rpc } from "../src/lib/jobs.ts";
import type { SourceRow } from "../src/lib/sources/types.ts";
import { cleanBody, stepProblems } from "../src/lib/workflows/check.ts";

process.env.SECRETS_KEY ??= "s".repeat(40);
const SUB = "88888888-8888-4888-8888-888888888888";
const src = (kind: string): SourceRow => ({ id: "s1", workspace_id: "ws1", kind, name: kind, account: null, status: "active", settings: {}, cursors: {}, push_cursor: null });
type Call = { url: string; body: string; headers: Headers };
function net(answers: Response[]) {
  const calls: Call[] = [];
  const list = [...answers];
  const fetcher = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, body: String(init.body ?? ""), headers: new Headers(init.headers) });
    return (list.length > 1 ? list.shift()! : list[0]!).clone();
  }) as unknown as typeof fetch;
  return { calls, fetcher };
}
const ok = (j: unknown = {}) => new Response(JSON.stringify(j), { status: 200, headers: { "content-type": "application/json" } });
const ctx = (kind: string, values: Record<string, string>, fetcher: typeof fetch) => makeCtx({ source: src(kind), creds: { type: "key", values }, fetcher, sleep: async () => {} });
const ev: AnalyticsEvent = { id: SUB, name: "Form Submitted", userId: "ada@acme.com", at: "2026-11-06T12:00:00.000Z", props: { form_name: "Book a demo", answers: { Company: "Acme" } }, traits: { first_name: "Ada", company: "Acme" } };

test("four tools, registered, in Settings › Integrations with keys, taking fills", () => {
  assert.deepEqual(ANALYTICS.map((c) => c.kind), ["segment", "posthog", "mixpanel", "amplitude"]);
  for (const c of ANALYTICS) {
    assert.equal(connectorFor(c.kind), c);
    const e = CATALOG.find((x) => x.kind === c.kind)!;
    assert.ok(e.analytics && e.pushes && e.keys?.length, c.kind);
  }
  assert.equal(uuidOf(SUB), SUB);
  assert.equal(uuidOf("run1:s1"), uuidOf("run1:s1"), "the same id every time");
  assert.match(uuidOf("run1:s1"), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(insertIdOf(SUB), SUB);
  assert.equal(insertIdOf("run1:s1").length, 32);
});

test("Segment: identify then track, with basic auth and the fill's id as messageId", async () => {
  const n = net([ok({ success: true })]);
  await segment.event!(ctx("segment", { write_key: "wk" }, n.fetcher), ev);
  assert.deepEqual(n.calls.map((c) => c.url), ["https://api.segment.io/v1/identify", "https://api.segment.io/v1/track"]);
  assert.equal(n.calls[1]!.headers.get("authorization"), `Basic ${Buffer.from("wk:").toString("base64")}`);
  const t = JSON.parse(n.calls[1]!.body);
  assert.deepEqual([t.userId, t.event, t.messageId, t.properties.form_name], ["ada@acme.com", "Form Submitted", SUB, "Book a demo"]);
  assert.equal(JSON.parse(n.calls[0]!.body).traits.first_name, "Ada");
  const e = net([ok()]);
  await segment.event!(ctx("segment", { write_key: "wk", region: "EU" }, e.fetcher), { ...ev, traits: undefined });
  assert.deepEqual(e.calls.map((c) => c.url), ["https://events.eu1.segmentapis.com/v1/track"]);
});

test("PostHog: one capture with the uuid, distinct_id and $set; its own address", async () => {
  const n = net([ok({ status: 1 })]);
  await posthog.event!(ctx("posthog", { api_key: "phc_1", host: "https://eu.i.posthog.com/" }, n.fetcher), ev);
  assert.equal(n.calls[0]!.url, "https://eu.i.posthog.com/capture/");
  const b = JSON.parse(n.calls[0]!.body);
  assert.deepEqual([b.api_key, b.distinct_id, b.uuid, b.properties.$set.company], ["phc_1", "ada@acme.com", SUB, "Acme"]);
  await assert.rejects(posthog.event!(ctx("posthog", { api_key: "k", host: "javascript:x" }, n.fetcher), ev));
});

test("Mixpanel: track with $insert_id, then engage; a bad token is the sign-in", async () => {
  const n = net([ok({ status: 1 })]);
  await mixpanel.event!(ctx("mixpanel", { token: "tok" }, n.fetcher), ev);
  assert.match(n.calls[0]!.url, /^https:\/\/api\.mixpanel\.com\/track\?strict=1/);
  assert.match(n.calls[1]!.url, /\/engage\?/);
  const p = JSON.parse(n.calls[0]!.body)[0].properties;
  assert.deepEqual([p.token, p.distinct_id, p.$insert_id, p.time], ["tok", "ada@acme.com", SUB, Date.parse(ev.at)]);
  const bad = net([ok({ status: 0, error: "token, missing or empty" })]);
  await assert.rejects(mixpanel.event!(ctx("mixpanel", { token: "x", region: "eu" }, bad.fetcher), ev), (e) => (e as { status?: number }).status === 401);
  assert.match(bad.calls[0]!.url, /api-eu\.mixpanel\.com/);
});

test("Amplitude: one event with insert_id and user properties, EU when asked", async () => {
  const n = net([ok({ code: 200 })]);
  await amplitude.event!(ctx("amplitude", { api_key: "ak", region: "eu" }, n.fetcher), ev);
  assert.equal(n.calls[0]!.url, "https://api.eu.amplitude.com/2/httpapi");
  const e = JSON.parse(n.calls[0]!.body).events[0];
  assert.deepEqual([e.user_id, e.event_type, e.insert_id, e.user_properties.first_name], ["ada@acme.com", "Form Submitted", SUB, "Ada"]);
});

/** A fill's delivery to a tool, through the real send path with its sealed key. */
function delivery(kind: string, values: Record<string, string>) {
  const t: Taken = {
    delivery: { id: "d1", attempts: 1, external_id: null },
    destination: { id: "dest1", kind: "source", source_id: "s1", name: kind, config: {}, mode: "upsert" },
    sealed: null,
    submission: { id: SUB, created_at: "2026-11-06T12:00:00.000Z", values: { email: "ada@acme.com" }, hidden: { utm_source: "google", page: "https://acme.com/demo", secret_thing: "x" }, test: false, form_version: 1, contact_id: "c1" },
    form: { id: "f1", name: "Book a demo", body: null },
    contact: { id: "c1", email: "ada@acme.com", first_name: "Ada", last_name: null, title: null, phone: null, country: "US", company: "Acme", company_domain: "acme.com" },
  };
  const rpc: Rpc = async (fn) =>
    fn === "source_load" ? { data: { source: src(kind), sealed: seal(JSON.stringify({ type: "key", values })), hook_sealed: null, mappings: [] }, error: null } : { data: null, error: null };
  return { t, rpc };
}

test("a fill's event: the fill's id, the email as the id, where it came from, and the same id on a repeat", async () => {
  const { t, rpc } = delivery("amplitude", { api_key: "ak" });
  const e = fillEvent(t);
  assert.deepEqual([e.id, e.name, e.userId], [SUB, "Form Submitted", "ada@acme.com"]);
  assert.deepEqual([e.props.utm_source, e.props.page, e.props.secret_thing], ["google", "https://acme.com/demo", undefined]);
  assert.deepEqual(e.traits, { first_name: "Ada", company: "Acme", country: "US" });
  const n = net([ok({ code: 200 })]);
  const run = { rpc, clean: async () => ({ custom: [] }) as never, fetcher: n.fetcher, sleep: async () => {} };
  assert.deepEqual(await sendDelivery(t, { run }), { status: "done" });
  assert.deepEqual(await sendDelivery(t, { run }), { status: "done" });
  const ids = n.calls.map((c) => JSON.parse(c.body).events[0].insert_id);
  assert.deepEqual(ids, [SUB, SUB], "a repeat carries the same id, so Amplitude drops it");
});

test("flaky: a wrong key stops with what to do; a 503 that stays down tries again later", async () => {
  const { t, rpc } = delivery("segment", { write_key: "bad" });
  const wrong = net([new Response(JSON.stringify({ message: "Invalid write key" }), { status: 401 })]);
  const r = await sendDelivery(t, { run: { rpc, clean: async () => ({ custom: [] }) as never, fetcher: wrong.fetcher, sleep: async () => {} } });
  assert.equal(r.status, "failed");
  assert.match((r as { error: string }).error, /Sign in to segment again/);
  const down = net([new Response("down", { status: 503 })]);
  const r2 = await sendDelivery(t, { run: { rpc, clean: async () => ({ custom: [] }) as never, fetcher: down.fetcher, sleep: async () => {} } });
  assert.equal(r2.status, "retry");
  assert.ok(down.calls.length > 1, "tried more than once before going back to the queue");
  const bad = net([new Response(JSON.stringify({ error: "invalid event" }), { status: 400 })]);
  assert.equal((await sendDelivery(t, { run: { rpc, clean: async () => ({ custom: [] }) as never, fetcher: bad.fetcher, sleep: async () => {} } })).status, "failed");
});

test("the workflow step: needs a tool and a name, and survives a save", () => {
  assert.deepEqual(stepProblems({ id: "e1", kind: "event", source: "", name: " " }), ["Pick Segment, PostHog, Mixpanel or Amplitude", "Name the event"]);
  assert.deepEqual(stepProblems({ id: "e1", kind: "event", source: "s1", name: "Meeting Booked" }), []);
  const b = cleanBody({ trigger: { kind: "form", forms: [] }, steps: [{ id: "e1", kind: "event", source: "s1", name: " Meeting Booked " }], goals: [], entry: { mode: "once", gapDays: 30 } });
  assert.deepEqual(b.steps[0], { id: "e1", kind: "event", source: "s1", name: "Meeting Booked" });
});
