// PostgreSQL and MySQL as form destinations (docs/integrations-plan.md step 2b): a row per fill in a table made if
// missing. Here MySQL runs against a fake connection that records each statement; tests/pg/dbRows.pg.ts runs the same
// on a real Postgres. The flaky cases: another fill adding the same column at the same moment; a run again after a
// timeout; the sign-in turned down; the database down; a private host.
process.env.SECRETS_KEY ||= "test-secrets-key-that-is-long-enough-1234";
import assert from "node:assert/strict";
import { test } from "node:test";
import { sendDelivery, type Taken } from "../src/lib/delivery/send.ts";
import { checkForm, emptyForm } from "../src/lib/forms/schema.ts";
import { seal } from "../src/lib/seal.ts";
import { CATALOG } from "../src/lib/sources/catalog.ts";
import { makeCtx } from "../src/lib/sources/ctx.ts";
import { appendRow, columnName, OPEN, prepareTable, rowColumns, tableName, type Db } from "../src/lib/sources/dbRows.ts";
import { connectorFor } from "../src/lib/sources/registry.ts";
import type { Creds, FillRow, SourceRow } from "../src/lib/sources/types.ts";

const SRC = "0190a0b0-0000-7000-8000-00000000000d";
const CREDS: Creds = { type: "key", values: { host: "db.acme.com", database: "crm", user: "claritia", password: "pw" } };
const source = (kind: string): SourceRow => ({ id: SRC, workspace_id: "w", kind, name: kind === "mysql" ? "MySQL" : "PostgreSQL", account: "a", status: "active", settings: {}, cursors: {}, push_cursor: null });
const ROW: FillRow = { id: "0190a0b0-0000-7000-8000-0000000000f2", at: "2026-11-03T10:15:00.000Z", form: "Demo request", cells: [{ name: "Work email", value: "ana@acme.com" }, { name: "Team size?", value: "11-50" }, { name: "Notes", value: "" }] };

/** A MySQL connection that answers from `columns` and records what it ran. */
function fakeMysql(o: { columns?: string[]; found?: boolean; fail?: (sql: string) => unknown }) {
  const ran: { sql: string; values?: unknown[] }[] = [];
  let ended = false;
  const db: Db = {
    async query(sql, values) {
      ran.push({ sql, values });
      const err = o.fail?.(sql);
      if (err) throw err;
      if (sql.includes("information_schema")) return (o.columns ?? ["fill_id", "sent_at", "form"]).map((name) => ({ COLUMN_NAME: name }));
      if (sql.startsWith("select 1")) return o.found ? [{ one: 1 }] : [];
      return [];
    },
    async end() {
      ended = true;
    },
  };
  OPEN.mysql = async () => db;
  return { ran, ended: () => ended };
}
/** The real openers, before the tests swap in fakes. */
const REAL = { ...OPEN };
const ctx = (kind = "mysql", local = true) => makeCtx({ source: source(kind), creds: CREDS, sleep: async () => {}, local });
const mysqlErr = (code: string, message: string) => Object.assign(new Error(message), { code });

test("PostgreSQL and MySQL take a row per fill; the read grants now allow writing a table", () => {
  for (const kind of ["postgres", "mysql"]) {
    const e = CATALOG.find((x) => x.kind === kind)!;
    assert.ok(e.rows && e.pushes, `${kind} takes rows`);
    assert.ok(connectorFor(kind)!.append, `${kind} appends`);
    assert.match(e.grant ?? "", /create/);
  }
  assert.ok(!connectorFor("redshift")!.append, "only the two built");
});

test("names: a table as typed or refused, a label as a column, two labels that make one name stay two", () => {
  assert.equal(tableName("postgres", " Crm.Leads "), "crm.leads");
  assert.equal(tableName("mysql", "crm.leads"), null, "MySQL takes the database from the connection");
  assert.equal(tableName("postgres", "leads; drop table x"), null);
  assert.equal(tableName("postgres", 'le"ads'), null);
  assert.equal(tableName("mysql", "9leads"), null);
  assert.equal(columnName("Work email"), "work_email");
  assert.equal(columnName("1. Budget (USD)?"), "c_1_budget_usd");
  assert.equal(columnName("Société"), "societe");
  assert.equal(columnName("???"), "question");
  assert.equal(columnName("x".repeat(80)).length, 63);
  const cols = rowColumns({ ...ROW, cells: [{ name: "Email", value: "a@b.co" }, { name: "E-mail", value: "c@d.co" }, { name: "Form", value: "x" }] });
  assert.deepEqual(cols.map((c) => c.name), ["fill_id", "sent_at", "form", "email", "e_mail", "form_2"]);
});

test("MySQL: the table made if missing, new columns as text, the row kept once by fill_id; the connection closed", async () => {
  const f = fakeMysql({ columns: ["fill_id", "sent_at", "form", "work_email"] });
  const r = await appendRow(ctx(), { id: "demo_fills", name: "demo_fills" }, ROW, { retry: false });
  assert.equal(r.externalId, `demo_fills/${ROW.id}`);
  const sqls = f.ran.map((x) => x.sql);
  assert.match(sqls[0]!, /^create table if not exists `demo_fills` \(fill_id varchar\(64\) not null primary key, sent_at datetime\(3\) not null, form varchar\(255\)\) character set utf8mb4$/);
  assert.deepEqual(sqls.filter((s) => s.startsWith("alter")), ["alter table `demo_fills` add column `team_size` text", "alter table `demo_fills` add column `notes` text"]);
  const ins = f.ran.at(-1)!;
  assert.equal(ins.sql, "insert into `demo_fills` (`fill_id`, `sent_at`, `form`, `work_email`, `team_size`, `notes`) values (?, ?, ?, ?, ?, ?) on duplicate key update fill_id = fill_id");
  assert.deepEqual(ins.values, [ROW.id, "2026-11-03 10:15:00.000", "Demo request", "ana@acme.com", "11-50", null], "values bound, never pasted; an empty answer is null");
  assert.ok(f.ended());
});

