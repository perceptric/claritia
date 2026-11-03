import "server-only";
import { serviceClient } from "../serviceClient.ts";

// Which workspace a custom link domain is, for the proxy (src/proxy.ts): looked up once a minute per host. A failed
// lookup is never kept, so a database hiccup can't hide a working domain for a minute.

export const DOMAIN_TTL_MS = 60_000;
type Lookup = (host: string) => Promise<{ slug: string | null } | { error: true }>;
const cache = new Map<string, { slug: string | null; at: number }>();

const lookup: Lookup = async (host) => {
  const db = serviceClient();
  if (!db) return { error: true };
  const { data, error } = await db.rpc("link_domain_host", { p_host: host });
  if (error) return { error: true };
  return { slug: typeof data === "string" && data ? data : null };
};

export async function domainSlug(host: string, o: { now?: number; look?: Lookup } = {}): Promise<string | null> {
  const now = o.now ?? Date.now();
  const hit = cache.get(host);
  if (hit && now - hit.at < DOMAIN_TTL_MS) return hit.slug;
  const r = await (o.look ?? lookup)(host).catch(() => ({ error: true as const }));
  if ("error" in r) return null;
  if (cache.size > 10_000) cache.clear();
  cache.set(host, { slug: r.slug, at: now });
  return r.slug;
}

/** A domain added, checked or removed on this server shows its new state at once. */
export const forgetDomain = (host: string) => void cache.delete(host.toLowerCase());
