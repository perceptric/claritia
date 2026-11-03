// The quick brand read (docs/brand-capture.md): the site's look from its HTML and stylesheets alone, on the web
// server, in a few seconds and with no browser. It runs the moment a site is entered (onboarding, New form, a brand
// kit), so forms and booking pages wear the brand at once. The runner's full scan, with a real browser and a look
// check, replaces it when it finishes. Pure functions here; fetching is in the scan route.

import { cleanTokens, contrast, type Tokens } from "../forms/brand.ts";

const GENERIC = /^(inherit|initial|unset|revert|serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-sans-serif|ui-serif|ui-monospace|-apple-system|blinkmacsystemfont|segoe ui|roboto|helvetica neue|helvetica|arial|noto sans|apple color emoji|segoe ui emoji|segoe ui symbol|noto color emoji|times new roman|georgia)$/i;

type Rule = { sel: string; body: string };

/** Every innermost rule, so rules inside @media count too. Comments dropped. */
export function cssRules(css: string): Rule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Rule[] = [];
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1]!.trim();
    if (!sel || sel.startsWith("@font-face") || /^@(keyframes|-webkit-keyframes)/.test(sel) || /^\d+%$|^(from|to)$/.test(sel)) continue;
    out.push({ sel, body: m[2]! });
  }
  return out;
}

const decl = (body: string, prop: string): string | undefined => {
  const re = new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([^;]+)`, "gi");
  let last: string | undefined;
  for (const m of body.matchAll(re)) last = m[1]!.replace(/!important/i, "").trim();
  return last;
};

/** A CSS color as #rrggbb, or null (transparent, gradients, keywords other than white and black). */
export function toHex(v: string | undefined): string | null {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  if (s === "white" || s === "#fff") return "#ffffff";
  if (s === "black" || s === "#000") return "#000000";
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    const h = m[1]!;
    if (h.length === 3 || h.length === 4) return `#${h.slice(0, 3).split("").map((c) => c + c).join("")}`;
    if (h.length === 6 || h.length === 8) {
      if (h.length === 8 && parseInt(h.slice(6), 16) < 128) return null;
      return `#${h.slice(0, 6)}`;
    }
    return null;
  }
  m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(s);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
    if (a < 0.5) return null;
    return `#${[m[1], m[2], m[3]].map((x) => Math.min(255, Number(x)).toString(16).padStart(2, "0")).join("")}`;
  }
  return null;
}

const sat = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  return Math.max(r, g, b) - Math.min(r, g, b);
};
const light = (hex: string) => contrast(hex, "#000000") > 15;

