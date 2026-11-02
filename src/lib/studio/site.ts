import "server-only";
import { cleanSvg, extractBrand } from "../brand/deep.ts";
import { fetchHome, fetchText, quickFrom } from "../brand/fetchSite.ts";
import { stylesheets } from "../brand/quick.ts";
import { googleFontSheets, pageSource, type PageSource } from "../brand/sourceSkin.ts";
import { hostIsPrivate } from "../privateNet.ts";

// Reading a brand from its website for Form Studio (docs/forms-chat-plan.md, Part 4). `readSite` is the quick look the
// owner confirms: the site's name and its real logo, as a picture the page can show anywhere. `readSource` is what
// Claude reads into the brand's stylesheet once the owner has confirmed: the page and every stylesheet.

export type SiteLook = { url: string; site: string; name: string; logo: string | null; logoUrl: string | null; logoSvg: string | null };

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

/** A picture from the site as a data address the studio can show, refusing private addresses and big files. */
async function pictureData(url: string): Promise<string | null> {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || (await hostIsPrivate(u.hostname))) return null;
    const res = await fetch(u, { redirect: "follow", signal: AbortSignal.timeout(8000), headers: { "user-agent": UA, accept: "image/*" } });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim();
    if (!/^image\/(png|jpeg|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon)$/.test(type)) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_LOGO) return null;
    if (type === "image/svg+xml") {
      const svg = cleanSvg(new TextDecoder().decode(bytes));
      return svg ? `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` : null;
    }
    return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return null;
  }
}

/** The quick look: the site's name and real logo (its inline SVG, its logo picture, else its touch icon). */
export async function readSite(raw: string): Promise<SiteLook | { error: string }> {
  const host = hostOf(raw);
  if (!host || !host.includes(".")) return { error: "Enter the site's address, like acme.com." };
  if (await hostIsPrivate(host)) return { error: "That address is on a private network." };
  const home = await fetchHome(`https://${host}`).catch(() => null);
  if (!home) return { error: `Couldn't open ${host}. Check the address and try again.` };
  const brand = extractBrand(home.pages, home.sheets);
  const quick = quickFrom(home);
  const site = hostOf(home.pages[0]!.url) || host;
  // Named for the address the owner typed (a site that moved keeps the name they know), unless the site names itself.
  const name = siteName(brand.site.name || "", host);
  const svg = brand.logo.svg ? cleanSvg(brand.logo.svg) : null;
  let logo: string | null = svg ? `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` : null;
  let logoUrl: string | null = null;
  for (const u of [brand.logo.src, quick.logo, brand.icons.touch, brand.icons.favicon]) {
    if (logo) break;
    if (!u) continue;
    logo = await pictureData(u);
    if (logo) logoUrl = u;
  }
  return { url: home.pages[0]!.url, site, name, logo, logoUrl, logoSvg: svg };
}

/** The page source Claude reads: the page, its stylesheets and Google Fonts, and the fonts they load. */
export async function readSource(url: string): Promise<PageSource | null> {
  const page = await fetchText(/^https?:\/\//i.test(url) ? url : `https://${url}`, "text/html", 3_000_000, 10_000);
  if (!page || !/<html|<body|<head/i.test(page.text)) return null;
  const links = [...stylesheets(page.text, page.url, 10), ...googleFontSheets(page.text, page.url)];
  const sheets = (await Promise.all(links.map(async (u) => fetchText(u, "text/css,*/*;q=0.1", 2_000_000, 8000)))).filter((x): x is { url: string; text: string } => !!x && !/<html/i.test(x.text.slice(0, 200)));
  return pageSource(page.url, page.text, sheets);
}
