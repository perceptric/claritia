// Meetings and payments on a real database (132_payments_locations.sql): workspace_source finds a workspace's own
// Webex, Whereby, PayPal or Square connection for the worker and the payment routes, never another workspace's, never
// a disconnected one, never another kind of tool, and only for the server.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 2 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

const find = async (ws: string, kind: string) => (await q(`select workspace_source($1, $2) as id`, [ws, kind]))[0].id as string | null;

test("a workspace's own connection, only for these four tools and only while connected", async () => {
  const ws = randomUUID();
  const other = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, 'Acme'), ($2, 'Other')`, [ws, other]);
  const add = async (w: string, kind: string, status = "active") => (await q(`insert into sources (workspace_id, kind, name, status) values ($1, $2, $2, $3) returning id`, [w, kind, status]))[0].id as string;
  const paypal = await add(ws, "paypal");
  const webex = await add(ws, "webex");
  await add(ws, "square", "disconnected");
  await add(ws, "hubspot");
  await add(other, "whereby");
  assert.equal(await find(ws, "paypal"), paypal);
  assert.equal(await find(ws, "webex"), webex);
  assert.equal(await find(ws, "square"), null, "disconnected");
  assert.equal(await find(ws, "hubspot"), null, "not one of the four");
  assert.equal(await find(ws, "whereby"), null, "another workspace's");
  await q(`update sources set status = 'error' where id = $1`, [paypal]);
  assert.equal(await find(ws, "paypal"), paypal, "a connection with an error is still the team's");
});

test("only the server can ask", async () => {
  const rows = await q(`select has_function_privilege('authenticated', 'workspace_source(uuid, text)', 'execute') as a, has_function_privilege('anon', 'workspace_source(uuid, text)', 'execute') as b, has_function_privilege('service_role', 'workspace_source(uuid, text)', 'execute') as c`);
  assert.deepEqual(rows[0], { a: false, b: false, c: true });
});
