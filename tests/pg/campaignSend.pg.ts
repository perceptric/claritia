// Sending a campaign on a real database (supabase/migrations/151_lists_campaign_send.sql), through the real send
// worker: the audience freezes at send time; a repeat send (or two at once) queues once; the preview's count is what
// actually goes; a scheduled send waits for its time; Pause holds the rest and Resume sends it; Cancel only before
// anything went; a person who unsubscribes after the send gets nothing.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import pg from "pg";
import type { Outgoing } from "../../src/lib/email/provider.ts";
import type { Job } from "../../src/lib/jobs.ts";
import { send, type Sender } from "../../worker-intel/jobs/email.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 6 });
const rpc = pgRpc(pool);
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
const one = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await q(sql, p))[0] as T;
after(() => pool.end());
before(() => {
  process.env.SECRETS_KEY = "s".repeat(40);
});

let sent: Outgoing[] = [];
const sender: Sender = {
  send: async (m) => (sent.push(m), `p-${randomUUID()}`),
  batch: async (items) => (items.forEach((i) => sent.push(i.out)), items.map(() => `p-${randomUUID()}`)),
};
const job = (ws: string): Job => ({ id: randomUUID(), workspace_id: ws, kind: "send", key: ws, payload: {}, attempts: 1, max_attempts: 3 });
const runSend = (ws: string) => send(rpc, { sender, base: "https://app.test", secret: "s".repeat(40), roundMs: 5_000, sleep: async () => {} })(job(ws), new AbortController().signal);
const mine = (ws: string) => sent.filter((m) => m.to.endsWith(`@${ws.slice(0, 8)}.io`));

/** A workspace ready to send, a list, a topic and people: 3 ready, and one each that the rules hold back. */
async function setup() {
  const ws = randomUUID();
  const user = randomUUID();
  const dom = `w${ws.slice(0, 8)}.acme.com`;
  await q(`insert into workspaces (id, name) values ($1, 'Juniper')`, [ws]);
  await q(`insert into auth.users (id, email) values ($1, $2)`, [user, `${user}@t.io`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, user]);
  await q(`insert into workspace_billing (workspace_id, plan) values ($1, 'pro')`, [ws]);
  await q(`insert into sending_domains (workspace_id, domain, mail_from, tracking_host, status) values ($1, $2, $3, $4, 'verified')`, [ws, dom, `bounce.${dom}`, `t.${dom}`]);
  await q(`insert into send_settings (workspace_id, from_name, from_email, address, quiet_start, quiet_end) values ($1, 'Juniper', $2, '14 Elm St', 0, 0)`, [ws, `news@${dom}`]);
  const list = (await one<{ id: string }>(`insert into lists (workspace_id, name) values ($1, 'Workshop') returning id`, [ws])).id;
  const person = async (name: string, o: { country?: string; consent?: [string, string]; inList?: boolean } = {}) => {
    const id = (await one<{ id: string }>(`insert into contacts (workspace_id, email, email_clean, first_name, country) values ($1, $2, $2, $3, $4) returning id`, [ws, `${name}@${ws.slice(0, 8)}.io`, name, o.country ?? "US"])).id;
    if (o.consent) await q(`insert into consents (workspace_id, contact_id, channel, basis, status, source) values ($1, $2, 'email', $3, $4, 'form')`, [ws, id, o.consent[0], o.consent[1]]);
    if (o.inList !== false) await q(`insert into list_members (list_id, contact_id, workspace_id) values ($1, $2, $3)`, [list, id, ws]);
    return id;
  };
  const ids = {
    ana: await person("ana", { consent: ["opt_in", "granted"] }),
    ben: await person("ben"),
    cy: await person("cy", { country: "DE", consent: ["opt_in", "granted"] }),
    dee: await person("dee", { country: "DE" }), // no consent outside the US: held back
    eve: await person("eve", { consent: ["opt_in", "withdrawn"] }),
    fay: await person("fay"),
    out: await person("out", { inList: false }),
  };
  await q(`insert into suppressions (workspace_id, email_clean, reason, source) values ($1, $2, 'bounced', 'resend')`, [ws, `fay@${ws.slice(0, 8)}.io`]);
  const draft = (await one<{ id: string }>(`insert into emails (workspace_id, name, kind, subject, html, text, status) values ($1, 'Spring', 'broadcast', '', '', '', 'draft') returning id`, [ws])).id;
  return { ws, user, list, ids, draft };
}
const values = (o: Record<string, unknown>) => ({ subject: "Spring reset", preheader: "Early-bird", html: "<p>Hi {{first_name|there}}</p>", text: "Hi", links: [], ...o });
const doSend = (s: Awaited<ReturnType<typeof setup>>, o: Record<string, unknown>) => one<{ r: { queued: number; status: string; already: boolean } }>(`select email_campaign_send($1, $2, $3, $4) r`, [s.ws, s.user, s.draft, values(o)]).then((x) => x.r);
const campaign = (s: Awaited<ReturnType<typeof setup>>) => one<{ status: string; sent: number; waiting: number }>(`select * from email_campaigns($1) where id = $2`, [s.ws, s.draft]);

