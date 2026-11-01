import { readSkin } from "@/lib/brand/skin";
import { hostIsPrivate } from "@/lib/privateNet";
import { serviceClient } from "@/lib/serviceClient";

// A brand skin's font file, served from Claritia (docs/brand-skin.md). Most sites don't let other sites load their
// fonts, so the form loads the copy here. Only files the kit's skin lists are served: this is never an open proxy.

const MB = 1024 * 1024;
const TYPES: Record<string, string> = { woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", otf: "font/otf" };

export async function GET(_request: Request, { params }: { params: Promise<{ kit: string; i: string }> }) {
  const { kit, i } = await params;
  const n = Number(i);
  if (!/^[0-9a-f-]{36}$/.test(kit) || !Number.isInteger(n) || n < 0 || n > 11) return new Response("Not found.", { status: 404 });
  const db = serviceClient();
  if (!db) return new Response("Not set up.", { status: 503 });
  const { data } = await db.from("brand_kits").select("skin").eq("id", kit).maybeSingle();
  const face = readSkin((data as { skin?: unknown } | null)?.skin)?.faces[n];
  if (!face) return new Response("Not found.", { status: 404 });
  const u = new URL(face.src);
  if (u.protocol !== "https:" || (await hostIsPrivate(u.hostname))) return new Response("Not found.", { status: 404 });
  const res = await fetch(u, { redirect: "follow", signal: AbortSignal.timeout(10_000), headers: { "user-agent": "Mozilla/5.0 ClaritiaBrand/1", referer: `${u.origin}/` } }).catch(() => null);
  if (!res?.ok) return new Response("Not found.", { status: 404 });
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > 3 * MB) return new Response("Too big.", { status: 413 });
  const ext = /\.(woff2|woff|ttf|otf)(\?|$)/i.exec(u.pathname)?.[1]?.toLowerCase() ?? "woff2";
  return new Response(bytes as BodyInit, {
    headers: { "content-type": TYPES[ext] ?? "font/woff2", "access-control-allow-origin": "*", "cache-control": "public, max-age=604800, immutable" },
  });
}
