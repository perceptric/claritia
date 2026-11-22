// Sending (docs/conversion-weeks.md week 9) without a database: request signing, the SES client, SNS signatures,
// tracked and unsubscribe links, the message and its one-click headers, DNS record checks, and what the send
// pipeline does with each kind of SES failure.
import assert from "node:assert/strict";
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { JobError, type Rpc } from "../src/lib/jobs.ts";
import { checkRecords, recordsFor, type Resolver } from "../src/lib/email/domains.ts";
import { botRequest } from "../src/lib/email/bots.ts";
import { buildMessage, htmlToText, type Claimed } from "../src/lib/email/message.ts";
import { sendMessage } from "../src/lib/email/send.ts";
import { SesError, sesClient, type Ses } from "../src/lib/email/ses.ts";
import { signRequest } from "../src/lib/email/sigv4.ts";
import { snsUrl, stringToSign, verifySns, type SnsMessage } from "../src/lib/email/sns.ts";
import { clickUrl, linkKey, readClick, readUnsubscribeToken, rewriteLinks, unsubscribeToken } from "../src/lib/email/track.ts";

const KEY = linkKey("k".repeat(40));
const MID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const BASE = "https://app.tryclaritia.com";

// Signing -------------------------------------------------------------------------------------------------------

test("SigV4 matches AWS's published example (S3 GET Object)", () => {
  const h = signRequest({
    method: "GET",
    url: "https://examplebucket.s3.amazonaws.com/test.txt",
    body: "",
    region: "us-east-1",
    service: "s3",
    creds: { accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" },
    headers: { Range: "bytes=0-9" },
    now: new Date("2013-05-24T00:00:00Z"),
  });
  assert.equal(
    h.authorization,
    "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
  );
});

// SES client ----------------------------------------------------------------------------------------------------

type Call = { url: string; method: string; headers: Record<string, string>; body: Record<string, unknown> | null };
function fakeFetch(answers: { status: number; body?: object; headers?: Record<string, string> }[]) {
  const calls: Call[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method ?? "GET", headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : null });
    const a = answers.shift() ?? { status: 200, body: {} };
    return new Response(JSON.stringify(a.body ?? {}), { status: a.status, headers: a.headers });
  }) as unknown as typeof fetch;
  return { fn, calls };
}
const creds = { accessKeyId: "AKID", secretAccessKey: "secret" };

test("SES send posts raw MIME with the configuration set and tags, signed for SES in the region", async () => {
  const f = fakeFetch([{ status: 200, body: { MessageId: "ses-1" } }]);
  const ses = sesClient({ region: "us-east-2", creds, fetch: f.fn });
  const id = await ses.sendRaw("Subject: hi\r\n\r\nbody", { from: "a@mail.acme.com", to: "b@x.com", configSet: "clr-ws", tags: [{ Name: "m", Value: MID }] });
  assert.equal(id, "ses-1");
  const c = f.calls[0]!;
  assert.equal(c.url, "https://email.us-east-2.amazonaws.com/v2/email/outbound-emails");
  assert.match(c.headers.authorization!, /Credential=AKID\/\d{8}\/us-east-2\/ses\/aws4_request/);
  assert.equal(Buffer.from((c.body!.Content as { Raw: { Data: string } }).Raw.Data, "base64").toString(), "Subject: hi\r\n\r\nbody");
  assert.equal(c.body!.ConfigurationSetName, "clr-ws");
  assert.deepEqual(c.body!.EmailTags, [{ Name: "m", Value: MID }]);
});

test("SES errors: throttling and 5xx can be retried, a rejection can't; an existing identity is read back", async () => {
  const f = fakeFetch([
    { status: 429, body: { message: "Maximum sending rate exceeded" }, headers: { "x-amzn-errortype": "TooManyRequestsException:http://internal" } },
    { status: 400, body: { message: "Email address is not verified" }, headers: { "x-amzn-errortype": "MessageRejected" } },
    { status: 409, body: { message: "exists" }, headers: { "x-amzn-errortype": "AlreadyExistsException" } },
    { status: 200, body: { DkimAttributes: { Status: "SUCCESS", Tokens: ["a".repeat(32), "b".repeat(32), "c".repeat(32)] }, MailFromAttributes: { MailFromDomainStatus: "SUCCESS" } } },
  ]);
  const ses = sesClient({ region: "us-east-2", creds, fetch: f.fn });
  const send = () => ses.sendRaw("x", { from: "a@b.co", to: "c@d.co" });
  await assert.rejects(send, (e: unknown) => e instanceof SesError && e.retryable && e.code === "TooManyRequestsException");
  await assert.rejects(send, (e: unknown) => e instanceof SesError && !e.retryable && e.code === "MessageRejected");
  const ident = await ses.createIdentity("mail.acme.com", "clr-ws");
  assert.equal(ident.dkimStatus, "SUCCESS");
  assert.equal(ident.dkimTokens.length, 3);
  assert.equal(f.calls[3]!.method, "GET");
  assert.equal(f.calls[3]!.url, "https://email.us-east-2.amazonaws.com/v2/email/identities/mail.acme.com");
});

