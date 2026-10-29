// Meeting webhooks (src/lib/meetings/webhooks.ts, worker-intel/jobs/webhooks.ts): the address check, the signature a
// receiver can verify, how each answer is read, and the flaky cases the reliability rule asks for: a 503 then a 200
// with the same bytes both times, a timeout, a 429 with Retry-After, a failure on the last try, a paused endpoint,
// a private address and a redirect.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import type { Job, Rpc } from "../src/lib/jobs.ts";
import { JobError } from "../src/lib/jobs.ts";
import { seal } from "../src/lib/seal.ts";
import { tokenHash } from "../src/lib/meetings/server.ts";
import { checkEndpoint, firstBody, sampleBody, sealEndpoint, sendWebhook, signature, type Body, type Taken } from "../src/lib/meetings/webhooks.ts";
import { meetingWebhook, webhookOnce } from "../worker-intel/jobs/webhooks.ts";

const KEY = "k".repeat(40);
const PUBLIC = async () => [{ address: "93.184.216.34", family: 4 }];
const resolve = PUBLIC as never;
const ID = "11111111-1111-4111-8111-111111111111";

test("the address check: https only, no passwords, at least one event", () => {
  assert.deepEqual(checkEndpoint({ url: " https://hooks.zapier.com/x/1 ", events: ["meeting.booked", "nope"] }), { url: "https://hooks.zapier.com/x/1", events: ["meeting.booked"], description: null, active: null });
  assert.ok("error" in checkEndpoint({ url: "http://a.io" }));
  assert.ok("error" in checkEndpoint({ url: "https://u:p@a.io" }));
  assert.ok("error" in checkEndpoint({ url: "not a url" }));
  assert.ok("error" in checkEndpoint({ url: "https://a.io", events: [] }));
  assert.equal((checkEndpoint({ description: "x".repeat(200) }) as { description: string }).description!.length, 120);
});

test("a receiver can check the signature with the secret", () => {
  const body = JSON.stringify({ a: 1 });
  const h = signature("whsec_x", body, 1_700_000_000);
  const [t, v1] = h.split(",").map((p) => p.split("=")[1]!);
  assert.equal(t, "1700000000");
  assert.equal(v1, createHmac("sha256", "whsec_x").update(`${t}.${body}`).digest("hex"));
});

