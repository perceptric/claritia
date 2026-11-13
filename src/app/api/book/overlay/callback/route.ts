import { appBase } from "@/lib/billing";
import { googleBusy, OVERLAY_DAYS, type Busy } from "@/lib/meetings/overlay";
import { originAllowed } from "../origin";
import { oauthExchange, readState } from "@/lib/sources/oauth";
import { overlayPage } from "../html";

// The guest's sign-in comes back here (docs/booking-page-plan.md, Part 6): the code becomes a token, the token reads
// the next weeks' busy times once, and both are dropped. The page that opened the window gets the times.

const DAY = 86_400_000;

async function busyFor(token: string, now: number): Promise<Busy[]> {
  const from = new Date(now).toISOString();
  const to = new Date(now + OVERLAY_DAYS * DAY).toISOString();
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ timeMin: from, timeMax: to, items: [{ id: "primary" }] }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`google ${res.status}`);
  return googleBusy(await res.json());
}

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const s = readState(sp.get("state"));
  if (!s || s.ws !== "guest" || s.kind !== "guest_google" || !(await originAllowed(s.user).catch(() => false))) return new Response("Not found.", { status: 404 });
  const code = sp.get("code");
  if (!code) return overlayPage(s.user, { error: sp.get("error") === "access_denied" ? "denied" : "failed" });
  try {
    const t = await oauthExchange(s.kind, code, `${appBase()}/api/book/overlay/callback`, s.verifier);
    const busy = await busyFor(t.access, Date.now());
    return overlayPage(s.user, { busy, provider: "google" });
  } catch {
    return overlayPage(s.user, { error: "failed" });
  }
}
