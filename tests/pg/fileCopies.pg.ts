// File copies on a real database (131_file_copies.sql): a fill's uploads are only the ones that fill kept.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 2 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

test("form_uploads_of: the fill's own uploads, oldest first; another fill's and loose ones stay out", async () => {
  const ws = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, 'files')`, [ws]);
  const form = (await q(`insert into forms (workspace_id, name, status) values ($1, 'F', 'live') returning id`, [ws]))[0].id;
  await q(`insert into form_versions (form_id, workspace_id, version, body) values ($1, $2, 1, '{}')`, [form, ws]);
  const fill = async () => (await q(`insert into submissions (workspace_id, form_id, form_version, idem_key) values ($1, $2, 1, $3) returning id`, [ws, form, randomUUID().replace(/-/g, "")]))[0].id;
  const a = await fill();
  const b = await fill();
  const up = (sid: string | null, name: string, ago: string) =>
    q(`insert into form_uploads (workspace_id, form_id, field_id, submission_id, path, name, kind, bytes, created_at) values ($1, $2, 'f1', $3, $4, $5, 'application/pdf', 10, now() - $6::interval)`, [ws, form, sid, `${ws}/${name}`, name, ago]);
  await up(a, "second.pdf", "1 minute");
  await up(a, "first.pdf", "2 minutes");
  await up(b, "other.pdf", "1 minute");
  await up(null, "loose.pdf", "1 minute");
  const r = (await q(`select form_uploads_of($1) as x`, [a]))[0].x as { name: string; path: string }[];
  assert.deepEqual(r.map((x) => x.name), ["first.pdf", "second.pdf"]);
  assert.equal(r[0]!.path, `${ws}/first.pdf`);
  assert.deepEqual((await q(`select form_uploads_of($1) as x`, [randomUUID()]))[0].x, []);
});
