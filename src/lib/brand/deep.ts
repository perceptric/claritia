// The deep brand read (docs/brand-capture.md): everything a site's pages and stylesheets say about its brand, read on
// the web server with no browser. Colors with where each is used, the site's own fonts and their files, the heading
// and body type, every button style, corners, shadows, gradients, the logo (its SVG when inline), favicon and share
// picture, hero pictures, the words: headlines, calls to action, menu, social links. Works on hand-written CSS and on
// builder sites (Framer, Webflow, Wix, WordPress themes) whose styles live in generated classes and inline styles.
// Claude turns this into the brand book (book.ts); nothing here guesses.

import { cssRules, firstFamily, toHex } from "./quick.ts";
import { withSvgNs } from "./svgData.ts";

export type Page = { url: string; html: string };
export type Sheet = { url: string; text: string };
export type ColorUse = { hex: string; count: number; bg: number; text: number; fill: number; border: number; button: number };
export type FontFace = { family: string; weight: string; style: string; src: string };
export type TypeStyle = { family?: string; size?: string; weight?: string; lineHeight?: string; letterSpacing?: string; transform?: string };
export type ButtonStyle = { bg?: string; gradient?: string; color?: string; border?: string; radius?: string; padding?: string; weight?: string; transform?: string; label?: string; count: number };
export type RawBrand = {
  site: { url: string; name: string; title: string; description: string };
  logo: { svg: string | null; src: string | null };
  icons: { favicon: string | null; touch: string | null; share: string | null };
  colors: ColorUse[];
  fonts: { family: string; count: number }[];
  faces: FontFace[];
  googleFonts: string | null;
  type: Record<"h1" | "h2" | "h3" | "h4" | "body" | "small", TypeStyle>;
  buttons: ButtonStyle[];
  radii: { value: string; count: number }[];
  shadows: { value: string; count: number }[];
  gradients: { value: string; count: number }[];
  images: { src: string; alt: string }[];
  copy: { headlines: string[]; ctas: string[]; menu: string[]; paragraphs: string[] };
  social: { kind: string; url: string }[];
  emails: string[];
};

const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
const textOf = (html: string = "") => decode(html.replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const bump = <K>(m: Map<K, number>, k: K, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const top = (m: Map<string, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([value, count]) => ({ value, count }));
const abs = (u: string | undefined | null, base: string) => {
  if (!u) return null;
  try {
    const x = new URL(decode(u.trim()), base);
    return x.protocol === "https:" ? x.href : null;
  } catch {
    return null;
  }
};
const attr = (tag: string, name: string) => new RegExp(`\\b${name}=["']([^"']*)["']`, "i").exec(tag)?.[1];

/** Only the drawing parts of an inline SVG, with no scripts, links, events or outside references. */
const CASED: Record<string, string> = { lineargradient: "linearGradient", radialgradient: "radialGradient", clippath: "clipPath" };

export function cleanSvg(svg: string): string | null {
  const ok = /^(svg|g|path|rect|circle|ellipse|line|polyline|polygon|defs|lineargradient|radialgradient|stop|clippath|mask|title|use)$/i;
  const okAttr = /^(viewbox|width|height|d|x|y|x1|x2|y1|y2|cx|cy|r|rx|ry|points|fill|fill-rule|clip-rule|stroke|stroke-width|stroke-linecap|stroke-linejoin|transform|offset|stop-color|stop-opacity|opacity|fill-opacity|id|clip-path|mask|gradientunits|gradienttransform|xmlns|preserveaspectratio|href|xlink:href)$/i;
  let out = "";
  const re = /<(\/?)([a-zA-Z:]+)([^>]*?)(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    if (m[5] !== undefined) continue;
    const name = m[2]!.toLowerCase();
    if (!ok.test(name)) {
      if (!m[1] && !m[4] && /^(script|style|foreignobject|a)$/i.test(name)) return null;
      continue;
    }
    // SVG names are case-sensitive: gradients and clip paths keep their own spelling.
    const tag = CASED[name] ?? name;
    if (m[1]) {
      out += `</${tag}>`;
      continue;
    }
    const attrs = [...m[3]!.matchAll(/([a-zA-Z:-]+)\s*=\s*"([^"]*)"|([a-zA-Z:-]+)\s*=\s*'([^']*)'/g)]
      .map((a) => [a[1] ?? a[3]!, a[2] ?? a[4]!] as const)
      .filter(([k, v]) => okAttr.test(k) && !/javascript:|data:|https?:/i.test(v) && !(/href$/i.test(k) && !v.startsWith("#")))
      .map(([k, v]) => `${k}="${v.replace(/"/g, "&quot;")}"`);
    out += `<${tag}${attrs.length ? ` ${attrs.join(" ")}` : ""}${m[4] ? "/" : ""}>`;
  }
  // The namespace, which the attribute check above takes out: without it a picture made from the drawing is broken.
  return out.startsWith("<svg") && out.length < 60_000 ? withSvgNs(out) : null;
}

const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;

/** What's inside the element whose open tag starts at `at`, to its own closing tag (nested ones counted). */
export function innerOf(html: string, at: number): string {
  const open = /<([a-zA-Z][\w:-]*)\b[^>]*>/y;
  open.lastIndex = at;
  const first = open.exec(html);
  if (!first) return "";
  const start = open.lastIndex;
  const re = /<(\/?)([a-zA-Z][\w:-]*)\b[^>]*?(\/?)>/g;
  re.lastIndex = start;
  let depth = 1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[3] || (!m[1] && VOID.test(m[2]!))) continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index);
    if (m.index - start > 200_000) break;
  }
  return html.slice(start, start + 200_000);
}

