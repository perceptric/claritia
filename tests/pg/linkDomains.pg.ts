// Custom link domains (118_link_domains.sql) and the worker's re-check (worker-intel/jobs/linkDomains.ts), on a real
// database: one hostname is never two workspaces', a domain serves only while active, a re-check stops one whose DNS
// moved and brings it back when it points again, and two workers never check at once.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import pg from "pg";
import type { Resolver } from "../../src/lib/domains/check.ts";
import { recheckDomains } from "../../worker-intel/jobs/linkDomains.ts";
import { uuid7 } from "./ids.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 4 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

async function workspace(slug: string) {
  const ws = uuid7();
  const user = uuid7();
  await q(`insert into workspaces (id, name, booking_slug) values ($1, $2, $2)`, [ws, slug]);
  await q(`insert into auth.users (id, email) values ($1, $2)`, [user, `${user}@t.io`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, user]);
  return { ws, user };
}
const T = "claritia-web.fly.dev";
let pointing = new Set<string>();
const resolver: Resolver = { cname: async (h) => (pointing.has(h) ? [T] : Promise.reject(new Error("ENODATA"))), a: async () => [] };
const hostOf = async (h: string) => (await q(`select link_domain_host($1) s`, [h]))[0].s as string | null;

test("one hostname is one workspace's; it serves only while active", async () => {
  const a = await workspace(`dom-a-${Date.now()}`);
  const b = await workspace(`dom-b-${Date.now()}`);
  const host = `forms-${Date.now()}.acme.com`;
  await q(`insert into link_domains (workspace_id, hostname) values ($1, $2)`, [a.ws, host]);
  await assert.rejects(q(`insert into link_domains (workspace_id, hostname) values ($1, $2)`, [b.ws, host]), /duplicate key/);
  await assert.rejects(q(`insert into link_domains (workspace_id, hostname) values ($1, 'second.acme.com')`, [a.ws]), /duplicate key/, "one a workspace");
  await assert.rejects(q(`insert into link_domains (workspace_id, hostname) values ($1, 'Not A Host')`, [b.ws]), /check constraint/);
  assert.equal(await hostOf(host), null, "pending: not served");
  await q(`update link_domains set status = 'active' where workspace_id = $1`, [a.ws]);
  assert.equal(await hostOf(host.toUpperCase()), (await q(`select booking_slug from workspaces where id = $1`, [a.ws]))[0].booking_slug);
  // Members read their own; nobody else.
  const c = await pool.connect();
  try {
    await c.query(`set role authenticated`);
    await c.query(`select set_config('request.jwt.claim.sub', $1, false)`, [b.user]);
    assert.equal((await c.query(`select count(*)::int n from link_domains where workspace_id = $1`, [a.ws])).rows[0].n, 0);
    await c.query(`select set_config('request.jwt.claim.sub', $1, false)`, [a.user]);
    assert.equal((await c.query(`select count(*)::int n from link_domains where workspace_id = $1`, [a.ws])).rows[0].n, 1);
    await assert.rejects(c.query(`update link_domains set status = 'active' where workspace_id = $1`, [a.ws]), /permission denied/);
  } finally {
    await c.query(`reset role`);
    await c.query(`select set_config('request.jwt.claim.sub', '', false)`);
    c.release();
  }
});

test("the re-check: DNS moved, it stops; pointed back, it serves again; two workers never check at once", async () => {
  const { ws } = await workspace(`dom-c-${Date.now()}`);
  const host = `book-${Date.now()}.acme.com`;
  await q(`insert into link_domains (workspace_id, hostname, status, dns_ok, cert_ok, checked_at) values ($1, $2, 'active', true, true, now() - interval '1 hour')`, [ws, host]);
  pointing = new Set();
  assert.ok((await recheckDomains(pool, { resolver, target: T })) >= 1);
  assert.equal((await q(`select status from link_domains where workspace_id = $1`, [ws]))[0].status, "failed");
  assert.equal(await hostOf(host), null, "stopped within one check");
  assert.equal(await recheckDomains(pool, { resolver, target: T }) >= 0, true);
  await q(`update link_domains set checked_at = now() - interval '1 hour' where workspace_id = $1`, [ws]);
  pointing = new Set([host]);
  await recheckDomains(pool, { resolver, target: T });
  assert.equal((await q(`select status, last_error from link_domains where workspace_id = $1`, [ws]))[0].status, "active");
  assert.ok(await hostOf(host));
  // Checked a moment ago: left alone until it's due.
  pointing = new Set();
  await recheckDomains(pool, { resolver, target: T });
  assert.equal((await q(`select status from link_domains where workspace_id = $1`, [ws]))[0].status, "active");
  // Two at once: one takes the round, the other finds the lock taken.
  await q(`update link_domains set checked_at = now() - interval '1 hour'`);
  const slow: Resolver = { cname: async () => new Promise((_r, rej) => setTimeout(() => rej(new Error("ENODATA")), 50)), a: async () => [] };
  const [x, y] = await Promise.all([recheckDomains(pool, { resolver: slow, target: T }), recheckDomains(pool, { resolver: slow, target: T })]);
  assert.ok(x === 0 || y === 0, `one round only (${x}, ${y})`);
});
