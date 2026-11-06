// Sending as the host on a real database (130_mailboxes.sql, worker-intel/jobs/email.ts): a workflow email "from
// their owner" goes from the owner's Gmail and is recorded sent; a full mailbox holds it (without a try) until it has
// room, while the rest of the round still goes; a sign-in that's gone sends it from the team's domain on Resend and
// tells the owner once per break; a reconnect starts the count again.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import pg from "pg";
import type { Job } from "../../src/lib/jobs.ts";
import type { Outgoing } from "../../src/lib/email/provider.ts";
import { sealToken } from "../../src/lib/meetings/providers/index.ts";
import { send, type Sender } from "../../worker-intel/jobs/email.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";
import { uuid7 } from "./ids.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 4 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
const rpc = pgRpc(pool);
after(() => pool.end());

const TAG = uuid7().slice(-12);
let ws = "";
let owner = "";
let email = "";
const resent: { to: string; from: string; key: string }[] = [];
const sender: Sender = {
  send: async (out: Outgoing, key: string) => (resent.push({ to: out.to, from: out.from, key }), `re_${TAG}_${resent.length}`),
  batch: async (items) => items.map((i) => (resent.push({ to: i.out.to, from: i.out.from, key: i.key }), `re_${TAG}_${resent.length}`)),
};

before(async () => {
  process.env.SECRETS_KEY = "s".repeat(40);
  process.env.GOOGLE_CLIENT_ID = "gid";
  process.env.GOOGLE_CLIENT_SECRET = "gsecret";
  ws = uuid7();
  owner = uuid7();
  await q(`insert into workspaces (id, name) values ($1, 'mail')`, [ws]);
  await q(`insert into auth.users (id, email) values ($1, $2)`, [owner, `ada-${owner.slice(-6)}@acme.com`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, owner]);
  await q(`insert into sending_domains (workspace_id, domain, mail_from, tracking_host, status) values ($1, $2, $3, $4, 'verified')`, [ws, `m${ws.slice(-8)}.acme.com`, `bounce.m${ws.slice(-8)}.acme.com`, `t.m${ws.slice(-8)}.acme.com`]);
  await q(`insert into send_settings (workspace_id, from_name, from_email, address, quiet_start, quiet_end) values ($1, 'Acme', $2, '1 Main St', 0, 0)`, [ws, `news@m${ws.slice(-8)}.acme.com`]);
  email = (await q(`insert into emails (workspace_id, name, kind, subject, html, text, marketing) values ($1, 'E', 'one_to_one', 'Hi', '<p>Hi</p>', 'Hi', false) returning id`, [ws]))[0].id;
});

const connect = () => q(`select mailbox_connect($1, $2, 'gmail', $3, $4) as id`, [ws, owner, `ada-${owner.slice(-6)}@acme.com`, sealToken({ access: "tok", refresh: "r1", expiresAt: Date.now() + 3600_000 })]).then((r) => r[0].id as string);
async function message(name: string, from: string | null = owner) {
  const c = (await q(`insert into contacts (workspace_id, email, email_clean) values ($1, $2, $2) returning id`, [ws, `${name}-${ws.slice(-6)}@lead.io`]))[0].id;
  return (await q(`insert into email_messages (workspace_id, email_id, contact_id, to_email, dedupe, sender_user) values ($1, $2, $3, $4, $5, $6) returning id`, [ws, email, c, `${name}-${ws.slice(-6)}@lead.io`, `t:${name}:${uuid7()}`, from]))[0].id as string;
}
const status = (id: string) => q(`select status, provider_id, send_after, attempts from email_messages where id = $1`, [id]).then((r) => r[0]);
const job = (): Job => ({ id: uuid7(), workspace_id: ws, kind: "send", key: ws, payload: {}, attempts: 1, max_attempts: 3 });
const gmail: { body: string }[] = [];
let answer: () => Response = () => new Response(JSON.stringify({ id: `gm1_${TAG}` }), { status: 200 });
const fetcher = (async (u: string, init: RequestInit = {}) => {
  if (u.includes("oauth2.googleapis.com")) return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
  gmail.push({ body: String(init.body) });
  return answer();
}) as unknown as typeof fetch;
const run = () => send(rpc, { sender, base: "https://app.test", secret: "s".repeat(40), roundMs: 3_000, sleep: async () => {}, fetcher })(job(), new AbortController().signal);

