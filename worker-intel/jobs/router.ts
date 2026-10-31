// The router's jobs (docs/router.md 3.1, 3.8 and Part 17):
//   route         route one lead in the background: a form send the router was too slow for, a new CRM contact, an
//                 import row, a lead that crossed the score threshold, Route again for many, and a lead passed on
//                 after a missed response time (to the next rep, or to the manager).
//   router_alert  tell the rep (Slack app message, else the Slack channel, else email), or the workspace owners when
//                 no one could take the lead. Each part (the message, the channel post, each address) is claimed in
//                 router_alert_sent before it goes, so a retry or a second worker never tells anyone twice.
//   router_sla    nudge the rep before the response time ends, or tell them it ran out.
//   meeting_team_run  write a team meeting as its queue's run when the booking couldn't (src/lib/meetings/team.ts).

import { slackNote } from "../../src/lib/delivery/send.ts";
import { fromHeader, outcomeOf, SendError } from "../../src/lib/email/provider.ts";
import type { Resend } from "../../src/lib/email/resend.ts";
import { JobError, type Handler, type Rpc } from "../../src/lib/jobs.ts";
import { leadRoutedEmail, mime, slaEmail, validAddress } from "../../src/lib/meetings/emails.ts";
import { buttons, esc, fields, section, slackDm, tokenOf } from "../../src/lib/slack/app.ts";
import { explain, minutesWords, partText, pathWords } from "../../src/lib/router/explain.ts";
import { route, type Inputs, type LiveRouter, type SourceRef } from "../../src/lib/router/server.ts";
import { qualifyContact } from "../../src/lib/enrich/server.ts";
import type { Facts, Reason, StepResult } from "../../src/lib/router/types.ts";
import { REASONS } from "../../src/lib/router/types.ts";
import type { Mailer } from "./meetings.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// A booking's run is written by meeting_team_run, never routed here.
const REASON_SET = new Set(Object.keys(REASONS).filter((r) => r !== "booking"));

