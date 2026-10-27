// Form results and field numbers on a real database (docs/forms-plan.md 1.3): pages never skip or repeat a fill, even
// when many share a time; search finds an answer to a field a later version removed; only members read; a fill held as
// spam is let through once, however many times it's clicked, with one contact and one delivery per destination; and
// field summaries that get lost, come twice or come after the fill still count each visit once.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import pg from "pg";
import { uuid7 } from "../../collect/ids.ts";
import { checkForm, type Form } from "../../src/lib/forms/schema.ts";
import { prepareSubmit, releaseFill, type HeldFill } from "../../src/lib/forms/submit.ts";
import { TEMPLATES } from "../../src/lib/forms/templates.ts";
import { seal } from "../../src/lib/seal.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";
import { ctxFor } from "../../worker-intel/jobs/imports.ts";

process.env.SECRETS_KEY ||= "test-secrets-key-that-is-long-enough-1234";
const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 8 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());
const rpc = pgRpc(pool);

async function workspace(name: string) {
  const ws = uuid7();
  const user = uuid7();
  await q(`insert into workspaces (id, name) values ($1, $2)`, [ws, name]);
  await q(`insert into auth.users (id, email) values ($1, $2)`, [user, `${user}@t.io`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, user]);
  return { ws, user };
}

async function liveForm(ws: string, user: string, body?: Form) {
  const r = checkForm(body ?? TEMPLATES.find((t) => t.key === "contact_sales")!.form());
  if ("errors" in r) throw new Error(r.errors.join(" "));
  const id = (await q(`insert into forms (workspace_id, name, draft) values ($1, 'Contact', $2) returning id`, [ws, r.form]))[0].id as string;
  const v = (await q(`select form_publish($1, $2, $3) as v`, [id, user, r.form]))[0].v as number;
  return { id, form: r.form, version: v };
}

async function webhook(user: string, form: string) {
  return (await q(`select form_destination_save($1, $2, null, 'webhook', null, 'Hook', '{}', 'upsert', $3) as id`, [user, form, seal(JSON.stringify({ url: "https://hooks.acme.com/in", secret: "s" }))]))[0].id as string;
}

async function submit(f: { id: string; form: Form; version: number }, ws: string, answers: Record<string, string>, extra: Record<string, unknown> = {}) {
  const fields = f.form.steps.flatMap((s) => s.fields);
  // Contact sales asks for a company and a message: filled in unless the test gives its own.
  const full = { ...Object.fromEntries(Object.entries({ company: "Acme", "q.message": "Hello" }).filter(([k]) => fields.some((x) => x.key === k && x.required))), ...answers };
  const byId = Object.fromEntries(Object.entries(full).map(([k, v]) => [fields.find((x) => x.key === k)!.id, v]));
  const r = prepareSubmit(f.form, f.version, { v: 1, version: f.version, key: "k".repeat(16) + uuid7().replace(/-/g, "").slice(0, 20), answers: byId, ms: 5000, ...extra }, await ctxFor(pool, ws));
  if (!("args" in r)) throw new Error(JSON.stringify(r));
  const out = (await q(`select form_submit($1, $2, $3, $4, $5, $6, $7, $8, $9, false) as r`, [f.id, r.args.p_version, r.args.p_idem, r.args.p_values, r.args.p_hidden, r.args.p_contact, r.args.p_consent, r.args.p_country, r.args.p_spam]))[0].r;
  return out as { id: string; contact_id: string | null };
}

/** A member's call, as that member. */
async function asUser<T>(user: string, sql: string, params: unknown[]): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user]);
    return (await c.query(sql, params)).rows[0].r as T;
  } finally {
    await c.query(`select set_config('request.jwt.claim.sub', '', false)`);
    c.release();
  }
}

const page = (user: string, form: string, filters: object, after: { at: string; id: string } | null, limit = 50) =>
  asUser<string[]>(user, `select form_fill_ids($1, $2, $3, $4, $5) as r`, [form, filters, after?.at ?? null, after?.id ?? null, limit]);

