// Sending (docs/enrich-workflows-reports.md Part 0): Resend's answers and keys, batches, link tokens, rendering with
// one-click unsubscribe, webhook signatures, event parsing, DNS record checks, and the SMTP relay for raw mail.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import net from "node:net";
import { test } from "node:test";
import { checkRecords, expectedRecords, hostOf, type Resolver } from "../src/lib/email/domains.ts";
import { fromHeader, outcomeOf, SendError, type Outgoing } from "../src/lib/email/provider.ts";
import { renderMessage, type Claimed } from "../src/lib/email/render.ts";
import { batchKey, resendClient, type ResendDomain } from "../src/lib/email/resend.ts";
import { dotStuff, smtpSend } from "../src/lib/email/smtp.ts";
import { extractLinks, looksLikeScanner, makeToken, readToken, rewriteLinks } from "../src/lib/email/track.ts";
import { checkSvix, parseResendEvent } from "../src/lib/email/webhook.ts";
import { sendRound, type Sender } from "../worker-intel/jobs/email.ts";

const SECRET = "x".repeat(40);

const answer = (status: number, body: object | string, headers: Record<string, string> = {}) => (async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers })) as unknown as typeof fetch;
const msg: Outgoing = { from: "a@b.co", to: "c@d.co", subject: "s", html: "h", text: "t", headers: [], tags: {} };

test("Resend answers sort into sent, later, try again, failed and unknown, and every send carries its key", async () => {
  const client = (f: typeof fetch) => resendClient({ apiKey: "re_test", fetchFn: f });
  let seen: RequestInit | undefined;
  let url = "";
  const id = await client((async (u: string, init: RequestInit) => {
    url = u;
    seen = init;
    return new Response(JSON.stringify({ id: "r-1" }), { status: 200 });
  }) as typeof fetch).send({ ...msg, replyTo: "r@d.co", headers: [{ name: "List-Unsubscribe", value: "<https://x/u/1>" }], tags: { message: "abc" } }, "msg:1");
  assert.equal(id, "r-1");
  assert.equal(url, "https://api.resend.com/emails");
  const h = seen?.headers as Record<string, string>;
  assert.equal(h.Authorization, "Bearer re_test");
  assert.equal(h["Idempotency-Key"], "msg:1");
  const sent = JSON.parse(String(seen?.body));
  assert.deepEqual(sent.to, ["c@d.co"]);
  assert.equal(sent.reply_to, "r@d.co");
  assert.deepEqual(sent.headers, { "List-Unsubscribe": "<https://x/u/1>" });
  assert.deepEqual(sent.tags, [{ name: "message", value: "abc" }]);

  const fails = async (f: typeof fetch) => client(f).send(msg, "k").then(() => assert.fail("should throw"), (e: SendError) => e);
  const limited = await fails(answer(429, { name: "rate_limit_exceeded", message: "Too many requests" }, { "retry-after": "7" }));
  assert.equal(outcomeOf(limited), "later");
  assert.equal(limited.retryAfterS, 7);
  const invalid = await fails(answer(422, { name: "validation_error", message: "Invalid `to` field." }));
  assert.equal(outcomeOf(invalid), "failed");
  assert.ok(invalid.invalid);
  assert.equal(outcomeOf(await fails(answer(403, { name: "validation_error", message: "The domain is not verified." }))), "failed");
  assert.equal(outcomeOf(await fails(answer(503, "Service Unavailable"))), "retry");
  assert.equal(outcomeOf(await fails(answer(409, { name: "concurrent_idempotent_requests", message: "Same key in flight" }))), "later");
  assert.equal(outcomeOf(await fails(answer(409, { name: "invalid_idempotent_request", message: "Key used for other content" }))), "unknown");
  const timeout = await fails((async () => {
    throw new Error("The operation was aborted due to timeout");
  }) as unknown as typeof fetch);
  assert.equal(outcomeOf(timeout), "unknown");
  assert.equal(outcomeOf(await fails(answer(200, {}))), "unknown", "taken with no id");
});

