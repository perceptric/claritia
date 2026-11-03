// The Claritia Slack app (docs/router.md Part 17): one install per workspace, its bot token sealed with SECRETS_KEY in
// slack_installs. It sends reps direct messages (new leads, response-time nudges), answers /book, and takes the
// "Mark contacted" button. Slack signs every request it sends with the app's signing secret. Server only.
//
// Secrets: SLACK_CLIENT_ID, SLACK_CLIENT_SECRET and SLACK_SIGNING_SECRET. Without them, "Add to Slack" answers that
// Slack isn't set up, and alerts keep using the channel webhook or email.

import { createHmac, timingSafeEqual } from "node:crypto";
import { seal, unseal } from "../seal.ts";

const env = (name: string) => process.env[name]?.trim() ?? "";

export const SLACK_SCOPES = "commands,chat:write,users:read,users:read.email";

export const slackReady = () => Boolean(env("SLACK_CLIENT_ID") && env("SLACK_CLIENT_SECRET") && env("SLACK_SIGNING_SECRET"));

/** The "Add to Slack" link. `state` is the signed OAuth state (src/lib/sources/oauth.ts). */
export function slackInstallUrl(redirect: string, state: string): string {
  const q = new URLSearchParams({ client_id: env("SLACK_CLIENT_ID"), scope: SLACK_SCOPES, redirect_uri: redirect, state });
  return `https://slack.com/oauth/v2/authorize?${q}`;
}

export type SlackInstall = { team: string; teamName: string; bot: string; token: string };

/** Trade the sign-in code for the bot token. */
export async function slackExchange(code: string, redirect: string, fetcher: typeof fetch = fetch): Promise<SlackInstall> {
  const body = new URLSearchParams({ code, redirect_uri: redirect, client_id: env("SLACK_CLIENT_ID"), client_secret: env("SLACK_CLIENT_SECRET") });
  const res = await fetcher("https://slack.com/api/oauth.v2.access", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(10_000) });
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; access_token?: string; bot_user_id?: string; team?: { id?: string; name?: string } };
  if (!j.ok || !j.access_token || !j.team?.id) throw new Error(j.error ? `Slack said ${j.error}.` : "Slack sign-in failed.");
  return { team: j.team.id, teamName: j.team.name ?? "", bot: j.bot_user_id ?? "", token: j.access_token };
}

export const sealToken = (token: string) => seal(JSON.stringify({ token }));

export function tokenOf(sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  try {
    const t = (JSON.parse(unseal(sealed)) as { token?: string }).token;
    return typeof t === "string" && t.startsWith("xoxb-") ? t : null;
  } catch {
    return null;
  }
}

/**
 * Whether a request came from Slack: the v0 signature over the timestamp and the raw body, with the timestamp within
 * five minutes (so an old request can't be sent again).
 */
export function slackSigned(o: { body: string; timestamp: string | null; signature: string | null; secret?: string; now?: number }): boolean {
  const secret = o.secret ?? env("SLACK_SIGNING_SECRET");
  const ts = Number(o.timestamp);
  if (!secret || !Number.isFinite(ts) || !o.signature) return false;
  if (Math.abs((o.now ?? Date.now()) / 1000 - ts) > 300) return false;
  const want = Buffer.from(`v0=${createHmac("sha256", secret).update(`v0:${o.timestamp}:${o.body}`).digest("hex")}`);
  const got = Buffer.from(o.signature);
  return want.length === got.length && timingSafeEqual(want, got);
}

export type SlackResult = { status: "done" } | { status: "retry"; error: string; retryAfterS?: number } | { status: "failed"; error: string };

