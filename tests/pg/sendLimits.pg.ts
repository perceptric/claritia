// Sending as a product on a real database (supabase/migrations/144_send_limits.sql): each plan's monthly emails, a
// counter that counts each message once, a limit that holds messages back without dropping one, the month turning
// and an upgrade letting them go, and the hard-bounce guard next to the complaint guard.
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import pg from "pg";
import { uuid7 } from "./ids.ts";
import type { Outgoing } from "../../src/lib/email/provider.ts";
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

let sent: Outgoing[] = [];
const sender: Sender = {
  send: async (m) => (sent.push(m), `p-${uuid7()}`),
  batch: async (items) => (items.forEach((i) => sent.push(i.out)), items.map(() => `p-${uuid7()}`)),
};
beforeEach(() => {
  sent = [];
});

/** A workspace on a plan, with a verified domain, sending settings and `n` US contacts. */
async function workspace(plan: string | null, n: number) {
  const ws = uuid7();
  const owner = uuid7();
  await q(`insert into workspaces (id, name) values ($1, 'limits')`, [ws]);
  await q(`insert into auth.users (id, email) values ($1, $2)`, [owner, `o-${owner}@acme.com`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, owner]);
  if (plan) await q(`insert into workspace_billing (workspace_id, plan) values ($1, $2)`, [ws, plan]);
  const d = `m${ws.slice(-8)}.acme.com`;
  await q(`insert into sending_domains (workspace_id, domain, mail_from, tracking_host, status) values ($1, $2, $3, $4, 'verified')`, [ws, d, `bounce.${d}`, `t.${d}`]);
  await q(`insert into send_settings (workspace_id, from_name, from_email, address, quiet_start, quiet_end) values ($1, 'Acme', $2, '1 Main St', 0, 0)`, [ws, `news@${d}`]);
  const ids: string[] = [];
  for (let i = 0; i < n; i++) ids.push((await one<{ id: string }>(`insert into contacts (workspace_id, email, email_clean, country) values ($1, $2, $2, 'US') returning id`, [ws, `c${i}-${ws.slice(-6)}@example.com`])).id);
  const email = (await rpc("email_create", { p_ws: ws, p_user: owner, p_values: { kind: "broadcast", subject: "News", html: "<p>Hi</p>", text: "Hi", links: [], marketing: true, topic_id: "" } })).data as string;
  return { ws, owner, ids, email };
}
const job = (ws: string): Job => ({ id: uuid7(), workspace_id: ws, kind: "send", key: ws, payload: {}, attempts: 1, max_attempts: 3 });
const runSend = (ws: string) => send(rpc, { sender, base: "https://app.test", secret: "s".repeat(40), roundMs: 5_000, sleep: async () => {} })(job(ws), new AbortController().signal);
const usage = async (ws: string) => (await one<{ sends: number } | undefined>(`select sends from plan_usage where workspace_id = $1 and month = date_trunc('month', now())::date`, [ws]))?.sends ?? 0;
const statuses = async (ws: string) => Object.fromEntries((await q(`select status, count(*)::int n from email_messages where workspace_id = $1 group by status`, [ws])).map((r) => [r.status, r.n]));
/** This month's sends set by hand: as if `n` went out already. */
const used = (ws: string, n: number) => q(`insert into plan_usage (workspace_id, month, sends) values ($1, date_trunc('month', now())::date, $2) on conflict (workspace_id, month) do update set sends = excluded.sends`, [ws, n]);

before(async () => {
  process.env.SECRETS_KEY = "s".repeat(40);
});

test("the plans' monthly emails, and Settings › Billing shows them", async () => {
  assert.deepEqual((await q(`select p, plan_sends(p) n from unnest(array['free','starter','pro','business','team']) p`)).map((r) => [r.p, r.n]), [["free", 1000], ["starter", 10000], ["pro", 50000], ["business", 200000], ["team", 1000]]);
  const { ws } = await workspace("pro", 0);
  await used(ws, 1234);
  const s = await one<{ s: { sends: number; sends_cap: number } }>(`select plan_status($1) s`, [ws]);
  assert.deepEqual([s.s.sends, s.s.sends_cap], [1234, 50000]);
});

test("each message counts once when it's sent; later events and repeats don't count again", async () => {
  const { ws, ids, email } = await workspace("starter", 3);
  await rpc("email_queue", { p_email: email, p_contacts: ids });
  await runSend(ws);
  assert.equal(sent.length, 3);
  assert.equal(await usage(ws), 3);
  const m = await one<{ id: string; provider_id: string }>(`select id, provider_id from email_messages where workspace_id = $1 limit 1`, [ws]);
  // A repeat of send_done, a delivery and a bounce change the status but never count again.
  await rpc("send_done", { p_id: m.id, p_outcome: "ok", p_provider_id: m.provider_id });
  await rpc("email_event_apply", { p_event: { event_id: `d-${m.id}`, provider_id: m.provider_id, kind: "delivered" } });
  await rpc("email_event_apply", { p_event: { event_id: `b-${m.id}`, provider_id: m.provider_id, kind: "bounced", bounce: "soft" } });
  assert.equal(await usage(ws), 3);
});

