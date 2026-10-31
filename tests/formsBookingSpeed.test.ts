// Forms and booking in fewer round trips, over stand-in databases: the send's checks run together, Turnstile slow
// or failing never loses a fill, the one-call functions fall back to the old calls while 090 isn't run, the cached
// form is read again when the browser is on another version, the router and the cleaning lists are read once for
// callers that arrive together (and a failed read is never kept), routing is the inline run's or the job's and never
// both, a preferred host's times reuse the type's calendar read, the booking writes its tail in one call, and the
// hosted form page, the embed and the script's caching.
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkForm, emptyForm, type Form } from "../src/lib/forms/schema.ts";
import { acceptFill, routeFillWith, type PublicForm } from "../src/lib/forms/submit.ts";
import { callNewer, isMissingFn, resetNewer } from "../src/lib/forms/newer.ts";
import { loadForSend, sendCtx } from "../src/lib/forms/server.ts";
import { hostedFormHtml } from "../src/lib/forms/hosted.ts";
import { embedScript } from "../src/lib/forms/render.ts";
import { scriptHash, scriptResponse } from "../src/lib/forms/script.ts";
import type { Rpc } from "../src/lib/jobs.ts";
import { book } from "../src/lib/meetings/server.ts";
import { preferredSlots } from "../src/lib/meetings/public.ts";
import { at } from "../src/lib/meetings/time.ts";
import { DEFAULT_AVAILABILITY, DEFAULT_SETTINGS, type MeetingType } from "../src/lib/meetings/types.ts";
import { invalidateRouterLive, liveRouterCached, LIVE_TTL_MS } from "../src/lib/router/server.ts";
import { emptyBody } from "../src/lib/router/types.ts";

const WS = "0192f3a1-0000-7000-8000-000000000001";
const FORM = "0192f3a1-0000-7000-8000-0000000000ff";
const SID = "0192f3a1-0000-7000-8000-0000000000aa";
const ANA = "0192f3a1-0000-7000-8000-00000000000a";
const BEN = "0192f3a1-0000-7000-8000-00000000000b";
const TZ = "America/New_York";
const NOW = at("2026-11-02", "06:00", TZ);
const TEN = at("2026-11-02", "10:00", TZ);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MISSING = (fn: string) => ({ data: null, error: { message: `Could not find the function public.${fn}(p_form) in the schema cache` } });

function form(o: { perHour?: number; notify?: boolean } = {}): Form {
  const r = checkForm({
    ...emptyForm(),
    steps: [{ id: "s1", fields: [{ id: "em", key: "email", type: "email", label: "Email", required: true }] }],
    spam: { minSeconds: 0, turnstile: true, ...(o.perHour ? { perHour: o.perHour } : {}) },
    ...(o.notify ? { notify: { on: true, to: ["team@acme.io"], slack: false, answers: true } } : {}),
  });
  if ("errors" in r) throw new Error(r.errors.join(" "));
  return r.form;
}
const pub = (body: Form, version = 1): PublicForm => ({ id: FORM, workspace_id: WS, version, status: "live", body, tokens: {}, logo_url: null });
const fill = { v: 1, version: 1, key: "k".repeat(20), answers: { em: "ana@acme.com" }, ms: 5000, trap: "" };

/** A send's database: records each call with its arguments; form_submit_all as the database answers it. */
function db(o: { old?: boolean; spam?: string | null } = {}) {
  invalidateRouterLive();
  resetNewer();
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const rpc: Rpc = async (fn, args) => {
    calls.push({ fn, args });
    if (fn === "form_submit_all") return o.old ? MISSING(fn) : { data: { id: SID, contact_id: args.p_spam ? null : "c1", repeat: false, spam: args.p_spam ?? o.spam ?? null, notified: true }, error: null };
    if (fn === "form_submit") return { data: { id: SID, contact_id: args.p_spam ? null : "c1", repeat: false }, error: null };
    if (fn === "form_hour_count") return { data: 5, error: null };
    if (fn === "router_live") return { data: null, error: null };
    return { data: "x", error: null };
  };
  return { rpc, calls, names: () => calls.map((c) => c.fn) };
}

test("the send's checks run together: the cleaning lists and Turnstile, each slow, cost the slower one, not both", async () => {
  const d = db();
  const t0 = Date.now();
  const r = await acceptFill(d.rpc, pub(form()), fill, sleep(150).then(() => ({ custom: [] })), { turnstileFailed: sleep(150).then(() => false) });
  const took = Date.now() - t0;
  assert.equal(r.status, 200);
  assert.ok(took < 280, `took ${took} ms`);
  assert.deepEqual(d.names(), ["form_submit_all", "router_live"], "one call saves the fill and queues its alerts");
});