/** A drawing's box: its viewBox, else its width and height. */
function boxOf(svg: string): [number, number, number, number] | null {
  const vb = /^<svg\b[^>]*\sviewbox="([^"]+)"/i.exec(svg)?.[1]?.trim().split(/[\s,]+/).map(Number);
  if (vb?.length === 4 && vb.every(Number.isFinite) && vb[2]! > 0 && vb[3]! > 0) return vb as [number, number, number, number];
  const w = Number(/^<svg\b[^>]*\swidth="([\d.]+)"/i.exec(svg)?.[1]), h = Number(/^<svg\b[^>]*\sheight="([\d.]+)"/i.exec(svg)?.[1]);
  return w > 0 && h > 0 ? [0, 0, w, h] : null;
}

/**
 * Several logo drawings (an icon and its wordmark) as one: side by side, each at its own size, centered on one line,
 * with a gap of a third of the tallest. One drawing comes back as it is.
 */
export function joinSvgs(svgs: string[]): string | null {
  if (svgs.length === 1) return svgs[0]!;
  const parts = svgs.map((s) => ({ s, b: boxOf(s) })).filter((p): p is { s: string; b: [number, number, number, number] } => !!p.b);
  if (!parts.length) return null;
  if (parts.length === 1) return parts[0]!.s;
  const H = Math.max(...parts.map((p) => p.b[3]));
  const gap = Math.round(H / 3);
  let x = 0;
  const inner = parts.map((p) => {
    const body = p.s.replace(/^<svg\b[^>]*>/i, "").replace(/<\/svg>\s*$/i, "");
    const y = Math.round(((H - p.b[3]) / 2) * 100) / 100;
    const out = `<svg x="${x}" y="${y}" width="${p.b[2]}" height="${p.b[3]}" viewBox="${p.b.join(" ")}">${body}</svg>`;
    x += p.b[2] + gap;
    return out;
  });
  const W = Math.round((x - gap) * 100) / 100;
  return cleanSvg(`<svg viewBox="0 0 ${W} ${H}">${inner.join("")}</svg>`);
}

/**
 * The logo among the drawings in its link or box: an icon followed by a wordmark is one logo, joined; otherwise the
 * first wordmark (a wide drawing), else the first drawing. A second icon after a wordmark (Vercel's triangle, shown on
 * small screens) is left out.
 */
