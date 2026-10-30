// Signals and scores (docs/m1-website-intelligence.md 7.4, 7.5). A sweep finds visits with an account that went
// quiet (or grew since the last look) and saves their signals; score_account turns an account's signals into its
// scores. Both can run twice with the same result.

import type pg from "pg";
import { JobError, type Handler } from "../../src/lib/jobs.ts";
import { hostIsPrivate } from "../../src/lib/privateNet.ts";
import { unseal } from "../../src/lib/seal.ts";
import { parseRule, ruleFires, slackAccountMessage } from "../../src/lib/web/accountAlerts.ts";
import { fitV0, intentOf, priorityOf, rawIntent, SCORE_VERSION, stageOf, temperatureOf, whyNow, type Icp, type ScoredSignal, type Stage } from "../../src/lib/web/scores.ts";
import { accountSignals, DEFAULT_SIGNALS, visitSignals, type PageGroup, type Signal } from "../../src/lib/web/signals.ts";

const QUIET_MS = 2 * 60_000;

type Types = Record<string, { weight: number; half_life_days: number; enabled?: boolean }>;

function typesFrom(rows: { kind: string; weight: number; half_life_days: number; enabled: boolean }[]): Types {
  const out = { ...DEFAULT_SIGNALS } as Types;
  for (const t of rows) out[t.kind] = { weight: t.weight, half_life_days: t.half_life_days, enabled: t.enabled };
  return out;
}

// The visits the sweep still has to look at (the sessions_needs_signal index, 087_job_lanes.sql).
const NEEDS = `account_id is not null and not internal and not is_bot and (signaled_at is null or signaled_at < ended_at)
  and ended_at < now() - make_interval(secs => ${QUIET_MS / 1000})`;

type Visit = {
  id: string; workspace_id: string; site_id: string; account_id: string | null; person_id: string | null; person_level: string | null;
  ref_class: string | null; referrer_host: string | null; started_at: Date; ended_at: Date; internal: boolean; is_bot: boolean;
  device_state: string | null; partner: boolean | null;
};

/**
 * One pass of the sweep: up to `limit` quiet visits with an account that weren't checked since they last grew. All of
 * it is one transaction of about a dozen statements, whatever the number of visits: the visits are taken and marked
 * at once, their events, page groups, history and signal types read in one query each, the signals written in one
 * insert, and the accounts to rescore queued in one call. An idle sweep is one indexed look and holds no connection.
 */
