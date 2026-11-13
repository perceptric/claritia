import { appBase } from "@/lib/billing";
import { hostKind } from "@/lib/domains/hosts";
import { overlayOrigins } from "@/lib/meetings/overlay";
import { serviceClient } from "@/lib/serviceClient";

/**
 * Whether busy times may go back to a page on this origin: the app, the booking site, a workspace's subdomain of the
 * site (acme.tryclaritia.com) or a workspace's own active custom domain (book.acme.com, 118_link_domains.sql).
 */
export async function originAllowed(origin: string): Promise<boolean> {
  if (overlayOrigins(appBase()).includes(origin)) return true;
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.origin !== origin) return false;
  const site = process.env.SITE_HOST?.trim() || "tryclaritia.com";
  const k = hostKind(u.hostname, site, new URL(appBase()).hostname);
  if (k.kind === "sub") return true;
  if (k.kind !== "other") return false;
  const db = serviceClient();
  if (!db) return false;
  const { data } = await db.from("link_domains").select("status").eq("hostname", u.hostname).maybeSingle();
  return (data as { status?: string } | null)?.status === "active";
}
