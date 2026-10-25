// Sending on a real database (docs/enrich-workflows-reports.md Part 0): the guard at send time, flaky Resend answers,
// a worker killed mid-send, Resend events, complaint storms, clicks and unsubscribes. Resend is a fake that records
// each call and the key it carried.
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import pg from "pg";
import { uuid7 } from "../../collect/ids.ts";
import { SendError, type Outgoing } from "../../src/lib/email/provider.ts";
import { readToken } from "../../src/lib/email/track.ts";
import type { Job } from "../../src/lib/jobs.ts";
import { send, type Sender } from "../../worker-intel/jobs/email.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 4 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
const one = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await q(sql, p))[0] as T;
after(() => pool.end());
const rpc = pgRpc(pool);
const SECRET = "s".repeat(40);

let ws = "";
let owner = "";
const contact: Record<string, string> = {};

// The fake Resend: each call (one email or a batch) takes the next answer from `script` (then "ok"), and it keeps
// every email it took with its key. A repeat of a key Resend already took gives the first answer, as Resend does.
let sent: Outgoing[] = [];
let keys: string[] = [];
type Step = "ok" | "throttle" | "reject" | "timeout" | "server";
let script: Step[] = [];
const taken = new Map<string, string>();
const fail = (s: Step) =>
  s === "throttle" ? new SendError("Resend 429", { status: 429, later: true, retryAfterS: 30 }) :
  s === "reject" ? new SendError("Resend 422 validation_error", { status: 422, invalid: true }) :
  s === "server" ? new SendError("Resend 500", { status: 500, retry: true }) :
  new SendError("Resend didn't answer", { unknown: true });
const sender: Sender = {
  async send(m, key) {
    if (taken.has(key)) return taken.get(key)!;
    const next = script.shift() ?? "ok";
    if (next === "timeout") {
      // Resend took it, but the answer never came back.
      sent.push(m);
      keys.push(key);
      taken.set(key, `re-${uuid7()}`);
      throw fail(next);
    }
    if (next !== "ok") throw fail(next);
    sent.push(m);
    keys.push(key);
    taken.set(key, `re-${uuid7()}`);
    return taken.get(key)!;
  },
  async batch(items) {
    const next = script.shift() ?? "ok";
    if (next !== "ok" && next !== "timeout") throw fail(next);
    for (const i of items) {
      sent.push(i.out);
      keys.push(i.key);
    }
    if (next === "timeout") throw fail(next);
    return items.map(() => `re-${uuid7()}`);
  },
};

const job = (): Job => ({ id: uuid7(), workspace_id: ws, kind: "send", key: ws, payload: {}, attempts: 1, max_attempts: 3 });
const runSend = () => send(rpc, { sender, base: "https://app.test", secret: SECRET, roundMs: 5_000, sleep: async () => {} })(job(), new AbortController().signal);

async function newEmail(o: { topic?: string; marketing?: boolean; kind?: string } = {}) {
  return (await rpc("email_create", {
    p_ws: ws,
    p_user: owner,
    p_values: { kind: o.kind ?? "broadcast", subject: "News", html: `<p><a href="https://acme.com/a">A</a></p>`, text: "News", links: ["https://acme.com/a"], marketing: o.marketing ?? true, topic_id: o.topic ?? "" },
  })).data as string;
}
const queue = async (email: string, names: string[]) => (await rpc("email_queue", { p_email: email, p_contacts: names.map((n) => contact[n]) })).data as number;
const msgOf = (email: string, name: string) => one<{ id: string; status: string; skip_reason: string | null; send_after: Date; provider_id: string | null; attempts: number }>(`select * from email_messages where email_id = $1 and contact_id = $2`, [email, contact[name]]);