test("a batch is one call keyed by its messages; its ids come back in order", async () => {
  let body: unknown[] = [];
  let key = "";
  const ids = await resendClient({ apiKey: "k", fetchFn: (async (_u: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    key = (init.headers as Record<string, string>)["Idempotency-Key"];
    return new Response(JSON.stringify({ data: [{ id: "a" }, { id: "b" }] }), { status: 200 });
  }) as typeof fetch }).batch([{ out: msg, key: "msg:1" }, { out: { ...msg, to: "e@f.co" }, key: "msg:2" }]);
  assert.deepEqual(ids, ["a", "b"]);
  assert.equal(body.length, 2);
  assert.equal(key, batchKey(["msg:1", "msg:2"]));
  assert.notEqual(batchKey(["msg:1", "msg:2"]), batchKey(["msg:2", "msg:1"]));
  const short = await resendClient({ apiKey: "k", fetchFn: answer(200, { data: [{ id: "a" }] }) }).batch([{ out: msg, key: "1" }, { out: msg, key: "2" }]).catch((e: SendError) => e);
  assert.equal(outcomeOf(short), "unknown", "ids that don't match the batch are unclear");
});

const claimedRow = (id: string, attempts = 1) => ({ id, attempts }) as Claimed;

test("a round: first tries share a batch; a retried message goes alone with its own key", async () => {
  const calls: string[] = [];
  const sender: Sender = {
    send: async (_m, key) => (calls.push(`one ${key}`), `id-${key}`),
    batch: async (items) => (calls.push(`batch ${items.map((i) => i.key).join(",")}`), items.map((i) => `id-${i.key}`)),
  };
  const r = await sendRound(sender, [claimedRow("a"), claimedRow("b"), claimedRow("c", 2)], () => msg);
  assert.deepEqual(calls.sort(), ["batch msg:a,msg:b", "one msg:c"]);
  assert.deepEqual(r.map((x) => `${x.id}:${x.outcome}`).sort(), ["a:ok", "b:ok", "c:ok"]);
});

test("a round on a flaky provider: a bad address is found one by one, a batch timeout is never resent, a rate limit sends nothing", async () => {
  const run = (batchErr: SendError, one: (key: string) => Promise<string>) =>
    sendRound({ send: (_m, key) => one(key), batch: async () => Promise.reject(batchErr) }, [claimedRow("a"), claimedRow("b")], () => msg);

  const bad = await run(new SendError("422", { status: 422, invalid: true }), async (key) => {
    if (key === "msg:b") throw new SendError("Invalid to", { status: 422, invalid: true });
    return "ok-a";
  });
  assert.deepEqual(bad.map((x) => `${x.id}:${x.outcome}`), ["a:ok", "b:failed"]);

  let singles = 0;
  const unclear = await run(new SendError("timeout", { unknown: true }), async () => (singles++, "x"));
  assert.deepEqual(unclear.map((x) => x.outcome), ["unknown", "unknown"]);
  const server = await run(new SendError("500", { status: 500, retry: true }), async () => (singles++, "x"));
  assert.deepEqual(server.map((x) => x.outcome), ["unknown", "unknown"], "a batch's key can't protect a repeat");
  assert.equal(singles, 0, "nothing is sent again one by one");

  const limited = await run(new SendError("429", { status: 429, later: true, retryAfterS: 30 }), async () => "x");
  assert.deepEqual(limited.map((x) => `${x.outcome}:${x.delayS}`), ["later:30", "later:30"]);

  // A single send's timeout is safe to repeat: the same key gives the same email.
  const one = await sendRound({ send: async () => Promise.reject(new SendError("timeout", { unknown: true })), batch: async () => [] }, [claimedRow("z")], () => msg);
  assert.equal(one[0].outcome, "retry");
  const reused = await sendRound({ send: async () => Promise.reject(new SendError("409", { status: 409, unknown: true })), batch: async () => [] }, [claimedRow("z")], () => msg);
  assert.equal(reused[0].outcome, "unknown", "a key Resend saw with other content may have sent");
});