test("the preview's ready count is what goes; the audience freezes; a repeat and a double click queue once", async () => {
  sent = [];
  const s = await setup();
  const preview = (await one<{ p: Record<string, number> }>(`select set_config('request.jwt.claim.sub', $3, true), email_audience_preview($1, $2, false, null) p`, [s.ws, [s.list], s.user])).p;
  assert.deepEqual([preview.total, preview.ready, preview.suppressed, preview.no_consent], [6, 3, 1, 2]);
  // The agents' count (no signed-in person) is the same as the app's.
  const agent = (await one<{ p: Record<string, number> }>(`select email_audience_counts($1, $2, false, null) p`, [s.ws, [s.list]])).p;
  assert.deepEqual(agent, preview);
  const [a, b] = await Promise.all([doSend(s, { lists: [s.list] }), doSend(s, { lists: [s.list] })]);
  assert.deepEqual([a.queued, b.queued].sort(), [6, 6]);
  assert.deepEqual([a.already, b.already].sort(), [false, true], "two at once: one queues, the other sees it");
  assert.equal((await one<{ n: number }>(`select count(*)::int n from email_messages where email_id = $1`, [s.draft])).n, 6);
  // Joining the list after the send doesn't add them.
  await q(`insert into list_members (list_id, contact_id, workspace_id) values ($1, $2, $3)`, [s.list, s.ids.out, s.ws]);
  assert.equal((await doSend(s, { lists: [s.list] })).already, true);
  await runSend(s.ws);
  assert.deepEqual(mine(s.ws).map((m) => m.to.split("@")[0]).sort(), ["ana", "ben", "cy"], "exactly the preview's ready people");
  assert.equal(mine(s.ws)[0]!.subject, "Spring reset");
  assert.equal((await campaign(s)).status, "sent");
});

test("each person's name fills in; the From name, address and reply-to are the ones picked; other domains are refused", async () => {
  sent = [];
  const s = await setup();
  const dom = `w${s.ws.slice(0, 8)}.acme.com`;
  await doSend(s, { lists: [s.list], subject: "Hi {{first_name|there}}", from_name: "Juniper Team", from_email: `Hello@${dom}`, reply_to: "studio@juniper.com" });
  await runSend(s.ws);
  const got = mine(s.ws).sort((a, b) => a.to.localeCompare(b.to));
  assert.deepEqual(got.map((m) => m.subject), ["Hi ana", "Hi ben", "Hi cy"], "until 156 every campaign said Hi there");
  assert.ok(got.every((m) => m.from.includes("Juniper Team") && m.from.includes(`hello@${dom}`)), got[0]!.from);
  assert.ok(got.every((m) => m.replyTo === "studio@juniper.com"));
  const other = await setup();
  await assert.rejects(doSend(other, { lists: [other.list], from_email: "news@gmail.com" }), /Pick a verified domain/);
  await assert.rejects(doSend(other, { lists: [other.list], reply_to: "not an address" }), /reply-to/);
  const opts = (await one<{ o: { from_email: string; domains: { domain: string; left_today: number | null }[] } }>(`select set_config('request.jwt.claim.sub', $1, true), email_sender_options($2) o`, [other.user, other.ws])).o;
  assert.equal(opts.from_email, `news@w${other.ws.slice(0, 8)}.acme.com`);
  assert.deepEqual(opts.domains.map((d) => d.domain), [`w${other.ws.slice(0, 8)}.acme.com`]);
});

