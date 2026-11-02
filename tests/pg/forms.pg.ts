// Forms on a real database (docs/form-templates.md): a template import makes its contact fields and the form in one
// go, a submission lands as a contact with its activity and the consent words, a later notice never lowers an
// opt-in, closed forms and scripts are turned away, and a field taken by another type gets a new key.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import pg from "pg";
import { uuid7 } from "../../collect/ids.ts";
import { templateById } from "../../src/lib/forms/catalog.ts";
import { applyRemap, planFields } from "../../src/lib/forms/fields.ts";
import { slugFor } from "../../src/lib/forms/schema.ts";
import { submitForm, type LiveForm } from "../../src/lib/forms/submit.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 4 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());
const rpc = pgRpc(pool);

let ws = "";
let user = "";
let form: LiveForm;

async function fieldsOf() {
  return (await q(`select key, label, type, options from fields where workspace_id = $1 and object = 'contact'`, [ws])) as { key: string; label: string; type: string; options: string[] }[];
}

async function importTemplate(id: string, status: "live" | "draft" = "live") {
  const t = templateById(id)!;
  const plan = planFields(t.schema, (await fieldsOf()) as never);
  const schema = applyRemap(t.schema, plan.remap);
  const { data, error } = await rpc("form_create", {
    p_ws: ws, p_user: user, p_name: t.name, p_slug: slugFor(t.name), p_schema: schema, p_settings: {}, p_template: t.id, p_version: t.version,
    p_phi: !!t.phi, p_status: status, p_fields: plan.create, p_extend: plan.extend,
  });
  if (error) throw new Error(error.message);
  return { id: data as string, schema, plan };
}

const ctx = async () => ({ custom: (await fieldsOf()) as never });
const submit = async (raw: Record<string, unknown>, opts: { region?: "strict" | "notice"; ticked?: boolean; ip?: string; f?: LiveForm } = {}) =>
  submitForm({ rpc, ctx: await ctx() }, { form: opts.f ?? form, raw, region: opts.region ?? "notice", country: opts.region === "strict" ? "DE" : "US", ticked: !!opts.ticked, meta: { page: "/demo" }, ipHash: opts.ip ?? null });

before(async () => {
  ws = uuid7();
  user = uuid7();
  await q(`insert into workspaces (id, name) values ($1, 'forms')`, [ws]);
  await q(`insert into auth.users (id, email) values ($1, $2)`, [user, `${user}@t.io`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, user]);
  // Someone made a "budget" field as plain text before, so the template's pick list must get its own key.
  await q(`insert into fields (workspace_id, object, key, label, type) values ($1, 'contact', 'budget', 'Budget', 'number')`, [ws]);
  const made = await importTemplate("saas.contact-sales");
  form = { id: made.id, workspace_id: ws, schema: made.schema, settings: {} };
});

test("importing a template makes its contact fields and the form together", async () => {
  const fields = await fieldsOf();
  const keys = fields.map((f) => f.key).sort();
  assert.ok(keys.includes("seats") && keys.includes("timeline"), "missing fields were made");
  assert.equal(fields.find((f) => f.key === "budget")!.type, "number", "the old field is untouched");
  const moved = fields.find((f) => f.key === "budget_2");
  assert.equal(moved?.type, "select", "the pick list got a new key");
  assert.ok(JSON.stringify(form.schema).includes('"f.budget_2"'), "the form points at the new key");
  const [row] = await q(`select status, template_id, published_at from forms where id = $1`, [form.id]);
  assert.equal(row.status, "live");
  assert.equal(row.template_id, "saas.contact-sales");
  assert.ok(row.published_at);
  assert.equal((await q(`select count(*)::int as n from form_template_uses where form_id = $1`, [form.id]))[0].n, 1);
});

test("a second import of the same template reuses the fields and makes a separate form", async () => {
  const before = (await fieldsOf()).length;
  const again = await importTemplate("saas.contact-sales");
  assert.notEqual(again.id, form.id);
  assert.equal((await fieldsOf()).length, before, "no duplicate fields");
  assert.deepEqual(again.plan.create, []);
});

