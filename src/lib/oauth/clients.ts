// Sign-in for the apps that use the Forms API (docs/integrations-plan.md, Next step 1): Zapier, Make and
// Activepieces. The app sends the person to /oauth/authorize; they approve in Claritia; the app trades the code at
// /api/oauth/token for an API key named after it (127_api_hooks.sql). The key never expires; revoking it in
// Settings › API keys signs the app out and removes its hooks.
//   Each app's client secret is an environment variable; an app without one can't sign in.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type ClientId = "zapier" | "make" | "activepieces";

export type OAuthClient = { id: ClientId; name: string; domain: string; env: string; redirectOk: (u: string) => boolean };

const exact = (list: string[]) => (u: string) => list.includes(u);

export const OAUTH_CLIENTS: Record<ClientId, OAuthClient> = {
  // Zapier's return address carries the app's id: https://zapier.com/dashboard/auth/oauth/return/App123CLIAPI/
  zapier: { id: "zapier", name: "Zapier", domain: "zapier.com", env: "OAUTH_ZAPIER_SECRET", redirectOk: (u) => /^https:\/\/zapier\.com\/dashboard\/auth\/oauth\/return\/[A-Za-z0-9_-]{1,80}\/?$/.test(u) },
  make: { id: "make", name: "Make", domain: "make.com", env: "OAUTH_MAKE_SECRET", redirectOk: exact(["https://www.make.com/oauth/cb/app", "https://www.integromat.com/oauth/cb/app"]) },
  activepieces: { id: "activepieces", name: "Activepieces", domain: "activepieces.com", env: "OAUTH_ACTIVEPIECES_SECRET", redirectOk: exact(["https://cloud.activepieces.com/redirect"]) },
};

export const clientOf = (id: unknown): OAuthClient | null => (typeof id === "string" && id in OAUTH_CLIENTS ? OAUTH_CLIENTS[id as ClientId] : null);

/** The app's secret, or null when it isn't set up. */
export const clientSecret = (c: OAuthClient, env: Record<string, string | undefined> = process.env) => env[c.env]?.trim() || null;

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export const newCode = () => randomBytes(32).toString("base64url");

/** Two secrets compared in constant time. */
export function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(sha256(a)),
    y = Buffer.from(sha256(b));
  return timingSafeEqual(x, y);
}

/** PKCE (S256 only): the verifier matches the challenge sent with the request. No challenge: nothing to check. */
export function pkceOk(challenge: string | null, verifier: unknown): boolean {
  if (!challenge) return true;
  if (typeof verifier !== "string" || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  return createHash("sha256").update(verifier).digest("base64url") === challenge;
}

/** The authorize request as the app sent it, checked. */
export function checkAuthorize(q: Record<string, unknown>): { client: OAuthClient; redirect: string; state: string; challenge: string | null } | { error: string } {
  const client = clientOf(q.client_id);
  if (!client) return { error: "This app can't connect to Claritia." };
  const redirect = typeof q.redirect_uri === "string" ? q.redirect_uri : "";
  if (!client.redirectOk(redirect)) return { error: `${client.name} sent a return address Claritia doesn't know.` };
  if (q.response_type !== undefined && q.response_type !== "code") return { error: `${client.name} asked for a sign-in Claritia doesn't offer.` };
  const state = typeof q.state === "string" ? q.state.slice(0, 500) : "";
  const challenge = typeof q.code_challenge === "string" && q.code_challenge ? q.code_challenge : null;
  if (challenge && (q.code_challenge_method !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(challenge))) return { error: `${client.name} sent a code check Claritia doesn't offer.` };
  return { client, redirect, state, challenge };
}

/** Where the person goes back to: the app's address with the code (or the error) and the state. */
export function backTo(redirect: string, p: { code?: string; error?: string; state: string }): string {
  const u = new URL(redirect);
  if (p.code) u.searchParams.set("code", p.code);
  if (p.error) u.searchParams.set("error", p.error);
  if (p.state) u.searchParams.set("state", p.state);
  return u.href;
}
