// Text messages on a real database (129_texts.sql): a text goes only with a mobile number and a granted text
// consent, once per run and step; the job's take sees STOP, the meeting as it is now and the fallback's address;
// Twilio's delivery answers never turn delivered back; START lets texts go again.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 4 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

async function setup(phone: string | null = "+14155550132") {
  const ws = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, 'Acme')`, [ws]);
  const email = `ada_${ws.slice(0, 6)}@acme.com`;
  const c = (await q(`insert into contacts (workspace_id, email, email_clean, email_class, first_name, phone, source) values ($1, $2, $2, 'work', 'Ada', $3, 'form') returning id`, [ws, email, phone]))[0].id as string;
  const wf = (await q(`insert into workflows (workspace_id, name, status, live_version, trigger_kind, live_at) values ($1, 'Texts', 'live', 1, 'form', now()) returning id`, [ws]))[0].id as string;
  await q(`insert into workflow_versions (workflow_id, workspace_id, version, body) values ($1, $2, 1, '{}')`, [wf, ws]);
  const run = (await q(`insert into workflow_runs (workspace_id, workflow_id, version, contact_id, key) values ($1, $2, 1, $3, $4) returning id`, [ws, wf, c, `t:${randomUUID()}`]))[0].id as string;
  return { ws, c, run, email };
}
const text = (run: string, step = "s1", meeting: string | null = null, start: string | null = null) =>
  q(`select workflow_text($1, $2, 'sms', 'Hi', null, '{}', $3, $4, $5) as x`, [run, step, meeting, start, { subject: "Reminder", text: "Hi" }]).then((r) => r[0].x);

test("a text needs text consent and a mobile number, and is queued once per run and step", async () => {
  const s = await setup();
  assert.deepEqual(await text(s.run), { skip: "no text consent" });
  assert.equal((await q(`select text_consent_add($1, null, $2, '+14155550132', 'Text me', 'booking') as x`, [s.ws, s.email.toUpperCase()]))[0].x, s.c, "found by email");
  const first = await text(s.run);
  assert.ok(first.id);
  assert.deepEqual(await text(s.run), { skip: "queued before" });
  assert.equal((await q(`select count(*)::int n from jobs where workspace_id = $1 and kind = 'text_send'`, [s.ws]))[0].n, 1);
  await q(`insert into consents (workspace_id, contact_id, channel, basis, status, source) values ($1, $2, 'sms', 'opt_in', 'withdrawn', 'manual')`, [s.ws, s.c]);
  assert.deepEqual(await text(s.run, "s2"), { skip: "no text consent" }, "the latest consent counts");
  const none = await setup(null);
  await q(`select text_consent_add($1, $2, null, 'not a number', 'Text me', 'form')`, [none.ws, none.c]);
  assert.deepEqual(await text(none.run), { skip: "no mobile number" });
});

test("the take sees STOP, the meeting now and the address for the email; START lets it go again", async () => {
  const s = await setup();
  await q(`select text_consent_add($1, $2, null, null, 'Text me', 'form')`, [s.ws, s.c]);
  const { id } = await text(s.run);
  await q(`select text_optout('+18005550100', '+14155550132', true)`);
  let t = (await q(`select text_take($1) as x`, [id]))[0].x;
  assert.deepEqual(t.stopped, ["+18005550100"]);
  assert.equal(t.attempts, 1);
  assert.equal(t.consent, "granted");
  assert.equal(t.email, s.email);
  assert.deepEqual(t.fallback, { subject: "Reminder", text: "Hi" });
  await q(`select text_optout('+18005550100', '+14155550132', false)`);
  t = (await q(`select text_take($1) as x`, [id]))[0].x;
  assert.deepEqual(t.stopped, []);
  assert.equal(t.attempts, 2);
  await q(`select text_done($1, 'sent', $2, '+18005550100', null)`, [id, `SM${"a".repeat(32)}`]);
  assert.equal((await q(`select text_take($1) as x`, [id]))[0].x, null, "a sent text is never taken again");
  assert.equal((await q(`select text_status($1, 'delivered', null) as x`, [`SM${"a".repeat(32)}`]))[0].x, true);
  await q(`select text_status($1, 'sent', null)`, [`SM${"a".repeat(32)}`]);
  assert.equal((await q(`select status from text_messages where id = $1`, [id]))[0].status, "delivered");
});
