// Form settings (docs/forms-plan.md Part 6): team alerts, the auto-reply, the new spam rules and how long
// submissions are kept. The form_notify job runs on fake data with a fake mailer, including the flaky cases: the
// provider saying not now, a timeout that may have sent, and a retry after a partial send.
import assert from "node:assert/strict";
import { test } from "node:test";
import { formNotify, type NotifyInfo } from "../worker-intel/jobs/forms.ts";
import { SendError } from "../src/lib/email/provider.ts";
import { alertEmail, cleanKeep, cleanNotify, cleanReply, cleanSites, merge, replyEmail, replyGoes, siteAllowed, DEFAULT_REPLY } from "../src/lib/forms/notify.ts";
import { applyOp, type Op } from "../src/lib/forms/ops.ts";
import { checkForm, emptyForm, type Form } from "../src/lib/forms/schema.ts";
import { prepareSubmit } from "../src/lib/forms/submit.ts";
import { JobError, type Job } from "../src/lib/jobs.ts";

const SID = "11111111-1111-4111-8111-111111111111";
const WS = "22222222-2222-4222-8222-222222222222";
const FORM = "33333333-3333-4333-8333-333333333333";

function body(over: Partial<Form> = {}): Form {
  const f = emptyForm();
  f.steps[0]!.fields.push({ id: "n1", key: "first_name", type: "text", label: "First name", required: false }, { id: "c1", key: "q.size", type: "text", label: "Company size", required: false });
  return { ...f, ...over };
}

function info(over: Partial<NotifyInfo> = {}, form: Partial<Form> = {}): NotifyInfo {
  return {
    submission: { id: SID, workspace_id: WS, form_id: FORM, values: { email: "maya@linear.app", first_name: "Maya", "q.size": "51-200" }, spam: false, test: false, contact_id: "c" },
    form: "Request AI Visibility Audit",
    body: body({
      notify: { on: true, to: ["vincent@perceptric.com", "sam@perceptric.com"], subject: "New submission: {{form}} from {{name}}", answers: true, slack: false },
      reply: { ...DEFAULT_REPLY, on: true },
      ...form,
    }),
    contact: { id: "c", email: "maya@linear.app", email_class: "work", first_name: "Maya", last_name: "Chen", company: "Linear", owner: "u1" },
    owner: { id: "u1", name: "Sam Lee", email: "sam@perceptric.com" },
    handle: "sam",
    workspace: "Perceptric",
    sealed: null,
    sending: { from_name: "Perceptric", from_email: null, reply_to: null, paused: false },
    sent: [],
    ...over,
  };
}

function harness(start: NotifyInfo | null, failFor: (to: string, n: number) => Error | null = () => null, payload: Record<string, unknown> = {}, fetcher?: typeof fetch, batcher?: { batch: (items: { out: { to: string }; key: string }[]) => Promise<string[]> }) {
  const marked = new Set<string>(start?.sent ?? []);
  const mails: { to: string; raw: string }[] = [];
  const tries = new Map<string, number>();
  const queued: Record<string, unknown>[] = [];
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    if (fn === "form_notify_info") return { data: start ? { ...start, sent: [...marked] } : null, error: null };
    if (fn === "form_notify_claim") {
      const got = (args.p_parts as string[]).filter((p) => !marked.has(p));
      for (const p of got) marked.add(p);
      return { data: got, error: null };
    }
    if (fn === "form_notify_unclaim") return ((args.p_parts as string[]).forEach((p) => marked.delete(p)), { data: null, error: null });
    if (fn === "enqueue_job") return (queued.push(args), { data: "j2", error: null });
    return { data: null, error: { message: `unexpected ${fn}` } };
  };
  const mailer = {
    send: async (m: { to: string; raw: string }) => {
      const n = (tries.get(m.to) ?? 0) + 1;
      tries.set(m.to, n);
      const err = failFor(m.to, n);
      if (err) throw err;
      mails.push(m);
      return "id";
    },
  };
  const run = formNotify(rpc as never, { mailer: mailer as never, base: "https://app.test", from: "meetings@tryclaritia.com", fetcher, batcher: batcher as never });
  const job = { id: "j", kind: "form_notify", key: `form_notify:${SID}`, workspace_id: WS, payload: { submission: SID, ...payload }, attempts: 1, max_attempts: 5 } as unknown as Job;
  return { go: () => run(job, new AbortController().signal), mails, marked, queued };
}

