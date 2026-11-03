// PostgreSQL and MySQL as form destinations (docs/integrations-plan.md step 2b): a row per form fill in a table the
// team names in the form's Sync tab. The table is made if it isn't there (fill_id as its key, then sent_at and form),
// and each question adds a text column named from its label (Work email → work_email). Columns the team added or
// changed stay as they are. A fill's row is keyed by its Fill ID, so a delivery that runs again after a timeout adds
// nothing. Values are bound by the driver, never pasted into the SQL; names are checked to letters, digits and _.
// Hosts on private networks are refused, as for reads.

import pg from "pg";
import { hostIsPrivate } from "../privateNet.ts";
import { rowCells } from "./rows.ts";
import { AuthError, type Ctx, type FillRow, type RowTarget } from "./types.ts";

const TIMEOUT_MS = 30_000;
/** A table name: letters, digits and _, starting with a letter or _; Postgres may add a schema ("crm.leads"). */
const TABLE = /^[a-z_][a-z0-9_]{0,62}$/;

/** A table name as typed, cleaned to what's allowed, or null. */
export function tableName(kind: string, v: unknown): string | null {
  if (typeof v !== "string") return null;
  const parts = v.trim().toLowerCase().split(".");
  if (parts.length > (kind === "postgres" ? 2 : 1) || !parts.every((p) => TABLE.test(p))) return null;
  return parts.join(".");
}

/** A label as a column name: "Work email" → work_email, "1. Budget?" → c_1_budget; at most 63 characters. */
export function columnName(label: string): string {
  let n = label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!n) n = "question";
  if (!/^[a-z_]/.test(n)) n = `c_${n}`;
  return n.slice(0, 63).replace(/_+$/, "");
}

/** The fill's cells as columns: fill_id, sent_at, form, then each question; two labels that make one name get _2. */
export function rowColumns(row: FillRow): { name: string; value: string | null }[] {
  const out: { name: string; value: string | null }[] = [
    { name: "fill_id", value: row.id },
    { name: "sent_at", value: row.at },
    { name: "form", value: row.form },
  ];
  const used = new Set(out.map((c) => c.name));
  for (const c of rowCells(row).slice(3)) {
    const base = columnName(c.name);
    let n = base;
    for (let i = 2; used.has(n); i++) n = `${base.slice(0, 60)}_${i}`;
    used.add(n);
    out.push({ name: n, value: c.value === "" ? null : c.value });
  }
  return out;
}

/** What a connection needs to answer: one statement with bound values. */
export type Db = { query(sql: string, values?: unknown[]): Promise<Record<string, unknown>[]>; end(): Promise<void> };
type Dialect = { create: (t: string) => string; columns: (t: string) => [string, unknown[]]; add: (t: string, c: string) => string; find: (t: string) => string; insert: (t: string, cols: string[]) => string; insertPlain: (t: string, cols: string[]) => string; exists: (e: unknown) => boolean; noKey: (e: unknown) => boolean };

const pgQ = (id: string) => id.split(".").map((p) => `"${p}"`).join(".");
const PG: Dialect = {
  create: (t) => `create table if not exists ${pgQ(t)} (fill_id text primary key, sent_at timestamptz not null, form text)`,
  columns: (t) => {
    const [schema, table] = t.includes(".") ? t.split(".") : [null, t];
    return ["select column_name as name from information_schema.columns where table_name = $1 and table_schema = coalesce($2::text, current_schema())", [table, schema]];
  },
  add: (t, c) => `alter table ${pgQ(t)} add column if not exists ${pgQ(c)} text`,
  find: (t) => `select 1 as one from ${pgQ(t)} where fill_id = $1 limit 1`,
  insert: (t, cols) => `insert into ${pgQ(t)} (${cols.map(pgQ).join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) on conflict (fill_id) do nothing`,
  insertPlain: (t, cols) => `insert into ${pgQ(t)} (${cols.map(pgQ).join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})`,
  // Made by another fill at the same moment.
  exists: (e) => ["42P07", "42701", "23505"].includes(String((e as { code?: string }).code)),
  // A table the team made, with fill_id but no key on it.
  noKey: (e) => String((e as { code?: string }).code) === "42P10",
};
const myQ = (id: string) => `\`${id}\``;
const MY: Dialect = {
  create: (t) => `create table if not exists ${myQ(t)} (fill_id varchar(64) not null primary key, sent_at datetime(3) not null, form varchar(255)) character set utf8mb4`,
  columns: (t) => ["select column_name as name from information_schema.columns where table_schema = database() and table_name = ?", [t]],
  add: (t, c) => `alter table ${myQ(t)} add column ${myQ(c)} text`,
  find: (t) => `select 1 as one from ${myQ(t)} where fill_id = ? limit 1`,
  insert: (t, cols) => `insert into ${myQ(t)} (${cols.map(myQ).join(", ")}) values (${cols.map(() => "?").join(", ")}) on duplicate key update fill_id = fill_id`,
  insertPlain: (t, cols) => `insert into ${myQ(t)} (${cols.map(myQ).join(", ")}) values (${cols.map(() => "?").join(", ")})`,
  exists: (e) => ["ER_DUP_FIELDNAME", "ER_TABLE_EXISTS_ERROR"].includes(String((e as { code?: string }).code)),
  noKey: () => false,
};

async function guard(ctx: Ctx) {
  const host = ctx.secret("host");
  if (ctx.local) return host;
  if (!host || (await hostIsPrivate(host))) throw new Error("That host is on a private network. Use the database's public address.");
  return host;
}