async function call<T>(rpc: Rpc, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

export const meetingTeamRun =
  (rpc: Rpc): Handler =>
  async (job) => {
    const p = job.payload;
    if (!job.workspace_id || !UUID.test(String(p.p_meeting ?? "")) || !UUID.test(String(p.p_owner ?? "")) || typeof p.p_queue !== "string") throw new JobError("meeting_team_run needs a meeting, an owner and a queue", { retry: false });
    await call(rpc, "meeting_team_run", { ...p, p_ws: job.workspace_id });
  };

export const routeJob =
  (rpc: Rpc): Handler =>
  async (job) => {
    const p = job.payload;
    const contact = String(p.contact ?? "");
    const reason = String(p.reason ?? "api");
    const key = String(p.key ?? job.key ?? "");
    const ws = job.workspace_id;
    if (!ws || !UUID.test(contact) || !REASON_SET.has(reason) || !key) throw new JobError("route needs a workspace, a contact, a reason and a key", { retry: false });
    if (reason === "sla") return passOn(rpc, ws, contact, key, String(p.sla ?? ""));
    if (p.undo === true) await call(rpc, "router_undo", { p_ws: ws, p_contact: contact });
    const byUser = typeof p.byUser === "string" && UUID.test(p.byUser) ? p.byUser : null;
    // An import or a CRM sync has its own qualify job for each lead: no waiting on Claude here (docs/router.md 3.8).
    const inline = reason !== "import" && reason !== "crm";
    // A form send the router was too slow for carries what the send captured: its connection, its mapped answers,
    // the run's first booking state and the policy it resolved (docs/routing-workflow.md Section 13).
    const captured = formCapture(p);
    const live = captured.policy ? await call<LiveRouter | null>(rpc, "routing_live", { p_ws: ws, p_policy: captured.policy }) : undefined;
    // Held's "let through" for many leads queues them with skipSpam: the spam check doesn't hold them again.
    await route(rpc, {
      ws,
      contact,
      key,
      reason: reason as Reason,
      byUser,
      force: p.undo === true,
      skipSpam: p.skipSpam === true,
      ...(inline ? { qualify: (c: string) => qualifyContact(rpc, c, { timeoutMs: 2900 }) } : {}),
      ...(live !== undefined ? { live } : {}),
      source: captured.source,
      inputs: captured.inputs,
      booking: captured.booking,
      submission: captured.submission,
    });
  };

/** A route job's captured form inputs, checked: anything malformed is left out, never guessed. */
export function formCapture(p: Record<string, unknown>): { source: SourceRef | null; inputs: Inputs | null; booking: "not_requested" | "awaiting_selection" | undefined; policy: string | null; submission: string | null } {
  const src = p.source as { id?: unknown; revision?: unknown } | undefined;
  const source = src && typeof src.id === "string" && UUID.test(src.id) && typeof src.revision === "number" ? { id: src.id, revision: src.revision } : null;
  const i = p.inputs as { values?: unknown; provenance?: unknown; issues?: unknown } | undefined;
  const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
  const inputs =
    i && obj(i.values)
      ? {
          values: obj(i.values)!,
          provenance: (obj(i.provenance) ?? {}) as Inputs["provenance"],
          issues: (Array.isArray(i.issues) ? i.issues : []).filter((x): x is Inputs["issues"][number] => !!obj(x) && (x as { code?: unknown }).code === "source_mapping_mismatch" && typeof (x as { field?: unknown }).field === "string"),
        }
      : null;
  const booking = p.booking === "awaiting_selection" || p.booking === "not_requested" ? p.booking : undefined;
  const policy = typeof p.policy === "string" && UUID.test(p.policy) ? p.policy : null;
  const submission = typeof p.submission === "string" && UUID.test(p.submission) ? p.submission : null;
  return { source, inputs, booking, policy, submission };
}

type SlaInfo = {
  sla: { run_id: string; workspace_id: string; contact_id: string; user_id: string; status: string; next: "route" | "manager" | "nudge"; manager: string | null; due_at: string };
  minutes: number;
  rep: { id: string; name: string; email: string } | null;
  lead: { id: string; name: string | null; email: string | null; company: string | null; owner: string | null } | null;
  passed: string[];
  manager_member: boolean;
  version: number | null;
  slack: string | null;
  sealed: string | null;
  sending: { from_name: string | null; from_email: string | null };
};

/**
 * A missed response time: the lead goes to the manager, or is routed again without every rep who let it wait. Only
 * while the rep who missed still owns it (someone may have reassigned it by hand meanwhile). The run's first line says
 * why it moved.
 */
async function passOn(rpc: Rpc, ws: string, contact: string, key: string, run: string) {
  if (!UUID.test(run)) throw new JobError("A response-time route needs its run", { retry: false });
  const info = await call<SlaInfo | null>(rpc, "router_sla_info", { p_run: run });
  if (!info || info.sla.status !== "missed" || info.lead?.owner !== info.sla.user_id) return;
  const before: StepResult[] = [{ step: "sla", ok: false, user: info.sla.user_id, minutes: info.minutes }];
  if (info.sla.next === "manager" && info.sla.manager && info.manager_member && info.sla.manager !== info.sla.user_id) {
    const res = await call<{ status: string }>(rpc, "router_commit", {
      p_ws: ws,
      p_contact: contact,
      p_key: key,
      p_reason: "sla",
      p_version: info.version,
      p_result: { kind: "owner", user: info.sla.manager, by: "hand" },
      p_steps: [...before, { step: "hand", ok: true, user: info.sla.manager, by_user: null }],
      p_facts: {},
      p_ms: 0,
      p_set_company: false,
      p_by_user: null,
      p_pick: null,
    });
    if (res.status === "ok" || res.status === "dup" || res.status === "gone") return;
    // The manager can't take it any more: route it again instead.
  }
  await route(rpc, { ws, contact, key, reason: "sla", skipSpam: true, passed: [...new Set([...info.passed, info.sla.user_id])], before });
}

/** Nudge the rep before the deadline (`nudge`), or tell them it passed when the router only tells (`missed`). */
export const routerSla =
  (rpc: Rpc, o: AlertOpts): Handler =>
  async (job) => {
    const run = String(job.payload.run ?? "");
    const kind = job.payload.kind === "missed" ? "missed" : "nudge";
    if (!UUID.test(run)) throw new JobError("router_sla needs a run", { retry: false });
    const info = await call<SlaInfo | null>(rpc, "router_sla_info", { p_run: run });
    if (!info || !info.rep || !info.lead) return;
    // Acted on, reassigned or taken back since: nothing to say.
    if (kind === "nudge" && info.sla.status !== "open") return;
    if (kind === "missed" && info.sla.status !== "missed") return;
    if (info.lead.owner !== info.sla.user_id) return;
    const lead = info.lead.name || info.lead.email || "A lead";
    const base = o.base.replace(/\/$/, "");
    const link = `${base}/contacts/${info.lead.id}`;
    const leftMs = Date.parse(info.sla.due_at) - Date.now();
    const left = kind === "nudge" ? minutesWords(Math.max(1, Math.round(leftMs / 60_000))) : null;
    const text = left ? `${lead} is waiting: ${left} left to reach out` : `${lead} waited past the ${minutesWords(info.minutes)} response time`;

    const token = tokenOf(info.slack);
    if (token && info.rep.email) {
      const res = await slackDm(token, info.rep.email, text, [
        section(`*${esc(text)}*`),
        ...fields(info.lead.company ? [{ label: "Company", value: info.lead.company }] : []),
        buttons([{ text: "Open lead", url: link }, { text: "Mark contacted", action: "sla_done", value: info.lead.id, primary: true }]),
      ], o.fetcher);
      if (res.status === "retry") throw new JobError(res.error, { retryAfterS: res.retryAfterS ?? 60 });
      if (res.status === "done") return;
    }
    if (info.sealed) {
      const res = await slackNote(info.sealed, `${info.rep.name}: ${text}`, [{ label: "Open", value: `<${link}|Open in Claritia>` }], o.fetcher);
      if (res.status === "retry") throw new JobError(res.error, { retryAfterS: res.retryAfterS ?? 60 });
      if (res.status === "done") return;
    }
    if (!o.mailer || !validAddress(info.rep.email)) return;
    const fromEmail = info.sending.from_email ?? o.from;
    const parts = slaEmail({ lead, company: info.lead.company, left, link });
    const raw = mime({ from: { name: "Claritia", email: fromEmail }, to: info.rep.email, subject: parts.subject, html: parts.html, text: parts.text });
    await o.mailer.send({ from: fromEmail, to: info.rep.email, raw, tags: { router_sla: run } });
  };

type AlertInfo = {
  run: { id: string; workspace_id: string; contact_id: string | null; kind: "owner" | "held" | "unassigned"; owner: string | null; by: string | null; reason: Reason; queue_id: string | null; rule_id: string | null; steps: StepResult[]; facts: Facts; undone: boolean };
  sealed: string | null;
  /** The Slack app's bot token (sealed), when the workspace added it. */
  slack: string | null;
  owner: { id: string; name: string; email: string } | null;
  admins: string[];
  workspace: string;
  form: string | null;
  sending: { from_name: string | null; from_email: string | null };
};

export type AlertOpts = { mailer: Mailer | null; base: string; from: string; fetcher?: typeof fetch; batcher?: Pick<Resend, "batch"> | null };

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

    // Parts this job may send; one another worker (or an earlier try) claimed is theirs.
    const claim = async (parts: string[]) => new Set(parts.length ? await call<string[]>(rpc, "router_alert_claim", { p_run: r.id, p_parts: parts }) : []);
    const giveBack = (parts: string[]) => (parts.length ? call(rpc, "router_alert_unclaim", { p_run: r.id, p_parts: parts }) : Promise.resolve());

    const token = tokenOf(info.slack);
    if (token && !unassigned && info.owner?.email && r.contact_id) {
      if (!(await claim(["dm"])).has("dm")) return;
      const lines = explain(decision, f).filter((l) => l.mark === "ok" || l.step === "queue" || l.step === "sla");
      const res = await slackDm(token, info.owner.email, text, [
        section(`*${esc(text)}*`),
        ...fields([{ label: "Why", value: why }, ...lines.slice(-2).map((l) => ({ label: l.title, value: l.parts.map(partText).join("") }))]),
        buttons([{ text: "Open lead", url: link }, { text: "Mark contacted", action: "sla_done", value: r.contact_id, primary: true }]),
      ], o.fetcher);
      if (res.status !== "done") await giveBack(["dm"]);
      if (res.status === "retry") throw new JobError(res.error, { retryAfterS: res.retryAfterS ?? 60 });
      // Sent: the channel still hears when the router has one. Not in Slack: the channel or email below.
      if (res.status === "done" && !info.sealed) return;
      if (res.status === "done") {
        if ((await claim(["channel"])).has("channel"))
          await slackNote(info.sealed, text, [{ label: "Why", value: why }, { label: "Open", value: `<${link}|Open in Claritia>` }], o.fetcher).catch(() => undefined);
        return;
      }
    }
    if (info.sealed) {
      if (!(await claim(["channel"])).has("channel")) return;
      const lines = explain(decision, f).filter((l) => l.mark === "ok" || l.step === "queue");
      const res = await slackNote(info.sealed, text, [
        { label: "Why", value: why },
        ...lines.slice(-2).map((l) => ({ label: l.title, value: l.parts.map(partText).join("") })),
        { label: "Open", value: `<${link}|Open in Claritia>` },
      ], o.fetcher);
      if (res.status === "retry") {
        await giveBack(["channel"]);
        throw new JobError(res.error, { retryAfterS: res.retryAfterS ?? 60 });
      }
      if (res.status === "done") return;
      // A broken webhook falls back to email, so the rep still hears.
    }
    if (!o.mailer) return;
    const to = unassigned ? info.admins : info.owner?.email ? [info.owner.email] : [];
    const fromEmail = info.sending.from_email ?? o.from;
    const want = [...new Set(to.filter((a) => validAddress(a)).map((a) => a.trim().toLowerCase()))].slice(0, 10);
    const mine = await claim(want.map((a) => `email:${a}`));
    const go = want.filter((a) => mine.has(`email:${a}`));
    if (!go.length) return;
    const parts = leadRoutedEmail({ lead, company, from, why, link, unassigned });
    const again: string[] = [];
    let failed: string | null = null;
    const settle = async (addrs: string[], e: unknown) => {
      const out = outcomeOf(e);
      if (out === "later" || out === "retry") {
        again.push(...addrs);
        await giveBack(addrs.map((a) => `email:${a}`));
      } else if (out === "failed") failed = (e as Error).message;
      // unknown: it may have gone, so the claim stays.
    };
    const one = async (addr: string) => {
      const raw = mime({ from: { name: "Claritia", email: fromEmail }, to: addr, subject: parts.subject, html: parts.html, text: parts.text });
      await o.mailer!.send({ from: fromEmail, to: addr, raw, tags: { router_run: r.id } }).catch((e) => settle([addr], e));
    };
    if (o.batcher && go.length > 1) {
      // Several owners to tell: one call to Resend's batch API (no attachment here), keyed so a repeat is harmless.
      try {
        await o.batcher.batch(go.map((addr) => ({ out: { from: fromHeader("Claritia", fromEmail), to: addr, subject: parts.subject, html: parts.html, text: parts.text, headers: [], tags: { router_run: r.id } }, key: `router_alert:${r.id}:${addr}` })));
      } catch (e) {
        if (e instanceof SendError && e.invalid) for (const addr of go) await one(addr);
        else await settle(go, e);
      }
    } else for (const addr of go) await one(addr);
    if (again.length) throw new JobError("The email provider said not now; trying again", { retryAfterS: 60 });
    if (failed) throw new JobError(failed, { retry: false });
  };
