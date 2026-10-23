// The forms made before the builder, upgraded (supabase/migrations/045_form_builder.sql): a database is built up to
// 044, given forms and answers the way 041_forms.sql kept them, then moved to the latest migration. Each form keeps
// its id, status and wording, and its first version passes the schema's check unchanged; its color becomes a brand
// kit; its answers move to submissions on the same ids; and a new fill on the upgraded form joins the topic on
// opt-in, keeps a notice as legitimate interest, and logs the event in the shape nurture, scoring and CRMs read.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import pg from "pg";
import { uuid7 } from "../../collect/ids.ts";
import { allFields, checkForm, type Form } from "../../src/lib/forms/schema.ts";
import { acceptFill, type PublicForm } from "../../src/lib/forms/submit.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";
import { ctxFor } from "../../worker-intel/jobs/imports.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const admin = new pg.Client({ connectionString: url });
const DB = `forms_upgrade_${process.pid}`;
const dbUrl = url.replace(/\/[^/?]+(\?|$)/, `/${DB}$1`);
let pool: pg.Pool;
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;

const dir = new URL("../../supabase/migrations/", import.meta.url);
const migrations = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const run = async (files: string[]) => {
  for (const f of files) await pool.query(readFileSync(new URL(f, dir), "utf8"));
};

const ws = uuid7();
const user = uuid7();
const topic = uuid7();
const guide = uuid7();
const demo = uuid7();
const draft = uuid7();
const oldFill = uuid7();
const oldSpam = uuid7();

before(async () => {
  await admin.connect();
  await admin.query(`create database ${DB}`);
  pool = new pg.Pool({ connectionString: dbUrl, max: 4 });
  // Dropping the scratch database at the end ends any idle connection; that isn't a failure.
  pool.on("error", () => {});
  await pool.query(readFileSync(new URL("../db/supabase_stub.sql", import.meta.url), "utf8"));
  await run(migrations.filter((f) => f < "045"));

  await q(`insert into workspaces (id, name) values ($1, 'Upgrade')`, [ws]);
  await q(`insert into auth.users (id, email) values ($1, 'owner@acme.com')`, [user]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, user]);
  await q(`insert into topics (id, workspace_id, name) values ($1, $2, 'Product news')`, [topic, ws]);
  const fields = [
    { key: "email", label: "Work email", type: "email", required: true, maps_to: "email" },
    { key: "first", label: "First name", type: "text", maps_to: "first_name" },
    { key: "size", label: "Team size", type: "select", required: true, options: ["1-10", "11-50"] },
    { key: "country", label: "Country", type: "text", maps_to: "country" },
    { key: "phone", label: "Phone", type: "text", maps_to: "phone" },
    { key: "topics", label: "Interests", type: "multi", options: ["SEO", "Ads"] },
    { key: "src", label: "", type: "hidden", value: "utm_source" },
    { key: "plan", label: "", type: "hidden", value: "pro" },
  ];
  await q(`insert into forms (id, workspace_id, name, fields, settings, status, created_by) values ($1, $2, 'Guide', $3, $4, 'live', $5)`, [
    guide,
    ws,
    JSON.stringify(fields),
    { color: "#FF5500", consent: "checkbox", topic_id: topic, submit_label: "Get the guide", success_message: "Check your inbox", captcha: true },
    user,
  ]);
  await q(`insert into forms (id, workspace_id, name, fields, settings, status) values ($1, $2, 'Demo', $3, $4, 'live')`, [
    demo,
    ws,
    JSON.stringify(fields.slice(0, 2)),
    { consent: "notice", redirect_url: "https://acme.com/thanks" },
  ]);
  await q(`insert into forms (id, workspace_id, name, fields, settings) values ($1, $2, 'Not yet', $3, '{}')`, [draft, ws, JSON.stringify(fields.slice(0, 1))]);
  const up = (await q(`select contacts_upsert($1, 'form', $2) as r`, [ws, JSON.stringify([{ email: "old@beta.io", email_clean: "old@beta.io", email_class: "work" }])]))[0].r;
  await q(
    `insert into form_submissions (id, workspace_id, form_id, contact_id, answers, utm, page_url, referrer, basis) values ($1, $2, $3, $4, $5, $6, 'https://acme.com/guide', 'https://google.com/', 'opt_in')`,
    [oldFill, ws, guide, up.ids[0], { email: "old@beta.io", size: "1-10", topics: ["SEO"] }, { utm_source: "google", first_utm_source: "bing" }],
  );
  await q(`insert into form_submissions (id, workspace_id, form_id, answers, spam) values ($1, $2, $3, '{"email":"bot@x.io"}', 'honeypot')`, [oldSpam, ws, guide]);

  await run(migrations.filter((f) => f >= "045"));
});

