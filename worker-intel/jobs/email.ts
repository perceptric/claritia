// Sending on claritia-intel (docs/enrich-workflows-reports.md Part 0, supabase/migrations/039_email.sql, 067_resend.sql).
//   send: one workspace at a time. Each second it claims up to the workspace's rate and hands them to Resend in one
//         batch call (one by one when there's one, or when Resend refuses the batch for a bad address), or to Amazon
//         SES one by one for the domains on SES (src/lib/email/senders.ts, docs/ses-plan.md), then records
//         each answer. Runs about 50 seconds, then queues the next round if more wait. A rate limit ends the round
//         and the rest go back in line without using a try.
//   domain_check: makes the Resend domain if needed, asks Resend to verify, then checks every DNS record.
//   domain_remove: deletes a removed domain from Resend, unless it was added again.

import type pg from "pg";
import { checkRecords, systemResolver, type DomainRow, type Resolver } from "../../src/lib/email/domains.ts";
import { outcomeOf, SendError, type Outcome, type Outgoing, type Sender } from "../../src/lib/email/provider.ts";
import { renderMessage, type Claimed } from "../../src/lib/email/render.ts";
import type { Resend, ResendDomain } from "../../src/lib/email/resend.ts";
import { JobError, type Handler, type Rpc } from "../../src/lib/jobs.ts";
import { reconnectNote, viaMailbox, type Broken } from "../../src/lib/mailbox/server.ts";
import { mime } from "../../src/lib/meetings/emails.ts";

const NOT_SET = "Resend isn't set up on the worker (RESEND_API_KEY).";

