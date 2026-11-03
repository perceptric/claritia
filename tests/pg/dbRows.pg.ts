// PostgreSQL as a form destination on a real database (docs/integrations-plan.md step 2b): the table made, columns
// added as questions are, columns the team added or changed kept, one row per fill even when ten fills land at once,
// a run again after a timeout, a table the team made without a key on fill_id, and a schema in the name.
// Run with PG_URL pointing at an empty database: PG_URL=postgres://postgres:postgres@localhost/rows_test
process.env.SECRETS_KEY ||= "test-secrets-key-that-is-long-enough-1234";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";
import { appendRow, prepareTable } from "../../src/lib/sources/dbRows.ts";
import { makeCtx } from "../../src/lib/sources/ctx.ts";
import type { FillRow, SourceRow } from "../../src/lib/sources/types.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const u = new URL(url);
const pool = new pg.Pool({ connectionString: url, max: 4 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

const source: SourceRow = { id: randomUUID(), workspace_id: "w", kind: "postgres", name: "PostgreSQL", account: "a", status: "active", settings: {}, cursors: {}, push_cursor: null };
const creds = { type: "key" as const, values: { host: u.hostname, port: u.port || "5432", database: u.pathname.slice(1), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), ssl: "disable" } };
const ctx = () => makeCtx({ source, creds, sleep: async () => {}, local: true });
const row = (cells: FillRow["cells"], id = randomUUID()): FillRow => ({ id, at: "2026-11-03T10:15:00.000Z", form: "Demo request", cells });
const table = () => `t_${randomUUID().slice(0, 8)}`;

test("the table is made when it's picked, then each fill is a row with its answers as text", async () => {
  const t = table();
  assert.deepEqual(await prepareTable(ctx(), t), { id: t, name: t });
  const r = row([{ name: "Work email", value: "ana@acme.com" }, { name: "Notes", value: "=1+1" }]);
  assert.equal((await appendRow(ctx(), { id: t, name: t }, r, { retry: false })).externalId, `${t}/${r.id}`);
  const got = await q(`select fill_id, sent_at, form, work_email, notes from ${t}`);
  assert.deepEqual(got, [{ fill_id: r.id, sent_at: new Date("2026-11-03T10:15:00Z"), form: "Demo request", work_email: "ana@acme.com", notes: "=1+1" }]);
});

test("flaky: a new question adds a column; columns the team added or changed stay as they are", async () => {
  const t = table();
  await appendRow(ctx(), { id: t, name: t }, row([{ name: "Work email", value: "a@acme.com" }]), { retry: false });
  await q(`alter table ${t} add column status text default 'new', alter column work_email type varchar(320)`);
  await appendRow(ctx(), { id: t, name: t }, row([{ name: "Work email", value: "b@acme.com" }, { name: "Team size", value: "11-50" }]), { retry: false });
  const cols = await q("select column_name, data_type from information_schema.columns where table_name = $1 order by ordinal_position", [t]);
  assert.deepEqual(cols.map((c) => `${c.column_name}:${c.data_type}`), ["fill_id:text", "sent_at:timestamp with time zone", "form:text", "work_email:character varying", "status:text", "team_size:text"]);
  assert.deepEqual(await q(`select work_email, status, team_size from ${t} order by work_email`), [{ work_email: "a@acme.com", status: "new", team_size: null }, { work_email: "b@acme.com", status: "new", team_size: "11-50" }]);
});

test("flaky: ten fills at once on a new table, each with a new question, make one table and ten rows", async () => {
  const t = table();
  const rows = Array.from({ length: 10 }, (_, i) => row([{ name: "Work email", value: `p${i}@acme.com` }, { name: `Q${i % 3}`, value: String(i) }]));
  const results = await Promise.allSettled(rows.map((r) => appendRow(ctx(), { id: t, name: t }, r, { retry: false })));
  assert.deepEqual(results.filter((r) => r.status === "rejected").map((r) => String((r as PromiseRejectedResult).reason)), []);
  assert.equal(Number((await q(`select count(*) as n from ${t}`))[0]!.n), 10);
  const cols = (await q("select column_name from information_schema.columns where table_name = $1", [t])).map((c) => c.column_name).sort();
  assert.deepEqual(cols, ["fill_id", "form", "q0", "q1", "q2", "sent_at", "work_email"]);
});

test("flaky: the same fill sent twice (a run after a timeout, or two runs at once) is one row", async () => {
  const t = table();
  const r = row([{ name: "Work email", value: "ana@acme.com" }]);
  await appendRow(ctx(), { id: t, name: t }, r, { retry: false });
  await appendRow(ctx(), { id: t, name: t }, r, { retry: true });
  await Promise.all([appendRow(ctx(), { id: t, name: t }, r, { retry: false }), appendRow(ctx(), { id: t, name: t }, r, { retry: false })]);
  assert.equal(Number((await q(`select count(*) as n from ${t}`))[0]!.n), 1);
});

test("a table the team made with fill_id but no key on it still gets one row per fill", async () => {
  const t = table();
  await q(`create table ${t} (id serial primary key, fill_id text, sent_at timestamptz, form text)`);
  const r = row([{ name: "Work email", value: "ana@acme.com" }]);
  await appendRow(ctx(), { id: t, name: t }, r, { retry: false });
  await appendRow(ctx(), { id: t, name: t }, r, { retry: false });
  assert.equal(Number((await q(`select count(*) as n from ${t}`))[0]!.n), 1);
  const bad = table();
  await q(`create table ${bad} (id serial primary key, email text)`);
  await assert.rejects(prepareTable(ctx(), bad), /has no fill_id column/);
});

test("a schema in the name: the table is made there", async () => {
  await q("create schema if not exists crm");
  const t = `crm.${table()}`;
  await prepareTable(ctx(), t);
  await appendRow(ctx(), { id: t, name: t }, row([{ name: "Work email", value: "ana@acme.com" }]), { retry: false });
  assert.equal(Number((await q(`select count(*) as n from ${t}`))[0]!.n), 1);
});

test("a wrong password is a sign-in error", async () => {
  const c = makeCtx({ source, creds: { type: "key", values: { ...creds.values, password: "wrong" } }, sleep: async () => {}, local: true });
  await assert.rejects(appendRow(c, { id: "x", name: "x" }, row([]), { retry: false }), (e: Error) => e.name === "AuthError" || e.constructor.name === "AuthError");
});
