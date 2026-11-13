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
  /** The word before the token in the Authorization header, when it isn't Bearer (Zoho's "Zoho-oauthtoken"). */
  scheme?: string;
  /**
   * A tool with data centers (Zoho): the sign-in comes back with the person's own accounts server in this query
   * field; their token calls go there (`path` on it), and it's kept with the sign-in for each refresh.
   */
  server?: { param: string; ok: RegExp; path: string };
  /** Fields of the token answer to keep with the sign-in (GoHighLevel's locationId), beyond the usual ones. */
  keep?: string[];
  /** More fields for the code exchange and each refresh. */
  tokenBody?: Record<string, string>;
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
  // Sheets and databases (docs/integrations-plan.md step 2). Google Sheets uses the same Google app as calendars, with
  // the Sheets scope and this callback added to it; Airtable and Notion take a pasted key when their apps aren't set up.
  google_sheets: {
    env: "GOOGLE",
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email",
    extra: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
  },
  // Settings › Tracking's offline conversions: the same Google app, with the adwords scope added to it.
  google_ads: {
    env: "GOOGLE",
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/adwords https://www.googleapis.com/auth/userinfo.email",
    extra: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
  },
  // Import from Google Forms (Next step 13): the Google app, reading forms only.
  google_forms: {
    env: "GOOGLE",
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/forms.body.readonly https://www.googleapis.com/auth/userinfo.email",
    extra: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
  },
  airtable: { env: "AIRTABLE", authorize: "https://airtable.com/oauth2/v1/authorize", token: "https://airtable.com/oauth2/v1/token", scope: "data.records:read data.records:write schema.bases:read schema.bases:write user.email:read", pkce: true, basic: true },
  // Excel Online (step 2c): the Microsoft app meetings use, with Files.ReadWrite added to it.
  excel: {
    env: "MICROSOFT",
    authorize: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: "offline_access User.Read Files.ReadWrite",
    extra: { prompt: "select_account" },
    refreshScope: true,
  },
  notion: { env: "NOTION", authorize: "https://api.notion.com/v1/oauth/authorize", token: "https://api.notion.com/v1/oauth/token", basic: true, extra: { owner: "user" } },
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
  // A guest's own calendar on a booking page (docs/booking-page-plan.md, Part 6): free and busy only, read once to
  // show which times clash and never kept. The same Google app, with /api/book/overlay/callback added.
  guest_google: {
    env: "GOOGLE",
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/calendar.freebusy",
    extra: { prompt: "select_account" },
  },
  // More CRMs (docs/integrations-plan.md, Next step 4). Zoho: one app for every data center; the person's own comes
  // back as accounts-server. Dynamics 365: the Microsoft app meetings use, with Dynamics CRM's user_impersonation
  // added; it signs in to Microsoft's discovery service, and each call gets a token for the team's own Dynamics
  // address from the same sign-in. GoHighLevel: its Marketplace app, one location per sign-in. Keap: its app.
  zoho: {
    env: "ZOHO",
    authorize: "https://accounts.zoho.com/oauth/v2/auth",
    token: "https://accounts.zoho.com/oauth/v2/token",
    scope: "ZohoCRM.modules.leads.ALL,ZohoCRM.org.READ",
    extra: { access_type: "offline", prompt: "consent" },
    scheme: "Zoho-oauthtoken",
    server: { param: "accounts-server", ok: /^https:\/\/accounts\.zoho\.(com|eu|in|com\.au|jp|ca|sa|uk|com\.cn)$/, path: "/oauth/v2/token" },
  },
  dynamics: {
    env: "MICROSOFT",
    authorize: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: "offline_access User.Read https://globaldisco.crm.dynamics.com/user_impersonation",
    extra: { prompt: "select_account" },
    refreshScope: true,
  },
  gohighlevel: {
    env: "GHL",
    authorize: "https://marketplace.gohighlevel.com/oauth/chooselocation",
    token: "https://services.leadconnectorhq.com/oauth/token",
    scope: "contacts.readonly contacts.write locations.readonly",
    keep: ["locationId", "companyId"],
    tokenBody: { user_type: "Location" },
  },
  keap: { env: "KEAP", authorize: "https://accounts.infusionsoft.com/app/oauth/authorize", token: "https://api.infusionsoft.com/token", scope: "full" },
  // Sending as the host (Next step 6): each person's own mailbox, on the Google app and the Microsoft app the
  // calendars use, with the send-only scopes added to them. Connected from Settings › Profile through
  // /api/mailbox/connect.
  gmail: {
    env: "GOOGLE",
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email",
    extra: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
  },
  outlook_mail: {
    env: "MICROSOFT",
    authorize: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: "offline_access User.Read Mail.Send",
    extra: { prompt: "select_account" },
    refreshScope: true,
  },
  // Work tools (Next step 10). Zendesk signs in per account address, so it takes an API token instead.
  linear: { env: "LINEAR", authorize: "https://linear.app/oauth/authorize", token: "https://api.linear.app/oauth/token", scope: "read,write,issues:create", extra: { prompt: "consent" } },
  clickup: { env: "CLICKUP", authorize: "https://app.clickup.com/api", token: "https://api.clickup.com/api/v2/oauth/token" },
  // Documents (Next step 11). Google Docs: the Google app the calendars use, with the Docs scope (to read a pasted
  // template) and drive.file (only the docs it makes), both sensitive. DocuSign: its app, the signature scope.
  google_docs: {
    env: "GOOGLE",
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email",
    extra: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
  },
  docusign: { env: "DOCUSIGN", authorize: "https://account.docusign.com/oauth/auth", token: "https://account.docusign.com/oauth/token", scope: "signature", basic: true },
  // Chat alerts (docs/integrations-plan.md, Next step 5). Teams: the Microsoft app meetings use, with the Teams scopes
  // added. Discord: Add to Discord picks one channel and answers with its webhook, kept with the sign-in.
  teams: {
    env: "MICROSOFT",
    authorize: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: "offline_access User.Read Team.ReadBasic.All Channel.ReadBasic.All ChannelMessage.Send",
    extra: { prompt: "select_account" },
    refreshScope: true,
  },
  discord: { env: "DISCORD", authorize: "https://discord.com/oauth2/authorize", token: "https://discord.com/api/oauth2/token", scope: "webhook.incoming" },
  // File copies (Next step 9). Drive asks only for drive.file: the folders and files Claritia makes. OneDrive is the
  // Microsoft app with Files.ReadWrite; Dropbox and Box have apps of their own.
  google_drive: {
    env: "GOOGLE",
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email",
    extra: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
  },
  onedrive: {
    env: "MICROSOFT",
    authorize: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: "offline_access User.Read Files.ReadWrite",
    extra: { prompt: "select_account" },
    refreshScope: true,
  },
  dropbox: {
    env: "DROPBOX",
    authorize: "https://www.dropbox.com/oauth2/authorize",
    token: "https://api.dropboxapi.com/oauth2/token",
    scope: "account_info.read files.metadata.read files.content.read files.content.write",
    extra: { token_access_type: "offline" },
  },
  box: { env: "BOX", authorize: "https://account.box.com/api/oauth2/authorize", token: "https://api.box.com/oauth2/token" },
  // Meeting places (Next step 12): the team's Webex makes a meeting per booking.
  webex: { env: "WEBEX", authorize: "https://webexapis.com/v1/authorize", token: "https://webexapis.com/v1/access_token", scope: "meeting:schedules_write meeting:schedules_read spark:people_read" },
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

