// Amazon SES next to Resend (docs/ses-plan.md, Step 1): AWS signing, SES's answers sorted so an email that may have
// gone out is never sent again, the send-rate bucket, which provider each From domain takes, a send round that mixes
// the two, the batch and raw-mail routing, SNS checks and SES events, and the app's own emails.
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { test } from "node:test";
import { domainOf, outcomeOf, SendError, type Outgoing, type Sender } from "../src/lib/email/provider.ts";
import type { Claimed } from "../src/lib/email/render.ts";
import type { Resend } from "../src/lib/email/resend.ts";
import { routedBatcher, routedMailer, routedSender, sesDomains, systemSend, type RawMail } from "../src/lib/email/senders.ts";
import { rateBucket, sesClient, type Ses } from "../src/lib/email/ses.ts";
import { signV4 } from "../src/lib/email/sigv4.ts";
import { checkSns, parseSesEvent, stringToSign, type SnsMessage } from "../src/lib/email/sns.ts";
import { sendRound } from "../worker-intel/jobs/email.ts";

const msg = (from = "Acme <news@acme.com>", to = "ana@x.co"): Outgoing => ({ from, to, subject: "Hi", html: "<p>Hi</p>", text: "Hi", headers: [{ name: "List-Unsubscribe", value: "<https://u>" }], tags: { message: "m-1", "bad tag": "a b" } });
const creds = { accessKeyId: "AKID", secretAccessKey: "secret" };
const answer = (status: number, body: object | string, headers: Record<string, string> = {}) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });

test("AWS signing matches AWS's get-vanilla example", () => {
  const h = signV4({ method: "GET", url: "https://example.amazonaws.com/", region: "us-east-1", service: "service", creds: { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY" }, now: new Date("2015-08-30T12:36:00Z") });
  assert.equal(h.Authorization, "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31");
});

test("a send goes to us-east-2 with the configuration set, headers and clean tags; raw mail is base64", async () => {
  const seen: { url: string; body: Record<string, unknown> }[] = [];
  const ses = sesClient({
    region: "us-east-2",
    creds,
    configSet: "claritia",
    startRate: 100,
    fetchFn: (async (url: string, init: RequestInit) => {
      if (url.endsWith("/v2/email/account")) return answer(200, { SendQuota: { MaxSendRate: 14 } });
      seen.push({ url, body: JSON.parse(String(init.body)) });
      return answer(200, { MessageId: "ses-1" });
    }) as typeof fetch,
  });
  assert.equal(await ses.send(msg()), "ses-1");
  assert.equal(ses.rate(), 14, "the account's send rate, read from SES");
  const b = seen[0]!.body as { FromEmailAddress: string; ConfigurationSetName: string; Content: { Simple: { Headers: unknown[] } }; EmailTags: { Name: string; Value: string }[] };
  assert.equal(seen[0]!.url, "https://email.us-east-2.amazonaws.com/v2/email/outbound-emails");
  assert.equal(b.FromEmailAddress, "Acme <news@acme.com>");
  assert.equal(b.ConfigurationSetName, "claritia");
  assert.deepEqual(b.Content.Simple.Headers, [{ Name: "List-Unsubscribe", Value: "<https://u>" }]);
  assert.deepEqual(b.EmailTags, [{ Name: "message", Value: "m-1" }, { Name: "bad_tag", Value: "a_b" }]);
  await ses.sendRaw({ from: "meetings@acme.com", to: "ana@x.co", raw: "Subject: Hi\r\n\r\nbody", tags: {} });
  const raw = seen[1]!.body as { Content: { Raw: { Data: string } } };
  assert.equal(Buffer.from(raw.Content.Raw.Data, "base64").toString(), "Subject: Hi\r\n\r\nbody");
});

test("SES answers: a throttle waits with no try used, anything unclear is never sent again", async () => {
  const client = (f: () => Promise<Response>) => sesClient({ region: "us-east-2", creds, startRate: 1000, fetchFn: (async (url: string) => (url.endsWith("/account") ? answer(500, "") : f())) as typeof fetch });
  const out = async (f: () => Promise<Response>) => client(f).send(msg()).then(() => "ok", (e) => outcomeOf(e));
  assert.equal(await out(async () => answer(200, { MessageId: "x" })), "ok");
  assert.equal(await out(async () => answer(429, { message: "slow down" })), "later");
  assert.equal(await out(async () => answer(400, { message: "Maximum sending rate exceeded." }, { "x-amzn-errortype": "ThrottlingException:http://x" })), "later");
  assert.equal(await out(async () => answer(400, { __type: "SendingPausedException", message: "paused" })), "later", "a paused account waits, nothing fails");
  assert.equal(await out(async () => answer(400, { __type: "LimitExceededException", message: "daily quota" })), "later");
  assert.equal(await out(async () => answer(500, { message: "InternalFailure" })), "unknown", "a 5xx may have sent it");
  assert.equal(await out(async () => answer(503, "")), "unknown");
  assert.equal(await out(async () => Promise.reject(new Error("socket hang up"))), "unknown", "no answer may have sent it");
  assert.equal(await out(async () => answer(200, "not json")), "unknown");
  assert.equal(await out(async () => answer(200, {})), "unknown", "taken with no id");
  assert.equal(await out(async () => answer(400, { __type: "MessageRejected", message: "Email address is not verified." })), "failed");
  const bad = await client(async () => answer(400, { __type: "BadRequestException", message: "bad" })).send(msg()).catch((e: SendError) => e);
  assert.ok(bad instanceof SendError && bad.invalid);
  // Identity reads are safe to repeat: a 5xx there is retry, a missing one is null.
  const id500 = await client(async () => answer(500, "")).getIdentity("acme.com").catch((e) => outcomeOf(e));
  assert.equal(id500, "retry");
  assert.equal(await client(async () => answer(404, { __type: "NotFoundException" })).getIdentity("acme.com"), null);
});

test("the bucket keeps sends under the account's rate, with no burst above one second's worth", async () => {
  let t = 0;
  const b = rateBucket({ rate: () => 2, now: () => t, sleep: async (ms) => void (t += ms) });
  for (let i = 0; i < 9; i++) await b.take();
  assert.ok(t >= 3500 && t <= 4100, `9 sends at 2 a second take about 4 seconds (${t} ms)`);
  // After a long quiet spell the bucket holds two (one second's worth), never more.
  t += 60_000;
  const start = t;
  for (let i = 0; i < 4; i++) await b.take();
  assert.ok(t - start >= 900 && t - start <= 1100, `${t - start} ms`);
  // Many waiting at once still go one at a time.
  let n = 0;
  const c = rateBucket({ rate: () => 5, now: () => n, sleep: async (ms) => void (n += ms) });
  await Promise.all(Array.from({ length: 11 }, () => c.take()));
  assert.ok(n >= 1900, `11 at 5 a second take about 2 seconds (${n} ms)`);
});

test("EMAIL_SES_DOMAINS: listed domains and their subdomains go to SES; empty means none, all means all", () => {
  const on = sesDomains({ EMAIL_SES_DOMAINS: "tryclaritia.com, @acme.io" });
  assert.equal(on("Claritia <alerts@mail.tryclaritia.com>"), true);
  assert.equal(on("x@tryclaritia.com"), true);
  assert.equal(on("x@acme.io"), true);
  assert.equal(on("x@nottryclaritia.com"), false, "a look-alike domain isn't a subdomain");
  assert.equal(on("x@other.com"), false);
  assert.equal(sesDomains({})("x@tryclaritia.com"), false);
  assert.equal(sesDomains({ EMAIL_SES_DOMAINS: "all" })("x@anything.co"), true);
  assert.equal(sesDomains({ EMAIL_SES_DOMAINS: "all" })("not an address"), false);
  assert.equal(domainOf('"Acme, Inc" <News@Acme.COM>'), "acme.com");
});

function fakes() {
  const calls: string[] = [];
  const resend = {
    send: async (m: Outgoing, key: string) => (calls.push(`resend:${m.to}:${key}`), `re-${m.to}`),
    batch: async (items: { out: Outgoing; key: string }[]) => (calls.push(`batch:${items.map((i) => i.out.to).join(",")}`), items.map((i) => `rb-${i.out.to}`)),
  } as unknown as Resend;
  const ses = { send: async (m: Outgoing) => (calls.push(`ses:${m.to}`), `ses-${m.to}`), sendRaw: async (m: RawMail) => (calls.push(`sesraw:${m.to}`), `sesraw-${m.to}`) } as unknown as Ses;
  return { calls, resend, ses };
}

test("the routed sender: SES for its domains with no key, Resend with the key for the rest", async () => {
  const { calls, resend, ses } = fakes();
  const s = routedSender({ resend, ses, onSes: sesDomains({ EMAIL_SES_DOMAINS: "tryclaritia.com" }) })!;
  assert.equal(await s.send(msg("a@mail.tryclaritia.com", "one@x.co"), "msg:1"), "ses-one@x.co");
  assert.equal(await s.send(msg("a@acme.com", "two@x.co"), "msg:2"), "re-two@x.co");
  assert.deepEqual(calls, ["ses:one@x.co", "resend:two@x.co:msg:2"]);
  assert.equal(s.keyed!(msg("a@tryclaritia.com")), false);
  assert.equal(s.keyed!(msg("a@acme.com")), true);
  assert.equal(s.batchable!(msg("a@tryclaritia.com")), false);
  // SES not set up: the variable does nothing and everything stays on Resend.
  const none = routedSender({ resend, ses: null, onSes: sesDomains({ EMAIL_SES_DOMAINS: "all" }) })!;
  assert.equal(none.keyed!(msg("a@tryclaritia.com")), true);
  assert.equal(routedSender({ resend: null, ses: null, onSes: () => true }), null);
  // Only SES set up: a Resend domain fails clearly instead of going somewhere else.
  const sesOnly = routedSender({ resend: null, ses, onSes: sesDomains({ EMAIL_SES_DOMAINS: "tryclaritia.com" }) })!;
  assert.match(await sesOnly.send(msg("a@acme.com"), "k").catch((e: Error) => e.message), /Resend/);
});

const row = (id: string, to: string, from: string, attempts = 1) => ({ id, attempts, to, from }) as unknown as Claimed;
const render = (m: Claimed) => msg((m as unknown as { from: string }).from, (m as unknown as { to: string }).to);

test("a round that mixes the two: Resend's first tries share a batch, SES's go one by one", async () => {
  const { calls, resend, ses } = fakes();
  const s = routedSender({ resend, ses, onSes: sesDomains({ EMAIL_SES_DOMAINS: "tryclaritia.com" }) })!;
  const r = await sendRound(s, [row("a", "a@x.co", "n@acme.com"), row("b", "b@x.co", "n@acme.com"), row("c", "c@x.co", "n@tryclaritia.com"), row("d", "d@x.co", "n@tryclaritia.com")], render);
  assert.deepEqual(calls.sort(), ["batch:a@x.co,b@x.co", "ses:c@x.co", "ses:d@x.co"]);
  assert.deepEqual(Object.fromEntries(r.map((x) => [x.id, [x.outcome, x.providerId]])), { a: ["ok", "rb-a@x.co"], b: ["ok", "rb-b@x.co"], c: ["ok", "ses-c@x.co"], d: ["ok", "ses-d@x.co"] });
});

test("in a round, an unclear SES answer is unknown and never sent again; Resend's keyed one is tried again", async () => {
  const unclear = () => Promise.reject(new SendError("SES didn't answer: timeout", { unknown: true }));
  const sender: Sender = {
    send: (m) => (m.from.endsWith("tryclaritia.com") ? unclear() : Promise.reject(new SendError("Resend didn't answer", { unknown: true }))),
    keyed: (m) => !m.from.endsWith("tryclaritia.com"),
    batchable: () => false,
  };
  const r = await sendRound(sender, [row("s", "s@x.co", "n@tryclaritia.com"), row("r", "r@x.co", "n@acme.com")], render);
  const by = Object.fromEntries(r.map((x) => [x.id, x.outcome]));
  assert.equal(by.s, "unknown");
  assert.equal(by.r, "retry");
  // A throttle from SES ends the round with nothing sent and no try used.
  const slow: Sender = { send: () => Promise.reject(new SendError("throttled", { later: true, retryAfterS: 2 })), keyed: () => false };
  const [l] = await sendRound(slow, [row("t", "t@x.co", "n@tryclaritia.com")], render);
  assert.deepEqual([l!.outcome, l!.delayS], ["later", 2]);
  // A sender with no batch call (SES only) sends first tries one by one.
  const seen: string[] = [];
  const sesOnly: Sender = { send: async (m) => (seen.push(m.to), `id-${m.to}`), keyed: () => false };
  const all = await sendRound(sesOnly, [row("1", "1@x.co", "n@tryclaritia.com"), row("2", "2@x.co", "n@tryclaritia.com"), row("3", "3@x.co", "n@tryclaritia.com", 2)], render);
  assert.equal(all.filter((x) => x.outcome === "ok").length, 3);
  assert.deepEqual(seen.sort(), ["1@x.co", "2@x.co", "3@x.co"]);
});

test("teammate alerts: a batch with any SES email is refused before anything goes, so each goes over the mailer", async () => {
  const { calls, resend, ses } = fakes();
  const b = routedBatcher({ resend, ses, onSes: sesDomains({ EMAIL_SES_DOMAINS: "tryclaritia.com" }) })!;
  const e = await b.batch([{ out: msg("Claritia <meetings@mail.tryclaritia.com>", "a@x.co"), key: "k1" }, { out: msg("Claritia <meetings@mail.tryclaritia.com>", "b@x.co"), key: "k2" }]).catch((x: SendError) => x);
  assert.ok(e instanceof SendError && e.invalid);
  assert.deepEqual(calls, [], "nothing was sent");
  assert.deepEqual(await b.batch([{ out: msg("x@acme.com", "c@x.co"), key: "k3" }]), ["rb-c@x.co"]);
  assert.equal(routedBatcher({ resend: null, ses, onSes: () => true }), null);
});

test("raw mail (meeting invites): SES's raw send for its domains, one SMTP connection for the rest", async () => {
  const { calls, ses } = fakes();
  let opened = 0;
  let closed = 0;
  const smtp = {
    send: async (m: RawMail) => (calls.push(`smtp:${m.to}`), "smtp-id"),
    session: () => (opened++, { send: async (m: RawMail) => (calls.push(`sess:${m.to}`), "sess-id"), close: () => void closed++ }),
  };
  const mailer = routedMailer({ smtp, ses, onSes: sesDomains({ EMAIL_SES_DOMAINS: "tryclaritia.com" }) })!;
  const mail = (from: string, to: string): RawMail => ({ from, to, raw: "x", tags: {} });
  assert.equal(await mailer.send(mail("meetings@mail.tryclaritia.com", "a@x.co")), "sesraw-a@x.co");
  assert.equal(await mailer.send(mail("meetings@acme.com", "b@x.co")), "smtp-id");
  const s = mailer.session!();
  await s.send(mail("meetings@mail.tryclaritia.com", "c@x.co"));
  assert.equal(opened, 0, "no SMTP connection for SES mail");
  await s.send(mail("meetings@acme.com", "d@x.co"));
  await s.send(mail("meetings@acme.com", "e@x.co"));
  s.close();
  assert.deepEqual([opened, closed], [1, 1]);
  assert.deepEqual(calls, ["sesraw:a@x.co", "smtp:b@x.co", "sesraw:c@x.co", "sess:d@x.co", "sess:e@x.co"]);
  assert.equal(routedMailer({ smtp: null, ses: null, onSes: () => true }), null);
});

function snsSigned(o: Partial<SnsMessage>, version = "2") {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const m = { Type: "Notification", MessageId: "sns-1", TopicArn: "arn:aws:sns:us-east-2:1:claritia-ses-events", Message: "{}", Timestamp: "2026-11-12T00:00:00.000Z", SignatureVersion: version, SigningCertURL: "https://sns.us-east-2.amazonaws.com/SimpleNotificationService-abc.pem", Signature: "", ...o } as SnsMessage;
  m.Signature = sign(version === "2" ? "sha256" : "sha1", Buffer.from(stringToSign(m)), privateKey).toString("base64");
  return { m, pem: publicKey.export({ type: "spki", format: "pem" }).toString() };
}

test("SNS messages are checked against Amazon's certificate and our topic", async () => {
  const topic = "arn:aws:sns:us-east-2:1:claritia-ses-events";
  const { m, pem } = snsSigned({ Subject: "Amazon SES Email Event Notification" });
  let fetched = 0;
  const cert = async () => (fetched++, pem);
  assert.equal(await checkSns(m, topic, cert), null);
  assert.equal(await checkSns({ ...m, Message: '{"eventType":"Complaint"}' }, topic, cert), "Bad signature");
  assert.equal(await checkSns(m, "arn:aws:sns:us-east-2:1:other", cert), "Wrong topic");
  assert.equal(await checkSns({ ...m, SigningCertURL: "https://evil.example.com/cert.pem" }, topic, cert), "Certificate isn't from SNS");
  assert.equal(await checkSns({ ...m, SigningCertURL: "https://sns.us-east-2.amazonaws.com.evil.com/x.pem" }, topic, cert), "Certificate isn't from SNS");
  assert.equal(await checkSns({ ...m, SignatureVersion: "3" }, topic, cert), "Unknown signature version");
  const v1 = snsSigned({ SigningCertURL: "https://sns.us-east-2.amazonaws.com/SimpleNotificationService-v1.pem" }, "1");
  assert.equal(await checkSns(v1.m, topic, async () => v1.pem), null);
  const sub = snsSigned({ Type: "SubscriptionConfirmation", SubscribeURL: "https://sns.us-east-2.amazonaws.com/?Action=ConfirmSubscription", Token: "tok", SigningCertURL: "https://sns.us-east-2.amazonaws.com/SimpleNotificationService-sub.pem" });
  assert.equal(await checkSns(sub.m, topic, async () => sub.pem), null);
  assert.equal(fetched, 1, "the certificate is fetched once");
});

test("SES events take Resend's shape: one event id per SNS message, the provider id, the address", () => {
  const ev = (body: object) => parseSesEvent({ Type: "Notification", MessageId: "sns-9", Message: JSON.stringify(body), Timestamp: "2026-11-12T00:00:09Z" } as SnsMessage);
  const mail = { messageId: "ses-1", timestamp: "2026-11-12T00:00:00Z", destination: ["Ana@X.co"] };
  assert.deepEqual(ev({ eventType: "Delivery", mail, delivery: { timestamp: "2026-11-12T00:00:02Z" } }), { event_id: "sns:sns-9", provider_id: "ses-1", to: "ana@x.co", kind: "delivered", at: "2026-11-12T00:00:02Z", detail: {} });
  assert.equal(ev({ eventType: "Bounce", mail, bounce: { bounceType: "Permanent", bounceSubType: "General", bouncedRecipients: [{ diagnosticCode: "550 no such user" }] } })?.bounce, "hard");
  assert.equal(ev({ eventType: "Bounce", mail, bounce: { bounceType: "Transient", bounceSubType: "MailboxFull" } })?.bounce, "soft");
  assert.equal(ev({ eventType: "Complaint", mail, complaint: { complaintFeedbackType: "abuse" } })?.kind, "complained");
  assert.equal(ev({ eventType: "Complaint", mail, complaint: { complaintFeedbackType: "not-spam" } }), null);
  assert.equal(ev({ eventType: "Reject", mail, reject: { reason: "Bad content" } })?.kind, "rejected");
  assert.equal(ev({ eventType: "DeliveryDelay", mail, deliveryDelay: { delayType: "MailboxFull" } })?.kind, "delayed");
  assert.equal(ev({ eventType: "Open", mail }), null, "opens and clicks are Claritia's own");
  assert.equal(ev({ eventType: "Delivery" }), null);
  assert.equal(parseSesEvent({ Type: "Notification", MessageId: "x", Message: "not json" } as SnsMessage), null);
});

test("the app's own emails (alerts, form codes) go through SES for its domains, Resend for the rest", async () => {
  const { calls, ses } = fakes();
  const urls: string[] = [];
  const fetchFn = (async (url: string) => (urls.push(url), answer(200, { id: "re" }))) as typeof fetch;
  const env = { EMAIL_SES_DOMAINS: "tryclaritia.com", RESEND_API_KEY: "re_x" };
  const m = (from: string) => ({ from, to: ["a@x.co", "b@x.co"], subject: "s", html: "h", text: "t" });
  assert.equal(await systemSend(m("Claritia <alerts@mail.tryclaritia.com>"), { env, fetchFn, ses }), null);
  assert.deepEqual(calls, ["ses:a@x.co,b@x.co"]);
  assert.deepEqual(urls, []);
  assert.equal(await systemSend(m("alerts@acme.com"), { env, fetchFn, ses }), null);
  assert.deepEqual(urls, ["https://api.resend.com/emails"]);
  assert.equal(await systemSend(m("alerts@acme.com"), { env: {}, fetchFn, ses: null }), "RESEND_API_KEY isn't set on the server.");
  const failing = { send: async () => Promise.reject(new SendError("SES 400 MessageRejected: no", {})) } as unknown as Ses;
  assert.match((await systemSend(m("a@tryclaritia.com"), { env, fetchFn, ses: failing })) ?? "", /MessageRejected/);
});
