// Text messages (docs/integrations-plan.md, Next step 3; src/lib/texts, worker-intel/jobs/texts.ts): the words, the
// step checks, Twilio's answers and signatures, consent, and the flaky cases the reliability rule asks for: a number
// that replied STOP gets nothing, a reminder for a canceled or moved meeting never goes, a 429 is tried again and
// sends once, a text that fails twice sends its email instead, and a send with no answer is never sent again.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Rpc } from "../src/lib/jobs.ts";
import { bookingTextPhone } from "../src/lib/texts/booking.ts";
import { smsConsented } from "../src/lib/texts/consent.ts";
import { sendText, signatureOk, twilioFromEnv, twilioFromKeys, twilioSignature, type TwilioAccount } from "../src/lib/texts/twilio.ts";
import { fillText, keywordOf, segments, withStop } from "../src/lib/texts/words.ts";
import { cleanBody, stepProblems } from "../src/lib/workflows/check.ts";
import { checkAnswer } from "../src/lib/meetings/questions.ts";
import type { Form } from "../src/lib/forms/schema.ts";
import { textOnce, type Taken } from "../worker-intel/jobs/texts.ts";

const MSG = "77777777-7777-4777-8777-777777777777";
const ACCT: TwilioAccount = { sid: `AC${"a".repeat(32)}`, token: "tok", from: "+18005550100", own: false };

test("the words: merge fields with fallbacks, the STOP line once, segments and reply keywords", () => {
  assert.equal(fillText("Hi {{first_name|there}}, {{meeting_time|soon}}.{{meeting_link|}}", { first_name: "Ada", meeting_time: null }), "Hi Ada, soon.");
  assert.equal(withStop("See you"), "See you\nReply STOP to opt out.");
  assert.equal(withStop("Reply STOP to end"), "Reply STOP to end");
  assert.deepEqual(segments("a".repeat(160)), { unicode: false, chars: 160, count: 1 });
  assert.equal(segments("a".repeat(161)).count, 2);
  assert.equal(segments("€".repeat(80)).count, 1, "€ counts twice but stays plain");
  assert.deepEqual(segments("Hi 👋"), { unicode: true, chars: 4, count: 1 });
  assert.equal(segments("é".repeat(10) + "ł".repeat(61)).count, 2);
  assert.equal(keywordOf(" stop! "), "stop");
  assert.equal(keywordOf("Unsubscribe"), "stop");
  assert.equal(keywordOf("START"), "start");
  assert.equal(keywordOf("help"), "help");
  assert.equal(keywordOf("stop texting me please"), null);
});

test("the steps: a text needs words with fallbacks; WhatsApp needs a Content SID; both survive a save", () => {
  assert.deepEqual(stepProblems({ id: "s1", kind: "sms", text: "" }), ["Write the text"]);
  assert.match(stepProblems({ id: "s1", kind: "sms", text: "Hi {{first_name}}" })[0]!, /fallback/);
  assert.match(stepProblems({ id: "s1", kind: "sms", text: "x".repeat(500) })[0]!, /under 459/);
  assert.deepEqual(stepProblems({ id: "s1", kind: "sms", text: "Hi", fallback: { subject: " " } }), ["Write the email's subject"]);
  assert.deepEqual(stepProblems({ id: "s1", kind: "sms", text: "Hi {{first_name|there}}", fallback: { subject: "Reminder" } }), []);
  assert.match(stepProblems({ id: "w1", kind: "whatsapp", template: "HX12", vars: [] })[0]!, /Content SID/);
  assert.deepEqual(stepProblems({ id: "w1", kind: "whatsapp", template: `HX${"0".repeat(32)}`, vars: ["{{first_name|there}}"] }), []);
  const b = cleanBody({ trigger: { kind: "form", forms: [] }, steps: [{ id: "s1", kind: "sms", text: "Hi", fallback: { subject: "R" } }, { id: "w1", kind: "whatsapp", template: "HXab", vars: ["a", 3] }], goals: [], entry: { mode: "once", gapDays: 30 } });
  assert.deepEqual(b.steps, [{ id: "s1", kind: "sms", text: "Hi", fallback: { subject: "R" } }, { id: "w1", kind: "whatsapp", template: "HXab", vars: ["a", ""] }]);
});

