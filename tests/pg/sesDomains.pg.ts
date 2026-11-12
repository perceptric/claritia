// Customer sending domains on Amazon SES, on a real database (145_ses_domains.sql, docs/ses-plan.md Steps 3 and 4):
// a new domain made on SES opens once SES and DNS check out; a moving domain keeps sending on Resend until SES
// verifies it, then flips, and falls back to Resend if its SES records stop checking out; Claritia's own domains are
// refused; an identity left by someone else is made again so fresh records prove the DNS; removal deletes it.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import pg from "pg";
import { uuid7 } from "./ids.ts";
import type { Resolver, SesIdentity } from "../../src/lib/email/domains.ts";
import type { Job } from "../../src/lib/jobs.ts";
import { domainCheck, domainRemove, type SesDomains } from "../../worker-intel/jobs/email.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 4 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
const one = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await q(sql, p))[0] as T;
after(() => pool.end());
const rpc = pgRpc(pool);
const env = { CLARITIA_OWN_DOMAINS: "tryclaritia.com,perceptric.com", EMAIL_SES_DOMAINS: "" } as NodeJS.ProcessEnv;

/** A fake SES account: identities by domain, with what SES says about each, and every call it took. */
function fakeSes() {
  const ids = new Map<string, SesIdentity>();
  const calls: string[] = [];
  let n = 0;
  const ses: SesDomains = {
    region: "us-east-2",
    getIdentity: async (d) => (calls.push(`get:${d}`), ids.get(d) ?? null),
    createIdentity: async (d) => {
      calls.push(`create:${d}`);
      const id: SesIdentity = { dkimStatus: "PENDING", dkimTokens: [`t${++n}a`, `t${n}b`, `t${n}c`], mailFrom: null, mailFromStatus: null, verified: false };
      ids.set(d, id);
      return id;
    },
    putMailFrom: async (d, mf) => {
      calls.push(`mailfrom:${d}:${mf}`);
      ids.set(d, { ...ids.get(d)!, mailFrom: mf, mailFromStatus: "PENDING" });
    },
    deleteIdentity: async (d) => {
      calls.push(`delete:${d}`);
      ids.delete(d);
    },
  };
  /** SES has seen the records. */
  const verify = (d: string) => ids.set(d, { ...ids.get(d)!, dkimStatus: "SUCCESS", mailFromStatus: "SUCCESS", verified: true });
  return { ses, ids, calls, verify };
}

/** DNS that holds DMARC for every domain, and an SPF on bounce.<domain> once `spf` has it. */
function dns(spf: Set<string>): Resolver {
  const nx = () => Promise.reject(Object.assign(new Error("not found"), { code: "ENOTFOUND" }));
  return {
    cname: () => nx(),
    mx: () => nx(),
    txt: async (name) => {
      if (name.startsWith("_dmarc.")) return [["v=DMARC1; p=none"]];
      const d = name.replace(/^bounce\./, "");
      return spf.has(d) ? [["v=spf1 include:amazonses.com ~all"]] : nx();
    },
  };
}

let ws = "";
let owner = "";
before(async () => {
  ws = uuid7();
  owner = uuid7();
  await q(`insert into workspaces (id, name) values ($1, 'ses')`, [ws]);
  await q(`insert into auth.users (id, email) values ($1, $2)`, [owner, `o-${owner}@acme.com`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, owner]);
});

