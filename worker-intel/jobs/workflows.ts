// Workflows on claritia-intel (docs/enrich-workflows-reports.md 2.3).
//   workflow_run  one workspace at a time: claims due runs and moves each forward until it waits or ends. Each step
//                 writes its ledger row before acting (workflow_step_begin) and its result after (workflow_step_done),
//                 so a run picked up again after a crash never repeats a finished step. Every outside action carries
//                 a key made from the run and step: the email's dedupe, the route key, the task's key, the webhook's
//                 delivery id. A step found half-done after a crash is done again only when its target honors that
//                 key; a webhook or a Slack message is marked unknown instead and the run goes on.

import { signature } from "../../src/lib/delivery/send.ts";
import { enrichContact, qualifyContact, type Keys } from "../../src/lib/enrich/server.ts";
import { JobError, type Handler, type Rpc } from "../../src/lib/jobs.ts";
import { hostIsPrivate } from "../../src/lib/privateNet.ts";
import { route } from "../../src/lib/router/server.ts";
import { slackDm, tokenOf } from "../../src/lib/slack/app.ts";
import { cleanBody } from "../../src/lib/workflows/check.ts";
import { branchYes, goalMet, mayEnter, meetingFor, nextReminder, reminderMove, splitSide, waitUntil } from "../../src/lib/workflows/engine.ts";
import { keptManageToken, manageUrl } from "../../src/lib/meetings/links.ts";
import { validZone } from "../../src/lib/meetings/time.ts";
import { enterPath, find, nextAfter, type PathName } from "../../src/lib/workflows/tree.ts";
import type { Body, Step } from "../../src/lib/workflows/types.ts";
import { valuesOf, webhookSecret, type Facts } from "../../src/lib/workflows/facts.ts";