before(async () => {
  process.env.SECRETS_KEY = SECRET;
  ws = uuid7();
  owner = uuid7();
  await q(`insert into workspaces (id, name) values ($1, 'email')`, [ws]);
  await q(`insert into auth.users (id, email) values ($1, $2)`, [owner, `owner-${owner}@acme.com`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, owner]);
  await q(`insert into sending_domains (workspace_id, domain, mail_from, tracking_host, status) values ($1, $2, $3, $4, 'verified')`, [ws, `m${ws.slice(-8)}.acme.com`, `bounce.m${ws.slice(-8)}.acme.com`, `t.m${ws.slice(-8)}.acme.com`]);
  await q(`insert into send_settings (workspace_id, from_name, from_email, address, quiet_start, quiet_end) values ($1, 'Acme', $2, '1 Main St', 0, 0)`, [ws, `news@m${ws.slice(-8)}.acme.com`]);
  const people: [string, string | null, string | null, string | null][] = [
    // name, country, consent basis, time zone
    ["us", "US", null, null],
    ["us2", "US", null, null],
    ["us3", "US", null, null],
    ["de", "DE", null, null],
    ["de_opt", "DE", "opt_in", null],
    ["de_li", "DE", "legitimate_interest", null],
    ["nobody", null, null, null],
    ["tokyo", "JP", "opt_in", "Asia/Tokyo"],
    ["badtz", "US", null, "Mars/Olympus"],
    ["capped", "US", null, null],
  ];
  for (const [name, country, basis, tz] of people) {
    const email = `${name}-${ws.slice(-6)}@example.com`;
    const r = await one<{ id: string }>(`insert into contacts (workspace_id, email, email_clean, country, timezone) values ($1, $2, $2, $3, $4) returning id`, [ws, email, country, tz]);
    contact[name] = r.id;
    if (basis) await q(`insert into consents (workspace_id, contact_id, channel, basis, status, source) values ($1, $2, 'email', $3, 'granted', 'form')`, [ws, r.id, basis]);
  }
});

beforeEach(() => {
  sent = [];
  keys = [];
  script = [];
});

test("the lawful basis by region: US without a record sends; EU needs opt-in; legitimate interest is US only", async () => {
  const e = await newEmail();
  assert.equal(await queue(e, ["us", "de", "de_opt", "de_li", "nobody"]), 5);
  assert.equal(await queue(e, ["us", "de"]), 0, "queuing again adds nothing");
  await runSend();
  assert.equal((await msgOf(e, "us")).status, "sent");
  assert.equal((await msgOf(e, "de_opt")).status, "sent");
  assert.equal((await msgOf(e, "de")).skip_reason, "no_basis");
  assert.equal((await msgOf(e, "de_li")).skip_reason, "no_basis");
  assert.equal((await msgOf(e, "nobody")).skip_reason, "no_basis", "an unknown country is not the US");
  assert.equal(sent.length, 2);
  assert.ok(sent.every((m) => m.headers.some((h) => h.name === "List-Unsubscribe-Post" && h.value === "List-Unsubscribe=One-Click")));
  const unsub = sent[0].headers.find((h) => h.name === "List-Unsubscribe")!.value.slice("<https://app.test/u/".length, -1);
  const t = readToken(unsub, SECRET);
  assert.equal(t?.kind, "unsub");
  assert.ok([(await msgOf(e, "us")).id, (await msgOf(e, "de_opt")).id].includes(t!.message));
  assert.equal((await one<{ n: string }>(`select count(*) n from contact_events where contact_id = $1 and kind = 'email.sent'`, [contact.us])).n, "1");
});

test("an address suppressed while its message waits in line is never sent", async () => {
  const e = await newEmail();
  await queue(e, ["us2"]);
  await rpc("suppress", { p_ws: ws, p_source: "manual", p_rows: [{ email_clean: `us2-${ws.slice(-6)}@example.com`, reason: "unsubscribed" }] });
  await runSend();
  assert.equal((await msgOf(e, "us2")).skip_reason, "suppressed");
  assert.equal(sent.length, 0);
  await q(`delete from suppressions where workspace_id = $1`, [ws]);
});