after(async () => {
  await pool?.end();
  await admin.query(`drop database if exists ${DB} with (force)`);
  await admin.end();
});

const body = async (id: string) => (await q(`select v.body from forms f join form_versions v on v.form_id = f.id and v.version = f.version where f.id = $1`, [id]))[0]?.body as Form;

test("each old form keeps its id and status, and its first version passes the schema's check unchanged", async () => {
  const rows = await q(`select id, status, version, draft, brand_kit_id from forms where workspace_id = $1 order by name`, [ws]);
  assert.deepEqual(
    rows.map((r) => [r.id, r.status, r.version]),
    [
      [demo, "live", 1],
      [guide, "live", 1],
      [draft, "draft", 1],
    ],
  );
  for (const r of rows) {
    const v = await body(r.id);
    assert.deepEqual(r.draft, v);
    const c = checkForm(v);
    assert.ok("form" in c, `${r.id}: ${"errors" in c ? c.errors.join(" ") : ""}`);
    assert.deepEqual(c.form, v);
  }
  const g = await body(guide);
  assert.deepEqual(
    allFields(g).map((f) => [f.key, f.type, f.required]),
    [
      ["email", "email", true],
      ["first_name", "text", false],
      ["q.size", "choice", true],
      ["country", "text", false],
      ["phone", "text", false],
      ["q.topics", "multi", false],
      ["q.src", "hidden", false],
      ["q.plan", "hidden", false],
    ],
  );
  assert.deepEqual(allFields(g)[6].hidden, { from: "param", name: "utm_source" });
  assert.deepEqual(allFields(g)[7].hidden, { from: "static", value: "pro" });
  assert.deepEqual(g.consent, { mode: "always", label: "I'd like to get Product news emails. I can unsubscribe at any time.", topicId: topic });
  assert.deepEqual([g.submit.label, g.after.end, g.spam.turnstile], ["Get the guide", { kind: "message", title: "Check your inbox" }, true]);
  const d = await body(demo);
  assert.equal(d.consent.mode, "notice");
  assert.deepEqual(d.after.end, { kind: "redirect", url: "https://acme.com/thanks" });
  const kit = (await q(`select k.tokens from forms f join brand_kits k on k.id = f.brand_kit_id where f.id = $1`, [guide]))[0].tokens;
  assert.equal(kit.buttonBg, "#ff5500");
  const other = (await q(`select k.tokens from forms f join brand_kits k on k.id = f.brand_kit_id where f.id = $1`, [demo]))[0].tokens;
  assert.equal(other.buttonBg, "#266df0");
});

