import { NextResponse, type NextRequest } from "next/server";
import { appShellPath } from "./lib/appPaths";
import { hostKind, linkPath, plainHost } from "./lib/domains/hosts";
import { domainSlug } from "./lib/domains/resolve";

// One app on two domains: the marketing site on tryclaritia.com and the app on app.tryclaritia.com. A workspace's own
// link hosts (docs/sharing-plan.md step 4), its subdomain acme.tryclaritia.com (with LINK_SUBDOMAINS=1, once the
// wildcard DNS and certificate are set up) and an active custom domain, answer with its links only, never the app
// (src/lib/domains/hosts.ts). Any other host (localhost, the onrender.com address) serves every page, as before.

const SITE = process.env.SITE_HOST?.trim() || "tryclaritia.com";
const APP = process.env.APP_HOST?.trim() || "app.tryclaritia.com";
const MARKETING = new Set(["/", "/developers/embed"]);
// Booking pages answer on the site's short address: tryclaritia.com/booking/<handle> and tryclaritia.com/book/....
const SHARED = (path: string) => path === "/booking" || path.startsWith("/booking/") || path.startsWith("/book/");

const SUBS = process.env.LINK_SUBDOMAINS === "1";

/** A workspace's link host: its links, or "not found". */
function onLinkHost(request: NextRequest, slug: string) {
  const { pathname, search } = request.nextUrl;
  const to = linkPath(slug, pathname);
  if (!to) return new NextResponse("<!doctype html><title>Not found</title><p style=\"font:16px system-ui;text-align:center;padding:64px\">Page not found.</p>", { status: 404, headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" } });
  // The pages behind it know they're on a link host (a moved form ending redirects on the same host).
  const headers = new Headers(request.headers);
  headers.set("x-claritia-link-host", "1");
  headers.set("x-claritia-link-url", `${request.nextUrl.origin}${pathname}`);
  return NextResponse.rewrite(new URL(`${to}${search}`, request.url), { request: { headers } });
}

export async function proxy(request: NextRequest) {
  const raw = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  const host = raw.split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
  const { pathname, search } = request.nextUrl;
  const go = (to: string, path: string) => NextResponse.redirect(`https://${to}${path}${search}`, 308);

  const kind = hostKind(host, SITE, APP);
  if (kind.kind === "sub" && SUBS) return onLinkHost(request, kind.slug);
  if (kind.kind === "other" && !plainHost(host)) {
    const slug = await domainSlug(host);
    if (slug) return onLinkHost(request, slug);
  }
  if (host === `www.${SITE}`) return go(SITE, pathname);
  if (host === SITE && !MARKETING.has(pathname) && !SHARED(pathname)) return go(APP, pathname);
  // The app opens on Forms. Temporary (307), so a browser never keeps the start page.
  if (host === APP && (pathname === "/" || pathname === "/start")) return NextResponse.redirect(`https://${APP}/forms${search}`, 307);
  // A form's own page (/forms/<id>) would be caught by the form script's route: show the app there instead.
  const shell = appShellPath(pathname);
  if (shell) return NextResponse.rewrite(new URL(`${shell}${search}`, request.url));
  return NextResponse.next();
}

// Next.js files and icons answer on any host.
export const config = {
  matcher: ["/((?!api/|_next/|favicon\\.ico|icon|apple-icon|.*\\.[a-zA-Z0-9]+$).*)"],
};
