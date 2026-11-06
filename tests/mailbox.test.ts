// Sending as the host (docs/integrations-plan.md, Next step 6; src/lib/mailbox, worker-intel/jobs/email.ts): Gmail and
// Outlook sends, and the flaky cases the reliability rule asks for: a revoked sign-in falls back to Resend and tells
// the person once, a mailbox at its daily limit waits until it has room, a 5xx is tried again and sends once, and a
// send with no answer is never sent again.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Outgoing } from "../src/lib/email/provider.ts";
import type { Claimed } from "../src/lib/email/render.ts";
import type { Rpc } from "../src/lib/jobs.ts";
import { reconnectNote, viaMailbox } from "../src/lib/mailbox/server.ts";
import { sendAs, type Mailbox } from "../src/lib/mailbox/send.ts";
import { sealToken } from "../src/lib/meetings/providers/index.ts";
import { mailboxRaw, mailboxRound } from "../worker-intel/jobs/email.ts";

process.env.SECRETS_KEY ??= "s".repeat(40);
process.env.GOOGLE_CLIENT_ID = "gid";
process.env.GOOGLE_CLIENT_SECRET = "gsecret";
process.env.MICROSOFT_CLIENT_ID = "mid";
process.env.MICROSOFT_CLIENT_SECRET = "msecret";

const RAW = "From: Ada <ada@acme.com>\r\nTo: bo@lead.io\r\nSubject: Hi\r\n\r\nHello";
const fresh = () => ({ access: "tok1", refresh: "r1", expiresAt: Date.now() + 3600_000 });
const gmail = (tok = fresh()): Mailbox => ({ id: "mb1", provider: "gmail", email: "ada@acme.com", tok });
type Call = { url: string; body: string; headers: Headers };
function net(answers: (Response | Error)[]) {
  const calls: Call[] = [];
  const list = [...answers];
  const fetcher = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, body: String(init.body ?? ""), headers: new Headers(init.headers) });
    const a = list.shift();
    if (!a) throw new Error("no more answers");
    if (a instanceof Error) throw a;
    return a;
  }) as unknown as typeof fetch;
  return { calls, fetcher };
}
const json = (j: unknown, status = 200) => new Response(JSON.stringify(j), { status, headers: { "content-type": "application/json" } });

test("Gmail and Outlook: the whole message, each in its own format", async () => {
  const g = net([json({ id: "gm1" })]);
  assert.deepEqual(await sendAs(gmail(), RAW, { fetcher: g.fetcher }), { status: "sent", id: "gm1" });
  assert.equal(g.calls[0]!.url, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
  assert.equal(Buffer.from(JSON.parse(g.calls[0]!.body).raw, "base64url").toString(), RAW);
  const o = net([new Response(null, { status: 202 })]);
  assert.equal((await sendAs({ ...gmail(), provider: "outlook" }, RAW, { fetcher: o.fetcher })).status, "sent");
  assert.equal(o.calls[0]!.url, "https://graph.microsoft.com/v1.0/me/sendMail");
  assert.equal(o.calls[0]!.headers.get("content-type"), "text/plain");
  assert.equal(Buffer.from(o.calls[0]!.body, "base64").toString(), RAW);
});

test("the sign-in: refreshed before it runs out and once on a 401; refused means reconnect", async () => {
  const saved: unknown[] = [];
  const r = net([json({ access_token: "tok2", expires_in: 3600 }), json({ id: "gm2" })]);
  assert.equal((await sendAs(gmail({ access: "old", refresh: "r1", expiresAt: Date.now() - 1 }), RAW, { fetcher: r.fetcher, save: async (t) => void saved.push(t) })).status, "sent");
  assert.equal(r.calls[1]!.headers.get("authorization"), "Bearer tok2");
  assert.equal(saved.length, 1);
  const again = net([json({ error: "x" }, 401), json({ access_token: "tok3", expires_in: 3600 }), json({ id: "gm3" })]);
  assert.equal((await sendAs(gmail(), RAW, { fetcher: again.fetcher })).status, "sent");
  const revoked = net([json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400)]);
  assert.equal((await sendAs(gmail({ access: "old", refresh: "r1", expiresAt: 0 }), RAW, { fetcher: revoked.fetcher })).status, "reconnect");
  const scope = net([json({ error: { message: "Request had insufficient authentication scopes." } }, 403)]);
  assert.equal((await sendAs(gmail(), RAW, { fetcher: scope.fetcher })).status, "reconnect");
  assert.equal((await sendAs(gmail(), RAW, { fetcher: net([json({ error: { message: "Backend Error" } }, 503)]).fetcher })).status, "retry");
  assert.equal((await sendAs(gmail(), RAW, { fetcher: net([Object.assign(new Error("t"), { name: "TimeoutError" })]).fetcher })).status, "unknown");
  assert.equal((await sendAs(gmail(), RAW, { fetcher: net([json({ error: { message: "Invalid To header" } }, 400)]).fetcher })).status, "failed");
});

