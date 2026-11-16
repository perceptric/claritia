// Composio holds the sign-in for most tools (docs/sources-setup.md, "Composio"): the person connects on Composio's
// hosted page, Composio keeps and refreshes the tokens or keys, and each call a connector makes goes through
// Composio's proxy execute, which signs it with the connected account. Claritia's connector code is unchanged: the
// same URLs, bodies, retries and error words; only the signing moves. A row connected the old way (Claritia's own
// OAuth app or a pasted key) keeps the old path until the workspace reconnects.
//
// Not "server-only": the claritia-intel worker runs plain Node and sends through here too. Nothing in this file
// reaches the browser (it reads process.env), and no secret of a connected account ever comes back from Composio.

/** The auth schemes Composio names (GET /api/v3.1/toolkits/<slug>). */
export type Scheme = "OAUTH2" | "OAUTH1" | "API_KEY" | "BASIC" | "BEARER_TOKEN";
/**
 * One tool on Composio. `managed`: Composio has its own app for it (no developer app for us to register), checked
 * with `composio dev toolkits info <slug>` on 2026-11-16. A tool connected by key needs no app either: the hosted
 * page asks the person for the key. Only an OAuth tool without a managed app needs our own app, set up once in
 * Composio, and its auth config id in COMPOSIO_AUTH_CONFIG_<TOOLKIT>.
 */
export type ComposioTool = { toolkit: string; scheme: Scheme; managed: boolean };

const oauth = (toolkit: string): ComposioTool => ({ toolkit, scheme: "OAUTH2", managed: true });
const keyed = (toolkit: string, scheme: Scheme = "API_KEY"): ComposioTool => ({ toolkit, scheme, managed: false });

/**
 * Claritia's kinds that sign in through Composio. Not here (docs/sources-setup.md says why): Kit (the connector speaks
 * Kit's v3 API with the secret in the query; Composio signs v4), Discord (alerts post to a channel webhook the person
 * pastes), Twilio (Claritia checks Twilio's webhook signatures with the auth token, which Composio keeps), and the
 * tools kept as they are (Stripe, PayPal, Square, analytics, ads, warehouses, Google Forms, Omniscient, Keap,
 * SmartSuite, S3, Whereby, Postgres, Redshift, MySQL).
 */
export const COMPOSIO_TOOLS: Record<string, ComposioTool> = {
  hubspot: oauth("hubspot"),
  salesforce: oauth("salesforce"),
  // Pipedrive's OAuth has no managed app on Composio; its API token does the same work.
  pipedrive: keyed("pipedrive"),
  attio: oauth("attio"),
  close: keyed("close"),
  zoho: oauth("zoho"),
  dynamics: oauth("dynamics365"),
  // GoHighLevel's OAuth has no managed app; a private integration token and its location id.
  gohighlevel: keyed("highlevel_location", "BEARER_TOKEN"),
  freshsales: keyed("freshsales"),
  copper: keyed("copper"),
  monday: oauth("monday"),
  monday_work: oauth("monday"),
  intercom: oauth("intercom"),
  mailchimp: oauth("mailchimp"),
  klaviyo: keyed("klaviyo"),
  activecampaign: keyed("active_campaign"),
  brevo: keyed("brevo"),
  mailerlite: keyed("mailerlite"),
  google_sheets: oauth("googlesheets"),
  excel: oauth("excel"),
  airtable: oauth("airtable"),
  notion: oauth("notion"),
  google_docs: oauth("googledocs"),
  teams: oauth("microsoft_teams"),
  linear: oauth("linear"),
  trello: { toolkit: "trello", scheme: "OAUTH1", managed: true },
  clickup: oauth("clickup"),
  zendesk: oauth("zendesk"),
  freshdesk: keyed("freshdesk"),
  // OAuth only, and no managed app: on Composio once COMPOSIO_AUTH_CONFIG_DOCUSIGN names our own app's config.
  docusign: { toolkit: "docusign", scheme: "OAUTH2", managed: false },
  pandadoc: keyed("pandadoc"),
  google_drive: oauth("googledrive"),
  onedrive: oauth("one_drive"),
  dropbox: oauth("dropbox"),
  box: oauth("box"),
  webex: oauth("webex"),
};

const env = (name: string, e: NodeJS.ProcessEnv = process.env) => e[name]?.trim() ?? "";

