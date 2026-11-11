import "server-only";
import { cleanSvg, extractBrand } from "../brand/deep.ts";
import { svgDataUri } from "../brand/svgData.ts";
import { fetchHome, fetchText, quickFrom } from "../brand/fetchSite.ts";
import { stylesheets } from "../brand/quick.ts";
import { googleFontSheets, pageSource, type PageSource } from "../brand/sourceSkin.ts";
import { hostIsPrivate } from "../privateNet.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

// Reading a brand from its website for Form Studio (docs/forms-chat-plan.md, Part 4). `readSite` is the quick look the
// owner confirms: the site's name and its real logo, as a picture the page can show anywhere. `readSource` is what
// Claude reads into the brand's stylesheet once the owner has confirmed: the page and every stylesheet.

/**
 * preview: the home page as the owner knows it, its scripts taken out, for a frame that runs nothing (null when it's too
 * big or draws nothing without its scripts). shot: the site's share picture, shown when there's no preview.
 */
export type SiteLook = { url: string; site: string; name: string; logo: string | null; logoUrl: string | null; logoSvg: string | null; preview?: string | null; shot?: string | null };

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 ClaritiaBrand/1";
const MAX_LOGO = 1_500_000;

export const hostOf = (u: string) => {
  try {
    return new URL(/^https?:\/\//i.test(u.trim()) ? u.trim() : `https://${u.trim()}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};
const capital = (host: string) => {
  const l = host.split(".")[0] ?? "";
  return l.charAt(0).toUpperCase() + l.slice(1);
};

/** The site's name: its own name for itself, without the tagline after a separator. */
export function siteName(raw: string, host: string): string {
  const name = raw
    .split(/\s+[|–—·:-]\s+|\s*\|\s*/)[0]!
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&#x27;/g, "'")
    .trim();
  return name && name.length <= 40 && !/^(home|welcome|homepage)$/i.test(name) ? name : capital(host);
}

/**
 * A picture from the site, refusing private addresses and big files: its bytes and type (an SVG cleaned). Tried twice,
 * so one slow answer from the site's image host doesn't lose the logo.
 */
export async function pictureFile(url: string): Promise<{ type: string; bytes: Uint8Array } | null> {
  for (let i = 0; i < 2; i++) {
    try {
      const u = new URL(url);
      if (u.protocol !== "https:" || (await hostIsPrivate(u.hostname))) return null;
      const res = await fetch(u, { redirect: "follow", signal: AbortSignal.timeout(8000), headers: { "user-agent": UA, accept: "image/*" } });
      // A missing or refused picture won't come on a second try.
      if (res.status >= 400 && res.status < 500) return null;
      if (!res.ok) throw new Error(String(res.status));
      const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim();
      if (!/^image\/(png|jpeg|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon)$/.test(type)) return null;
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (!bytes.length || bytes.length > MAX_LOGO) return null;
      if (type === "image/svg+xml") {
        const svg = cleanSvg(new TextDecoder().decode(bytes));
        return svg ? { type, bytes: new TextEncoder().encode(svg) } : null;
      }
      return { type, bytes };
    } catch {
      if (i === 0) await new Promise((r) => setTimeout(r, 600));
    }
  }
  return null;
}

/** A picture from the site as a data address the studio can show. */
async function pictureData(url: string): Promise<string | null> {
  const f = await pictureFile(url);
  if (!f) return null;
  return f.type === "image/svg+xml" ? svgDataUri(new TextDecoder().decode(f.bytes)) : `data:${f.type};base64,${Buffer.from(f.bytes).toString("base64")}`;
}

/** The home page, tried as typed and with www., twice each with a short wait, so one slow answer isn't a failure. */
async function homeOf(host: string) {
  for (const h of [host, `www.${host}`]) {
    for (let i = 0; i < 2; i++) {
      const got = await fetchHome(`https://${h}`).catch(() => null);
      if (got) return got;
      if (i === 0) await new Promise((r) => setTimeout(r, 700));
    }
  }
  return null;
}

const MAX_PREVIEW = 1_500_000;

/**
 * The home page for a frame that runs nothing: scripts, frames, embeds and refreshes out, links opening outside,
 * relative addresses read from the site. Null when it's too big, or when it shows almost nothing without its scripts
 * (an app that draws itself in the browser).
 */
export function previewHtml(html: string, url: string): string | null {
  let out = html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script\b[^>]*\/?>/gi, "")
    .replace(/<(iframe|object|embed|frameset|frame|portal)\b[\s\S]*?(<\/\1\s*>|\/?>)/gi, "")
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?(refresh|content-security-policy)[^>]*>/gi, "")
    .replace(/<base\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src|action)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
  const text = out.replace(/<(style|noscript|svg)\b[\s\S]*?<\/\1>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (text.length < 80) return null;
  // Framer and Webflow hide parts until their scripts fade them in: shown here as they end up.
  const head = `<base href="${url.replace(/"/g, "%22")}" target="_blank"><meta name="referrer" content="no-referrer"><style>html,body{overflow:hidden!important}*{animation-play-state:paused!important}[data-framer-appear-id],[data-w-id],[style*="opacity:0"],[style*="opacity: 0"]{opacity:1!important;transform:none!important}</style>`;
  out = /<head\b[^>]*>/i.test(out) ? out.replace(/<head\b[^>]*>/i, (m) => m + head) : head + out;
  return out.length > MAX_PREVIEW ? null : out;
}

/** The quick look: the site's name and real logo (its inline SVG, its logo picture, else its touch icon). */
export async function readSite(raw: string): Promise<SiteLook | { error: string }> {
  const host = hostOf(raw);
  if (!host || !host.includes(".")) return { error: "Enter the site's address, like acme.com." };
  if (await hostIsPrivate(host)) return { error: "That address is on a private network." };
  const home = await homeOf(host);
  if (!home) return { error: `Couldn't open ${host}. Check the address and try again.` };
  const brand = extractBrand(home.pages, home.sheets);
  const quick = quickFrom(home);
  const site = hostOf(home.pages[0]!.url) || host;
  // Named for the address the owner typed (a site that moved keeps the name they know), unless the site names itself.
  const name = siteName(brand.site.name || "", host);
  const svg = brand.logo.svg ? cleanSvg(brand.logo.svg) : null;
  let logo: string | null = svg ? svgDataUri(svg) : null;
  let logoUrl: string | null = null;
  // The logo, else the site's app icon; then the icons most sites keep at their usual addresses.
  const origin = new URL(home.pages[0]!.url).origin;
  for (const u of [brand.logo.src, quick.logo, brand.icons.touch, brand.icons.favicon, `${origin}/apple-touch-icon.png`, `${origin}/favicon.svg`]) {
    if (logo) break;
    if (!u) continue;
    logo = await pictureData(u);
    if (logo) logoUrl = u;
  }
  const shot = brand.icons.share && /^https:\/\//.test(brand.icons.share) ? brand.icons.share : null;
  return { url: home.pages[0]!.url, site, name, logo, logoUrl, logoSvg: svg, preview: previewHtml(home.pages[0]!.html, home.pages[0]!.url), shot };
}

/** The page source Claude reads: the page, its stylesheets and Google Fonts, and the fonts they load. */
export async function readSource(url: string): Promise<PageSource | null> {
  const page = await fetchText(/^https?:\/\//i.test(url) ? url : `https://${url}`, "text/html", 3_000_000, 10_000);
  if (!page || !/<html|<body|<head/i.test(page.text)) return null;
  const links = [...stylesheets(page.text, page.url, 10), ...googleFontSheets(page.text, page.url)];
  const sheets = (await Promise.all(links.map(async (u) => fetchText(u, "text/css,*/*;q=0.1", 2_000_000, 8000)))).filter((x): x is { url: string; text: string } => !!x && !/<html/i.test(x.text.slice(0, 200)));
  return pageSource(page.url, page.text, sheets);
}

const EXT: Record<string, string> = { "image/svg+xml": "svg", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/x-icon": "ico", "image/vnd.microsoft.icon": "ico" };

/**
 * Keep a copy of a confirmed brand's logo in Claritia's public assets, and answer its address: the drawing (cleaned
 * again here, since it came from the browser) or the picture read from the site. Null when there's neither.
 */
export async function hostLogo(db: SupabaseClient, ws: string, kit: string, url: string | null, svg: string | null): Promise<string | null> {
  const clean = svg ? cleanSvg(svg) : null;
  const file = clean ? { type: "image/svg+xml", bytes: new TextEncoder().encode(clean) } : url ? await pictureFile(url) : null;
  if (!file) return null;
  const path = `${ws}/brand/${kit}-${Date.now().toString(36)}.${EXT[file.type] ?? "png"}`;
  const up = await db.storage.from("assets").upload(path, file.bytes, { contentType: file.type, cacheControl: "31536000", upsert: true });
  if (up.error) return null;
  return db.storage.from("assets").getPublicUrl(path).data.publicUrl || null;
}
