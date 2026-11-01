import "server-only";
import { hostIsPrivate } from "../privateNet.ts";
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

/** The site's look from its home page and up to six stylesheets, in about eight seconds at most. */
export async function quickBrand(raw: string): Promise<QuickBrand | null> {
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const page = await fetchText(url, "text/html", 3_000_000, 8000);
  if (!page || !/<html|<body|<head/i.test(page.text)) return null;
  const sheets = await Promise.all(stylesheets(page.text, page.url).map((s) => fetchText(s, "text/css", 2_000_000, 5000)));
  return readBrand(page.text, sheets.map((s) => s?.text ?? ""), page.url);
}
