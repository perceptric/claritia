// The booking page's holds, hosts' time zones and form answers on a real database
// (supabase/migrations/161_booking_page.sql; docs/booking-page-plan.md).
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 4 });
after(() => pool.end());
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows as Record<string, unknown>[];
const tok = (s: string) => createHash("sha256").update(s).digest("hex");

async function setup() {
  const ws = randomUUID();
  const host = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, 'Juniper')`, [ws]);
  await q(`insert into availability (workspace_id, user_id, tz, weekly) values ($1, $2, 'Asia/Ho_Chi_Minh', '{}')`, [ws, host]);
  await q(`insert into booking_profiles (workspace_id, user_id, slug, name, headline) values ($1, $2, $3, 'Vincent', 'Founder')`, [ws, host, `v-${ws.slice(0, 8)}`]);
  const type = (await q(`insert into meeting_types (workspace_id, slug, name, kind, hosts, settings) values ($1, 'intro', 'Intro', 'one', $2, '{"lengths":[30]}') returning id`, [ws, JSON.stringify([{ user_id: host }])]))[0]!.id as string;
  return { ws, host, type };
}

test("book_profiles carries each host's time zone", async () => {
  const s = await setup();
  const [p] = (await q(`select book_profiles($1, $2) p`, [s.ws, [s.host]]))[0]!.p as { tz: string; headline: string }[];
  assert.equal(p!.tz, "Asia/Ho_Chi_Minh");
  assert.equal(p!.headline, "Founder");
});

test("a held time is one guest's until it runs out; a second pick moves the hold", async () => {
  const s = await setup();
  const at = new Date(Date.UTC(2030, 0, 7, 9)).toISOString();
  const at2 = new Date(Date.UTC(2030, 0, 7, 10)).toISOString();
  const [a, b] = [tok("a"), tok("b")];
  assert.equal((await q(`select slot_hold($1, $2, $3) ok`, [s.type, at, a]))[0]!.ok, true);
  // Someone else can't take it, and sees it as taken.
  assert.equal((await q(`select slot_hold($1, $2, $3) ok`, [s.type, at, b]))[0]!.ok, false);
  assert.deepEqual((await q(`select slot_holds_taken($1, $2) t`, [s.type, b]))[0]!.t, [Date.parse(at)]);
  // The holder doesn't see their own hold as taken.
  assert.deepEqual((await q(`select slot_holds_taken($1, $2) t`, [s.type, a]))[0]!.t, []);
  // Picking another time lets the first one go.
  assert.equal((await q(`select slot_hold($1, $2, $3) ok`, [s.type, at2, a]))[0]!.ok, true);
  assert.equal((await q(`select slot_hold($1, $2, $3) ok`, [s.type, at, b]))[0]!.ok, true);
  // A hold that ran out is gone: the next pick by anyone clears it.
  await q(`update slot_holds set expires_at = now() - interval '1 second' where type_id = $1 and start_at = $2`, [s.type, at2]);
  assert.deepEqual((await q(`select slot_holds_taken($1, $2) t`, [s.type, tok("c")]))[0]!.t, [Date.parse(at)]);
  assert.equal((await q(`select slot_hold($1, $2, $3) ok`, [s.type, at2, tok("c")]))[0]!.ok, true);
  await q(`select slot_hold_release($1)`, [b]);
  assert.deepEqual((await q(`select slot_holds_taken($1, null) t`, [s.type]))[0]!.t, [Date.parse(at2)]);
});

test("two guests racing for one time: exactly one gets it", async () => {
  const s = await setup();
  const at = new Date(Date.UTC(2030, 0, 8, 9)).toISOString();
  const r = await Promise.all(Array.from({ length: 8 }, (_, i) => q(`select slot_hold($1, $2, $3) ok`, [s.type, at, tok(`g${i}`)])));
  assert.equal(r.filter((x) => x[0]!.ok === true).length, 1);
});

test("fill_answers gives each answered field with its label", async () => {
  const s = await setup();
  const form = (await q(`insert into forms (workspace_id, name, status) values ($1, 'Demo', 'live') returning id`, [s.ws]))[0]!.id as string;
  const body = { steps: [{ fields: [{ id: "f1", key: "email", label: "Work email", type: "email" }, { id: "f2", key: "custom", label: "Team size", type: "choice" }, { id: "f3", key: "custom", label: "Skipped", type: "text" }] }] };
  await q(`insert into form_versions (form_id, workspace_id, version, body) values ($1, $2, 1, $3)`, [form, s.ws, JSON.stringify(body)]);
  const sub = (await q(`insert into submissions (workspace_id, form_id, form_version, idem_key, "values") values ($1, $2, 1, $3, $4) returning id`, [s.ws, form, randomUUID().replace(/-/g, ""), JSON.stringify({ f1: "ada@acme.com", f2: "11-50" })]))[0]!.id as string;
  const got = ((await q(`select fill_answers($1) a`, [sub]))[0]!.a as { label: string; value: unknown }[]).map((x) => [x.label, x.value]);
  assert.deepEqual(got, [["Work email", "ada@acme.com"], ["Team size", "11-50"]]);
});
