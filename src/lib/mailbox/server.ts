// Mailboxes on the server and the worker (docs/integrations-plan.md, Next step 6): connecting a person's own Gmail or
// Outlook, and sending one email through it when they have one that works and has room today. Everything else
// (no mailbox, a sign-in that's gone, a full day) answers so the caller sends the way it always has, or waits.

import type { Rpc } from "../jobs.ts";
import { openToken, sealToken } from "../meetings/providers/index.ts";
import { oauthExchange, oauthReady, oauthUrl, type State } from "../sources/oauth.ts";
import { MAILBOX_OAUTH, PROVIDER_LABEL, sendAs, type MailOut } from "./send.ts";

export type Provider = keyof typeof MAILBOX_OAUTH;
export const isProvider = (v: unknown): v is Provider => v === "gmail" || v === "outlook";

async function call<T>(rpc: Rpc, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

/** The provider's sign-in link, or why it can't start. */
export function mailboxUrl(provider: Provider, redirect: string, s: { ws: string; user: string }): string | null {
  const kind = MAILBOX_OAUTH[provider];
  return oauthReady(kind) ? oauthUrl(kind, redirect, { ws: s.ws, user: s.user, kind }) : null;
}

/** The person came back with a code: trade it, read which mailbox it is, and keep it. */
export async function finishMailbox(rpc: Rpc, o: { state: State; code: string; redirect: string; fetcher?: typeof fetch }): Promise<{ id: string; email: string; provider: Provider }> {
  const provider = (Object.entries(MAILBOX_OAUTH).find(([, k]) => k === o.state.kind)?.[0] ?? null) as Provider | null;
  if (!provider) throw new Error("Unknown mailbox.");
  const t = await oauthExchange(o.state.kind, o.code, o.redirect, o.state.verifier, o.fetcher);
  if (!t.refresh) throw new Error(`${PROVIDER_LABEL[provider]} didn't allow sending later. Try again and allow access.`);
  const who = await (o.fetcher ?? fetch)(provider === "gmail" ? "https://www.googleapis.com/oauth2/v2/userinfo" : "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
    headers: { authorization: `Bearer ${t.access}` },
    signal: AbortSignal.timeout(10_000),
  });
  const j = (await who.json().catch(() => ({}))) as { email?: string; mail?: string; userPrincipalName?: string };
  const email = (j.email ?? j.mail ?? j.userPrincipalName ?? "").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new Error(`${PROVIDER_LABEL[provider]} didn't say which mailbox this is.`);
  const id = await call<string>(rpc, "mailbox_connect", { p_ws: o.state.ws, p_user: o.state.user, p_provider: provider, p_email: email, p_sealed: sealToken({ access: t.access, refresh: t.refresh, expiresAt: t.expiresAt }) });
  return { id, email, provider };
}

type Box = { id: string; provider: Provider; email: string; sealed: string; sent_day: number; limit: number; room_at: string | null };

/** Who to tell that a mailbox needs reconnecting, once per break. */
export type Broken = { email: string; mailbox: string; provider: Provider };

export type Via =
  /** No working mailbox: send the usual way. */
  | { kind: "none" }
  /** Today's limit is used: wait this long, then try again. */
  | { kind: "full"; waitS: number }
  | { kind: "done"; out: Exclude<MailOut, { status: "reconnect" }> };

/**
 * Send `build(from)` (the whole MIME message, from the mailbox's address) through the person's mailbox. A sign-in
 * that's gone marks the mailbox, tells the person once (`tell`), and answers "none", so this email goes the usual way.
 */
export async function viaMailbox(rpc: Rpc, ws: string, user: string | null | undefined, build: (from: string) => string, d: { fetcher?: typeof fetch; now?: () => number; tell?: (b: Broken) => Promise<void> } = {}): Promise<Via> {
  if (!user) return { kind: "none" };
  const box = await call<Box | null>(rpc, "mailbox_for", { p_ws: ws, p_user: user }).catch(() => null);
  if (!box) return { kind: "none" };
  const now = d.now?.() ?? Date.now();
  if (box.sent_day >= box.limit) return { kind: "full", waitS: Math.max(60, Math.ceil(((box.room_at ? Date.parse(box.room_at) : now + 3_600_000) - now) / 1000)) };
  const tok = openToken(box.sealed);
  if (!tok) return { kind: "none" };
  const out = await sendAs({ id: box.id, provider: box.provider, email: box.email, tok }, build(box.email), {
    fetcher: d.fetcher,
    now: d.now,
    save: async (t) => void (await call(rpc, "mailbox_token_save", { p_id: box.id, p_sealed: sealToken(t) })),
  });
  if (out.status === "reconnect") {
    const r = await call<{ tell: boolean; email: string | null } | null>(rpc, "mailbox_broken", { p_id: box.id, p_error: out.error }).catch(() => null);
    if (r?.tell && r.email) await d.tell?.({ email: r.email, mailbox: box.email, provider: box.provider }).catch(() => undefined);
    return { kind: "none" };
  }
  if (out.status === "sent") await call(rpc, "mailbox_sent", { p_id: box.id }).catch(() => undefined);
  return { kind: "done", out };
}

/** The note a person gets once when their mailbox needs reconnecting. */
export function reconnectNote(b: Broken, base: string) {
  const name = PROVIDER_LABEL[b.provider];
  const link = `${base}/scheduling/availability/calendars`;
  const text = `Claritia couldn't send from ${b.mailbox}, so your emails go from your team's address for now. Reconnect ${name} to send from your mailbox again: ${link}`;
  return { subject: `Reconnect ${name} to send from ${b.mailbox}`, text, html: `<p style="font:15px/1.5 Inter,Arial,sans-serif">Claritia couldn't send from ${b.mailbox}, so your emails go from your team's address for now.</p><p style="font:15px/1.5 Inter,Arial,sans-serif"><a href="${link}">Reconnect ${name}</a></p>` };
}