/** A sign-in the database turned down is an AuthError; the rest keep the database's own words. */
function why(e: unknown): Error {
  const code = String((e as { code?: string }).code ?? "");
  const msg = String((e as Error).message ?? e);
  if (code.startsWith("28") || code === "ER_ACCESS_DENIED_ERROR" || code === "ER_DBACCESS_DENIED_ERROR") return new AuthError(msg);
  return e instanceof Error ? e : new Error(msg);
}

async function openPg(ctx: Ctx): Promise<Db> {
  const host = await guard(ctx);
  const ssl = ctx.local && ctx.secret("ssl") === "disable" ? false : { rejectUnauthorized: ctx.secret("ssl") !== "require" };
  const client = new pg.Client({ host, port: Number(ctx.secret("port") || 5432), database: ctx.secret("database"), user: ctx.secret("user"), password: ctx.secret("password"), ssl, connectionTimeoutMillis: 10_000, query_timeout: TIMEOUT_MS, statement_timeout: TIMEOUT_MS });
  await client.connect();
  return { query: async (sql, values) => (await client.query(sql, values)).rows as Record<string, unknown>[], end: () => client.end().catch(() => {}) };
}

async function openMysql(ctx: Ctx): Promise<Db> {
  const host = await guard(ctx);
  const mysql = await import("mysql2/promise");
  const conn = await mysql.createConnection({
    host,
    port: Number(ctx.secret("port") || 3306),
    database: ctx.secret("database"),
    user: ctx.secret("user"),
    password: ctx.secret("password"),
    ssl: ctx.local && ctx.secret("ssl") === "disable" ? undefined : { rejectUnauthorized: ctx.secret("ssl") !== "require" },
    connectTimeout: 10_000,
  });
  return { query: async (sql, values) => (await conn.query({ sql, values, timeout: TIMEOUT_MS }))[0] as Record<string, unknown>[], end: () => conn.end().catch(() => {}) };
}

/** Opens the connection; tests swap in their own. */
export const OPEN: Record<string, (ctx: Ctx) => Promise<Db>> = { postgres: openPg, mysql: openMysql };
const DIALECT: Record<string, Dialect> = { postgres: PG, mysql: MY };

async function withDb<T>(ctx: Ctx, fn: (db: Db, d: Dialect) => Promise<T>): Promise<T> {
  const d = DIALECT[ctx.source.kind];
  if (!d) throw new Error(`${ctx.source.kind} doesn't take rows.`);
  let db: Db;
  try {
    db = await OPEN[ctx.source.kind]!(ctx);
  } catch (e) {
    throw why(e);
  }
  try {
    return await fn(db, d);
  } catch (e) {
    throw why(e);
  } finally {
    await db.end();
  }
}

async function ensureTable(db: Db, d: Dialect, table: string) {
  try {
    await db.query(d.create(table));
  } catch (e) {
    if (!d.exists(e)) throw e;
  }
}

/** Make the table if it isn't there, so a name that can't be used fails in the Sync tab and not on the first fill. */
export async function prepareTable(ctx: Ctx, name: string): Promise<RowTarget> {
  const table = tableName(ctx.source.kind, name);
  if (!table) throw new Error("Use letters, digits and _ for the table name.");
  await withDb(ctx, async (db, d) => {
    await ensureTable(db, d, table);
    const [sql, values] = d.columns(table);
    const have = new Set((await db.query(sql, values)).map((r) => String(r.name ?? r.NAME ?? r.COLUMN_NAME)));
    if (!have.has("fill_id")) throw new Error(`${table} has no fill_id column. Pick a new name and Claritia makes the table.`);
  });
  return { id: table, name: table };
}

/** A row per fill: missing columns added as text, then the row, kept once by its fill_id. */
export async function appendRow(ctx: Ctx, target: RowTarget, row: FillRow, o: { retry: boolean }): Promise<{ externalId: string }> {
  const table = tableName(ctx.source.kind, target.id);
  if (!table) throw new Error("Pick the table again in the form's Sync tab.");
  const cols = rowColumns(row);
  return withDb(ctx, async (db, d) => {
    await ensureTable(db, d, table);
    const [sql, args] = d.columns(table);
    const have = new Set((await db.query(sql, args)).map((r) => String(r.name ?? r.NAME ?? r.COLUMN_NAME)));
    if (!have.has("fill_id")) throw new Error(`${table} has no fill_id column. Pick another table in the form's Sync tab.`);
    for (const c of cols) {
      if (have.has(c.name)) continue;
      try {
        await db.query(d.add(table, c.name));
      } catch (e) {
        if (!d.exists(e)) throw e;
      }
    }
    const id = { externalId: `${table}/${row.id}` };
    // Run again: the row may be there already. A table Claritia made keeps fill_id unique as well.
    if (o.retry && (await db.query(d.find(table), [row.id])).length) return id;
    const names = cols.map((c) => c.name);
    const values = cols.map((c) => (c.name === "sent_at" && ctx.source.kind === "mysql" ? c.value!.replace("T", " ").replace("Z", "") : c.value));
    try {
      await db.query(d.insert(table, names), values);
    } catch (e) {
      if (!d.noKey(e)) throw e;
      if (!(await db.query(d.find(table), [row.id])).length) await db.query(d.insertPlain(table, names), values);
    }
    return id;
  });
}
