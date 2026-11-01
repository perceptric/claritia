import "server-only";
import { hostIsPrivate } from "../privateNet.ts";
import { pickPages, readPage } from "../forms/aiBuild.ts";
import type { Page, Sheet } from "./deep.ts";
import { readBrand, stylesheets, type QuickBrand } from "./quick.ts";

// Fetching a customer's site from the web server (docs/brand-capture.md): private addresses refused at every
// redirect, a size and time limit on every file, a browser's user agent so builder-made sites answer with their page.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 ClaritiaBrand/1";

/** One file, refusing private addresses at every redirect. */
export async function fetchText(url: string, accept: string, maxBytes: number, ms: number): Promise<{ url: string; text: string } | null> {
  let at = url;
  for (let hop = 0; hop < 4; hop++) {
    let u: URL;
    try {
      u = new URL(at);
    } catch {
      return null;
    }
    if ((u.protocol !== "https:" && u.protocol !== "http:") || u.username) return null;
    if (await hostIsPrivate(u.hostname)) return null;
    const res = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(ms), headers: { "user-agent": UA, accept } }).catch(() => null);
    if (!res) return null;
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      at = new URL(res.headers.get("location")!, u).href;
      continue;
    }
    if (!res.ok) return null;
    return { url: u.href, text: (await res.text().catch(() => "")).slice(0, maxBytes) };
  }
  return null;
}

export type Fetched = { pages: Page[]; sheets: Sheet[] };

/** The home page and its stylesheets. */
export async function fetchHome(raw: string): Promise<Fetched | null> {
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const page = await fetchText(url, "text/html", 3_000_000, 8000);
  if (!page || !/<html|<body|<head/i.test(page.text)) return null;
  const sheets = await Promise.all(stylesheets(page.text, page.url).map((s) => fetchText(s, "text/css", 2_000_000, 5000)));
  return { pages: [{ url: page.url, html: page.text }], sheets: sheets.filter((x): x is { url: string; text: string } => !!x) };
}

/** The site's look from the home page alone, in seconds. */
export const quickFrom = (f: Fetched): QuickBrand => readBrand(f.pages[0]!.html, f.sheets.map((s) => s.text), f.pages[0]!.url);

/** Up to four more pages (pricing, services, product, about) and the stylesheets they add, at most ten in all. */
export async function fetchMore(f: Fetched): Promise<Fetched> {
  const home = f.pages[0]!;
  const more = (await Promise.all(pickPages(readPage(home.html, home.url).links).map((u) => fetchText(u, "text/html", 2_000_000, 8000)))).filter((x): x is { url: string; text: string } => !!x && /<html|<body/i.test(x.text));
  const seen = new Set(f.sheets.map((s) => s.url));
  const extra = [...new Set(more.flatMap((p) => stylesheets(p.text, p.url)))].filter((u) => !seen.has(u)).slice(0, Math.max(0, 10 - f.sheets.length));
  const sheets = (await Promise.all(extra.map((u) => fetchText(u, "text/css", 2_000_000, 5000)))).filter((x): x is { url: string; text: string } => !!x);
  return { pages: [...f.pages, ...more.map((p) => ({ url: p.url, html: p.text }))], sheets: [...f.sheets, ...sheets] };
}

/** The site's look from its home page, in about eight seconds at most. */
export async function quickBrand(raw: string): Promise<QuickBrand | null> {
  const f = await fetchHome(raw);
  return f ? quickFrom(f) : null;
}
