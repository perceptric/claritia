// Tracking's server events on a real database (128_track.sql): a fill keeps its browser details and queues one
// event, once, and never for spam or tests; its booking queues one more only when the fill kept them; track_take
// reads the form's Tracking and the workspace's Meta and Google Ads connections; old details go after 30 days.
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
  await q(`insert into workspaces (id, name) values ($1, 'Acme')`, [ws]);
  const form = (await q(`insert into forms (workspace_id, name, status) values ($1, 'Demo', 'live') returning id`, [ws]))[0].id as string;
  await q(`insert into form_versions (form_id, workspace_id, version, body) values ($1, $2, 1, $3)`, [form, ws, { track: { pixel: "123456789012345", meta: true } }]);
  await q(`insert into sources (workspace_id, kind, name, status) values ($1, 'meta_ads', 'Meta', 'active')`, [ws]);
  return { ws, form };
}
const fill = async (ws: string, form: string, o: { spam?: boolean; test?: boolean } = {}) =>
  (await q(`insert into submissions (workspace_id, form_id, form_version, idem_key, "values", hidden, spam, test) values ($1, $2, 1, $3, '{}', '{"gclid":"Cj0abc123456"}', $4, $5) returning id`, [ws, form, hex(24), o.spam ?? false, o.test ?? false]))[0].id as string;
const jobs = (ws: string) => q(`select key, payload from jobs where workspace_id = $1 and kind = 'track_send' order by created_at`, [ws]);

test("a fill queues one event, once; spam and tests none; its booking one more only when the fill kept details", async () => {
  const s = await setup();
  const a = await fill(s.ws, s.form);
  assert.equal((await q(`select track_keep($1, $2) as x`, [a, { ip: "203.0.113.9", ua: "Mozilla" }]))[0].x, true);
  assert.equal((await q(`select track_keep($1, $2) as x`, [a, { ip: "198.51.100.1" }]))[0].x, false, "a repeated send changes nothing");
  assert.equal((await q(`select info from submission_track where submission_id = $1`, [a]))[0].info.ip, "203.0.113.9");
  for (const o of [{ spam: true }, { test: true }]) assert.equal((await q(`select track_keep($1, '{}') as x`, [await fill(s.ws, s.form, o)]))[0].x, false);
  const b = await fill(s.ws, s.form);
  assert.equal((await q(`select track_booked($1) as x`, [b]))[0].x, false, "no details kept, no booking event");
  assert.equal((await q(`select track_booked($1) as x`, [a]))[0].x, true);
  assert.deepEqual((await jobs(s.ws)).map((j) => [j.key, j.payload.event]), [[`track:${a}`, "submit"], [`track:b:${a}`, "booked"]]);
});

test("track_take reads the form's Tracking, the click id and the Meta connection; old details are pruned", async () => {
  const s = await setup();
  const a = await fill(s.ws, s.form);
  await q(`select track_keep($1, '{"ua":"Mozilla"}')`, [a]);
  const x = (await q(`select track_take($1) as x`, [a]))[0].x;
  assert.equal(x.track.meta, true);
  assert.equal(x.submission.hidden.gclid, "Cj0abc123456");
  assert.ok(x.meta_source);
  assert.equal(x.ads_source, null);
  await q(`update submission_track set created_at = now() - interval '31 days' where submission_id = $1`, [a]);
  await q(`select track_prune()`);
  assert.equal((await q(`select track_take($1) as x`, [a]))[0].x, null);
});