test("Turnstile failing holds the fill as spam: saved, no contact, never routed", async () => {
  const d = db();
  const r = await acceptFill(d.rpc, pub(form()), fill, { custom: [] }, { turnstileFailed: Promise.resolve(true) });
  assert.equal(r.status, 200);
  const saved = d.calls.find((c) => c.fn === "form_submit_all")!.args;
  assert.deepEqual([saved.p_spam, saved.p_contact], ["turnstile", null]);
  assert.ok(!d.names().includes("router_live"), "spam is never routed");
});

test("the hourly limit held by the database: the answer names no booking and nothing is routed", async () => {
  const d = db({ spam: "rate" });
  const r = await acceptFill(d.rpc, pub(form({ perHour: 1 })), fill, { custom: [] }, {});
  assert.deepEqual([r.status, r.body.id], [200, SID]);
  assert.ok(!d.names().includes("form_hour_count"), "counted in the same call");
  assert.ok(!d.names().includes("router_live"));
});

test("before 090: the hourly count, form_submit and the alert job, as before; the missing function isn't asked again", async () => {
  const d = db({ old: true });
  const r = await acceptFill(d.rpc, pub(form({ perHour: 2, notify: true })), fill, { custom: [] }, {});
  assert.equal(r.status, 200);
  assert.deepEqual(d.names(), ["form_submit_all", "form_hour_count", "form_submit"], "past the limit: held, so no alert and no routing");
  assert.equal(d.calls.find((c) => c.fn === "form_submit")!.args.p_spam, "rate");
  const again = await acceptFill(d.rpc, pub(form({ perHour: 10, notify: true })), fill, { custom: [] }, {});
  assert.equal(again.status, 200);
  assert.deepEqual(d.names().slice(3), ["form_hour_count", "form_submit", "enqueue_job", "router_live"], "under it: the alert job, then routing");
  assert.equal(d.names().filter((n) => n === "form_submit_all").length, 1, "remembered as missing");
  assert.ok(isMissingFn({ message: "function public.x(p_a => uuid) does not exist" }));
  assert.ok(isMissingFn({ message: "nope", code: "PGRST202" }));
  assert.ok(!isMissingFn({ message: "slot_taken" }));
  resetNewer();
  const errs: Rpc = async () => ({ data: null, error: { message: "connection reset" } });
  assert.deepEqual(await callNewer(errs, "f", {}), { data: null, error: { message: "connection reset" } }, "a real error is the answer, not a fallback");
});

test("the cached form is used when it's live on the browser's version, and read again when it isn't", async () => {
  let reads = 0;
  let live = { ...pub(form()), id: "0192f3a1-0000-7000-8000-0000000000f1" };
  const fake = { rpc: async () => (reads++, { data: live, error: null }) } as unknown as Parameters<typeof loadForSend>[0];
  assert.equal((await loadForSend(fake, live.id, 1))?.version, 1);
  assert.equal((await loadForSend(fake, live.id, 1))?.version, 1);
  assert.equal(reads, 1, "the copy answers");
  live = { ...live, version: 2 };
  assert.equal((await loadForSend(fake, live.id, 2))?.version, 2, "the browser has the new version: read again");
  assert.equal(reads, 2);
  live = { ...live, status: "paused" };
  await loadForSend(fake, live.id, 2);
  assert.equal(reads, 2, "still live on that version in the copy");
  assert.equal((await loadForSend(fake, live.id, 3))?.status, "paused", "a version the copy doesn't have reads again");
});

test("the router and the cleaning lists: callers together share one read, a failed read isn't kept, a publish here shows at once", async () => {
  let n = 0;
  let fail = true;
  const rpc: Rpc = async () => {
    n++;
    await sleep(20);
    if (fail) return { data: null, error: { message: "timeout" } };
    return { data: { version: n, body: emptyBody() }, error: null };
  };
  invalidateRouterLive();
  const both = await Promise.allSettled([liveRouterCached(rpc, WS), liveRouterCached(rpc, WS)]);
  assert.deepEqual([both[0].status, both[1].status, n], ["rejected", "rejected", 1], "one read for both");
  fail = false;
  const v = await liveRouterCached(rpc, WS);
  assert.equal(v?.version, 2, "the failure wasn't kept");
  assert.equal((await liveRouterCached(rpc, WS))?.version, 2);
  assert.equal((await liveRouterCached(rpc, WS, Date.now() + LIVE_TTL_MS + 1))?.version, 3, "read again after the TTL");
  invalidateRouterLive(WS);
  assert.equal((await liveRouterCached(rpc, WS))?.version, 4, "invalidated: read again");

  let loads = 0;
  const load = async () => (loads++, await sleep(10), { custom: [] });
  await Promise.all([sendCtx("ws-ctx", load), sendCtx("ws-ctx", load)]);
  assert.equal(loads, 1);
  await assert.rejects(sendCtx("ws-bad", async () => Promise.reject(new Error("down"))));
  assert.deepEqual(await sendCtx("ws-bad", load), { custom: [] }, "a failed read isn't kept");
});