/** One Web API call. Rate limits and Slack's own errors come back as retry; a revoked token as failed. */
export async function slackApi<T = Record<string, unknown>>(token: string, method: string, args: Record<string, unknown>, fetcher: typeof fetch = fetch): Promise<{ ok: true; data: T } | { ok: false; result: SlackResult }> {
  let res: Response;
  try {
    res = await fetcher(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(args),
      // No Slack call may hold a request or a job: 10 s each.
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    return { ok: false, result: { status: "retry", error: e instanceof Error ? e.message : "Slack didn't answer." } };
  }
  if (res.status === 429) return { ok: false, result: { status: "retry", error: "Slack asked to slow down.", retryAfterS: Number(res.headers.get("retry-after")) || 30 } };
  if (res.status >= 500) return { ok: false, result: { status: "retry", error: `Slack answered ${res.status}.` } };
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (j.ok) return { ok: true, data: j as T };
  const error = j.error ?? `Slack answered ${res.status}.`;
  if (/ratelimited|internal_error|fatal_error|service_unavailable|request_timeout/.test(error)) return { ok: false, result: { status: "retry", error } };
  return { ok: false, result: { status: "failed", error } };
}

/** A direct message to the person with this email, from the app. "failed" with users_not_found when they're not in Slack. */
// Who is who in Slack changes rarely: a person's id by email, and an email by id, kept an hour in this process
// (found answers only). A message that can't reach a kept id forgets it, so the next one looks it up again.
const HOUR = 3_600_000;
const slackIds = new Map<string, { v: string; until: number }>();
const slackEmails = new Map<string, { v: string; until: number }>();
const keyOf = (token: string, x: string) => `${createHmac("sha256", "slack").update(token).digest("hex").slice(0, 16)}|${x.toLowerCase()}`;
function remember(m: Map<string, { v: string; until: number }>, k: string, v: string) {
  if (m.size >= 5000) m.delete(m.keys().next().value!);
  m.set(k, { v, until: Date.now() + HOUR });
}
const recall = (m: Map<string, { v: string; until: number }>, k: string) => {
  const hit = m.get(k);
  if (hit && hit.until > Date.now()) return hit.v;
  if (hit) m.delete(k);
  return null;
};
/** Tests: forget the kept ids and emails. */
export const forgetSlackPeople = () => {
  slackIds.clear();
  slackEmails.clear();
};

export async function slackDm(token: string, email: string, text: string, blocks: unknown[], fetcher?: typeof fetch): Promise<SlackResult> {
  const k = keyOf(token, email);
  let id = recall(slackIds, k);
  const kept = !!id;
  if (!id) {
    const who = await slackApi<{ user?: { id?: string } }>(token, "users.lookupByEmail", { email }, fetcher);
    if (!who.ok) return who.result;
    id = who.data.user?.id ?? null;
    if (!id) return { status: "failed", error: "users_not_found" };
    remember(slackIds, k, id);
  }
  const sent = await slackApi(token, "chat.postMessage", { channel: id, text, blocks, unfurl_links: false }, fetcher);
  if (sent.ok) return { status: "done" };
  if (kept && sent.result.status === "failed") {
    // The kept id may be stale (the person left or was replaced): look up once more, as a first send would have.
    slackIds.delete(k);
    return slackDm(token, email, text, blocks, fetcher);
  }
  return sent.result;
}

/** The email of a Slack person, to find their Claritia account. */
export async function slackEmail(token: string, user: string, fetcher?: typeof fetch): Promise<string | null> {
  const k = keyOf(token, user);
  const hit = recall(slackEmails, k);
  if (hit) return hit;
  const r = await slackApi<{ user?: { profile?: { email?: string } } }>(token, "users.info", { user }, fetcher);
  const email = r.ok ? (r.data.user?.profile?.email ?? null) : null;
  if (email) remember(slackEmails, k, email);
  return email;
}

/** Slack mrkdwn: the three characters it reads as control text. */
export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const section = (text: string) => ({ type: "section", text: { type: "mrkdwn", text } });

export const fields = (rows: { label: string; value: string }[]) =>
  rows.length ? [{ type: "section", fields: rows.slice(0, 10).map((x) => ({ type: "mrkdwn", text: `*${esc(x.label)}*\n${esc(x.value).slice(0, 500)}` })) }] : [];

/** A row of buttons: links open a page; actions come back to /api/slack/actions with their value. */
export function buttons(list: ({ text: string; url: string } | { text: string; action: string; value: string; primary?: boolean })[]) {
  return {
    type: "actions",
    elements: list.map((b) =>
      "url" in b
        ? { type: "button", text: { type: "plain_text", text: b.text }, url: b.url }
        : { type: "button", text: { type: "plain_text", text: b.text }, action_id: b.action, value: b.value, ...(b.primary ? { style: "primary" } : {}) },
    ),
  };
}