test("consent: a form's Text consent box and a booking page's question, with a number that can take texts", () => {
  const form = { steps: [{ fields: [{ id: "a", key: "sms_consent", label: "Text consent", type: "checkbox" }] }] } as unknown as Form;
  assert.ok(smsConsented(form, { sms_consent: true }));
  assert.ok(smsConsented(form, { sms_consent: "Yes" }));
  assert.ok(!smsConsented(form, { sms_consent: "" }));
  assert.deepEqual(checkAnswer({ label: "Text me", type: "sms" }, "Yes"), { value: "Yes" });
  const qs = [{ id: "p", type: "phone" as const }, { id: "s", type: "sms" as const }];
  assert.equal(bookingTextPhone({ answers: { p: "+1 (415) 555-0132", s: "Yes" } }, qs), "+14155550132");
  assert.equal(bookingTextPhone({ answers: { p: "+1 (415) 555-0132" } }, qs), null, "not ticked");
  assert.equal(bookingTextPhone({ answers: { p: "555-0132", s: "Yes" } }, qs), null, "no country code: no text");
});

test("Twilio: the account from the server or the team's keys, and each answer read the right way", async () => {
  assert.equal(twilioFromEnv({ TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t" }), null, "no number: no texts");
  assert.deepEqual(twilioFromKeys((k) => ({ account_sid: ACCT.sid, auth_token: "t", from: `MG${"b".repeat(32)}`, whatsapp_from: "whatsapp:+14155550100" })[k] ?? ""), {
    sid: ACCT.sid, token: "t", messagingSid: `MG${"b".repeat(32)}`, whatsappFrom: "+14155550100", own: true,
  });
  const calls: URLSearchParams[] = [];
  const answer = (r: Response | Error) => (async (_u: string, init: RequestInit) => {
    calls.push(new URLSearchParams(String(init.body)));
    if (r instanceof Error) throw r;
    return r;
  }) as unknown as typeof fetch;
  const json = (status: number, j: object, h: Record<string, string> = {}) => new Response(JSON.stringify(j), { status, headers: { "content-type": "application/json", ...h } });
  assert.deepEqual(await sendText(ACCT, { channel: "sms", to: "+14155550132", body: "Hi" }, answer(json(201, { sid: `SM${"c".repeat(32)}`, from: "+18005550100" }))), { status: "sent", sid: `SM${"c".repeat(32)}`, from: "+18005550100" });
  assert.equal(calls[0]!.get("From"), "+18005550100");
  assert.equal(calls[0]!.get("Body"), "Hi");
  assert.deepEqual(await sendText(ACCT, { channel: "sms", to: "+1", body: "x" }, answer(json(429, {}, { "retry-after": "30" }))), { status: "retry", error: "Twilio answered 429.", retryAfterS: 30 });
  assert.equal((await sendText(ACCT, { channel: "sms", to: "+1", body: "x" }, answer(json(503, {})))).status, "retry");
  assert.equal((await sendText(ACCT, { channel: "sms", to: "+1", body: "x" }, answer(Object.assign(new Error("t"), { name: "TimeoutError" })))).status, "unknown");
  assert.deepEqual(await sendText(ACCT, { channel: "sms", to: "+1", body: "x" }, answer(json(400, { code: 21610, message: "Attempt to send to unsubscribed recipient" }))), { status: "failed", error: "Twilio: Attempt to send to unsubscribed recipient", code: 21610 });
  assert.equal((await sendText(ACCT, { channel: "whatsapp", to: "+1", template: `HX${"0".repeat(32)}` })).status, "failed", "WhatsApp needs a sender");
  const wa = { ...ACCT, whatsappFrom: "+14155550100" };
  await sendText(wa, { channel: "whatsapp", to: "+14155550132", template: `HX${"0".repeat(32)}`, vars: { "1": "Ada" } }, answer(json(201, { sid: `SM${"d".repeat(32)}` })));
  const last = calls.at(-1)!;
  assert.deepEqual([last.get("To"), last.get("From"), last.get("ContentSid"), last.get("ContentVariables"), last.get("Body")], ["whatsapp:+14155550132", "whatsapp:+14155550100", `HX${"0".repeat(32)}`, '{"1":"Ada"}', null]);
});

test("Twilio's signature: the address and the sorted fields; a changed field fails", () => {
  const params = { From: "+14155550132", To: "+18005550100", Body: "STOP", AccountSid: ACCT.sid };
  const sig = twilioSignature("tok", "https://app.tryclaritia.com/api/texts/inbound", params);
  assert.ok(signatureOk("tok", "https://app.tryclaritia.com/api/texts/inbound", params, sig));
  assert.ok(!signatureOk("tok", "https://app.tryclaritia.com/api/texts/inbound", { ...params, Body: "START" }, sig));
  assert.ok(!signatureOk("other", "https://app.tryclaritia.com/api/texts/inbound", params, sig));
  assert.ok(!signatureOk("tok", "https://app.tryclaritia.com/api/texts/inbound", params, null));
});

/** A message's database side, the network and the mailer, in memory. */
function world(o: { taken?: Partial<Taken>; net?: (Response | Error)[]; mailFails?: boolean } = {}) {
  const row = { status: "queued", attempts: 0, sid: null as string | null, error: null as string | null };
  const optouts: unknown[] = [];
  const mails: { to: string; raw: string }[] = [];
  const sends: URLSearchParams[] = [];
  const rpc: Rpc = async (fn, args) => {
    if (fn === "text_take") {
      if (!["queued", "sending"].includes(row.status)) return { data: null, error: null };
      row.attempts += 1;
      row.status = "sending";
      const t: Taken = {
        id: MSG, workspace_id: "ws1", channel: "sms", to_phone: "+14155550132", body: "Hi Ada\nReply STOP to opt out.", template: null, vars: {},
        meeting_id: "m1", meeting_start: "2026-11-06T15:00:00.000Z", fallback: { subject: "Starting in an hour", text: "Hi Ada" },
        attempts: row.attempts, stopped: [], consent: "granted", meeting: { status: "booked", start_at: "2026-11-06T15:00:00+00:00" },
        twilio_source: null, email: "ada@acme.com", sending: { from_name: "Acme", from_email: null, reply_to: null }, ...o.taken,
      };
      return { data: t, error: null };
    }
    if (fn === "text_done") {
      row.status = String(args.p_status);
      row.sid = (args.p_sid as string | null) ?? row.sid;
      row.error = (args.p_error as string | null) ?? null;
      return { data: null, error: null };
    }
    if (fn === "text_optout") return (optouts.push(args), { data: null, error: null });
    return { data: null, error: { message: `unexpected ${fn}` } };
  };
  const net = [...(o.net ?? [])];
  const fetcher = (async (_u: string, init: RequestInit) => {
    sends.push(new URLSearchParams(String(init.body)));
    const n = net.shift();
    if (!n) throw new Error("no more answers");
    if (n instanceof Error) throw n;
    return n;
  }) as unknown as typeof fetch;
  const mailer = { send: async (m: { to: string; raw: string }) => {
    if (o.mailFails) throw new Error("SMTP down");
    mails.push(m);
    return "ok";
  } };
  const env = { TWILIO_ACCOUNT_SID: ACCT.sid, TWILIO_AUTH_TOKEN: "tok", TWILIO_FROM: "+18005550100" };
  return { rpc, row, optouts, mails, sends, d: { base: "https://app.tryclaritia.com", mailer, from: "meetings@mail.tryclaritia.com", fetcher, env } };
}
const sent = () => new Response(JSON.stringify({ sid: `SM${"e".repeat(32)}`, from: "+18005550100" }), { status: 201 });
const busy = () => new Response("{}", { status: 429, headers: { "retry-after": "20" } });
const down = () => new Response("{}", { status: 503 });

test("it sends once, with the delivery address, and marks it sent", async () => {
  const w = world({ net: [sent()] });
  assert.deepEqual(await textOnce(w.rpc, w.d, MSG), {});
  assert.equal(w.row.status, "sent");
  assert.equal(w.sends[0]!.get("StatusCallback"), "https://app.tryclaritia.com/api/texts/status");
  assert.deepEqual(await textOnce(w.rpc, w.d, MSG), {}, "a repeat job finds it finished");
  assert.equal(w.sends.length, 1);
});

test("flaky: a number that replied STOP, a canceled or moved meeting and no consent get nothing", async () => {
  for (const [taken, why] of [
    [{ stopped: ["+18005550100"] }, "they replied STOP"],
    [{ stopped: ["*"] }, "they replied STOP"],
    [{ meeting: { status: "canceled", start_at: "2026-11-06T15:00:00Z" } }, "the meeting was canceled"],
    [{ meeting: { status: "booked", start_at: "2026-11-07T15:00:00Z" } }, "the meeting moved"],
    [{ meeting: null }, "the meeting was canceled"],
    [{ consent: "withdrawn" }, "no text consent"],
  ] as [Partial<Taken>, string][]) {
    const w = world({ taken, net: [sent()] });
    await textOnce(w.rpc, w.d, MSG);
    assert.equal(w.sends.length, 0, why);
    assert.equal(w.mails.length, 0, `${why}: no email either`);
    assert.deepEqual([w.row.status, w.row.error], ["skipped", why]);
  }
});

test("flaky: a 429 is tried again and sends once; failing twice sends the step's email instead", async () => {
  const w = world({ net: [busy(), sent()] });
  assert.deepEqual(await textOnce(w.rpc, w.d, MSG), { retry: { error: "Twilio answered 429.", retryAfterS: 20 } });
  assert.equal(w.row.status, "queued");
  assert.deepEqual(await textOnce(w.rpc, w.d, MSG), {});
  assert.equal(w.row.status, "sent");
  assert.equal(w.sends.length, 2);
  assert.equal(w.mails.length, 0);

  const f = world({ net: [down(), down()] });
  assert.ok((await textOnce(f.rpc, f.d, MSG)).retry);
  assert.deepEqual(await textOnce(f.rpc, f.d, MSG), {});
  assert.equal(f.row.status, "emailed");
  assert.equal(f.mails.length, 1);
  assert.equal(f.mails[0]!.to, "ada@acme.com");
  assert.match(f.mails[0]!.raw, /Subject: Starting in an hour/);
  const noFallback = world({ net: [down(), down()], taken: { fallback: null } });
  await textOnce(noFallback.rpc, noFallback.d, MSG);
  await textOnce(noFallback.rpc, noFallback.d, MSG);
  assert.equal(noFallback.row.status, "failed");
  const mailDown = world({ net: [new Response(JSON.stringify({ code: 21211, message: "Invalid 'To' Phone Number" }), { status: 400 })], mailFails: true });
  await textOnce(mailDown.rpc, mailDown.d, MSG);
  assert.equal(mailDown.row.status, "failed");
  assert.match(mailDown.row.error!, /didn't go either/);
});

test("flaky: no answer from Twilio is unknown and never sent again; Twilio's own STOP is kept", async () => {
  const w = world({ net: [Object.assign(new Error("t"), { name: "TimeoutError" }), sent()] });
  assert.deepEqual(await textOnce(w.rpc, w.d, MSG), {});
  assert.equal(w.row.status, "unknown");
  assert.deepEqual(await textOnce(w.rpc, w.d, MSG), {});
  assert.equal(w.sends.length, 1);
  assert.equal(w.mails.length, 0);
  const s = world({ net: [new Response(JSON.stringify({ code: 21610, message: "unsubscribed" }), { status: 400 })] });
  await textOnce(s.rpc, s.d, MSG);
  assert.deepEqual(s.optouts, [{ p_sender: "+18005550100", p_phone: "+14155550132", p_stop: true }]);
  assert.equal(s.row.status, "skipped");
  assert.equal(s.mails.length, 0);
});

test("WhatsApp needs the team's own Twilio; without it, the step's email goes", async () => {
  const w = world({ taken: { channel: "whatsapp", template: `HX${"0".repeat(32)}`, body: null } });
  await textOnce(w.rpc, w.d, MSG);
  assert.equal(w.sends.length, 0);
  assert.equal(w.row.status, "emailed");
  const team = world({ taken: { channel: "whatsapp", template: `HX${"0".repeat(32)}`, body: null, vars: { "1": "Ada" }, twilio_source: "src1" }, net: [sent()] });
  const keys = { account_sid: `AC${"f".repeat(32)}`, auth_token: "team", from: "+15550001111", whatsapp_from: "+15550002222" };
  await textOnce(team.rpc, { ...team.d, teamKeys: async () => keys }, MSG);
  assert.equal(team.row.status, "sent");
  assert.equal(team.sends[0]!.get("From"), "whatsapp:+15550002222");
});
