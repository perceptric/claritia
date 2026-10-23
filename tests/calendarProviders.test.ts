// The calendar providers against fake Google, Microsoft and Zoom servers (docs/meetings-scheduler.md 1.1 to 1.3 and
// Part 3): busy times without titles, events made once however often a create is retried, tokens refreshed and the
// "reconnect" rule (only a refused sign-in, never an outage), push channels and the hook, and the live check's
// deadline.
process.env.SECRETS_KEY ||= "test-secret-key-0123456789-abcdefghijklmnop";

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Rpc } from "../src/lib/jobs.ts";
import { liveBusyFor } from "../src/lib/meetings/live.ts";
import { ReconnectError } from "../src/lib/meetings/provider.ts";
import { googleProvider } from "../src/lib/meetings/providers/google.ts";
import { handleHook } from "../src/lib/meetings/providers/hook.ts";
import { ProviderError, type Tok } from "../src/lib/meetings/providers/http.ts";
import { channelToken, readChannelToken, sealToken } from "../src/lib/meetings/providers/index.ts";
import { microsoftProvider } from "../src/lib/meetings/providers/microsoft.ts";
import { zoomClient } from "../src/lib/meetings/providers/zoom.ts";
import { fakeGoogle, fakeMicrosoft, fakeZoom } from "./fakeCalendars.ts";

const H = 3_600_000;
const T0 = Date.parse("2026-11-02T14:00:00Z");
const live = (): Tok => ({ access: "access-1", refresh: "refresh-1", expiresAt: Date.now() + H });
const lead = { email: "dana@lead.io", name: "Dana Lee" };
const leads = [lead];
const ev = (key: string, conference = true, guests: string[] = []) => ({ title: "Demo with Dana Lee", description: "", start: T0, end: T0 + H / 2, guests, leads, conference, key });

test("Google: calendars with the person's own marked, busy per calendar in 30-day pieces, unreadable ones left out", async () => {
  const g = fakeGoogle({ "me@acme.io": [{ start: T0, end: T0 + H }], "team@acme.io": [{ start: T0 + 40 * 24 * H, end: T0 + 40 * 24 * H + H }] });
  g.s.errors = ["boss@acme.io"];
  const p = googleProvider(live(), { fetcher: g.fetcher });
  const cals = await p.calendars();
  assert.deepEqual(cals.map((c) => [c.id, c.primary, c.own]), [["me@acme.io", true, true], ["team@acme.io", false, true], ["boss@acme.io", false, false]]);
  const by = await p.busyBy(["me@acme.io", "team@acme.io", "boss@acme.io"], T0, T0 + 60 * 24 * H);
  assert.equal(g.s.calls.filter((c) => c.url.pathname.endsWith("/freeBusy")).length, 2, "60 days in two calls");
  assert.deepEqual(Object.keys(by).sort(), ["me@acme.io", "team@acme.io"], "the calendar Google couldn't read keeps its cache");
  assert.deepEqual(by["me@acme.io"], [{ start: T0, end: T0 + H }]);
  assert.equal(by["team@acme.io"]!.length, 1);
  assert.ok(g.s.calls.every((c) => !JSON.stringify(c.body ?? {}).includes("summary")), "only free/busy is asked for, never titles");
});