/** The accounts server a sign-in came back with, when the tool has data centers and it's one of theirs. */
export function serverOf(kind: string, raw: string | null | undefined): string | undefined {
  const c = OAUTH[kind]?.server;
  return c && raw && c.ok.test(raw) ? raw : undefined;
}

type CallOpts = { server?: string; scope?: string };

async function tokenCall(kind: string, params: Record<string, string>, fetcher: typeof fetch = fetch, o: CallOpts = {}): Promise<Token> {
  const c = OAUTH[kind];
  const scope = o.scope ?? (c.refreshScope && params.grant_type === "refresh_token" ? c.scope : undefined);
  const scoped = { ...params, ...(c.tokenBody ?? {}), ...(scope ? { scope } : {}) };
  const body = new URLSearchParams(c.basic ? scoped : { ...scoped, client_id: clientId(kind), client_secret: clientSecret(kind) });
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  if (c.basic) headers.Authorization = `Basic ${Buffer.from(`${clientId(kind)}:${clientSecret(kind)}`).toString("base64")}`;
  const server = o.server && c.server?.ok.test(o.server) ? o.server : undefined;
  const res = await fetcher(server ? `${server}${c.server!.path}` : c.token, { method: "POST", headers, body, signal: AbortSignal.timeout(10_000) });
  const t = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof t.access_token !== "string") {
    throw new OauthError(String(t.error_description ?? t.message ?? t.error ?? `Sign-in failed (${res.status})`), typeof t.error === "string" ? t.error : "", res.status);
  }
  const extra: Record<string, string> = {};
  // Salesforce's org address, Pipedrive's company address.
  for (const k of ["instance_url", "api_domain", "id", ...(c.keep ?? [])]) if (typeof t[k] === "string") extra[k] = t[k] as string;
  if (server) extra.server = server;
  // Discord's Add to Discord: the channel's webhook comes back with the token.
  const wh = t.webhook as Record<string, unknown> | undefined;
  if (wh && typeof wh.url === "string") {
    extra.webhook_url = wh.url;
    for (const k of ["channel_id", "guild_id", "name"]) if (typeof wh[k] === "string") extra[k === "name" ? "webhook_name" : k] = wh[k] as string;
  }
  return {
    access: t.access_token,
    refresh: typeof t.refresh_token === "string" ? t.refresh_token : null,
    // Salesforce doesn't say; its sessions last at least 2 hours.
    expiresAt: Date.now() + (Number(t.expires_in) || 7200) * 1000,
    extra,
  };
}

export const oauthExchange = (kind: string, code: string, redirectUri: string, verifier?: string, fetcher?: typeof fetch, server?: string) =>
  tokenCall(kind, { grant_type: "authorization_code", code, redirect_uri: redirectUri, ...(verifier ? { code_verifier: verifier } : {}) }, fetcher, { server });

/**
 * The refresh call for a token to another resource (Dynamics: the team's own address), for a connector to send
 * through its context, so it takes the same retries and the test's network.
 */
export function refreshRequest(kind: string, refresh: string, scope: string): { url: string; body: string } {
  const c = OAUTH[kind];
  return { url: c.token, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh, scope, client_id: clientId(kind), client_secret: clientSecret(kind) }).toString() };
}

/** A fresh token. `server`: the data center the sign-in came from; `scope`: a token for another resource (Dynamics). */
export const oauthRefresh = (kind: string, refresh: string, fetcher?: typeof fetch, o: CallOpts = {}) => tokenCall(kind, { grant_type: "refresh_token", refresh_token: refresh }, fetcher, o);
