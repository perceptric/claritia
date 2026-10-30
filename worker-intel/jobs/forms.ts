// A form's alerts and auto-reply (docs/forms-plan.md Part 6, src/lib/forms/notify.ts):
//   form_notify  after a submission (or one let out of Spam): the alert email to each teammate picked, a post in the
//                Routing Slack channel, and the auto-reply to the person who sent it. Each part is noted in
//                form_notify_sent once it went (or may have gone), so a retry sends only what's left. Spam, tests and
//                removed submissions send nothing.

import { slackNote } from "../../src/lib/delivery/send.ts";
import { outcomeOf } from "../../src/lib/email/provider.ts";
import { allFields, type Form } from "../../src/lib/forms/schema.ts";
import { alertEmail, replyEmail, replyGoes, type MergeValues } from "../../src/lib/forms/notify.ts";
import { JobError, type Handler, type Rpc } from "../../src/lib/jobs.ts";
import { mime, validAddress } from "../../src/lib/meetings/emails.ts";
import type { Mailer } from "./meetings.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type NotifyInfo = {
  submission: { id: string; workspace_id: string; form_id: string | null; values: Record<string, unknown>; spam: boolean; test: boolean; contact_id: string | null };
  form: string | null;
  body: Form | null;
  contact: { id: string; email: string | null; email_class: string | null; first_name: string | null; last_name: string | null; company: string | null; owner: string | null } | null;
  owner: { id: string; name: string; email: string } | null;
  handle: string | null;
  workspace: string | null;
  sealed: string | null;
  sending: { from_name: string | null; from_email: string | null; reply_to: string | null; paused: boolean };
  sent: string[];
};

export type FormJobOpts = { mailer: Mailer | null; base: string; from: string; fetcher?: typeof fetch };

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
    const mark = (part: string) => call(rpc, "form_notify_mark", { p_sid: sid, p_part: part });

    // One email, noted once it went. "Not now" and a retryable error leave it for the retry; a send that may have gone
    // (or that the provider refused for good) counts as done, so nobody gets it twice.
    const send = async (part: string, to: string, parts: { subject: string; html: string; text: string }, fromName: string, replyTo?: string | null) => {
      if (sent.has(part) || !o.mailer) return;
      try {
        const raw = mime({ from: { name: fromName, email: fromEmail }, to, replyTo: replyTo && validAddress(replyTo) ? replyTo : null, subject: parts.subject, html: parts.html, text: parts.text });
        await o.mailer.send({ from: fromEmail, to, raw, tags: { form_notify: sid, part: part.split(":")[0]! } });
      } catch (e) {
        const out = outcomeOf(e);
        if (out === "later" || out === "retry") {
          later = true;
          return;
        }
      }
      await mark(part);
    };

    const n = body.notify;
    if (n?.on) {
      const answers = answersOf(body, info.submission.values);
      const parts = alertEmail({ form, lead, answers, showAnswers: n.answers, subject: n.subject, link, owner: info.owner?.name ?? null });
      for (const to of n.to.filter((a) => validAddress(a)).slice(0, 10)) await send(`alert:${to}`, to, parts, "Claritia", c?.email ?? null);
      if (n.slack && info.sealed && !sent.has("slack")) {
        const who = name || c?.email || "Someone";
        const rows = [...(n.answers ? answers.slice(0, 8) : []), ...(info.owner ? [{ label: "Routed to", value: info.owner.name }] : []), { label: "Open", value: `<${link}|Open in Claritia>` }];
        const res = await slackNote(info.sealed, `${who} sent ${form}`, rows, o.fetcher);
        if (res.status === "retry") later = true;
        else await mark("slack");
      }
    }

    const r = body.reply;
    if (r && replyGoes(r, c?.email, c?.email_class) && !info.sending.paused) {
      const fromRep = r.from === "owner" && info.owner;
      const sender = fromRep ? info.owner!.name : info.sending.from_name || info.workspace || "The team";
      const booking = info.handle ? `${base}/booking/${info.handle}` : null;
      const parts = replyEmail({ reply: r, lead, form, sender, booking });
      await send("reply", c!.email!.trim().toLowerCase(), parts, sender, fromRep ? info.owner!.email : info.sending.reply_to);
    }

    if (later) throw new JobError("The email provider or Slack said not now; trying again", { retryAfterS: 60 });
  };