test("Google: a create whose answer is lost makes one event, and the retry gets it back with its Meet link", async () => {
  const g = fakeGoogle();
  g.s.loseCreate = 1;
  const p = googleProvider(live(), { fetcher: g.fetcher });
  await assert.rejects(p.create("me@acme.io", ev("create:m1|u1")), ProviderError);
  const again = await p.create("me@acme.io", ev("create:m1|u1"));
  assert.equal(g.s.events.size, 1, "exactly one event");
  assert.match(again.id, /^[0-9a-v]{32}$/, "a valid Google event id made from the key");
  assert.match(again.joinUrl ?? "", /^https:\/\/meet\.google\.com\//);
  const post = g.s.calls.find((c) => c.method === "POST" && c.url.pathname.endsWith("/events"))!;
  assert.equal(post.url.searchParams.get("conferenceDataVersion"), "1");
  assert.equal(post.url.searchParams.get("sendUpdates"), "none", "Claritia sends the invite; Google sends nothing");
  assert.deepEqual(post.body!.attendees, [{ email: "dana@lead.io", displayName: "Dana Lee" }], "the lead still shows on the event");
  // A different key (a move to a new host) is a different event.
  await p.create("me@acme.io", ev("move:m1:1|u2"));
  assert.equal(g.s.events.size, 2);
  await p.update("me@acme.io", again.id, { start: T0 + H, end: T0 + 2 * H, guests: ["co@acme.io"], leads });
  assert.equal((g.s.events.get(again.id)!.start as { dateTime: string }).dateTime, new Date(T0 + H).toISOString());
  assert.deepEqual(g.s.events.get(again.id)!.attendees, [{ email: "dana@lead.io", displayName: "Dana Lee" }, { email: "co@acme.io" }]);
  await p.cancel("me@acme.io", again.id);
  await p.cancel("me@acme.io", again.id);
  assert.equal(g.s.events.get(again.id)!.status, "cancelled", "a second cancel of a gone event is fine");
  const writes = g.s.calls.filter((c) => c.method !== "GET" && c.url.pathname.includes("/events"));
  assert.ok(writes.length >= 5 && writes.every((c) => c.url.searchParams.get("sendUpdates") === "none"), "create, move and cancel never email anyone");
});

test("tokens: refreshed before they run out and saved; a 401 refreshes once; a second 401 means reconnect", async () => {
  const g = fakeGoogle();
  const saved: Tok[] = [];
  const p = googleProvider({ access: "old", refresh: "refresh-1", expiresAt: Date.now() - 1 }, { fetcher: g.fetcher, save: async (t) => void saved.push(t) });
  await p.calendars();
  assert.equal(saved.length, 1);
  assert.equal(saved[0]!.access, "fresh-access");
  assert.equal(saved[0]!.refresh, "refresh-1", "Google keeps the same refresh token");
  const auth = g.s.calls.filter((c) => c.url.pathname.includes("calendarList")).map((c) => c.headers.get("authorization"));
  assert.deepEqual(auth, ["Bearer fresh-access"]);

  g.s.unauthorized = 1;
  await p.calendars();
  assert.equal(saved.length, 2, "one 401: refreshed and tried again");
  g.s.unauthorized = 2;
  await assert.rejects(p.calendars(), ReconnectError);
});

test("tokens: invalid_grant is a reconnect; an outage at the token endpoint is not; a token another job rotated is used", async () => {
  const g = fakeGoogle();
  g.s.token = { status: 400, body: { error: "invalid_grant", error_description: "Token has been expired or revoked." } };
  const expired = (): Tok => ({ access: "old", refresh: "refresh-1", expiresAt: 0 });
  await assert.rejects(googleProvider(expired(), { fetcher: g.fetcher }).calendars(), ReconnectError);

  g.s.token = { status: 503, body: { error: "temporarily_unavailable" } };
  await assert.rejects(googleProvider(expired(), { fetcher: g.fetcher }).calendars(), (e) => !(e instanceof ReconnectError));

  // Zoom-style rotation: our refresh token was spent by a parallel job, which saved a fresh access token.
  g.s.token = { status: 400, body: { error: "invalid_grant" } };
  const p = googleProvider(expired(), { fetcher: g.fetcher, reload: async () => ({ access: "theirs", refresh: "refresh-2", expiresAt: Date.now() + H }) });
  await p.calendars();
  assert.equal(g.s.calls.at(-1)!.headers.get("authorization"), "Bearer theirs");
});

test("Microsoft: calendarView over pages, out of office marked, free and canceled left out, owned calendars marked", async () => {
  const m = fakeMicrosoft();
  m.s.view.AAMkDef = [
    { start: "2026-11-02T14:00:00.0000000", end: "2026-11-02T15:00:00.0000000", showAs: "busy" },
    { start: "2026-11-02T16:00:00.0000000", end: "2026-11-02T17:00:00.0000000", showAs: "free" },
    { start: "2026-11-03T00:00:00.0000000", end: "2026-11-04T00:00:00.0000000", showAs: "oof" },
    { start: "2026-11-05T10:00:00.0000000", end: "2026-11-05T11:00:00.0000000", showAs: "busy", isCancelled: true },
    { start: "2026-11-06T10:00:00.0000000", end: "2026-11-06T10:30:00.0000000", showAs: "tentative" },
  ];
  const p = microsoftProvider(live(), { fetcher: m.fetcher });
  const cals = await p.calendars();
  assert.deepEqual(cals.map((c) => [c.id, c.primary, c.own]), [["AAMkDef", true, true], ["AAMkSide", false, true], ["AAMkBoss", false, false]]);
  const by = await p.busyBy(["AAMkDef"], T0 - H, T0 + 10 * 24 * H);
  assert.deepEqual(by.AAMkDef, [
    { start: T0, end: T0 + H },
    { start: Date.parse("2026-11-03T00:00:00Z"), end: Date.parse("2026-11-04T00:00:00Z"), ooo: true },
    { start: Date.parse("2026-11-06T10:00:00Z"), end: Date.parse("2026-11-06T10:30:00Z") },
  ]);
  const views = m.s.calls.filter((c) => c.url.pathname.endsWith("/calendarView"));
  assert.equal(views.length, 3, "followed @odata.nextLink");
  assert.ok(views.every((c) => c.headers.get("prefer") === 'outlook.timezone="UTC"'));
  assert.ok(views.every((c) => c.url.searchParams.get("$select") === "start,end,showAs,isCancelled"), "no titles");
  assert.equal(await p.email!(), "sam@contoso.com");
});

test("Microsoft: a retried create carries the same transactionId and gets the first event; personal accounts go without Teams", async () => {
  const m = fakeMicrosoft();
  const p = microsoftProvider(live(), { fetcher: m.fetcher });
  const a = await p.create("AAMkDef", ev("create:m1|u1", true, ["co@contoso.com"]));
  const b = await p.create("AAMkDef", ev("create:m1|u1", true, ["co@contoso.com"]));
  assert.equal(a.id, b.id);
  assert.equal(m.s.events.size, 1);
  assert.match(a.joinUrl ?? "", /^https:\/\/teams\.microsoft\.com\//);
  const body = m.s.calls.find((c) => c.method === "POST")!.body!;
  assert.equal(body.isOnlineMeeting, true);
  assert.equal(body.onlineMeetingProvider, "teamsForBusiness");
  assert.deepEqual(body.start, { dateTime: "2026-11-02T14:00:00", timeZone: "UTC" });
  // Outlook emails every attendee, so the lead (who gets Claritia's own invite) is named in the body instead.
  assert.deepEqual(body.attendees, [{ emailAddress: { address: "co@contoso.com" }, type: "required" }]);
  assert.match(String((body.body as { content: string }).content), /^Guest: Dana Lee <dana@lead\.io>/);
  await p.update("AAMkDef", a.id, { start: T0 + H, end: T0 + 2 * H, guests: ["co@contoso.com"], leads });
  assert.ok(!JSON.stringify(m.s.calls.at(-1)!.body).includes("dana@lead.io"), "a move doesn't add the lead either");
  await p.cancel("AAMkDef", a.id);
  assert.deepEqual(m.s.canceled, [a.id], "cancel, which sends Outlook's notice");

  const personal = fakeMicrosoft();
  personal.s.personal = true;
  const x = await microsoftProvider(live(), { fetcher: personal.fetcher }).create("AAMkDef", ev("create:m2|u1"));
  assert.equal(x.joinUrl, undefined);
  assert.equal(personal.s.events.size, 1);
});

test("push: Graph subscriptions carry our signed clientState and renew; Google channels carry the token", async () => {
  const account = "11111111-2222-4333-8444-555555555555";
  const m = fakeMicrosoft();
  const p = microsoftProvider(live(), { fetcher: m.fetcher });
  const ch = await p.watch!("AAMkDef", "https://app.example.com/api/calendar/hook", channelToken(account));
  const sub = m.s.subscriptions.get(ch.id)!;
  assert.equal(sub.resource, "me/calendars/AAMkDef/events");
  assert.equal(readChannelToken(String(sub.clientState)), account);
  assert.ok(ch.expires > Date.now() + 2 * 24 * H);
  assert.ok(await p.renew!(ch));
  assert.equal(await p.renew!({ ...ch, id: "gone" }), null, "a lost subscription is made again");

  const g = fakeGoogle();
  const gp = googleProvider(live(), { fetcher: g.fetcher });
  const gc = await gp.watch!("me@acme.io", "https://app.example.com/api/calendar/hook", channelToken(account));
  assert.equal(g.s.channels[0]!.token, channelToken(account));
  assert.equal(await gp.renew!(gc), null, "Google channels are replaced, not extended");
  await gp.unwatch!(gc);
  assert.deepEqual(g.s.stopped, [gc.id]);

  assert.equal(readChannelToken(`${account}.forged`), null);
  assert.equal(readChannelToken(channelToken(account).replace(account, "11111111-2222-4333-8444-000000000000")), null);
});

test("hook: Microsoft's validation handshake, Google's sync, forged tokens refused, one refresh per delivery", async () => {
  const account = "11111111-2222-4333-8444-555555555555";
  const calls: Record<string, unknown>[] = [];
  const rpc: Rpc = async (fn, args) => {
    calls.push({ fn, ...args });
    return { data: true, error: null };
  };
  const url = "https://app.example.com/api/calendar/hook";

  const v = await handleHook(new Request(`${url}?validationToken=${encodeURIComponent("Validation: Testing client application reachability <x>")}`, { method: "POST" }), rpc);
  assert.equal(v.status, 200);
  assert.match(v.headers.get("content-type") ?? "", /^text\/plain/);
  assert.equal(await v.text(), "Validation: Testing client application reachability <x>");
  assert.equal(calls.length, 0);

  const google = (state: string, token: string) =>
    new Request(url, { method: "POST", headers: { "x-goog-channel-id": "ch-1", "x-goog-resource-state": state, "x-goog-channel-token": token, "x-goog-resource-id": "res-1", "x-goog-message-number": "2" } });
  assert.equal((await handleHook(google("sync", channelToken(account)), rpc)).status, 200);
  assert.equal(calls.length, 0, "sync only says the channel works");
  assert.equal((await handleHook(google("exists", `${account}.nope`), rpc)).status, 401);
  assert.equal((await handleHook(google("exists", channelToken(account)), rpc)).status, 200);
  assert.deepEqual(calls, [{ fn: "calendar_hook", p_account: account, p_channel: "ch-1" }]);

  calls.length = 0;
  const note = { subscriptionId: "sub-1", clientState: channelToken(account), changeType: "updated", resource: "Users/x/Events/y", tenantId: "t" };
  const graph = await handleHook(new Request(url, { method: "POST", body: JSON.stringify({ value: [note, { ...note, changeType: "created" }, { ...note, clientState: "forged" }] }) }), rpc);
  assert.equal(graph.status, 202);
  assert.equal(calls.length, 1, "two changes on one subscription in one delivery: one refresh");
  const forged = await handleHook(new Request(url, { method: "POST", body: JSON.stringify({ value: [{ ...note, clientState: "forged" }] }) }), rpc);
  assert.equal(forged.status, 401);
});

test("Zoom: a meeting with its join link; deleting one that's gone is fine; no profile scope is fine", async () => {
  const z = fakeZoom();
  const c = zoomClient(live(), { fetcher: z.fetcher });
  const made = await c.create({ topic: "Demo with Dana Lee", start: T0, end: T0 + 45 * 60_000, key: "create:m1" });
  assert.match(made.joinUrl, /zoom\.us\/j\//);
  assert.equal(z.s.meetings.get(made.id)!.duration, 45);
  await c.move(made.id, T0 + H, T0 + 2 * H);
  assert.equal(z.s.meetings.get(made.id)!.start_time, new Date(T0 + H).toISOString());
  await c.cancel(made.id);
  await c.cancel(made.id);
  assert.deepEqual(z.s.deleted, [made.id]);
  assert.equal(await c.email(), null);
});

test("live check: a provider that hangs is left out within the budget; the others still count", async () => {
  const slow = fakeGoogle();
  slow.s.hang = true;
  const quick = fakeMicrosoft();
  quick.s.view.AAMkDef = [{ start: "2026-11-02T14:00:00.0000000", end: "2026-11-02T15:00:00.0000000", showAs: "busy" }];
  const accounts = [
    { id: "a1", user_id: "u-slow", provider: "google", sealed: sealToken(live()), calendars: ["me@acme.io"], busy: null },
    { id: "a2", user_id: "u-busy", provider: "microsoft", sealed: sealToken(live()), calendars: ["AAMkDef"], busy: null },
    { id: "a3", user_id: "u-fake", provider: "fake", sealed: null, calendars: ["primary"], busy: [[new Date(T0).toISOString(), new Date(T0 + H).toISOString()]] },
  ];
  const rpc: Rpc = async (fn) => ({ data: fn === "calendar_live_inputs" ? accounts : null, error: null });
  const fetcher = ((input: RequestInfo | URL, init?: RequestInit) => (/google/.test(String(input)) ? slow.fetcher(input, init) : quick.fetcher(input, init))) as typeof fetch;
  const t = Date.now();
  const busy = await liveBusyFor(rpc, "ws", { fetcher, timeoutMs: 300 })(["u-slow", "u-busy", "u-fake"], T0, T0 + H / 2);
  assert.ok(Date.now() - t < 1000, "the deadline holds even when the provider ignores it");
  assert.deepEqual([...busy].sort(), ["u-busy", "u-fake"]);

  // The database itself failing: nothing is busy (the cache already shaped the offer), and nothing throws.
  const broken: Rpc = async () => ({ data: null, error: { message: "down" } });
  assert.equal((await liveBusyFor(broken, "ws")(["u1"], T0, T0 + H)).size, 0);
});