test("old answers move to submissions on the same ids, keyed by the new fields", async () => {
  const s = (await q(`select * from submissions where id = $1`, [oldFill]))[0];
  assert.deepEqual(s.values, { email: "old@beta.io", "q.size": "1-10", "q.topics": ["SEO"] });
  assert.deepEqual(s.hidden, { utm_source: "google", first_utm_source: "bing", page: "https://acme.com/guide", referrer: "https://google.com/" });
  assert.deepEqual(s.consent, { given: true, wording: "I'd like to get Product news emails. I can unsubscribe at any time." });
  assert.ok(s.contact_id);
  assert.equal(s.spam, false);
  const spam = (await q(`select spam, spam_reason from submissions where id = $1`, [oldSpam]))[0];
  assert.deepEqual(spam, { spam: true, spam_reason: "honeypot" });
  const c = await pool.connect();
  try {
    await c.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user]);
    const list = (await c.query(`select forms_list($1) as l`, [ws])).rows[0].l as { id: string; fills: number }[];
    assert.equal(list.find((r) => r.id === guide)?.fills, 1);
  } finally {
    await c.query(`select set_config('request.jwt.claim.sub', '', false)`);
    c.release();
  }
});

test("a new fill on an upgraded form joins the topic on opt-in and logs the event the way 041 did", async () => {
  const rpc = pgRpc(pool);
  const f = (await q(`select form_public($1) as f`, [guide]))[0].f as PublicForm;
  assert.equal(f.status, "live");
  const ids = Object.fromEntries(allFields(f.body).map((x) => [x.key, x.id]));
  const r = await acceptFill(
    rpc,
    f,
    {
      v: 1,
      version: f.version,
      key: "upgrade-fill-0000001",
      answers: { [ids.email]: "ana@acme.com", [ids.first_name]: "ana", [ids["q.size"]]: "11-50", [ids.country]: "Germany", [ids.phone]: "+49 30 1234567" },
      hidden: { [ids["q.src"]]: "linkedin", [ids["q.plan"]]: "pro" },
      consent: { given: true },
      page: "https://acme.com/guide?utm_source=linkedin&email=ana@acme.com",
      referrer: "https://www.linkedin.com/",
      utm: { utm_source: "linkedin", gclid: "abc" },
      first: { utm_source: "bing" },
      ms: 5000,
      trap: "",
    },
    await ctxFor(pool, ws),
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const cid = (await q(`select contact_id from submissions where id = $1`, [r.body.id]))[0].contact_id;
  const contact = (await q(`select first_name, country from contacts where id = $1`, [cid]))[0];
  assert.deepEqual(contact, { first_name: "Ana", country: "DE" });
  assert.equal((await q(`select basis from consents where contact_id = $1`, [cid]))[0].basis, "opt_in");
  assert.equal((await q(`select status from subscriptions where contact_id = $1 and topic_id = $2`, [cid, topic]))[0]?.status, "subscribed");
  const e = (await q(`select data from contact_events where contact_id = $1 and kind = 'form.submitted'`, [cid]))[0].data;
  assert.equal(e.form_id, guide);
  assert.equal(e.form_name, "Guide");
  assert.equal(e.submission_id, r.body.id);
  assert.equal(e.answers.email, "ana@acme.com");
  assert.deepEqual(e.utm, { utm_source: "linkedin", gclid: "abc", first_utm_source: "bing" });
  assert.equal(e.page, "https://acme.com/guide?utm_source=linkedin");
  assert.equal(e.referrer, "https://www.linkedin.com/");
});

test("a notice form keeps the lead on legitimate interest and joins no topic", async () => {
  const f = (await q(`select form_public($1) as f`, [demo]))[0].f as PublicForm;
  const ids = Object.fromEntries(allFields(f.body).map((x) => [x.key, x.id]));
  const r = await acceptFill(pgRpc(pool), f, { v: 1, version: f.version, key: "upgrade-fill-0000002", answers: { [ids.email]: "bo@acme.com" }, ms: 5000, trap: "" }, await ctxFor(pool, ws));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const cid = (await q(`select contact_id from submissions where id = $1`, [r.body.id]))[0].contact_id;
  const consent = (await q(`select basis, status, wording from consents where contact_id = $1`, [cid]))[0];
  assert.deepEqual(consent, { basis: "legitimate_interest", status: "granted", wording: "By sending this, you agree we may email you about our products. You can unsubscribe at any time." });
  assert.equal((await q(`select count(*)::int n from subscriptions where contact_id = $1`, [cid]))[0].n, 0);
});
