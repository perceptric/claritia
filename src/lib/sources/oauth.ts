// One-click sign-in for the tools that offer it. Each needs Claritia's own app registered once with that tool
// (its client id and secret as <PREFIX>_CLIENT_ID and <PREFIX>_CLIENT_SECRET). Without them, the tool takes a
// pasted key instead. State is signed with SECRETS_KEY and carries the PKCE verifier, so nothing is stored.

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type OauthCfg = {
  env: string;
  authorize: string;
  token: string;
  scope?: string;
  basic?: boolean;
  pkce?: boolean;
  extra?: Record<string, string>;
  /** Send the scope again when refreshing (Microsoft's identity platform asks for it). */
  refreshScope?: boolean;
};

export const OAUTH: Record<string, OauthCfg> = {
  hubspot: {
    env: "HUBSPOT",
    authorize: "https://app.hubspot.com/oauth/authorize",
    token: "https://api.hubapi.com/oauth/v1/token",
    scope: "oauth crm.objects.contacts.read crm.objects.contacts.write crm.objects.companies.read crm.lists.read crm.schemas.contacts.read crm.schemas.contacts.write",
    // Optional: timeline events for email and form activity (without it, activity goes in as notes), and deals for
    // Opportunities (without it, that step is skipped).
    extra: { optional_scope: "timeline.read timeline.write crm.objects.owners.read crm.objects.deals.read" },
  },
  salesforce: { env: "SALESFORCE", authorize: "https://login.salesforce.com/services/oauth2/authorize", token: "https://login.salesforce.com/services/oauth2/token", scope: "api refresh_token", pkce: true },
  pipedrive: { env: "PIPEDRIVE", authorize: "https://oauth.pipedrive.com/oauth/authorize", token: "https://oauth.pipedrive.com/oauth/token", basic: true },
  attio: { env: "ATTIO", authorize: "https://app.attio.com/authorize", token: "https://app.attio.com/oauth/token" },
  mailchimp: { env: "MAILCHIMP", authorize: "https://login.mailchimp.com/oauth2/authorize", token: "https://login.mailchimp.com/oauth2/token" },
  // Meetings (docs/meetings-scheduler.md 1.1): each person's own calendar, connected from My calendar through
  // /api/calendar/connect. Google asks again for consent so a refresh token always comes back.
  google_calendar: {
    env: "GOOGLE",
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email",
    extra: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
  },
  // Entra ID, multi-tenant: any work or school account (and personal Outlook accounts) can sign in.
  microsoft_calendar: {
    env: "MICROSOFT",
    authorize: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: "offline_access User.Read Calendars.ReadWrite",
    extra: { prompt: "select_account" },
    refreshScope: true,
  },
  // Zoom's scopes (meeting:write) are set on the Marketplace app itself, not in the sign-in link.
  zoom: { env: "ZOOM", authorize: "https://zoom.us/oauth/authorize", token: "https://zoom.us/oauth/token", basic: true },
};

const env = (name: string) => process.env[name]?.trim() ?? "";
const clientId = (kind: string) => env(`${OAUTH[kind]?.env}_CLIENT_ID`);
const clientSecret = (kind: string) => env(`${OAUTH[kind]?.env}_CLIENT_SECRET`);

export const oauthReady = (kind: string) => Boolean(OAUTH[kind] && clientId(kind) && clientSecret(kind));
/** The secret a tool signs its app-wide webhooks with (HubSpot v3 signatures use the client secret). */
export const appSecret = (kind: string) => clientSecret(kind);

export type State = { ws: string; user: string; kind: string; verifier?: string; exp: number };

function stateKey() {
  const k = env("SECRETS_KEY");
  if (k.length < 32) throw new Error("Add SECRETS_KEY (32 or more random characters) on Render.");
  return createHash("sha256").update(`oauth-state:${k}`).digest();
}

export function signState(s: Omit<State, "exp">, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ ...s, exp: now + 15 * 60_000 })).toString("base64url");
  return `${body}.${createHmac("sha256", stateKey()).update(body).digest("base64url")}`;
}

export function readState(raw: string | null, now = Date.now()): State | null {
  const [body, sig] = (raw ?? "").split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(createHmac("sha256", stateKey()).update(body).digest("base64url"));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString()) as State;
    return typeof s.ws === "string" && typeof s.user === "string" && typeof s.kind === "string" && s.exp > now ? s : null;
  } catch {
    return null;
  }
}

/** The tool's sign-in link. */
export function oauthUrl(kind: string, redirectUri: string, s: Omit<State, "exp" | "verifier">) {
  const c = OAUTH[kind];
  const verifier = c.pkce ? randomBytes(32).toString("base64url") : undefined;
  const q = new URLSearchParams({ client_id: clientId(kind), redirect_uri: redirectUri, response_type: "code", state: signState({ ...s, verifier }) });
  if (c.scope) q.set("scope", c.scope);
  if (verifier) {
    q.set("code_challenge", createHash("sha256").update(verifier).digest("base64url"));
    q.set("code_challenge_method", "S256");
  }
  for (const [k, v] of Object.entries(c.extra ?? {})) q.set(k, v);
  return `${c.authorize}?${q}`;
}

export type Token = { access: string; refresh: string | null; expiresAt: number; extra: Record<string, string> };

/** A refused token call; `code` is the OAuth error ("invalid_grant" when the sign-in was revoked or expired). */
export class OauthError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function tokenCall(kind: string, params: Record<string, string>, fetcher: typeof fetch = fetch): Promise<Token> {
  const c = OAUTH[kind];
  const scoped = c.refreshScope && params.grant_type === "refresh_token" && c.scope ? { ...params, scope: c.scope } : params;
  const body = new URLSearchParams(c.basic ? scoped : { ...scoped, client_id: clientId(kind), client_secret: clientSecret(kind) });
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  if (c.basic) headers.Authorization = `Basic ${Buffer.from(`${clientId(kind)}:${clientSecret(kind)}`).toString("base64")}`;
  const res = await fetcher(c.token, { method: "POST", headers, body });
  const t = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof t.access_token !== "string") {
    throw new OauthError(String(t.error_description ?? t.message ?? t.error ?? `Sign-in failed (${res.status})`), typeof t.error === "string" ? t.error : "", res.status);
  }
  const extra: Record<string, string> = {};
  // Salesforce's org address, Pipedrive's company address.
  for (const k of ["instance_url", "api_domain", "id"]) if (typeof t[k] === "string") extra[k] = t[k] as string;
  return {
    access: t.access_token,
    refresh: typeof t.refresh_token === "string" ? t.refresh_token : null,
    // Salesforce doesn't say; its sessions last at least 2 hours.
    expiresAt: Date.now() + (Number(t.expires_in) || 7200) * 1000,
    extra,
  };
}

export const oauthExchange = (kind: string, code: string, redirectUri: string, verifier?: string, fetcher?: typeof fetch) =>
  tokenCall(kind, { grant_type: "authorization_code", code, redirect_uri: redirectUri, ...(verifier ? { code_verifier: verifier } : {}) }, fetcher);

export const oauthRefresh = (kind: string, refresh: string, fetcher?: typeof fetch) => tokenCall(kind, { grant_type: "refresh_token", refresh_token: refresh }, fetcher);