export const composioKey = (e: NodeJS.ProcessEnv = process.env) => env("COMPOSIO_API_KEY", e);
export const composioBase = (e: NodeJS.ProcessEnv = process.env) => env("COMPOSIO_BASE_URL", e).replace(/\/+$/, "") || "https://backend.composio.dev";
/** An auth config set by hand (a white-labeled HubSpot or Salesforce app, or DocuSign's), by toolkit. */
export const authConfigEnv = (toolkit: string, e: NodeJS.ProcessEnv = process.env) => env(`COMPOSIO_AUTH_CONFIG_${toolkit.toUpperCase()}`, e);

/** Whether this kind connects through Composio now: the server has a key, and the tool needs no app of ours or has one. */
export function viaComposio(kind: string, e: NodeJS.ProcessEnv = process.env): boolean {
  const t = COMPOSIO_TOOLS[kind];
  if (!t || !composioKey(e)) return false;
  return t.managed || !t.scheme.startsWith("OAUTH") || !!authConfigEnv(t.toolkit, e);
}

/** The headers every call to Composio carries. An org-wide key also names the org and project. */
export function composioHeaders(e: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const h: Record<string, string> = { "x-api-key": composioKey(e), "content-type": "application/json", accept: "application/json" };
  const org = env("COMPOSIO_ORG_ID", e);
  const project = env("COMPOSIO_PROJECT_ID", e);
  if (org && project) Object.assign(h, { "x-org-id": org, "x-project-id": project });
  return h;
}

/** Composio's own refusal (not the tool's answer), as its error body says it. */
export type ComposioFailure = { status: number; message: string; slug: string };

export function failureOf(status: number, body: unknown): ComposioFailure {
  const e = ((body as { error?: unknown } | null)?.error ?? body) as Record<string, unknown> | null;
  const message = typeof e?.message === "string" ? e.message : typeof body === "string" ? body.slice(0, 300) : `Composio answered ${status}.`;
  return { status, message: message.slice(0, 300), slug: typeof e?.slug === "string" ? e.slug : "" };
}

// A connection Composio can't use any more: the person revoked it, it expired, or it was removed.
const GONE = /expired|revoked|inactive|not[ _-]?active|disabled|deleted|re-?auth|reconnect|invalid[ _-]?(state|token|grant)/i;

/**
 * Composio's refusal as the answer a tool would have given, so ctx.ts's retries, backoff and "Sign in again" stay as
 * they are: a connection that's gone is a 401 ("Sign in again", the card's Reconnect); Composio's own rate limit is a
 * 429 with its wait; its outages are 5xx (tried again). A key the server has wrong is the server's to fix, so it's a 503 that the delivery
 * tries again later, never "Sign in again" for the team. The rest (a request Composio can't run) is a 400 with why.
 */
export function asToolAnswer(f: ComposioFailure, retryAfter: string | null): Response {
  const body = (message: string) => JSON.stringify({ message });
  const json = { "content-type": "application/json" };
  if (f.status === 401) return new Response(body("Composio turned down the server's key (COMPOSIO_API_KEY); trying again later."), { status: 503, headers: json });
  if (f.status === 429) return new Response(body("Composio's rate limit was hit; trying again later."), { status: 429, headers: { ...json, ...(retryAfter ? { "retry-after": retryAfter } : {}) } });
  if (f.status >= 500 && f.status !== 501) return new Response(body(`Composio answered ${f.status}; trying again later.`), { status: f.status, headers: json });
  if (f.status === 403 || f.status === 404 || f.status === 410 || f.status === 422 || GONE.test(`${f.slug} ${f.message}`)) {
    return new Response(body(`Sign in again: ${f.message}`), { status: 401, headers: json });
  }
  if (f.status === 408) return new Response(body("Composio timed out; trying again later."), { status: 504, headers: json });
  return new Response(body(`Composio: ${f.message}`), { status: 400, headers: json });
}

// Headers that never go to Composio: it signs the call itself, and the rest are the transport's own.
const DROP = new Set(["authorization", "host", "content-length", "connection", "accept-encoding", "transfer-encoding", "user-agent"]);
// Headers of the tool's answer that no longer describe the body once Composio has decoded it.
const STALE = new Set(["content-length", "content-encoding", "transfer-encoding", "connection"]);

type ProxyBody = {
  connected_account_id: string;
  user_id?: string;
  endpoint: string;
  method: string;
  body?: unknown;
  binary_body?: { base64: string; content_type?: string };
  parameters?: { name: string; value: string; type: "header" | "query" }[];
};

