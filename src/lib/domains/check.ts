// Checking a custom link domain (docs/sharing-plan.md step 4): does its DNS point at Claritia, and what its state
// becomes. Runs on the server and in the worker; the resolver can be swapped for tests.

import dns from "node:dns/promises";

export type Resolver = { cname: (h: string) => Promise<string[]>; a: (h: string) => Promise<string[]> };
export const systemResolver: Resolver = { cname: (h) => dns.resolveCname(h), a: (h) => dns.resolve4(h) };

export type DomainState = "pending" | "active" | "failed";

const quiet = <T>(p: Promise<T[]>) => p.catch(() => [] as T[]);
const bare = (h: string) => h.toLowerCase().replace(/\.$/, "");

/**
 * Whether `host` points at `target`: a CNAME to it (directly, or through one more name), or the same IPv4 address
 * (a provider that flattens CNAMEs). Any DNS error is "not yet", never a throw.
 */
export async function pointsAt(host: string, target: string, r: Resolver = systemResolver): Promise<boolean> {
  const t = bare(target);
  const first = (await quiet(r.cname(host))).map(bare);
  if (first.includes(t)) return true;
  for (const next of first.slice(0, 2)) if ((await quiet(r.cname(next))).map(bare).includes(t)) return true;
  const [mine, theirs] = await Promise.all([quiet(r.a(host)), quiet(r.a(t))]);
  return mine.length > 0 && mine.some((ip) => theirs.includes(ip));
}

/**
 * The next state from a check. It serves only with both the DNS and the certificate; a domain that served and whose
 * DNS now points elsewhere stops ('failed') until it points back. `cert` is null when the certificate wasn't asked
 * (the worker's re-check): the last answer stands.
 */
export function nextState(o: { status: DomainState; certOk: boolean }, dnsOk: boolean, cert: boolean | null): { status: DomainState; certOk: boolean } {
  const certOk = cert ?? o.certOk;
  if (dnsOk && certOk) return { status: "active", certOk };
  if (o.status === "active" || o.status === "failed") return { status: dnsOk ? o.status : "failed", certOk };
  return { status: "pending", certOk };
}
