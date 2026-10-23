// A form field's overwrite policy on a real database (docs/form-studio.md 2.1 "Data", supabase/migrations/
// 051_form_data.sql): only-fill-if-empty treats "" like null, keeps a value that's there; Overwrite replaces even a
// value a person set by hand; Never leaves an existing contact alone but still fills a brand-new one, also when two
// fills for that new email land at once; and a fill without a policy merges by field order exactly as before.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import pg from "pg";
import { uuid7 } from "../../collect/ids.ts";
import { checkForm, emptyForm, type Form } from "../../src/lib/forms/schema.ts";
import { prepareSubmit, type SubmitArgs } from "../../src/lib/forms/submit.ts";
import { ctxFor } from "../../worker-intel/jobs/imports.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 6 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

async function setup(name: string) {
  const ws = uuid7();
  const user = uuid7();
  await q(`insert into workspaces (id, name) values ($1, $2)`, [ws, name]);
  await q(`insert into auth.users (id, email) values ($1, $2)`, [user, `${user}@t.io`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, user]);
  await q(`insert into fields (workspace_id, object, key, label, type) values ($1, 'contact', 'budget', 'Budget', 'number'), ($1, 'contact', 'notes', 'Notes', 'text')`, [ws]);
  const r = checkForm(
    {
      ...emptyForm(),
      steps: [
        {
          id: "s1",
          fields: [
            { id: "e", key: "email", type: "email", label: "Work email", required: true },
            { id: "n", key: "name", type: "text", label: "Name", required: false },
            { id: "t", key: "title", type: "text", label: "Title", required: false },
            { id: "p", key: "phone", type: "phone", label: "Phone", required: false, overwrite: "never" },
            { id: "c", key: "company", type: "text", label: "Company", required: false, overwrite: "always" },
            { id: "b", key: "f.budget", type: "number", label: "Budget", required: false },
            { id: "o", key: "f.notes", type: "text", label: "Notes", required: false, overwrite: "always" },
          ],
        },
      ],
    },
    { custom: [{ key: "budget" }, { key: "notes" }] },
  );
  if ("errors" in r) throw new Error(r.errors.join(" "));
  const id = (await q(`insert into forms (workspace_id, name, draft) values ($1, 'Data', $2) returning id`, [ws, r.form]))[0].id as string;
  const version = (await q(`select form_publish($1, $2, $3) as v`, [id, user, r.form]))[0].v as number;
  return { ws, f: { id, form: r.form, version } };
}

type Live = { id: string; form: Form; version: number };

async function args(f: Live, ws: string, answers: Record<string, string>) {
  const r = prepareSubmit(f.form, f.version, { v: 1, version: f.version, key: "k".repeat(16) + uuid7().replace(/-/g, "").slice(0, 20), answers, ms: 5000 }, await ctxFor(pool, ws));
  if (!("args" in r)) throw new Error(JSON.stringify(r));
  return r.args;
}

const run = async (f: Live, a: SubmitArgs) =>
  (await q(`select form_submit($1, $2, $3, $4, $5, $6, $7, $8, $9, false) as r`, [f.id, a.p_version, a.p_idem, a.p_values, a.p_hidden, a.p_contact, a.p_consent, a.p_country, a.p_spam]))[0].r as {
    id: string;
    contact_id: string;
  };

/** A contact set the way a person does it by hand: the highest-ranked source. */
async function byHand(ws: string, row: Record<string, unknown>) {
  const out = (await q(`select contacts_upsert($1, 'manual', $2) as r`, [ws, JSON.stringify([{ email_class: "work", fields: {}, ...row }])]))[0].r as { ids: string[] };
  return out.ids[0];
}

const contact = async (id: string) =>
  (await q(`select c.first_name, c.last_name, c.title, c.phone, c.fields, co.name as company, co.domain from contacts c left join companies co on co.id = c.company_id where c.id = $1`, [id]))[0];

test("only fill if empty: an empty string counts as empty, the same as nothing at all", async () => {
  const { ws, f } = await setup("data-empty");
  const a = await byHand(ws, { email: "a@acme.com", email_clean: "a@acme.com", first_name: "A" });
  const b = await byHand(ws, { email: "b@acme.com", email_clean: "b@acme.com", first_name: "B" });
  // Values blanked outside contacts_upsert (which never stores ""): an old import, a hand-written fix.
  await q(`update contacts set title = '', fields = fields || '{"budget": ""}' where id = $1`, [b]);
  for (const email of ["a@acme.com", "b@acme.com"]) await run(f, await args(f, ws, { e: email, t: "CTO", b: "5000" }));
  for (const id of [a, b]) {
    const c = await contact(id);
    assert.equal(c.title, "CTO");
    assert.equal(c.fields.budget, 5000);
  }
});