test("a submission lands as a contact with activity, mapped fields and the notice as consent", async () => {
  const r = await submit({
    name: { first: "Ada", last: "Lovelace" },
    email: "ada@analytical.io",
    company: "Analytical",
    phone: "+1 415 555 0100",
    how_many_seats: 12,
    timeline: "Within a month",
    budget_per_year: "$15,000–$50,000",
  });
  assert.ok(r.ok, JSON.stringify(r));
  const [c] = await q(`select id, first_name, last_name, source, fields, company_id from contacts where workspace_id = $1 and email_clean = 'ada@analytical.io'`, [ws]);
  assert.equal(c.first_name, "Ada");
  assert.equal(c.source, "form");
  assert.equal(c.fields.seats, 12);
  assert.equal(c.fields.timeline, "Within a month");
  assert.equal(c.fields.budget_2, "$15,000–$50,000");
  assert.equal(c.fields.budget, undefined, "nothing landed in the number field");
  assert.ok(c.company_id, "the work email named the company");
  const [ev] = await q(`select kind, data from contact_events where contact_id = $1 and kind = 'form.submitted'`, [c.id]);
  assert.equal(ev.data.form_id, form.id);
  const [cons] = await q(`select basis, wording, source from consents where contact_id = $1 order by at desc limit 1`, [c.id]);
  assert.equal(cons.basis, "legitimate_interest");
  assert.equal(cons.source, "form");
  assert.match(cons.wording, /unsubscribe/);
  const [f] = await q(`select submissions, last_submission_at from forms where id = $1`, [form.id]);
  assert.equal(f.submissions, 1);
});

test("strict regions: no tick records none; a tick records the opt-in words; a later notice never lowers it", async () => {
  const base = { name: { first: "Eva" }, email: "eva@beispiel.de", company: "Beispiel" };
  assert.ok((await submit(base, { region: "strict" })).ok);
  const id = (await q(`select id from contacts where workspace_id = $1 and email_clean = 'eva@beispiel.de'`, [ws]))[0].id;
  const latest = async () => (await q(`select basis, wording from consents where contact_id = $1 order by at desc, id desc limit 1`, [id]))[0];
  assert.equal((await latest()).basis, "none");
  assert.ok((await submit(base, { region: "strict", ticked: true })).ok);
  assert.equal((await latest()).basis, "opt_in");
  assert.match((await latest()).wording, /Email me/);
  assert.ok((await submit(base, { region: "strict" })).ok);
  assert.equal((await latest()).basis, "opt_in", "an unticked box later doesn't undo the opt-in");
});

test("bad answers, disposable emails, closed forms and scripts are turned away", async () => {
  const missing = await submit({ email: "x@acme.com" });

  assert.ok(!missing.ok && "errors" in missing && missing.errors.name, "the name is required");
  const temp = await submit({ name: { first: "T" }, email: "t@mailinator.com", company: "T" });
  assert.ok(!temp.ok && "errors" in temp && /Temporary/.test(temp.errors.email));
  assert.equal((await q(`select count(*)::int as n from contacts where email_clean = 't@mailinator.com'`))[0].n, 0);

  const draft = await importTemplate("general.contact-us", "draft");
  const closed = await submit({ name: { first: "D" }, email: "d@acme.com", whats_this_about: "Sales", message: "hi" }, { f: { id: draft.id, workspace_id: ws, schema: draft.schema, settings: {} } });
  assert.ok(!closed.ok && "status" in closed && closed.status === 429);
  assert.equal((await q(`select count(*)::int as n from contacts where email_clean = 'd@acme.com'`))[0].n, 0, "no contact from a closed form");

  const ip = "f".repeat(64);
  let last;
  for (let i = 0; i < 21; i++) last = await submit({ name: { first: `S${i}` }, email: `s${i}@spam-co.com`, company: "Spam" }, { ip });
  assert.ok(last && !last.ok && "status" in last && last.status === 429, "the 21st from one network in 10 minutes stops");
  assert.equal((await q(`select count(*)::int as n from contacts where email_clean = 's20@spam-co.com'`))[0].n, 0, "and makes no contact");
});

test("a quiz stores its score; an anonymous survey stores answers with no contact", async () => {
  const quiz = await importTemplate("it.security-quiz");
  const qf = { id: quiz.id, workspace_id: ws, schema: quiz.schema, settings: {} };
  const keys = quiz.schema.pages[0].fields.filter((f) => f.kind === "yes_no").map((f) => f.key);
  const raw: Record<string, unknown> = { email: "it@acme.com" };
  keys.forEach((k, i) => (raw[k] = i < 3));
  const r = await submit(raw, { f: qf });
  assert.ok(r.ok && r.score === 3, JSON.stringify(r));
  assert.equal((await q(`select score from form_submissions where id = $1`, [(r as { id: string }).id]))[0].score, 3);

  const survey = await importTemplate("hr.exit-interview");
  const sf = { id: survey.id, workspace_id: ws, schema: survey.schema, settings: {} };
  const s = await submit({ main_reason_for_leaving: "Growth" }, { f: sf });
  assert.ok(s.ok && s.contactId === null);
});