test("routing is the inline run's or the job's, never both: a late inline run stops at its gate, a claimed commit finishes", async () => {
  const body = emptyBody();
  body.queues = [{ id: "q1", name: "All", method: "rr", strict: false, hoursOnly: false, members: [{ user: ANA, weight: 1 }] }];
  body.fallback = { kind: "queue", id: "q1" };
  const make = (o: { factsMs?: number; commitMs?: number }) => {
    invalidateRouterLive();
    resetNewer();
    const runs = new Map<string, string>();
    const calls: string[] = [];
    const rpc: Rpc = async (fn, args) => {
      calls.push(fn);
      if (fn === "router_live") return { data: { version: 1, body }, error: null };
      if (fn === "routing_facts" || fn === "router_facts_full") {
        await sleep(o.factsMs ?? 0);
        if (runs.has(args.p_key as string)) return { data: { existing: { id: "run", kind: "owner", owner: ANA, by: "queue", queue: "q1", rule: null } }, error: null };
        return {
          data: { contact: { id: "c1", email: "a@acme.com", email_clean: "a@acme.com", email_class: "work", fields: {} }, domain: "acme.com", owner: { user: null, crm: null }, company: null, submission: null, recent: 0, reps: { [ANA]: { name: "Ana", member: true, tz: "UTC", availability: null, paused_until: null, out_dates: [], calendar_out_until: null, backup: null, cap_day: null, cap_week: null, today: 0, week: 0, meetings_week: 0 } }, counts: {}, lists: { allow: [], block: [] }, more: {} },
          error: null,
        };
      }
      if (fn === "routing_commit" || fn === "router_commit") {
        await sleep(o.commitMs ?? 0);
        const k = (args.p_key ?? (args.p as { key: string }).key) as string;
        if (runs.has(k)) return { data: { status: "dup", id: "run", kind: "owner", owner: ANA }, error: null };
        runs.set(k, ANA);
        return { data: { status: "ok", id: "run", owner: ANA, steps: [] }, error: null };
      }
      if (fn === "enqueue_job") return { data: "job", error: null };
      return { data: null, error: null };
    };
    return { rpc, calls, runs };
  };
  const late = make({ factsMs: 120 });
  const r = await routeFillWith(late.rpc, WS, "c1", "s1", { budgetMs: 40 });
  assert.equal(r.routed, null);
  await sleep(200);
  assert.deepEqual([late.calls.filter((c) => c === "enqueue_job").length, late.calls.filter((c) => c === "router_commit" || c === "routing_commit").length], [1, 0], "the job has it; the inline run wrote nothing");
  const claimed = make({ commitMs: 120 });
  const c = await routeFillWith(claimed.rpc, WS, "c1", "s2", { budgetMs: 40 });
  assert.equal(c.routed?.kind, "owner");
  assert.deepEqual([claimed.calls.filter((x) => x === "enqueue_job").length, claimed.runs.size], [0, 1], "no job: the inline commit owned it");
  const failing = make({});
  const broken: Rpc = (fn, args) => (fn === "routing_facts" || fn === "router_facts_full" ? Promise.resolve({ data: null, error: { message: "connection reset" } }) : failing.rpc(fn, args));
  assert.equal((await routeFillWith(broken, WS, "c1", "s3")).routed, null);
  assert.equal(failing.calls.filter((x) => x === "enqueue_job").length, 1, "a failing read hands it to the job, once");
});

const type = (o: Partial<MeetingType["settings"]> = {}, kind: MeetingType["kind"] = "round_robin"): MeetingType => ({
  id: "0192f3a1-0000-7000-8000-0000000000ee",
  workspace_id: WS,
  slug: "demo",
  name: "Demo",
  kind,
  hosts: [{ user_id: ANA, weight: 1 }, { user_id: BEN, weight: 1 }],
  settings: { ...DEFAULT_SETTINGS, notice: 0, window: 1, ...o },
  secret: false,
  active: true,
  owner_user_id: null,
  template_id: null,
  locked: [],
});

function cal(o: { turnsMs?: number } = {}) {
  invalidateRouterLive();
  resetNewer();
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const rpc: Rpc = async (fn, args) => {
    calls.push({ fn, args });
    if (fn === "meeting_inputs") return { data: (args.p_users as string[]).map((id) => ({ id, availability: DEFAULT_AVAILABILITY(TZ), connected: true, reconnect: false, busy: [], booked: [] })), error: null };
    if (fn === "rr_turns") {
      await sleep(o.turnsMs ?? 0);
      return { data: [{ user_id: ANA, n: 3, last: new Date(NOW).toISOString() }], error: null };
    }
    if (fn === "meeting_book_all") return { data: { id: "m1", team: null }, error: null };
    return { data: null, error: null };
  };
  return { rpc, calls, names: () => calls.map((c) => c.fn) };
}

