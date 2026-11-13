// Lists that fill from forms on a real database (supabase/migrations/157_list_forms_csv.sql): a fill joins its form's
// lists, and that starts "Joined a list"; spam and test fills don't; a held fill joins once it's released; the link
// is the workspace's own; the import history is the members'.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 4 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
const one = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await q(sql, p))[0] as T;
after(() => pool.end());
const key = () => randomBytes(12).toString("hex");

async function setup() {
  const ws = randomUUID();
  const user = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, 'Juniper')`, [ws]);
  await q(`insert into auth.users (id, email) values ($1, $2)`, [user, `${user}@t.io`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')`, [ws, user]);
  const form = (await one<{ id: string }>(`insert into forms (workspace_id, name, status) values ($1, 'Class signup', 'live') returning id`, [ws])).id;
  const other = (await one<{ id: string }>(`insert into forms (workspace_id, name, status) values ($1, 'Private session', 'live') returning id`, [ws])).id;
  const list = (await one<{ id: string }>(`insert into lists (workspace_id, name) values ($1, 'Class signups') returning id`, [ws])).id;
  const person = async (name: string) => (await one<{ id: string }>(`insert into contacts (workspace_id, email, email_clean) values ($1, $2, $2) returning id`, [ws, `${name}@${ws.slice(0, 8)}.io`])).id;
  const fill = (f: string, contact: string | null, o: { spam?: boolean; test?: boolean } = {}) =>
    one<{ id: string }>(`insert into submissions (workspace_id, form_id, form_version, contact_id, idem_key, spam, test) values ($1, $2, 1, $3, $4, $5, $6) returning id`, [ws, f, contact, key(), o.spam ?? false, o.test ?? false]).then((x) => x.id);
  const set = (l: string, f: string, on: boolean, as = user) => one<{ r: boolean }>(`select set_config('request.jwt.claim.sub', $5, true), list_form_set($1, $2, $3, $4) r`, [ws, l, f, on, as]);
  const members = async () => (await q(`select c.email from list_members m join contacts c on c.id = m.contact_id where m.list_id = $1 order by c.email`, [list])).map((r) => (r.email as string).split("@")[0]);
  return { ws, user, form, other, list, person, fill, set, members };
}

test("a fill joins its form's lists and starts Joined a list; spam, test and other forms' fills don't", async () => {
  const s = await setup();
  await s.set(s.list, s.form, true);
  const [ana, ben, cy, dee] = [await s.person("ana"), await s.person("ben"), await s.person("cy"), await s.person("dee")];
  await s.fill(s.form, ana);
  await s.fill(s.form, ben, { spam: true });
  await s.fill(s.form, cy, { test: true });
  await s.fill(s.other, dee);
  await s.fill(s.form, ana);
  assert.deepEqual(await s.members(), ["ana"], "a second fill doesn't add her twice");
  assert.equal((await one<{ n: number }>(`select count(*)::int n from contact_events where contact_id = $1 and kind = 'list.joined'`, [ana])).n, 1);
  // Ben's fill was held as spam; releasing it (submission_release clears the mark) adds him.
  await q(`update submissions set spam = false where contact_id = $1`, [ben]);
  assert.deepEqual(await s.members(), ["ana", "ben"]);
  // A held fill gets its person later.
  const eve = await s.person("eve");
  const sid = await s.fill(s.form, null);
  await q(`update submissions set contact_id = $1 where id = $2`, [eve, sid]);
  assert.deepEqual(await s.members(), ["ana", "ben", "eve"]);
  // Off again: new fills stop joining; the people already in stay.
  await s.set(s.list, s.form, false);
  await s.fill(s.form, dee);
  assert.deepEqual(await s.members(), ["ana", "ben", "eve"]);
});

test("the link is the workspace's own; members read their links and imports, others don't", async () => {
  const a = await setup();
  const b = await setup();
  await assert.rejects(a.set(a.list, b.form, true), /Form not found/);
  await assert.rejects(a.set(b.list, a.form, true), /List not found/);
  await assert.rejects(a.set(a.list, a.form, true, b.user), /Workspace not found/);
  await a.set(a.list, a.form, true);
  await q(`insert into contact_import_log (workspace_id, list_id, list_name, file_name, rows_in, added) values ($1, $2, 'Class signups', 'mindbody.csv', 10, 9)`, [a.ws, a.list]);
  const seen = async (user: string) => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('role', 'authenticated', true)`, [user]);
      const links = (await c.query(`select count(*)::int n from list_forms where workspace_id = $1`, [a.ws])).rows[0].n as number;
      const log = (await c.query(`select count(*)::int n from contact_import_log where workspace_id = $1`, [a.ws])).rows[0].n as number;
      await c.query("rollback");
      return [links, log];
    } finally {
      c.release();
    }
  };
  assert.deepEqual(await seen(a.user), [1, 1]);
  assert.deepEqual(await seen(b.user), [0, 0]);
  // Deleting the list or the form takes the link with it; the history keeps the list's name.
  await q(`delete from lists where id = $1`, [a.list]);
  assert.equal((await one<{ n: number }>(`select count(*)::int n from list_forms where form_id = $1`, [a.form])).n, 0);
  assert.equal((await one<{ list_name: string }>(`select list_name from contact_import_log where workspace_id = $1`, [a.ws])).list_name, "Class signups");
});