// SNS -----------------------------------------------------------------------------------------------------------

const certPem = readFileSync(new URL("./fixtures/sns-test-cert.txt", import.meta.url), "utf8");
const keyPem = readFileSync(new URL("./fixtures/sns-test-key.txt", import.meta.url), "utf8");
const TOPIC = "arn:aws:sns:us-east-2:123456789012:claritia-ses";
const certFetch = (async () => new Response(certPem)) as unknown as typeof fetch;

function signed(m: Omit<SnsMessage, "Signature" | "SignatureVersion" | "SigningCertURL">, version: "1" | "2" = "1", certUrl = "https://sns.us-east-2.amazonaws.com/SimpleNotificationService-abc.pem") {
  const full = { ...m, SignatureVersion: version, SigningCertURL: certUrl, Signature: "" } as SnsMessage;
  full.Signature = createSign(version === "1" ? "RSA-SHA1" : "RSA-SHA256").update(stringToSign(full)).sign(keyPem, "base64");
  return full;
}
const note = (over: Partial<SnsMessage> = {}) => ({ Type: "Notification" as const, MessageId: "sns-1", TopicArn: TOPIC, Message: '{"eventType":"Delivery"}', Timestamp: "2026-11-22T00:00:00.000Z", ...over });

test("SNS: signed notifications pass with either signature version; changed, foreign or wrong-topic ones fail", async () => {
  for (const v of ["1", "2"] as const) {
    const r = await verifySns(JSON.stringify(signed(note(), v)), TOPIC, certFetch);
    assert.ok(r.ok, `version ${v}`);
  }
  const good = signed(note());
  assert.deepEqual(await verifySns(JSON.stringify({ ...good, Message: '{"eventType":"Complaint"}' }), TOPIC, certFetch), { ok: false, error: "Bad signature" });
  assert.deepEqual(await verifySns(JSON.stringify(good), "arn:aws:sns:us-east-2:999:other", certFetch), { ok: false, error: "Wrong topic" });
  for (const url of ["http://sns.us-east-2.amazonaws.com/x.pem", "https://sns.us-east-2.amazonaws.com.evil.com/x.pem", "https://evil.com/sns.us-east-2.amazonaws.com/x.pem", "https://sns.us-east-2.amazonaws.com/x.txt"]) {
    const r = await verifySns(JSON.stringify(signed(note(), "1", url)), TOPIC, certFetch);
    assert.equal(r.ok, false, url);
  }
  assert.equal((await verifySns("not json", TOPIC, certFetch)).ok, false);
});

test("SNS: a subscription confirmation signs its token and URL; only SNS URLs are followed", async () => {
  const m = signed({ Type: "SubscriptionConfirmation", MessageId: "s", TopicArn: TOPIC, Message: "confirm", Timestamp: "t", Token: "tok", SubscribeURL: "https://sns.us-east-2.amazonaws.com/?Action=ConfirmSubscription&Token=tok" });
  assert.ok((await verifySns(JSON.stringify(m), TOPIC, certFetch)).ok);
  assert.ok((await verifySns(JSON.stringify({ ...m, Token: "other" }), TOPIC, certFetch)).ok === false);
  assert.ok(snsUrl(m.SubscribeURL));
  assert.equal(snsUrl("https://attacker.example/?sns.us-east-2.amazonaws.com"), null);
});

// Links ---------------------------------------------------------------------------------------------------------

test("unsubscribe tokens name one message and can't be forged or changed", () => {
  const t = unsubscribeToken(MID, KEY);
  assert.equal(readUnsubscribeToken(t, KEY), MID);
  assert.equal(readUnsubscribeToken(t, linkKey("z".repeat(40))), null, "another key");
  const other = unsubscribeToken("0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c", KEY);
  assert.equal(readUnsubscribeToken(`${t.split(".")[0]}.${other.split(".")[1]}`, KEY), null, "signature from another message");
  for (const bad of ["", ".", "abc", `${t}.x`, t.slice(0, -1)]) assert.equal(readUnsubscribeToken(bad, KEY), null, bad);
});

