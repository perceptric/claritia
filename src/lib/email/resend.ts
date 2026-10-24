// Resend over plain fetch (docs/enrich-workflows-reports.md Part 0): sending, batches of up to 100, and sending
// domains. Needs RESEND_API_KEY; RESEND_REGION picks where new domains send from (default us-east-1).
//
// Every send carries an Idempotency-Key, and Resend answers a repeat of the same key with the first answer (for 24
// hours, check). So a single send that timed out or met a server error is safe to try again with the same key. A
// batch is keyed by its messages, which may not travel together again, so an unclear batch answer is never retried.

import { createHash } from "node:crypto";
import { SendError, type Outgoing } from "./provider.ts";

const API = "https://api.resend.com";

export type ResendRecord = { record: string; name: string; type: string; value: string; status: string; priority?: number; ttl?: string };
export type ResendDomain = { id: string; name: string; status: string; region?: string; records: ResendRecord[] };

export type Resend = ReturnType<typeof resendClient>;

export function resendFromEnv(env: NodeJS.ProcessEnv = process.env, fetchFn: typeof fetch = fetch): Resend | null {
  const key = env.RESEND_API_KEY?.trim();
  if (!key) return null;
  return resendClient({ apiKey: key, region: env.RESEND_REGION?.trim() || "us-east-1", fetchFn });
}

/** The Resend shape of one email. Header values and tag values are kept as given; tag names are ours. */
function body(m: Outgoing) {
  return {
    from: m.from,
    to: [m.to],
    ...(m.replyTo ? { reply_to: m.replyTo } : {}),
    subject: m.subject,
    html: m.html,
    text: m.text,
    ...(m.headers.length ? { headers: Object.fromEntries(m.headers.map((h) => [h.name, h.value])) } : {}),
    tags: Object.entries(m.tags).map(([name, value]) => ({ name, value })),
  };
}

export const batchKey = (keys: string[]) => `batch:${createHash("sha256").update(keys.join("\n")).digest("hex")}`;

export function resendClient(o: { apiKey: string; region?: string; fetchFn?: typeof fetch; timeoutMs?: number }) {
  const fetchFn = o.fetchFn ?? fetch;

  async function call<T>(method: string, path: string, payload?: unknown, idem?: string): Promise<T> {
    let res: Response;
    try {
      res = await fetchFn(`${API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${o.apiKey}`, "Content-Type": "application/json", ...(idem ? { "Idempotency-Key": idem.slice(0, 256) } : {}) },
        body: payload === undefined ? undefined : JSON.stringify(payload),
        signal: AbortSignal.timeout(o.timeoutMs ?? 15_000),
      });
    } catch (e) {
      throw new SendError(`Resend didn't answer: ${(e as Error).message}`, { unknown: true });
    }
    const text = await res.text().catch(() => "");
    if (res.ok) {
      try {
        return (text ? JSON.parse(text) : {}) as T;
      } catch {
        throw new SendError("Resend answered with something that isn't JSON", { unknown: true, status: res.status });
      }
    }
    let name = "";
    let message = text.slice(0, 300);
    try {
      const j = JSON.parse(text) as { name?: string; message?: string };
      name = j.name ?? "";
      message = j.message ?? message;
    } catch {
      // Not JSON; keep the text.
    }
    const after = Number(res.headers.get("retry-after"));
    const retryAfterS = Number.isFinite(after) && after > 0 ? Math.min(Math.ceil(after), 3600) : 60;
    const msg = `Resend ${res.status}${name ? ` ${name}` : ""}: ${message}`;
    // 429: a rate or quota limit; nothing was sent. 409: the same key is still being worked on (try later), or it was
    // used for different content (the first may have gone out).
    if (res.status === 429) throw new SendError(msg, { status: 429, code: name, later: true, retryAfterS });
    if (res.status === 409) throw new SendError(msg, { status: 409, code: name, ...(name === "concurrent_idempotent_requests" ? { later: true, retryAfterS: 5 } : { unknown: true }) });
    if (res.status >= 500) throw new SendError(msg, { status: res.status, code: name, retry: true, retryAfterS });
    throw new SendError(msg, { status: res.status, code: name, invalid: res.status === 422 || res.status === 400 });
  }

  const domainOf = (d: Partial<ResendDomain> & { id: string }): ResendDomain => ({ id: d.id, name: d.name ?? "", status: d.status ?? "not_started", region: d.region, records: Array.isArray(d.records) ? d.records : [] });

  return {
    region: o.region ?? "us-east-1",
    /** Send one email. `key` makes a repeat harmless. Returns Resend's id. */
    async send(m: Outgoing, key: string): Promise<string> {
      const r = await call<{ id?: string }>("POST", "/emails", body(m), key);
      if (!r.id) throw new SendError("Resend took the email but sent no id", { unknown: true });
      return r.id;
    },
    /** Send up to 100 in one call. All go or none do. Returns Resend's ids in the same order. */
    async batch(items: { out: Outgoing; key: string }[]): Promise<string[]> {
      if (!items.length) return [];
      if (items.length > 100) throw new SendError("A batch holds up to 100 emails", { invalid: true });
      const r = await call<{ data?: { id?: string }[] }>("POST", "/emails/batch", items.map((i) => body(i.out)), batchKey(items.map((i) => i.key)));
      const ids = (r.data ?? []).map((x) => x.id ?? "");
      if (ids.length !== items.length || ids.some((x) => !x)) throw new SendError("Resend took the batch but its ids don't match", { unknown: true });
      return ids;
    },
    async createDomain(name: string): Promise<ResendDomain> {
      return domainOf(await call<ResendDomain>("POST", "/domains", { name, region: o.region ?? "us-east-1" }));
    },
    /** The domain, or null when Resend doesn't have it (removed in Resend's dashboard). */
    async getDomain(id: string): Promise<ResendDomain | null> {
      try {
        return domainOf(await call<ResendDomain>("GET", `/domains/${encodeURIComponent(id)}`));
      } catch (e) {
        if (e instanceof SendError && e.status === 404) return null;
        throw e;
      }
    },
    /** Find a domain by name, for one created by a call whose answer was lost. */
    async findDomain(name: string): Promise<ResendDomain | null> {
      const r = await call<{ data?: ResendDomain[] }>("GET", "/domains");
      const hit = (r.data ?? []).find((d) => d.name?.toLowerCase() === name.toLowerCase());
      return hit ? ((await this.getDomain(hit.id)) ?? domainOf(hit)) : null;
    },
    /** Ask Resend to look at the DNS records now. */
    async verifyDomain(id: string): Promise<void> {
      await call("POST", `/domains/${encodeURIComponent(id)}/verify`);
    },
    async deleteDomain(id: string): Promise<void> {
      try {
        await call("DELETE", `/domains/${encodeURIComponent(id)}`);
      } catch (e) {
        if (!(e instanceof SendError && e.status === 404)) throw e;
      }
    },
  };
}
