// The router's jobs (docs/router.md 3.1 and 3.8):
//   route         route one lead in the background: a form send the router was too slow for, a new CRM contact, an
//                 import row, a lead that crossed the score threshold, Route again for many.
//   router_alert  tell the rep (Slack channel, else email), or the workspace owners when no one could take the lead.

import { slackNote } from "../../src/lib/delivery/send.ts";
import { JobError, type Handler, type Rpc } from "../../src/lib/jobs.ts";
import { leadRoutedEmail, mime, validAddress } from "../../src/lib/meetings/emails.ts";
import { explain, partText, pathWords } from "../../src/lib/router/explain.ts";
import { route } from "../../src/lib/router/server.ts";
import type { Facts, Reason, StepResult } from "../../src/lib/router/types.ts";
import { REASONS } from "../../src/lib/router/types.ts";
import type { Mailer } from "./meetings.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REASON_SET = new Set(Object.keys(REASONS));

async function call<T>(rpc: Rpc, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

export const routeJob =
  (rpc: Rpc): Handler =>
  async (job) => {
    const p = job.payload;
    const contact = String(p.contact ?? "");
    const reason = String(p.reason ?? "api");
    const key = String(p.key ?? job.key ?? "");
    if (!UUID.test(contact) || !REASON_SET.has(reason) || !key) throw new JobError("route needs a contact, a reason and a key", { retry: false });
    if (p.undo === true) await call(rpc, "router_undo", { p_ws: job.workspace_id, p_contact: contact });
    const byUser = typeof p.byUser === "string" && UUID.test(p.byUser) ? p.byUser : null;
    await route(rpc, { ws: job.workspace_id, contact, key, reason: reason as Reason, byUser, force: p.undo === true });
  };

type AlertInfo = {
  run: { id: string; workspace_id: string; contact_id: string | null; kind: "owner" | "held" | "unassigned"; owner: string | null; by: string | null; reason: Reason; queue_id: string | null; rule_id: string | null; steps: StepResult[]; facts: Facts; undone: boolean };
  sealed: string | null;
  owner: { id: string; name: string; email: string } | null;
  admins: string[];
  workspace: string;
  form: string | null;
  sending: { from_name: string | null; from_email: string | null };
};

export type AlertOpts = { mailer: Mailer | null; base: string; from: string; fetcher?: typeof fetch };

/** One alert per run: Slack when the router has a channel, else email. Held leads wait in Held instead. */
export const routerAlert =
  (rpc: Rpc, o: AlertOpts): Handler =>
  async (job) => {
    const id = String(job.payload.run ?? "");
    if (!UUID.test(id)) throw new JobError("router_alert needs a run", { retry: false });
    const info = await call<AlertInfo | null>(rpc, "router_alert_info", { p_run: id });
    if (!info || info.run.undone || info.run.kind === "held") return;
    const r = info.run;
    const f = r.facts;
    const lead = f?.lead?.name || f?.lead?.email || "A lead";
    const company = f?.company?.name ?? null;
    const size = f?.values?.["company.size"];
    const country = f?.values?.["lead.country"];
    const from = r.reason === "form" ? (info.form ?? "A form") : REASONS[r.reason];
    const decision = { result: r.kind === "owner" ? { kind: "owner" as const, user: r.owner ?? "", by: (r.by ?? "queue") as "queue" } : { kind: "unassigned" as const }, steps: r.steps };
    const why = r.kind === "owner" ? pathWords(decision) : "No one in the router could take it.";
    const base = o.base.replace(/\/$/, "");
    const link = r.kind === "owner" && r.contact_id ? `${base}/contacts/${r.contact_id}` : `${base}/routing/held`;
    const unassigned = r.kind === "unassigned";
    const who = unassigned ? "No one" : (info.owner?.name ?? "A rep");
    const detail = [company, [size, country].filter(Boolean).join(", ")].filter(Boolean).join(" ");
    const text = unassigned ? `A lead needs an owner: ${lead}${detail ? `, ${detail}` : ""} from ${from}` : `New lead for ${who}: ${lead}${detail ? `, ${detail}` : ""} from ${from}`;

    if (info.sealed) {
      const lines = explain(decision, f).filter((l) => l.mark === "ok" || l.step === "queue");
      const res = await slackNote(info.sealed, text, [
        { label: "Why", value: why },
        ...lines.slice(-2).map((l) => ({ label: l.title, value: l.parts.map(partText).join("") })),
        { label: "Open", value: `<${link}|Open in Claritia>` },
      ], o.fetcher);
      if (res.status === "retry") throw new JobError(res.error, { retryAfterS: res.retryAfterS ?? 60 });
      if (res.status === "done") return;
      // A broken webhook falls back to email, so the rep still hears.
    }
    if (!o.mailer) return;
    const to = unassigned ? info.admins : info.owner?.email ? [info.owner.email] : [];
    const fromEmail = info.sending.from_email ?? o.from;
    for (const addr of to.filter((a) => validAddress(a)).slice(0, 10)) {
      const parts = leadRoutedEmail({ lead, company, from, why, link, unassigned });
      const raw = mime({ from: { name: "Claritia", email: fromEmail }, to: addr, subject: parts.subject, html: parts.html, text: parts.text });
      await o.mailer.send({ from: fromEmail, to: addr, raw, tags: { router_run: r.id } });
    }
  };