test("click links are bound to the URL in the email, so they can't redirect anywhere else", () => {
  const u = new URL(clickUrl(BASE, MID, "https://acme.com/pricing?a=1&b=2", KEY));
  assert.equal(u.origin + u.pathname.slice(0, 3), `${BASE}/c/`);
  const token = u.pathname.split("/")[2]!;
  assert.equal(readClick(token, u.searchParams.get("u")!, KEY), MID);
  assert.equal(readClick(token, "https://evil.com/", KEY), null);
  assert.equal(readClick(token, "javascript:alert(1)", KEY), null);
});

test("rewriting links tracks web links only and leaves mailto, anchors, unsubscribe and opted-out links alone", () => {
  const html = `<a href="https://acme.com/a?x=1&amp;y=2">A</a> <a class="b" href='http://acme.com/b'>B</a> <a href="mailto:hi@acme.com">M</a>
<a href="#top">T</a> <a href="${BASE}/u/abc">U</a> <a data-clr-notrack href="https://acme.com/raw">R</a>`;
  const out = rewriteLinks(html, (url) => `${BASE}/c/x?u=${encodeURIComponent(url)}`, `${BASE}/u/`);
  assert.ok(out.includes(`href="${BASE}/c/x?u=${encodeURIComponent("https://acme.com/a?x=1&y=2")}"`), "entities decoded before signing");
  assert.ok(out.includes(`class="b" href="${BASE}/c/x?u=${encodeURIComponent("http://acme.com/b")}"`));
  for (const kept of ['href="mailto:hi@acme.com"', 'href="#top"', `href="${BASE}/u/abc"`, 'data-clr-notrack href="https://acme.com/raw"']) assert.ok(out.includes(kept), kept);
});

