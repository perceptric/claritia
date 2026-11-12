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
});
