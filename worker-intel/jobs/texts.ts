// text_send on claritia-intel (docs/integrations-plan.md, Next step 3): one workflow text or WhatsApp message.
// Checked again at send time: text consent still granted, the number hasn't replied STOP to this sender, and a
// reminder's meeting is still on at the same time. Twilio's 429 and 5xx try again; after two tries, or a refusal
// that won't change, the step's email goes instead when it has one. A send with no answer is "unknown" and never
// sent again (Twilio takes no idempotency key), and nothing else goes in its place.

import { mime } from "../../src/lib/meetings/emails.ts";
import { JobError, type Handler, type Rpc } from "../../src/lib/jobs.ts";
import { unseal } from "../../src/lib/seal.ts";
import { call } from "../../src/lib/sources/sync.ts";
import type { Creds } from "../../src/lib/sources/types.ts";
import { sendText, STOPPED, twilioFromEnv, twilioFromKeys, type TwilioAccount } from "../../src/lib/texts/twilio.ts";
import type { Mailer } from "./meetings.ts";

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type Taken = {
  id: string;
  workspace_id: string;
  channel: "sms" | "whatsapp";
  to_phone: string;
  body: string | null;
  template: string | null;
  vars: Record<string, string>;
  meeting_id: string | null;
  meeting_start: string | null;
  fallback: { subject: string; text: string } | null;
  attempts: number;
  stopped: string[];
  consent: string | null;
  meeting: { status: string; start_at: string } | null;
  twilio_source: string | null;
  email: string | null;
  sending: { from_name: string | null; from_email: string | null; reply_to: string | null } | null;
};

export type TextDeps = {
  /** The app's address, for Twilio's delivery answers. */
  base: string;
  mailer: Mailer | null;
  /** The Claritia address the fallback email comes from when the workspace has no verified one. */
  from: string;
  fetcher?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  /** A team's Twilio keys, from its connection; the real one reads them from the database. */
  teamKeys?: (sourceId: string) => Promise<Record<string, string> | null>;
};

/** Tries before a text that keeps failing gives way to its email. */
export const TEXT_TRIES = 2;

async function teamKeysFrom(rpc: Rpc, sourceId: string): Promise<Record<string, string> | null> {
  const l = await call<{ sealed: string | null } | null>(rpc, "source_load", { p_id: sourceId });
  if (!l?.sealed) return null;
  const c = JSON.parse(unseal(l.sealed)) as Creds;
  return c.type === "key" ? c.values : null;
}

/** The skip reason when the text shouldn't go, checked at send time. */
export function stopWhy(t: Taken, sender: string): string | null {
  if (t.consent !== "granted") return "no text consent";
  if (t.stopped.includes(sender) || t.stopped.includes("*")) return "they replied STOP";
  if (t.meeting_id) {
    if (!t.meeting || t.meeting.status === "canceled") return "the meeting was canceled";
    if (t.meeting_start && Date.parse(t.meeting.start_at) !== Date.parse(t.meeting_start)) return "the meeting moved";
  }
  return null;
}

/** One try. Returns a retry for the jobs queue, or nothing when the message is finished. */
export async function textOnce(rpc: Rpc, d: TextDeps, id: string): Promise<{ retry?: { error: string; retryAfterS?: number } }> {
  const t = await call<Taken | null>(rpc, "text_take", { p_id: id });
  if (!t) return {};
  const done = (status: string, error: string | null, sid: string | null = null, from: string | null = null) => call(rpc, "text_done", { p_id: id, p_status: status, p_sid: sid, p_from: from, p_error: error });

  // The email instead, when the step has one and the contact has an address to send to.
  const fallback = async (why: string) => {
    if (!t.fallback || !t.email || !d.mailer) return done("failed", why);
    const fromEmail = t.sending?.from_email ?? d.from;
    const raw = mime({
      from: { name: t.sending?.from_name ?? null, email: fromEmail },
      to: t.email,
      replyTo: t.sending?.reply_to ?? null,
      subject: t.fallback.subject,
      text: t.fallback.text,
      html: `<p style="font:15px/1.5 Inter,Arial,sans-serif">${escHtml(t.fallback.text).replace(/\n/g, "<br>")}</p>`,
    });
    try {
      await d.mailer.send({ from: fromEmail, to: t.email, raw, tags: { text_fallback: id } });
      return done("emailed", why);
    } catch (e) {
      return done("failed", `${why} The email didn't go either: ${(e as Error).message}`.slice(0, 500));
    }
  };

  let acct: TwilioAccount | null = null;
  if (t.twilio_source) {
    const keys = await (d.teamKeys ?? ((s) => teamKeysFrom(rpc, s)))(t.twilio_source).catch(() => null);
    acct = keys ? twilioFromKeys((k) => keys[k] ?? "") : null;
  }
  if (!acct && t.channel === "sms") acct = twilioFromEnv(d.env);
  if (!acct) {
    await fallback(t.channel === "whatsapp" ? "WhatsApp needs your own Twilio in Settings › Integrations." : "Texts aren't set up on this server.");
    return {};
  }
  const sender = t.channel === "whatsapp" ? (acct.whatsappFrom ?? "") : (acct.messagingSid ?? acct.from ?? "");
  const why = stopWhy(t, sender);
  if (why) {
    await done("skipped", why);
    return {};
  }
  const r = await sendText(acct, { channel: t.channel, to: t.to_phone, body: t.body, template: t.template, vars: t.vars, statusCallback: `${d.base}/api/texts/status` }, d.fetcher);
  if (r.status === "sent") {
    await done("sent", null, r.sid, r.from);
    return {};
  }
  if (r.status === "unknown") {
    await done("unknown", r.error);
    return {};
  }
  if (r.status === "failed" && r.code === STOPPED) {
    await call(rpc, "text_optout", { p_sender: sender, p_phone: t.to_phone, p_stop: true });
    await done("skipped", "they replied STOP");
    return {};
  }
  if (r.status === "retry" && t.attempts < TEXT_TRIES) {
    await call(rpc, "text_done", { p_id: id, p_status: "queued", p_sid: null, p_from: null, p_error: r.error });
    return { retry: { error: r.error, retryAfterS: r.retryAfterS } };
  }
  await fallback(r.error);
  return {};
}

export const textSend =
  (rpc: Rpc, d: TextDeps): Handler =>
  async (job) => {
    const id = String(job.payload.message ?? "");
    if (!UUID.test(id)) throw new JobError("text_send needs a message", { retry: false });
    const r = await textOnce(rpc, d, id);
    if (r.retry) throw new JobError(r.retry.error, { retryAfterS: r.retry.retryAfterS });
  };