test("clicks from scanners: HEAD, no agent and bot agents are machines", () => {
  const chrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
  assert.equal(botRequest("GET", chrome), false);
  assert.equal(botRequest("HEAD", chrome), true);
  assert.equal(botRequest("GET", null), true);
  assert.equal(botRequest("GET", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"), true);
});

// The message ---------------------------------------------------------------------------------------------------

const claimed = (over: Partial<Claimed> = {}): Claimed => ({
  action: "send",
  id: MID,
  workspace_id: "0190a1b2-0000-7000-8000-000000000001",
  kind: "marketing",
  to: "jane@example.com",
  from_email: "news@mail.acme.com",
  from_name: "Acme",
  reply_to: null,
  subject: "Spring launch",
  preheader: "What's new",
  html: '<html><body><p>Hi Jane</p><a href="https://acme.com/launch">See it</a></body></html>',
  text: null,
  config_set: "clr-ws",
  footer_address: "1 Main St, Springfield, IL 62701",
  workspace_name: "Acme",
  contact: { first_name: "Jane", last_name: null, email: "jane@example.com" },
  ...over,
});
const part = (raw: string, type: string) => {
  const m = raw.match(new RegExp(`Content-Type: ${type}; charset=UTF-8\\r\\nContent-Transfer-Encoding: base64\\r\\n\\r\\n([A-Za-z0-9+/=\\r\\n]+?)\\r\\n--`));
  return Buffer.from(m![1]!.replace(/\r\n/g, ""), "base64").toString("utf8");
};

test("every message carries one-click unsubscribe headers (RFC 8058), the footer address and a tracked link", () => {
  const b = buildMessage(claimed(), { base: BASE, key: KEY, boundary: "BOUND" });
  const head = b.raw.split("\r\n\r\n")[0]!;
  const unsub = `${BASE}/u/${unsubscribeToken(MID, KEY)}`;
  assert.ok(head.includes(`List-Unsubscribe: <${unsub}>`));
  assert.ok(head.includes("List-Unsubscribe-Post: List-Unsubscribe=One-Click"));
  assert.ok(head.includes('From: "Acme" <news@mail.acme.com>'));
  assert.ok(head.includes("To: jane@example.com"));
  const html = part(b.raw, "text/html");
  const text = part(b.raw, "text/plain");
  assert.ok(html.includes("1 Main St, Springfield, IL 62701") && html.includes(`href="${unsub}"`), "footer in HTML");
  assert.ok(html.indexOf("Unsubscribe") < html.indexOf("</body>"), "footer inside the body");
  assert.ok(html.includes(`${BASE}/c/`) && !html.includes('href="https://acme.com/launch"'), "link tracked");
  assert.ok(html.includes("What's new"), "preheader");
  assert.ok(text.includes("Hi Jane") && text.includes("See it (https://acme.com/launch)") && text.includes(`Unsubscribe: ${unsub}`), "plain text made");
});

test("headers: non-ASCII subjects and names are encoded; line breaks can't inject headers", () => {
  const b = buildMessage(claimed({ subject: "Café ☕ ".repeat(8).trim(), from_name: "Équipe Acme" }), { base: BASE, key: KEY });
  const head = b.raw.split("\r\n\r\n")[0]!;
  assert.match(head, /^Subject: =\?UTF-8\?B\?/m);
  assert.ok(head.split("\r\n").every((l) => l.length <= 998));
  assert.match(head, /^From: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?= <news@mail\.acme\.com>$/m);
  assert.throws(() => buildMessage(claimed({ subject: "Hi\r\nBcc: everyone@x.com" }), { base: BASE, key: KEY }), /line break/);
  assert.throws(() => buildMessage(claimed({ from_name: "A\nBcc: x@y.z" }), { base: BASE, key: KEY }), /line break/);
  assert.throws(() => buildMessage(claimed({ to: "a@b.com\r\nBcc: x@y.z" }), { base: BASE, key: KEY }), /Not an email/);
});

test("plain text from HTML keeps paragraphs, list items and links", () => {
  assert.equal(htmlToText("<style>p{}</style><h1>Hi</h1><p>One &amp; two</p><ul><li>A</li><li>B</li></ul><a href='https://x.co'>x</a>"), "Hi\n\nOne & two\n\n- A\n\n- B\n\nx (https://x.co)");
});

// DNS records ---------------------------------------------------------------------------------------------------

const TOKENS = ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "cccccccccccccccccccccccccccccccc"];
const row = { domain: "mail.acme.co.uk", mail_from: "bounce.mail.acme.co.uk", region: "us-east-2", dkim_tokens: TOKENS };
const nf = () => Object.assign(new Error("not found"), { code: "ENOTFOUND" });
const servfail = () => Object.assign(new Error("servfail"), { code: "ESERVFAIL" });

function resolver(zone: Record<string, { cname?: string[]; mx?: string[]; txt?: string[] } | "fail">): Resolver {
  const get = (n: string) => {
    const z = zone[n.toLowerCase()];
    if (z === "fail") throw servfail();
    return z;
  };
  return {
    cname: async (n) => get(n)?.cname ?? Promise.reject(nf()),
    mx: async (n) => get(n)?.mx?.map((exchange) => ({ exchange, priority: 10 })) ?? Promise.reject(nf()),
    txt: async (n) => get(n)?.txt?.map((t) => [t.slice(0, 10), t.slice(10)]) ?? Promise.reject(nf()),
  };
}
const fullZone = () => ({
  ...Object.fromEntries(TOKENS.map((t) => [`${t}._domainkey.mail.acme.co.uk`, { cname: [`${t}.dkim.amazonses.com.`] }])),
  "bounce.mail.acme.co.uk": { mx: ["feedback-smtp.us-east-2.amazonses.com"], txt: ["v=spf1 include:amazonses.com ~all"] },
  "_dmarc.acme.co.uk": { txt: ["v=DMARC1; p=none; rua=mailto:d@acme.co.uk"] },
});

test("records to add: three DKIM CNAMEs, the MAIL FROM MX and SPF, and DMARC on the organizational domain", () => {
  const r = recordsFor(row);
  assert.deepEqual(
    r.map((x) => [x.type, x.name]),
    [...TOKENS.map((t) => ["CNAME", `${t}._domainkey.mail.acme.co.uk`]), ["MX", "bounce.mail.acme.co.uk"], ["TXT", "bounce.mail.acme.co.uk"], ["TXT", "_dmarc.acme.co.uk"]],
  );
  assert.equal(r[3]!.value, "10 feedback-smtp.us-east-2.amazonses.com");
});

test("DNS check: all present is verified, missing is waiting, other values are wrong, a DNS failure says neither", async () => {
  assert.deepEqual(await checkRecords(row, resolver(fullZone())), { dkim1: "verified", dkim2: "verified", dkim3: "verified", spf_mx: "verified", spf_txt: "verified", dmarc: "verified" });
  assert.deepEqual(await checkRecords(row, resolver({})), { dkim1: "waiting", dkim2: "waiting", dkim3: "waiting", spf_mx: "waiting", spf_txt: "waiting", dmarc: "waiting" });
  const wrong = await checkRecords(
    row,
    resolver({
      ...fullZone(),
      [`${TOKENS[0]}._domainkey.mail.acme.co.uk`]: { cname: ["other.example.com"] },
      "bounce.mail.acme.co.uk": { mx: ["mx.google.com"], txt: ["v=spf1 include:_spf.google.com ~all"] },
      "_dmarc.acme.co.uk": { txt: ["v=DMARC1; rua=mailto:x@y.z"] },
    }),
  );
  assert.deepEqual([wrong.dkim1, wrong.dkim2, wrong.spf_mx, wrong.spf_txt, wrong.dmarc], ["wrong", "verified", "wrong", "wrong", "wrong"]);
  const twoSpf = await checkRecords(row, resolver({ ...fullZone(), "bounce.mail.acme.co.uk": { mx: ["feedback-smtp.us-east-2.amazonses.com"], txt: ["v=spf1 include:amazonses.com ~all", "v=spf1 -all"] } }));
  assert.equal(twoSpf.spf_txt, "wrong", "two SPF records break SPF");
  const flaky = await checkRecords(row, resolver({ ...fullZone(), "bounce.mail.acme.co.uk": "fail", "_dmarc.mail.acme.co.uk": "fail" }));
  assert.deepEqual([flaky.spf_mx, flaky.spf_txt, flaky.dmarc, flaky.dkim1], ["error", "error", "error", "verified"]);
  const own = await checkRecords(row, resolver({ ...fullZone(), "_dmarc.acme.co.uk": {}, "_dmarc.mail.acme.co.uk": { txt: ["v=DMARC1; p=reject"] } }));
  assert.equal(own.dmarc, "verified", "DMARC on the sending domain itself counts");
});

// The send pipeline ---------------------------------------------------------------------------------------------

function pipeline(claim: unknown, sesBehaviour: () => Promise<string>) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const rpc: Rpc = async (fn, args) => {
    calls.push({ fn, args });
    return { data: fn === "send_claim" ? claim : fn === "enqueue_job" ? "job-id" : null, error: null };
  };
  let sent = 0;
  const ses = {
    region: "us-east-2",
    sendRaw: async () => {
      sent++;
      return sesBehaviour();
    },
  } as unknown as Ses;
  return { opts: { rpc, ses, base: BASE, key: KEY }, calls, sent: () => sent };
}
const statusOf = (calls: { fn: string; args: Record<string, unknown> }[]) => calls.filter((c) => c.fn === "send_failed" || c.fn === "send_done").map((c) => (c.fn === "send_done" ? "sent" : c.args.p_status));

