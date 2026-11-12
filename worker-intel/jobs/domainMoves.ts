// Moving sending domains to Amazon SES (docs/ses-plan.md Step 4, supabase/migrations/146_domain_move_emails.sql). Runs
// once an hour on the worker while EMAIL_SES_MOVE=1: starts the move for verified Resend domains, then emails each
// workspace's owners the records once they're ready, and reminders at 7 and 14 days while the move waits. A step is
// claimed before anything goes, so two workers never send it twice, and given back only when nothing went out.

import type { DnsRecord } from "../../src/lib/email/domains.ts";
import { moveEmail } from "../../src/lib/email/moveEmail.ts";
import { outcomeOf, type Sender } from "../../src/lib/email/provider.ts";
import type { Rpc } from "../../src/lib/jobs.ts";

type Due = { id: string; domain: string; workspace_id: string; records: DnsRecord[]; step: 0 | 1 | 2; owners: string[] };

async function call<T>(rpc: Rpc, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

export const moveFrom = (env: NodeJS.ProcessEnv = process.env) => env.ALERTS_FROM?.trim() || "Claritia <alerts@mail.tryclaritia.com>";

export async function domainMoves(rpc: Rpc, o: { on: boolean; sender: Sender | null; base: string; from?: string }): Promise<{ started: number; sent: number; skipped: number }> {
  const out = { started: 0, sent: 0, skipped: 0 };
  if (!o.on || !o.sender) return out;
  out.started = Number(await call<number>(rpc, "domain_moves_start", { p_limit: 50 })) || 0;
  for (const d of await call<Due[]>(rpc, "domain_moves_due", { p_limit: 100 })) {
    if (!d.owners.length) {
      out.skipped++;
      continue;
    }
    if (!(await call<boolean>(rpc, "domain_move_claim", { p_id: d.id, p_step: d.step }))) continue;
    const mail = moveEmail({ domain: d.domain, records: d.records, step: d.step, base: o.base });
    let went = 0;
    let unclear = 0;
    for (const to of d.owners) {
      try {
        await o.sender.send({ from: o.from ?? moveFrom(), to, subject: mail.subject, html: mail.html, text: mail.text, headers: [], tags: { kind: "domain_move", step: String(d.step) } }, `domain-move:${d.id}:${d.step}:${to}`);
        went++;
      } catch (e) {
        if (outcomeOf(e) === "unknown") unclear++;
      }
    }
    // Nothing went out and nothing may have: the step goes back, and the next hour tries again.
    if (!went && !unclear) await call(rpc, "domain_move_unclaim", { p_id: d.id, p_step: d.step });
    else out.sent++;
  }
  return out;
}
