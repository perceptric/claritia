// Link domains on claritia-intel (docs/sharing-plan.md step 4): every 30 minutes, each custom domain's DNS is checked
// again, so one pointed elsewhere stops serving ('failed') and one pointed back serves again. The certificate's last
// answer stands (only the web app asks Fly). One worker at a time, 20 domains a round, the oldest checks first.

import type pg from "pg";
import { nextState, pointsAt, systemResolver, type DomainState, type Resolver } from "../../src/lib/domains/check.ts";
import { linkTarget } from "../../src/lib/domains/fly.ts";

export const RECHECK_MIN = 25;

export async function recheckDomains(pool: pg.Pool, o: { resolver?: Resolver; target?: string } = {}): Promise<number> {
  const c = await pool.connect();
  let n = 0;
  try {
    await c.query("begin");
    const got = (await c.query(`select pg_try_advisory_xact_lock(hashtext('claritia:link_domains')) as ok`)).rows[0].ok;
    if (!got) {
      await c.query("commit");
      return 0;
    }
    const rows = (await c.query(`select workspace_id, hostname, status, cert_ok from link_domains where checked_at is null or checked_at < now() - make_interval(mins => $1) order by checked_at nulls first limit 20`, [RECHECK_MIN])).rows as { workspace_id: string; hostname: string; status: DomainState; cert_ok: boolean }[];
    for (const r of rows) {
      const dnsOk = await pointsAt(r.hostname, o.target ?? linkTarget(), o.resolver ?? systemResolver);
      const next = nextState({ status: r.status, certOk: r.cert_ok }, dnsOk, null);
      await c.query(`update link_domains set status = $2, dns_ok = $3, checked_at = now(), last_error = case when $2 = 'active' then null when $3 then last_error else $4 end where workspace_id = $1`, [r.workspace_id, next.status, dnsOk, `The CNAME for ${r.hostname} doesn't point at Claritia any more.`]);
      n++;
    }
    await c.query("commit");
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
  return n;
}
