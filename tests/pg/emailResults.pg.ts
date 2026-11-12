// Email results on a real database (supabase/migrations/152_email_results.sql): one open per message and none before
// it's sent; meetings and form fills count toward an email when the same person made them within 7 days after first
// clicking it, never before the click, after the window, by someone else, or for spam fills; the results page lists
// who booked and filled, and people per link with mail filters left out.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 4 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
const one = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await q(sql, p))[0] as T;
after(() => pool.end());

async function setup() {
  const ws = randomUUID();
  const user = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, 'Juniper')`, [ws]);
  await q(`insert into auth.users (id, email) values ($1, $2)`, [user, `${user}@t.io`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, user]);
  const email = (await one<{ id: string }>(`insert into emails (workspace_id, name, kind, subject, html, text, links, status) values ($1, 'Spring', 'broadcast', 'Hi', '<p>x</p>', 'x', array['https://a.io/one','https://a.io/two'], 'sending') returning id`, [ws])).id;
  const person = async (name: string) => (await one<{ id: string }>(`insert into contacts (workspace_id, email, email_clean, first_name, country) values ($1, $2, $2, $3, 'US') returning id`, [ws, `${name}@x.io`, name])).id;
  const msg = async (contact: string, o: { sent?: boolean; click?: string } = {}) =>
    (await one<{ id: string }>(`insert into email_messages (workspace_id, email_id, contact_id, to_email, dedupe, status, sent_at, first_click_at) values ($1, $2, $3, $4, $5, 'sent', $6, $7::timestamptz) returning id`, [ws, email, contact, `${randomUUID()}@x.io`, randomUUID(), o.sent === false ? null : new Date(Date.now() - 20 * 86400_000).toISOString(), o.click ?? null])).id;
  const type = (await one<{ id: string }>(`insert into meeting_types (workspace_id, slug, name, kind, hosts, settings) values ($1, 'intro', 'Intro call', 'one', '[]', '{}') returning id`, [ws])).id;
  const meeting = (contact: string, at: string) =>
    q(`insert into meetings (workspace_id, type_id, contact_id, hosts, guest_email, start_at, end_at, block_start, block_end, status, source, token_hash, created_at)
       values ($1, $2, $3, array[$5::uuid], 'g@x.io', now() + interval '3 days', now() + interval '3 days 30 minutes', now() + interval '3 days', now() + interval '3 days 30 minutes', 'booked', 'page', $6, $4::timestamptz)`, [ws, type, contact, at, user, randomUUID().replace(/-/g, "")]);
  const form = (await one<{ id: string }>(`insert into forms (workspace_id, name, draft) values ($1, 'Workshop sign-up', '{}') returning id`, [ws])).id;
  const fill = (contact: string, at: string, spam = false) => q(`insert into submissions (workspace_id, form_id, form_version, contact_id, idem_key, created_at, spam) values ($1, $2, 1, $3, $4, $5::timestamptz, $6)`, [ws, form, contact, randomUUID().replace(/-/g, ""), at, spam]);
  return { ws, user, email, person, msg, meeting, fill };
}
const day = (n: number) => new Date(Date.now() - n * 86400_000).toISOString();
const counts = (ws: string, email: string) => one<{ opened: number; meetings: number; forms: number; clicked: number }>(`select * from email_campaigns($1) where id = $2`, [ws, email]);

test("one open per message, and none before it's sent", async () => {
  const s = await setup();
  const m = await s.msg(await s.person("ana"));
  const early = await s.msg(await s.person("ben"), { sent: false });
  assert.equal((await one<{ r: boolean }>(`select email_open($1) r`, [m])).r, true);
  assert.equal((await one<{ r: boolean }>(`select email_open($1) r`, [m])).r, false, "a second load counts nothing");
  assert.equal((await one<{ r: boolean }>(`select email_open($1) r`, [early])).r, false);
  assert.equal((await one<{ r: boolean }>(`select email_open($1) r`, [randomUUID()])).r, false);
  assert.equal((await one<{ n: number }>(`select count(*)::int n from email_events where message_id = $1 and kind = 'opened'`, [m])).n, 1);
  assert.equal((await counts(s.ws, s.email)).opened, 1);
});

test("meetings and fills count within 7 days after the first click, by that person only", async () => {
  const s = await setup();
  const ana = await s.person("ana");
  const ben = await s.person("ben");
  const cy = await s.person("cy");
  await s.msg(ana, { click: day(10) });
  await s.msg(ben, { click: day(5) });
  await s.msg(cy); // never clicked
  await s.meeting(ana, day(8)); // 2 days after Ana's click: counts
  await s.meeting(ana, day(1)); // 9 days after: too late
  await s.meeting(ben, day(6)); // before Ben's click: no
  await s.meeting(cy, day(2)); // Cy never clicked: no
  await s.fill(ben, day(4)); // a day after: counts
  await s.fill(ben, day(3), true); // spam: no
  await s.fill(ana, day(11)); // before the click: no
  const c = await counts(s.ws, s.email);
  assert.deepEqual([c.clicked, c.meetings, c.forms], [2, 1, 1]);
  const r = (await one<{ r: { booked: { name: string; what: string }[]; filled: { name: string; what: string }[]; links: { url: string; people: number }[] } }>(`select set_config('request.jwt.claim.sub', $3, true), email_campaign_results($1, $2) r`, [s.ws, s.email, s.user])).r;
  assert.deepEqual(r.booked.map((x) => [x.name, x.what]), [["ana", "Intro call"]]);
  assert.deepEqual(r.filled.map((x) => [x.name, x.what]), [["ben", "Workshop sign-up"]]);
});

test("people per link, with mail filters left out", async () => {
  const s = await setup();
  const a = await s.msg(await s.person("ana"), { click: day(1) });
  const b = await s.msg(await s.person("ben"), { click: day(1) });
  const click = (m: string, link: number, human: boolean) => q(`insert into email_events (workspace_id, message_id, kind, data) values ($1, $2, 'clicked', $3)`, [s.ws, m, { link, human }]);
  await click(a, 0, true);
  await click(a, 0, true);
  await click(b, 0, true);
  await click(b, 1, false);
  const r = (await one<{ r: { links: { url: string; people: number }[] } }>(`select set_config('request.jwt.claim.sub', $3, true), email_campaign_results($1, $2) r`, [s.ws, s.email, s.user])).r;
  assert.deepEqual(r.links, [{ url: "https://a.io/one", people: 2 }, { url: "https://a.io/two", people: 0 }]);
  await assert.rejects(q(`select set_config('request.jwt.claim.sub', $3, true), email_campaign_results($1, $2) r`, [s.ws, s.email, randomUUID()]), /Workspace not found/);
});
