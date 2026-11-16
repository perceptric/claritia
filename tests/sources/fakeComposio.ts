// A Composio that answers like the real one for the calls Claritia makes (docs.composio.dev API reference, v3.1):
// proxy execute (signs the request with the connected account's token and forwards it to the tool's own fake),
// auth configs, connect links and connected accounts. It checks the server key, records each proxy request as it
// arrived, and can be told to fail the next proxy calls: a timeout before or after the tool got the request, its own
// 429 or 5xx, or a connection that expired.

export type Fault = "timeout-before" | "timeout-after" | { status: number; slug?: string; message?: string; retryAfter?: string };
export type Account = { id: string; toolkit: string; user: string; status: string; authConfig: string; token: string; val?: Record<string, unknown>; tool?: typeof fetch };
type Proxied = { endpoint: string; method: string; body?: unknown; binary_body?: { base64: string; content_type?: string }; parameters?: { name: string; value: string; type: string }[]; connected_account_id: string; user_id?: string };

export const KEY = "ck_test_key";
export const BASE = "https://composio.test";

const json = (status: number, data: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });
const error = (status: number, message: string, slug = "Error", headers: Record<string, string> = {}) => json(status, { error: { message, code: status, slug, status } }, headers);

export class FakeComposio {
  accounts = new Map<string, Account>();
  configs: { id: string; toolkit: { slug: string }; auth_scheme: string; is_composio_managed: boolean; status: string }[] = [];
  /** Proxy requests as they arrived (the body Claritia sent), and the headers of each. */
  proxied: { body: Proxied; headers: Headers }[] = [];
  /** Every request, as "METHOD path". */
  log: string[] = [];
  /** What the next proxy calls do, in order; empty: forward. With `faultOn`, only calls to a matching address take one. */
  faults: Fault[] = [];
  faultOn: RegExp | null = null;
  made: { toolkit: unknown; auth_config: unknown }[] = [];
  links: Record<string, unknown>[] = [];
  deleted: string[] = [];
  private seq = 1;
  /** The answer for a file the tool sent back, by its address at Composio. */
  files = new Map<string, Uint8Array>();

  add(a: Omit<Account, "authConfig" | "status"> & { status?: string; authConfig?: string }): Account {
    const full = { status: "ACTIVE", authConfig: "ac_1", ...a };
    this.accounts.set(a.id, full);
    return full;
  }

  fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    this.log.push(`${method} ${url.pathname}`);
    if (url.origin !== BASE) {
      const f = this.files.get(url.toString());
      return f ? new Response(Buffer.from(f), { status: 200 }) : new Response("gone", { status: 404 });
    }
    const headers = new Headers(init?.headers);
    if (headers.get("x-api-key") !== KEY) return error(401, "Invalid API key", "Auth_InvalidApiKey");
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const p = url.pathname;

