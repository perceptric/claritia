// A form's alerts and auto-reply (docs/forms-plan.md Part 6, src/lib/forms/notify.ts):
//   form_notify  after a submission (or one let out of Spam): the alert email to each teammate picked, a post in the
//                Routing Slack channel, and the auto-reply to the person who sent it. Each part is noted in
//                form_notify_sent once it went (or may have gone), so a retry sends only what's left. Spam, tests and
//                removed submissions send nothing. `only` splits the alerts (sent now) from the auto-reply (5 minutes
//                later). Both wait up to 2 minutes for a route job that hasn't finished, so they name the rep: the job
//                goes back in line (the wait uses no try) and the route's commit wakes it (087_job_lanes.sql). The
//                Slack post is left to Routing when the router is live, and the auto-reply's link is the meeting the
//                lead was offered, for their rep, and left out once they booked (docs/scheduling-plan.md Part 13).
// Each part is claimed in form_notify_sent before it goes (and given back if the provider says not now), so two
// workers holding the same job never both send it. The teammates' alerts go in one Resend batch when the worker has
// the API (they carry no attachment); one by one over the mailer otherwise.

import { slackNote } from "../../src/lib/delivery/send.ts";
import { fromHeader, outcomeOf, SendError, type Outgoing } from "../../src/lib/email/provider.ts";
import type { Resend } from "../../src/lib/email/resend.ts";
import { allFields, type Form } from "../../src/lib/forms/schema.ts";
import { alertEmail, replyEmail, replyGoes, type MergeValues } from "../../src/lib/forms/notify.ts";
import { enqueueJob, JobError, type Handler, type Rpc } from "../../src/lib/jobs.ts";
import { mime, validAddress } from "../../src/lib/meetings/emails.ts";
import type { Mailer } from "./meetings.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type NotifyInfo = {
  submission: { id: string; workspace_id: string; form_id: string | null; values: Record<string, unknown>; spam: boolean; test: boolean; contact_id: string | null; created_at?: string };
  form: string | null;
  body: Form | null;
  contact: { id: string; email: string | null; email_class: string | null; first_name: string | null; last_name: string | null; company: string | null; owner: string | null } | null;
  owner: { id: string; name: string; email: string } | null;
  handle: string | null;
  workspace: string | null;
  sealed: string | null;
  sending: { from_name: string | null; from_email: string | null; reply_to: string | null; paused: boolean };
  sent: string[];
  routing?: "none" | "pending" | "done";
  booked?: boolean;
  meet?: { id: string; slug: string } | null;
};

/** How long the alerts and auto-reply wait for a route job, and how often they look. */
export const ROUTE_WAIT_S = 120;
export const ROUTE_LOOK_S = 30;

export type FormJobOpts = { mailer: Mailer | null; base: string; from: string; fetcher?: typeof fetch; batcher?: Pick<Resend, "batch"> | null };