test("Gradual Send spaces the messages evenly over the hours; Pause and Resume keep it gradual", async () => {
  sent = [];
  const s = await setup();
  await doSend(s, { everyone: true, spread_hours: 2 });
  const times = async () => (await q(`select extract(epoch from send_after)::float8 t from email_messages where email_id = $1 and status = 'queued' order by send_after`, [s.draft])).map((r) => r.t as number);
  const t = await times();
  const gaps = t.slice(1).map((x, i) => x - t[i]!);
  assert.equal(t.length, 7);
  assert.ok(gaps.every((g) => Math.abs(g - 7200 / 7) < 1), JSON.stringify(gaps));
  await runSend(s.ws);
  assert.ok(mine(s.ws).length <= 1, "only the first is due now");
  const c = await pool.connect();
  try {
    await c.query(`select set_config('request.jwt.claim.sub', $1, false)`, [s.user]);
    await c.query(`select email_campaign_pause($1, $2, true)`, [s.ws, s.draft]);
    await c.query(`select email_campaign_pause($1, $2, false)`, [s.ws, s.draft]);
  } finally {
    await c.query(`select set_config('request.jwt.claim.sub', '', false)`);
    c.release();
  }
  const r = await times();
  const rg = r.slice(1).map((x, i) => x - r[i]!);
  assert.ok(r.length >= 5 && rg.every((g) => g > 60 && Math.abs(g - rg[0]!) < 1), JSON.stringify(rg));
  assert.ok(r[0]! <= Date.now() / 1000 + 1, "the first of the rest goes at once");
});