async function allPages(user: string, form: string, filters: object = {}) {
  const seen: string[] = [];
  let cur: { at: string; id: string } | null = null;
  for (let i = 0; i < 20; i++) {
    const ids = await page(user, form, filters, cur);
    seen.push(...ids);
    if (ids.length < 50) break;
    const last = (await q(`select id, created_at from submissions where id = $1`, [ids[ids.length - 1]]))[0];
    cur = { at: last.created_at.toISOString(), id: last.id };
  }
  return seen;
}

test("pages of 50 never skip or repeat a fill, even when 40 of them share the same time", async () => {
  const { ws, user } = await workspace("Pages");
  const f = await liveForm(ws, user);
  for (let i = 0; i < 120; i++) await submit(f, ws, { name: `Lead ${i}`, email: `lead${i}@acme${i}.com` });
  // 40 fills sent in the same microsecond (an import, a burst): the id breaks the tie.
  await q(`update submissions set created_at = '2026-10-01T10:00:00Z' where id in (select id from submissions where form_id = $1 order by random() limit 40)`, [f.id]);
  const ids = await allPages(user, f.id);
  assert.equal(ids.length, 120);
  assert.equal(new Set(ids).size, 120);
  const order = await q(`select id from submissions where form_id = $1 order by created_at desc, id desc`, [f.id]);
  assert.deepEqual(ids, order.map((r) => r.id));
  assert.equal(Number(await asUser(user, `select form_fill_count($1, '{}') as r`, [f.id])), 120);
  // Someone outside the workspace reads nothing.
  const other = await workspace("Other");
  await assert.rejects(page(other.user, f.id, {}, null), /Form not found/);
  await assert.rejects(asUser(other.user, `select form_fill_count($1, '{}') as r`, [f.id]), /Form not found/);
});

test("search finds a fill by any part of an answer, including a field a later version removed", async () => {
  const { ws, user } = await workspace("Search");
  const f = await liveForm(ws, user);
  await submit(f, ws, { name: "Zed Quinn", email: "zed@zebra-labs.io", "q.message": "Need SOC 2 reports" });
  await submit(f, ws, { name: "Ana Diaz", email: "ana@acme.com", "q.message": "Pricing please" });
  // Version 2 drops the message field.
  const v2 = structuredClone(f.form);
  v2.steps[0].fields = v2.steps[0].fields.filter((x) => x.key !== "q.message");
  await q(`select form_publish($1, $2, $3)`, [f.id, user, v2]);
  const find = async (text: string) => (await page(user, f.id, { q: text }, null)).length;
  assert.equal(await find("zebra"), 1, "part of an email's domain");
  assert.equal(await find("ZED  quinn"), 1, "case and spaces don't matter");
  assert.equal(await find("soc"), 1, "an answer to a field version 2 no longer has");
  assert.equal(await find("pric"), 1, "the start of a word");
  assert.equal(await find("nobody"), 0);
  assert.equal(await find("'); drop table submissions; --"), 0);
  assert.equal(await find("   "), 2, "blank search is no search");
});

test("filters: delivery status, booked, one answer and the date range", async () => {
  const { ws, user } = await workspace("Filters");
  const body = TEMPLATES.find((t) => t.key === "demo")!.form();
  const f = await liveForm(ws, user, body);
  await webhook(user, f.id);
  const a = await submit(f, ws, { first_name: "A", last_name: "One", email: "a@one.com", "q.company_size": "11-50" });
  const b = await submit(f, ws, { first_name: "B", last_name: "Two", email: "b@two.com", "q.company_size": "1,000+" });
  const c = await submit(f, ws, { first_name: "C", last_name: "Three", email: "c@three.com" });
  await q(`update deliveries set status = 'failed', error = 'down' where submission_id = $1`, [a.id]);
  await q(`update deliveries set status = 'done' where submission_id = $1`, [b.id]);
  await q(`insert into form_bookings (workspace_id, submission_id, contact_id, tool, external_id, linked) values ($1, $2, $3, 'calendly', 'ev-1', 'tracking')`, [ws, c.id, c.contact_id]);
  await q(`update submissions set created_at = now() - interval '40 days' where id = $1`, [c.id]);
  const ids = (filters: object) => page(user, f.id, filters, null);
  assert.deepEqual(await ids({ status: "failed" }), [a.id]);
  assert.deepEqual(await ids({ status: "sent" }), [b.id]);
  assert.deepEqual(await ids({ status: "waiting" }), [c.id]);
  assert.deepEqual(await ids({ booked: true }), [c.id]);
  assert.equal((await ids({ booked: false })).length, 2);
  assert.deepEqual(await ids({ key: "q.company_size", value: "1,000+" }), [b.id]);
  assert.equal((await ids({ from: new Date(Date.now() - 30 * 86_400_000).toISOString() })).length, 2);
  assert.deepEqual(await ids({ kind: "tests" }), []);
});

