// Moving sending domains to Amazon SES without anyone finding the button, on a real database
// (supabase/migrations/146_domain_move_emails.sql, worker-intel/jobs/domainMoves.ts): the hourly run starts moves for
// verified Resend domains only, emails every owner once the records are ready, reminds at 7 and 14 days (never both
// at once), stops when the domain is on SES, gives a step back when nothing went out, and does nothing while off.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import pg from "pg";
import { uuid7 } from "./ids.ts";
import { SendError, type Outgoing, type Sender } from "../../src/lib/email/provider.ts";
import { domainMoves } from "../../worker-intel/jobs/domainMoves.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 4 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
const one = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await q(sql, p))[0] as T;
after(() => pool.end());
const rpc = pgRpc(pool);

let ws = "";
const owners: string[] = [];
before(async () => {
  ws = uuid7();
  await q(`insert into workspaces (id, name) values ($1, 'moves')`, [ws]);
  for (const role of ["owner", "owner", "member"]) {
    const u = uuid7();
    await q(`insert into auth.users (id, email) values ($1, $2)`, [u, `${role}-${u.slice(-6)}@acme.com`]);
    await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, $3)`, [ws, u, role]);
    if (role === "owner") owners.push(`${role}-${u.slice(-6)}@acme.com`);
  }
  owners.sort();
});

const add = (domain: string, o: { status?: string; providerId?: boolean; ses?: string | null; provider?: string } = {}) =>
  one<{ id: string }>(
    `insert into sending_domains (workspace_id, domain, mail_from, tracking_host, status, provider_id, ses_status, provider) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [ws, domain, `send.${domain}`, `t.${domain}`, o.status ?? "verified", o.providerId === false ? null : `re-${uuid7()}`, o.ses ?? null, o.provider ?? "resend"],
  ).then((r) => r.id);
const row = (id: string) => one<{ ses_status: string | null; move_emailed_at: Date | null; move_reminders: number }>(`select * from sending_domains where id = $1`, [id]);
const ready = (id: string, waiting = 5) =>
  q(`update sending_domains set ses_records = $2 where id = $1`, [
    id,
    JSON.stringify(["dkim1", "dkim2", "dkim3", "mx", "spf", "dmarc"].map((key, i) => ({ key, type: key === "mx" ? "MX" : key.startsWith("dkim") ? "CNAME" : "TXT", name: `${key}.n`, value: `${key}.v`, status: i < waiting ? "waiting" : "verified" }))),
  ]);
const ago = (id: string, days: number, reminded?: number) => q(`update sending_domains set move_emailed_at = now() - make_interval(days => $2), move_reminded_at = case when $3::int is null then move_reminded_at else now() - make_interval(days => $3::int) end where id = $1`, [id, days, reminded ?? null]);

function inbox(fail?: (to: string) => Error | null) {
  const got: Outgoing[] = [];
  const keys: string[] = [];
  const sender: Sender = {
    async send(m, key) {
      const e = fail?.(m.to);
      if (e) throw e;
      got.push(m);
      keys.push(key);
      return `id-${keys.length}`;
    },
  };
  return { got, keys, sender };
}
const run = (sender: Sender, on = true) => domainMoves(rpc, { on, sender, base: "https://app.test", from: "Claritia <alerts@mail.tryclaritia.com>" });
// Only this file's domains: other test files run at the same time.
const mine = (got: Outgoing[], d: string) => got.filter((m) => m.subject.includes(d));

test("while off, nothing starts and nothing is sent", async () => {
  const d = `off${ws.slice(-6)}.acme.com`;
  const id = await add(d);
  const { got, sender } = inbox();
  assert.deepEqual(await run(sender, false), { started: 0, sent: 0, skipped: 0 });
  assert.equal((await row(id)).ses_status, null);
  assert.equal(got.length, 0);
  await q(`update sending_domains set ses_status = 'failed' where id = $1`, [id]);
});

test("the run starts moves for verified Resend domains only", async () => {
  const live = await add(`live${ws.slice(-6)}.acme.com`);
  const waiting = await add(`wait${ws.slice(-6)}.acme.com`, { status: "pending" });
  const sesOnly = await add(`new${ws.slice(-6)}.acme.com`, { providerId: false, status: "pending" });
  const moved = await add(`done${ws.slice(-6)}.acme.com`, { provider: "ses", ses: "verified" });
  const { sender } = inbox();
  await run(sender);
  assert.equal((await row(live)).ses_status, "pending");
  assert.equal((await row(waiting)).ses_status, null, "not verified on Resend: nothing to move from");
  assert.equal((await row(sesOnly)).ses_status, null, "made on SES: no move");
  assert.equal((await row(moved)).ses_status, "verified");
  assert.equal((await one<{ n: number }>(`select count(*)::int n from jobs where kind = 'domain_check' and key = $1`, [live])).n, 1);
  for (const id of [live, waiting, sesOnly]) await q(`update sending_domains set ses_status = 'failed', status = 'verified' where id = $1`, [id]);
});

test("every owner gets the records once they're ready, once; reminders at 7 and 14 days, never both at once", async () => {
  const d = `rem${ws.slice(-6)}.acme.com`;
  const id = await add(d, { ses: "pending" });
  const { got, keys, sender } = inbox();
  await run(sender);
  assert.equal(mine(got, d).length, 0, "no email before the records exist");
  await ready(id);
  await run(sender);
  assert.deepEqual(mine(got, d).map((m) => m.to).sort(), owners, "each owner, members not");
  assert.equal(mine(got, d)[0]!.subject, `Add 5 DNS records for ${d}`);
  assert.ok(keys.every((k) => k.startsWith("domain-move:")));
  await run(sender);
  assert.equal(mine(got, d).length, 2, "the next hour sends nothing more");
  // Seven days on, two records still missing: one reminder with those two.
  await ready(id, 2);
  await ago(id, 8);
  await run(sender);
  assert.equal(mine(got, d).length, 4);
  assert.equal(mine(got, d)[2]!.subject, `Reminder: 2 DNS records left for ${d}`);
  assert.equal((await row(id)).move_reminders, 1);
  // A worker that was down: 20 days since the first email, but the first reminder was just now. No second yet.
  await ago(id, 20);
  await run(sender);
  assert.equal(mine(got, d).length, 4);
  await ago(id, 20, 8);
  await run(sender);
  assert.equal(mine(got, d).length, 6);
  assert.equal((await row(id)).move_reminders, 2);
  await ago(id, 40, 20);
  await run(sender);
  assert.equal(mine(got, d).length, 6, "two reminders at most");
});

test("a domain that reaches SES gets nothing more; a step with nothing sent is given back", async () => {
  const d = `fl${ws.slice(-6)}.acme.com`;
  const id = await add(d, { ses: "pending" });
  await ready(id);
  // Every send refused: the step goes back, and the next run sends it.
  const refused = inbox(() => new SendError("Resend 429", { later: true }));
  await run(refused.sender);
  assert.equal((await row(id)).move_emailed_at, null);
  const ok = inbox();
  await run(ok.sender);
  assert.equal(mine(ok.got, d).length, 2);
  // No clear answer for one owner: it may have gone, so the step stays taken.
  const d2 = `un${ws.slice(-6)}.acme.com`;
  const id2 = await add(d2, { ses: "pending" });
  await ready(id2);
  const unclear = inbox(() => new SendError("SES didn't answer", { unknown: true }));
  await run(unclear.sender);
  assert.ok((await row(id2)).move_emailed_at);
  // On SES: no reminder, however late.
  await q(`update sending_domains set provider = 'ses', ses_status = 'verified' where id = $1`, [id]);
  await ago(id, 30);
  const after = inbox();
  await run(after.sender);
  assert.equal(mine(after.got, d).length, 0);
});

test("two workers at once send each step once", async () => {
  const d = `two${ws.slice(-6)}.acme.com`;
  const id = await add(d, { ses: "pending" });
  await ready(id);
  const a = inbox();
  const b = inbox();
  await Promise.all([run(a.sender), run(b.sender)]);
  assert.equal(mine(a.got, d).length + mine(b.got, d).length, 2, "one email per owner, from one worker");
});
