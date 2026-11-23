import "server-only";
import { authConfigEnv, COMPOSIO_TOOLS, composioBase, composioExtras, composioFetch, composioHeaders, failureOf, type ComposioTool } from "./composio.ts";
import type { Creds } from "./types.ts";
import { setTimeout as sleepFor } from "node:timers/promises";

// Connecting a tool on Composio (docs/sources-setup.md, "Composio"): find the tool's auth config (one set by hand in
// COMPOSIO_AUTH_CONFIG_<TOOLKIT>, else the project's own, else a new Composio-managed one, as the SDK's
// toolkits.authorize does), open Composio's hosted connect page for the workspace, and when the person comes back,
// check the connected account is ACTIVE before it's saved. The Composio user is the workspace: one connection per
// tool per workspace, as Claritia keeps them (sources is unique on workspace and kind).

type Net = { fetcher?: typeof fetch; env?: NodeJS.ProcessEnv };

async function call<T>(path: string, init: RequestInit & Net = {}): Promise<T> {
  const { fetcher = fetch, env, ...rest } = init;
  const res = await fetcher(`${composioBase(env)}${path}`, { ...rest, headers: composioHeaders(env), signal: rest.signal ?? AbortSignal.timeout(15_000) });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const f = failureOf(res.status, body);
    throw Object.assign(new Error(res.status === 401 ? "Composio turned down the server's key." : `Composio: ${f.message}`), { status: res.status });
  }
  return body as T;
}

const configs = new Map<string, string>();

type AuthConfigItem = { id: string; status?: string; is_composio_managed?: boolean; auth_scheme?: string; toolkit?: { slug?: string } };

/** The auth config a tool's connections use: set by hand, the project's own, or a new one Composio manages. */
export async function authConfigFor(t: ComposioTool, o: Net = {}): Promise<string> {
  const set = authConfigEnv(t.toolkit, o.env);
  if (set) return set;
  const known = configs.get(t.toolkit);
  if (known) return known;
  const list = await call<{ items?: AuthConfigItem[] }>(`/api/v3.1/auth_configs?${new URLSearchParams({ toolkit_slug: t.toolkit, limit: "50" })}`, o);
  const fits = (list.items ?? []).filter((c) => c.status !== "DISABLED" && (c.toolkit?.slug ?? t.toolkit) === t.toolkit && (!c.auth_scheme || c.auth_scheme === t.scheme));
  let id: string | undefined = (t.managed ? fits.find((c) => c.is_composio_managed) : undefined)?.id ?? fits[0]?.id;
  if (!id) {
    if (t.scheme.startsWith("OAUTH") && !t.managed) throw new Error(`Set COMPOSIO_AUTH_CONFIG_${t.toolkit.toUpperCase()} on the server first.`);
    // A key tool: the hosted page asks the person for the key, so the config itself holds nothing.
    const auth_config = t.managed ? { type: "use_composio_managed_auth" } : { type: "use_custom_auth", authScheme: t.scheme, credentials: {} };
    const made = await call<{ auth_config?: { id?: string } }>("/api/v3.1/auth_configs", { ...o, method: "POST", body: JSON.stringify({ toolkit: { slug: t.toolkit }, auth_config }) });
    id = made.auth_config?.id;
    if (!id) throw new Error("Composio didn't make an auth config.");
  }
  configs.set(t.toolkit, id);
  return id;
}

/** Composio's hosted connect page for this workspace and tool, coming back to `callbackUrl`. */
export async function connectLink(kind: string, ws: string, callbackUrl: string, o: Net = {}): Promise<{ url: string; account: string }> {
  const t = COMPOSIO_TOOLS[kind];
  if (!t) throw new Error("This tool doesn't connect through Composio.");
  const auth_config_id = await authConfigFor(t, o);
  const d = await call<{ redirect_url?: string; connected_account_id?: string }>("/api/v3.1/connected_accounts/link", {
    ...o,
    method: "POST",
    body: JSON.stringify({ auth_config_id, user_id: ws, callback_url: callbackUrl }),
  }).catch((e: Error) => {
    // A config removed on Composio since it was found here: look it up again next time.
    configs.delete(t.toolkit);
    throw e;
  });
  if (!d.redirect_url || !d.connected_account_id) throw new Error("Composio didn't open a connect page.");
  return { url: d.redirect_url, account: d.connected_account_id };
}