test("a contact a person already filled: only-if-empty keeps theirs, Overwrite replaces it, Never leaves it, names always win", async () => {
  const { ws, f } = await setup("data-existing");
  const id = await byHand(ws, { email: "ana@acme.com", email_clean: "ana@acme.com", first_name: "Anna", title: "VP Sales", phone: "+1 111 111 1111", company_name: "OldCo", fields: { notes: "old", budget: 100 } });
  const s = await run(f, await args(f, ws, { e: "ana@acme.com", n: "Ana Diaz", t: "CTO", p: "+1 415 555 0132", c: "Acme", b: "5000", o: "new" }));
  assert.equal(s.contact_id, id);
  const c = await contact(id);
  assert.equal(c.title, "VP Sales");
  assert.equal(c.fields.budget, 100);
  assert.equal(c.phone, "+1 111 111 1111");
  assert.equal(c.first_name, "Ana");
  assert.equal(c.last_name, "Diaz");
  assert.equal(c.fields.notes, "new");
  assert.equal(c.company, "Acme");
  // The forced changes are in the history with the form as their source, like any other change.
  const h = await q(`select key, old, new, source from field_history where record_id = $1 and source = 'form'`, [id]);
  assert.deepEqual(h.map((x) => x.key as string).sort(), ["company", "f.notes", "first_name", "last_name"]);
  assert.deepEqual(h.find((x) => x.key === "first_name")!.old, "Anna");
  const src = (await q(`select field_sources from contacts where id = $1`, [id]))[0].field_sources;
  assert.equal(src.first_name.s, "form");
  assert.equal(src.title.s, "manual");
});

test("Never still fills a brand-new contact, and two fills for that new email at once make one contact the second doesn't change", async () => {
  const { ws, f } = await setup("data-new");
  const s = await run(f, await args(f, ws, { e: "new@acme.com", p: "+1 415 555 0100", t: "CEO" }));
  const c = await contact(s.contact_id);
  assert.ok(c.phone, "a new contact gets the Never field's value");
  assert.equal(c.title, "CEO");

  for (let round = 0; round < 5; round++) {
    const email = `race${round}@acme.com`;
    const [x, y] = await Promise.all([args(f, ws, { e: email, p: "+1 415 555 0101" }), args(f, ws, { e: email, p: "+1 415 555 0202" })]);
    const [rx, ry] = await Promise.all([run(f, x), run(f, y)]);
    assert.equal(rx.contact_id, ry.contact_id);
    assert.equal((await q(`select count(*)::int n from contacts where workspace_id = $1 and email_clean = $2`, [ws, email]))[0].n, 1);
    const phone = (await contact(rx.contact_id)).phone;
    assert.ok([x.p_contact!.phone, y.p_contact!.phone].includes(phone));
    // Whichever came second found the contact there and left its phone alone.
    assert.equal((await q(`select count(*)::int n from field_history where record_id = $1 and key = 'phone'`, [rx.contact_id]))[0].n, 0);
  }
});

test("a fill without a policy (sent before this change) merges by field order exactly as before", async () => {
  const { ws, f } = await setup("data-legacy");
  const manual = await byHand(ws, { email: "m@acme.com", email_clean: "m@acme.com", title: "VP" });
  const imported = (await q(`select contacts_upsert($1, 'csv', $2) as r`, [ws, JSON.stringify([{ email: "i@acme.com", email_clean: "i@acme.com", email_class: "work", title: "VP", fields: {} }])]))[0].r.ids[0] as string;
  for (const email of ["m@acme.com", "i@acme.com"]) {
    const a = await args(f, ws, { e: email, t: "CTO" });
    delete a.p_contact!.overwrite;
    await run(f, a);
  }
  // A person's value outranks a form's; a form's outranks an import's.
  assert.equal((await contact(manual)).title, "VP");
  assert.equal((await contact(imported)).title, "CTO");
  // With the policy, the import's value is kept: only fill if empty.
  const again = (await q(`select contacts_upsert($1, 'csv', $2) as r`, [ws, JSON.stringify([{ email: "j@acme.com", email_clean: "j@acme.com", email_class: "work", title: "VP", fields: {} }])]))[0].r.ids[0] as string;
  await run(f, await args(f, ws, { e: "j@acme.com", t: "CTO" }));
  assert.equal((await contact(again)).title, "VP");
});
