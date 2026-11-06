// Sending as the host (docs/integrations-plan.md, Next step 6): one email, as its whole MIME message, from a team
// member's own Gmail (gmail.send) or Outlook (Graph Mail.Send). The sign-in is refreshed before it runs out and once
// more on a 401; a refresh the provider refuses, or a 401 right after a fresh token, means the mailbox needs
// reconnecting, and the email goes from the workspace's domain instead. Neither provider takes an idempotency key:
// a send with no answer is "unknown" and never sent again; a 429 or 5xx was not taken and is tried again.

import { OauthError, oauthRefresh } from "../sources/oauth.ts";

export type MailboxTok = { access: string; refresh: string | null; expiresAt: number };
export type Mailbox = { id: string; provider: "gmail" | "outlook"; email: string; tok: MailboxTok };

export type MailOut =
  | { status: "sent"; id: string }
  | { status: "retry"; error: string; retryAfterS?: number }
  | { status: "failed"; error: string }
  | { status: "unknown"; error: string }
  | { status: "reconnect"; error: string };

/** The OAuth app each mailbox signs in with (src/lib/sources/oauth.ts). */
export const MAILBOX_OAUTH = { gmail: "gmail", outlook: "outlook_mail" } as const;
export const PROVIDER_LABEL = { gmail: "Gmail", outlook: "Outlook" } as const;

export type SendDeps = { fetcher?: typeof fetch; now?: () => number; save?: (t: MailboxTok) => Promise<void> };

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");

export async function sendAs(mb: Mailbox, raw: string, d: SendDeps = {}): Promise<MailOut> {
  const fetcher = d.fetcher ?? fetch;
  const now = d.now ?? Date.now;
  let tok = mb.tok;
  const refresh = async (): Promise<MailOut | null> => {
    if (!tok.refresh) return { status: "reconnect", error: "The sign-in has no refresh token." };
    try {
      const t = await oauthRefresh(MAILBOX_OAUTH[mb.provider], tok.refresh, fetcher);
      tok = { access: t.access, refresh: t.refresh ?? tok.refresh, expiresAt: t.expiresAt };
      await d.save?.(tok).catch(() => undefined);
      return null;
    } catch (e) {
      if (e instanceof OauthError && (e.code === "invalid_grant" || e.status === 400 || e.status === 401)) return { status: "reconnect", error: e.message };
      return { status: "retry", error: `Couldn't refresh the sign-in: ${(e as Error).message}`.slice(0, 300) };
    }
  };
  if (tok.expiresAt - 60_000 < now()) {
    const r = await refresh();
    if (r) return r;
  }
  const gmail = mb.provider === "gmail";
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetcher(gmail ? "https://gmail.googleapis.com/gmail/v1/users/me/messages/send" : "https://graph.microsoft.com/v1.0/me/sendMail", {
        method: "POST",
        headers: { authorization: `Bearer ${tok.access}`, "content-type": gmail ? "application/json" : "text/plain" },
        // Gmail takes the message as base64url in JSON; Graph takes it as base64 in a text body.
        body: gmail ? JSON.stringify({ raw: b64url(raw) }) : Buffer.from(raw, "utf8").toString("base64"),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e) {
      return { status: "unknown", error: (e as Error).name === "TimeoutError" ? `No answer from ${PROVIDER_LABEL[mb.provider]} within 20 seconds.` : `Couldn't reach ${PROVIDER_LABEL[mb.provider]}.` };
    }
    if (res.status === 401 && attempt === 0) {
      const r = await refresh();
      if (r) return r;
      continue;
    }
    if (res.status === 401) return { status: "reconnect", error: `${PROVIDER_LABEL[mb.provider]} turned the sign-in down.` };
    if (res.ok) {
      const j = (await res.json().catch(() => ({}))) as { id?: string };
      return { status: "sent", id: j.id ?? res.headers.get("request-id") ?? "sent" };
    }
    const why = ((await res.json().catch(() => ({}))) as { error?: { message?: string } | string }).error;
    const msg = typeof why === "string" ? why : (why?.message ?? `answered ${res.status}`);
    if (res.status === 429 || res.status >= 500) {
      const n = Number(res.headers.get("retry-after"));
      return { status: "retry", error: `${PROVIDER_LABEL[mb.provider]}: ${msg}`.slice(0, 300), ...(Number.isFinite(n) && n > 0 ? { retryAfterS: Math.min(n, 3600) } : {}) };
    }
    // Gmail answers 403 with insufficientPermissions when the send scope was taken back.
    if (res.status === 403 && /insufficient|scope|permission/i.test(msg)) return { status: "reconnect", error: `${PROVIDER_LABEL[mb.provider]}: ${msg}`.slice(0, 300) };
    return { status: "failed", error: `${PROVIDER_LABEL[mb.provider]}: ${msg}`.slice(0, 300) };
  }
}