test("Intelligent Send: each person at their own hour within 24 hours, then their time zone, then the workspace's hour; Resume keeps it", async () => {
  const s = await setup();
  // Ana clicked earlier emails at 14:00 UTC and opened one at 03:00; a click counts more than an open.
  const old = (await one<{ id: string }>(`insert into emails (workspace_id, name, kind, subject, html, text, status) values ($1, 'Old', 'broadcast', 'Old', '<p>x</p>', 'x', 'sent') returning id`, [s.ws])).id;
  const msg = (await one<{ id: string }>(`insert into email_messages (workspace_id, email_id, contact_id, to_email, status, dedupe) values ($1, $2, $3, 'ana@x.io', 'sent', 'old-ana') returning id`, [s.ws, old, s.ids.ana])).id;
  for (const at of ["2026-10-01T14:05:00Z", "2026-10-08T14:40:00Z"]) await q(`insert into email_events (workspace_id, message_id, kind, at) values ($1, $2, 'clicked', $3)`, [s.ws, msg, at]);
  await q(`insert into email_events (workspace_id, message_id, kind, at) values ($1, $2, 'opened', now() - interval '3 days')`, [s.ws, msg]);
  await q(`update email_events set at = date_trunc('day', at) + interval '3 hours' where message_id = $1 and kind = 'opened'`, [msg]);
  // Ben has no history but a time zone: 10 AM in Tokyo is 01:00 UTC.
  await q(`update contacts set timezone = 'Asia/Tokyo' where id = $1`, [s.ids.ben]);
  const counts = (await one<{ c: { smart: Record<string, number> } }>(`select email_audience_counts($1, $2, false, null) c`, [s.ws, [s.list]])).c;
  assert.deepEqual(counts.smart, { history: 1, timezone: 1, workspace: 1 }, "ana, ben, and cy at the workspace's hour");
  const start = Date.now();
  await assert.rejects(doSend(s, { lists: [s.list], smart: true, spread_hours: 4 }), /Intelligent Send or Gradual Send/);
  await doSend(s, { lists: [s.list], smart: true });
  const at = async () => Object.fromEntries((await q(`select c.first_name n, extract(epoch from m.send_after)::float8 t from email_messages m join contacts c on c.id = m.contact_id where m.email_id = $1 and m.status = 'queued'`, [s.draft])).map((r) => [r.n as string, (r.t as number) * 1000]));
  const check = (t: Record<string, number>, from: number) => {
    for (const [who, v] of Object.entries(t)) assert.ok(v >= from - 2000 && v < from + 86_400_000, `${who} within 24 hours`);
    const hour = (v: number) => new Date(v).getUTCHours();
    assert.ok(hour(t.ana!) === 14 || Math.abs(t.ana! - from) < 2000, "Ana at 14:00 UTC");
    assert.ok(hour(t.ben!) === 1 || Math.abs(t.ben! - from) < 2000, "Ben at 10 AM Tokyo");
    assert.ok(hour(t.cy!) === 14 || Math.abs(t.cy! - from) < 2000, "Cy at the workspace's hour");
  };
  check(await at(), start);
  const c = await pool.connect();
  try {
    await c.query(`select set_config('request.jwt.claim.sub', $1, false)`, [s.user]);
    await c.query(`select email_campaign_pause($1, $2, true)`, [s.ws, s.draft]);
    await c.query(`select email_campaign_pause($1, $2, false)`, [s.ws, s.draft]);
  } finally {
    await c.query(`select set_config('request.jwt.claim.sub', '', false)`);
    c.release();
  }
  check(await at(), Date.now());
  assert.equal((await one<{ smart_send: boolean }>(`select smart_send from emails where id = $1`, [s.draft])).smart_send, true);
});

test("someone who unsubscribes after the send but before it goes gets nothing", async () => {
  sent = [];
  const s = await setup();
  await doSend(s, { lists: [s.list] });
  await q(`insert into consents (workspace_id, contact_id, channel, basis, status, source) values ($1, $2, 'email', 'opt_in', 'withdrawn', 'unsubscribe')`, [s.ws, s.ids.ana]);
  await runSend(s.ws);
  assert.deepEqual(mine(s.ws).map((m) => m.to.split("@")[0]).sort(), ["ben", "cy"]);
});

test("scheduled: nothing goes before its time; Pause holds it, Resume sends it; Cancel only before anything went", async () => {
  sent = [];
  const s = await setup();
  const later = new Date(Date.now() + 3 * 3600_000).toISOString();
  const r = await doSend(s, { everyone: true, send_at: later });
  assert.equal(r.status, "scheduled");
  assert.equal((await campaign(s)).status, "scheduled");
  await runSend(s.ws);
  assert.equal(mine(s.ws).length, 0, "nothing before its time");
  // Cancel before anything went: a draft again, its messages gone.
  assert.equal((await one<{ ok: boolean }>(`select set_config('request.jwt.claim.sub', $1, false), email_campaign_cancel($2, $3) ok`, [s.user, s.ws, s.draft])).ok, true);
  assert.equal((await one<{ status: string }>(`select status from emails where id = $1`, [s.draft])).status, "draft");
  assert.equal((await one<{ n: number }>(`select count(*)::int n from email_messages where email_id = $1`, [s.draft])).n, 0);
  // Now send now, pause before the worker runs: nothing goes; resume: it all goes.
  const c = await pool.connect();
  try {
    await c.query(`select set_config('request.jwt.claim.sub', $1, false)`, [s.user]);
    await doSend(s, { everyone: true });
    await c.query(`select email_campaign_pause($1, $2, true)`, [s.ws, s.draft]);
    assert.equal((await campaign(s)).status, "paused");
    await runSend(s.ws);
    assert.equal(mine(s.ws).length, 0, "paused: nothing goes");
    await c.query(`select email_campaign_pause($1, $2, false)`, [s.ws, s.draft]);
    await runSend(s.ws);
    assert.equal(mine(s.ws).length, 4, "everyone ready: ana, ben, cy and out");
    assert.equal((await campaign(s)).status, "sent");
    await assert.rejects(c.query(`select email_campaign_cancel($1, $2)`, [s.ws, s.draft]), /already went/, "after sending, only Pause");
  } finally {
    await c.query(`select set_config('request.jwt.claim.sub', '', false)`);
    c.release();
  }
});

