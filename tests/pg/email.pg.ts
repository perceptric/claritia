// Sending on a real database (docs/conversion-weeks.md week 9). The send guard decides at send time, so nothing
// that happens after queueing slips past; a worker that dies mid-send never sends twice; SES events suppress,
// unsubscribe and pause; and a new domain verifies and sends a test with one-click unsubscribe, end to end with
// SES and DNS faked.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import pg from "pg";
import { uuid7 } from "../../collect/ids.ts";
import { writeContacts } from "../../src/lib/contacts/contacts.ts";
import type { Job } from "../../src/lib/jobs.ts";
import type { Resolver } from "../../src/lib/email/domains.ts";
import { SesError, type Identity, type Ses } from "../../src/lib/email/ses.ts";
import { linkKey, readUnsubscribeToken } from "../../src/lib/email/track.ts";
import { domainCheck, send } from "../../worker-intel/jobs/email.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 4 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());
const rpc = pgRpc(pool);
const KEY = linkKey("k".repeat(40));
const BASE = "https://app.tryclaritia.com";
const TOPIC = "arn:aws:sns:us-east-2:123456789012:claritia-ses";

// A fake SES that records what it was given and answers with scripted results.
function fakeSes(script: (() => Promise<string>)[] = []) {
  const raws: string[] = [];
  let calls = 0;
  let n = 0;
  const tokens = ["t1".padEnd(32, "a"), "t2".padEnd(32, "b"), "t3".padEnd(32, "c")];
  const ident: Identity = { dkimStatus: "SUCCESS", dkimTokens: tokens, mailFromStatus: "SUCCESS" };
  const ses: Ses = {
    region: "us-east-2",
    async sendRaw(raw) {
      calls++;
      const next = script.shift();
      if (next) return next();
      raws.push(raw);
      return `ses-${++n}-${uuid7()}`;
    },
    createIdentity: async () => ident,
    getIdentity: async () => ident,
    setMailFrom: async () => {},
    deleteIdentity: async () => {},
    ensureConfigSet: async () => {},
  };
  return { ses, raws, calls: () => calls, tokens };
}

const job = (kind: string, key: string, payload: Record<string, unknown>, ws: string | null = null): Job => ({ id: uuid7(), workspace_id: ws, kind, key, payload, attempts: 1, max_attempts: 8 });

let ws = "";
let owner = "";
let member = "";
let email = "";
const c: Record<string, string> = {};

async function asUser<T>(user: string, sql: string, params: unknown[]): Promise<T> {
  const cl = await pool.connect();
  try {
    await cl.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user]);
    await cl.query("set role authenticated");
    return (await cl.query(sql, params)).rows[0]?.r as T;
  } finally {
    await cl.query("reset role");
    await cl.query(`select set_config('request.jwt.claim.sub', '', false)`);
    cl.release();
  }
}