test("From names are quoted, or MIME-encoded when not plain ASCII", () => {
  assert.equal(fromHeader("Acme", "hi@acme.com"), `"Acme" <hi@acme.com>`);
  assert.equal(fromHeader(`Acme "Labs"`, "hi@acme.com"), `"Acme \\"Labs\\"" <hi@acme.com>`);
  assert.equal(fromHeader("Café\r\nBcc: x", "hi@acme.com"), `=?UTF-8?B?${Buffer.from("Café Bcc: x").toString("base64")}?= <hi@acme.com>`);
  assert.equal(fromHeader(null, "hi@acme.com"), "hi@acme.com");
});

test("link tokens round-trip, and a changed byte or another key fails", () => {
  const message = "0190f5a2-1c3b-7d4e-8f90-123456789abc";
  const t = makeToken({ kind: "click", message, link: 7 }, SECRET);
  assert.deepEqual(readToken(t, SECRET), { kind: "click", message, link: 7 });
  assert.deepEqual(readToken(makeToken({ kind: "unsub", message, link: 0 }, SECRET), SECRET), { kind: "unsub", message, link: 0 });
  assert.equal(readToken(t, "y".repeat(40)), null);
  const [body, mac] = t.split(".");
  const flipped = Buffer.from(body, "base64url");
  flipped[19] ^= 1;
  assert.equal(readToken(`${flipped.toString("base64url")}.${mac}`, SECRET), null);
  assert.equal(readToken("nonsense", SECRET), null);
  assert.equal(readToken("", SECRET), null);
  assert.throws(() => makeToken({ kind: "click", message, link: 0 }, "short"), /SECRETS_KEY/);
});

test("links are listed and rewritten in the same order; mailto, anchors and tokens stay", () => {
  const html = `<p><a href="https://acme.com/a?x=1&amp;y=2">A</a> <a class="b" href='http://acme.com/b'>B</a> <a href="mailto:hi@acme.com">M</a> <a href="#top">T</a> <a href="{{unsubscribe}}">U</a> <A HREF="https://acme.com/a?x=1&amp;y=2">A again</A></p>`;
  assert.deepEqual(extractLinks(html), ["https://acme.com/a?x=1&y=2", "http://acme.com/b", "https://acme.com/a?x=1&y=2"]);
  const out = rewriteLinks(html, (i) => `https://t/c/${i}`);
  assert.equal(out, `<p><a href="https://t/c/0">A</a> <a class="b" href='https://t/c/1'>B</a> <a href="mailto:hi@acme.com">M</a> <a href="#top">T</a> <a href="{{unsubscribe}}">U</a> <A HREF="https://t/c/2">A again</A></p>`);
});

test("mail filters are told apart from people by method and user agent", () => {
  const chrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
  assert.equal(looksLikeScanner("GET", chrome), false);
  assert.equal(looksLikeScanner("HEAD", chrome), true);
  assert.equal(looksLikeScanner("GET", ""), true);
  assert.equal(looksLikeScanner("GET", null), true);
  assert.equal(looksLikeScanner("GET", "Mozilla/5.0 (compatible; Barracuda Sentinel)"), true);
  assert.equal(looksLikeScanner("GET", "python-requests/2.31"), true);
  assert.equal(looksLikeScanner("GET", "Mozilla/5.0 (Windows NT 10.0) Microsoft Outlook SafeLinks"), true);
});

const claimed = (o: Partial<Claimed> = {}): Claimed => ({
  id: "0190f5a2-1c3b-7d4e-8f90-123456789abc",
  to: "dana@example.com",
  contact_id: "c1",
  email_id: "e1",
  kind: "broadcast",
  marketing: true,
  subject: "Hello\nthere",
  preheader: "Peek <in>",
  html: `<html><body><p>Hi</p><a href="https://acme.com/x">Go</a></body></html>`,
  text: "Hi\n",
  links: ["https://acme.com/x"],
  from_name: "Acme",
  from_email: "news@mail.acme.com",
  reply_to: "team@acme.com",
  address: "1 Main St, Springfield",
  topic: null,
  mail_from: "bounce.mail.acme.com",
  per_second: 14,
  ...o,
});