async function call<T>(rpc: Rpc, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

type Claimed = { id: string; workflow_id: string; workflow_name: string; version: number; contact_id: string; at_step: string | null; wait: { step: string; event?: string; since?: string; until?: string; meeting?: string; start?: string } | null; started_at: string; next_at: string; body: unknown };

/** A booked meeting of the run's contact (migration 101's workflow_meetings). */
type MeetingRow = { id: string; start_at: string; type_id: string | null; guest_tz: string | null; url: string | null; token_hash: string; token_sealed: string | null };

const meetingsOf = (rpc: Rpc, run: string) => call<MeetingRow[]>(rpc, "workflow_meetings", { p_run: run });

/** The meeting's merge fields for an email: its time in the guest's zone, its join link and the guest's reschedule link. */
export function meetingVars(m: MeetingRow | null, o: { base?: string; secret?: string; tz?: string | null }): Record<string, string | null> {
  if (!m) return { meeting_time: null, meeting_link: null, reschedule_link: null };
  const zone = [m.guest_tz, o.tz].find((z) => z && validZone(z)) ?? "UTC";
  const when = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(Date.parse(m.start_at));
  const token = o.base ? keptManageToken({ token_hash: m.token_hash, token_sealed: m.token_sealed }, o.secret) : null;
  return { meeting_time: when, meeting_link: m.url && /^https:\/\//.test(m.url) ? m.url : null, reschedule_link: token && o.base ? manageUrl(o.base, token) : null };
}

export type WorkflowDeps = {
  keys?: Keys;
  /** The app's address, for the reschedule link in reminder emails. */
  base?: string;
  /** SECRETS_KEY: signs webhooks per workflow. */
  secret?: string;
  fetcher?: typeof fetch;
  resolve?: Parameters<typeof hostIsPrivate>[1];
  now?: () => number;
  roundMs?: number;
  /** Stand-ins for tests. */
  enrich?: typeof enrichContact;
  qualify?: typeof qualifyContact;
  route?: typeof route;
  slack?: typeof slackDm;
};

type Outcome = { status: "done" | "skipped" | "failed" | "unknown"; result?: Record<string, unknown>; path?: PathName; end?: string };

const today = (now: number, days: number) => new Date(now + days * 86_400_000).toISOString().slice(0, 10);

async function runStep(rpc: Rpc, ws: string, run: Claimed, step: Step, f: Facts, d: WorkflowDeps, redo: boolean): Promise<Outcome> {
  const now = d.now?.() ?? Date.now();
  const c = f.contact;
  switch (step.kind) {
    case "branch":
      return { status: "done", path: branchYes(step, valuesOf(f)) ? "yes" : "no" };
    case "split":
      return { status: "done", path: splitSide(step, run.id) };
    case "email": {
      if (c.suppressed) return { status: "skipped", result: { why: "the address is suppressed" } };
      if (!c.email) return { status: "skipped", result: { why: "no email" } };
      // The meeting's fields (reminders): the meeting the workflow counts back from, when it has one.
      const meeting = await meetingsOf(rpc, run.id)
        .then((ms) => meetingFor(ms, cleanBody(run.body).trigger, now))
        .catch(() => null);
      const vars = { first_name: c.first_name, last_name: c.last_name, company: (f.company?.name as string | undefined) ?? null, title: c.title, ...meetingVars(meeting, { base: d.base, secret: d.secret, tz: f.tz }) };
      const owner = step.from === "owner" ? f.owner : null;
      const id = await call<string | null>(rpc, "workflow_email", { p_run: run.id, p_step: step.id, p_vars: vars, p_from_name: owner?.name ?? null, p_reply_to: owner?.email ?? null });
      return { status: "done", result: id ? { message: id } : { message: null, why: "queued before" } };
    }
    case "enrich": {
      const r = await (d.enrich ?? enrichContact)(rpc, c.id, { keys: d.keys, fetcher: d.fetcher, trigger: "workflow", force: true });
      return { status: "done", result: { fields: r.fields } };
    }
    case "qualify": {
      const r = await (d.qualify ?? qualifyContact)(rpc, c.id, { timeoutMs: 15_000 });
      return { status: r.status === "decided" || r.status === "same" ? "done" : "skipped", result: { outcome: r.decision?.outcome ?? null, why: r.status === "decided" || r.status === "same" ? undefined : r.status } };
    }
    case "route": {
      // No second routing (docs/scheduling-plan.md Part 13.5): a lead Routing just routed keeps that rep.
      if (await call<boolean>(rpc, "router_recent", { p_ws: ws, p_contact: c.id, p_minutes: 10 })) return { status: "skipped", result: { why: "Already routed" } };
      const r = await (d.route ?? route)(rpc, { ws, contact: c.id, key: `wf:${run.id}:${step.id}`, reason: "api" });
      return { status: "done", result: { routed: r.status, owner: "result" in r && r.result.kind === "owner" ? r.result.user : null } };
    }
    case "update": {
      const values = step.field.startsWith("f.") ? { fields: { [step.field.slice(2)]: step.value || null } } : { [step.field]: step.value || null };
      const { error } = await rpc("contact_update", { p_id: c.id, p_source: "workflow", p_values: values });
      return error ? { status: "failed", result: { error: error.message.slice(0, 200) } } : { status: "done" };
    }
    case "list": {
      const ok = await call<boolean>(rpc, "workflow_list", { p_run: run.id, p_action: step.action, p_segment: step.segment });
      return ok ? { status: "done" } : { status: "failed", result: { error: "The list is gone" } };
    }
    case "task": {
      const assignee = step.assignee === "owner" ? (f.owner?.id ?? null) : step.assignee;
      await call(rpc, "workflow_task", { p_run: run.id, p_step: step.id, p_title: step.title, p_assignee: assignee, p_due: today(now, step.dueDays) });
      return { status: "done" };
    }
    case "crm": {
      const n = await call<number>(rpc, "workflow_crm", { p_run: run.id });
      return n ? { status: "done", result: { sources: n } } : { status: "skipped", result: { why: "no CRM connected" } };
    }
    case "slack": {
      // A Slack message has no key Slack honors: one found half-sent after a crash isn't sent again.
      if (redo) return { status: "unknown", result: { why: "the worker stopped mid-send" } };
      const who = step.to === "owner" ? (f.owner?.id ?? null) : step.to;
      if (!who) return { status: "skipped", result: { why: "no rep" } };
      const t = await call<{ sealed: string | null; email: string | null }>(rpc, "workflow_slack", { p_run: run.id, p_user: who });
      const token = tokenOf(t.sealed);
      if (!token || !t.email) return { status: "skipped", result: { why: token ? "not a teammate" : "Slack isn't connected" } };
      const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "A lead";
      const text = `${step.text}\n${name}${f.company?.name ? ` at ${String(f.company.name)}` : ""}`;
      try {
        const r = await (d.slack ?? slackDm)(token, t.email, text, [], d.fetcher);
        return r.status === "done" ? { status: "done" } : { status: "failed", result: { error: r.error.slice(0, 200) } };
      } catch {
        return { status: "unknown", result: { why: "no answer from Slack" } };
      }
    }
    case "webhook": {
      if (redo) return { status: "unknown", result: { why: "the worker stopped mid-send" } };
      let u: URL;
      try {
        u = new URL(step.url);
      } catch {
        return { status: "failed", result: { error: "Not an address" } };
      }
      if (u.protocol !== "https:" || u.username || u.password) return { status: "failed", result: { error: "Webhooks need an https:// address" } };
      if (await hostIsPrivate(u.hostname, d.resolve)) return { status: "failed", result: { error: "That address is on a private network" } };
      const body = JSON.stringify({
        event: "workflow.step",
        delivery_id: `${run.id}:${step.id}`,
        workflow: { id: run.workflow_id, name: run.workflow_name, version: run.version },
        contact: { id: c.id, email: c.email, first_name: c.first_name, last_name: c.last_name, title: c.title, country: c.country, lifecycle: c.lifecycle },
        company: f.company,
      });
      const headers = { "content-type": "application/json", "x-claritia-delivery": `${run.id}:${step.id}`, "x-claritia-event": "workflow.step", "x-claritia-signature": signature(webhookSecret(run.workflow_id, d.secret), body) };
      try {
        const res = await (d.fetcher ?? fetch)(u.href, { method: "POST", headers, body, redirect: "manual", signal: AbortSignal.timeout(10_000) });
        return res.ok ? { status: "done", result: { status: res.status } } : { status: "failed", result: { error: `It answered ${res.status}` } };
      } catch {
        // Sent, maybe: receivers dedupe on x-claritia-delivery, and it isn't sent again from here.
        return { status: "unknown", result: { why: "no answer" } };
      }
    }
    case "exit":
      return { status: "done", end: "exit step" };
    default:
      return { status: "skipped" };
  }
}

/**
 * Move one run forward until it waits or ends. Returns what it did, for tests.
 */
export async function advance(rpc: Rpc, ws: string, run: Claimed, d: WorkflowDeps): Promise<"waiting" | "done" | "exited" | "failed" | "active"> {
  const now = () => d.now?.() ?? Date.now();
  const body: Body = cleanBody(run.body);
  const done = (step: string | null, status: string, result: Record<string, unknown> | null, next: string | null, nextAt: number | null, wait: unknown, runStatus: string, exit?: string) =>
    call<boolean>(rpc, "workflow_step_done", { p_run: run.id, p_step: step, p_visit: 1, p_status: status, p_result: result ?? {}, p_next: next, p_next_at: nextAt ? new Date(nextAt).toISOString() : null, p_wait: wait ?? null, p_run_status: runStatus, p_exit: exit ?? null });

  let f = await call<Facts | null>(rpc, "workflow_facts", { p_run: run.id });
  if (!f) {
    await done(null, "done", null, null, null, null, "exited", "contact gone");
    return "exited";
  }
  if (f.contact.deleted) {
    if (f.contact.merged_into) {
      // Follows the contact it was merged into, or ends when that contact is already in this workflow.
      if (!(await call<boolean>(rpc, "workflow_follow", { p_run: run.id, p_contact: f.contact.merged_into }))) return "exited";
      f = await call<Facts | null>(rpc, "workflow_facts", { p_run: run.id });
    }
    if (!f || f.contact.deleted) {
      await done(null, "done", null, null, null, null, "exited", "contact deleted");
      return "exited";
    }
  }

  let at = run.at_step;
  let wait = run.wait;
  // A new run (no step yet, not waiting): the "only if" check, then the first step.
  if (!at && !wait) {
    if (!mayEnter(body, valuesOf(f))) {
      await done(null, "done", null, null, null, null, "exited", "didn't match");
      return "exited";
    }
    at = body.steps[0]?.id ?? null;
  }

  for (let guard = 0; guard < 80; guard++) {
    const goal = goalMet(body.goals, { booked: f.booked, lifecycle: f.contact.lifecycle, outcome: f.contact.qualify_outcome });
    if (goal) {
      await done(null, "done", null, null, null, null, "exited", goal.kind === "meeting_booked" ? "booked a meeting" : "reached the goal");
      return "exited";
    }
    if (!at) {
      await done(null, "done", null, null, null, null, "done");
      return "done";
    }
    const w = find(body.steps, at);
    if (!w) {
      await done(null, "done", null, null, null, null, "done");
      return "done";
    }
    const step = w.step;

    // Before the meeting (a reminder): parks until that long before the contact's next booked meeting, checked again
    // each time it wakes, and a meeting that moves or is canceled wakes it (migration 101). A reminder too late to send
    // skips to the next one; with no meeting left the run ends.
    if (step.kind === "wait" && step.before === "meeting") {
      if (wait?.step !== step.id) await call(rpc, "workflow_step_begin", { p_run: run.id, p_step: step.id, p_visit: 1 });
      const m = meetingFor(await meetingsOf(rpc, run.id), body.trigger, now());
      if (!m) {
        await done(step.id, "skipped", { why: "no booked meeting" }, null, null, null, "exited", "no meeting");
        return "exited";
      }
      const move = reminderMove(step, Date.parse(m.start_at), now());
      if (move.kind === "park") {
        await done(null, "running", null, step.id, move.at, { step: step.id, meeting: m.id, start: m.start_at }, "waiting");
        return "waiting";
      }
      const next = move.kind === "late" ? nextReminder(body.steps, step.id) : nextAfter(body.steps, step.id);
      if (move.kind === "late" && !next) {
        await done(step.id, "skipped", { why: "too close to the meeting" }, null, null, null, "done");
        return "done";
      }
      const live = await done(step.id, move.kind === "late" ? "skipped" : "done", move.kind === "late" ? { why: "too close to the meeting" } : null, next, null, null, next ? "active" : "done");
      if (!next) return "done";
      if (!live) return "active";
      wait = null;
      at = next;
      continue;
    }

    // Waits park the run; the ledger row stays 'running' until the time comes.
    if (step.kind === "wait") {
      if (wait?.step === step.id) {
        if (Date.parse(run.next_at) > now()) return "waiting";
        const next = nextAfter(body.steps, step.id);
        const live = await done(step.id, "done", null, next, null, null, next ? "active" : "done");
        if (!next) return "done";
        if (!live) return "active";
        wait = null;
        at = next;
        continue;
      }
      await call(rpc, "workflow_step_begin", { p_run: run.id, p_step: step.id, p_visit: 1 });
      const until = waitUntil(step, now(), f.tz);
      await done(null, "running", null, step.id, until, { step: step.id }, "waiting");
      return "waiting";
    }
    if (step.kind === "wait_until") {
      if (wait?.step === step.id && wait.since && wait.until) {
        // A named product event needs migration 082's four-argument form; every other wait keeps the original call.
        const happened = await call<boolean>(rpc, "workflow_event_since", { p_run: run.id, p_kind: step.event, p_since: wait.since, ...(step.event === "product.used" ? { p_name: step.name ?? null } : {}) });
        const over = now() >= Date.parse(wait.until);
        if (!happened && !over) {
          await done(null, "running", null, step.id, Math.min(Date.parse(wait.until), now() + 5 * 60_000), wait, "waiting");
          return "waiting";
        }
        // The event wins when both are true at once: it happened in time.
        const path: PathName = happened ? "yes" : "no";
        const next = enterPath(body.steps, step, path);
        const live = await done(step.id, "done", { path }, next, null, null, next ? "active" : "done");
        if (!next) return "done";
        if (!live) return "active";
        wait = null;
        at = next;
        continue;
      }
      await call(rpc, "workflow_step_begin", { p_run: run.id, p_step: step.id, p_visit: 1 });
      const since = new Date(now()).toISOString();
      const until = new Date(now() + step.days * 86_400_000).toISOString();
      const w2 = { step: step.id, event: step.event, since, until };
      await done(null, "running", null, step.id, Math.min(Date.parse(until), now() + 5 * 60_000), w2, "waiting");
      return "waiting";
    }

    const begun = await call<string>(rpc, "workflow_step_begin", { p_run: run.id, p_step: step.id, p_visit: 1 });
    let o: Outcome;
    if (begun === "new" || begun === "running") {
      try {
        o = await runStep(rpc, ws, run, step, f, d, begun === "running");
      } catch (e) {
        o = { status: "failed", result: { error: (e as Error).message.slice(0, 200) } };
      }
    } else {
      // Done before the worker stopped: read which way it went and move on.
      o = { status: begun as Outcome["status"], path: undefined };
      if (step.kind === "branch") o.path = branchYes(step, valuesOf(f)) ? "yes" : "no";
      if (step.kind === "split") o.path = splitSide(step, run.id);
    }
    const next = o.end ? null : o.path ? enterPath(body.steps, step, o.path) : nextAfter(body.steps, step.id);
    const ended = o.end || !next;
    const live = await done(step.id, o.status, { ...(o.result ?? {}), ...(o.path ? { path: o.path } : {}) }, next, null, null, ended ? (o.end ? "exited" : "done") : "active", o.end);
    if (ended) return o.end ? "exited" : "done";
    // Paused mid-run: stop after this step; the run waits at the next one.
    if (!live) return "active";
    at = next;
    // Steps that change the contact (enrich, qualify, update, route) can change what later branches read.
    if (["enrich", "qualify", "update", "route"].includes(step.kind)) f = (await call<Facts | null>(rpc, "workflow_facts", { p_run: run.id })) ?? f;
  }
  return "active";
}

/** Runs claimed at a time: few enough that a slow step can't keep the rest past their claim. */
const CLAIM = 25;

export const workflowRun =
  (rpc: Rpc, d: WorkflowDeps = {}): Handler =>
  async (job, signal) => {
    const ws = job.workspace_id;
    if (!ws) throw new JobError("workflow_run needs a workspace", { retry: false });
    const until = Date.now() + (d.roundMs ?? 50_000);
    const more = () => call(rpc, "enqueue_job", { p_workspace: ws, p_kind: "workflow_run", p_key: ws, p_payload: { lane: "bulk" }, p_delay_s: 1, p_max_attempts: 3 });
    while (!signal.aborted) {
      const runs = await call<Claimed[]>(rpc, "workflow_claim", { p_ws: ws, p_limit: CLAIM });
      if (!runs?.length) return;
      for (const [i, r] of runs.entries()) {
        // Out of time (or stopping) between runs: the rest go back unclaimed, and the next round takes them.
        if (signal.aborted || Date.now() >= until) {
          await call(rpc, "workflow_unclaim", { p_runs: runs.slice(i).map((x) => x.id) }).catch(() => undefined);
          if (!signal.aborted) await more();
          return;
        }
        try {
          await advance(rpc, ws, r, d);
        } catch (e) {
          // A run that can't move is marked failed with why, so it shows in History and doesn't hold the queue.
          await call(rpc, "workflow_step_done", { p_run: r.id, p_step: null, p_visit: 1, p_status: "failed", p_result: {}, p_next: r.at_step, p_next_at: null, p_wait: null, p_run_status: "failed", p_exit: (e as Error).message.slice(0, 60) }).catch(() => undefined);
        }
      }
      if (Date.now() >= until) {
        await more();
        return;
      }
    }
  };