test("send: SES takes it once and the send is recorded with SES's id", async () => {
  const p = pipeline(claimed(), async () => "ses-9");
  assert.deepEqual(await sendMessage(p.opts, MID, null), { result: "sent", detail: "ses-9" });
  assert.deepEqual(statusOf(p.calls), ["sent"]);
  assert.equal(p.calls.find((c) => c.fn === "send_done")!.args.p_ses_id, "ses-9");
});

test("send: throttling goes back in line and retries; a rejection fails for good; no answer is unknown and never resent", async () => {
  const throttled = pipeline(claimed(), async () => Promise.reject(new SesError(429, "TooManyRequestsException", "slow down")));
  await assert.rejects(sendMessage(throttled.opts, MID, null), (e: unknown) => e instanceof JobError && e.retry);
  assert.deepEqual(statusOf(throttled.calls), ["queued"]);

  const rejected = pipeline(claimed(), async () => Promise.reject(new SesError(400, "MessageRejected", "no")));
  assert.equal((await sendMessage(rejected.opts, MID, null)).result, "failed");
  assert.deepEqual(statusOf(rejected.calls), ["failed"]);

  const silent = pipeline(claimed(), async () => Promise.reject(new TypeError("fetch failed")));
  assert.equal((await sendMessage(silent.opts, MID, null)).result, "unknown");
  assert.deepEqual(statusOf(silent.calls), ["unknown"]);
});

test("send: a wait from the guard queues the message again after that many seconds, without calling SES", async () => {
  const p = pipeline({ action: "wait", seconds: 3600, why: "quiet_hours" }, async () => "never");
  assert.deepEqual(await sendMessage(p.opts, MID, "ws-1"), { result: "wait", detail: "quiet_hours" });
  const job = p.calls.find((c) => c.fn === "enqueue_job")!.args;
  assert.deepEqual([job.p_kind, job.p_key, job.p_delay_s], ["send", MID, 3600]);
  assert.equal(p.sent(), 0);
  const blocked = pipeline({ action: "blocked", reason: "suppressed" }, async () => "never");
  assert.deepEqual(await sendMessage(blocked.opts, MID, null), { result: "blocked", detail: "suppressed" });
  assert.equal(blocked.sent(), 0);
});
