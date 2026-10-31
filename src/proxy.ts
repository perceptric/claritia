import { NextResponse, type NextRequest } from "next/server";

// One app on two domains: the marketing site on tryclaritia.com and the app on app.tryclaritia.com.
// Any other host (localhost, the onrender.com address) serves every page, so nothing changes there.

const SITE = process.env.SITE_HOST?.trim() || "tryclaritia.com";
const APP = process.env.APP_HOST?.trim() || "app.tryclaritia.com";
const MARKETING = new Set(["/"]);
// Booking pages answer on the site's short address too: tryclaritia.com/booking/<handle>.
const SHARED = (path: string) => path === "/booking" || path.startsWith("/booking/");

export function proxy(request: NextRequest) {
  const raw = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  const host = raw.split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
  const { pathname, search } = request.nextUrl;
  const go = (to: string, path: string) => NextResponse.redirect(`https://${to}${path}${search}`, 308);

  if (host === `www.${SITE}`) return go(SITE, pathname);
  if (host === SITE && !MARKETING.has(pathname) && !SHARED(pathname)) return go(APP, pathname);
  // The app opens on Forms. Temporary (307), so a browser never keeps the start page.
  if (host === APP && (pathname === "/" || pathname === "/start")) return NextResponse.redirect(`https://${APP}/forms${search}`, 307);
  return NextResponse.next();
}

// Next.js files, icons and the tracking path (/_clr) answer on any host.
export const config = {
  matcher: ["/((?!api/|_clr/|_next/|favicon\\.ico|icon|apple-icon|.*\\.[a-zA-Z0-9]+$).*)"],
};