test("topics: an unsubscribed topic stops the email; a topic that's off by default needs a subscription", async () => {
  const on = await one<{ id: string }>(`insert into topics (workspace_id, name, default_on) values ($1, 'Product news', true) returning id`, [ws]);
  const off = await one<{ id: string }>(`insert into topics (workspace_id, name, default_on) values ($1, 'Events', false) returning id`, [ws]);
  await q(`insert into subscriptions (workspace_id, contact_id, topic_id, status) values ($1, $2, $3, 'unsubscribed')`, [ws, contact.us3, on.id]);
  const a = await newEmail({ topic: on.id });
  const b = await newEmail({ topic: off.id });
  await queue(a, ["us3", "de_opt"]);
  await queue(b, ["de_opt"]);
  await runSend();
  assert.equal((await msgOf(a, "us3")).skip_reason, "not_subscribed");
  assert.equal((await msgOf(a, "de_opt")).status, "sent");
  assert.equal((await msgOf(b, "de_opt")).skip_reason, "not_subscribed");
});

test("the frequency cap skips a fourth marketing email in 7 days; non-marketing email isn't capped", async () => {
  for (let i = 0; i < 3; i++) {
    const e = await newEmail();
    await queue(e, ["capped"]);
  }
  await runSend();
  const fourth = await newEmail();
  await queue(fourth, ["capped"]);
  const receipt = await newEmail({ marketing: false });
  await queue(receipt, ["capped"]);
  await runSend();
  assert.equal((await msgOf(fourth, "capped")).skip_reason, "cap");
  assert.equal((await msgOf(receipt, "capped")).status, "sent");
});

test("quiet hours wait for morning in the contact's time zone; an unknown zone falls back to the workspace's", async () => {
  await q(`update send_settings set quiet_start = 21, quiet_end = 8 where workspace_id = $1`, [ws]);
  const e = await newEmail();
  await queue(e, ["tokyo", "badtz"]);
  const m = await msgOf(e, "tokyo");
  // 23:30 in Tokyo is 14:30 UTC.
  const g = (await rpc("email_guard", { p_message: m.id, p_now: "2026-10-16T14:30:00Z" })).data as { reason: string; retry_at: string };
  assert.equal(g.reason, "quiet");
  assert.equal(new Date(g.retry_at).toISOString(), "2026-10-16T23:00:00.000Z", "08:00 the next morning in Tokyo");
  assert.equal((await rpc("email_guard", { p_message: m.id, p_now: "2026-10-16T02:00:00Z" })).data, null, "11:00 in Tokyo is fine");
  const bad = await msgOf(e, "badtz");
  assert.equal(((await rpc("email_guard", { p_message: bad.id, p_now: "2026-10-16T22:00:00Z" })).data as { reason: string }).reason, "quiet", "22:00 UTC is quiet for the workspace's UTC");
  // Sent through the job: whichever is quiet now moves to later and stays queued.
  await runSend();
  for (const name of ["tokyo", "badtz"]) {
    const x = await msgOf(e, name);
    assert.ok(x.status === "sent" || (x.status === "queued" && x.send_after > new Date()), `${name} is ${x.status}`);
  }
  await q(`update send_settings set quiet_start = 0, quiet_end = 0 where workspace_id = $1`, [ws]);
  await q(`update email_messages set status = 'skipped', skip_reason = 'test' where email_id = $1 and status = 'queued'`, [e]);
});