/** The first real family in a font-family list, quotes off. */
export function firstFamily(v: string | undefined): string | null {
  if (!v) return null;
  for (const raw of v.split(",")) {
    const f = raw.trim().replace(/^["']|["']$/g, "").trim();
    if (!f || f.startsWith("var(") || GENERIC.test(f) || f.length > 60 || /[{}<>;]/.test(f)) continue;
    return f;
  }
  return null;
}

/**
 * How often each color and font is used across the page and its stylesheets, for sites that keep their look in
 * generated styles (Framer, Webflow, Wix) instead of named rules. Builder defaults (Framer's blue link color) are
 * left out. Colors are counted three times over in backgrounds, where a brand color shows most.
 */
export function tally(all: string): { colors: [string, number][]; fonts: [string, number][] } {
  const text = all
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/--framer-link-(text-)?color\s*:[^;"}]+/g, "")
    .replace(/--framer-text-stroke-color\s*:[^;"}]+/g, "");
  const colors = new Map<string, number>();
  const add = (c: string | null, n: number) => c && colors.set(c, (colors.get(c) ?? 0) + n);
  for (const m of text.matchAll(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b/g)) add(toHex(m[0]), 1);
  for (const m of text.matchAll(/background(?:-color)?\s*:\s*(rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b)/g)) add(toHex(m[1]), 2);
  const fonts = new Map<string, number>();
  for (const m of text.matchAll(/(?:--framer-)?font-family\s*:\s*((?:[^;}"\n]|"[^"\n]*")+)/g)) {
    const f = firstFamily(m[1]!.replace(/\s+Placeholder\b/gi, ""));
    if (f) fonts.set(f, (fonts.get(f) ?? 0) + 1);
  }
  const sort = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  return { colors: sort(colors), fonts: sort(fonts) };
}

export type QuickBrand = { tokens: Partial<Tokens>; logo: string | null; found: string[] };

/**
 * The look from a page's HTML and its stylesheets' text. Custom properties are read first (sites name their brand
 * colors), then buttons, links, the body and headings, then the theme color. Only what's found is set.
 */
export function readBrand(html: string, css: string[], base: string): QuickBrand {
  const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]!);
  const rules = [...inline, ...css].flatMap(cssRules);
  const found: string[] = [];
  // Custom properties, with var() resolved a few levels deep.
  const vars = new Map<string, string>();
  for (const r of rules) for (const m of r.body.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) if (!vars.has(m[1]!)) vars.set(m[1]!, m[2]!.trim());
  const resolve = (v: string | undefined, depth = 0): string | undefined => {
    if (!v || depth > 4) return v;
    return v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (_, name: string, fb?: string) => resolve(vars.get(name) ?? fb ?? "", depth + 1) ?? "");
  };
  const get = (body: string, prop: string) => resolve(decl(body, prop));
  const pick = (selRe: RegExp, prop: string) => {
    for (const r of rules) if (selRe.test(r.sel)) {
      const v = get(r.body, prop);
      if (v) return v;
    }
    return undefined;
  };
  const t: Partial<Tokens> = {};

  // Brand colors by name.
  const byName = (re: RegExp) => {
    for (const [k, v] of vars) if (re.test(k)) {
      const c = toHex(resolve(v));
      if (c && !light(c) && sat(c) > 0.12) return c;
    }
    return null;
  };
  const named = byName(/(^|-)(primary|brand|accent|main|cta|theme)(-color|-colour)?($|-500|-600|-base|-default)/i) ?? byName(/primary|brand|accent/i);

  // Buttons: the most common filled button.
  const BTN = /(^|[\s,>])(button|\.btn\b|\.button\b|\.wp-block-button__link|\.elementor-button|\.cta\b|\[type=["']?submit|a\.btn|\.w-button|\.framer-button)/i;
  const counts = new Map<string, number>();
  let btnText: string | null = null;
  let btnRadius: string | undefined;
  let btnWeight: string | undefined;
  let btnCase: string | undefined;
  for (const r of rules) {
    if (!BTN.test(r.sel) || /:hover|:focus|:active|disabled/.test(r.sel)) continue;
    const bg = toHex(get(r.body, "background-color") ?? get(r.body, "background"));
    if (bg && !light(bg)) {
      counts.set(bg, (counts.get(bg) ?? 0) + 1);
      btnText ??= toHex(get(r.body, "color"));
      btnRadius ??= get(r.body, "border-radius");
      btnWeight ??= get(r.body, "font-weight");
      btnCase ??= get(r.body, "text-transform");
    }
  }
  const btnBg = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const link = toHex(pick(/(^|[\s,])a(\s*,|\s*$|:link)/, "color"));
  const theme = toHex(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)/i.exec(html)?.[1]);

  const used = tally([html, ...css].join("\n"));
  // The brand color the page uses most: saturated, not near white, not a plain gray.
  const mostUsed = used.colors.find(([c]) => sat(c) > 0.25 && !light(c))?.[0] ?? null;
  const accent = named ?? btnBg ?? (link && sat(link) > 0.15 ? link : null) ?? (theme && !light(theme) && sat(theme) > 0.12 ? theme : null) ?? mostUsed;
  if (accent) {
    t.accent = accent;
    found.push("accent");
  }
  // No filled button rule found: buttons take the brand color.
  const button = btnBg ?? named ?? accent;
  if (button) {
    t.buttonBg = button;
    t.buttonText = btnText && contrast(btnText, button) >= 3 ? btnText : contrast("#ffffff", button) >= 3 ? "#ffffff" : "#111111";
    found.push("buttons");
  }
  const radius = parseFloat(btnRadius ?? "");
  if (Number.isFinite(radius)) t.buttonRadius = btnRadius!.includes("%") || radius > 40 ? 32 : radius;
  const weight = Number(btnWeight);
  if (weight >= 300 && weight <= 800) t.buttonWeight = weight;
  if (btnCase === "uppercase") t.buttonCase = "uppercase";

  // The page: text and background colors, fonts.
  const BODY = /(^|,)\s*(body|html|:root)\s*($|,)/;
  const text = toHex(pick(BODY, "color")) ?? used.colors.find(([c]) => contrast(c, "#ffffff") >= 12 && c !== "#000000")?.[0] ?? null;
  if (text && contrast(text, "#ffffff") >= 4.5) t.text = text;
  const bg = toHex(pick(BODY, "background-color") ?? pick(BODY, "background"));
  if (bg && light(bg)) t.background = bg;
  const bodyFont = firstFamily(pick(BODY, "font-family")) ?? firstFamily(resolve([...vars].find(([k]) => /font.*(body|base|sans|text|primary)|(body|base|primary).*font/i.test(k))?.[1]));
  const headFont = firstFamily(pick(/(^|,)\s*h[12]\b/, "font-family")) ?? (used.fonts[1] && used.fonts[1][1] >= 10 && /display|serif|head/i.test(used.fonts[1][0]) ? used.fonts[1][0] : null) ?? firstFamily(resolve([...vars].find(([k]) => /font.*(head|display|title)|(heading|display|title).*font/i.test(k))?.[1]));
  // Google Fonts linked from the page.
  const gfont = /<link[^>]+href=["'](https:\/\/fonts\.googleapis\.com\/css2?\?[^"']+)["']/i.exec(html)?.[1]?.replace(/&amp;/g, "&");
  const gnames = gfont ? [...gfont.matchAll(/family=([^:&]+)/g)].map((m) => decodeURIComponent(m[1]!.replace(/\+/g, " "))) : [];
  // A builder's default body font (Framer's Inter) loses to the font the page's text actually uses far more often.
  const top = used.fonts[0];
  const bodyUses = used.fonts.find(([f]) => f === bodyFont)?.[1] ?? 0;
  const font = (top && top[1] >= 20 && top[1] >= bodyUses * 2 ? top[0] : null) ?? bodyFont ?? top?.[0] ?? gnames[0] ?? null;
  if (font) {
    t.font = `${/\s/.test(font) ? `'${font}'` : font}, ui-sans-serif, system-ui, sans-serif`;
    found.push("font");
  }
  if (headFont && headFont !== font) t.headingFont = `${/\s/.test(headFont) ? `'${headFont}'` : headFont}, ${t.font ?? "sans-serif"}`;
  if (gfont) t.fontUrl = gfont;
  const radiusIn = parseFloat(pick(/(^|[\s,])(input|textarea|\.form-control|select)\b/, "border-radius") ?? "");
  if (Number.isFinite(radiusIn)) t.radius = radiusIn;
  else if (Number.isFinite(radius)) t.radius = Math.min(radius, 12);

  // Only what cleanTokens keeps.
  const clean = cleanTokens({ ...t });
  const tokens: Partial<Tokens> = {};
  for (const k of Object.keys(t) as (keyof Tokens)[]) if (!clean.dropped.includes(k)) (tokens as Record<string, unknown>)[k] = clean.tokens[k];

  // The logo: an image named or classed logo, else the touch icon, else the share picture.
  const abs = (u: string | undefined) => {
    if (!u) return null;
    try {
      const x = new URL(u.replace(/&amp;/g, "&"), base);
      return x.protocol === "https:" ? x.href : null;
    } catch {
      return null;
    }
  };
  // The site's own logo: a logo image named for the site (customer logo rows are other companies'), else the site's
  // touch icon. No logo beats someone else's.
  const name = new URL(base).hostname.replace(/^www\./, "").split(".")[0]!.toLowerCase();
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].filter((m) => /logo/i.test(m[0]));
  // Named for the site in its alt text or its file name; a picture hosted on the site's CDN isn't enough.
  const own = imgs.find((m) => {
    const alt = /\balt=["']([^"']*)["']/i.exec(m[0])?.[1]?.toLowerCase() ?? "";
    const file = (/\bsrc=["']([^"']+)["']/i.exec(m[0])?.[1] ?? "").split(/[?#]/)[0]!.split("/").pop()!.toLowerCase();
    return new RegExp(`^${name}(\\b|[ ._-]|logo)`).test(alt) || new RegExp(`(^|[^a-z])${name}[^a-z]*logo|logo[^a-z]*${name}`).test(file);
  });
  const logo = abs(own ? /\bsrc=["']([^"']+)["']/i.exec(own[0])?.[1] : undefined) ?? abs(/<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)/i.exec(html)?.[1]);
  if (logo) found.push("logo");
  return { tokens, logo, found };
}

/** The stylesheets a page links, as https addresses, most likely the site's own first. */
export function stylesheets(html: string, base: string, max = 6): string[] {
  const host = new URL(base).hostname;
  const out: string[] = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/rel=["'][^"']*stylesheet/i.test(tag)) continue;
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href) continue;
    try {
      const u = new URL(href.replace(/&amp;/g, "&"), base);
      if (u.protocol === "https:" && !/fonts\.googleapis|font-awesome|fontawesome|bootstrap-icons|cdnjs\.cloudflare\.com\/ajax\/libs\/(font|animate)/i.test(u.href)) out.push(u.href);
    } catch {}
  }
  return [...new Set(out)].sort((a, b) => Number(new URL(b).hostname === host) - Number(new URL(a).hostname === host)).slice(0, max);
}
