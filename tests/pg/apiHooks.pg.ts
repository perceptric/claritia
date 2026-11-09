// The Forms API's hooks and sign-in codes on a real database (127_api_hooks.sql): a fill and a routing result each
// write one send per hook that wants them, and only once; spam, tests and other forms write none; a revoked key takes
// its hooks with it; a hook an app made pauses after 3 days of failures; a sign-in code works once, and a second use
// revokes the key it made; the Webhooks tab neither lists nor counts the apps' hooks.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 4 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

const hex = (n: number) => randomUUID().replace(/-/g, "").repeat(2).slice(0, n);

async function setup() {
  const ws = randomUUID();
  const user = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, 'Acme')`, [ws]);
  await q(`insert into auth.users (id, email) values ($1, $2)`, [user, `${user.slice(0, 8)}@t.io`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, user]);
  const form = (await q(`insert into forms (workspace_id, name, status) values ($1, 'Demo', 'live') returning id`, [ws]))[0].id as string;
  const other = (await q(`insert into forms (workspace_id, name, status) values ($1, 'Other', 'live') returning id`, [ws]))[0].id as string;
  for (const f of [form, other]) await q(`insert into form_versions (form_id, workspace_id, version, body) values ($1, $2, 1, '{}')`, [f, ws]);
  const key = (await q(`insert into api_keys (workspace_id, name, prefix, key_hash) values ($1, 'Zapier', 'clr_abcd', $2) returning id`, [ws, hex(64)]))[0].id as string;
  return { ws, user, form, other, key };
}

const hook = async (s: Awaited<ReturnType<typeof setup>>, events: string[], forms: string[] = [], via = "zapier") =>
  (await q(`select api_hook_add($1, $2, $3, 'hooks.zapier.com', 'sealed', 'abcd', $4, $5, '') as id`, [s.ws, s.key, via, events, forms]))[0].id as string;

const fill = async (ws: string, form: string, o: { spam?: boolean; test?: boolean } = {}) =>
  (await q(`insert into submissions (workspace_id, form_id, form_version, idem_key, "values", spam, test) values ($1, $2, 1, $3, '{"email":"ada@acme.com"}', $4, $5) returning id`, [ws, form, hex(24), o.spam ?? false, o.test ?? false]))[0].id as string;

const sends = (endpoint: string) => q(`select event, submission_id, ref, frozen, body from webhook_deliveries where endpoint_id = $1 order by created_at`, [endpoint]);
const jobs = (ws: string) => q(`select kind, payload from jobs where workspace_id = $1 and kind = 'meeting_webhook'`, [ws]);

test("a fill writes one send per hook that wants it, with its job; spam, tests and other forms write none", async () => {
  const s = await setup();
  const all = await hook(s, ["form.submitted"]);
  const one = await hook(s, ["form.submitted"], [s.form]);
  const bookings = await hook(s, ["meeting.booked"]);
  const sub = await fill(s.ws, s.form);
  await fill(s.ws, s.form, { spam: true });
  await fill(s.ws, s.form, { test: true });
  await fill(s.ws, s.other);
  const a = await sends(all);
  assert.equal(a.length, 2, "every form: the first fill and the other form's");
  assert.equal(a[0].submission_id, sub);
  assert.equal(a[0].ref, `sub:${sub}`);
  assert.equal(a[0].frozen, false, "the body is built on the first try");
  assert.equal((await sends(one)).length, 1, "only its form");
  assert.equal((await sends(bookings)).length, 0);
  assert.equal((await jobs(s.ws)).length, 3);
  // The same fill again (a replayed trigger) is still one send.
  await assert.rejects(q(`insert into webhook_deliveries (workspace_id, endpoint_id, event, submission_id, ref, body) values ($1, $2, 'form.submitted', $3, $4, '{}')`, [s.ws, all, sub, `sub:${sub}`]));
  const read = (await q(`select hook_fill($1) as x`, [sub]))[0].x;
  assert.equal(read.form.name, "Demo");
  assert.equal(read.submission.values.email, "ada@acme.com");
  const recent = (await q(`select api_recent($1, 'form.submitted', $2, null, 3) as x`, [s.ws, s.form]))[0].x;
  assert.equal(recent.length, 1, "spam and other forms stay out");
});

test("a routing result writes one frozen send, with the owner and the contact", async () => {
  const s = await setup();
  const h = await hook(s, ["lead.routed"]);
  const c = (await q(`insert into contacts (workspace_id, email, email_clean, email_class, first_name, source) values ($1, 'ada@acme.com', 'ada@acme.com', 'work', 'Ada', 'form') returning id`, [s.ws]))[0].id;
  await q(`insert into contact_events (workspace_id, contact_id, kind, data, source) values ($1, $2, 'lead.routed', $3, 'routing')`, [s.ws, c, { owner: s.user, by: "rule" }]);
  await q(`insert into contact_events (workspace_id, contact_id, kind, data, source) values ($1, $2, 'form.submitted', '{}', 'form')`, [s.ws, c]);
  const r = await sends(h);
  assert.equal(r.length, 1);
  assert.equal(r[0].frozen, true);
  assert.equal(r[0].body.event, "lead.routed");
  assert.equal(r[0].body.data.lead.result, "routed");
  assert.equal(r[0].body.data.lead.owner.id, s.user);
  assert.equal(r[0].body.data.lead.contact.email, "ada@acme.com");
});

test("a revoked key takes its hooks; the Webhooks tab neither lists nor counts them", async () => {
  const s = await setup();
  for (let i = 0; i < 12; i++) await hook(s, ["meeting.booked"]);
  assert.equal(((await q(`select webhooks_list($1) as x`, [s.ws]))[0].x as unknown[]).length, 0);
  // A person can still add their own 10.
  for (let i = 0; i < 10; i++) await q(`select webhook_save($1, null, 'a.io', 'sealed', 'abcd', array['meeting.booked'], '', true, $2)`, [s.ws, s.user]);
  await assert.rejects(q(`select webhook_save($1, null, 'a.io', 'sealed', 'abcd', array['meeting.booked'], '', true, $2)`, [s.ws, s.user]), /too_many/);
  await q(`update api_keys set revoked_at = now() where id = $1`, [s.key]);
  assert.equal((await q(`select count(*)::int n from webhook_endpoints where workspace_id = $1 and via <> 'app'`, [s.ws]))[0].n, 0);
  assert.equal((await q(`select count(*)::int n from webhook_endpoints where workspace_id = $1 and via = 'app'`, [s.ws]))[0].n, 10);
  await assert.rejects(hook(s, ["meeting.booked"]), /bad_key/);
});

test("an app's hook pauses after 3 days of failures; a success in between starts the count again", async () => {
  const s = await setup();
  const h = await hook(s, ["form.submitted"]);
  const send = async () => (await q(`select id from webhook_deliveries where endpoint_id = $1 order by created_at desc limit 1`, [h]))[0].id;
  await fill(s.ws, s.form);
  await q(`select webhook_done($1, 'retrying', 503, 'It answered 503.')`, [await send()]);
  await q(`update webhook_endpoints set failing_since = now() - interval '2 days' where id = $1`, [h]);
  await q(`select webhook_done($1, 'failed', 503, 'It answered 503.')`, [await send()]);
  assert.equal((await q(`select active from webhook_endpoints where id = $1`, [h]))[0].active, true, "2 days: still on");
  await q(`select webhook_done($1, 'done', 200, null)`, [await send()]);
  assert.equal((await q(`select failing_since from webhook_endpoints where id = $1`, [h]))[0].failing_since, null);
  await q(`update webhook_endpoints set failing_since = now() - interval '4 days' where id = $1`, [h]);
  await q(`select webhook_done($1, 'failed', 503, 'It answered 503.')`, [await send()]);
  const ep = (await q(`select active, last_error from webhook_endpoints where id = $1`, [h]))[0];
  assert.equal(ep.active, false);
  assert.match(ep.last_error, /^Paused after 3 days/);
  assert.equal(await q(`select api_hook_remove($1, $2) as x`, [s.ws, h]).then((r) => r[0].x), true);
});

test("a sign-in code works once; a second use revokes the key it made; an old one never works", async () => {
  const s = await setup();
  const code = hex(64);
  await q(`select oauth_code_add($1, 'zapier', $2, $3, 'https://zapier.com/dashboard/auth/oauth/return/App1CLIAPI/', '')`, [code, s.ws, s.user]);
  assert.equal((await q(`select oauth_code_use($1, 'make') as x`, [code]))[0].x, null, "another app's code");
  const first = (await q(`select oauth_code_use($1, 'zapier') as x`, [code]))[0].x;
  assert.equal(first.ok, true);
  assert.equal(first.workspace_id, s.ws);
  const kid = (await q(`select oauth_key_make($1, 'Zapier', 'clr_wxyz', $2) as x`, [code, hex(64)]))[0].x;
  await assert.rejects(q(`select oauth_key_make($1, 'Zapier', 'clr_wxyz', $2)`, [code, hex(64)]), /bad_code/);
  const again = (await q(`select oauth_code_use($1, 'zapier') as x`, [code]))[0].x;
  assert.equal(again.replay, true);
  assert.ok((await q(`select revoked_at from api_keys where id = $1`, [kid]))[0].revoked_at, "the replayed code's key is revoked");

  const old = hex(64);
  await q(`select oauth_code_add($1, 'make', $2, $3, 'https://www.make.com/oauth/cb/app', '')`, [old, s.ws, s.user]);
  await q(`update oauth_codes set expires_at = now() - interval '1 minute' where code_hash = $1`, [old]);
  assert.equal((await q(`select oauth_code_use($1, 'make') as x`, [old]))[0].x, null);
  await assert.rejects(q(`select oauth_code_add($1, 'zapier', $2, $3, 'https://x', '')`, [hex(64), s.ws, randomUUID()]), /not_member/);
});

test("an MCP app registers, signs in once with its own code, and is kept once used; unused ones go after 7 days", async () => {
  const s = await setup();
  const id = `mcp_${hex(32)}`;
  await q(`select oauth_client_add($1, 'Claude', $2)`, [id, ["https://claude.ai/api/mcp/auth_callback"]]);
  assert.deepEqual((await q(`select oauth_client_get($1) as x`, [id]))[0].x, { name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] });
  assert.equal((await q(`select oauth_client_get('mcp_${"n".repeat(24)}') as x`))[0].x, null);
  await assert.rejects(q(`select oauth_client_add('evil', 'X', $1)`, [["https://a.io"]]), /check/);
  await assert.rejects(q(`select oauth_client_add($1, 'X', $2)`, [`mcp_${hex(32)}`, []]), /check/);
  const code = hex(64);
  await q(`select oauth_code_add($1, $2, $3, $4, 'https://claude.ai/api/mcp/auth_callback', $5)`, [code, id, s.ws, s.user, "c".repeat(43)]);
  assert.ok((await q(`select used_at from oauth_clients where id = $1`, [id]))[0].used_at, "kept once someone approves it");
  assert.equal((await q(`select oauth_code_use($1, 'zapier') as x`, [code]))[0].x, null, "another app can't use its code");
  const used = (await q(`select oauth_code_use($1, $2) as x`, [code, id]))[0].x;
  assert.equal(used.ok, true);
  assert.equal(used.challenge, "c".repeat(43));
  const kid = (await q(`select oauth_key_make($1, 'Claude', 'clr_mcp1', $2) as x`, [code, hex(64)]))[0].x;
  assert.equal((await q(`select name from api_keys where id = $1`, [kid]))[0].name, "Claude");
  // An app that registered and never signed in goes after 7 days; one that did stays.
  const stale = `mcp_${hex(32)}`;
  await q(`select oauth_client_add($1, 'Old', $2)`, [stale, ["https://a.io/cb"]]);
  await q(`update oauth_clients set created_at = now() - interval '8 days' where id in ($1, $2)`, [stale, id]);
  await q(`select oauth_client_add($1, 'New', $2)`, [`mcp_${hex(32)}`, ["https://b.io/cb"]]);
  assert.equal((await q(`select count(*)::int as n from oauth_clients where id = $1`, [stale]))[0].n, 0);
  assert.equal((await q(`select count(*)::int as n from oauth_clients where id = $1`, [id]))[0].n, 1);
  // Nobody but the server reads or writes them.
  for (const role of ["anon", "authenticated"]) {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query(`set local role ${role}`);
      await assert.rejects(c.query(`select oauth_client_get($1)`, [id]), /permission denied/);
    } finally {
      await c.query("rollback").catch(() => {});
      c.release();
    }
  }
});