test("refused: no subject, no audience, someone else's list, an empty audience", async () => {
  const s = await setup();
  await assert.rejects(doSend(s, { lists: [s.list], subject: " " }), /Add a subject/);
  await assert.rejects(doSend(s, {}), /Pick who gets it/);
  const other = await setup();
  await assert.rejects(doSend(s, { lists: [other.list] }), /List not found/);
  const empty = (await one<{ id: string }>(`insert into lists (workspace_id, name) values ($1, 'Empty') returning id`, [s.ws])).id;
  await assert.rejects(doSend(s, { lists: [empty] }), /Nobody is in that audience/);
  assert.equal((await one<{ status: string }>(`select status from emails where id = $1`, [s.draft])).status, "draft", "a refused send leaves the draft as it was");
});

test("importing to a list: with consent people get opt-in; without it, someone who agreed stays agreed", async () => {
  const s = await setup();
  const upsert = (rows: unknown[]) => one<{ r: { ids: string[]; created: number } }>(`select contacts_upsert($1, 'import', $2) r`, [s.ws, JSON.stringify(rows)]).then((x) => x.r);
  const latest = (id: string) => one<{ basis: string | null; status: string | null } | undefined>(`select basis, status from consents where contact_id = $1 order by at desc, id desc limit 1`, [id]);
  // Ana already opted in; importing her without consent leaves that alone. A new person gets no basis.
  const r = await upsert([{ email: `ana@${s.ws.slice(0, 8)}.io`, email_clean: `ana@${s.ws.slice(0, 8)}.io` }, { email: "new@x.io", email_clean: "new@x.io" }]);
  assert.equal(r.created, 1);
  assert.deepEqual(await latest(s.ids.ana), { basis: "opt_in", status: "granted" });
  assert.equal(await latest(r.ids[1]!), undefined);
  // With consent: opt-in from the import.
  const withConsent = await upsert([{ email: "yes@x.io", email_clean: "yes@x.io", basis: "opt_in" }]);
  assert.deepEqual(await latest(withConsent.ids[0]!), { basis: "opt_in", status: "granted" });
  // A shared inbox keeps its class (Audiences marks it).
  const shared = await upsert([{ email: "info@x.io", email_clean: "info@x.io", email_class: "role" }]);
  assert.equal((await one<{ c: string }>(`select email_class c from contacts where id = $1`, [shared.ids[0]])).c, "role");
  // An import waiting for an owner is the workspace's members' to read, and goes when its list does.
  const held = await one<{ id: string }>(`insert into contact_imports (workspace_id, list_id, people) values ($1, $2, $3) returning id`, [s.ws, s.list, JSON.stringify([{ email: "a@x.io", email_clean: "a@x.io" }])]);
  await assert.rejects(q(`insert into contact_imports (workspace_id, list_id, people) values ($1, $2, '[]')`, [s.ws, s.list]));
  await q(`delete from lists where id = $1`, [s.list]);
  assert.equal((await q(`select 1 from contact_imports where id = $1`, [held.id])).length, 0);
});