async function workspace(name: string) {
  const id = uuid7();
  const o = uuid7();
  const m = uuid7();
  await q(`insert into workspaces (id, name) values ($1, $2)`, [id, name]);
  await q(`insert into auth.users (id, email) values ($1, $2), ($3, $4)`, [o, `owner-${o}@acme.test`, m, `member-${m}@acme.test`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'member')`, [id, o, m]);
  const d = `mail-${id.slice(-12)}.acme.test`;
  await q(`insert into sending_domains (workspace_id, domain, mail_from, status, dkim_tokens) values ($1, $2, $3, 'verified', '{a,b,c}')`, [id, d, `bounce.${d}`]);
  await q(`insert into send_limits (workspace_id, footer_address, quiet_start, quiet_end) values ($1, '1 Main St, Springfield', 0, 0)`, [id]);
  const e = (await q(`insert into emails (workspace_id, name, kind, subject, html, from_email, from_name) values ($1, 'Launch', 'broadcast', 'Spring launch', '<p>Hi <a href="https://acme.com/x">there</a></p>', $2, 'Acme') returning id`, [id, `news@${d}`]))[0].id as string;
  return { id, owner: o, member: m, domain: d, email: e };
}

async function people(wsId: string, list: { n: string; country?: string; basis?: string; timezone?: string }[]) {
  const tag = wsId.slice(-8);
  await writeContacts(
    rpc,
    wsId,
    "csv",
    list.map((p) => ({ email: `${p.n}-${tag}@example.com`, email_clean: `${p.n}-${tag}@example.com`, email_class: "work", country: p.country, timezone: p.timezone, basis: p.basis as never })),
  );
  const out: Record<string, string> = {};
  for (const r of await q(`select id, email_clean from contacts where workspace_id = $1`, [wsId])) out[String(r.email_clean).split("-")[0]!] = r.id;
  return out;
}

const queue = async (contact: string, e = email) => (await q(`select email_queue($1, $2, null) as id`, [e, contact]))[0].id as string;
const msg = async (id: string) => (await q(`select * from email_messages where id = $1`, [id]))[0];
const runSend = (ses: Ses, id: string, wsId = ws) => send(rpc, { ses, base: BASE, key: KEY })(job("send", id, { message_id: id }, wsId), new AbortController().signal);
const event = (key: string, body: Record<string, unknown>) => q(`select ses_event_apply($1, $2) as r`, [key, JSON.stringify(body)]).then((r) => r[0].r);
const sesEvent = (type: string, m: { id: string; workspace_id: string; ses_message_id?: string | null }, extra: Record<string, unknown> = {}) => ({
  eventType: type,
  mail: { messageId: m.ses_message_id ?? "unknown", timestamp: new Date().toISOString(), tags: { ws: [m.workspace_id], m: [m.id] } },
  ...extra,
});

before(async () => {
  const w = await workspace("email");
  ({ id: ws, owner, member, email } = w);
  Object.assign(
    c,
    await people(ws, [
      { n: "jane", country: "US", basis: "opt_in", timezone: "America/New_York" },
      { n: "late", country: "US", basis: "opt_in" },
      { n: "flaky", country: "US", basis: "opt_in" },
      { n: "cap", country: "US", basis: "opt_in" },
      { n: "quiet", country: "US", basis: "opt_in", timezone: "UTC" },
      { n: "nepal", country: "NP", basis: "opt_in", timezone: "Asia/Kathmandu" },
      { n: "eu", country: "DE", basis: "legitimate_interest" },
      { n: "usli", country: "US", basis: "legitimate_interest" },
      { n: "none", country: "US" },
      { n: "hard", country: "US", basis: "opt_in" },
      { n: "soft", country: "US", basis: "opt_in" },
      { n: "click", country: "US", basis: "opt_in" },
    ]),
  );
});

test("the guard: lawful basis by region, no basis, a deleted contact and an unverified From are blocked; the rest send", async () => {
  const f = fakeSes();
  const cases: [string, string | null][] = [
    ["jane", null],
    ["usli", null],
    ["eu", "no_basis"],
    ["none", "no_basis"],
  ];
  for (const [who, reason] of cases) {
    const id = await queue(c[who]!);
    await runSend(f.ses, id);
    const m = await msg(id);
    assert.equal(m.status, reason ? "blocked" : "sent", who);
    assert.equal(m.blocked_reason, reason, who);
  }
  assert.equal(f.calls(), 2);

  const gone = await queue(c.late!);
  await q(`update contacts set deleted_at = now() where id = $1`, [c.late]);
  await runSend(f.ses, gone);
  assert.equal((await msg(gone)).blocked_reason, "no_contact");
  await q(`update contacts set deleted_at = null where id = $1`, [c.late]);

  const other = (await q(`insert into emails (workspace_id, name, kind, subject, html, from_email) values ($1, 'x', 'broadcast', 's', '<p>x</p>', 'news@not-verified.acme.test') returning id`, [ws]))[0].id;
  const id = await queue(c.late!, other);
  await runSend(f.ses, id);
  assert.equal((await msg(id)).blocked_reason, "domain");

  await q(`update send_limits set footer_address = null where workspace_id = $1`, [ws]);
  const noAddr = await queue(c.late!);
  await runSend(f.ses, noAddr);
  assert.equal((await msg(noAddr)).blocked_reason, "no_address", "CAN-SPAM needs the postal address");
  await q(`update send_limits set footer_address = '1 Main St, Springfield' where workspace_id = $1`, [ws]);
  assert.equal(f.calls(), 2, "SES saw only the two allowed sends");
});

test("an address suppressed after queueing is never sent to, even from a job that was already waiting", async () => {
  const f = fakeSes();
  const first = await queue(c.late!);
  const queued = await queue(c.late!);
  const waiting = await q(`select count(*)::int as n from jobs where kind = 'send' and key = $1 and status = 'queued'`, [queued]);
  assert.equal(waiting[0].n, 1, "the send job is in line");
  // The person unsubscribes from the first email before the second one goes.
  await q(`select email_unsubscribe($1)`, [first]);
  await runSend(f.ses, queued);
  assert.deepEqual([(await msg(queued)).status, (await msg(queued)).blocked_reason], ["blocked", "suppressed"]);
  assert.equal(f.calls(), 0);
});

test("one-click unsubscribe: suppresses, withdraws consent and topics, logs once, and is safe to repeat", async () => {
  const topic = (await q(`insert into topics (workspace_id, name) values ($1, 'News') returning id`, [ws]))[0].id;
  await q(`insert into subscriptions (workspace_id, contact_id, topic_id, status) values ($1, $2, $3, 'subscribed')`, [ws, c.jane, topic]);
  const f = fakeSes();
  const id = await queue(c.jane!);
  await runSend(f.ses, id);
  const raw = f.raws[0]!;
  const token = raw.match(/List-Unsubscribe: <https:\/\/app\.tryclaritia\.com\/u\/([^>]+)>/)![1]!;
  assert.match(raw, /\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n/);
  assert.equal(readUnsubscribeToken(token, KEY), id, "the header's link names this message");

  for (let i = 0; i < 2; i++) await q(`select email_unsubscribe($1)`, [id]);
  const addr = (await msg(id)).to_email;
  assert.equal((await q(`select reason from suppressions where workspace_id = $1 and email_clean = $2`, [ws, addr]))[0].reason, "unsubscribed");
  assert.deepEqual((await q(`select status from consents where contact_id = $1 order by at desc, id desc limit 1`, [c.jane]))[0].status, "withdrawn");
  assert.equal((await q(`select status from subscriptions where contact_id = $1`, [c.jane]))[0].status, "unsubscribed");
  assert.equal((await q(`select count(*)::int as n from contact_events where contact_id = $1 and kind = 'email.unsubscribed'`, [c.jane]))[0].n, 1);
  assert.ok((await q(`select unsubscribed from email_stats where workspace_id = $1`, [ws]))[0].unsubscribed >= 1);
  const again = await queue(c.jane!);
  await runSend(f.ses, again);
  assert.equal((await msg(again)).blocked_reason, "suppressed");
});

test("flaky: a worker that dies between claim and send is never sent twice; SES's Send event fills it in", async () => {
  const f = fakeSes();
  const id = await queue(c.flaky!);
  // The worker claims it, then the process dies before recording anything.
  assert.equal((await q(`select send_claim($1) as r`, [id]))[0].r.action, "send");
  // The job comes back after its lease runs out.
  await runSend(f.ses, id);
  assert.equal((await msg(id)).status, "unknown");
  await runSend(f.ses, id);
  assert.equal(f.calls(), 0, "never sent again");
  // SES did take it the first time: its Send event arrives with our message id in the tags.
  const m = await msg(id);
  const sesId = `ses-from-event-${uuid7()}`;
  const r = await event(`sns-${uuid7()}`, sesEvent("Send", { id, workspace_id: ws, ses_message_id: sesId }));
  assert.equal(r.applied, true);
  assert.deepEqual([(await msg(id)).status, (await msg(id)).ses_message_id], ["sent", sesId]);
  assert.equal(m.attempts, 1);
});

test("flaky: SES throttles, the message goes back in line, and the retry sends it exactly once", async () => {
  const f = fakeSes([async () => Promise.reject(new SesError(429, "TooManyRequestsException", "Maximum sending rate exceeded"))]);
  const id = await queue(c.flaky!);
  await assert.rejects(runSend(f.ses, id), /TooManyRequests/);
  assert.equal((await msg(id)).status, "queued");
  await runSend(f.ses, id);
  await runSend(f.ses, id);
  assert.equal((await msg(id)).status, "sent");
  assert.equal(f.raws.length, 1, "one accepted send");
  assert.equal(f.calls(), 2, "one throttled call, one good one");
});

test("frequency cap: the third marketing email in the window is blocked", async () => {
  await q(`update send_limits set cap_count = 2, cap_days = 7 where workspace_id = $1`, [ws]);
  const f = fakeSes();
  const ids = [await queue(c.cap!), await queue(c.cap!), await queue(c.cap!)];
  for (const id of ids) await runSend(f.ses, id);
  assert.deepEqual(await Promise.all(ids.map(async (id) => (await msg(id)).status)), ["sent", "sent", "blocked"]);
  assert.equal((await msg(ids[2]!)).blocked_reason, "frequency_cap");
  await q(`update send_limits set cap_count = 3 where workspace_id = $1`, [ws]);
});

test("quiet hours hold in the contact's own time zone and come back when they end", async () => {
  const h = new Date().getUTCHours();
  await q(`update send_limits set quiet_start = $2, quiet_end = $3 where workspace_id = $1`, [ws, h, (h + 2) % 24]);
  const f = fakeSes();
  const quiet = await queue(c.quiet!);
  const claim = (await q(`select send_claim($1) as r`, [quiet]))[0].r;
  assert.equal(claim.action, "wait");
  assert.equal(claim.why, "quiet_hours");
  assert.ok(claim.seconds >= 60 && claim.seconds <= 7200, `waits until quiet hours end (${claim.seconds}s)`);
  assert.equal((await msg(quiet)).status, "queued");
  // A worker holds the first job while it runs, so the wait is a new job.
  await q(`update jobs set status = 'running' where kind = 'send' and key = $1 and status = 'queued'`, [quiet]);
  await runSend(f.ses, quiet);
  assert.equal((await q(`select count(*)::int as n from jobs where kind = 'send' and key = $1 and status = 'queued' and run_after > now() + interval '30 seconds'`, [quiet]))[0].n, 1, "queued again for later");
  // Kathmandu is UTC+5:45, so the same UTC hour isn't quiet there.
  const nepal = await queue(c.nepal!);
  await runSend(f.ses, nepal);
  assert.equal((await msg(nepal)).status, "sent");
  // Tests to a teammate ignore quiet hours.
  await q(`update send_limits set quiet_start = 0, quiet_end = 0 where workspace_id = $1`, [ws]);
});

test("bounces: a hard bounce suppresses at once; soft bounces suppress after 3 in 30 days", async () => {
  const f = fakeSes();
  const hard = await queue(c.hard!);
  await runSend(f.ses, hard);
  let m = await msg(hard);
  await event(`sns-${uuid7()}`, sesEvent("Bounce", m, { bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: m.to_email }] } }));
  assert.equal((await q(`select reason from suppressions where workspace_id = $1 and email_clean = $2`, [ws, m.to_email]))[0]?.reason, "bounced");

  const soft: string[] = [];
  for (let i = 0; i < 3; i++) {
    const id = await queue(c.soft!);
    await runSend(f.ses, id);
    soft.push(id);
  }
  for (const [i, id] of soft.entries()) {
    m = await msg(id);
    await event(`sns-${uuid7()}`, sesEvent("Bounce", m, { bounce: { bounceType: "Transient", bouncedRecipients: [{ emailAddress: m.to_email }] } }));
    const s = await q(`select 1 from suppressions where workspace_id = $1 and email_clean = $2`, [ws, m.to_email]);
    assert.equal(s.length, i === 2 ? 1 : 0, `after soft bounce ${i + 1}`);
  }
});

test("a complaint storm pauses the workspace; a redelivered event counts once; the owner resumes", async () => {
  const w = await workspace("storm");
  const p = await people(w.id, [{ n: "a", basis: "opt_in" }, { n: "b", basis: "opt_in" }, { n: "c", basis: "opt_in" }, { n: "d", basis: "opt_in" }]);
  await q(`insert into email_stats (workspace_id, day, sent) values ($1, current_date - 1, 1000)`, [w.id]);
  const f = fakeSes();
  const sent: string[] = [];
  for (const who of ["a", "b", "c"]) {
    const id = await queue(p[who]!, w.email);
    await runSend(f.ses, id, w.id);
    sent.push(id);
  }
  const complain = async (id: string, key: string) => {
    const m = await msg(id);
    return event(key, sesEvent("Complaint", m, { complaint: { complainedRecipients: [{ emailAddress: m.to_email }] } }));
  };
  const run = uuid7();
  await complain(sent[0]!, `storm-1-${run}`);
  assert.equal((await complain(sent[0]!, `storm-1-${run}`)).reason, "duplicate");
  await complain(sent[1]!, `storm-2-${run}`);
  assert.equal((await q(`select paused from send_limits where workspace_id = $1`, [w.id]))[0].paused, false, "2 complaints in 1,003 is 0.2% but too few");
  assert.equal((await complain(sent[2]!, `storm-3-${run}`)).paused, true);
  const lim = (await q(`select paused, paused_reason from send_limits where workspace_id = $1`, [w.id]))[0];
  assert.equal(lim.paused, true);
  assert.match(lim.paused_reason, /complaints/i);
  assert.equal((await q(`select sum(complained)::int as n from email_stats where workspace_id = $1`, [w.id]))[0].n, 3);
  for (const id of sent) assert.equal((await q(`select reason from suppressions where workspace_id = $1 and email_clean = $2`, [w.id, (await msg(id)).to_email]))[0].reason, "complained");

  const next = await queue(p.d!, w.email);
  await runSend(f.ses, next, w.id);
  assert.equal((await msg(next)).blocked_reason, "paused");
  await assert.rejects(asUser(w.member, `select sending_resume($1) as r`, [w.id]), /owner/);
  await asUser(w.owner, `select sending_resume($1) as r`, [w.id]);
  assert.equal((await q(`select paused from send_limits where workspace_id = $1`, [w.id]))[0].paused, false);
});

test("clicks: machines, clicks right after delivery and bursts across links don't count as a person", async () => {
  const f = fakeSes();
  const id = await queue(c.click!);
  await runSend(f.ses, id);
  const click = async (bot: boolean) => (await q(`select email_click($1, 'https://acme.com/x', $2, 'ua') as r`, [id, bot]))[0].r as boolean;
  assert.equal(await click(false), false, "seconds after the send: a scanner");
  await q(`update email_messages set sent_at = now() - interval '5 minutes' where id = $1`, [id]);
  await q(`delete from email_clicks where message_id = $1`, [id]);
  assert.equal(await click(true), false, "a bot agent");
  await q(`delete from email_clicks where message_id = $1`, [id]);
  assert.equal(await click(false), true, "a person");
  assert.equal(await click(false), false, "a second click within 3 seconds: a burst");
  const m = await msg(id);
  assert.equal(m.clicks, 1);
  assert.ok(m.first_click_at);
  assert.equal((await q(`select count(*)::int as n from contact_events where contact_id = $1 and kind = 'email.clicked'`, [c.click]))[0].n, 1);
});

test("domain checks: a verified domain survives one bad check, drops after two, and then can't send", async () => {
  const d = (await q(`select id from sending_domains where workspace_id = $1`, [ws]))[0].id;
  await q(`update sending_domains set dkim_tokens = '{a,b,c}', checks = '{}' where id = $1`, [d]);
  const all = (s: string) => JSON.stringify({ dkim1: s, dkim2: s, dkim3: s, spf_mx: s, spf_txt: s, dmarc: s });
  const check = async (checks: string, dkim = "SUCCESS") => (await q(`select sending_domain_checked($1, 'us-east-2', null, $2, $3, 'SUCCESS', null) as r`, [d, checks, dkim]))[0].r;
  assert.equal(await check(all("verified")), "verified");
  assert.equal(await check(all("error")), "verified", "DNS didn't answer: keep what was seen");
  assert.equal(await check(JSON.stringify({ dmarc: "waiting" })), "verified", "one bad check");
  assert.equal(await check(JSON.stringify({ dmarc: "waiting" })), "waiting", "two in a row");
  const id = await queue(c.late!);
  await runSend(fakeSes().ses, id);
  assert.equal((await msg(id)).blocked_reason, "domain");
  assert.equal(await check(all("verified")), "verified");
  assert.equal(await check(all("verified"), "PENDING"), "waiting", "SES no longer sees DKIM");
  assert.equal(await check(all("verified")), "verified");
});

test("done when: a new domain verifies and a test sends with one-click unsubscribe", async () => {
  const name = `news-${uuid7().slice(-10)}.acme.test`;
  await assert.rejects(asUser(member, `select sending_domain_add($1, $2) as r`, [ws, name]), /owner/);
  const made = await asUser<{ id: string; status: string }>(owner, `select sending_domain_add($1, $2) as r`, [ws, name]);
  assert.equal(made.status, "pending");
  assert.equal((await q(`select count(*)::int as n from jobs where kind = 'domain_check' and key = $1 and status = 'queued'`, [made.id]))[0].n, 1);

  const f = fakeSes();
  const zone: Record<string, { cname?: string[]; mx?: string[]; txt?: string[] }> = {};
  const nf = () => Object.assign(new Error("nf"), { code: "ENOTFOUND" });
  const resolver: Resolver = {
    cname: async (n) => zone[n]?.cname ?? Promise.reject(nf()),
    mx: async (n) => zone[n]?.mx?.map((exchange) => ({ exchange, priority: 10 })) ?? Promise.reject(nf()),
    txt: async (n) => zone[n]?.txt?.map((t) => [t]) ?? Promise.reject(nf()),
  };
  const check = () => domainCheck(pool, rpc, { ses: f.ses, topicArn: TOPIC, resolver })(job("domain_check", made.id, { domain_id: made.id }, ws), new AbortController().signal);
  await check();
  let row = (await q(`select * from sending_domains where id = $1`, [made.id]))[0];
  assert.deepEqual([row.status, row.dkim_tokens.length, row.region], ["waiting", 3, "us-east-2"], "keys made, records not there yet");
  assert.equal((await q(`select config_set from send_limits where workspace_id = $1`, [ws]))[0].config_set, `clr-${ws}`);

  // The customer adds the records.
  for (const t of f.tokens) zone[`${t}._domainkey.${name}`] = { cname: [`${t}.dkim.amazonses.com`] };
  zone[`bounce.${name}`] = { mx: ["feedback-smtp.us-east-2.amazonses.com"], txt: ["v=spf1 include:amazonses.com ~all"] };
  zone["_dmarc.acme.test"] = { txt: ["v=DMARC1; p=none"] };
  await check();
  row = (await q(`select * from sending_domains where id = $1`, [made.id]))[0];
  assert.equal(row.status, "verified");

  await assert.rejects(asUser(owner, `select email_send_test($1, $2, 'Acme', 'stranger@example.com', 'Hi', '') as r`, [ws, `hello@${name}`]), /people in this workspace/);
  await assert.rejects(asUser(owner, `select email_send_test($1, 'hello@gmail.com', 'Acme', $2, 'Hi', '') as r`, [ws, `member-${member}@acme.test`]), /verified domain/);
  const test = await asUser<string>(owner, `select email_send_test($1, $2, 'Acme', $3, 'Hi', '') as r`, [ws, `hello@${name}`, `member-${member}@acme.test`]);
  await runSend(f.ses, test);
  assert.equal((await msg(test)).status, "sent");
  const raw = f.raws.at(-1)!;
  assert.match(raw, new RegExp(`From: "Acme" <hello@${name.replace(/\./g, "\\.")}>`));
  assert.match(raw, /\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n/);
  const token = raw.match(/List-Unsubscribe: <https:\/\/app\.tryclaritia\.com\/u\/([^>]+)>/)![1]!;
  const messageId = readUnsubscribeToken(token, KEY)!;
  await q(`select email_unsubscribe($1)`, [messageId]);
  assert.equal((await q(`select reason from suppressions where workspace_id = $1 and email_clean = $2`, [ws, `member-${member}@acme.test`]))[0].reason, "unsubscribed");

  // Removing the domain takes it off SES.
  await asUser(owner, `select sending_domain_remove($1) as r`, [made.id]);
  assert.equal((await q(`select count(*)::int as n from jobs where kind = 'domain_delete' and key = $1`, [name]))[0].n, 1);
});

test("members see their own workspace's sending only, and owners alone change it", async () => {
  const other = await workspace("other");
  const mine = await asUser<{ domains: unknown[] }>(member, `select sending_overview($1) as r`, [ws]);
  assert.ok(mine.domains.length >= 1);
  await assert.rejects(asUser(member, `select sending_overview($1) as r`, [other.id]), /not found/);
  await assert.rejects(asUser(member, `select send_settings_save($1, '{"cap_count": 0}') as r`, [ws]), /owner/);
  await assert.rejects(asUser(owner, `select send_settings_save($1, '{"timezone": "Mars/Base"}') as r`, [ws]), /time zone/);
  const seen = await asUser<number>(member, `select count(*)::int as r from email_messages where workspace_id = $1`, [other.id]);
  assert.equal(seen, 0);
  for (const fn of [`send_claim('${uuid7()}')`, `email_unsubscribe('${uuid7()}')`, `ses_event_apply('x', '{}')`, `email_queue('${other.email}', null, 'a@b.co')`]) {
    await assert.rejects(asUser(member, `select ${fn} as r`, []), /permission denied/, fn);
  }
});