export type ConnectedAccount = {
  id: string;
  status: string;
  status_reason?: string | null;
  user_id?: string;
  toolkit?: { slug?: string };
  is_disabled?: boolean;
  state?: { val?: Record<string, unknown> };
};

/**
 * The connected account once it's ACTIVE: right after the person comes back it can still be finishing, so it's
 * asked again a few times. Anything else (failed, expired, another workspace's or another tool's) is refused.
 */
export async function activeAccount(kind: string, ws: string, id: string, o: Net & { sleep?: (ms: number) => Promise<void>; tries?: number } = {}): Promise<ConnectedAccount> {
  const t = COMPOSIO_TOOLS[kind];
  if (!t || !/^[A-Za-z0-9_-]{4,100}$/.test(id)) throw new Error("Could not connect.");
  const sleep = o.sleep ?? ((ms: number) => sleepFor(ms));
  // The way back names the account in its query, which anyone can change: it counts only if it's this workspace's
  // own (its Composio user) for this tool.
  const mine = await call<{ items?: { id: string }[] }>(`/api/v3.1/connected_accounts?${new URLSearchParams({ user_ids: ws, toolkit_slugs: t.toolkit, limit: "200" })}`, o);
  if (!(mine.items ?? []).some((x) => x.id === id)) throw new Error("That connection isn't this workspace's.");
  for (let i = 0; ; i++) {
    const a = await call<ConnectedAccount>(`/api/v3.1/connected_accounts/${encodeURIComponent(id)}`, o);
    if (a.toolkit?.slug && a.toolkit.slug !== t.toolkit) throw new Error("That connection is for another tool.");
    if (a.user_id && a.user_id !== ws) throw new Error("That connection is for another workspace.");
    if (a.status === "ACTIVE" && !a.is_disabled) return a;
    if (!["INITIALIZING", "INITIATED"].includes(a.status) || i >= (o.tries ?? 5)) {
      throw new Error(a.status_reason ? `It didn't connect: ${a.status_reason}`.slice(0, 200) : "It didn't finish connecting. Try again.");
    }
    await sleep(1000);
  }
}

/** The saved sign-in for an ACTIVE account, with what its connector reads beyond the sign-in (composioExtras). */
export async function composioCreds(kind: string, ws: string, a: ConnectedAccount, o: Net = {}): Promise<Creds> {
  const t = COMPOSIO_TOOLS[kind]!;
  const net = composioFetch({ account: a.id, user: ws, fetcher: o.fetcher, env: o.env });
  const get = async <T>(url: string): Promise<T> => {
    const res = await net(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw Object.assign(new Error(`It answered ${res.status}.`), { status: res.status });
    return (await res.json()) as T;
  };
  // Only the connection's plain fields (subdomain, region and the like); a secret is never read or kept.
  const val: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(a.state?.val ?? {})) if (typeof v === "string" && !/key|token|secret|password|verifier|code/i.test(k)) val[k] = v;
  const extra = await composioExtras(kind, val, get);
  return { type: "composio", account: a.id, user: ws, toolkit: t.toolkit, extra };
}

/** Remove a connected account the workspace no longer uses (after a reconnect). Best effort. */
export async function dropAccount(id: string, o: Net = {}): Promise<void> {
  await call(`/api/v3.1/connected_accounts/${encodeURIComponent(id)}`, { ...o, method: "DELETE" }).catch(() => undefined);
}
