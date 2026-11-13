import { appBase } from "@/lib/billing";
import { OVERLAY_KINDS } from "@/lib/meetings/overlay";
import { originAllowed } from "./origin";
import { oauthReady, oauthUrl } from "@/lib/sources/oauth";
import { overlayPage } from "./html";

// A guest's own calendar (docs/booking-page-plan.md, Part 5): GET ?p=google&o=<the page's origin> starts
// the sign-in in the small window the booking page opened. The origin rides in the signed state, and only Claritia's
// own booking addresses are accepted (./origin.ts), so the busy times only ever go back to a Claritia booking page.

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const kind = OVERLAY_KINDS[sp.get("p") as keyof typeof OVERLAY_KINDS];
  const origin = sp.get("o") ?? "";
  const ok = await originAllowed(origin).catch(() => false);
  if (!kind || !ok) return new Response("Not found.", { status: 404 });
  if (!oauthReady(kind)) return overlayPage(origin, { error: "off" });
  return Response.redirect(oauthUrl(kind, `${appBase()}/api/book/overlay/callback`, { ws: "guest", user: origin, kind }), 302);
}