async function call<T>(rpc: Rpc, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

const show = (v: unknown): string => (Array.isArray(v) ? v.map(String).join(", ") : v === true ? "Yes" : v === false ? "No" : v === null || v === undefined ? "" : String(v)).slice(0, 2000);

/** The answers in the form's order, with their labels; content blocks and hidden fields left out. */
export function answersOf(body: Form, values: Record<string, unknown>): { label: string; value: string }[] {
  return allFields(body)
    .filter((f) => !["heading", "paragraph", "divider", "image", "hidden"].includes(f.type))
    .map((f) => ({ label: f.label || f.key, value: show(values[f.key]) }))
    .filter((a) => a.value);
}

export const formNotify =
  (rpc: Rpc, o: FormJobOpts): Handler =>
  async (job) => {
    const sid = String(job.payload.submission ?? "");
    if (!UUID.test(sid)) throw new JobError("form_notify needs a submission", { retry: false });
    const info = await call<NotifyInfo | null>(rpc, "form_notify_info", { p_sid: sid });
    // Gone, held as spam since, or a test: nothing to send.
    if (!info || info.submission.spam || info.submission.test || !info.body) return;
    const only = job.payload.only === "alerts" || job.payload.only === "reply" ? job.payload.only : null;
    // Routing took longer than the form waited: its job routes the lead a moment later, so wait for the rep's name,
    // back in line without using a try. The route's commit pulls the wait short.
    const age = (Date.now() - Date.parse(info.submission.created_at ?? "")) / 1000;
    if (info.routing === "pending" && age < ROUTE_WAIT_S) {
      await enqueueJob(rpc, { workspaceId: job.workspace_id, kind: "form_notify", key: job.key, payload: { ...job.payload, waiting_route: true }, delayS: ROUTE_LOOK_S, maxAttempts: job.max_attempts });
      return;
    }
    const body = info.body;
    const sent = new Set(info.sent);
    const c = info.contact;
    const name = [c?.first_name, c?.last_name].filter(Boolean).join(" ") || null;
    const lead: MergeValues = { first_name: c?.first_name ?? null, name, email: c?.email ?? null, company: c?.company ?? null };
    const form = info.form ?? "A form";
    const base = o.base.replace(/\/$/, "");
    const link = info.submission.form_id ? `${base}/forms/${info.submission.form_id}?tab=results` : `${base}/forms`;
    const fromEmail = info.sending.from_email ?? o.from;
    let later = false;
    // Claimed parts are this job's to send; a part another worker claimed first is skipped.
    const claim = async (parts: string[]) => (parts.length ? new Set(await call<string[]>(rpc, "form_notify_claim", { p_sid: sid, p_parts: parts })) : new Set<string>());
    const giveBack = (parts: string[]) => (parts.length ? call(rpc, "form_notify_unclaim", { p_sid: sid, p_parts: parts }) : Promise.resolve());

    // One email, claimed before it goes. "Not now" and a retryable error give the claim back for the retry; a send
    // that may have gone (or that the provider refused for good) keeps it, so nobody gets it twice.
    const send = async (part: string, to: string, parts: { subject: string; html: string; text: string }, fromName: string, replyTo?: string | null) => {
      if (sent.has(part) || !o.mailer) return;
      if (!(await claim([part])).has(part)) return;
      try {
        const raw = mime({ from: { name: fromName, email: fromEmail }, to, replyTo: replyTo && validAddress(replyTo) ? replyTo : null, subject: parts.subject, html: parts.html, text: parts.text });
        await o.mailer.send({ from: fromEmail, to, raw, tags: { form_notify: sid, part: part.split(":")[0]! } });
      } catch (e) {
        const out = outcomeOf(e);
        if (out === "later" || out === "retry") {
          later = true;
          await giveBack([part]);
        }
      }
    };

    /** The teammates' alerts: one batch call when the worker has Resend's API, else one by one. */
    const alerts = async (list: string[], parts: { subject: string; html: string; text: string }, replyTo: string | null) => {
      const want = list.filter((to) => !sent.has(`alert:${to}`));
      if (!want.length || !o.mailer) return;
      if (!o.batcher || want.length < 2) {
        for (const to of want) await send(`alert:${to}`, to, parts, "Claritia", replyTo);
        return;
      }
      const mine = await claim(want.map((to) => `alert:${to}`));
      const go = want.filter((to) => mine.has(`alert:${to}`));
      if (!go.length) return;
      const out = (to: string): Outgoing => ({
        from: fromHeader("Claritia", fromEmail),
        to,
        replyTo: replyTo && validAddress(replyTo) ? replyTo : null,
        subject: parts.subject,
        html: parts.html,
        text: parts.text,
        headers: [],
        tags: { form_notify: sid, part: "alert" },
      });
      try {
        await o.batcher.batch(go.map((to) => ({ out: out(to), key: `form_notify:${sid}:alert:${to}` })));
      } catch (e) {
        const se = e instanceof SendError ? e : null;
        if (se?.invalid) {
          // Resend refused the batch for something in it and sent none: each on its own, over the mailer.
          await giveBack(go.map((to) => `alert:${to}`));
          for (const to of go) await send(`alert:${to}`, to, parts, "Claritia", replyTo);
          return;
        }
        const res = outcomeOf(e);
        if (res === "later" || res === "retry") {
          later = true;
          await giveBack(go.map((to) => `alert:${to}`));
        }
      }
    };

    const n = body.notify;
    if (n?.on && only !== "reply") {
      const answers = answersOf(body, info.submission.values);
      const parts = alertEmail({ form, lead, answers, showAnswers: n.answers, subject: n.subject, link, owner: info.owner?.name ?? null });
      await alerts(n.to.filter((a) => validAddress(a)).slice(0, 10), parts, c?.email ?? null);
      // Routing tells the Slack channel about every lead it routes; the form only posts when Routing isn't live.
      if (n.slack && info.sealed && !sent.has("slack") && (info.routing ?? "none") === "none" && (await claim(["slack"])).has("slack")) {
        const who = name || c?.email || "Someone";
        const rows = [...(n.answers ? answers.slice(0, 8) : []), ...(info.owner ? [{ label: "Routed to", value: info.owner.name }] : []), { label: "Open", value: `<${link}|Open in Claritia>` }];
        const res = await slackNote(info.sealed, `${who} sent ${form}`, rows, o.fetcher);
        if (res.status === "retry") {
          later = true;
          await giveBack(["slack"]);
        }
      }
    }

    const r = body.reply;
    if (r && only !== "alerts" && replyGoes(r, c?.email, c?.email_class) && !info.sending.paused) {
      const fromRep = r.from === "owner" && info.owner;
      const sender = fromRep ? info.owner!.name : info.sending.from_name || info.workspace || "The team";
      // The meeting the lead was offered, for their rep; none once they've booked.
      const booking = info.booked || !info.handle ? null : `${base}/booking/${encodeURIComponent(info.handle)}${info.meet?.slug ? `/${encodeURIComponent(info.meet.slug)}` : ""}`;
      const parts = replyEmail({ reply: r, lead, form, sender, booking });
      await send("reply", c!.email!.trim().toLowerCase(), parts, sender, fromRep ? info.owner!.email : info.sending.reply_to);
    }

    if (later) throw new JobError("The email provider or Slack said not now; trying again", { retryAfterS: Math.round(Math.min(1800, 60 * 2 ** Math.max(0, (job.attempts ?? 1) - 1)) * (0.8 + 0.4 * Math.random())) });
  };
