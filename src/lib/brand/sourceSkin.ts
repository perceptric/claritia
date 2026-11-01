// Copying a site's look from its page source (docs/forms.md, Styling): what a person does by hand. Take the page's
// HTML and every stylesheet it loads, give them to Claude, and Claude writes the form's stylesheet from them. It runs
// on the web server the moment a brand is picked in New form or the builder, so a form wears the site's look in about
// a minute without waiting for the runner. The runner's browser read (skin.ts), which measures the real controls,
// replaces it when it finishes.

import type Anthropic from "@anthropic-ai/sdk";
import { cleanSkin, MARKUP, SKIN_MODEL } from "./skin.ts";
import type { Face } from "./skinCapture.ts";

export { SKIN_MODEL };
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

const SYSTEM = `You copy a website's look onto a web form, the way a designer would from the site's page source. You get the page's HTML and every stylesheet it loads. Find how the site draws its main button, its secondary button, its text inputs, its headings, its body text and its labels, and write one CSS stylesheet that makes the form's parts look exactly like them.

${MARKUP}

HOW TO READ THE SOURCE
- Many sites build the page with JavaScript, so the HTML may be nearly empty. Then read the stylesheets: the main button is the rule set with the brand's fill color, bold or uppercase text, a radius and padding (often with a darker bottom border or shadow and a pressed state); inputs are the rules with a border, radius and padding on input or a field class.
- Resolve CSS variables to their values (var(--x) → the value from :root), so the stylesheet works on its own.
- Use the site's font families exactly as written, with their fallbacks. Fonts listed under FONTS are loaded for you.
- COLORS are what was already read from the live site (its button fill, text, background): trust them.
- When the source doesn't show a control (its styles load later from scripts) and this is a well-known brand whose public look you know well, draw that control the way the brand does on its site. When you don't know the brand, build the controls from COLORS, the fonts and the radius and weights the stylesheets use most.

RULES
- Copy values exactly: fonts, sizes, weights, letter spacing, text transform, colors, borders per side, radius, shadows, padding, heights, and the hover, pressed (:active), focus and disabled states.
- If the site draws its button with a ::before layer or a thick bottom border that disappears when pressed, draw .bt the same way.
- Style .bt from the main button, .bt.bk from the secondary one, .in and .bx from the inputs, .h from the main heading, :host and .i from body text, .lb from field labels, .ck input and .cd label from the site's checkboxes and option cards when it has them (else from its inputs and buttons).
- Set :host's font-family, color and size, and .f's background to the page's background.
- Keep the layout working: don't change display, grid or flex on .f, .g, .fl, .ch, .cd, .ac, and don't hide anything.
- No url(), @import, @font-face or expressions.
Answer with JSON {"css": "...", "fonts": ["each font family the css uses"], "notes": ["what you copied, short"]}.`;

const OUT_SCHEMA = {
  type: "object",
  properties: { css: { type: "string" }, fonts: { type: "array", items: { type: "string" } }, notes: { type: "array", items: { type: "string" } } },
  required: ["css", "fonts", "notes"],
  additionalProperties: false,
};

export type SourceCaller = (p: { system: string; user: string; schema: object; maxTokens: number }) => Promise<{ text: string; usage: Anthropic.Beta.BetaUsage } | null>;

export function sourceText(src: PageSource): string {
  return [
    `SITE ${src.url}`,
    `COLORS ${src.colors && Object.keys(src.colors).length ? JSON.stringify(src.colors) : "none read"}`,
    `FONTS ${src.faces.length ? [...new Set(src.faces.map((f) => `${f.family} ${f.weight} ${f.style}`))].join("; ") : "none found in the stylesheets"}`,
    `HTML\n${src.html || "(empty: the page is built by JavaScript)"}`,
    ...src.css.map((s) => `STYLESHEET ${s.url}\n${s.text}`),
  ].join("\n\n");
}

/** Claude's stylesheet from the page source, cleaned, with the fonts it uses. Null when nothing usable came back. */
export async function skinFromSource(call: SourceCaller, src: PageSource): Promise<{ css: string; faces: Face[]; notes: string[]; usage: Anthropic.Beta.BetaUsage } | null> {
  if (!src.css.length && !src.html) return null;
  const out = await call({ system: SYSTEM, user: sourceText(src), schema: OUT_SCHEMA, maxTokens: 16000 }).catch(() => null);
  if (!out) return null;
  let j: { css?: unknown; fonts?: unknown; notes?: unknown };
  try {
    j = JSON.parse(out.text) as typeof j;
  } catch {
    return null;
  }
  const css = cleanSkin(typeof j.css === "string" ? j.css : "");
  if (!css || !/\.bt\b/.test(css)) return null;
  const used = new Set((Array.isArray(j.fonts) ? j.fonts : []).map((f) => String(f).replace(/^["']|["']$/g, "").toLowerCase()));
  const faces = src.faces.filter((f) => used.has(f.family.toLowerCase()) || css.toLowerCase().includes(f.family.toLowerCase()));
  return { css, faces, notes: Array.isArray(j.notes) ? j.notes.map(String).slice(0, 12) : [], usage: out.usage };
}
