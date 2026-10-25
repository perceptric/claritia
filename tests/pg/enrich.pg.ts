// Enrichment on a real database (docs/enrich-workflows-reports.md 1.5): two lookups at the last credit, a vendor that
// answers 429, vendor values that never overwrite a person or the CRM, the re-look days, new contacts queued only from
// the team's chosen sources, erasure clearing the shared cache, fill before submit on a live form, and qualify (rules
// first, the model only on a miss, never for spam, never an outcome that isn't the team's).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";
import { enrichContact, knownForEmail, qualifyContact } from "../../src/lib/enrich/server.ts";
import type { Ask } from "../../src/lib/enrich/qualify.ts";
import { checkForm, emptyForm } from "../../src/lib/forms/schema.ts";
import { acceptFill, type PublicForm } from "../../src/lib/forms/submit.ts";
import { ctxFor } from "../../worker-intel/jobs/imports.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 8 });
const rpc = pgRpc(pool);
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

const SECRET = "enrich-test-secret-0123456789-abcdef";

async function workspace(o: { cap?: number } = {}) {
  const ws = randomUUID();
  const u = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, 'Acme')`, [ws]);
  await q(`insert into auth.users (id, email) values ($1, $2)`, [u, `${u}@t.io`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, u]);
  await q(`insert into enrich_settings (workspace_id, credit_cap) values ($1, $2)`, [ws, o.cap ?? 100]);
  return { ws, user: u };
}

const domainOf = () => `co${randomUUID().slice(0, 8)}.com`;
async function contact(ws: string, o: { email?: string; source?: string; title?: string } = {}) {
  const email = o.email ?? `dana@${domainOf()}`;
  const r = await q(`select contacts_upsert($1, $2, $3) r`, [ws, o.source ?? "form", JSON.stringify([{ email, email_clean: email, email_class: email.endsWith("@gmail.com") ? "free" : "work", first_name: "Dana", ...(o.title ? { title: o.title } : {}) }])]);
  return { id: r[0].r.ids[0] as string, email };
}

/** Vendors over fetch: Coresignal and People Data Labs answers by URL, counting each call. */
function vendors(o: { pdl?: number | object; coresignal?: number | object } = {}) {
  const calls: string[] = [];
  const answer = (v: number | object | undefined) => (typeof v === "number" ? new Response("{}", { status: v }) : new Response(JSON.stringify(v ?? {}), { status: 200 }));
  const fetcher = (async (u: string) => {
    if (u.includes("peopledatalabs")) {
      calls.push("pdl");
      return answer(o.pdl === undefined ? { data: { job_title: "vp of sales", job_title_levels: ["vp"], job_title_role: "sales", location_country: "united states" } } : typeof o.pdl === "number" ? o.pdl : { data: o.pdl });
    }
    calls.push("coresignal");
    return answer(o.coresignal ?? { name: "Acme", size_employees_count: 180, industry: "Software", location_hq_country_iso_2: "us", founded: "2015" });
  }) as unknown as typeof fetch;
  return { calls, opts: { keys: { coresignal: "cs", pdl: "pdl" }, fetcher, mx: async () => "yes" as const, secret: SECRET } };
}

test("two lookups at the last credit: one takes it, the other is refused", async () => {
  const { ws } = await workspace({ cap: 1 });
  const results = await Promise.all([q(`select enrich_spend($1, 1) ok`, [ws]), q(`select enrich_spend($1, 1) ok`, [ws])]);
  assert.deepEqual(results.map((r) => r[0].ok).sort(), [false, true]);
  await q(`select enrich_refund($1, 1)`, [ws]);
  assert.equal((await q(`select enrich_spend($1, 1) ok`, [ws]))[0].ok, true, "a refunded credit can be used again");
});

test("a lookup fills the contact and its company with history; a 429 from the person vendor is skipped and costs nothing", async () => {
  const { ws } = await workspace();
  const c = await contact(ws);
  const v = vendors({ pdl: 429 });
  const r = await enrichContact(rpc, c.id, { ...v.opts, trigger: "new" });
  assert.deepEqual(r.steps.filter((s) => s.step === "pdl" || s.step === "coresignal").map((s) => `${s.step}:${s.result}`), ["coresignal:hit", "pdl:error"]);
  assert.equal(r.credits, 1);
  const co = (await q(`select co.name, co.industry, co.size, co.employees, co.founded, co.field_sources->'industry'->>'s' src from contacts c join companies co on co.id = c.company_id where c.id = $1`, [c.id]))[0];
  assert.deepEqual({ ...co }, { name: "Acme", industry: "Software", size: "51-200", employees: 180, founded: 2015, src: "coresignal" });
  assert.equal((await q(`select credits from enrich_usage where workspace_id = $1`, [ws]))[0].credits, 1, "the failed call's credit came back");
  assert.equal((await q(`select count(*)::int n from enrich_runs where contact_id = $1`, [c.id]))[0].n, 1);
  // Looked up lately: a second run is skipped unless forced.
  assert.equal((await enrichContact(rpc, c.id, { ...v.opts, trigger: "new" })).skipped, "looked up lately");
});

test("a vendor never overwrites what a person or the CRM wrote, and fills what's blank", async () => {
  const { ws, user } = await workspace();
  const c = await contact(ws, { source: "hubspot", title: "Head of Revenue" });
  await q(`select contact_update($1, 'manual', $2, $3)`, [c.id, JSON.stringify({ country: "CA" }), user]);
  const v = vendors();
  await enrichContact(rpc, c.id, { ...v.opts, trigger: "again", force: true });
  const row = (await q(`select title, country, seniority, department from contacts where id = $1`, [c.id]))[0];
  assert.equal(row.title, "Head of Revenue", "the CRM's title stays");
  assert.equal(row.country, "CA", "a person's edit stays");
  assert.equal(row.seniority, "VP");
  assert.equal(row.department, "Sales");
  const h = await q(`select key, source from field_history where record_id = $1 and source = 'pdl' order by key`, [c.id]);
  assert.deepEqual(h.map((x) => x.key), ["department", "seniority"]);
});

test("new contacts are queued for a lookup from forms, never from imports or for personal emails", async () => {
  const { ws } = await workspace();
  const form = await contact(ws, { source: "form" });
  const imp = await contact(ws, { source: "csv" });
  const free = await contact(ws, { source: "form", email: `x${randomUUID().slice(0, 5)}@gmail.com` });
  const jobs = await q(`select key from jobs where workspace_id = $1 and kind = 'enrich_contact'`, [ws]);
  assert.deepEqual(jobs.map((j) => j.key), [form.id]);
  assert.ok(imp.id && free.id);
  await q(`update enrich_settings set "on" = false where workspace_id = $1`, [ws]);
  await contact(ws, { source: "form" });
  assert.equal((await q(`select count(*)::int n from jobs where workspace_id = $1 and kind = 'enrich_contact'`, [ws]))[0].n, 1, "off means none");
});

test("an erasure clears the person from the shared cache, and they're never cached again", async () => {
  const { ws } = await workspace();
  const email = `erase${randomUUID().slice(0, 6)}@${domainOf()}`;
  await q(`select enrich_cache_put('person', $1, 'pdl', '{"title":"CEO"}')`, [email]);
  assert.equal((await q(`select count(*)::int n from person_cache where email_clean = $1`, [email]))[0].n, 1);
  await q(`insert into erasures (workspace_id, value_hash) values ($1, sha256(convert_to($2, 'UTF8')))`, [ws, email]);
  assert.equal((await q(`select count(*)::int n from person_cache where email_clean = $1`, [email]))[0].n, 0);
  await q(`select enrich_cache_put('person', $1, 'pdl', '{"title":"CEO"}')`, [email]);
  assert.equal((await q(`select count(*)::int n from person_cache where email_clean = $1`, [email]))[0].n, 0, "a stale copy never comes back");
});

test("fill before submit: known fields hide, a hidden required field doesn't block the send, and the contact gets the value", async () => {
  const { ws, user } = await workspace();
  const raw = {
    ...emptyForm(),
    steps: [
      {
        id: "s1",
        fields: [
          { id: "em", key: "email", type: "email", label: "Email", required: true },
          { id: "co", key: "company", type: "text", label: "Company", required: true },
          { id: "ti", key: "title", type: "text", label: "Job title", required: true },
        ],
      },
    ],
    spam: { minSeconds: 0, turnstile: false },
    enrich: { hideKnown: true, fields: ["company", "title"] },
  };
  const r = checkForm(raw);
  if ("errors" in r) throw new Error(r.errors.join(" "));
  const id = (await q(`insert into forms (workspace_id, name, draft) values ($1, 'Demo', $2) returning id`, [ws, r.form]))[0].id as string;
  await q(`select form_publish($1, $2, $3)`, [id, user, r.form]);
  const f = (await q(`select form_public($1) as f`, [id]))[0].f as PublicForm;

  const email = `dana@${domainOf()}`;
  const v = vendors();
  // Leaving the email field: the lookup knows both, and answers keys only.
  const keys = await knownForEmail(rpc, ws, email, ["company", "title"], { ...v.opts, budgetMs: 3000 });
  assert.deepEqual(keys.sort(), ["company", "title"]);
  // The send leaves both out; the server checks them again against the cache and lets them off.
  const res = await acceptFill(rpc, f, { v: 1, version: f.version, key: `k${randomUUID().replace(/-/g, "")}`.slice(0, 32), answers: { em: email }, known: ["co", "ti"], ms: 5000, trap: "" }, await ctxFor(pool, ws), { secret: SECRET });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  // Filled from the cache right after the send (it has 300 ms before the router; a slow database finishes it after).
  const read = async () => (await q(`select c.title, co.name from contacts c left join companies co on co.id = c.company_id where c.workspace_id = $1 and c.email_clean = $2`, [ws, email]))[0];
  for (let i = 0; i < 30 && !(await read())?.name; i++) await new Promise((r) => setTimeout(r, 100));
  const c = await read();
  assert.equal(c.title, "Vp Of Sales");
  assert.equal(c.name, "Acme");
  // A browser that claims a field is known when nothing is known about the person is still asked for it.
  const stranger = `nobody@${domainOf()}`;
  const bad = await acceptFill(rpc, f, { v: 1, version: f.version, key: `k${randomUUID().replace(/-/g, "")}`.slice(0, 32), answers: { em: stranger }, known: ["co", "ti"], ms: 5000, trap: "" }, await ctxFor(pool, ws), { secret: SECRET });
  assert.equal(bad.status, 400);
  assert.ok((bad.body.errors as Record<string, string>).co);
});

async function qualifyOn(ws: string, rules: object[] = []) {
  await q(`insert into qualify_settings (workspace_id, "on", outcomes, rules) values ($1, true, $2, $3)`, [
    ws,
    JSON.stringify([{ label: "Qualified", meaning: "Fits" }, { label: "Not a fit", meaning: "Doesn't" }, { label: "Needs a look", meaning: "Unclear" }]),
    JSON.stringify(rules),
  ]);
}

const counting = (answer: unknown): { ask: Ask; calls: () => number } => {
  let n = 0;
  return { ask: async () => (n++, { output: answer, usage: { input: 1500, output: 120, cache_read: 0, cache_write: 0 } }), calls: () => n };
};

test("qualify: a rule decides without the model; a model answer is kept and replays from the cache without calling it", async () => {
  const { ws } = await workspace();
  await qualifyOn(ws, [{ id: "big", outcome: "Qualified", match: "all", conds: [{ field: "contact.title", op: "contains", value: "ceo" }] }]);
  const ceo = await contact(ws, { title: "CEO" });
  const m = counting({ outcome: "Not a fit", reason: "Never called", facts: [] });
  assert.equal((await qualifyContact(rpc, ceo.id, { ask: m.ask })).decision?.by, "big");
  assert.equal(m.calls(), 0);

  const a = counting({ outcome: "Qualified", reason: "A sales leader at a software company", facts: ["VP Sales"] });
  const lead = await contact(ws, { title: "VP Sales" });
  const r = await qualifyContact(rpc, lead.id, { ask: a.ask });
  assert.equal(r.status, "decided");
  assert.equal(a.calls(), 1);
  const row = (await q(`select qualify_outcome, qualify_by, qualify_reason from contacts where id = $1`, [lead.id]))[0];
  assert.deepEqual({ ...row }, { qualify_outcome: "Qualified", qualify_by: "ai", qualify_reason: "A sales leader at a software company" });
  assert.equal((await q(`select count(*)::int n from contact_events where contact_id = $1 and kind = 'lead.outcome'`, [lead.id]))[0].n, 1);
  // The same facts again: the step cache answers and the model isn't called.
  const again = await qualifyContact(rpc, lead.id, { ask: a.ask, force: true });
  assert.equal(again.cached, true);
  assert.equal(a.calls(), 1);
});

test("qualify on a flaky model: an outcome that isn't the team's, or no answer in time, leaves no outcome; spam never reaches it", async () => {
  const { ws } = await workspace();
  await qualifyOn(ws);
  const odd = counting({ outcome: "Hot lead", reason: "Made up", facts: [] });
  const c1 = await contact(ws, { title: "Engineer" });
  assert.equal((await qualifyContact(rpc, c1.id, { ask: odd.ask })).status, "none");
  assert.equal((await q(`select qualify_outcome from contacts where id = $1`, [c1.id]))[0].qualify_outcome, null);
  // Not kept in the cache, so the next try asks again.
  await qualifyContact(rpc, c1.id, { ask: odd.ask });
  assert.equal(odd.calls(), 2);

  const slow: Ask = (_s, _u, _x, signal) => new Promise((_, rej) => signal.addEventListener("abort", () => rej(new Error("aborted"))));
  const c2 = await contact(ws, { title: "Director" });
  const t0 = Date.now();
  assert.equal((await qualifyContact(rpc, c2.id, { ask: slow, timeoutMs: 200 })).status, "none");
  assert.ok(Date.now() - t0 < 2000);

  const never = counting({ outcome: "Qualified", reason: "x", facts: [] });
  const spam = await contact(ws, { title: "Owner" });
  await q(`update contacts set route_status = 'spam' where id = $1`, [spam.id]);
  assert.equal((await qualifyContact(rpc, spam.id, { ask: never.ask })).status, "spam");
  assert.equal(never.calls(), 0);
});
