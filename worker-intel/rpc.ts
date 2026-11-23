// The jobs queue over a direct Postgres connection: the same functions Supabase's rpc would call.

import type pg from "pg";
import type { Rpc } from "../src/lib/jobs.ts";

const NAME = /^[a-z_]+$/;

export function pgRpc(pool: pg.Pool): Rpc {
  // Whether each function returns a set, looked up once.
  const sets = new Map<string, boolean>();
  const returnsSet = async (fn: string) => {
    if (!sets.has(fn)) {
      const r = await pool.query(`select bool_or(proretset) as set from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace`, [fn]);
      sets.set(fn, r.rows[0]?.set === true);
    }
    return sets.get(fn)!;
  };
  return async (fn, args) => {
    if (!NAME.test(fn)) return { data: null, error: { message: "bad function name" } };
    const keys = Object.keys(args).filter((k) => NAME.test(k));
    const sql = `select * from public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")})`;
    try {
      // Objects, and arrays of objects, are jsonb; arrays of plain values are Postgres arrays.
      const value = (v: unknown) =>
        v !== null && typeof v === "object" && (!Array.isArray(v) || v.some((x) => x !== null && typeof x === "object")) ? JSON.stringify(v) : v;
      const r = await pool.query(sql, keys.map((k) => value(args[k])));
      // A function of plain values comes back as one column named after it: one value, or a list of them for a set.
      if (r.fields.length !== 1 || r.fields[0].name !== fn) return { data: r.rows, error: null };
      const values = r.rows.map((row) => row[fn]);
      return { data: (await returnsSet(fn)) ? values : (values[0] ?? null), error: null };
    } catch (e) {
      return { data: null, error: { message: (e as Error).message } };
    }
  };
}