/** The database side of mailboxes, in memory. */
function db(o: { box?: Partial<{ sent_day: number; limit: number; room_at: string | null }> | null } = {}) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  let told = false;
  const rpc: Rpc = async (fn, args) => {
    calls.push({ fn, args });
    if (fn === "mailbox_for")
      return { data: o.box === null ? null : { id: "mb1", provider: "gmail", email: "ada@acme.com", sealed: sealToken(fresh()), sent_day: 0, limit: 450, room_at: null, ...o.box }, error: null };
    if (fn === "mailbox_broken") {
      const tell = !told;
      told = true;
      return { data: { tell, email: "ada@acme.com", mailbox: "ada@acme.com" }, error: null };
    }
    return { data: null, error: null };
  };
  return { rpc, calls };
}

test("a mailbox at its daily limit waits until the oldest send is a day old; none at all sends the usual way", async () => {
  const now = Date.parse("2026-11-06T12:00:00Z");
  const full = db({ box: { sent_day: 450, room_at: "2026-11-07T09:00:00Z" } });
  assert.deepEqual(await viaMailbox(full.rpc, "ws1", "u1", () => RAW, { now: () => now, fetcher: net([]).fetcher }), { kind: "full", waitS: 21 * 3600 });
  assert.deepEqual(await viaMailbox(db({ box: null }).rpc, "ws1", "u1", () => RAW), { kind: "none" });
  assert.deepEqual(await viaMailbox(db().rpc, "ws1", null, () => RAW), { kind: "none" });
  const ok = db();
  const n = net([json({ id: "gm9" })]);
  assert.deepEqual(await viaMailbox(ok.rpc, "ws1", "u1", (from) => RAW.replace("ada@acme.com", from), { fetcher: n.fetcher }), { kind: "done", out: { status: "sent", id: "gm9" } });
  assert.ok(ok.calls.some((c) => c.fn === "mailbox_sent"));
});

const claimed = (id: string, sender_user: string | null = "u1") => ({ id, to: "bo@lead.io", sender_user, attempts: 1 }) as unknown as Claimed;
const render = (m: Claimed): Outgoing => ({ from: '"Ada Park" <hello@acme.com>', to: m.to, subject: "Hi", html: "<p>Hi</p>", text: "Hi", headers: [{ name: "List-Unsubscribe", value: "<https://x/u>" }], tags: {} });

test("flaky: a revoked sign-in falls back to Resend and tells the person once, for two emails in a row", async () => {
  const d = db();
  const told: unknown[] = [];
  const sender = { send: async (out: Outgoing, key: string) => (told.push({ to: out.to, key }), "re1"), batch: async () => [] };
  const revoked = () => json({ error: "invalid_grant" }, 400);
  const r = await mailboxRound(d.rpc, "ws1", [claimed("m1"), claimed("m2"), claimed("m3", null)], render, {
    sender,
    base: "https://app.tryclaritia.com",
    fetcher: net([json({ error: "x" }, 401), revoked(), json({ error: "x" }, 401), revoked()]).fetcher,
  });
  assert.deepEqual(r.results, []);
  assert.deepEqual(r.rest.map((m) => m.id), ["m1", "m2", "m3"], "all three go the usual way");
  assert.equal(told.length, 1, "told once");
  assert.equal((told[0] as { to: string }).to, "ada@acme.com");
  assert.match(reconnectNote({ email: "ada@acme.com", mailbox: "ada@acme.com", provider: "gmail" }, "https://app.tryclaritia.com").text, /Reconnect Gmail/);
});

test("flaky: a 5xx from Gmail is tried again and sends once; a full mailbox waits without a try; no answer is never resent", async () => {
  const d = db();
  const five = await mailboxRound(d.rpc, "ws1", [claimed("m1")], render, { sender: null, base: "", fetcher: net([json({ error: { message: "Backend Error" } }, 503)]).fetcher });
  assert.deepEqual(five.results.map((x) => x.outcome), ["retry"]);
  const next = net([json({ id: "gm1" })]);
  const again = await mailboxRound(d.rpc, "ws1", [claimed("m1")], render, { sender: null, base: "", fetcher: next.fetcher });
  assert.deepEqual(again.results.map((x) => [x.outcome, x.providerId]), [["ok", "gm1"]]);
  assert.equal(next.calls.length, 1);
  const sent = Buffer.from(JSON.parse(next.calls[0]!.body).raw, "base64url").toString();
  assert.match(sent, /From: "?Ada Park"? <ada@acme\.com>/);
  assert.match(sent, /List-Unsubscribe: <https:\/\/x\/u>/);
  const full = await mailboxRound(db({ box: { sent_day: 450, room_at: new Date(Date.now() + 7200_000).toISOString() } }).rpc, "ws1", [claimed("m4")], render, { sender: null, base: "" });
  assert.equal(full.results[0]!.outcome, "wait");
  assert.ok(full.results[0]!.delayS! >= 7100 && full.results[0]!.delayS! <= 7200);
  const lost = await mailboxRound(db().rpc, "ws1", [claimed("m5")], render, { sender: null, base: "", fetcher: net([Object.assign(new Error("t"), { name: "TimeoutError" })]).fetcher });
  assert.equal(lost.results[0]!.outcome, "unknown");
  assert.equal(mailboxRaw(render(claimed("x")), "ada@acme.com").split("\r\n")[0], 'From: "Ada Park" <ada@acme.com>');
});