test("a marketing email gets tracked links, the footer and one-click unsubscribe headers", () => {
  const out = renderMessage(claimed(), { base: "https://app.test", secret: SECRET });
  assert.equal(out.from, `"Acme" <news@mail.acme.com>`);
  assert.equal(out.subject, "Hello there");
  assert.equal(out.replyTo, "team@acme.com");
  const unsub = out.headers.find((h) => h.name === "List-Unsubscribe")?.value ?? "";
  assert.match(unsub, /^<https:\/\/app\.test\/u\/[\w-]+\.[\w-]+>$/);
  assert.deepEqual(out.headers.find((h) => h.name === "List-Unsubscribe-Post"), { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" });
  const token = unsub.slice("<https://app.test/u/".length, -1);
  assert.deepEqual(readToken(token, SECRET), { kind: "unsub", message: claimed().id, link: 0 });
  const click = out.html.match(/href="https:\/\/app\.test\/c\/([^"]+)"/)?.[1] ?? "";
  assert.deepEqual(readToken(click, SECRET), { kind: "click", message: claimed().id, link: 0 });
  assert.ok(!out.html.includes("https://acme.com/x"));
  assert.match(out.html, /<body><div style="display:none[^>]*>Peek &lt;in&gt;<\/div>/);
  assert.match(out.html, /Acme · 1 Main St, Springfield<br><a href="https:\/\/app\.test\/u\/[^"]+"[^>]*>Unsubscribe<\/a><\/div><\/body>/);
  assert.match(out.text, /--\nAcme · 1 Main St, Springfield\nUnsubscribe: https:\/\/app\.test\/u\//);
  assert.deepEqual(out.tags, { message: claimed().id, email: "e1" });
});

test("a non-marketing email has no footer or unsubscribe headers", () => {
  const out = renderMessage(claimed({ marketing: false, preheader: null }), { base: "https://app.test", secret: SECRET });
  assert.deepEqual(out.headers, []);
  assert.ok(!out.html.includes("Unsubscribe"));
  assert.equal(out.text, "Hi\n");
});

test("a block email: each click keeps its link when a part is left out for someone or a link holds a merge value", () => {
  const cond = (c: object) => `<!--clr-if:${encodeURIComponent(JSON.stringify(c)).replace(/-/g, "%2D")}-->`;
  const html = `<html><body>${cond({ field: "company", op: "is", value: "Acme" })}<a href="https://acme.com/only-acme">A</a><!--clr-end--><a href="https://x.io/{{first_name}}">M</a><a href="https://acme.com/all">B</a><p><a href="{{unsubscribe_url}}">Unsubscribe</a><br>{{company_address}}</p></body></html>`;
  // What publishing stores: the links in order, as extractLinks finds them in the compiled email.
  const links = extractLinks(html);
  assert.deepEqual(links, ["https://acme.com/only-acme", "https://acme.com/all"]);
  const base = { html, links, text: `${cond({ field: "company", op: "is", value: "Acme" })}A: https://acme.com/only-acme<!--clr-end-->\nUnsubscribe: {{unsubscribe_url}}`, preheader: null };
  for (const company of ["Acme", "Other"]) {
    const out = renderMessage(claimed({ ...base, vars: { company, first_name: "dana" } }), { base: "https://app.test", secret: SECRET });
    const clicks = [...out.html.matchAll(/href="https:\/\/app\.test\/c\/([^"]+)">(\w)</g)].map((m) => [m[2], readToken(m[1]!, SECRET)?.link]);
    // B is always the second stored link, whether or not A was left out; the merged link isn't tracked.
    assert.deepEqual(clicks, company === "Acme" ? [["A", 0], ["B", 1]] : [["B", 1]]);
    assert.match(out.html, /href="https:\/\/x\.io\/dana"/);
    assert.doesNotMatch(out.html, /clr-if|clr-end|\{\{/);
    // Its own footer is used: the unsubscribe link and address go in, and no second footer is added.
    assert.equal((out.html.match(/Unsubscribe/g) ?? []).length, 1);
    assert.match(out.html, /href="https:\/\/app\.test\/u\/[^"]+">Unsubscribe<\/a><br>1 Main St, Springfield/);
    assert.ok(out.headers.some((h) => h.name === "List-Unsubscribe"));
    assert.equal(out.text.includes("only-acme"), company === "Acme");
    assert.match(out.text, /Unsubscribe: https:\/\/app\.test\/u\//);
  }
  // A footer left out by a condition still leaves the email with an unsubscribe link: the fixed one.
  const hidden = `<html><body><p>Hi</p>${cond({ field: "title", op: "is_set" })}<a href="{{unsubscribe_url}}">Unsubscribe</a><!--clr-end--></body></html>`;
  const out = renderMessage(claimed({ html: hidden, links: [], vars: {} }), { base: "https://app.test", secret: SECRET });
  assert.equal((out.html.match(/>Unsubscribe</g) ?? []).length, 1);
  assert.match(out.html, /Acme · 1 Main St, Springfield<br><a href="https:\/\/app\.test\/u\//);
});

const svix = (secret: string, id: string, ts: number, body: string) => `v1,${createHmac("sha256", Buffer.from(secret.replace(/^whsec_/, ""), "base64")).update(`${id}.${ts}.${body}`).digest("base64")}`;

test("webhooks: only a fresh delivery signed with our secret is trusted", () => {
  const secret = `whsec_${Buffer.from("a-very-secret-key-for-tests").toString("base64")}`;
  const now = Date.parse("2026-10-24T10:00:00Z");
  const ts = now / 1000;
  const body = '{"type":"email.delivered","data":{"email_id":"r-1"}}';
  const sig = svix(secret, "msg_1", ts, body);
  const check = (o: Partial<Parameters<typeof checkSvix>[0]>) => checkSvix({ secret, id: "msg_1", timestamp: String(ts), signature: sig, body, now, ...o });
  assert.equal(check({}), null);
  assert.equal(check({ signature: `v1,bad v1,${sig.slice(3)}` }), null, "any one of several signatures may match");
  assert.equal(check({ body: body.replace("r-1", "r-2") }), "Bad signature");
  assert.equal(check({ id: "msg_2" }), "Bad signature");
  assert.equal(check({ now: now + 10 * 60_000 }), "Too old");
  assert.equal(check({ signature: null }), "Missing signature headers");
  assert.equal(check({ secret: `whsec_${Buffer.from("another").toString("base64")}` }), "Bad signature");
});

test("Resend events become delivered, hard and soft bounces, complaints, failures and delays", () => {
  const ev = (type: string, data: object = {}) => parseResendEvent("evt-1", JSON.stringify({ type, created_at: "2026-10-24T10:00:02Z", data: { email_id: "r-1", to: ["Dana@Acme.com"], ...data } }));
  assert.deepEqual(ev("email.delivered"), { event_id: "evt-1", provider_id: "r-1", to: "dana@acme.com", at: "2026-10-24T10:00:02Z", kind: "delivered", detail: {} });
  assert.equal(ev("email.bounced", { bounce: { type: "Permanent", subType: "General" } })?.bounce, "hard");
  assert.equal(ev("email.bounced", { bounce: { type: "Transient", subType: "MailboxFull" } })?.bounce, "soft");
  assert.equal(ev("email.bounced", { bounce: { type: "Undetermined" } })?.bounce, "soft");
  assert.equal(ev("email.complained")?.kind, "complained");
  assert.equal(ev("email.failed", { failed: { reason: "reached_daily_quota" } })?.kind, "rejected");
  assert.equal(ev("email.delivery_delayed")?.kind, "delayed");
  assert.equal(ev("email.sent"), null);
  assert.equal(ev("email.opened"), null);
  assert.equal(parseResendEvent("x", "not json"), null);
  assert.equal(parseResendEvent("x", '{"type":"email.delivered","data":{}}'), null, "no email id");
});

test("record names Resend gives turn into full hosts", () => {
  assert.equal(hostOf("send", "acme.com"), "send.acme.com");
  assert.equal(hostOf("send", "mail.acme.com"), "send.mail.acme.com");
  assert.equal(hostOf("send.mail", "mail.acme.com"), "send.mail.acme.com");
  assert.equal(hostOf("resend._domainkey.mail", "mail.acme.com"), "resend._domainkey.mail.acme.com");
  assert.equal(hostOf("resend._domainkey", "acme.com"), "resend._domainkey.acme.com");
  assert.equal(hostOf("send.acme.com", "acme.com"), "send.acme.com");
});

const RECORDS = [
  { record: "SPF", name: "send.mail", type: "MX", value: "feedback-smtp.us-east-1.amazonses.com", priority: 10, status: "not_started" },
  { record: "SPF", name: "send.mail", type: "TXT", value: "v=spf1 include:amazonses.com ~all", status: "not_started" },
  { record: "DKIM", name: "resend._domainkey.mail", type: "TXT", value: "p=MIGfMA0", status: "not_started" },
];
const rd = (status: string, recStatus = "not_started"): ResendDomain => ({ id: "dom-1", name: "mail.acme.com", status, records: RECORDS.map((r) => ({ ...r, status: recStatus })) });
const nx = () => Object.assign(new Error("not found"), { code: "ENOTFOUND" });
const fake = (zone: Record<string, string[] | { exchange: string; priority: number }[]>): Resolver => {
  const get = <T>(key: string): T => {
    if (!zone[key]) throw nx();
    return zone[key] as T;
  };
  return {
    cname: async (n) => get<string[]>(`CNAME ${n}`),
    mx: async (n) => get<{ exchange: string; priority: number }[]>(`MX ${n}`),
    txt: async (n) => get<string[]>(`TXT ${n}`).map((t) => [t]),
  };
};

test("the records to add: Resend's DKIM, the return path's MX and SPF, and our DMARC", () => {
  assert.deepEqual(
    expectedRecords("mail.acme.com", RECORDS).map((r) => `${r.key} ${r.type} ${r.name} ${r.value}`),
    [
      "dkim TXT resend._domainkey.mail.acme.com p=MIGfMA0",
      "mx MX send.mail.acme.com 10 feedback-smtp.us-east-1.amazonses.com",
      "spf TXT send.mail.acme.com v=spf1 include:amazonses.com ~all",
      "dmarc TXT _dmarc.mail.acme.com v=DMARC1; p=none; rua=mailto:dmarc@mail.acme.com",
    ],
  );
});

test("records read Waiting, Wrong or Verified, and the domain verifies only when Resend does and DMARC exists", async () => {
  const none = await checkRecords("mail.acme.com", rd("pending"), fake({}));
  assert.equal(none.status, "pending");
  assert.deepEqual(none.records.map((r) => r.status), ["waiting", "waiting", "waiting", "waiting"]);

  const typos = await checkRecords("mail.acme.com", rd("pending"), fake({
    "TXT resend._domainkey.mail.acme.com": ["p=OTHERKEY"],
    "MX send.mail.acme.com": [{ exchange: "mx.google.com", priority: 1 }],
    "TXT send.mail.acme.com": ["v=spf1 include:amazonses.com ~all"],
    "TXT _dmarc.mail.acme.com": ["dmarc please"],
  }));
  assert.deepEqual(typos.records.map((r) => `${r.key}:${r.status}`), ["dkim:wrong", "mx:wrong", "spf:waiting", "dmarc:wrong"]);
  assert.equal(typos.records[1].seen, "1 mx.google.com");

  const done = await checkRecords("mail.acme.com", rd("verified", "verified"), fake({ "TXT _dmarc.acme.com": ["v=DMARC1; p=quarantine"] }));
  assert.equal(done.status, "verified", "DMARC on the parent domain counts");
  assert.ok(done.records.every((r) => r.status === "verified"));

  const noDmarc = await checkRecords("mail.acme.com", rd("verified", "verified"), fake({}));
  assert.equal(noDmarc.status, "pending", "no DMARC, no sending");

  const flaky: Resolver = { ...fake({}), txt: async () => Promise.reject(Object.assign(new Error("timeout"), { code: "ETIMEOUT" })) };
  assert.equal((await checkRecords("mail.acme.com", rd("pending"), flaky)).records[0].status, "waiting", "a DNS timeout never reads as wrong");
  assert.equal((await checkRecords("mail.acme.com", rd("failed"), fake({}))).status, "failed");
});

// A tiny SMTP server that answers each command from a script, for the relay's flaky cases.
async function smtpServer(o: { afterData?: "ok" | "drop" | "450" | "550"; auth?: "ok" | "535"; dropBeforeData?: boolean } = {}) {
  const got: string[] = [];
  const server = net.createServer((s) => {
    let inData = false;
    let data = "";
    s.write("220 test ESMTP\r\n");
    s.on("data", (b) => {
      const text = b.toString();
      if (inData) {
        data += text;
        if (data.endsWith("\r\n.\r\n")) {
          inData = false;
          got.push(data);
          if (o.afterData === "drop") return s.destroy();
          s.write(o.afterData === "450" ? "450 Try later\r\n" : o.afterData === "550" ? "550 No such user\r\n" : "250 OK 3f2a4b6c-1d2e-4f50-8a9b-0c1d2e3f4a5b\r\n");
        }
        return;
      }
      for (const line of text.split("\r\n").filter(Boolean)) {
        got.push(line);
        if (line.startsWith("EHLO")) s.write("250-test\r\n250 AUTH PLAIN\r\n");
        else if (line.startsWith("AUTH")) s.write(o.auth === "535" ? "535 Bad key\r\n" : "235 OK\r\n");
        else if (line.startsWith("MAIL") || line.startsWith("RCPT")) s.write("250 OK\r\n");
        else if (line === "DATA") {
          if (o.dropBeforeData) return s.destroy();
          inData = true;
          s.write("354 Go\r\n");
        } else if (line === "QUIT") s.end("221 Bye\r\n");
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as net.AddressInfo).port;
  return { got, port, close: () => new Promise<void>((r) => server.close(() => r())) };
}

test("the SMTP relay: a sent message returns the relay's id; dots are doubled; no answer after the last line is unknown", async () => {
  assert.equal(dotStuff("a\n.b\r\n..c"), "a\r\n..b\r\n...c");
  const raw = "From: a@b.co\r\nTo: c@d.co\r\nSubject: Hi\r\n\r\n.hidden line\r\nbody";
  const send = (port: number) => smtpSend({ host: "127.0.0.1", port, user: "resend", pass: "re_x", secure: false, timeoutMs: 2000 }, { from: "a@b.co", to: "c@d.co", raw });

  const ok = await smtpServer();
  assert.equal(await send(ok.port), "3f2a4b6c-1d2e-4f50-8a9b-0c1d2e3f4a5b");
  assert.ok(ok.got.includes(`AUTH PLAIN ${Buffer.from("\0resend\0re_x").toString("base64")}`));
  assert.ok(ok.got.some((g) => g.includes("\r\n..hidden line\r\n")), "a line starting with a dot is doubled");
  await ok.close();

  const outcome = async (o: Parameters<typeof smtpServer>[0]) => {
    const s = await smtpServer(o);
    try {
      return outcomeOf(await send(s.port).then(() => null, (e) => e));
    } finally {
      await s.close();
    }
  };
  assert.equal(await outcome({ afterData: "drop" }), "unknown", "the message may have gone");
  assert.equal(await outcome({ dropBeforeData: true }), "retry", "nothing was sent yet");
  assert.equal(await outcome({ afterData: "450" }), "retry");
  assert.equal(await outcome({ afterData: "550" }), "failed");
  assert.equal(await outcome({ auth: "535" }), "failed");
  assert.equal(outcomeOf(await send(1).then(() => null, (e) => e)), "retry", "no connection, nothing sent");
});