/** The request a connector made, as proxy execute takes it. JSON goes as `body`; anything else as bytes. */
export async function proxyRequest(account: string, user: string | undefined, url: string, init: RequestInit = {}): Promise<ProxyBody> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  let type = headers.get("content-type") ?? "";
  const out: ProxyBody = { connected_account_id: account, ...(user ? { user_id: user } : {}), endpoint: url, method };
  const raw = init.body;
  if (raw != null) {
    let json: unknown;
    let parsed = false;
    if (typeof raw === "string" && (!type || /json/i.test(type))) {
      try {
        json = JSON.parse(raw);
        parsed = json !== null && typeof json === "object";
      } catch {
        parsed = false;
      }
    }
    if (parsed) out.body = json;
    else {
      // Form posts, multipart uploads and file bytes: sent as they are, with their content type (a multipart
      // boundary included).
      const r = new Request("http://composio.invalid/", { method: "POST", body: raw as BodyInit, headers: type ? { "content-type": type } : {} });
      type = r.headers.get("content-type") ?? type;
      out.binary_body = { base64: Buffer.from(await r.arrayBuffer()).toString("base64"), ...(type ? { content_type: type } : {}) };
    }
  }
  const params: ProxyBody["parameters"] = [];
  headers.forEach((value, name) => {
    if (DROP.has(name) || !value) return;
    if (name === "content-type" && (out.binary_body || out.body !== undefined)) return;
    params.push({ name, value, type: "header" });
  });
  if (params.length) out.parameters = params;
  return out;
}

type ProxyAnswer = { data?: unknown; status?: number; headers?: Record<string, string>; binary_data?: { url?: string; content_type?: string } };

/** Composio's answer turned back into the tool's own: its status, headers and body. */
export async function toolResponse(a: ProxyAnswer, fetcher: typeof fetch, signal?: AbortSignal | null): Promise<Response> {
  const status = Number.isInteger(a.status) && a.status! >= 200 && a.status! <= 599 ? a.status! : 502;
  const headers = new Headers();
  for (const [k, v] of Object.entries(a.headers ?? {})) if (!STALE.has(k.toLowerCase()) && typeof v === "string") headers.set(k, v);
  const empty = status === 204 || status === 205 || status === 304;
  if (empty) return new Response(null, { status, headers });
  // A file the tool answered with: Composio keeps it at a short-lived address of its own.
  if (a.binary_data?.url) {
    const res = await fetcher(a.binary_data.url, { signal: signal ?? undefined });
    if (!res.ok) return new Response(JSON.stringify({ message: `Composio couldn't hand over the file (${res.status}); trying again later.` }), { status: 502, headers: { "content-type": "application/json" } });
    if (a.binary_data.content_type) headers.set("content-type", a.binary_data.content_type);
    return new Response(await res.arrayBuffer(), { status, headers });
  }
  const d = a.data;
  if (d === undefined || d === null) return new Response(null, { status, headers });
  if (typeof d === "string") return new Response(d, { status, headers });
  if (!headers.has("content-type") || !/json/i.test(headers.get("content-type")!)) headers.set("content-type", "application/json");
  return new Response(JSON.stringify(d), { status, headers });
}

export type ProxyOpts = {
  account: string;
  /** The Composio user the account belongs to (the workspace); projects with 2FA ask for it. */
  user?: string;
  /** The network (tests pass a fake Composio). */
  fetcher?: typeof fetch;
  env?: NodeJS.ProcessEnv;
};

/**
 * A fetch that sends each request through Composio's proxy execute for this connected account and answers with the
 * tool's own response. Throws as fetch does when Composio can't be reached or the call runs out of time (the caller
 * tries again); Composio's refusals come back as the tool answers described in asToolAnswer.
 */
export function composioFetch(o: ProxyOpts): typeof fetch {
  const net = o.fetcher ?? fetch;
  return (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const key = composioKey(o.env);
    if (!key) return asToolAnswer({ status: 401, message: "No COMPOSIO_API_KEY", slug: "" }, null);
    const body = await proxyRequest(o.account, o.user, url, init);
    const res = await net(`${composioBase(o.env)}/api/v3.1/tools/execute/proxy`, { method: "POST", headers: composioHeaders(o.env), body: JSON.stringify(body), signal: init.signal });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    if (!res.ok) return asToolAnswer(failureOf(res.status, parsed), res.headers.get("retry-after"));
    if (!parsed || typeof parsed !== "object") return asToolAnswer({ status: 502, message: "Composio sent an empty answer.", slug: "" }, null);
    return toolResponse(parsed as ProxyAnswer, net, init.signal);
  }) as typeof fetch;
}

