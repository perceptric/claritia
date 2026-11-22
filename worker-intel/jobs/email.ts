// Email on claritia-intel (docs/conversion-weeks.md week 9): send, SES events, and sending domain checks.
//   Needs AWS_SES_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, SES_SNS_TOPIC_ARN and SECRETS_KEY.

import type pg from "pg";
import { JobError, type Handler, type Job, type Rpc } from "../../src/lib/jobs.ts";
import { checkRecords, nodeResolver, type Resolver } from "../../src/lib/email/domains.ts";
import { sendMessage } from "../../src/lib/email/send.ts";
import { SesError, type Ses } from "../../src/lib/email/ses.ts";
import { linkKey } from "../../src/lib/email/track.ts";
import { APP_URL } from "../../src/lib/site.ts";

export type EmailDeps = { ses: Ses | null; topicArn?: string; base?: string; key?: Buffer; resolver?: Resolver };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const uuidOf = (job: Job, field: string) => {
  const id = String(job.payload[field] ?? "");
  if (!UUID.test(id)) throw new JobError(`${job.kind} needs ${field}`, { retry: false });
  return id;
};
const noSes = () => new JobError("Sending isn't set up: add AWS_SES_REGION, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY", { retryAfterS: 600 });

// Same as src/lib/billing.ts, which the worker can't import (it loads Stripe).
export const appBase = () => process.env.APP_URL?.trim().replace(/\/+$/, "") || APP_URL;

export const send =
  (rpc: Rpc, deps: EmailDeps): Handler =>
  async (job) => {
    const id = uuidOf(job, "message_id");
    await sendMessage({ rpc, ses: deps.ses, base: deps.base ?? appBase(), key: deps.key ?? linkKey() }, id, job.workspace_id);
  };

export const sesEvent =
  (rpc: Rpc): Handler =>
  async (job) => {
    const event = job.payload.event;
    if (!event || typeof event !== "object") throw new JobError("ses_event needs an event", { retry: false });
    const { error } = await rpc("ses_event_apply", { p_key: job.key, p_event: event });
    if (error) throw new Error(`ses_event_apply: ${error.message}`);
  };

export const domainCheck =
  (pool: pg.Pool, rpc: Rpc, deps: EmailDeps): Handler =>
  async (job) => {
    const id = uuidOf(job, "domain_id");
    const row = (
      await pool.query(
        `select d.id, d.workspace_id, d.domain, d.mail_from, d.region, d.dkim_tokens, l.config_set
         from sending_domains d left join send_limits l on l.workspace_id = d.workspace_id where d.id = $1`,
        [id],
      )
    ).rows[0] as { id: string; workspace_id: string; domain: string; mail_from: string; region: string | null; dkim_tokens: string[]; config_set: string | null } | undefined;
    if (!row) return;
    const ses = deps.ses;
    if (!ses) throw noSes();
    const topic = deps.topicArn ?? process.env.SES_SNS_TOPIC_ARN?.trim();
    // Without the topic, bounces and complaints would never come back, so no domain goes live without it.
    if (!topic) throw new JobError("Sending isn't set up: add SES_SNS_TOPIC_ARN", { retryAfterS: 600 });

    let tokens = row.dkim_tokens;
    let dkim: string | null = null;
    let mailFrom: string | null = null;
    let error: string | null = null;
    try {
      let configSet = row.config_set;
      if (!configSet) {
        configSet = `clr-${row.workspace_id}`;
        await ses.ensureConfigSet(configSet, topic);
        await pool.query(`update send_limits set config_set = $2, updated_at = now() where workspace_id = $1`, [row.workspace_id, configSet]);
      }
      if (tokens.length < 3) {
        const made = await ses.createIdentity(row.domain, configSet);
        tokens = made.dkimTokens;
        await ses.setMailFrom(row.domain, row.mail_from);
      }
      const now = await ses.getIdentity(row.domain);
      dkim = now.dkimStatus;
      mailFrom = now.mailFromStatus;
      if (now.dkimTokens.length === 3) tokens = now.dkimTokens;
      if (!mailFrom) await ses.setMailFrom(row.domain, row.mail_from);
    } catch (e) {
      if (e instanceof SesError && !e.retryable) error = e.message;
      else throw e;
    }
    const checks = await checkRecords({ ...row, region: ses.region, dkim_tokens: tokens }, deps.resolver ?? nodeResolver);
    const { error: dbError } = await rpc("sending_domain_checked", {
      p_id: id,
      p_region: ses.region,
      p_tokens: tokens.length === 3 ? tokens : null,
      p_checks: checks,
      p_ses_dkim: dkim,
      p_ses_mail_from: mailFrom,
      p_error: error,
    });
    if (dbError) throw new Error(`sending_domain_checked: ${dbError.message}`);
  };

export const domainDelete =
  (pool: pg.Pool, deps: EmailDeps): Handler =>
  async (job) => {
    const domain = String(job.payload.domain ?? "");
    if (!/^[a-z0-9.-]{3,200}$/.test(domain)) throw new JobError("domain_delete needs a domain", { retry: false });
    // Added again since: keep it.
    if ((await pool.query(`select 1 from sending_domains where domain = $1`, [domain])).rowCount) return;
    if (!deps.ses) throw noSes();
    await deps.ses.deleteIdentity(domain);
  };