test("flaky: another fill adding the same column at the same moment is fine; a run again finds its row", async () => {
  const f = fakeMysql({ fail: (sql) => (sql.includes("add column `work_email`") ? mysqlErr("ER_DUP_FIELDNAME", "Duplicate column name 'work_email'") : null) });
  await appendRow(ctx(), { id: "demo_fills", name: "demo_fills" }, ROW, { retry: false });
  assert.ok(f.ran.at(-1)!.sql.startsWith("insert"), "the row still went in");
  const again = fakeMysql({ columns: ["fill_id", "sent_at", "form", "work_email", "team_size", "notes"], found: true });
  await appendRow(ctx(), { id: "demo_fills", name: "demo_fills" }, ROW, { retry: true });
  assert.ok(!again.ran.some((x) => x.sql.startsWith("insert")), "no second row");
  assert.deepEqual(again.ran.find((x) => x.sql.startsWith("select 1"))!.values, [ROW.id]);
});

test("a table without fill_id is refused when it's picked, before any fill", async () => {
  fakeMysql({ columns: ["id", "email"] });
  await assert.rejects(prepareTable(ctx(), "leads"), /leads has no fill_id column/);
  fakeMysql({});
  assert.deepEqual(await prepareTable(ctx(), " Demo_Fills "), { id: "demo_fills", name: "demo_fills" });
  await assert.rejects(prepareTable(ctx(), "demo fills"), /letters, digits and _/);
});

// A whole delivery, through the jobs queue's sendDelivery.
function delivery(o: { attempts?: number; target?: unknown; local?: boolean }) {
  const rpc = async (fn: string) => (fn === "source_load" ? { data: { source: source("mysql"), sealed: seal(JSON.stringify(CREDS)), hook_sealed: null, mappings: [] }, error: null } : { data: null, error: null });
  const form = checkForm({ ...emptyForm(), steps: [{ id: "s1", fields: [{ id: "e", key: "email", type: "email", label: "Work email" }] }] });
  if ("errors" in form) throw new Error(form.errors.join(" "));
  const t: Taken = {
    delivery: { id: "d1", attempts: o.attempts ?? 1, external_id: null, allow_duplicate: false },
    destination: { id: "x", kind: "source", source_id: SRC, name: "MySQL", config: { target: o.target === undefined ? { id: "demo_fills", name: "demo_fills" } : o.target }, mode: "upsert" },
    sealed: null,
    submission: { id: ROW.id, created_at: ROW.at, values: {}, hidden: {}, consent: null, test: false, form_version: 1, contact_id: null },
    form: { id: "f1", name: "Feedback", body: form.form },
    contact: null,
  };
  return sendDelivery(t, { run: { rpc: rpc as never, clean: async () => ({ custom: [] }), sleep: async () => {}, local: o.local ?? true } });
}

test("a delivery with no email writes its row", async () => {
  const f = fakeMysql({ columns: ["fill_id", "sent_at", "form", "work_email"] });
  assert.deepEqual(await delivery({}), { status: "done", externalId: `demo_fills/${ROW.id}` });
  assert.deepEqual(f.ran.at(-1)!.values, [ROW.id, "2026-11-03 10:15:00.000", "Feedback", null]);
});

test("flaky: signed out says sign in again; the database down or timing out is tried again; a refusal fails with its words", async () => {
  OPEN.mysql = async () => {
    throw mysqlErr("ER_ACCESS_DENIED_ERROR", "Access denied for user 'claritia'@'1.2.3.4' (using password: YES)");
  };
  const out = await delivery({});
  assert.equal(out.status, "failed");
  assert.match(out.status === "failed" ? out.error : "", /^Sign in to MySQL again: Access denied/);
  OPEN.mysql = async () => {
    throw mysqlErr("ECONNREFUSED", "connect ECONNREFUSED 1.2.3.4:3306");
  };
  assert.equal((await delivery({})).status, "retry");
  fakeMysql({ fail: (sql) => (sql.startsWith("insert") ? mysqlErr("PROTOCOL_SEQUENCE_TIMEOUT", "Query inactivity timeout") : null) });
  assert.equal((await delivery({})).status, "retry");
  fakeMysql({ fail: (sql) => (sql.startsWith("alter") ? mysqlErr("ER_TABLEACCESS_DENIED_ERROR", "ALTER command denied to user 'claritia' for table 'demo_fills'") : null) });
  assert.deepEqual(await delivery({}), { status: "failed", error: "ALTER command denied to user 'claritia' for table 'demo_fills'" });
  assert.deepEqual(await delivery({ target: { id: "bad name;", name: "x" } }), { status: "failed", error: "Pick the table again in the form's Sync tab." });
});

test("a host on a private network is refused before connecting", async () => {
  OPEN.mysql = REAL.mysql!;
  OPEN.postgres = REAL.postgres!;
  for (const kind of ["mysql", "postgres"]) {
    const c = makeCtx({ source: source(kind), creds: { type: "key", values: { host: "10.0.0.5", database: "crm", user: "u", password: "p" } } });
    await assert.rejects(appendRow(c, { id: "t", name: "t" }, ROW, { retry: false }), /private network/);
  }
});