// What a connector reads from its connection beyond the sign-in (Salesforce's org address, the account's subdomain),
// from the connected account's non-secret fields or one call through the proxy. Done once, at connect.

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const host = (v: string) => v.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
const ZOHO_TLD: Record<string, string> = { us: "com", com: "com", eu: "eu", in: "in", au: "com.au", "com.au": "com.au", jp: "jp", ca: "ca", cn: "com.cn", "com.cn": "com.cn", sa: "sa", uk: "uk" };

/**
 * The extra values a connector reads with ctx.secret(), for a Composio connection. `val`: the connected account's
 * state fields (subdomain, region and the like; secrets are never read). `call`: one GET through the proxy.
 */
export async function composioExtras(kind: string, val: Record<string, unknown>, call: <T>(url: string) => Promise<T>): Promise<Record<string, string>> {
  const sub = str(val.subdomain);
  switch (kind) {
    case "salesforce": {
      const ok = (u: string) => /^https:\/\/[a-z0-9.-]+\.(salesforce|force)\.com$/i.test(u);
      const given = str(val.instance_url ?? val.instanceEndpoint ?? val.base_url).replace(/\/+$/, "");
      if (ok(given)) return { instance_url: given };
      // The identity service says where the org's REST API lives.
      const login = /test|sandbox/i.test(sub) ? "https://test.salesforce.com" : "https://login.salesforce.com";
      const me = await call<{ urls?: Record<string, string> }>(`${login}/services/oauth2/userinfo`).catch(() => null);
      const rest = str(me?.urls?.rest ?? me?.urls?.custom_domain);
      const origin = rest ? new URL(rest).origin : sub && !/^(login|test)$/i.test(sub) ? `https://${sub.replace(/\.my\.salesforce\.com$/i, "")}.my.salesforce.com` : "";
      if (!ok(origin)) throw new Error("Salesforce didn't say where the org lives. Connect it again.");
      return { instance_url: origin };
    }
    case "pipedrive":
      return sub ? { api_domain: `https://${host(sub).replace(/\.pipedrive\.com$/, "")}.pipedrive.com` } : {};
    case "zoho": {
      const tld = ZOHO_TLD[str(val.region).toLowerCase()] ?? "com";
      return { api_domain: `https://www.zohoapis.${tld}` };
    }
    case "dynamics": {
      const h = host(str(val.instanceEndpoint ?? val.base_url) || sub);
      const region = str(val.region).toLowerCase();
      const url = h.includes(".") ? `https://${h}` : h ? `https://${h}.${/^crm\d*$/.test(region) ? region : "crm"}.dynamics.com` : "";
      if (!/^https:\/\/[a-z0-9-]+\.crm[0-9]*\.dynamics\.com$/.test(url)) throw new Error("Dynamics 365 didn't say which environment. Connect it again.");
      return { org_url: url };
    }
    case "gohighlevel":
      return str(val.generic_id) ? { locationId: str(val.generic_id) } : {};
    case "freshsales":
      return sub ? { domain: host(sub).includes(".") ? host(sub) : `${host(sub)}.myfreshworks.com` } : {};
    case "copper":
      return str(val.generic_id) ? { email: str(val.generic_id) } : {};
    case "activecampaign": {
      const u = str(val.full ?? val.account_url ?? val.base_url ?? val.api_url);
      return u ? { url: `https://${host(u)}` } : sub ? { url: `https://${host(sub)}.api-us1.com` } : {};
    }
    case "zendesk":
      return sub ? { subdomain: host(sub).replace(/\.zendesk\.com$/, "") } : {};
    case "freshdesk":
      return sub ? { domain: host(sub).includes(".") ? host(sub) : `${host(sub)}.freshdesk.com` } : {};
    case "mailchimp": {
      const dc = str(val.dc);
      if (/^[a-z]{2}\d{1,3}$/.test(dc)) return { api_endpoint: `https://${dc}.api.mailchimp.com` };
      const m = await call<{ api_endpoint?: string }>("https://login.mailchimp.com/oauth2/metadata").catch(() => null);
      return m?.api_endpoint && /^https:\/\/[a-z]{2}\d{1,3}\.api\.mailchimp\.com$/.test(m.api_endpoint) ? { api_endpoint: m.api_endpoint } : {};
    }
    default:
      return {};
  }
}