export async function sweepSignals(pool: pg.Pool, limit = 200): Promise<number> {
  if (!(await pool.query(`select exists (select 1 from sessions where ${NEEDS}) as due`)).rows[0]?.due) return 0;
  const c = await pool.connect();
  try {
    await c.query("begin");
    // One sweep at a time across workers, for as long as this transaction.
    if (!(await c.query(`select pg_try_advisory_xact_lock(hashtext('claritia:signals_sweep')) as ok`)).rows[0].ok) {
      await c.query("rollback");
      return 0;
    }
    const visits = (
      await c.query(
        `with due as (select id from sessions where ${NEEDS} order by ended_at limit $1 for update skip locked),
         u as (update sessions s set signaled_at = now() from due where s.id = due.id
               returning s.id, s.workspace_id, s.site_id, s.account_id, s.person_id, s.person_level, s.ref_class, s.referrer_host,
                         s.started_at, s.ended_at, s.internal, s.is_bot, s.device_id)
         select u.*, d.state as device_state, p.partner from u left join devices d on d.id = u.device_id left join persons p on p.id = u.person_id
         order by u.ended_at, u.id`,
        [limit],
      )
    ).rows as Visit[];
    // Internal, bot, partner and tainted devices make no signals (7.6).
    const live = visits.filter((s) => s.account_id && !s.internal && !s.is_bot && !s.partner && s.device_state !== "tainted" && s.device_state !== "internal");
    if (!live.length) {
      await c.query("commit");
      return visits.length;
    }
    const ids = live.map((s) => s.id);
    const workspaces = [...new Set(live.map((s) => s.workspace_id))];
    const sites = [...new Set(live.map((s) => s.site_id))];
    const [events, groups, history, typeRows] = await Promise.all([
      c.query(`select session_id, kind, path, data, server_at from events where session_id = any($1::uuid[]) order by session_id, server_at`, [ids]),
      c.query(`select site_id, pattern, grp, competitor from page_groups where site_id = any($1::uuid[])`, [sites]),
      c.query(
        `select v.i::int as i,
           (select max(started_at) from sessions where workspace_id = v.ws and account_id = v.account and not internal and not is_bot and started_at < v.at) as last_before,
           (select count(distinct coalesce(person_id::text, device_id::text)) from sessions
             where workspace_id = v.ws and account_id = v.account and not internal and not is_bot and started_at > v.at - interval '7 days' and started_at <= v.at) as people,
           (select not exists (select 1 from sessions where workspace_id = v.ws and account_id = v.account and person_id = v.person and started_at < v.at)) as first_person
         from unnest($1::uuid[], $2::uuid[], $3::timestamptz[], $4::uuid[]) with ordinality as v(ws, account, at, person, i)`,
        [live.map((s) => s.workspace_id), live.map((s) => s.account_id), live.map((s) => s.started_at), live.map((s) => s.person_id)],
      ),
      c.query(`select workspace_id, kind, weight::float, half_life_days::float, enabled from signal_types where workspace_id = any($1::uuid[])`, [workspaces]),
    ]);
    const bySession = new Map<string, { kind: string; path: string; data: unknown; server_at: Date }[]>();
    for (const e of events.rows) bySession.set(e.session_id, [...(bySession.get(e.session_id) ?? []), e]);
    const bySite = new Map<string, PageGroup[]>();
    for (const g of groups.rows) bySite.set(g.site_id, [...(bySite.get(g.site_id) ?? []), { pattern: g.pattern, grp: g.grp, competitor: g.competitor }]);
    const typesBy = new Map<string, Types>(workspaces.map((w) => [w, typesFrom(typeRows.rows.filter((t) => t.workspace_id === w))]));
    const hist = new Map<number, { last_before: Date | null; people: string; first_person: boolean }>(history.rows.map((h) => [h.i, h]));

    // Every signal, in visit order; the first of a dedupe key wins, as one insert after another would.
    const rows: { ws: string; account: string; person: string | null; kind: string; weight: number; at: Date; key: string; evidence: string }[] = [];
    const seen = new Set<string>();
    for (const [n, s] of live.entries()) {
      const at = +s.started_at;
      const found: Signal[] = visitSignals(s.account_id!, {
        id: s.id, startedAt: at, personId: s.person_id, personLevel: s.person_level, refClass: s.ref_class, referrerHost: s.referrer_host,
        events: (bySession.get(s.id) ?? []).map((e) => ({ kind: e.kind, path: e.path, at: +e.server_at, data: e.data })),
      } as Parameters<typeof visitSignals>[1], bySite.get(s.site_id) ?? []);
      const h = hist.get(n + 1);
      found.push(...accountSignals(s.account_id!, {
        visitAt: at,
        lastBefore: h?.last_before ? +h.last_before : null,
        peopleThisWeek: Number(h?.people) || 0,
        personId: s.person_id && s.person_level !== "probable" ? s.person_id : null,
        firstSeenPerson: !!h?.first_person,
      }));
      const t = typesBy.get(s.workspace_id)!;
      for (const sig of found) {
        const type = t[sig.kind];
        if (!type || type.enabled === false) continue;
        const k = `${s.workspace_id}|${sig.dedupe_key}`;
        if (seen.has(k)) continue;
        seen.add(k);
        rows.push({ ws: s.workspace_id, account: s.account_id!, person: sig.person_id, kind: sig.kind, weight: type.weight, at: new Date(sig.at), key: sig.dedupe_key, evidence: JSON.stringify(sig.evidence) });
      }
    }
    let touched: { workspace_id: string; account_id: string }[] = [];
    if (rows.length) {
      touched = (
        await c.query(
          `insert into signals (workspace_id, account_id, person_id, kind, weight, at, dedupe_key, evidence)
           select * from unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::text[], $5::float8[], $6::timestamptz[], $7::text[], $8::jsonb[])
           on conflict (workspace_id, dedupe_key) do nothing
           returning workspace_id, account_id`,
          [rows.map((r) => r.ws), rows.map((r) => r.account), rows.map((r) => r.person), rows.map((r) => r.kind), rows.map((r) => r.weight), rows.map((r) => r.at), rows.map((r) => r.key), rows.map((r) => r.evidence)],
        )
      ).rows;
    }
    const accounts = [...new Map(touched.map((t) => [t.account_id, t])).values()];
    if (accounts.length) {
      await c.query(`update accounts set last_signal_at = greatest(coalesce(last_signal_at, 'epoch'), now()) where id = any($1::uuid[])`, [accounts.map((a) => a.account_id)]);
      await c.query(`select enqueue_jobs($1::jsonb)`, [
        JSON.stringify(accounts.map((a) => ({ workspace_id: a.workspace_id, kind: "score_account", key: a.account_id, payload: { account_id: a.account_id }, delay_s: 60, max_attempts: 5 }))),
      ]);
    }
    await c.query("commit");
    return visits.length;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

// What scoring reads about a workspace, kept a minute.
type Config = { types: Types; icp: Icp | null; k: number };
const configs = new Map<string, { at: number; c: Config }>();

async function configFor(pool: pg.Pool, ws: string, now = Date.now()): Promise<Config> {
  const hit = configs.get(ws);
  if (hit && now - hit.at < 60_000) return hit.c;
  const r = (
    await pool.query(
      `select coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'weight', weight::float, 'half_life_days', half_life_days::float, 'enabled', enabled))
                        from signal_types where workspace_id = $1), '[]') as types,
              (select rules from icp where workspace_id = $1) as icp,
              (select k from intent_params where workspace_id = $1) as k`,
      [ws],
    )
  ).rows[0];
  const c: Config = { types: typesFrom(r.types), icp: (r.icp as Icp | null) ?? null, k: Number(r.k ?? 60) };
  configs.set(ws, { at: now, c });
  if (configs.size > 5000) configs.delete(configs.keys().next().value!);
  return c;
}

/** Tests: forget the cached workspace settings. */
export const clearScoreConfig = () => configs.clear();

/** score_account: fit, intent, stage, temperature, priority and why-now, saved on the account and in history. */
export const scoreAccount = (pool: pg.Pool, now: () => number = Date.now): Handler => async (job) => {
  const id = String(job.payload.account_id ?? job.key ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new JobError("score_account needs an account", { retry: false });
  const a = (await pool.query(`select id, workspace_id, firmo, stage, owner_user_id, temperature, intent, fit from accounts where id = $1`, [id])).rows[0];
  if (!a) return;
  const cfg = await configFor(pool, a.workspace_id);
  const t = cfg.types;
  const sigs: ScoredSignal[] = (
    await pool.query(`select kind, weight::float, at, person_id from signals where account_id = $1 and at > now() - interval '90 days'`, [id])
  ).rows.map((r) => ({ kind: r.kind, weight: r.weight, half_life_days: t[r.kind]?.half_life_days ?? 14, at: +r.at, person_id: r.person_id }));
  const icp = cfg.icp;
  const k = cfg.k;
  const at = now();
  const fit = fitV0(a.firmo, icp ?? null);
  const intent = intentOf(rawIntent(sigs, at), k);
  const stage: Stage = stageOf(sigs, at, a.stage ?? null);
  const temperature = temperatureOf(sigs, at, intent);
  const priority = priorityOf(intent, fit, stage, !!a.owner_user_id);
  const why = whyNow(sigs, at);
  await pool.query(
    `update accounts set fit = $2, intent = $3, stage = $4, stage_since = case when stage is distinct from $4 then now() else stage_since end,
       temperature = $5, priority = $6, why_now = $7 where id = $1`,
    [id, fit, intent, stage, temperature, priority, why.text || null],
  );
  await pool.query(
    `insert into account_scores (account_id, workspace_id, fit, intent, priority, stage, temperature, why_now, score_version) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, a.workspace_id, fit, intent, priority, stage, temperature, JSON.stringify(why.top), SCORE_VERSION],
  );
  await checkAlerts(pool, a.workspace_id, id, { temperature: a.temperature, stage: a.stage, intent: a.intent, fit: a.fit }, { temperature, stage, intent, fit });
};

/** Queue an alert for each rule this change fires, at most once a day per rule and account, within the daily cap. */
async function checkAlerts(pool: pg.Pool, ws: string, account: string, before: Parameters<typeof ruleFires>[1], after: Parameters<typeof ruleFires>[2]) {
  const rules = (await pool.query(`select id, rule, daily_cap from account_alert_rules where workspace_id = $1 and enabled`, [ws])).rows;
  const fired = rules.filter((r) => {
    const rule = parseRule(r.rule);
    return rule && ruleFires(rule, before, after);
  });
  if (!fired.length) return;
  const recent = new Map(
    (
      await pool.query(
        `select rule_id, count(*) filter (where account_id = $2)::int as same, count(*)::int as today
         from account_alert_log where rule_id = any($1::uuid[]) and sent_at > now() - interval '24 hours' group by rule_id`,
        [fired.map((r) => r.id), account],
      )
    ).rows.map((x) => [x.rule_id, x]),
  );
  const due = fired.filter((r) => {
    const x = recent.get(r.id) ?? { same: 0, today: 0 };
    return !(x.same > 0 || x.today >= r.daily_cap);
  });
  if (!due.length) return;
  await pool.query(`select enqueue_jobs($1::jsonb)`, [
    JSON.stringify(due.map((r) => ({ workspace_id: ws, kind: "account_alert", key: `${r.id}:${account}`, payload: { rule_id: r.id, account_id: account }, delay_s: 0, max_attempts: 5 }))),
  ]);
}

/** account_alert: post the account to the rule's Slack. */
export const accountAlert = (pool: pg.Pool, fetchFn: typeof fetch = fetch): Handler => async (job) => {
  const { rule_id, account_id } = job.payload as { rule_id?: string; account_id?: string };
  const r = (await pool.query(`select id, rule, slack_sealed, enabled from account_alert_rules where id = $1`, [rule_id])).rows[0];
  const a = (await pool.query(`select id, name, domain, fit, intent, stage, why_now from accounts where id = $1`, [account_id])).rows[0];
  const rule = r ? parseRule(r.rule) : null;
  if (!r || !r.enabled || !a || !rule || !r.slack_sealed) return;
  let url: string;
  try {
    url = unseal(r.slack_sealed);
  } catch (e) {
    throw new JobError(`Can't read the Slack address: ${(e as Error).message}`, { retry: false });
  }
  if (!/^https:\/\/hooks\.slack\.com\//.test(url) || (await hostIsPrivate(new URL(url).hostname))) throw new JobError("Not a Slack webhook", { retry: false });
  const res = await fetchFn(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(slackAccountMessage(a, rule)), signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new JobError(`Slack answered ${res.status}`, { retry: res.status >= 500 || res.status === 429 });
  await pool.query(`insert into account_alert_log (rule_id, account_id, workspace_id) values ($1, $2, $3) on conflict do nothing`, [r.id, a.id, job.workspace_id]);
};

