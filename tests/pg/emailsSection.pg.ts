// The Emails section's reads on a real database (supabase/migrations/149_emails_section.sql): campaigns with what
// happened to their messages, automations found by their email steps, and audiences with each person's email status
// (a suppression wins over consent), search and paging.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 4 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

async function workspace() {
  const ws = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, 'Juniper')`, [ws]);
  return ws;
}
const contact = async (ws: string, email: string, o: { first?: string; at?: string } = {}) =>
  (await q(`insert into contacts (workspace_id, email, email_clean, first_name, source, created_at) values ($1, $2, $2, $3, 'form', coalesce($4::timestamptz, now())) returning id`, [ws, email, o.first ?? null, o.at ?? null]))[0].id as string;

test("campaigns: one-off emails only, with sent, delivered, clicked, unsubscribed and bounced", async () => {
  const ws = await workspace();
  const mk = (name: string, kind: string, status = "sent") => q(`insert into emails (workspace_id, name, kind, subject, html, text, status) values ($1, $2, $3, 'Hi', '<p>Hi</p>', 'Hi', $4) returning id`, [ws, name, kind, status]).then((r) => r[0].id as string);
  const spring = await mk("Spring workshop", "broadcast");
  await mk("Welcome step", "journey");
  await mk("Old one", "broadcast", "archived");
  const draft = await mk("Retreat update", "broadcast", "draft");
  const msg = (n: number, extra: string) =>
    q(`insert into email_messages (workspace_id, email_id, to_email, dedupe, status, sent_at, delivered_at, first_click_at, unsubscribed_at, bounced)
       select $1, $2, 'p' || g || '@x.io', $3 || g, 'sent', now(), ${extra} from generate_series(1, $4) g`, [ws, spring, `${randomUUID()}-`, n]);
  await msg(6, "now(), now(), null, null");
  await msg(3, "now(), null, null, null");
  await msg(1, "null, null, now(), null");
  await msg(2, "null, null, null, 'hard'");
  const rows = await q(`select * from email_campaigns($1)`, [ws]);
  assert.deepEqual(rows.map((r) => r.name).sort(), ["Retreat update", "Spring workshop"], "journey steps and archived emails stay out");
  const s = rows.find((r) => r.id === spring)!;
  assert.deepEqual([s.sent, s.delivered, s.clicked, s.unsubscribed, s.bounced], [12, 9, 6, 1, 2]);
  const d = rows.find((r) => r.id === draft)!;
  assert.deepEqual([d.sent, d.first_sent], [0, null]);
});

test("automations: workflows with email steps, counted, branches included", async () => {
  const ws = await workspace();
  const wf = (name: string, draft: unknown) => q(`insert into workflows (workspace_id, name, draft) values ($1, $2, $3)`, [ws, name, draft]);
  await wf("Welcome", { trigger: { kind: "form", forms: [] }, steps: [{ id: "a", kind: "email" }, { id: "b", kind: "wait" }, { id: "c", kind: "branch", yes: [{ id: "d", kind: "email" }], no: [] }] });
  await wf("Slack ping", { trigger: { kind: "meeting" }, steps: [{ id: "a", kind: "slack" }] });
  const rows = await q(`select * from email_automations($1)`, [ws]);
  assert.deepEqual(rows.map((r) => [r.name, r.emails, r.trigger_kind]), [["Welcome", 2, "form"]]);
});

test("audiences: status from suppressions first, then the latest consent; search and paging", async () => {
  const ws = await workspace();
  const ana = await contact(ws, "ana@juniper.io", { first: "Ana", at: "2026-01-01" });
  const ben = await contact(ws, "ben@juniper.io", { first: "Ben", at: "2026-01-02" });
  const cy = await contact(ws, "cy@juniper.io", { at: "2026-01-03" });
  await contact(ws, "dee@juniper.io", { at: "2026-01-04" });
  const consent = (c: string, status: string, at: string) => q(`insert into consents (workspace_id, contact_id, channel, basis, status, source, at) values ($1, $2, 'email', $3, $4, 'form', $5)`, [ws, c, status === "none" ? "none" : "opt_in", status, at]);
  await consent(ana, "granted", "2026-01-01");
  await consent(ben, "granted", "2026-01-01");
  await consent(ben, "withdrawn", "2026-02-01");
  await consent(cy, "granted", "2026-01-01");
  await q(`insert into suppressions (workspace_id, email_clean, reason, source) values ($1, 'cy@juniper.io', 'bounced', 'resend')`, [ws]);
  const all = await q(`select * from audience_people($1)`, [ws]);
  assert.deepEqual(all.map((r) => [r.email, r.status]), [["dee@juniper.io", "no consent"], ["cy@juniper.io", "bounced"], ["ben@juniper.io", "unsubscribed"], ["ana@juniper.io", "subscribed"]]);
  assert.equal((await q(`select audience_count($1) n`, [ws]))[0].n, 4);
  assert.deepEqual((await q(`select email from audience_people($1, 'ana')`, [ws])).map((r) => r.email), ["ana@juniper.io"], "by name or email");
  assert.deepEqual((await q(`select email from audience_people($1, null, $2, 2)`, [ws, "2026-01-03"])).map((r) => r.email), ["ben@juniper.io", "ana@juniper.io"], "the next page");
  await q(`update contacts set deleted_at = now() where id = $1`, [ana]);
  assert.equal((await q(`select audience_count($1) n`, [ws]))[0].n, 3, "deleted people leave");
});