test("flaky Resend: a rate limit sends nothing and costs no try; a bad address is found alone; a timed-out send repeats with its key and makes one email", async () => {
  const extra: string[] = [];
  for (let i = 0; i < 3; i++) {
    const r = await one<{ id: string }>(`insert into contacts (workspace_id, email, email_clean, country) values ($1, $2, $2, 'US') returning id`, [ws, `flaky${i}-${ws.slice(-6)}@example.com`]);
    contact[`flaky${i}`] = r.id;
    extra.push(`flaky${i}`);
  }
  const e = await newEmail();
  await queue(e, extra);
  const states = async () => (await q(`select status, attempts from email_messages where email_id = $1 order by to_email`, [e])).map((s) => `${s.status}:${s.attempts}`);

  // The batch hits the rate limit: all three go back in line for 30 seconds, and the try doesn't count.
  await q(`delete from jobs where workspace_id = $1 and kind = 'send' and status = 'queued'`, [ws]);
  script = ["throttle"];
  await runSend();
  assert.deepEqual(await states(), ["queued:0", "queued:0", "queued:0"]);
  assert.equal(sent.length, 0);
  const wait = await one<{ s: number }>(`select extract(epoch from min(send_after) - now())::int s from email_messages where email_id = $1`, [e]);
  assert.ok(wait.s >= 25 && wait.s <= 31, `waits about 30 s (${wait.s})`);
  assert.equal((await one<{ n: number }>(`select count(*)::int n from jobs where workspace_id = $1 and kind = 'send' and status = 'queued' and run_after > now() + interval '20 seconds'`, [ws])).n, 1, "the next round waits too");

  // Resend refuses the batch for a bad address: each goes alone. One is refused, one times out after Resend took
  // it, one goes.
  await q(`update email_messages set send_after = now() where email_id = $1`, [e]);
  script = ["reject", "reject", "timeout", "ok"];
  await runSend();
  assert.deepEqual((await states()).sort(), ["failed:1", "queued:1", "sent:1"]);
  assert.equal(sent.length, 2, "the timed-out one did go out");

  // The timed-out one goes again, alone, with the same key: Resend answers with the first email. Still two.
  await q(`update email_messages set send_after = now() where email_id = $1 and status = 'queued'`, [e]);
  await runSend();
  assert.deepEqual((await states()).sort(), ["failed:1", "sent:1", "sent:2"]);
  assert.equal(sent.length, 2, "one email per address, never two");
  assert.equal(new Set(keys).size, keys.length);
});

test("a batch with no clear answer is never sent again; a server error on one email repeats with its key", async () => {
  const extra: string[] = [];
  for (let i = 0; i < 2; i++) {
    const r = await one<{ id: string }>(`insert into contacts (workspace_id, email, email_clean, country) values ($1, $2, $2, 'US') returning id`, [ws, `unclear${i}-${ws.slice(-6)}@example.com`]);
    contact[`unclear${i}`] = r.id;
    extra.push(`unclear${i}`);
  }
  const e = await newEmail();
  await queue(e, extra);
  script = ["timeout"];
  await runSend();
  assert.deepEqual((await q(`select status from email_messages where email_id = $1`, [e])).map((s) => s.status), ["unknown", "unknown"]);
  const before = sent.length;
  await runSend();
  assert.equal(sent.length, before, "an unclear batch is never repeated");

  const e2 = await newEmail();
  await queue(e2, ["unclear0"]);
  script = ["server"];
  await runSend();
  assert.equal((await one<{ status: string }>(`select status from email_messages where email_id = $1`, [e2])).status, "queued");
  await q(`update email_messages set send_after = now() where email_id = $1`, [e2]);
  await runSend();
  assert.equal((await one<{ status: string }>(`select status from email_messages where email_id = $1`, [e2])).status, "sent");
});

test("a worker killed mid-send never sends twice: the message turns 'unknown'", async () => {
  const r = await one<{ id: string }>(`insert into contacts (workspace_id, email, email_clean, country) values ($1, $2, $2, 'US') returning id`, [ws, `killed-${ws.slice(-6)}@example.com`]);
  contact.killed = r.id;
  const e = await newEmail();
  await queue(e, ["killed"]);
  // The worker claims it, hands it to Resend, and dies before recording the answer.
  const claimed = (await rpc("send_claim", { p_ws: ws, p_limit: 10 })).data as { id: string }[];
  assert.equal(claimed.length, 1);
  assert.equal((await msgOf(e, "killed")).status, "sending");
  await runSend();
  assert.equal(sent.length, 0, "a fresh worker doesn't touch it while it might still be in flight");
  await q(`update email_messages set claimed_at = now() - interval '11 minutes' where id = $1`, [claimed[0].id]);
  await runSend();
  assert.equal((await msgOf(e, "killed")).status, "unknown");
  assert.equal(sent.length, 0);
});