    if (p === "/api/v3.1/tools/execute/proxy" && method === "POST") return this.proxy(body as Proxied, headers, init?.signal ?? undefined);
    if (p === "/api/v3.1/auth_configs" && method === "GET") {
      const slug = url.searchParams.get("toolkit_slug");
      return json(200, { items: this.configs.filter((c) => !slug || c.toolkit.slug === slug) });
    }
    if (p === "/api/v3.1/auth_configs" && method === "POST") {
      this.made.push(body);
      const id = `ac_new${this.seq++}`;
      const managed = (body.auth_config as { type: string }).type === "use_composio_managed_auth";
      this.configs.push({ id, toolkit: body.toolkit, auth_scheme: managed ? "OAUTH2" : (body.auth_config as { authScheme: string }).authScheme, is_composio_managed: managed, status: "ENABLED" });
      return json(201, { toolkit: body.toolkit, auth_config: { id, auth_scheme: "OAUTH2", is_composio_managed: managed } });
    }
    if (p === "/api/v3.1/connected_accounts/link" && method === "POST") {
      this.links.push(body);
      const cfg = this.configs.find((c) => c.id === body.auth_config_id);
      const id = `ca_${this.seq++}`;
      this.add({ id, toolkit: cfg?.toolkit.slug ?? "?", user: body.user_id, token: "t", status: "INITIATED", authConfig: body.auth_config_id });
      return json(201, { link_token: "lt", redirect_url: `https://connect.composio.test/link/lt_${id}`, expires_at: new Date(Date.now() + 600_000).toISOString(), connected_account_id: id });
    }
    if (p === "/api/v3.1/connected_accounts" && method === "GET") {
      const users = url.searchParams.get("user_ids")?.split(",") ?? null;
      const kits = url.searchParams.get("toolkit_slugs")?.split(",") ?? null;
      const items = [...this.accounts.values()].filter((a) => (!users || users.includes(a.user)) && (!kits || kits.includes(a.toolkit)));
      return json(200, { items: items.map((a) => this.view(a)), next_cursor: null });
    }
    const one = /^\/api\/v3\.1\/connected_accounts\/([^/]+)$/.exec(p);
    if (one) {
      const a = this.accounts.get(decodeURIComponent(one[1]!));
      if (!a) return error(404, "Connected account not found", "ConnectedAccount_NotFound");
      if (method === "DELETE") {
        this.accounts.delete(a.id);
        this.deleted.push(a.id);
        return json(200, { success: true });
      }
      const v = this.view(a);
      // Right after the connect page, an account can still be finishing.
      if (a.status === "INITIATED") a.status = "ACTIVE";
      return json(200, v);
    }
    return error(404, `No route ${method} ${p}`);
  };

  private view(a: Account) {
    // The real one masks secrets; this one keeps the token out of every answer.
    return { id: a.id, toolkit: { slug: a.toolkit }, auth_config: { id: a.authConfig, auth_scheme: "OAUTH2", is_composio_managed: true, is_disabled: false }, status: a.status, status_reason: null, is_disabled: false, state: { authScheme: "OAUTH2", val: { status: a.status, ...(a.val ?? {}) } } };
  }

  private async proxy(b: Proxied, headers: Headers, signal?: AbortSignal): Promise<Response> {
    this.proxied.push({ body: b, headers });
    const fault = !this.faultOn || this.faultOn.test(b.endpoint) ? this.faults.shift() : undefined;
    const timeout = () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    };
    if (fault === "timeout-before") timeout();
    if (fault && typeof fault === "object") return error(fault.status, fault.message ?? `Fault ${fault.status}`, fault.slug, fault.retryAfter ? { "retry-after": fault.retryAfter } : {});
    const a = this.accounts.get(b.connected_account_id);
    if (!a) return error(404, "Connected account not found", "ConnectedAccount_NotFound");
    if (a.status !== "ACTIVE") return error(400, `Connected account is ${a.status}`, "ConnectedAccount_Expired");
    if (b.user_id && b.user_id !== a.user) return error(403, "This user can't use this connected account", "ConnectedAccount_Forbidden");
    // Composio signs the call with the account's own token; anything Claritia sent as authorization never arrives.
    const h = new Headers();
    for (const prm of b.parameters ?? []) if (prm.type === "header") h.set(prm.name, prm.value);
    h.set("authorization", `Bearer ${a.token}`);
    let body: BodyInit | undefined;
    if (b.binary_body) {
      body = Buffer.from(b.binary_body.base64, "base64");
      if (b.binary_body.content_type) h.set("content-type", b.binary_body.content_type);
    } else if (b.body !== undefined && b.body !== null) {
      body = JSON.stringify(b.body);
      h.set("content-type", "application/json");
    }
    const res = await a.tool!(b.endpoint, { method: b.method, headers: h, body, signal });
    if (fault === "timeout-after") timeout();
    const type = res.headers.get("content-type") ?? "";
    const out: Record<string, string> = {};
    res.headers.forEach((v, k) => (out[k] = v));
    if (/octet-stream|pdf|image\//.test(type)) {
      const at = `https://files.composio.test/${this.seq++}`;
      this.files.set(at, new Uint8Array(await res.arrayBuffer()));
      return json(200, { data: null, status: res.status, headers: out, binary_data: { url: at, content_type: type, size: this.files.get(at)!.length } });
    }
    const text = await res.text();
    let data: unknown = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return json(200, { data, status: res.status, headers: out });
  }
}
