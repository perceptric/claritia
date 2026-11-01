// Saved results on a real database (docs/interactive-forms-plan.md Part 7): a fill's result is saved once, a repeat
// keeps the first, a new version with new prices leaves old results alone, and only members read them.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import pg from "pg";
import { uuid7 } from "../../collect/ids.ts";
import { acceptFill, type PublicForm } from "../../src/lib/forms/submit.ts";
import { checkForm, emptyForm, type Form } from "../../src/lib/forms/schema.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 4 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());
const rpc = pgRpc(pool);

const quote = (base: number): Form => {
  const r = checkForm({
    ...emptyForm(),
    spam: { minSeconds: 0, turnstile: false },
    steps: [
      {
        id: "s1",
        fields: [
          { id: "e", key: "email", type: "email", label: "Email", required: true },
          { id: "rooms", key: "q.rooms", type: "number", label: "Rooms", required: false },
          { id: "total", key: "q.total", type: "calc", label: "Total", required: false, calc: { formula: "{@base} + {rooms} * 15", format: "money" } },
        ],
      },
    ],
    constants: [{ id: "base", name: "Base fee", value: base, private: true }],
    results: { show: "instant", outcomes: [{ id: "big", title: "Site visit", when: { logic: "all", conds: [{ field: "total", op: "gte", value: "1000" }] } }, { id: "call", title: "Quote call" }] },
  });
  if ("errors" in r) throw new Error(r.errors.join(" "));
  return r.form;
};

test("a result is saved once, a repeat keeps the first, and a new version leaves it alone", async () => {
  const ws = uuid7();
  const user = uuid7();
  await q(`insert into workspaces (id, name) values ($1, 'Acme')`, [ws]);
  await q(`insert into auth.users (id, email) values ($1, $2)`, [user, `${user}@t.io`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, user]);
  const v1 = quote(100);
  const id = (await q(`insert into forms (workspace_id, name, draft) values ($1, 'Quote', $2) returning id`, [ws, v1]))[0].id as string;
  const version = (await q(`select form_publish($1, $2, $3) as v`, [id, user, v1]))[0].v as number;
  const pub: PublicForm = { id, workspace_id: ws, version, status: "live", body: v1, tokens: {}, logo_url: null };
  const fill = { v: 1, version, key: "q".repeat(16) + uuid7().replace(/-/g, "").slice(0, 20), answers: { e: "ana@acme.com", rooms: "20", total: 1 }, ms: 5000 };

  const first = await acceptFill(rpc, pub, fill, { custom: [] });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const sid = first.body.id as string;
  let rows = await q(`select outcome_id, "values", constants, form_version from submission_results where submission_id = $1`, [sid]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].outcome_id, "call");
  assert.equal(rows[0].values["q.total"], 400);
  assert.equal(rows[0].constants.base, 100);

  // The same send again: same submission, the first result kept.
  const again = await acceptFill(rpc, pub, fill, { custom: [] });
  assert.equal(again.body.id, sid);
  assert.equal((await q(`select count(*)::int as n from submission_results where submission_id = $1`, [sid]))[0].n, 1);

  // A new version with a bigger base fee: the old result still says 400.
  await q(`select form_publish($1, $2, $3)`, [id, user, quote(900)]);
  rows = await q(`select "values" from submission_results where submission_id = $1`, [sid]);
  assert.equal(rows[0].values["q.total"], 400);

  // Members read results; nobody else does, and nobody writes them from the app.
  const stranger = uuid7();
  await q(`insert into auth.users (id, email) values ($1, $2)`, [stranger, `${stranger}@t.io`]);
  const as = async (uid: string) => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
      await c.query("set local role authenticated");
      return (await c.query(`select count(*)::int as n from submission_results where submission_id = $1`, [sid])).rows[0].n as number;
    } finally {
      await c.query("rollback");
      c.release();
    }
  };
  assert.equal(await as(user), 1);
  assert.equal(await as(stranger), 0);
});

test("Email my results: only the browser that sent the fill can ask, and it queues one email", async () => {
  const ws = uuid7();
  const user = uuid7();
  await q(`insert into workspaces (id, name) values ($1, 'Acme')`, [ws]);
  await q(`insert into auth.users (id, email) values ($1, $2)`, [user, `${user}@t.io`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, user]);
  const body = quote(100);
  const id = (await q(`insert into forms (workspace_id, name, draft) values ($1, 'Quote', $2) returning id`, [ws, body]))[0].id as string;
  const version = (await q(`select form_publish($1, $2, $3) as v`, [id, user, body]))[0].v as number;
  const key = "m".repeat(16) + uuid7().replace(/-/g, "").slice(0, 20);
  const r = await acceptFill(rpc, { id, workspace_id: ws, version, status: "live", body, tokens: {}, logo_url: null }, { v: 1, version, key, answers: { e: "bo@acme.com", rooms: "3" }, ms: 5000 }, { custom: [] });
  const sid = r.body.id as string;
  const ask = async (k: string, form = id) => (await q(`select form_results_request($1, $2, $3) as r`, [form, sid, k]))[0].r as string;
  assert.equal(await ask("x".repeat(20)), "not_found");
  assert.equal(await ask(key, uuid7()), "not_found");
  assert.equal(await ask(key), "queued");
  assert.equal(await ask(key), "queued");
  assert.equal((await q(`select count(*)::int as n from jobs where key = $1`, [`form_results:${sid}`]))[0].n, 1);
  const got = (await q(`select submission_result_get($1) as r`, [sid]))[0].r;
  assert.equal(got.values["q.total"], 145);
});
