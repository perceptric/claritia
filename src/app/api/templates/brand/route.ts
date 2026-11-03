import { extractBrand } from "@/lib/brand/deep";
import { fetchHome } from "@/lib/brand/fetchSite";
import { peekFrom } from "@/lib/forms/gallery/peek";
import { hostIsPrivate } from "@/lib/privateNet";
import { hostOf, siteName } from "@/lib/studio/site";

// See it in your brand on tryclaritia.com/templates (docs/form-templates-plan.md 5.3): GET ?site=acme.com answers the
// site's button color, font, corners and logo, read from its home page with no AI. Open to the website only, five
// reads a visitor a day and 2,000 a day in all, counted on this server. Private addresses are refused.

const ORIGINS = new Set(["https://tryclaritia.com", "https://www.tryclaritia.com"]);
const PER_VISITOR = 5;
const PER_DAY = 2000;
const seen = new Map<string, number>();
let day = "";
let total = 0;

function cors(request: Request): Record<string, string> {
  const o = request.headers.get("origin") ?? "";
  return ORIGINS.has(o) || /^http:\/\/localhost(:\d+)?$/.test(o) ? { "Access-Control-Allow-Origin": o, Vary: "Origin" } : {};
}
const json = (request: Request, body: unknown, status = 200) => Response.json(body, { status, headers: { ...cors(request), "Cache-Control": "no-store" } });

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: { ...cors(request), "Access-Control-Allow-Methods": "GET", "Access-Control-Max-Age": "86400" } });
}

export async function GET(request: Request) {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    total = 0;
    seen.clear();
  }
  const who = (request.headers.get("fly-client-ip") ?? request.headers.get("x-forwarded-for") ?? "").split(",")[0]!.trim() || "unknown";
  const n = seen.get(who) ?? 0;
  if (n >= PER_VISITOR || total >= PER_DAY) return json(request, { error: "Try again tomorrow." }, 429);
  const host = hostOf(new URL(request.url).searchParams.get("site") ?? "");
  if (!host || !host.includes(".")) return json(request, { error: "Enter your site's address, like acme.com." }, 400);
  if (await hostIsPrivate(host)) return json(request, { error: "That address is on a private network." }, 400);
  seen.set(who, n + 1);
  total++;
  const home = await fetchHome(`https://${host}`).catch(() => null);
  if (!home) return json(request, { error: `Couldn't open ${host}.` }, 404);
  const raw = extractBrand(home.pages, home.sheets);
  return json(request, peekFrom(raw, siteName(raw.site.name || "", host)));
}