const addDomain = async (domain: string, o: { resend?: boolean } = {}) =>
  (await one<{ id: string }>(
    `insert into sending_domains (workspace_id, domain, mail_from, tracking_host, status, provider_id, verified_at) values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [ws, domain, `send.${domain}`, `t.${domain}`, o.resend ? "verified" : "pending", o.resend ? `re-${uuid7()}` : null, o.resend ? new Date() : null],
  )).id;
const row = (id: string) => one<{ status: string; provider: string; ses_status: string | null; ses_records: { key: string; status: string; name: string }[]; ses_error: string | null; records: unknown[]; ses_mail_from: string }>(`select * from sending_domains where id = $1`, [id]);
const job = (id: string): Job => ({ id: uuid7(), workspace_id: ws, kind: "domain_check", key: id, payload: { domain_id: id }, attempts: 1, max_attempts: 5 });
// Resend already verified a moving domain (its own check runs as before).
const resendVerified = {
  createDomain: async () => Promise.reject(new Error("not used")),
  getDomain: async (id: string) => ({ id, name: "", status: "verified", records: [] }),
  findDomain: async () => null,
  verifyDomain: async () => undefined,
};
/** What send_claim says about a message from this domain. */
async function claimProvider(domain: string) {
  await q(`insert into send_settings (workspace_id, from_name, from_email, address, quiet_start, quiet_end) values ($1, 'Acme', $2, '1 Main St', 0, 0) on conflict (workspace_id) do update set from_email = excluded.from_email`, [ws, `news@${domain}`]);
  const c = await one<{ id: string }>(`insert into contacts (workspace_id, email, email_clean, country) values ($1, $2, $2, 'US') returning id`, [ws, `c-${uuid7()}@example.com`]);
  const e = (await rpc("email_create", { p_ws: ws, p_user: owner, p_values: { kind: "broadcast", subject: "S", html: "<p>x</p>", text: "x", links: [], marketing: false, topic_id: "" } })).data as string;
  await rpc("email_queue", { p_email: e, p_contacts: [c.id] });
  const got = (await rpc("send_claim", { p_ws: ws, p_limit: 100 })).data as { provider: string; from_email: string }[];
  await q(`update email_messages set status = 'skipped' where workspace_id = $1 and status in ('queued', 'sending')`, [ws]);
  return got.find((m) => m.from_email.endsWith(domain))?.provider;
}

test("a new domain made on SES: five records and DMARC, then open for sending once SES and DNS check out", async () => {
  const { ses, calls, verify } = fakeSes();
  const spf = new Set<string>();
  const d = `n${ws.slice(-6)}.acme.com`;
  const id = await addDomain(d);
  const check = domainCheck(rpc, null, dns(spf), { ses, sesNew: true, env });
  await check(job(id), new AbortController().signal);
  let r = await row(id);
  assert.deepEqual([r.status, r.provider, r.ses_status, r.ses_mail_from], ["pending", "resend", "pending", `bounce.${d}`]);
  assert.deepEqual(r.ses_records.map((x) => x.key), ["dkim1", "dkim2", "dkim3", "mx", "spf", "dmarc"]);
  assert.equal(r.ses_records.find((x) => x.key === "mx")?.name, `bounce.${d}`);
  assert.equal(r.records.length, 6, "a domain only on SES shows its SES records as its records");
  assert.deepEqual(calls, [`get:${d}`, `create:${d}`, `mailfrom:${d}:bounce.${d}`, `get:${d}`]);
  verify(d);
  spf.add(d);
  await check(job(id), new AbortController().signal);
  r = await row(id);
  assert.deepEqual([r.status, r.provider, r.ses_status], ["verified", "ses", "verified"]);
  assert.equal(await claimProvider(d), "ses");
});

test("a moving domain sends on Resend until SES verifies it, then on SES; broken SES records fall back to Resend", async () => {
  const { ses, ids, verify } = fakeSes();
  const spf = new Set<string>();
  const d = `m${ws.slice(-6)}.acme.com`;
  const id = await addDomain(d, { resend: true });
  await q(`update sending_domains set ses_status = 'pending', ses_mail_from = 'bounce.' || domain where id = $1`, [id]);
  const check = domainCheck(rpc, resendVerified, dns(spf), { ses, sesNew: false, env });
  await check(job(id), new AbortController().signal);
  let r = await row(id);
  assert.deepEqual([r.status, r.provider, r.ses_status], ["verified", "resend", "pending"], "still verified on Resend while SES waits");
  assert.equal(r.ses_records.length, 6);
  assert.equal(await claimProvider(d), "resend");
  verify(d);
  spf.add(d);
  await check(job(id), new AbortController().signal);
  r = await row(id);
  assert.deepEqual([r.status, r.provider, r.ses_status], ["verified", "ses", "verified"]);
  assert.equal(await claimProvider(d), "ses");
  assert.equal((await one<{ n: number }>(`select count(*)::int n from audit_log where workspace_id = $1 and action = 'sending.domain_on_ses' and target = $2`, [ws, d])).n, 1);
  // Someone removes the SES records: messages go back to Resend (still verified there) until they're fixed.
  ids.set(d, { ...ids.get(d)!, dkimStatus: "PENDING" });
  await check(job(id), new AbortController().signal);
  r = await row(id);
  assert.deepEqual([r.provider, r.ses_status], ["ses", "pending"]);
  assert.equal(await claimProvider(d), "resend");
});

test("Claritia's own domains are refused, and an identity left by someone else is made again", async () => {
  const { ses, calls } = fakeSes();
  const own = await addDomain(`x${ws.slice(-4)}.tryclaritia.com`);
  await domainCheck(rpc, null, dns(new Set()), { ses, sesNew: true, env })(job(own), new AbortController().signal);
  const r = await row(own);
  assert.deepEqual([r.ses_status, r.ses_error], ["failed", "This domain belongs to Claritia and can't be added."]);
  assert.deepEqual(calls, [], "SES isn't even asked");
  // An identity already in the account (verified for whoever set it up) never carries over to this workspace.
  const d = `l${ws.slice(-6)}.acme.com`;
  await ses.createIdentity(d);
  calls.length = 0;
  const id = await addDomain(d);
  await domainCheck(rpc, null, dns(new Set()), { ses, sesNew: true, env })(job(id), new AbortController().signal);
  assert.deepEqual(calls.slice(0, 3), [`get:${d}`, `delete:${d}`, `create:${d}`]);
  assert.match((await row(id)).ses_records[0]!.name, /^t\d+a\._domainkey\./, "fresh DKIM records");
  // Later checks keep the identity.
  calls.length = 0;
  await domainCheck(rpc, null, dns(new Set()), { ses, sesNew: true, env })(job(id), new AbortController().signal);
  assert.ok(!calls.some((c) => c.startsWith("delete") || c.startsWith("create")));
});

test("removing a domain deletes its SES identity, unless it was added again or it's Claritia's own", async () => {
  const { ses, calls } = fakeSes();
  const remove = domainRemove(pool, null, { ses, env });
  const rjob = (domain: string): Job => ({ id: uuid7(), workspace_id: ws, kind: "domain_remove", key: domain, payload: { domain }, attempts: 1, max_attempts: 5 });
  await remove(rjob("gone.acme-removed.com"), new AbortController().signal);
  const kept = `k${ws.slice(-6)}.acme.com`;
  await addDomain(kept);
  await remove(rjob(kept), new AbortController().signal);
  await remove(rjob("mail.tryclaritia.com"), new AbortController().signal);
  assert.deepEqual(calls, ["delete:gone.acme-removed.com"]);
});

test("the move: only the owner starts it, and a domain already on SES stays put", async () => {
  const d = `o${ws.slice(-6)}.acme.com`;
  const id = await addDomain(d, { resend: true });
  const asUser = async (user: string | null, fn: (c: pg.PoolClient) => Promise<unknown>) => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [JSON.stringify({ sub: user, role: "authenticated" }), user ?? ""]);
      const r = await fn(c);
      await c.query("commit");
      return r;
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  };
  const stranger = uuid7();
  await assert.rejects(asUser(stranger, (c) => c.query(`select sending_domain_move($1)`, [id])), /Only the workspace owner/);
  await asUser(owner, (c) => c.query(`select sending_domain_move($1)`, [id]));
  const r = await row(id);
  assert.deepEqual([r.ses_status, r.ses_mail_from, r.provider], ["pending", `bounce.${d}`, "resend"]);
  assert.equal((await one<{ n: number }>(`select count(*)::int n from jobs where kind = 'domain_check' and key = $1`, [id])).n, 1);
  // Already on SES: a second move changes nothing.
  await q(`update sending_domains set provider = 'ses', ses_status = 'verified', ses_mail_from = 'bounce.other' where id = $1`, [id]);
  await asUser(owner, (c) => c.query(`select sending_domain_move($1)`, [id]));
  const s = await row(id);
  assert.deepEqual([s.provider, s.ses_status, s.ses_mail_from], ["ses", "verified", "bounce.other"]);
});
