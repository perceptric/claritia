import { fontCss } from "@/lib/brand/book";
import type { FontFace } from "@/lib/brand/deep";
import { serviceClient } from "@/lib/serviceClient";

// A brand kit's own fonts as a stylesheet (docs/brand-capture.md): @font-face rules for the font files the site serves,
// for the heading and body fonts its brand book uses. Forms and booking pages load it like a Google Fonts link.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function GET(_: Request, { params }: { params: Promise<{ kit: string }> }) {
  const { kit } = await params;
  const id = kit.replace(/\.css$/, "");
  const headers = { "content-type": "text/css; charset=utf-8", "access-control-allow-origin": "*" };
  if (!UUID.test(id)) return new Response("", { status: 404, headers });
  const db = serviceClient();
  if (!db) return new Response("", { status: 503, headers });
  const { data } = await db.rpc("brand_kit_fonts", { p_kit: id });
  const d = data as { faces: FontFace[]; heading: string | null; body: string | null } | null;
  if (!d) return new Response("", { status: 404, headers });
  const css = fontCss(d.faces ?? [], [d.heading, d.body].filter((x): x is string => !!x));
  return new Response(css, { headers: { ...headers, "cache-control": "public, max-age=3600, s-maxage=86400" } });
}