test("merge tags fill in, fall back, and drop unknown tags", () => {
  assert.equal(merge("Hi {{first_name|there}}, from {{form}}{{nope}}", { first_name: "Maya", form: "Audit" }), "Hi Maya, from Audit");
  assert.equal(merge("Hi {{ first_name | there }}", { first_name: "  " }), "Hi there");
});

test("settings clean: bad addresses dropped, an on alert needs somewhere to go, the reply needs words and an email field", () => {
  const errors: string[] = [];
  assert.deepEqual(cleanNotify({ on: true, to: ["A@B.co", "a@b.co", "nope", "x@y"] }, errors)?.to, ["a@b.co"]);
  assert.deepEqual(errors, []);
  cleanNotify({ on: true, to: [] }, errors);
  assert.match(errors[0]!, /add an email/);
  const e2: string[] = [];
  cleanReply({ on: true, body: " " }, e2, false);
  assert.deepEqual(e2, ["Auto-reply: write the message.", "Auto-reply: the form needs an email field."]);
  assert.deepEqual(cleanKeep({ days: 365 }), { days: 365 });
  assert.deepEqual(cleanKeep({ days: 7 }), { days: null });
  assert.deepEqual(cleanSites(["https://www.Acme.com/pricing", "acme.com", "bad site", "app.acme.io:443"]), ["acme.com", "app.acme.io"]);
});

test("the form keeps its settings through the check and the ops", () => {
  const f = body();
  const r = checkForm({ ...f, notify: { on: true, to: ["a@b.co"] }, reply: { on: true, body: "Thanks" }, keep: { days: 30 }, spam: { ...f.spam, blockFree: true, sites: ["acme.com"], perHour: 50 } });
  assert.ok("form" in r, JSON.stringify(r));
  assert.equal(r.form.notify?.to[0], "a@b.co");
  assert.equal(r.form.reply?.from, "owner");
  assert.deepEqual(r.form.keep, { days: 30 });
  assert.deepEqual(r.form.spam, { minSeconds: 2, turnstile: false, blockFree: true, sites: ["acme.com"], perHour: 50 });
  let cur = f;
  for (const op of [{ op: "set_notify", notify: { on: true, to: ["x@y.co"] } }, { op: "set_spam", perHour: 10 }, { op: "set_spam", perHour: null }] as Op[]) {
    const next = applyOp(cur, op);
    assert.ok("form" in next);
    cur = next.form;
  }
  assert.equal(cur.notify?.on, true);
  assert.equal(cur.spam.perHour, undefined);
});

test("sites: subdomains count, other sites and a missing origin don't", () => {
  assert.equal(siteAllowed(["acme.com"], "https://www.acme.com"), true);
  assert.equal(siteAllowed(["acme.com"], "https://blog.acme.com"), true);
  assert.equal(siteAllowed(["acme.com"], "https://acme.com.evil.io"), false);
  assert.equal(siteAllowed(["acme.com"], null), false);
  assert.equal(siteAllowed(undefined, null), true);
});

test("submit: free mail refused when blocked, off-site and over-limit fills held as spam", () => {
  const f = body({ spam: { minSeconds: 0, turnstile: false, blockFree: true, sites: ["acme.com"] } });
  const emailId = f.steps[0]!.fields[0]!.id;
  const raw = { v: 1, key: "k".repeat(20), version: 1, ms: 5000, answers: { [emailId]: "maya@gmail.com" } };
  const ctx = { custom: [] };
  const free = prepareSubmit(f, 1, raw as never, ctx, { origin: "https://acme.com" });
  assert.ok("errors" in free && Object.values(free.errors)[0] === "Use your work email.", JSON.stringify(free));
  const work = { ...raw, answers: { [emailId]: "maya@linear.app" } };
  const off = prepareSubmit(f, 1, work as never, ctx, { origin: "https://evil.io" });
  assert.ok("args" in off && off.args.p_spam === "site");
  const own = prepareSubmit(f, 1, work as never, ctx, { origin: "https://app.tryclaritia.com", ownHost: "app.tryclaritia.com" });
  assert.ok("args" in own && own.args.p_spam === null);
  const over = prepareSubmit(f, 1, work as never, ctx, { origin: "https://acme.com", overLimit: true });
  assert.ok("args" in over && over.args.p_spam === "rate");
});