test("Resend events: delivered once per event id; hard bounces and 3 soft bounces suppress; a late delivered never undoes a bounce", async () => {
  const e = await newEmail();
  for (const n of ["bounce_hard", "bounce_soft"]) {
    const r = await one<{ id: string }>(`insert into contacts (workspace_id, email, email_clean, country) values ($1, $2, $2, 'US') returning id`, [ws, `${n}-${ws.slice(-6)}@example.com`]);
    contact[n] = r.id;
  }
  await queue(e, ["bounce_hard", "bounce_soft"]);
  await runSend();
  const hard = await msgOf(e, "bounce_hard");
  const soft = await msgOf(e, "bounce_soft");
  const apply = async (ev: object) => (await rpc("email_event_apply", { p_event: ev })).data;

  assert.equal(await apply({ event_id: `d-${hard.id}`, provider_id: hard.provider_id, kind: "delivered", at: new Date().toISOString() }), "ok");
  assert.equal(await apply({ event_id: `d-${hard.id}`, provider_id: hard.provider_id, kind: "delivered", at: new Date().toISOString() }), "duplicate");
  assert.equal((await msgOf(e, "bounce_hard")).status, "delivered");
  assert.equal(await apply({ event_id: `b-${hard.id}`, provider_id: hard.provider_id, kind: "bounced", bounce: "hard" }), "ok");
  assert.equal((await one<{ reason: string }>(`select reason from suppressions where workspace_id = $1 and email_clean = $2`, [ws, `bounce_hard-${ws.slice(-6)}@example.com`])).reason, "bounced");

  for (let i = 0; i < 2; i++) await apply({ event_id: `s${i}-${soft.id}`, provider_id: soft.provider_id, kind: "bounced", bounce: "soft" });
  assert.equal((await q(`select 1 from suppressions where workspace_id = $1 and email_clean = $2`, [ws, `bounce_soft-${ws.slice(-6)}@example.com`])).length, 0, "two soft bounces don't suppress");
  await apply({ event_id: `s2-${soft.id}`, provider_id: soft.provider_id, kind: "bounced", bounce: "soft" });
  assert.equal((await q(`select 1 from suppressions where workspace_id = $1 and email_clean = $2`, [ws, `bounce_soft-${ws.slice(-6)}@example.com`])).length, 1, "the third does");
  assert.equal(await apply({ event_id: "x", provider_id: "not-ours", kind: "delivered" }), "unknown_message");
  // Events out of order: a "delivered" that arrives after the bounce leaves it bounced.
  assert.equal(await apply({ event_id: `late-${hard.id}`, provider_id: hard.provider_id, kind: "delivered" }), "ok");
  assert.equal((await msgOf(e, "bounce_hard")).status, "bounced");
});

