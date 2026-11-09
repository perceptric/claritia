// Sign-in for the apps that use the Forms API (docs/integrations-plan.md, Next step 1): Zapier, Make and
// Activepieces. The app sends the person to /oauth/authorize; they approve in Claritia; the app trades the code at
// /api/oauth/token for an API key named after it (127_api_hooks.sql). The key never expires; revoking it in
// Settings › API keys signs the app out and removes its hooks.
//   Each app's client secret is an environment variable; an app without one can't sign in.
//   ChatGPT, Claude and other MCP apps register themselves first (/api/oauth/register, 141_mcp_oauth_clients.sql):
//   they get a client id (mcp_...) and no secret, may only return to an address they registered, and must send a
//   PKCE check (S256).

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type ClientId = "zapier" | "make" | "activepieces";

export type OAuthClient = { id: string; name: string; domain: string; env?: string; redirectOk: (u: string) => boolean; public?: boolean };

const exact = (list: string[]) => (u: string) => list.includes(u);

export const OAUTH_CLIENTS: Record<ClientId, OAuthClient> = {
  // Zapier's return address carries the app's id: https://zapier.com/dashboard/auth/oauth/return/App123CLIAPI/
  zapier: { id: "zapier", name: "Zapier", domain: "zapier.com", env: "OAUTH_ZAPIER_SECRET", redirectOk: (u) => /^https:\/\/zapier\.com\/dashboard\/auth\/oauth\/return\/[A-Za-z0-9_-]{1,80}\/?$/.test(u) },
  make: { id: "make", name: "Make", domain: "make.com", env: "OAUTH_MAKE_SECRET", redirectOk: exact(["https://www.make.com/oauth/cb/app", "https://www.integromat.com/oauth/cb/app"]) },
  activepieces: { id: "activepieces", name: "Activepieces", domain: "activepieces.com", env: "OAUTH_ACTIVEPIECES_SECRET", redirectOk: exact(["https://cloud.activepieces.com/redirect"]) },
};

export const clientOf = (id: unknown): OAuthClient | null => (typeof id === "string" && Object.hasOwn(OAUTH_CLIENTS, id) ? OAUTH_CLIENTS[id as ClientId] : null);

/** The app's secret, or null when it isn't set up. An app that registered itself has none. */
export const clientSecret = (c: OAuthClient, env: Record<string, string | undefined> = process.env) => (c.env ? env[c.env]?.trim() || null : null);

// ── Apps that register themselves (RFC 7591) ─────────────────────────────────────────────────────────────────────

export const DYNAMIC_ID = /^mcp_[A-Za-z0-9_-]{20,64}$/;
export const newClientId = () => `mcp_${randomBytes(24).toString("base64url")}`;

/** A return address an app may register: https anywhere, or http on this computer (desktop apps). No fragment. */
export function redirectAllowed(u: unknown): u is string {
  if (typeof u !== "string" || u.length > 2000) return false;
  let x: URL;
  try {
    x = new URL(u);
  } catch {
    return false;
  }
  if (x.hash || x.username || x.password) return false;
  if (x.protocol === "https:") return true;
  return x.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(x.hostname);
}

/** An app's registration, checked: its name and return addresses, or the RFC 7591 error. */
/** Reads a registered app with the server's database (oauth_client_get). */
export const loadRegistered = (db: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> } | null) => async (id: string) => {
  if (!db) return null;
  const r = await db.rpc("oauth_client_get", { p_id: id });
  if (r.error) throw new Error("oauth_client_get failed");
  return (r.data as { name: string; redirect_uris: string[] } | null) ?? null;
};

export function checkRegistration(b: Record<string, unknown>): { name: string; redirects: string[] } | { error: string; description: string } {
  const bad = (description: string) => ({ error: "invalid_client_metadata", description });
  const list = b.redirect_uris;
  if (!Array.isArray(list) || !list.length || list.length > 10) return { error: "invalid_redirect_uri", description: "Send 1 to 10 redirect_uris." };
  if (!list.every(redirectAllowed)) return { error: "invalid_redirect_uri", description: "Each redirect_uri must be https, or http on localhost." };
  if (b.token_endpoint_auth_method !== undefined && b.token_endpoint_auth_method !== "none") return bad("Only public clients: token_endpoint_auth_method none, with PKCE.");
  if (b.grant_types !== undefined && !(Array.isArray(b.grant_types) && b.grant_types.includes("authorization_code"))) return bad("Only the authorization_code grant.");
  if (b.response_types !== undefined && !(Array.isArray(b.response_types) && b.response_types.includes("code"))) return bad("Only the code response type.");
  const raw = typeof b.client_name === "string" ? b.client_name.replace(/[\u0000-\u001f\u007f]/g, "").trim() : "";
  return { name: raw.slice(0, 60) || "AI app", redirects: [...new Set(list as string[])] };
}

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** A registered app as a client: it returns only to the addresses it registered. */
export function dynamicClient(id: string, row: { name: string; redirect_uris: string[] }): OAuthClient {
  return { id, name: row.name, domain: hostOf(row.redirect_uris[0] ?? ""), redirectOk: (u) => row.redirect_uris.includes(u), public: true };
}

/** Any client by id: one of the apps above, or one that registered itself (read with `load`). */
export async function findClient(id: unknown, load: (id: string) => Promise<{ name: string; redirect_uris: string[] } | null>): Promise<OAuthClient | null> {
  const fixed = clientOf(id);
  if (fixed) return fixed;
  if (typeof id !== "string" || !DYNAMIC_ID.test(id)) return null;
  const row = await load(id);
  return row && Array.isArray(row.redirect_uris) ? dynamicClient(id, row) : null;
}

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
export function checkAuthorize(q: Record<string, unknown>, found: OAuthClient | null = clientOf(q.client_id)): { client: OAuthClient; redirect: string; state: string; challenge: string | null } | { error: string } {
  if (!found) return { error: "This app can't connect to Claritia." };
  let client = found;
  const redirect = typeof q.redirect_uri === "string" ? q.redirect_uri : "";
  if (!client.redirectOk(redirect)) return { error: `${client.name} sent a return address Claritia doesn't know.` };
  if (q.response_type !== undefined && q.response_type !== "code") return { error: `${client.name} asked for a sign-in Claritia doesn't offer.` };
  const state = typeof q.state === "string" ? q.state.slice(0, 500) : "";
  const challenge = typeof q.code_challenge === "string" && q.code_challenge ? q.code_challenge : null;
  if (challenge && (q.code_challenge_method !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(challenge))) return { error: `${client.name} sent a code check Claritia doesn't offer.` };
  if (client.public && !challenge) return { error: `${client.name} didn't send a code check.` };
  // A registered app shows where it returns to, so a made-up name can't pass for another app.
  if (client.public) client = { ...client, domain: hostOf(redirect) };
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
