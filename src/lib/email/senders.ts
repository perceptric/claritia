// Which provider sends each email (docs/ses-plan.md). EMAIL_SES_DOMAINS on the server names the From domains that go
// through Amazon SES ("tryclaritia.com", a list with commas, or "all"); a subdomain follows its parent. Everything else
// stays on Resend. With the variable empty, or SES not set up, nothing changes.

import { domainOf, SendError, type Outgoing, type Sender } from "./provider.ts";
import type { Resend } from "./resend.ts";
import { sesFromEnv, type Ses } from "./ses.ts";
import { resendFromEnv } from "./resend.ts";

export type OnSes = (from: string) => boolean;

export function sesDomains(env: NodeJS.ProcessEnv = process.env): OnSes {
  const v = (env.EMAIL_SES_DOMAINS ?? "").trim().toLowerCase();
  if (!v) return () => false;
  if (v === "all") return (from) => !!domainOf(from);
  const list = v.split(",").map((x) => x.trim().replace(/^@/, "")).filter(Boolean);
  return (from) => {
    const d = domainOf(from);
    return !!d && list.some((x) => d === x || d.endsWith(`.${x}`));
  };
}

const notSet = (what: string) => new SendError(`${what} isn't set up on the server.`, {});

/** The send job's sender: SES for the domains on it, Resend for the rest. Null when neither is set up. */
export function routedSender(o: { resend: Resend | null; ses: Ses | null; onSes: OnSes }): Sender | null {
  if (!o.resend && !o.ses) return null;
  const viaSes = (m: Outgoing) => !!o.ses && o.onSes(m.from);
  return {
    async send(m, key) {
      if (viaSes(m)) return o.ses!.send(m);
      if (!o.resend) throw notSet("Resend (RESEND_API_KEY)");
      return o.resend.send(m, key);
    },
    ...(o.resend ? { batch: (items: { out: Outgoing; key: string }[]) => o.resend!.batch(items) } : {}),
    keyed: (m) => !viaSes(m),
    batchable: (m) => !viaSes(m) && !!o.resend,
  };
}

/**
 * The batch call for teammate alerts (forms and routing). A batch with any email on SES is refused before anything
 * goes, as Resend refuses a bad batch (invalid), so the caller sends each one over the mailer, which routes them.
 */
export function routedBatcher(o: { resend: Resend | null; onSes: OnSes; ses: Ses | null }): Pick<Resend, "batch"> | null {
  if (!o.resend) return null;
  return {
    async batch(items) {
      if (o.ses && items.some((i) => o.onSes(i.out.from))) throw new SendError("SES sends these one by one", { invalid: true });
      return o.resend!.batch(items);
    },
  };
}

/** A raw-message mailer (meeting emails with their calendar part, alerts). Same shape as worker-intel's Mailer. */
export type RawMail = { from: string; to: string; raw: string; tags: Record<string, string> };
export type RawMailer = { send(m: RawMail): Promise<string>; session?(): { send(m: RawMail): Promise<string>; close(): void } };

/** SES's raw send for the domains on it, the SMTP relay for the rest. Null when neither is set up. */
export function routedMailer(o: { smtp: RawMailer | null; ses: Ses | null; onSes: OnSes }): RawMailer | null {
  if (!o.smtp && !o.ses) return null;
  const viaSes = (m: RawMail) => !!o.ses && o.onSes(m.from);
  const smtpSend = (m: RawMail) => {
    if (!o.smtp) throw notSet("The SMTP relay (SMTP_HOST or RESEND_API_KEY)");
    return o.smtp.send(m);
  };
  return {
    send: (m) => (viaSes(m) ? o.ses!.sendRaw(m) : smtpSend(m)),
    session() {
      // One SMTP connection for the relay's share, opened only if one is needed; SES needs none.
      let s: ReturnType<NonNullable<RawMailer["session"]>> | null = null;
      return {
        send(m: RawMail) {
          if (viaSes(m)) return o.ses!.sendRaw(m);
          if (!o.smtp) return Promise.reject(notSet("The SMTP relay (SMTP_HOST or RESEND_API_KEY)"));
          if (!o.smtp.session) return o.smtp.send(m);
          s ??= o.smtp.session();
          return s.send(m);
        },
        close() {
          s?.close();
        },
      };
    },
  };
}

/**
 * One email from the app itself (alerts, form codes), to one or several addresses: through SES when its From domain
 * is on SES, else Resend's API as before. Returns null when it went, else why not.
 */
export async function systemSend(
  m: { from: string; to: string[]; subject: string; html: string; text: string },
  o: { fetchFn?: typeof fetch; env?: NodeJS.ProcessEnv; ses?: Ses | null } = {},
): Promise<string | null> {
  const env = o.env ?? process.env;
  const fetchFn = o.fetchFn ?? fetch;
  const ses = o.ses === undefined ? sesFromEnv(env, fetchFn) : o.ses;
  if (ses && sesDomains(env)(m.from)) {
    try {
      await ses.send({ ...m, headers: [], tags: { kind: "system" } });
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }
  const key = env.RESEND_API_KEY?.trim();
  if (!key) return "RESEND_API_KEY isn't set on the server.";
  const res = await fetchFn("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: m.from, to: m.to, subject: m.subject, html: m.html, text: m.text }),
    signal: AbortSignal.timeout(10_000),
  }).catch((e: Error) => e);
  if (res instanceof Error) return res.message;
  if (!res.ok) return `answered ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`;
  return null;
}

/** The worker's senders from its environment. */
export function sendersFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const resend = resendFromEnv(env);
  const ses = sesFromEnv(env);
  const onSes = sesDomains(env);
  return { resend, ses, onSes, sender: routedSender({ resend, ses, onSes }), batcher: routedBatcher({ resend, ses, onSes }) };
}
