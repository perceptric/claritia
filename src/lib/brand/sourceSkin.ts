// A site's page source for Tia (src/lib/studio/site.ts, the brand's Form Studio stylesheet): the page's HTML without
// scripts, every stylesheet it loads, the brand's own fonts (no math or icon fonts) and the colors read from it, as
// one text Claude reads.

import type { Face } from "./skinCapture.ts";

/** The page source as Claude reads it: the HTML without scripts, every stylesheet, and the fonts they load. */
export type PageSource = { url: string; html: string; css: { url: string; text: string }[]; faces: Face[]; colors?: Record<string, string> };

const MAX_HTML = 60_000;
const MAX_CSS = 260_000;
/** Fonts that are never a brand's own: math, icons and emoji. */
const NOT_BRAND = /katex|mathjax|icon|awesome|material|symbol|emoji|glyph|fa-|bootstrap/i;

/** The page's HTML as a person reads it: scripts, SVG drawings and data blobs out, the markup and words kept. */
export function pageMarkup(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, "<svg/>")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\sdata:[^"'\s)]{200,}/g, " data:…")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_HTML);
}

/** The stylesheets inside the page itself (<style> tags). */
export const inlineStyles = (html: string): string[] => [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]!.trim()).filter(Boolean);

/** The Google Fonts stylesheets a page links (the quick read skips them; here they carry the brand's fonts). */
export const googleFontSheets = (html: string, base: string): string[] =>
  [...html.matchAll(/<link\b[^>]*href=["']([^"']*fonts\.googleapis\.com\/css[^"']*)["'][^>]*>/gi)]
    .map((m) => {
      try {
        return new URL(m[1]!.replace(/&amp;/g, "&"), base).href;
      } catch {
        return "";
      }
    })
    .filter((u) => u.startsWith("https://"))
    .slice(0, 3);

/** Each @font-face in a stylesheet, with its best file (woff2 first) as a full https address. */
export function fontFaces(css: string, base: string): Face[] {
  const out: Face[] = [];
  for (const m of css.matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
    const body = m[1]!;
    const prop = (p: string) => new RegExp(`${p}\\s*:\\s*([^;]+)`, "i").exec(body)?.[1]?.trim();
    const family = prop("font-family")?.replace(/^["']|["']$/g, "").trim();
    if (!family || NOT_BRAND.test(family)) continue;
    // Latin first: a Google font lists one file per script; the rest aren't needed for an English form.
    const range = prop("unicode-range");
    if (range && !/U\+0000-00FF|U\+0-FF|U\+0020/i.test(range)) continue;
    const urls = [...(prop("src") ?? "").matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)].map((u) => u[1]!);
    const pick = urls.find((u) => /\.woff2(\?|$)/i.test(u)) ?? urls.find((u) => /\.woff(\?|$)/i.test(u)) ?? urls.find((u) => /\.(ttf|otf)(\?|$)/i.test(u));
    if (!pick) continue;
    let src: string;
    try {
      src = new URL(pick, base).href;
    } catch {
      continue;
    }
    if (!src.startsWith("https://")) continue;
    out.push({ family, weight: prop("font-weight") ?? "400", style: /italic/i.test(prop("font-style") ?? "") ? "italic" : "normal", src });
  }
  return out;
}

/** The source to send: markup, stylesheets (largest share to the site's own), and up to 12 brand fonts. */
export function pageSource(url: string, html: string, sheets: { url: string; text: string }[]): PageSource {
  const inline = inlineStyles(html).map((text, i) => ({ url: `${url}#style${i + 1}`, text }));
  const all = [...inline, ...sheets];
  const faces: Face[] = [];
  for (const s of all) for (const f of fontFaces(s.text, s.url)) if (!faces.some((x) => x.family === f.family && x.weight === f.weight && x.style === f.style)) faces.push(f);
  // Math and icon fonts out of the CSS too, so the room goes to the site's own rules.
  const trimmed = all.map((s) => ({ url: s.url, text: s.text.replace(/@font-face\s*\{[^}]*\}/gi, "").replace(/\s+/g, " ").trim() })).filter((s) => s.text);
  const css: PageSource["css"] = [];
  let left = MAX_CSS;
  for (const s of trimmed) {
    if (left <= 0) break;
    css.push({ url: s.url, text: s.text.slice(0, left) });
    left -= s.text.length;
  }
  return { url, html: pageMarkup(html), css, faces: faces.slice(0, 12) };
}

export function sourceText(src: PageSource): string {
  return [
    `SITE ${src.url}`,
    `COLORS ${src.colors && Object.keys(src.colors).length ? JSON.stringify(src.colors) : "none read"}`,
    `FONTS ${src.faces.length ? [...new Set(src.faces.map((f) => `${f.family} ${f.weight} ${f.style}`))].join("; ") : "none found in the stylesheets"}`,
    `HTML\n${src.html || "(empty: the page is built by JavaScript)"}`,
    ...src.css.map((s) => `STYLESHEET ${s.url}\n${s.text}`),
  ].join("\n\n");
}
