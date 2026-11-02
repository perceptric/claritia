import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SITE_HOST } from "../site.ts";
import { nextState, pointsAt, systemResolver, type DomainState, type Resolver } from "./check.ts";
import { certReady, checkCert, linkTarget, type Fly } from "./fly.ts";
import { forgetDomain } from "./resolve.ts";

// A workspace's link domain on the server (docs/sharing-plan.md step 4): checking it, and the address its links use.

export type DomainRow = { workspace_id: string; hostname: string; status: DomainState; dns_ok: boolean; cert_ok: boolean; last_error: string | null; checked_at: string | null };

/** Check the DNS (and the certificate, when Fly is set up here) and save the new state. */
export async function checkDomain(db: SupabaseClient, row: DomainRow, o: { fly: Fly | null; resolver?: Resolver; target?: string }): Promise<DomainRow> {
  const target = o.target ?? linkTarget();
  const dnsOk = await pointsAt(row.hostname, target, o.resolver ?? systemResolver);
  let cert: boolean | null = null;
  let error: string | null = null;
  if (o.fly) {
    try {
      cert = certReady(await checkCert(o.fly, row.hostname));
    } catch (e) {
      error = `Certificate: ${(e as Error).message}`.slice(0, 300);
    }
  } else if (!row.cert_ok) error = "Certificates aren't set up on this server yet.";
  if (!dnsOk) error = `The CNAME for ${row.hostname} doesn't point at ${target} yet.`;
  const next = nextState({ status: row.status, certOk: row.cert_ok }, dnsOk, cert);
  const patch = { status: next.status, dns_ok: dnsOk, cert_ok: next.certOk, last_error: next.status === "active" ? null : error, checked_at: new Date().toISOString() };
  const { error: e } = await db.from("link_domains").update(patch).eq("workspace_id", row.workspace_id);
  if (e) throw new Error(e.message);
  forgetDomain(row.hostname);
  return { ...row, ...patch };
}

/** The address a workspace's links start with: its active custom domain, its subdomain when those are on, else none. */
export async function linkBase(db: SupabaseClient, ws: string): Promise<string | null> {
  const [d, w] = await Promise.all([db.from("link_domains").select("hostname, status").eq("workspace_id", ws).maybeSingle(), db.from("workspaces").select("booking_slug").eq("id", ws).maybeSingle()]);
  const dom = d.data as { hostname: string; status: string } | null;
  if (dom?.status === "active") return `https://${dom.hostname}`;
  const slug = (w.data as { booking_slug: string | null } | null)?.booking_slug;
  return process.env.LINK_SUBDOMAINS === "1" && slug ? `https://${slug}.${SITE_HOST}` : null;
}