test("emails: the alert lists answers in order and escapes them; the reply carries the booking link", () => {
  const a = alertEmail({ form: "Audit", lead: { name: "Maya <b>", email: "m@l.app" }, answers: [{ label: "Size", value: "51-200" }], showAnswers: true, subject: "New: {{name}}", link: "https://app.test/forms/x", owner: "Sam" });
  assert.equal(a.subject, "New: Maya <b>");
  assert.ok(a.html.includes("Maya &lt;b&gt;") && !a.html.includes("<b>"));
  assert.ok(a.text.includes("Size: 51-200") && a.text.includes("Routed to Sam."));
  const r = replyEmail({ reply: { ...DEFAULT_REPLY, on: true }, lead: { first_name: "" }, form: "Audit", sender: "Sam Lee", booking: "https://app.test/booking/sam" });
  assert.equal(r.subject, "Thanks, there");
  assert.ok(r.html.includes("https://app.test/booking/sam") && r.text.includes("Pick a time: https://app.test/booking/sam"));
  assert.equal(replyGoes({ ...DEFAULT_REPLY, on: true }, "m@gmail.com", "free"), false);
  assert.equal(replyGoes({ ...DEFAULT_REPLY, on: true, workOnly: false }, "m@gmail.com", "free"), true);
});

test("form_notify sends each teammate's alert and the reply once, from the routed rep", async () => {
  const h = harness(info());
  await h.go();
  assert.deepEqual(h.mails.map((m) => m.to).sort(), ["maya@linear.app", "sam@perceptric.com", "vincent@perceptric.com"]);
  const reply = h.mails.find((m) => m.to === "maya@linear.app")!.raw;
  assert.match(reply, /From: "Sam Lee"/);
  assert.match(reply, /Reply-To: sam@perceptric.com/);
  const text = Buffer.from(reply.split("Content-Transfer-Encoding: base64\r\n\r\n")[1]!.split("\r\n--")[0]!.replace(/\r\n/g, ""), "base64").toString("utf8");
  assert.match(text, /Pick a time: https:\/\/app.test\/booking\/sam/);
  assert.deepEqual([...h.marked].sort(), ["alert:sam@perceptric.com", "alert:vincent@perceptric.com", "reply"]);
  // The same job again sends nothing.
  await h.go();
  assert.equal(h.mails.length, 3);
});

test("form_notify: a 'not now' retries only what's left; a send that may have gone is never repeated", async () => {
  const h = harness(info(), (to, n) => (to === "sam@perceptric.com" && n === 1 ? new SendError("rate", { later: true }) : to === "maya@linear.app" && n === 1 ? new SendError("timeout", { unknown: true }) : null));
  await assert.rejects(h.go(), (e) => e instanceof JobError);
  assert.deepEqual(h.mails.map((m) => m.to), ["vincent@perceptric.com"]);
  // The reply timed out: it may have gone, so it's noted and not sent again.
  assert.ok(h.marked.has("reply"));
  await h.go();
  assert.deepEqual(h.mails.map((m) => m.to), ["vincent@perceptric.com", "sam@perceptric.com"]);
});

test("form_notify sends nothing for spam, tests, gone submissions or a paused workspace's reply", async () => {
  for (const s of [info({ submission: { ...info().submission, spam: true } }), info({ submission: { ...info().submission, test: true } }), null]) {
    const h = harness(s);
    await h.go();
    assert.equal(h.mails.length, 0);
  }
  const paused = harness(info({ sending: { from_name: null, from_email: null, reply_to: null, paused: true } }));
  await paused.go();
  assert.ok(!paused.mails.some((m) => m.to === "maya@linear.app"));
  const free = harness(info({ contact: { ...info().contact!, email: "maya@gmail.com", email_class: "free" } }));
  await free.go();
  assert.ok(!free.mails.some((m) => m.to === "maya@gmail.com"));
});

const textOf = (raw: string) => Buffer.from(raw.split("Content-Transfer-Encoding: base64\r\n\r\n")[1]!.split("\r\n--")[0]!.replace(/\r\n/g, ""), "base64").toString("utf8");
const ago = (s: number) => new Date(Date.now() - s * 1000).toISOString();