test("a workflow email from its owner goes from their Gmail; one from the team goes on Resend", async () => {
  await connect();
  const mine = await message("a");
  const team = await message("b", null);
  await run();
  assert.deepEqual([(await status(mine)).status, (await status(mine)).provider_id], ["sent", `gm1_${TAG}`]);
  assert.equal((await status(team)).status, "sent");
  assert.equal(gmail.length, 1);
  const raw = Buffer.from(JSON.parse(gmail[0]!.body).raw, "base64url").toString();
  assert.match(raw, new RegExp(`From: .*ada-${owner.slice(-6)}@acme\\.com`));
  assert.ok(resent.some((r) => r.to.startsWith("b-")) && !resent.some((r) => r.to.startsWith("a-")));
  assert.equal((await q(`select count(*)::int n from mailbox_sends`, []))[0].n >= 1, true);
});

test("a full mailbox holds its email without a try until there's room; the round goes on", async () => {
  const box = (await q(`select id from mailboxes where workspace_id = $1`, [ws]))[0].id;
  await q(`insert into mailbox_sends (mailbox_id, at) select $1, now() - interval '2 hours' from generate_series(1, 450)`, [box]);
  const held = await message("c");
  const team = await message("d", null);
  const before = gmail.length;
  await run();
  const h = await status(held);
  assert.equal(h.status, "queued");
  assert.equal(h.attempts, 0, "no try used");
  const wait = (new Date(h.send_after).getTime() - Date.now()) / 3_600_000;
  assert.ok(wait > 21.5 && wait < 22.5, `waits ${wait.toFixed(2)} hours`);
  assert.equal((await status(team)).status, "sent");
  assert.equal(gmail.length, before, "nothing sent from the full mailbox");
  await q(`delete from mailbox_sends where mailbox_id = $1`, [box]);
});

test("a sign-in that's gone: the email goes on Resend, the owner is told once, and a reconnect clears it", async () => {
  answer = () => new Response(JSON.stringify({ error: { message: "x" } }), { status: 401 });
  const first = await message("e");
  await run();
  assert.equal((await status(first)).status, "sent");
  assert.ok(resent.some((r) => r.to.startsWith("e-")), "sent from the team's domain");
  const box = (await q(`select status, told_at, broken_at from mailboxes where workspace_id = $1`, [ws]))[0];
  assert.equal(box.status, "reconnect");
  const notes = resent.filter((r) => r.key.startsWith("mailbox-reconnect:"));
  assert.equal(notes.length, 1);
  assert.equal(notes[0]!.to, `ada-${owner.slice(-6)}@acme.com`);
  const second = await message("f");
  await run();
  assert.equal((await status(second)).status, "sent");
  assert.equal(resent.filter((r) => r.key.startsWith("mailbox-reconnect:")).length, 1, "told once per break");
  answer = () => new Response(JSON.stringify({ id: `gm2_${TAG}` }), { status: 200 });
  await connect();
  assert.equal((await q(`select status from mailboxes where workspace_id = $1`, [ws]))[0].status, "ok");
  const third = await message("g");
  await run();
  assert.equal((await status(third)).provider_id, `gm2_${TAG}`);
  assert.equal((await q(`select (mailbox_broken(id, 'again')->>'tell')::boolean t from mailboxes where workspace_id = $1`, [ws]))[0].t, true, "a new break is told again");
});

test("the owner's workflow email names them; the old five-field call still works", async () => {
  const c = (await q(`insert into contacts (workspace_id, email, email_clean) values ($1, $2, $2) returning id`, [ws, `h-${TAG}@lead.io`]))[0].id;
  const wf = (await q(`insert into workflows (workspace_id, name, status, live_version, trigger_kind, live_at) values ($1, 'W', 'live', 1, 'form', now()) returning id`, [ws]))[0].id;
  await q(`insert into workflow_versions (workflow_id, workspace_id, version, body) values ($1, $2, 1, '{}')`, [wf, ws]);
  await q(`insert into workflow_emails (workflow_id, version, step_id, email_id) values ($1, 1, 's1', $2)`, [wf, email]);
  const run1 = (await q(`insert into workflow_runs (workspace_id, workflow_id, version, contact_id, key) values ($1, $2, 1, $3, 'k1') returning id`, [ws, wf, c]))[0].id;
  const id = (await q(`select workflow_email($1, 's1', '{}', 'Ada', 'ada@acme.com', $2) as id`, [run1, owner]))[0].id;
  assert.equal((await q(`select sender_user from email_messages where id = $1`, [id]))[0].sender_user, owner);
  const run2 = (await q(`insert into workflow_runs (workspace_id, workflow_id, version, contact_id, key) values ($1, $2, 1, $3, 'k2') returning id`, [ws, wf, c]))[0].id;
  assert.ok((await q(`select workflow_email($1, 's1', '{}', 'Ada', 'ada@acme.com') as id`, [run2]))[0].id);
});