test("a complaint storm pauses the workspace; the owner resumes it", async () => {
  // 600 sent in the last week, then 2 complaints: 0.33%, over the 0.2% line.
  const e = await newEmail();
  await q(
    `insert into email_messages (workspace_id, email_id, to_email, dedupe, status, sent_at, provider_id)
     select $1, $2::uuid, 'bulk' || g || '@example.com', 'bulk' || g, 'sent', now() - interval '1 day', 'bulk-' || $2::text || '-' || g from generate_series(1, 600) g`,
    [ws, e],
  );
  await rpc("email_event_apply", { p_event: { event_id: `c1-${e}`, provider_id: `bulk-${e}-1`, kind: "complained" } });
  assert.equal((await one<{ paused: boolean }>(`select paused from send_settings where workspace_id = $1`, [ws])).paused, false, "one complaint in 600 is under the line");
  await rpc("email_event_apply", { p_event: { event_id: `c2-${e}`, provider_id: `bulk-${e}-2`, kind: "complained" } });
  const s = await one<{ paused: boolean; paused_reason: string }>(`select paused, paused_reason from send_settings where workspace_id = $1`, [ws]);
  assert.equal(s.paused, true);
  assert.match(s.paused_reason, /2 of 6\d\d sent/);
  assert.equal((await one<{ reason: string }>(`select reason from suppressions where workspace_id = $1 and email_clean = 'bulk1@example.com'`, [ws])).reason, "complained");

  const r = await one<{ id: string }>(`insert into contacts (workspace_id, email, email_clean, country) values ($1, $2, $2, 'US') returning id`, [ws, `paused-${ws.slice(-6)}@example.com`]);
  contact.paused = r.id;
  const next = await newEmail();
  await queue(next, ["paused"]);
  await runSend();
  assert.equal((await msgOf(next, "paused")).status, "queued", "nothing leaves while paused, and nothing is dropped");
  assert.equal(sent.length, 0);

  const c = await pool.connect();
  try {
    await c.query(`select set_config('request.jwt.claim.sub', $1, false)`, [owner]);
    await c.query("set role authenticated");
    await c.query(`select send_resume($1)`, [ws]);
  } finally {
    await c.query("reset role");
    await c.query(`select set_config('request.jwt.claim.sub', '', false)`);
    c.release();
  }
  await q(`delete from email_events where workspace_id = $1 and kind = 'complained'`, [ws]);
  await runSend();
  assert.equal((await msgOf(next, "paused")).status, "sent");
});

test("unsubscribes: all suppresses and withdraws consent; a topic leaves the rest on; a test changes nothing", async () => {
  const topic = await one<{ id: string }>(`insert into topics (workspace_id, name, default_on) values ($1, 'Webinars', true) returning id`, [ws]);
  const people = ["unsub_all", "unsub_topic"];
  for (const n of people) {
    const r = await one<{ id: string }>(`insert into contacts (workspace_id, email, email_clean, country) values ($1, $2, $2, 'US') returning id`, [ws, `${n}-${ws.slice(-6)}@example.com`]);
    contact[n] = r.id;
  }
  const e = await newEmail({ topic: topic.id });
  await queue(e, people);
  await runSend();
  const all = await msgOf(e, "unsub_all");
  const top = await msgOf(e, "unsub_topic");
  assert.equal(((await rpc("email_unsubscribe", { p_message: all.id, p_scope: "all" })).data as { scope: string }).scope, "all");
  assert.equal((await one<{ reason: string }>(`select reason from suppressions where workspace_id = $1 and email_clean = $2`, [ws, `unsub_all-${ws.slice(-6)}@example.com`])).reason, "unsubscribed");
  assert.equal((await one<{ status: string }>(`select status from consents where contact_id = $1 order by at desc limit 1`, [contact.unsub_all])).status, "withdrawn");

  assert.equal(((await rpc("email_unsubscribe", { p_message: top.id, p_scope: "topic" })).data as { scope: string }).scope, "topic");
  assert.equal((await q(`select 1 from suppressions where workspace_id = $1 and email_clean = $2`, [ws, `unsub_topic-${ws.slice(-6)}@example.com`])).length, 0);
  assert.equal((await one<{ status: string }>(`select status from subscriptions where contact_id = $1 and topic_id = $2`, [contact.unsub_topic, topic.id])).status, "unsubscribed");

  const t = await newEmail({ kind: "test" });
  const mid = (await rpc("email_queue_test", { p_email: t, p_user: owner })).data as string;
  await runSend();
  assert.equal((await one<{ status: string }>(`select status from email_messages where id = $1`, [mid])).status, "sent");
  assert.equal(((await rpc("email_unsubscribe", { p_message: mid, p_scope: "all" })).data as { test: boolean }).test, true);
  assert.equal((await q(`select 1 from suppressions where workspace_id = $1 and email_clean = $2`, [ws, `owner-${owner}@acme.com`])).length, 0);
});

