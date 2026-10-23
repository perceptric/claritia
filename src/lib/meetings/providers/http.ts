// What every calendar provider shares: JSON calls with a timeout, an access token refreshed before it runs out and
// once more on a 401, and the one rule for "reconnect": only the provider saying the sign-in itself is gone
// (invalid_grant on refresh, or a 401 right after a fresh token). A slow or failing provider is an ordinary error, so
// an outage never turns a working account to "reconnect".

import { createHash } from "node:crypto";
import { OauthError, oauthRefresh } from "../../sources/oauth.ts";
import { ReconnectError } from "../provider.ts";

export type Tok = { access: string; refresh: string | null; expiresAt: number };

export type HttpOpts = {
  fetcher?: typeof fetch;
  /** Stops the calls: the job's lease, or the live check's deadline. */
  signal?: AbortSignal;
  /** Per call, 20 seconds by default. */
  timeoutMs?: number;
  /** Keep a refreshed token (sealed by the caller). */
  save?: (t: Tok) => Promise<void>;
  /**
   * The token as stored now. A refresh that's refused is checked against it first: Zoom (and sometimes Microsoft)
   * hands out a new refresh token on every refresh, so a parallel job may simply have used ours already.
   */
  reload?: () => Promise<Tok | null>;
  now?: () => number;
};

export class ProviderError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** The OAuth app each provider refreshes through (src/lib/sources/oauth.ts). */
export const OAUTH_KIND = { google: "google_calendar", microsoft: "microsoft_calendar", zoom: "zoom" } as const;

export type Http = <T>(url: string, init?: RequestInit & { ok404?: boolean }) => Promise<{ status: number; data: T }>;

export function makeHttp(kind: keyof typeof OAUTH_KIND, token: Tok | null, o: HttpOpts = {}): Http {
  const fetcher = o.fetcher ?? fetch;
  const now = o.now ?? Date.now;
  let tok = token;

  async function refresh(): Promise<void> {
    if (!tok?.refresh) throw new ReconnectError("The sign-in has no refresh token.");
    const used = tok.refresh;
    try {
      const t = await oauthRefresh(OAUTH_KIND[kind], used, fetcher);
      tok = { access: t.access, refresh: t.refresh ?? used, expiresAt: t.expiresAt };
    } catch (e) {
      if (!(e instanceof OauthError) || e.code !== "invalid_grant") throw e;
      const stored = await o.reload?.().catch(() => null);
      if (stored?.refresh && stored.refresh !== used) {
        tok = stored;
        if (stored.expiresAt - 60_000 > now()) return;
        return refresh();
      }
      throw new ReconnectError(e.message);
    }
    await o.save?.(tok);
  }

  return async function http<T>(url: string, init: RequestInit & { ok404?: boolean } = {}) {
    const { ok404, ...rest } = init;
    if (!tok) throw new ReconnectError("Not signed in.");
    if (tok.expiresAt - 60_000 < now()) await refresh();
    for (let attempt = 0; ; attempt++) {
      const headers = new Headers(rest.headers);
      headers.set("authorization", `Bearer ${tok!.access}`);
      headers.set("accept", "application/json");
      if (typeof rest.body === "string" && !headers.has("content-type")) headers.set("content-type", "application/json");
      const timeout = AbortSignal.timeout(o.timeoutMs ?? 20_000);
      const signal = o.signal ? AbortSignal.any([o.signal, timeout]) : timeout;
      const res = await fetcher(url, { ...rest, headers, signal });
      if (res.status === 401) {
        if (attempt > 0) throw new ReconnectError("The provider turned the sign-in down.");
        await refresh();
        continue;
      }
      const text = await res.text().catch(() => "");
      let data: unknown = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
      if (res.ok || (ok404 && (res.status === 404 || res.status === 410))) return { status: res.status, data: data as T };
      const err = data as { error?: { message?: string } | string; message?: string } | null;
      const msg = typeof err?.error === "string" ? err.error : (err?.error?.message ?? err?.message ?? `${res.status}`);
      throw new ProviderError(`${kind} ${res.status}: ${String(msg).slice(0, 300)}`, res.status);
    }
  };
}

/** A stable id from an idempotency key: 32 lowercase hex characters, valid as a Google event id (base32hex). */
export function keyId(key: string) {
  return createHash("sha256").update(`claritia-event:${key}`).digest("hex").slice(0, 32);
}

export const iso = (ms: number) => new Date(ms).toISOString();