async function call<T>(rpc: Rpc, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

export type { Sender };
export type SendOpts = { sender: Sender | null; base: string; secret?: string; roundMs?: number; sleep?: (ms: number) => Promise<void>; fetcher?: typeof fetch; system?: string };

type Result = { id: string; outcome: Outcome | "wait"; providerId: string | null; error: string | null; delayS?: number };

/** The parts of a rendered email as the person's own mailbox sends it: from their address, everything else the same. */
const fromName = (from: string) => /^"?(.*?)"?\s*<[^>]+>$/.exec(from)?.[1]?.replace(/\\"/g, '"') ?? null;
export function mailboxRaw(out: Outgoing, address: string): string {
  return mime({ from: { name: fromName(out.from), email: address }, to: out.to, replyTo: null, subject: out.subject, html: out.html, text: out.text, extra: out.headers });
}

/**
 * Messages that go from a person's own mailbox (Next step 6), one by one: sent there, held until it has room, or
 * (no mailbox, or its sign-in is gone) left for Resend with the rest of the round.
 */
export async function mailboxRound(rpc: Rpc, ws: string, batch: Claimed[], render: (m: Claimed) => Outgoing, o: Pick<SendOpts, "fetcher" | "sender" | "base" | "system">): Promise<{ results: Result[]; rest: Claimed[] }> {
  const results: Result[] = [];
  const rest: Claimed[] = [];
  const tell = async (b: Broken) => {
    const n = reconnectNote(b, o.base);
    await o.sender?.send({ from: o.system ?? "Claritia <alerts@mail.tryclaritia.com>", to: b.email, subject: n.subject, html: n.html, text: n.text, headers: [], tags: { mailbox: "reconnect" } }, `mailbox-reconnect:${b.mailbox}:${new Date().toISOString().slice(0, 10)}`);
  };
  for (const m of batch) {
    const user = (m as Claimed & { sender_user?: string | null }).sender_user;
    if (!user) {
      rest.push(m);
      continue;
    }
    let out: Outgoing;
    try {
      out = render(m);
    } catch {
      rest.push(m);
      continue;
    }
    const v = await viaMailbox(rpc, ws, user, (address) => mailboxRaw(out, address), { fetcher: o.fetcher, tell });
    if (v.kind === "none") rest.push(m);
    else if (v.kind === "full") results.push({ id: m.id, outcome: "wait", providerId: null, error: "The mailbox reached today's limit; it goes when there's room.", delayS: v.waitS });
    else if (v.out.status === "sent") results.push({ id: m.id, outcome: "ok", providerId: v.out.id, error: null });
    // A 5xx or 429 wasn't taken: tried again, alone. No answer may have gone: never sent again.
    else results.push({ id: m.id, outcome: v.out.status === "retry" ? "retry" : v.out.status === "unknown" ? "unknown" : "failed", providerId: null, error: v.out.error, delayS: v.out.status === "retry" ? v.out.retryAfterS : undefined });
  }
  return { results, rest };
}

/**
 * Hand one round to the provider. Every message gets exactly one result. A single send carries its message's key,
 * so a timeout or server error on it goes back in line and the repeat can't make a second email. A message that
 * was tried before always goes alone with that same key; only first tries share a batch.
 */
export async function sendRound(sender: Sender, batch: Claimed[], render: (m: Claimed) => Outgoing): Promise<Result[]> {
  const one = async (m: Claimed): Promise<Result> => {
    let out: Outgoing | null = null;
    try {
      out = render(m);
      return { id: m.id, outcome: "ok", providerId: await sender.send(out, `msg:${m.id}`), error: null };
    } catch (e) {
      const se = e instanceof SendError ? e : null;
      let outcome = outcomeOf(e);
      // The same key makes a repeat harmless, unless Resend said the key was used for other content (409). SES keeps
      // no keys (keyed is false), so an unclear answer there stays unknown and is never sent again.
      if (outcome === "unknown" && se?.status !== 409 && out && (sender.keyed?.(out) ?? true)) outcome = "retry";
      return { id: m.id, outcome, providerId: null, error: (e as Error).message, delayS: se?.retryAfterS };
    }
  };
  const fresh0 = batch.filter((m) => (m.attempts ?? 1) <= 1);
  const again = batch.filter((m) => (m.attempts ?? 1) > 1);
  let outs: Outgoing[];
  try {
    outs = fresh0.map(render);
  } catch {
    // One message that won't render shouldn't hold the rest: send them one by one.
    return Promise.all(batch.map(one));
  }
  // Only first tries that may share a batch call do (Resend); the rest (SES, or no batch call) go one by one.
  const can = (i: number) => !!sender.batch && (sender.batchable?.(outs[i]) ?? true);
  const fresh = fresh0.filter((_, i) => can(i));
  const out = outs.filter((_, i) => can(i));
  const alone = Promise.all([...again, ...fresh0.filter((_, i) => !can(i))].map(one));
  if (fresh.length <= 1) return [...(await Promise.all(fresh.map(one))), ...(await alone)];
  let results: Result[];
  try {
    const ids = await sender.batch!(fresh.map((m, i) => ({ out: out[i], key: `msg:${m.id}` })));
    results = fresh.map((m, i) => ({ id: m.id, outcome: "ok", providerId: ids[i], error: null }));
  } catch (e) {
    const se = e instanceof SendError ? e : null;
    if (se?.invalid) {
      // Resend refused the whole batch for something in it, and sent none: find the bad one by sending each.
      results = await Promise.all(fresh.map(one));
    } else {
      // A batch's messages may not travel together again, so its key can't protect a repeat: a server error is as
      // unclear as a timeout. A rate limit sent nothing.
      const outcome: Outcome = se?.later ? "later" : se?.retry || se?.unknown ? "unknown" : "failed";
      results = fresh.map((m) => ({ id: m.id, outcome, providerId: null, error: (e as Error).message, delayS: se?.retryAfterS }));
    }
  }
  return [...results, ...(await alone)];
}

export const send =
  (rpc: Rpc, o: SendOpts): Handler =>
  async (job, signal) => {
    const ws = job.workspace_id;
    if (!ws) throw new JobError("send needs a workspace", { retry: false });
    if (!o.sender) throw new JobError(NOT_SET, { retry: false });
    const sender = o.sender;
    const sleep = o.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
    const until = Date.now() + (o.roundMs ?? 50_000);
    let limit = 14;
    while (!signal.aborted) {
      if (Date.now() >= until) {
        // The rest of a long send in the bulk lane, a moment later; a new message for the workspace (enqueue_job
        // from the database) joins this job and takes it back to the normal lane.
        await call(rpc, "enqueue_job", { p_workspace: ws, p_kind: "send", p_key: ws, p_payload: { lane: "bulk" }, p_delay_s: 1, p_max_attempts: 3 });
        return;
      }
      const started = Date.now();
      const batch = await call<Claimed[]>(rpc, "send_claim", { p_ws: ws, p_limit: Math.min(limit, 100) });
      if (!batch?.length) return;
      limit = batch[0].per_second || limit;
      // A failure to record an answer leaves the message 'sending'; send_claim turns it 'unknown', never resent.
      const render = (m: Claimed) => renderMessage(m, { base: o.base, secret: o.secret });
      const own = await mailboxRound(rpc, ws, batch, render, o);
      const results = [...own.results, ...(own.rest.length ? await sendRound(sender, own.rest, render) : [])];
      await call(rpc, "send_done_many", { p_rows: results.map((r) => ({ id: r.id, outcome: r.outcome, provider_id: r.providerId, error: r.error, delay_s: r.delayS ?? 60 })) });
      const later = results.find((r) => r.outcome === "later");
      if (later) {
        // Rate limited: stop, and come back when Resend said to.
        await call(rpc, "enqueue_job", { p_workspace: ws, p_kind: "send", p_key: ws, p_payload: {}, p_delay_s: later.delayS ?? 60, p_max_attempts: 3 });
        return;
      }
      const wait = 1000 - (Date.now() - started);
      if (wait > 0) await sleep(wait);
    }
  };

const NO_DOMAIN = /already|exists|registered/i;

export const domainCheck =
  (rpc: Rpc, resend: Pick<Resend, "createDomain" | "getDomain" | "findDomain" | "verifyDomain"> | null, resolver: Resolver = systemResolver): Handler =>
  async (job) => {
    const id = String(job.payload.domain_id ?? "");
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new JobError("domain_check needs a domain", { retry: false });
    const d = await call<DomainRow | null>(rpc, "sending_domain_load", { p_id: id });
    if (!d) return;
    const update = (a: { provider: string | null; records?: unknown; status: string; error: string | null }) =>
      call(rpc, "sending_domain_update", { p_id: id, p_provider_id: a.provider, p_records: a.records ?? null, p_status: a.status, p_error: a.error });
    if (!resend) {
      await update({ provider: null, status: "pending", error: NOT_SET });
      return;
    }
    let rd: ResendDomain | null;
    try {
      rd = d.provider_id ? await resend.getDomain(d.provider_id) : null;
      if (!rd) {
        try {
          rd = await resend.createDomain(d.domain);
        } catch (e) {
          // A create whose answer was lost made it anyway: find it by name instead of failing.
          if (!(e instanceof SendError) || !(e.unknown || e.status === 409 || e.status === 403 || (e.status === 422 && NO_DOMAIN.test(e.message)))) throw e;
          rd = await resend.findDomain(d.domain);
          if (!rd) throw e;
        }
        // Keep Resend's id before anything else, so a crash after this never makes a second one.
        await update({ provider: rd.id, status: "pending", error: null });
      }
      if (rd.status !== "verified") {
        await resend.verifyDomain(rd.id);
        rd = (await resend.getDomain(rd.id)) ?? rd;
      }
    } catch (e) {
      // Show Resend's answer on the domain, then let the queue try again.
      await update({ provider: d.provider_id, status: "pending", error: (e as Error).message });
      throw e;
    }
    const { records, status } = await checkRecords(d.domain, rd, resolver);
    await update({
      provider: rd.id,
      records,
      status,
      error: status === "failed" ? "Resend couldn't find the records. Check them, then press Check." : rd.status === "temporary_failure" ? "Resend couldn't reach your DNS just now. It will look again." : null,
    });
  };

export const domainRemove =
  (pool: pg.Pool, resend: Pick<Resend, "deleteDomain" | "findDomain"> | null): Handler =>
  async (job) => {
    const domain = String(job.payload.domain ?? "");
    if (!domain) throw new JobError("domain_remove needs a domain", { retry: false });
    if (!resend) return;
    const again = await pool.query(`select 1 from sending_domains where domain = $1`, [domain]);
    if (again.rowCount) return;
    const pid = typeof job.payload.provider_id === "string" && job.payload.provider_id ? job.payload.provider_id : ((await resend.findDomain(domain))?.id ?? null);
    if (pid) await resend.deleteDomain(pid);
  };