export function pickLogo(ds: string[]): string | null {
  const ratio = (d: string) => {
    const b = boxOf(d);
    return b ? b[2] / b[3] : 1;
  };
  const wide = (d: string) => ratio(d) >= 2.2;
  if (ds.length >= 2 && !wide(ds[0]!) && wide(ds[1]!)) return joinSvgs([ds[0]!, ds[1]!]);
  return ds.find(wide) ?? ds[0] ?? null;
}

/** Everything the pages and stylesheets say about the brand. The first page is the home page. */
export function extractBrand(pages: Page[], sheets: Sheet[]): RawBrand {
  const home = pages[0]!;
  const base = home.url;
  const host = new URL(base).hostname.replace(/^www\./, "");
  const name0 = host.split(".")[0]!.toLowerCase();
  const allHtml = pages.map((p) => p.html).join("\n");
  const inline = [...allHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]!);
  const css = [...inline, ...sheets.map((s) => s.text)].join("\n");
  const rules = cssRules(css);
  const styles = [...allHtml.matchAll(/\bstyle="([^"]*)"/gi)].map((m) => decode(m[1]!));

  // Custom properties, resolved through var() and its fallbacks.
  const vars = new Map<string, string>();
  for (const r of rules) for (const m of r.body.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) if (!vars.has(m[1]!)) vars.set(m[1]!, m[2]!.trim());
  const resolve = (v: string, depth = 0): string => (depth > 5 ? v : v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))+))?\)/g, (_, n: string, fb?: string) => resolve(vars.get(n) ?? fb ?? "", depth + 1)));

  // Colors, by what they paint.
  const colors = new Map<string, ColorUse>();
  const paint = (value: string, role: "bg" | "text" | "fill" | "border" | "button", n = 1) => {
    for (const m of resolve(value).matchAll(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b|\b(?:white|black)\b/g)) {
      const hex = toHex(m[0]);
      if (!hex) continue;
      const c = colors.get(hex) ?? { hex, count: 0, bg: 0, text: 0, fill: 0, border: 0, button: 0 };
      c.count += n;
      c[role] += n;
      colors.set(hex, c);
    }
  };
  const BTN = /(^|[\s,>.#\[])(button|btn|cta|wp-block-button__link|elementor-button|w-button|framer-button|\[type=["']?submit)/i;
  const declsOf = (body: string) => [...body.matchAll(/([\w-]+)\s*:\s*([^;]+)/g)].map((m) => [m[1]!.toLowerCase(), m[2]!.trim()] as const);
  const readDecls = (decls: (readonly [string, string])[], isButton: boolean) => {
    for (const [k, v] of decls) {
      if (/link-text-color|text-stroke/.test(k)) continue; // builder defaults
      if (/^(background|background-color|--framer-background-color)$/.test(k)) paint(v, isButton ? "button" : "bg", isButton ? 3 : 2);
      else if (/^(color|--framer-text-color)$/.test(k)) paint(v, "text");
      else if (/^(fill|stroke)$/.test(k)) paint(v, "fill");
      else if (/^border(-top|-bottom|-left|-right)?(-color)?$|^--border-color$/.test(k)) paint(v, "border");
    }
  };
  for (const r of rules) if (!/:hover|:focus|:active|::selection|::placeholder/.test(r.sel)) readDecls(declsOf(r.body), BTN.test(r.sel));
  for (const tag of allHtml.matchAll(/<[a-z][^>]*\bstyle="[^"]*"[^>]*>/gi)) {
    const t = tag[0];
    readDecls(declsOf(decode(attr(t, "style") ?? "")), /data-framer-name="[^"]*(button|cta)|class="[^"]*\b(btn|button)\b|^<button/i.test(t));
  }

  // Fonts: what the text uses, and the files the site serves.
  const fonts = new Map<string, number>();
  for (const s of [...rules.map((r) => r.body), ...styles]) for (const m of s.matchAll(/(?:--framer-)?font-family\s*:\s*((?:[^;}"\n]|"[^"\n]*")+)/g)) {
    const f = firstFamily(resolve(decode(m[1]!)).replace(/\s+Placeholder\b/gi, "").replace(/\s*!important/gi, ""));
    if (f && !/icon|awesome|symbol|emoji/i.test(f)) bump(fonts, f);
  }
  const faces: FontFace[] = [];
  for (const m of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const body = decode(m[1]!);
    const family = /font-family\s*:\s*["']?([^;"']+)/i.exec(body)?.[1]?.trim();
    const src = [...body.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)\s*(?:format\(\s*["']?(woff2?|truetype|opentype)["']?\s*\))?/gi)].map((u) => abs(u[1], base)).find((u) => !!u && /\.(woff2?|ttf|otf)(\?|$)|format/i.test(u!));
    if (!family || !src || /placeholder/i.test(family)) continue;
    faces.push({ family, weight: /font-weight\s*:\s*([^;]+)/i.exec(body)?.[1]?.trim() ?? "400", style: /font-style\s*:\s*([^;]+)/i.exec(body)?.[1]?.trim() ?? "normal", src });
  }
  const googleFonts = /<link[^>]+href=["'](https:\/\/fonts\.googleapis\.com\/css2?\?[^"']+)["']/i.exec(allHtml)?.[1]?.replace(/&amp;/g, "&") ?? null;

  // Type: for each heading level and body text, the rules for the tag and for the classes the site puts on it.
  const typeFor = (tag: string): TypeStyle => {
    const classes = new Set<string>();
    for (const m of home.html.matchAll(new RegExp(`<${tag}\\b[^>]*class="([^"]*)"`, "gi"))) for (const c of m[1]!.split(/\s+/)) if (c && !/^(framer-text|w-|wp-)$/.test(c)) classes.add(c);
    // The classes the site puts on this tag (a builder's text presets) first, then rules for the tag itself. A reset
    // that styles every heading and paragraph alike says nothing about the brand.
    const reset = (sel: string) => (sel.match(/(^|[\s,>])(h[1-6]|p|body|html|span|a|li)\b/g) ?? []).length >= 4;
    const byClass = rules.filter((r) => [...classes].some((c) => r.sel.includes(`.${c}`)) && !reset(r.sel));
    const byTag = rules.filter((r) => new RegExp(`(^|[\\s,>])${tag}(\\b|$)`).test(r.sel) && !reset(r.sel));
    const own = [...byClass, ...byTag];
    const get = (...props: string[]) => {
      for (const r of own) for (const p of props) {
        const v = new RegExp(`(?:^|;|\\s)${p.replace(/[-]/g, "\\-")}\\s*:\\s*([^;]+)`, "i").exec(r.body)?.[1];
        if (v && !/inherit|initial|unset/.test(v)) return resolve(decode(v)).trim();
      }
      return undefined;
    };
    const fam = get("--framer-font-family", "font-family");
    return {
      ...(fam && firstFamily(fam.replace(/\s+Placeholder\b/gi, "")) ? { family: firstFamily(fam.replace(/\s+Placeholder\b/gi, ""))! } : {}),
      ...((s) => (s ? { size: s } : {}))(get("--framer-font-size", "font-size")),
      ...((s) => {
        const n = /\b([1-9]00)\b/.exec(s ?? "")?.[1] ?? (s === "bold" ? "700" : s === "normal" ? "400" : undefined);
        return n ? { weight: n } : {};
      })(get("--framer-font-weight", "font-weight")),
      ...((s) => (s ? { lineHeight: s } : {}))(get("--framer-line-height", "line-height")),
      ...((s) => (s ? { letterSpacing: s } : {}))(get("--framer-letter-spacing", "letter-spacing")),
      ...((s) => (s && s !== "none" ? { transform: s } : {}))(get("--framer-text-transform", "text-transform")),
    };
  };
  const type = { h1: typeFor("h1"), h2: typeFor("h2"), h3: typeFor("h3"), h4: typeFor("h4"), body: typeFor("p"), small: typeFor("small") };

  // Buttons: every distinct filled or outlined style, most used first, with a label it carries.
  const buttons = new Map<string, ButtonStyle>();
  const addButton = (decls: (readonly [string, string])[], label?: string, innerColor?: string | null) => {
    const g = (re: RegExp) => decls.find(([k]) => re.test(k))?.[1];
    const paintV = resolve(g(/^(background|background-color|--framer-background-color)$/) ?? "");
    // A gradient button: its first solid color stands for it, and the gradient is kept.
    const bg = toHex(paintV) ?? (/gradient/.test(paintV) ? (paintV.match(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b/g) ?? []).map(toHex).find(Boolean) ?? null : null);
    const borderColor = toHex(resolve(g(/^(border-color|--border-color)$/) ?? ""));
    const border = g(/^border$/) ?? (borderColor ? `1px solid ${borderColor}` : undefined);
    if (!bg && !border) return;
    const b: ButtonStyle = {
      ...(bg ? { bg } : {}),
      ...(/gradient/.test(paintV) ? { gradient: paintV } : {}),
      ...((c) => (c ? { color: c } : {}))(toHex(resolve(g(/^(color|--framer-text-color)$/) ?? "")) ?? innerColor ?? null),
      ...(border ? { border: resolve(border) } : {}),
      ...((r) => (r ? { radius: resolve(r) } : {}))(g(/^border-radius$/) ?? g(/^border-top-left-radius$/)),
      ...((p) => (p ? { padding: resolve(p) } : {}))(g(/^padding$/)),
      ...((w) => (w ? { weight: resolve(w) } : {}))(g(/^(font-weight|--framer-font-weight)$/)),
      ...((t) => (t && t !== "none" ? { transform: t } : {}))(g(/^text-transform$/)),
      count: 1,
    };
    const key = `${b.bg}|${b.color}|${b.border}|${b.radius}`;
    const had = buttons.get(key);
    if (had) {
      had.count++;
      had.label ??= label;
    } else buttons.set(key, { ...b, ...(label ? { label } : {}) });
  };
  for (const r of rules) if (BTN.test(r.sel) && !/:hover|:focus|:active|disabled/.test(r.sel)) addButton(declsOf(r.body));
  for (const m of allHtml.matchAll(/<(a|button)\b([^>]*(?:data-framer-name="[^"]*(?:button|cta|primary|secondary)[^"]*"|class="[^"]*\b(?:btn|button|cta)\b[^"]*"|role="button")[^>]*)>([\s\S]{0,3000}?)<\/\1>/gi)) {
    const style = attr(m[2]!, "style");
    const label = textOf(m[3]!).slice(0, 40);
    // The label's color is often set on the text inside (builders): read it there.
    const inner = /(?:--framer-text-color|--extracted-[\w-]+|[;"\s]color)\s*:[^;"]*?(rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b)/i.exec(decode(m[3]!))?.[1];
    // Builders repeat the label for a hover effect ("Book a demo Book a demo"): keep one.
    const half = label.length % 2 === 1 ? label.slice(0, (label.length - 1) / 2) : "";
    const once = half && label === `${half} ${half}` ? half : label;
    if (style) addButton(declsOf(decode(style)), once || undefined, inner ? toHex(inner) : null);
  }

  // Corners, shadows, gradients.
  const radii = new Map<string, number>();
  const shadows = new Map<string, number>();
  const gradients = new Map<string, number>();
  for (const body of [...rules.map((r) => r.body), ...styles]) {
    for (const m of body.matchAll(/border-radius\s*:\s*([^;]+)/gi)) {
      const v = resolve(m[1]!).trim();
      if (/^\d+(\.\d+)?(px|rem|%)?$/.test(v) && v !== "0" && v !== "0px") bump(radii, v);
    }
    for (const m of body.matchAll(/box-shadow\s*:\s*([^;]+)/gi)) {
      const v = resolve(m[1]!).trim();
      if (v !== "none" && v.length < 160) bump(shadows, v);
    }
    for (const m of body.matchAll(/(linear|radial)-gradient\((?:[^()]|\([^()]*\))+\)/gi)) bump(gradients, resolve(m[0]));
  }

  // The logo, read from the top of the page (to the end of the header or menu) in full:
  //   1. the first link home in it (href "/", "./" or the site itself): what nearly every site wraps its logo in;
  //   2. else an element named or classed as the logo, never a wall of other companies' logos;
  //   3. else a picture whose own name or alt names the site.
  // A logo is often an icon and a wordmark drawn apart (momos.com: a 32×24 icon and a 96×16 word): both are kept and
  // joined at the sizes the site draws them (pickLogo), never the icon alone.
  let svg: string | null = null;
  let logoSrc: string | null = null;
  const head = home.html.slice(0, Math.max(home.html.search(/<\/header>|<\/nav>/i), 0) + 20_000 || 60_000);
  // Drawings in the link or box, in order: inline ones, and ones a builder paints as a background (Framer).
  const bgSvg = (style: string) => {
    const u = /url\((['"]?)data:image\/svg\+xml(?:;charset=[\w-]+)?,([\s\S]*?)\1\)/i.exec(style.replace(/&quot;/g, '"').replace(/&#39;/g, "'"))?.[2];
    if (!u) return "";
    try {
      return decodeURIComponent(u);
    } catch {
      return "";
    }
  };
  const drawingsIn = (inner: string) =>
    [...inner.matchAll(/<svg\b[\s\S]*?<\/svg>|\bstyle="[^"]*background-image:\s*url\([^"]*image\/svg\+xml[^"]*"/gi)]
      .map((x) => {
        let d = x[0].startsWith("<") ? x[0] : bgSvg(x[0]);
        // A sprite reference: draw the symbol it points to.
        const ref = /<use\b[^>]*href="#([^"]+)"/i.exec(d)?.[1];
        if (ref) {
          const def = new RegExp(`<(symbol|svg|g)(\\b[^>]*id="${ref.replace(/[^\w-]/g, "")}"[^>]*)>([\\s\\S]*?)<\\/\\1>`, "i").exec(allHtml);
          if (def) {
            d = d.replace(/<use\b[^>]*\/?>(<\/use>)?/i, def[3]!);
            // The symbol's own frame, when the drawing that points at it has none.
            const vb = /\bviewBox="([^"]+)"/i.exec(def[2]!)?.[1];
            if (vb && !/^<svg\b[^>]*\bviewBox=/i.test(d)) d = d.replace(/^<svg\b/i, `<svg viewBox="${vb}"`);
          }
        }
        return paintable(cleanSvg(d));
      })
      // A drawing with nothing to draw (a sprite that couldn't be found) isn't a logo.
      .filter((d): d is string => !!d && /<(path|rect|circle|ellipse|polygon|polyline|line)\b/i.test(d));
  // Colors a drawing takes from the page (fill="var(--logo-fill, black)") mean nothing on their own: they're read from
  // the site's styles here. A logo drawn only in white (made for a dark header, like framer.com's) is shown in
  // near-black, or it would vanish on a light form.
  const paintable = (d: string | null): string | null => {
    if (!d) return d;
    let out = d.replace(/\b(fill|stroke|stop-color)="([^"]*var\([^"]*)"/gi, (_m, k: string, v: string) => {
      const r = resolve(v).trim();
      return `${k}="${/var\(/.test(r) || !r ? "#111111" : r.replace(/"/g, "'")}"`;
    });
    const paints = [...out.matchAll(/\b(?:fill|stroke|stop-color)="([^"]*)"/gi)].map((m) => m[1]!.trim().toLowerCase()).filter((v) => v && v !== "none" && v !== "transparent");
    const white = (v: string) => /^(#fff|#ffffff|white|rgba?\(\s*255\s*,\s*255\s*,\s*255\s*(,\s*[\d.]+\s*)?\))$/.test(v);
    const unfilled = /<(path|rect|circle|ellipse|polygon|polyline)\b(?![^>]*\bfill=)/i.test(out) && !/^<svg\b[^>]*\bfill=/i.test(out);
    if (paints.length && paints.every(white) && !unfilled) out = out.replace(/\b(fill|stroke|stop-color)="([^"]*)"/gi, (m, k: string, v: string) => (white(v.trim().toLowerCase()) ? `${k}="#111111"` : m));
    return out;
  };
  const origin = new URL(base).origin;
  const isHome = (href: string) => {
    try {
      const u = new URL(href.replace(/&amp;/g, "&"), base);
      return u.origin === origin && /^\/(index\.html?|home|[a-z]{2}(-[a-z]{2})?)?\/?$/i.test(u.pathname);
    } catch {
      return false;
    }
  };
  const take = (inner: string, trusted: boolean): boolean => {
    const ds = drawingsIn(inner);
    if (ds.length) svg = pickLogo(ds);
    if (svg) return true;
    const img = /<img\b[^>]*>/i.exec(inner)?.[0];
    // A picture in the home link is the site's; elsewhere it must be named for the site (menus show other logos).
    const own = img ? `${attr(img, "alt") ?? ""} ${(attr(img, "src") ?? "").split(/[?#]/)[0]!.split("/").pop() ?? ""}` : "";
    if (img && (trusted || new RegExp(name0, "i").test(own))) logoSrc = abs(attr(img, "src"), base);
    return !!logoSrc;
  };
  for (const m of head.matchAll(/<a\b[^>]*>/gi)) {
    const href = attr(m[0], "href");
    // "#main" (skip to content) points at this page too, but isn't the logo.
    if (!href || href.startsWith("#") || !isHome(href)) continue;
    if (take(innerOf(head, m.index!), true)) break;
  }
  if (!svg && !logoSrc)
    for (const m of head.matchAll(/<(a|div|span|figure|picture)\b([^>]*)>/gi)) {
      // Its names: class, id, Framer's layer name, its label and title, each word checked.
      const named = [...m[2]!.matchAll(/\b(?:class|id|data-framer-name|aria-label|title)="([^"]*)"/gi)].map((x) => x[1]).join(" ");
      if (!/(^|[\s_-])(logo|site-?logo|brand-?logo|nav-?brand|navbar-?brand|custom-logo)([\s_-]|$)/i.test(named)) continue;
      // Other companies' logos (a customer wall) are named for them or as a group: "Sweetgreen logo", "logo-carousel".
      if (/\blogos\b|logo-?(carousel|wall|grid|cloud|strip|marquee|section)|customer|client|partner|trusted|seeklogo|press/i.test(named)) continue;
      if (take(innerOf(head, m.index!), false)) break;
    }
  if (!svg && !logoSrc) {
    // Its alt or its file's own name (not the site's image host: calendlycms.com/microsoftLogo.svg is Microsoft's).
    const own = (t: string) => `${attr(t, "alt") ?? ""} ${(attr(t, "src") ?? "").split(/[?#]/)[0]!.split("/").pop() ?? ""}`;
    const named = [...home.html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]).find((t) => new RegExp(`${name0}[^ ]*logo|logo[^ ]*${name0}|^${name0}( |$)`, "i").test(own(t)));
    if (named) logoSrc = abs(attr(named, "src"), base);
  }
  const link = (rel: RegExp) => {
    const t = [...home.html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).find((x) => rel.test(attr(x, "rel") ?? ""));
    return t ? abs(attr(t, "href"), base) : null;
  };
  const meta = (prop: string) => {
    const t = [...home.html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]).find((x) => (attr(x, "property") ?? attr(x, "name"))?.toLowerCase() === prop);
    return t ? decode(attr(t, "content") ?? "") : "";
  };

  // Pictures: large ones first (not icons, logos or tracking pixels).
  const images = [...allHtml.matchAll(/<img\b[^>]*>/gi)]
    .map((m) => ({ src: abs(attr(m[0], "src") ?? attr(m[0], "data-src"), base), alt: decode(attr(m[0], "alt") ?? "").slice(0, 120), w: Number(attr(m[0], "width") ?? 0) }))
    .filter((x): x is { src: string; alt: string; w: number } => !!x.src && !/logo|icon|avatar|pixel|1x1|badge|\.svg(\?|$)/i.test(x.src + x.alt) && (x.w === 0 || x.w >= 300))
    .filter((x, i, all) => all.findIndex((y) => y.src === x.src) === i)
    .slice(0, 12)
    .map(({ src, alt }) => ({ src, alt }));

  // Words.
  const texts = (re: RegExp, max: number, len = 160) => [...new Set([...allHtml.matchAll(re)].map((m) => textOf(m[1]!)).filter((t) => t.length > 1 && t.length <= len))].slice(0, max);
  const headlines = texts(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi, 20);
  const ctas = [...new Set([...[...buttons.values()].map((b) => b.label ?? ""), ...texts(/<(?:a|button)\b[^>]*(?:class="[^"]*\b(?:btn|button|cta)\b[^"]*"|data-framer-name="[^"]*button[^"]*")[^>]*>([\s\S]{0,300}?)<\/(?:a|button)>/gi, 20, 40)].filter(Boolean))].slice(0, 12);
  const navLinks = [...(home.html.match(/<nav\b[\s\S]*?<\/nav>/i)?.[0] ?? home.html.match(/<header\b[\s\S]*?<\/header>/i)?.[0] ?? "").matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => textOf(m[1]!)).filter((t) => t && t.length <= 30);
  const paragraphs = texts(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, 15, 400).filter((t) => t.length > 40);
  const social = [...new Set([...allHtml.matchAll(/href="(https:\/\/(?:www\.)?(linkedin|twitter|x|facebook|instagram|youtube|tiktok)\.com\/[^"]+)"/gi)].map((m) => `${m[2]!.toLowerCase()}|${m[1]}`))].slice(0, 8).map((s) => ({ kind: s.split("|")[0]!, url: s.split("|")[1]! }));
  const emails = [...new Set([...allHtml.matchAll(/mailto:([^"?]+)/gi)].map((m) => m[1]!.toLowerCase()))].slice(0, 3);

  return {
    site: { url: base, name: meta("og:site_name") || (/<title[^>]*>([^<|–-]*)/i.exec(home.html)?.[1]?.trim() ?? host), title: decode(/<title[^>]*>([^<]*)/i.exec(home.html)?.[1]?.trim() ?? ""), description: meta("description") || meta("og:description") },
    logo: { svg, src: logoSrc },
    icons: { favicon: link(/^(shortcut )?icon$/i), touch: link(/apple-touch-icon/i), share: abs(meta("og:image"), base) },
    colors: [...colors.values()].sort((a, b) => b.count - a.count).slice(0, 30),
    fonts: [...fonts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([family, count]) => ({ family, count })),
    faces: faces
      .filter((f, i, all) => all.findIndex((g) => g.family === f.family && g.weight === f.weight && g.style === f.style) === i)
      .sort((a, b) => (fonts.get(b.family) ?? 0) - (fonts.get(a.family) ?? 0))
      .slice(0, 24),
    googleFonts,
    type,
    buttons: [...buttons.values()].sort((a, b) => b.count - a.count).slice(0, 8),
    radii: top(radii, 8),
    shadows: top(shadows, 5),
    gradients: top(gradients, 4),
    images,
    copy: { headlines, ctas, menu: [...new Set(navLinks)].slice(0, 12), paragraphs },
    social,
    emails,
  };
}