test("at the limit nothing more goes, and nothing is skipped: messages wait, and an upgrade lets them go", async () => {
  const { ws, ids, email } = await workspace(null, 5);
  await used(ws, 998); // Free: 1,000 a month, 2 left.
  await rpc("email_queue", { p_email: email, p_contacts: ids });
  await runSend(ws);
  assert.equal(sent.length, 2, "only what's left of the month goes");
  assert.deepEqual(await statuses(ws), { sent: 2, queued: 3 });
  assert.equal(await usage(ws), 1000);
  // The minute tick doesn't wake a workspace with no room, and another round sends nothing.
  await q(`delete from jobs where workspace_id = $1 and kind = 'send'`, [ws]);
  await rpc("sends_due", {});
  assert.equal((await one<{ n: number }>(`select count(*)::int n from jobs where workspace_id = $1 and kind = 'send'`, [ws])).n, 0);
  await runSend(ws);
  assert.equal(sent.length, 2);
  // An upgrade to Starter: the rest go, and the tick wakes the workspace again.
  await q(`insert into workspace_billing (workspace_id, plan) values ($1, 'starter') on conflict (workspace_id) do update set plan = 'starter'`, [ws]);
  await rpc("sends_due", {});
  assert.equal((await one<{ n: number }>(`select count(*)::int n from jobs where workspace_id = $1 and kind = 'send'`, [ws])).n, 1);
  await runSend(ws);
  assert.deepEqual(await statuses(ws), { sent: 5 });
});

test("the month turning gives the room back; emails being sent right now count against it", async () => {
  const { ws, ids, email } = await workspace(null, 3);
  // Last month used it all; this month starts empty.
  await q(`insert into plan_usage (workspace_id, month, sends) values ($1, (date_trunc('month', now()) - interval '1 month')::date, 1000)`, [ws]);
  assert.equal((await one<{ r: number }>(`select send_month_room($1) r`, [ws])).r, 1000);
  // Two in flight (another worker holds them) take room until they're done.
  await used(ws, 997);
  await rpc("email_queue", { p_email: email, p_contacts: ids });
  await q(`update email_messages set status = 'sending', claimed_at = now() where id in (select id from email_messages where workspace_id = $1 order by id limit 2)`, [ws]);
  assert.equal((await one<{ r: number }>(`select send_month_room($1) r`, [ws])).r, 1);
  await runSend(ws);
  assert.equal(sent.length, 1);
});

test("hard bounces past 5% of the week's sends pause the workspace; soft bounces and a lower rate don't", async () => {
  const { ws, email } = await workspace("pro", 0);
  await q(
    `insert into email_messages (workspace_id, email_id, to_email, dedupe, status, sent_at, provider_id)
     select $1, $2::uuid, 'b' || g || '@example.com', 'b' || g, 'sent', now() - interval '1 day', 'pb-' || $2::text || '-' || g from generate_series(1, 400) g`,
    [ws, email],
  );
  const bounce = (i: number, kind: "hard" | "soft") => rpc("email_event_apply", { p_event: { event_id: `${kind}-${email}-${i}`, provider_id: `pb-${email}-${i}`, kind: "bounced", bounce: kind } });
  for (let i = 1; i <= 30; i++) await bounce(i, "soft");
  for (let i = 31; i <= 49; i++) await bounce(i, "hard");
  const paused = async () => one<{ paused: boolean; paused_reason: string | null }>(`select paused, paused_reason from send_settings where workspace_id = $1`, [ws]);
  assert.equal((await paused()).paused, false, "19 hard of 400 is under 5%; soft bounces don't count");
  await bounce(50, "hard");
  const p = await paused();
  assert.equal(p.paused, true);
  assert.match(p.paused_reason ?? "", /Hard bounces reached 20 of 400 sent in 7 days/);
  // A repeated event changes nothing, and the pause is logged once.
  await bounce(50, "hard");
  assert.equal((await one<{ n: number }>(`select count(*)::int n from audit_log where workspace_id = $1 and action = 'sending.paused'`, [ws])).n, 1);
});

test("a small workspace isn't paused for a few bounces, but 50 in a day pauses any workspace", async () => {
  const small = await workspace("starter", 0);
  await q(`insert into email_messages (workspace_id, email_id, to_email, dedupe, status, sent_at, provider_id) select $1, $2::uuid, 's' || g || '@example.com', 's' || g, 'sent', now(), 'ps-' || $2::text || '-' || g from generate_series(1, 20) g`, [small.ws, small.email]);
  for (let i = 1; i <= 5; i++) await rpc("email_event_apply", { p_event: { event_id: `h-${small.email}-${i}`, provider_id: `ps-${small.email}-${i}`, kind: "bounced", bounce: "hard" } });
  assert.equal((await one<{ paused: boolean }>(`select paused from send_settings where workspace_id = $1`, [small.ws])).paused, false, "5 of 20 is too few sends to judge");
  const big = await workspace("business", 0);
  await q(`insert into email_messages (workspace_id, email_id, to_email, dedupe, status, sent_at, provider_id) select $1, $2::uuid, 'g' || g || '@example.com', 'g' || g, 'sent', now(), 'pg-' || $2::text || '-' || g from generate_series(1, 5000) g`, [big.ws, big.email]);
  for (let i = 1; i <= 50; i++) await rpc("email_event_apply", { p_event: { event_id: `h-${big.email}-${i}`, provider_id: `pg-${big.email}-${i}`, kind: "bounced", bounce: "hard" } });
  assert.equal((await one<{ paused: boolean }>(`select paused from send_settings where workspace_id = $1`, [big.ws])).paused, true, "50 hard bounces in a day, whatever the rate");
});