test("a booking link that prefers a host: their times and the type's come from one calendar read", async () => {
  const d = cal();
  const profiles = [{ user_id: BEN, slug: "ben", name: "Ben", headline: null, photo_url: null }];
  const slots = await preferredSlots(d.rpc, { ws: WS, type: type(), length: 30, host: "ben", profiles: profiles as never, now: NOW });
  assert.ok(slots.length > 0);
  assert.equal(d.names().filter((n) => n === "meeting_inputs").length, 1);
});

test("a confirm: the round robin's turns are read alongside the live check, and the tail goes with the booking in one call", async () => {
  const d = cal({ turnsMs: 120 });
  const live = async () => (await sleep(120), new Set<string>());
  const t0 = Date.now();
  const r = await book(d.rpc, { ws: WS, type: type(), length: 30, start: TEN, guest: { email: "lee@client.io", name: "Lee" }, source: "page", contactId: Promise.resolve(null), guestRow: { email: "lee@client.io" }, now: NOW, liveBusy: live });
  const took = Date.now() - t0;
  assert.ok(r.ok && r.tail);
  assert.deepEqual(r.hosts, [BEN], "Ana has had more turns");
  assert.ok(took < 220, `took ${took} ms: turns and the live check together`);
  const all = d.calls.find((c) => c.fn === "meeting_book_all")!.args;
  assert.deepEqual([all.p_contact, all.p_contact_row, all.p_sync, all.p_team], [null, { email: "lee@client.io" }, true, null]);
  assert.ok(!d.names().some((n) => n === "meeting_token_keep" || n === "enqueue_job" || n === "meeting_contact_make"), "nothing after the booking");
  const known = cal();
  const k = await book(known.rpc, { ws: WS, type: type({}, "one"), length: 30, start: TEN, guest: { email: "lee@client.io" }, source: "page", contactId: Promise.resolve("c9"), guestRow: { email: "lee@client.io" }, now: NOW, liveBusy: async () => new Set() });
  assert.ok(k.ok);
  const args = known.calls.find((c) => c.fn === "meeting_book_all")!.args;
  assert.deepEqual([args.p_contact, args.p_contact_row], ["c9", null], "a known contact isn't made again");
});

test("the hosted form page is plain HTML with the versioned script in its head; a bad id says so", () => {
  const html = hostedFormHtml(FORM, { framed: false, script: "/forms/v1.abc123abc123.js" });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<head>[\s\S]*<script src="\/forms\/v1\.abc123abc123\.js" async><\/script>[\s\S]*<\/head>/);
  assert.match(html, new RegExp(`<claritia-form form-id="${FORM}"></claritia-form>`));
  assert.ok(!/_next/.test(html), "no app framework");
  assert.match(hostedFormHtml(FORM, { framed: true, script: "/forms/v1.js" }), /<html lang="en" class="framed">/);
  const bad = hostedFormHtml("<script>", { framed: false, script: "/forms/v1.js" });
  assert.match(bad, /Form not found\./);
  assert.ok(!bad.includes("<script>") && !bad.includes("claritia-form"));
});

test("the form script: the build's hash is cached for good, the plain address and older hashes briefly, anything else 404", async () => {
  const code = new TextEncoder().encode("console.log(1)");
  const s = { code, hash: scriptHash(code) };
  const now = await scriptResponse(`v1.${s.hash}.js`, s);
  assert.equal(now.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal(await now.text(), "console.log(1)");
  assert.match((await scriptResponse("v1.js", s)).headers.get("cache-control")!, /max-age=300/);
  const older = await scriptResponse("v1.000000000000.js", s);
  assert.deepEqual([older.status, older.headers.get("cache-control")?.includes("max-age=300")], [200, true], "a page cached before a deploy still gets a script");
  assert.equal((await scriptResponse("v2.js", s)).status, 404);
  assert.equal((await scriptResponse("v1.js", null)).status, 503);
});

test("the embed places the form in the page and loads the script once; the frame only when asked, lazy only below the fold", () => {
  const js = embedScript("https://app.tryclaritia.com", "/forms/v1.abc123abc123.js");
  assert.ok(js.includes(`"https://app.tryclaritia.com"+"/forms/v1.abc123abc123.js"`) || js.includes(`B+"/forms/v1.abc123abc123.js"`));
  assert.match(js, /createElement\("claritia-form"\)/);
  assert.match(js, /hasAttribute\("data-claritia-iframe"\)/);
  assert.match(js, /if\(below\(el\)\)fr\.loading="lazy"/);
  assert.match(js, /claritia:submit/);
  // It parses as a script.
  new Function(js);
});