test("a fill held as spam, let through by three clicks at once, becomes one lead with one delivery per destination", async () => {
  const { ws, user } = await workspace("Release");
  const f = await liveForm(ws, user);
  await webhook(user, f.id);
  const held = await submit(f, ws, { name: "Real Person", email: "real@buyer.com", "q.message": "Fast typer" }, { ms: 200 });
  assert.equal(held.contact_id, null);
  const row = (await q(`select * from submissions where id = $1`, [held.id]))[0];
  assert.equal(row.spam_reason, "too_fast");
  const fill: HeldFill = { ...row, created_at: row.created_at.toISOString() };
  const ctx = await ctxFor(pool, ws);
  const runs = await Promise.all([releaseFill(rpc, fill, f.form, ctx), releaseFill(rpc, fill, f.form, ctx), releaseFill(rpc, fill, f.form, ctx)]);
  assert.ok(runs.every((r) => "contact" in r), JSON.stringify(runs));
  const after = (await q(`select spam, contact_id from submissions where id = $1`, [held.id]))[0];
  assert.equal(after.spam, false);
  assert.ok(after.contact_id);
  assert.equal((await q(`select count(*)::int n from contacts where workspace_id = $1 and email_clean = 'real@buyer.com'`, [ws]))[0].n, 1);
  assert.equal((await q(`select count(*)::int n from deliveries where submission_id = $1`, [held.id]))[0].n, 1);
  assert.equal((await q(`select count(*)::int n from contact_events where contact_id = $1 and kind = 'form.submitted'`, [after.contact_id]))[0].n, 1);
  assert.ok((await q(`select first_touch from contacts where id = $1`, [after.contact_id]))[0].first_touch, "first touch is set once it's a lead");
});

test("a held fill whose answers can't make a lead stays in Spam with the reason; marking spam by hand goes both ways", async () => {
  const { ws, user } = await workspace("Spam");
  const f = await liveForm(ws, user);
  const trap = await submit(f, ws, { name: "Bot", email: "bot@mailinator.com" }, { trap: "http://spam" });
  const row = (await q(`select * from submissions where id = $1`, [trap.id]))[0];
  const r = await releaseFill(rpc, { ...row, created_at: row.created_at.toISOString() }, f.form, await ctxFor(pool, ws));
  assert.deepEqual(r, { error: "Use an email address you'll keep." });
  assert.equal((await q(`select spam from submissions where id = $1`, [trap.id]))[0].spam, true);

  const lead = await submit(f, ws, { name: "Ana", email: "ana@acme.com" });
  assert.equal(await asUser(user, `select submissions_mark_spam($1, true) as r`, [[lead.id]]), 1);
  assert.deepEqual(await page(user, f.id, { kind: "spam" }, null), [lead.id, trap.id]);
  // Back: only the one that was a lead; the held one needs the release above.
  assert.equal(await asUser(user, `select submissions_mark_spam($1, false) as r`, [[lead.id, trap.id]]), 1);
  assert.deepEqual(await page(user, f.id, {}, null), [lead.id]);
  const other = await workspace("Other");
  assert.equal(await asUser(other.user, `select submissions_delete($1) as r`, [[lead.id]]), 0, "not their fill");
  assert.equal(await asUser(user, `select submissions_delete($1) as r`, [[lead.id]]), 1);
  assert.equal((await q(`select count(*)::int n from contacts where id = $1`, [lead.contact_id]))[0].n, 1, "the contact stays");
});

