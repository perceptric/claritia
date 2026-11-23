// pgRpc (worker-intel/rpc.ts), the database call the worker uses: a function of one plain value comes back as that
// value, a set of plain values as a list (even a list of one), and a set of rows as rows.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import pg from "pg";
import { pgRpc } from "../../worker-intel/rpc.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 2 });
const rpc = pgRpc(pool);

before(async () => {
  await pool.query(`
    create or replace function public.rpc_t_one() returns text language sql as $$ select 'a' $$;
    create or replace function public.rpc_t_list(p_n int) returns setof text language sql as $$ select g::text from generate_series(1, p_n) g $$;
    create or replace function public.rpc_t_rows() returns table (x int, y text) language sql as $$ select 1, 'b' $$;`);
});
after(async () => {
  await pool.query(`drop function public.rpc_t_one(); drop function public.rpc_t_list(int); drop function public.rpc_t_rows();`);
  await pool.end();
});

test("one value comes back as that value", async () => {
  assert.deepEqual(await rpc("rpc_t_one", {}), { data: "a", error: null });
});

test("a set of values comes back as a list, even with one or none", async () => {
  assert.deepEqual((await rpc("rpc_t_list", { p_n: 3 })).data, ["1", "2", "3"]);
  assert.deepEqual((await rpc("rpc_t_list", { p_n: 1 })).data, ["1"]);
  assert.deepEqual((await rpc("rpc_t_list", { p_n: 0 })).data, []);
});

test("a set of rows comes back as rows", async () => {
  assert.deepEqual((await rpc("rpc_t_rows", {})).data, [{ x: 1, y: "b" }]);
});
