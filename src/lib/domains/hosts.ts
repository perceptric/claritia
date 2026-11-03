// Link hosts (docs/sharing-plan.md step 4): a workspace's subdomain (acme.tryclaritia.com) and its custom domain
// (forms.acme.com). On them only the workspace's links answer, never the app:
//   /                 the team's booking page             (/book/<workspace>)
//   /book, /book/<t>  a meeting type's page               (/book/<workspace>/<t>)
//   /book/l|m|p/<tok> single-use, manage and poll links   (as they are)
//   /<ending>         a form by its link ending           (/f/<workspace>/<ending>)
// Anything else is "not found". Assets, the forms script and the public APIs pass through (src/proxy.ts's matcher
// leaves them out). Runs in the proxy and in tests.

/** First labels of the site's own subdomains, never a workspace's. */
export const RESERVED_SUB = new Set(["app", "www", "api", "admin", "mail", "email", "t", "bounce", "inbox", "forms", "book", "booking", "docs", "help", "status", "cdn", "static", "assets", "dev", "staging"]);

const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const ENDING = /^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$/;
const TYPE = /^[a-z0-9][a-z0-9-]{0,59}$/;
const TOKEN = /^\/book\/[lmp]\/[A-Za-z0-9_-]{20,64}\/?$/;

export type HostKind = { kind: "site" } | { kind: "sub"; slug: string } | { kind: "other" };

/**
 * What a host is: the site or the app (served as before), a workspace subdomain of the site, or another host (a
 * custom domain, localhost, a hosting address: looked up, else served as before).
 */
export function hostKind(host: string, site: string, app: string): HostKind {
  const h = host.toLowerCase();
  if (h === site || h === app || h === `www.${site}`) return { kind: "site" };
  if (h.endsWith(`.${site}`)) {
    const sub = h.slice(0, -site.length - 1);
    if (!sub.includes(".") && SLUG.test(sub) && !RESERVED_SUB.has(sub)) return { kind: "sub", slug: sub };
    return { kind: "site" };
  }
  return { kind: "other" };
}

/** Hosts never looked up as custom domains: local, hosting addresses and plain addresses. */
export const plainHost = (host: string) => host === "localhost" || /\.(localhost|local|internal|fly\.dev|onrender\.com|vercel\.app)$/.test(host) || /^[\d.]+$/.test(host) || host.includes(":") || !host.includes(".");

/** The page a path opens on a workspace's link host, or null for "not found". */
export function linkPath(slug: string, pathname: string): string | null {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p === "/" || p === "/book") return `/book/${slug}`;
  if (TOKEN.test(pathname)) return p;
  const parts = p.slice(1).split("/");
  if (parts[0] === "book" && parts.length === 2 && TYPE.test(parts[1]!)) return `/book/${slug}/${parts[1]}`;
  if (parts.length === 1 && ENDING.test(parts[0]!) && parts[0] !== "book" && parts[0] !== "booking") return `/f/${slug}/${parts[0]}`;
  return null;
}