test("a test only goes to a member; anyone else is skipped", async () => {
  const t = await newEmail({ kind: "test" });
  await q(`insert into email_messages (workspace_id, email_id, to_email, dedupe) values ($1, $2, 'stranger@example.com', 'stranger')`, [ws, t]);
  await runSend();
  assert.equal((await one<{ skip_reason: string }>(`select skip_reason from email_messages where email_id = $1`, [t])).skip_reason, "not_member");
  const nobody = uuid7();
  await assert.rejects(Promise.resolve(rpc("email_queue_test", { p_email: t, p_user: nobody })).then((r) => (r.error ? Promise.reject(new Error(r.error.message)) : r)), /Only members/);
});

test("clicks: scanners and the first 10 seconds don't count; a person's first click does; three in 5 seconds is a filter", async () => {
  const r = await one<{ id: string }>(`insert into contacts (workspace_id, email, email_clean, country) values ($1, $2, $2, 'US') returning id`, [ws, `clicker-${ws.slice(-6)}@example.com`]);
  contact.clicker = r.id;
  const e = await newEmail();
  await queue(e, ["clicker"]);
  await runSend();
  const m = await msgOf(e, "clicker");
  const click = async (human: boolean) => (await rpc("email_click", { p_message: m.id, p_link: 0, p_human: human, p_data: {} })).data;
  assert.equal(await click(true), "https://acme.com/a");
  assert.equal((await one<{ first_click_at: Date | null }>(`select first_click_at from email_messages where id = $1`, [m.id])).first_click_at, null, "seconds after sending is a filter");
  await q(`update email_messages set sent_at = now() - interval '1 hour' where id = $1`, [m.id]);
  await q(`delete from email_events where message_id = $1`, [m.id]);
  await click(false);
  assert.equal((await one<{ first_click_at: Date | null }>(`select first_click_at from email_messages where id = $1`, [m.id])).first_click_at, null, "a scanner's click doesn't count");
  await q(`delete from email_events where message_id = $1`, [m.id]);
  await click(true);
  assert.ok((await one<{ first_click_at: Date | null }>(`select first_click_at from email_messages where id = $1`, [m.id])).first_click_at);
  await click(true);
  await click(true);
  const humans = await q(`select data->>'human' h from email_events where message_id = $1 and kind = 'clicked' order by id`, [m.id]);
  assert.deepEqual(humans.map((x) => x.h), ["true", "true", "false"]);
  assert.equal((await rpc("email_click", { p_message: m.id, p_link: 9, p_human: true, p_data: {} })).data, null, "a link that isn't there");
});

test("no verified domain, no address: marketing waits on setup", async () => {
  const e = await newEmail();
  await q(`update send_settings set address = null where workspace_id = $1`, [ws]);
  const r = await one<{ id: string }>(`insert into contacts (workspace_id, email, email_clean, country) values ($1, $2, $2, 'US') returning id`, [ws, `setup-${ws.slice(-6)}@example.com`]);
  contact.setup = r.id;
  await queue(e, ["setup"]);
  const m = await msgOf(e, "setup");
  assert.equal(((await rpc("email_guard", { p_message: m.id })).data as { reason: string }).reason, "no_address");
  await q(`update send_settings set address = '1 Main St' where workspace_id = $1`, [ws]);
  await q(`update sending_domains set status = 'pending' where workspace_id = $1`, [ws]);
  assert.equal(((await rpc("email_guard", { p_message: m.id })).data as { reason: string }).reason, "no_domain");
  await q(`update sending_domains set status = 'verified' where workspace_id = $1`, [ws]);
});