test("alerts go now and the auto-reply 5 minutes later, each its own job", async () => {
  const { queueNotify, REPLY_DELAY_S } = await import("../src/lib/forms/submit.ts");
  const jobs: Record<string, unknown>[] = [];
  const rpc = async (fn: string, args: Record<string, unknown>) => (fn === "enqueue_job" && jobs.push(args), { data: "j", error: null });
  await queueNotify(rpc as never, WS, info().body!, SID);
  assert.deepEqual(jobs.map((j) => [j.p_key, (j.p_payload as { only: string }).only, j.p_delay_s]), [[`form_notify:${SID}`, "alerts", 0], [`form_reply:${SID}`, "reply", REPLY_DELAY_S]]);
  const alerts = harness(info(), undefined, { only: "alerts" });
  await alerts.go();
  assert.ok(!alerts.mails.some((m) => m.to === "maya@linear.app"));
  const reply = harness(info(), undefined, { only: "reply" });
  await reply.go();
  assert.deepEqual(reply.mails.map((m) => m.to), ["maya@linear.app"]);
});

test("alerts wait for a route job that hasn't finished (without using a try), then send without a rep", async () => {
  const young = harness(info({ routing: "pending", owner: null, submission: { ...info().submission, created_at: ago(20) } }));
  await young.go();
  assert.equal(young.mails.length, 0, "nothing sent while it waits");
  assert.equal(young.queued.length, 1, "the job goes back in line instead of failing");
  assert.equal(young.queued[0]!.p_key, `form_notify:${SID}`);
  assert.equal(young.queued[0]!.p_delay_s, 30);
  assert.equal((young.queued[0]!.p_payload as { waiting_route?: boolean }).waiting_route, true, "marked so the route's commit can wake it");
  const old = harness(info({ routing: "pending", owner: null, submission: { ...info().submission, created_at: ago(200) } }));
  await old.go();
  assert.ok(old.mails.length >= 2, "after 2 minutes it sends anyway");
  const done = harness(info({ routing: "done", submission: { ...info().submission, created_at: ago(5) } }));
  await done.go();
  assert.ok(done.mails.length >= 2);
});

test("the form's Slack post is left to Routing when the router is live", async () => {
  const posts: string[] = [];
  const fetcher = (async (url: string) => (posts.push(String(url)), new Response("ok", { status: 200 }))) as unknown as typeof fetch;
  const withSlack = (routing: NotifyInfo["routing"]) => info({ routing, sealed: "sealed" }, { notify: { on: true, to: ["vincent@perceptric.com"], subject: "New", answers: false, slack: true } });
  const live = harness(withSlack("done"), undefined, { only: "alerts" }, fetcher);
  await live.go();
  assert.ok(!live.marked.has("slack"));
  assert.equal(posts.length, 0);
});

test("the auto-reply links to the meeting the lead was offered, and leaves the link out once they booked", async () => {
  const offered = harness(info({ meet: { id: "t", slug: "enterprise-demo" } }), undefined, { only: "reply" });
  await offered.go();
  assert.match(textOf(offered.mails[0]!.raw), /https:\/\/app.test\/booking\/sam\/enterprise-demo/);
  const booked = harness(info({ booked: true }), undefined, { only: "reply" });
  await booked.go();
  assert.equal(booked.mails.length, 1, "the reply still goes");
  assert.doesNotMatch(textOf(booked.mails[0]!.raw), /booking/);
});

test("two workers holding the same job (a lost lease) send each alert once", async () => {
  const h = harness(info());
  // Both run at once against the same claims.
  await Promise.all([h.go(), h.go()]);
  assert.deepEqual(h.mails.map((m) => m.to).sort(), ["maya@linear.app", "sam@perceptric.com", "vincent@perceptric.com"]);
});

test("the teammates' alerts go in one Resend batch; a 'not now' gives every claim back for the retry", async () => {
  const batches: string[][] = [];
  let fail = true;
  const batcher = {
    batch: async (items: { out: { to: string }; key: string }[]) => {
      batches.push(items.map((i) => i.out.to));
      if (fail) {
        fail = false;
        throw new SendError("rate", { later: true });
      }
      return items.map(() => "id");
    },
  };
  const h = harness(info(), undefined, { only: "alerts" }, undefined, batcher);
  await assert.rejects(h.go(), (e) => e instanceof JobError);
  assert.ok(!h.marked.has("alert:sam@perceptric.com") && !h.marked.has("alert:vincent@perceptric.com"), "claims given back");
  await h.go();
  assert.deepEqual(batches, [["vincent@perceptric.com", "sam@perceptric.com"], ["vincent@perceptric.com", "sam@perceptric.com"]]);
  assert.equal(h.mails.length, 0, "no one-by-one sends");
  await h.go();
  assert.equal(batches.length, 2, "sent once");
});
