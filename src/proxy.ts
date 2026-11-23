import { NextResponse, type NextRequest } from "next/server";

// The app answers on app.tryclaritia.com, where / goes to the app. If tryclaritia.com ever points here again, it
// serves only the homepage. Any other host (localhost, claritia-web.fly.dev) serves every page.

const SITE = process.env.SITE_HOST?.trim() || "tryclaritia.com";
const APP = process.env.APP_HOST?.trim() || "app.tryclaritia.com";
const MARKETING = new Set(["/"]);

export function proxy(request: NextRequest) {
  const raw = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  const host = raw.split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
  const { pathname, search } = request.nextUrl;
  const go = (to: string, path: string) => NextResponse.redirect(`https://${to}${path}${search}`, 308);

  if (host === `www.${SITE}`) return go(SITE, pathname);
  if (host === SITE && !MARKETING.has(pathname)) return go(APP, pathname);
  if (host === APP && (pathname === "/" || pathname === "/start")) return go(APP, "/tests");
  return NextResponse.next();
}

// Next.js files, icons and the tracking path (/_clr) answer on any host.
export const config = {
  matcher: ["/((?!api/|_clr/|_next/|favicon\\.ico|icon|apple-icon|.*\\.[a-zA-Z0-9]+$).*)"],
};