test("200 visits with lost, doubled and late field summaries count each visit once", async () => {
  const { ws, user } = await workspace("Fields");
  const body = TEMPLATES.find((t) => t.key === "event")!.form();
  const f = await liveForm(ws, user, body);
  const [a, b] = f.form.steps[0].fields;
  const c = f.form.steps[1].fields[0];
  const seen = (vid: string, fields: object, left: string | null, step: number, sent: boolean) =>
    q(`select form_field_seen($1, $2, $3, $4, $5, $6, $7) as r`, [f.id, vid, f.version, fields, left, step, sent]).then((r) => r[0].r as boolean);
  let finished = 0;
  let stopped = 0;
  let stoppedAtB = 0;
  let stoppedAtC = 0;
  for (let i = 0; i < 200; i++) {
    const vid = `visit${String(i).padStart(4, "0")}`;
    const kind = i % 5;
    if (kind === 0) continue; // the summary never arrived (a blocker, a crash): no row
    if (kind === 1) {
      // Left on the first step, in b, with an error on a.
      await seen(vid, { [a.id]: [1, 1, 1, 4000], [b.id]: [1, 0, 0, 2000] }, b.id, 0, false);
      stopped++;
      stoppedAtB++;
    } else if (kind === 2) {
      // Switched tabs mid-way (summary), came back and sent it (second summary): one visit, sent.
      await seen(vid, { [a.id]: [1, 1, 0, 3000] }, a.id, 0, false);
      await seen(vid, { [a.id]: [1, 1, 0, 3000], [b.id]: [1, 1, 0, 1000], [c.id]: [1, 1, 0, 5000] }, null, 1, true);
      finished++;
    } else if (kind === 3) {
      // Sent, then the page-hide summary came in after it: changes nothing.
      await seen(vid, { [a.id]: [1, 1, 0, 1000], [b.id]: [1, 1, 0, 1000], [c.id]: [1, 1, 0, 1000] }, null, 1, true);
      assert.equal(await seen(vid, { [a.id]: [1, 0, 0, 0] }, a.id, 0, false), false);
      finished++;
    } else {
      // The same summary twice (a retry), left on step 2 in c, or back in b.
      const at = i % 2 === 0 ? c.id : b.id;
      await seen(vid, { [a.id]: [1, 1, 0, 2000], [b.id]: [1, 1, 0, 500], [c.id]: [1, 0, 0, 900] }, at, 1, false);
      await seen(vid, { [a.id]: [1, 1, 0, 2000], [b.id]: [1, 1, 0, 500], [c.id]: [1, 0, 0, 900] }, at, 1, false);
      stopped++;
      if (at === c.id) stoppedAtC++;
      else stoppedAtB++;
    }
  }
  const day = new Date().toISOString().slice(0, 10);
  const s = await asUser<{ visits: number; sent: number; fields: { id: string; reached: number; answered: number; with_errors: number; left: number }[]; steps: { step: number; reached: number }[] }>(
    user,
    `select form_field_stats($1, $2::date - 1, $2::date + 1) as r`,
    [f.id, day],
  );
  assert.equal(s.visits, finished + stopped);
  assert.equal(s.sent, finished);
  const byId = new Map(s.fields.map((x) => [x.id, x]));
  assert.equal(byId.get(b.id)!.left, stoppedAtB);
  assert.equal(byId.get(a.id)!.left, 0, "the tab switch didn't count as leaving at a");
  assert.equal(byId.get(a.id)!.with_errors, 40);
  assert.equal(byId.get(c.id)!.left, stoppedAtC);
  assert.deepEqual(s.steps, [{ step: 0, reached: finished + stopped }, { step: 1, reached: finished + 40 }]);
  // Bad input is dropped, never stored.
  assert.equal(await seen("visit-bad", { "<script>": [1, 1, 1, 1], [a.id]: [9, 9, 999, 1e12] }, "x y", 99, false), true);
  const bad = (await q(`select fields, left_field, step from form_field_sessions where form_id = $1 and vid = 'visit-bad'`, [f.id]))[0];
  assert.deepEqual(bad, { fields: { [a.id]: [1, 1, 50, 3600000] }, left_field: null, step: 20 });
  // The Forms report's drop-off: the field most visits stopped at, with its label.
  const drop = await asUser<{ form_id: string; field: string; label: string; n: number; visits: number }[]>(user, `select report_form_dropoff($1, $2::date - 1, $2::date + 1) as r`, [ws, day]);
  assert.equal(drop[0].field, b.id);
  assert.equal(drop[0].label, b.label);
  assert.equal(drop[0].n, stoppedAtB);
});