type Call = { url: string; init: RequestInit };
const answers = (...list: (Response | Error)[]) => {
  const calls: Call[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = list.shift();
    if (!next) throw new Error("no more answers");
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  return { calls, fetcher };
};
const body = (): Body => sampleBody("meeting.booked", "ws1", new Date("2026-10-29T15:00:00Z"));

test("answers: 2xx done; 5xx, 429 and timeouts retry; redirects and other 4xx fail; private and http never send", async () => {
  const send = (fetcher: typeof fetch, url = "https://hooks.example.com/in") => sendWebhook({ url, secret: "s", delivery: ID, body: body() }, { fetcher, resolve, now: () => 1_700_000_000_000 });
  const ok = answers(new Response(null, { status: 204 }));
  assert.deepEqual(await send(ok.fetcher), { status: "done", code: 204 });
  const h = ok.calls[0]!.init.headers as Record<string, string>;
  assert.equal(h["x-claritia-event"], "meeting.booked");
  assert.equal(h["x-claritia-delivery"], ID);
  assert.equal(h["x-claritia-signature"], signature("s", ok.calls[0]!.init.body as string, 1_700_000_000));
  assert.equal(ok.calls[0]!.init.redirect, "manual");

  assert.equal((await send(answers(new Response("", { status: 503 })).fetcher)).status, "retry");
  assert.deepEqual(await send(answers(new Response("", { status: 429, headers: { "retry-after": "120" } })).fetcher), { status: "retry", code: 429, error: "It answered 429.", retryAfterS: 120 });
  const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
  assert.deepEqual(await send(answers(timeout).fetcher), { status: "retry", code: null, error: "No answer within 15 seconds." });
  assert.equal((await send(answers(new TypeError("fetch failed")).fetcher)).status, "retry");
  assert.equal((await send(answers(new Response("", { status: 302 })).fetcher)).status, "failed");
  const gone = await send(answers(new Response("no such hook", { status: 410 })).fetcher);
  assert.deepEqual(gone, { status: "failed", code: 410, error: "It answered 410: no such hook" });

  const never = answers();
  assert.equal((await send(never.fetcher, "https://localhost/x")).status, "failed");
  assert.equal((await sendWebhook({ url: "https://10.0.0.5/x", secret: "s", delivery: ID, body: body() }, { fetcher: never.fetcher })).status, "failed");
  assert.equal((await send(never.fetcher, "http://hooks.example.com/x")).status, "failed");
  assert.equal(never.calls.length, 0, "nothing was sent to a private or http address");
});

/** The database side of one send, in memory: webhook_take, webhook_freeze and webhook_done. */
function fakeDb(o: { active?: boolean; event?: string; status?: string } = {}) {
  const token = "guest-token";
  const row = {
    id: ID,
    event: o.event ?? "meeting.booked",
    body: { ...body(), test: false, event: o.event ?? "meeting.booked" } as Body,
    frozen: false,
    attempts: 0,
    status: "pending",
    code: null as number | null,
    error: null as string | null,
  };
  const ep = sealEndpoint("https://hooks.example.com/in", "whsec_abc", KEY);
  const meeting = { id: "m1", token_hash: tokenHash(token), token_sealed: seal(token, KEY), status: o.status ?? "booked", location: { url: "https://meet.google.com/real-link" } };
  const freezes: unknown[] = [];
  const rpc: Rpc = async (fn, args) => {
    if (fn === "webhook_take") {
      if (row.status === "done") return { data: null, error: null };
      row.attempts += 1;
      const t: Taken = { id: row.id, event: row.event, body: structuredClone(row.body), frozen: row.frozen, attempts: row.attempts, active: o.active ?? true, sealed: ep.sealed, meeting };
      return { data: t, error: null };
    }
    if (fn === "webhook_freeze") {
      freezes.push(args.p_body);
      if (!row.frozen) {
        row.body = structuredClone(args.p_body as Body);
        row.frozen = true;
      }
      return { data: null, error: null };
    }
    if (fn === "webhook_done") {
      row.status = String(args.p_status);
      row.code = (args.p_code as number | null) ?? null;
      row.error = (args.p_error as string | null) ?? null;
      return { data: null, error: null };
    }
    return { data: null, error: { message: `unexpected ${fn}` } };
  };
  return { rpc, row, freezes };
}
const deps = (fetcher: typeof fetch) => ({ fetcher, resolve, base: "https://claritia.com", secret: KEY });

test("flaky: a 503 then a 200 sends the same bytes and id twice, with the video and manage links from the first try", async () => {
  const db = fakeDb();
  const net = answers(new Response("", { status: 503 }), new Response("ok", { status: 200 }));
  const first = await webhookOnce(db.rpc, deps(net.fetcher), ID, false);
  assert.deepEqual(first, { retry: { error: "It answered 503.", retryAfterS: undefined } });
  assert.equal(db.row.status, "retrying");
  assert.equal(db.row.frozen, true);
  const second = await webhookOnce(db.rpc, deps(net.fetcher), ID, false);
  assert.deepEqual(second, {});
  assert.equal(db.row.status, "done");
  assert.equal(db.row.code, 200);
  assert.equal(db.freezes.length, 1, "the body is filled once");
  const [a, b] = net.calls.map((c) => c.init.body as string);
  assert.equal(a, b, "every try sends the same bytes");
  const sent = JSON.parse(a!) as Body;
  assert.equal(sent.data.meeting.manage_url, "https://claritia.com/book/m/guest-token");
  assert.equal((sent.data.meeting.location as { url: string }).url, "https://meet.google.com/real-link");
  assert.equal((net.calls[1]!.init.headers as Record<string, string>)["x-claritia-delivery"], ID);
  // Done means done: a late duplicate job sends nothing.
  assert.deepEqual(await webhookOnce(db.rpc, deps(answers().fetcher), ID, false), {});
});

test("flaky: a timeout on the last try marks the send failed and stops", async () => {
  const db = fakeDb();
  const net = answers(Object.assign(new Error("t"), { name: "TimeoutError" }));
  assert.deepEqual(await webhookOnce(db.rpc, deps(net.fetcher), ID, true), {});
  assert.equal(db.row.status, "failed");
  assert.equal(db.row.error, "No answer within 15 seconds.");
});

test("the job: a retry goes back to the queue with Retry-After; a bad payload never retries", async () => {
  const db = fakeDb();
  const handler = meetingWebhook(db.rpc, deps(answers(new Response("", { status: 429, headers: { "retry-after": "90" } })).fetcher));
  const job: Job = { id: "j", workspace_id: "ws1", kind: "meeting_webhook", key: ID, payload: { delivery_id: ID }, attempts: 1, max_attempts: 8 };
  await assert.rejects(handler(job, new AbortController().signal), (e: unknown) => e instanceof JobError && e.retry && e.retryAfterS === 90);
  await assert.rejects(handler({ ...job, payload: {} }, new AbortController().signal), (e: unknown) => e instanceof JobError && !e.retry);
});

test("a paused endpoint sends nothing; a canceled meeting carries no manage link", async () => {
  const paused = fakeDb({ active: false });
  const net = answers();
  await webhookOnce(paused.rpc, deps(net.fetcher), ID, false);
  assert.equal(paused.row.status, "failed");
  assert.equal(net.calls.length, 0);

  const db = fakeDb({ event: "meeting.canceled", status: "canceled" });
  const sent = answers(new Response("", { status: 200 }));
  await webhookOnce(db.rpc, deps(sent.fetcher), ID, false);
  assert.equal((JSON.parse(sent.calls[0]!.init.body as string) as Body).data.meeting.manage_url, null);
});

test("a test body is sent as it is", () => {
  const t = { id: ID, event: "meeting.booked", body: body(), frozen: true, attempts: 1, active: true, sealed: "", meeting: null } satisfies Taken;
  assert.equal(firstBody(t, "https://x"), t.body);
  assert.equal(t.body.test, true);
});
