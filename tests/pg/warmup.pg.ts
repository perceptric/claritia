// Warm-up for new domains on a real database (supabase/migrations/155_warmup_imports.sql): a domain verified this
// week sends at most 500 campaign emails a day, even with several claims at once; the rest wait and go later, never
// skipped; meeting and workflow emails are never held; week 2 allows 1,000; a domain verified 8 weeks ago has no cap;
// the Send panel's count shows what's left today.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 8 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
const one = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await q(sql, p))[0] as T;
after(() => pool.end());

async function setup(verifiedDaysAgo: number, people: number) {
  const ws = randomUUID();
  const user = randomUUID();
  const dom = `w${ws.slice(0, 8)}.acme.com`;
  await q(`insert into workspaces (id, name) values ($1, 'Juniper')`, [ws]);
  await q(`insert into auth.users (id, email) values ($1, $2)`, [user, `${user}@t.io`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, user]);
  await q(`insert into workspace_billing (workspace_id, plan) values ($1, 'business')`, [ws]);
  await q(`insert into sending_domains (workspace_id, domain, mail_from, tracking_host, status, verified_at) values ($1, $2, $3, $4, 'verified', now() - make_interval(days => $5))`, [ws, dom, `bounce.${dom}`, `t.${dom}`, verifiedDaysAgo]);
  await q(`insert into send_settings (workspace_id, from_name, from_email, address, quiet_start, quiet_end) values ($1, 'Juniper', $2, '14 Elm St', 0, 0)`, [ws, `news@${dom}`]);
  await q(`insert into contacts (workspace_id, email, email_clean, country) select $1, 'p' || g || '@' || $2, 'p' || g || '@' || $2, 'US' from generate_series(1, $3) g`, [ws, `${ws.slice(0, 8)}.io`, people]);
  const draft = (await one<{ id: string }>(`insert into emails (workspace_id, name, kind, subject, html, text, status) values ($1, 'Spring', 'broadcast', '', '', '', 'draft') returning id`, [ws])).id;
  const r = await one<{ r: { queued: number } }>(`select email_campaign_send($1, $2, $3, $4) r`, [ws, user, draft, { subject: "Spring", preheader: "", html: "<p>Hi</p>", text: "Hi", links: [], lists: [], everyone: true }]);
  assert.equal(r.r.queued, people);
  return { ws, user, draft, dom };
}
const claim = async (ws: string, n = 200) => ((await one<{ c: unknown[] }>(`select send_claim($1, $2) c`, [ws, n])).c ?? []).length;
const claimAll = async (ws: string) => {
  let total = 0;
  for (let i = 0; i < 10; i++) {
    const c = await claim(ws);
    total += c;
    if (!c) break;
  }
  return total;
};
const counts = (ws: string) => one<{ c: { ready: number; warm: { left_today: number; domain: string } | null } }>(`select email_audience_counts($1, '{}', true, null) c`, [ws]).then((x) => x.c);

test("a new domain sends 500 campaign emails today, even with five claims at once; the rest wait, none skipped", async () => {
  const s = await setup(0, 620);
  assert.equal((await counts(s.ws)).warm?.left_today, 500);
  const got = await Promise.all([claim(s.ws), claim(s.ws), claim(s.ws), claim(s.ws), claim(s.ws)]);
  const more = await claimAll(s.ws);
  assert.equal(got.reduce((a, b) => a + b, 0) + more, 500, "exactly the day's cap");
  const left = await one<{ queued: number; later: number; skipped: number }>(
    `select count(*) filter (where status = 'queued')::int queued, count(*) filter (where status = 'queued' and send_after > now() + interval '50 minutes')::int later, count(*) filter (where status = 'skipped')::int skipped from email_messages where email_id = $1`,
    [s.draft],
  );
  assert.deepEqual(left, { queued: 120, later: 120, skipped: 0 });
  assert.equal((await counts(s.ws)).warm?.left_today, 0);
  // An hour later they're tried again; a day after the first sends, they go.
  await q(`update email_messages set send_after = now() where email_id = $1 and status = 'queued'`, [s.draft]);
  assert.equal(await claim(s.ws), 0, "still the same day");
  await q(`update email_messages set status = 'sent', sent_at = now() - interval '25 hours' where email_id = $1 and status = 'sending'`, [s.draft]);
  await q(`update email_messages set send_after = now() where email_id = $1 and status = 'queued'`, [s.draft]);
  assert.equal(await claimAll(s.ws), 120);
});

test("meeting and workflow emails go first and are never held, and they count", async () => {
  const s = await setup(1, 510);
  const other = (await one<{ id: string }>(`insert into emails (workspace_id, name, kind, subject, html, text, status, marketing) values ($1, 'Reminder', 'one_to_one', 'Your meeting', '<p>x</p>', 'x', 'sent', false) returning id`, [s.ws])).id;
  const contact = (await one<{ id: string }>(`select id from contacts where workspace_id = $1 limit 1`, [s.ws])).id;
  const reminders = (n: number, tag: string) =>
    Promise.all(Array.from({ length: n }, (_, i) => q(`insert into email_messages (workspace_id, email_id, contact_id, to_email, status, send_after, dedupe) values ($1, $2, $3, $4, 'queued', now(), $5)`, [s.ws, other, contact, `p1@${s.ws.slice(0, 8)}.io`, `${tag}${i}`])));
  await reminders(20, "a");
  const first = (await one<{ c: { kind: string }[] }>(`select send_claim($1, 30) c`, [s.ws])).c;
  assert.deepEqual([first.filter((m) => m.kind === "one_to_one").length, first.length], [20, 30], "the reminders come before the campaign");
  assert.equal(await claimAll(s.ws), 470, "the campaign fills the rest of the day: 500 less the 20 reminders, less the 10 already taken");
  await reminders(15, "b");
  assert.equal(await claimAll(s.ws), 15, "a full day doesn't hold meeting emails");
  assert.equal((await one<{ n: number }>(`select domain_sent_day($1, $2) n`, [s.ws, s.dom])).n, 515);
});

test("week 2 allows 1,000; after 8 weeks there's no warm-up cap", async () => {
  const a = await setup(8, 1100);
  assert.equal(await claimAll(a.ws), 1000);
  const b = await setup(60, 700);
  assert.equal((await counts(b.ws)).warm, null);
  assert.equal(await claimAll(b.ws), 700);
  assert.deepEqual((await q(`select domain_warm_cap(now() - make_interval(days => d)) c from unnest(array[0, 6, 7, 14, 42, 48, 49]) d`)).map((r) => r.c), [500, 500, 1000, 2000, 32000, 32000, null]);
});
