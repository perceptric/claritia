// Readable by construction (docs/studio-v2-plan.md Part 16): text that fails 4.5 to 1 (3 to 1 when large) against
// what's behind it is moved to the nearest color of its own hue that passes, darker on light backgrounds and lighter
// on dark ones; a font that isn't the brand's is put back to the brand's. Deterministic, never a model call. Three
// places use it: the 18 styles and a brand's stylesheet at the source (their color variables), the form's own CSS when
// a change lands in the Studio (rules that set a color on their own background, fonts), and the Studio's measure of
// the drawn form (studio.ts), which writes what's left as one marked block in the form's CSS, so the published page
// carries it and Undo takes it back. The form check measures with the same code, so what this fixes it never reports.

import { declText, eachRule, splitSelectors } from "./guardCss.ts";

export type Rgb = { r: number; g: number; b: number; a: number };

const NAMED: Record<string, string> = { white: "#ffffff", black: "#000000", gray: "#808080", grey: "#808080", silver: "#c0c0c0", red: "#ff0000", green: "#008000", blue: "#0000ff", navy: "#000080", teal: "#008080", orange: "#ffa500", purple: "#800080", yellow: "#ffff00", maroon: "#800000", olive: "#808000", lime: "#00ff00", aqua: "#00ffff", fuchsia: "#ff00ff", lightgray: "#d3d3d3", lightgrey: "#d3d3d3", darkgray: "#a9a9a9", darkgrey: "#a9a9a9", dimgray: "#696969", whitesmoke: "#f5f5f5", gainsboro: "#dcdcdc" };

/** A CSS color as numbers: hex, rgb(), rgba(), hsl(), hsla() and the common names; null for anything else. */
export function parseColor(s: string | null | undefined): Rgb | null {
  let v = String(s ?? "").trim().toLowerCase().replace(/\s*!important$/, "");
  if (v === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  if (NAMED[v]) v = NAMED[v]!;
  let m = /^#([0-9a-f]{3,8})$/.exec(v);
  if (m) {
    let h = m[1]!;
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  m = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(v);
  if (m) {
    const c = (x: string) => (x.endsWith("%") ? (parseFloat(x) * 255) / 100 : parseFloat(x));
    const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: c(m[1]!), g: c(m[2]!), b: c(m[3]!), a };
  }
  m = /^hsla?\(\s*(-?[\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(v);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { ...fromHsl(parseFloat(m[1]!), parseFloat(m[2]!) / 100, parseFloat(m[3]!) / 100), a };
  }
  return null;
}

export const hex = (c: Rgb) => `#${[c.r, c.g, c.b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("")}`;
const lin = (x: number) => { const v = x / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
/** WCAG relative luminance. */
export const luminance = (c: Rgb) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
/** WCAG contrast ratio of two opaque colors. */
export function contrast(a: Rgb, b: Rgb): number {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** `top` drawn over `under` at its own alpha (times `alpha`). */
export const over = (top: Rgb, under: Rgb, alpha = 1): Rgb => {
  const a = Math.max(0, Math.min(1, top.a * alpha));
  return { r: top.r * a + under.r * (1 - a), g: top.g * a + under.g * (1 - a), b: top.b * a + under.b * (1 - a), a: 1 };
};

function toHsl(c: Rgb): [number, number, number] {
  const r = c.r / 255, g = c.g / 255, b = c.b / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function fromHsl(h: number, s: number, l: number): Rgb {
  const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255, a: 1 };
}

/** The contrast text needs: 3 to 1 for large text (24px, or 18.66px bold), else 4.5 to 1. */
export const needFor = (px: number, weight: number) => (px >= 24 || (px >= 18.66 && weight >= 700) ? 3 : 4.5);
/** Whether a background is light (black text reads better on it than white). */
export const isLight = (bg: Rgb) => luminance(bg) > 0.179;

/**
 * The color of `fg`'s hue nearest to it that reaches `min` against `bg` (drawn at `alpha`): darker on a light
 * background, lighter on a dark one, and the other way only when that way can't pass. `fg` itself when it passes.
 */
export function readableOn(fg: Rgb, bg: Rgb, min = 4.5, alpha = 1): Rgb {
  if (contrast(over(fg, bg, alpha), bg) >= min) return fg;
  // A new color clears the line by a little, so writing it as hex never drops it under.
  const ok = (c: Rgb) => contrast(over(c, bg, alpha), bg) >= min + 0.05;
  const solid = { ...fg, a: 1 };
  const [h, s, l] = toHsl(solid);
  const at = (L: number): Rgb => ({ ...fromHsl(h, s, L), a: fg.a });
  // Lightness from the color's own toward black (or white): the nearest that passes, found by halving.
  const tryWay = (dark: boolean): Rgb | null => {
    if (!ok(at(dark ? 0 : 1))) return null;
    let pass = dark ? 0 : 1, fail = l;
    for (let i = 0; i < 24; i++) {
      const mid = (pass + fail) / 2;
      if (ok(at(mid))) pass = mid;
      else fail = mid;
    }
    return at(pass);
  };
  const light = isLight(bg);
  const out = tryWay(light) ?? tryWay(!light);
  if (out) return out;
  // Too faint to pass at any lightness: drawn solid.
  return alpha < 1 || fg.a < 1 ? readableOn(solid, bg, min, 1) : light ? { r: 0, g: 0, b: 0, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
}
const dist = (a: Rgb, b: Rgb) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
/**
 * Text on its own color (a button's words on the button): whichever moves less, the text or the color under it, so a
 * white word on a brand color keeps its white and the color darkens a touch, and dark words on a pale color darken.
 */
export function readablePair(fg: Rgb, bg: Rgb, min = 4.5): { fg: Rgb; bg: Rgb } {
  const text = readableOn(fg, bg, min);
  if (text === fg) return { fg, bg };
  const under = readableOn({ ...bg, a: 1 }, { ...fg, a: 1 }, min);
  return dist(under, bg) < dist(text, fg) && contrast(fg, under) >= min ? { fg, bg: under } : { fg: text, bg };
}
/** The same, on CSS color text; the original text when it passes or can't be read. */
export function readableCss(fg: string, bg: string, min = 4.5): string {
  const f = parseColor(fg), b = parseColor(bg);
  if (!f || !b || b.a < 0.99) return fg;
  const out = readableOn(f, b, min);
  return out === f ? fg : out.a < 1 ? `rgba(${Math.round(out.r)},${Math.round(out.g)},${Math.round(out.b)},${+out.a.toFixed(3)})` : hex(out);
}

// ── At the source: a stylesheet's color variables, and rules that set a color on their own background ───────────

const TEXT_VAR = /^--brand-(text|muted|body|ink|heading|label|title)$/;
const BG_VAR = /^--brand-(bg|surface|field|card|background|page)$/;
const ON_VAR = /^--brand-on-([a-z-]+)$/;
const ROOT = /^(:root|:host|html|body|\.page|\.cl-root)$/;

/** The custom properties a stylesheet sets on :root (later ones win), with var() read through. */
export function rootVars(...sheets: string[]): Map<string, string> {
  const vars = new Map<string, string>();
  for (const css of sheets)
    eachRule(String(css ?? ""), (sel, d) => {
      if (splitSelectors(sel).some((s) => ROOT.test(s))) for (const [k, v] of d) if (k.startsWith("--")) vars.set(k, v.replace(/\s*!important$/i, ""));
      return null;
    });
  return vars;
}
/** A value with var(--x) read from `vars` (a few levels deep), or null when it can't be. */
export function resolve(v: string, vars: Map<string, string>, depth = 0): string | null {
  const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(v.trim());
  if (!m) return v.trim();
  if (depth > 4) return null;
  const x = vars.get(m[1]!);
  return x !== undefined ? resolve(x, vars, depth + 1) : m[2] ? resolve(m[2], vars, depth + 1) : null;
}
/** The color a `background` or `background-color` value paints, when it's one plain color. */
function paint(v: string, vars: Map<string, string>): Rgb | null {
  if (/url\(|gradient\(/i.test(v)) return null;
  const parts = v.replace(/\s*!important$/i, "").trim().split(/\s+(?![^()]*\))/);
  for (const p of parts) {
    const c = parseColor(resolve(p, vars));
    if (c) return c;
  }
  return null;
}

/**
 * A stylesheet whose text colors read on their backgrounds: the brand's text variables against each background
 * variable, each --brand-on-X against --brand-X, and every rule that sets both its color and its own plain background.
 * `context` is the stylesheet underneath (the brand's, under a form's CSS), for its variables. Idempotent.
 */
export function readableCssText(css: string, context = ""): string {
  const vars = rootVars(context, css);
  const fixed = new Map<string, string>();
  const bgs = [...vars].filter(([k]) => BG_VAR.test(k)).map(([, v]) => parseColor(resolve(v, vars))).filter((c): c is Rgb => !!c && c.a > 0.99);
  for (const [k, v] of vars) {
    const fg = parseColor(resolve(v, vars));
    if (!fg) continue;
    if (TEXT_VAR.test(k) && bgs.length) {
      // Against the background it reads worst on; only when the backgrounds are all light or all dark.
      if (new Set(bgs.map(isLight)).size > 1) continue;
      const worst = bgs.reduce((a, b) => (contrast(fg, b) < contrast(fg, a) ? b : a));
      const out = readableOn(fg, worst, 4.5);
      if (out !== fg && bgs.every((b) => contrast(out, b) >= 4.5)) fixed.set(k, hex(out));
    }
    const on = ON_VAR.exec(k);
    if (on && vars.has(`--brand-${on[1]}`)) {
      const under = parseColor(resolve(vars.get(`--brand-${on[1]}`)!, vars));
      if (under && under.a > 0.99) {
        const out = readablePair(fg, under, 4.5);
        if (out.fg !== fg) fixed.set(k, hex(out.fg));
        if (out.bg !== under && /^(#|rgb|hsl)/i.test(vars.get(`--brand-${on[1]}`)!.trim())) fixed.set(`--brand-${on[1]}`, hex(out.bg));
      }
    }
  }
  const after = new Map([...vars, ...fixed]);
  return eachRule(String(css ?? ""), (sel, d) => {
    let changed = false;
    const isRoot = splitSelectors(sel).some((s) => ROOT.test(s));
    const bgDecl = d.find(([k]) => k === "background" || k === "background-color");
    const bg = bgDecl ? paint(bgDecl[1], after) : null;
    const next = d.map(([k, v]): [string, string] => {
      if (isRoot && fixed.has(k) && /^(#|rgb|hsl|[a-z]+$)/i.test(v.trim())) { changed = true; return [k, fixed.get(k)! + (/!important/i.test(v) ? "!important" : "")]; }
      if (k === "color" && bg && bg.a > 0.99 && !/::placeholder|::selection/.test(sel)) {
        const fg = parseColor(resolve(v.replace(/\s*!important$/i, ""), after));
        if (fg && fg.a > 0) {
          const out = readableOn(fg, bg, 4.5);
          if (out !== fg) { changed = true; return [k, hex(out) + (/!important/i.test(v) ? "!important" : "")]; }
        }
      }
      return [k, v];
    });
    return changed ? `${sel}{${declText(next)}}` : null;
  });
}

// ── Fonts: only the brand's ─────────────────────────────────────────────────────────────────────────────────────

const GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-sans-serif|ui-serif|ui-monospace|ui-rounded|-apple-system|blinkmacsystemfont|segoe ui|inherit|initial|unset|revert|emoji|math)$/i;
const IMPORTS = /@import\s+url\(\s*["']?(https:\/\/fonts\.googleapis\.com\/[^"')]+)["']?\s*\)\s*;?([ \t]*\/\* form font \*\/)?/gi;
const first = (list: string) => (list.split(",")[0] ?? "").replace(/["']/g, "").trim();
/** The fonts a page may use: the brand's (every family its stylesheet names) and one the owner picked in the Form tab. */
export function allowedFonts(brandCss: string, formCss = ""): Set<string> {
  const out = new Set<string>();
  const add = (list: string) => list.split(",").map((x) => x.replace(/["']/g, "").trim().toLowerCase()).filter(Boolean).forEach((x) => out.add(x));
  for (const m of String(brandCss ?? "").matchAll(/font-family\s*:\s*([^;}]+)/gi)) add(m[1]!);
  for (const m of String(brandCss ?? "").matchAll(/--[\w-]*(?:font|head)[\w-]*\s*:\s*([^;}]+)/gi)) add(m[1]!);
  for (const m of String(brandCss ?? "").matchAll(/family=([^&:"')]+)/gi)) for (const f of decodeURIComponent(m[1]!).split("|")) out.add(f.replace(/\+/g, " ").trim().toLowerCase());
  for (const m of String(formCss ?? "").matchAll(IMPORTS)) if (m[2]) for (const f of m[1]!.matchAll(/family=([^&:"')]+)/g)) for (const x of decodeURIComponent(f[1]!).split("|")) out.add(x.replace(/\+/g, " ").trim().toLowerCase());
  return out;
}
export const fontAllowed = (family: string, allowed: Set<string>) => !family || GENERIC.test(family) || allowed.has(family.toLowerCase());

/** The brand's own font list, for the text (or, `head`, the headings), as the brand's stylesheet names it. */
function brandStack(brandCss: string, head: boolean): string {
  const css = String(brandCss ?? "");
  const vars = rootVars(css);
  for (const k of head ? ["--brand-head", "--brand-heading", "--brand-font"] : ["--brand-font", "--brand-body"]) if (vars.get(k)) return `var(${k})`;
  const page = /(?:^|[}\s,])(?:\.page|body|html|:root)\s*\{[^}]*font-family\s*:\s*([^;}]+)/i.exec(css)?.[1];
  const any = page ?? /font-family\s*:\s*([^;}]+)/i.exec(css)?.[1] ?? /(?:^|[;{\s])font\s*:\s*[^;}]*?\d(?:px|em|rem|%|pt)(?:\/[\d.]+[a-z%]*)?\s+([^;}]+)/i.exec(css)?.[1];
  if (any) return any.trim();
  const imp = /family=([^&:"')]+)/.exec(css)?.[1];
  return imp ? `"${decodeURIComponent(imp).replace(/\+/g, " ")}",sans-serif` : "inherit";
}

/**
 * A form's CSS with only the brand's fonts: a font-family, a font shorthand or a font variable that names another
 * font is put back to the brand's, and a Google Fonts import nobody may use is dropped. The owner's pick in the Form
 * tab (its import marked "form font") stays.
 */
export function brandFonts(css: string, brandCss: string): string {
  const allowed = allowedFonts(brandCss, css);
  let out = String(css ?? "").replace(IMPORTS, (all, url: string, mark?: string) => {
    if (mark) return all;
    const fams = [...url.matchAll(/family=([^&"')]+)/g)].flatMap((f) => decodeURIComponent(f[1]!).split("|")).map((f) => f.split(":")[0]!.replace(/\+/g, " ").trim().toLowerCase());
    return fams.every((f) => allowed.has(f)) ? all : "";
  });
  // Text nothing gives a font to takes the brand's, not the browser's.
  const ROOTFONT = /(?:^|[}\s,;])(?::root|:host|html|body|\.page|\.cl-root)\s*(?:,[^{]*)?\{[^}]*(?<![\w-])font(?:-family)?\s*:/i;
  const base = brandStack(brandCss, false);
  if (base !== "inherit" && !ROOTFONT.test(String(brandCss ?? "")) && !ROOTFONT.test(out)) out = `${out.trimEnd()}\n.cl-root{font-family:${base}}`;
  out = eachRule(out, (sel, d) => {
    let changed = false;
    const head = /\bh[1-6]\b|heading|title|hero|display/i.test(sel);
    const next = d.map(([k, v]): [string, string] => {
      if (k === "font-family" && !fontAllowed(first(v.replace(/\s*!important$/i, "")), allowed) && !/^var\(/.test(v.trim())) { changed = true; return [k, brandStack(brandCss, head)]; }
      if (k === "font" && !/^var\(/.test(v.trim())) {
        // The family list is everything after the size (14px or 14px/1.4).
        const m = /^(.*?\d[\d.]*(?:px|em|rem|%|pt|vw|cqi)(?:\s*\/\s*[\d.]+[a-z%]*)?\s+)(.+)$/i.exec(v.replace(/\s*!important$/i, ""));
        if (m && !fontAllowed(first(m[2]!), allowed) && !/^var\(/.test(m[2]!.trim())) {
          changed = true;
          const stack = brandStack(brandCss, head);
          return [k, `${m[1]}${stack.startsWith("var(") ? (resolve(stack, rootVars(brandCss)) ?? "inherit") : stack}`];
        }
      }
      if (/^--brand-(font|head|heading|body)$/.test(k) && !fontAllowed(first(v), allowed) && !/^var\(/.test(v.trim())) { changed = true; return [k, (resolve(`var(${k})`, rootVars(brandCss)) ?? "inherit")]; }
      return [k, v];
    });
    return changed ? `${sel}{${declText(next)}}` : null;
  });
  return out;
}

// ── In the browser: the text on a drawn page, and the block that fixes what's left ───────────────────────────────

export type TextLook = { el: Element; text: string; fg: Rgb; bg: Rgb; alpha: number; ratio: number; min: number };
export const READABLE = "/* claritia: readable */";
const TEXT_TAGS = "h1,h2,h3,h4,h5,h6,p,label,span,button,a,legend,li,strong,b,small,em,i,dt,dd,th,td,blockquote,figcaption,div";

/**
 * Every piece of text on a drawn page with its color, the solid background behind it, its opacity and its contrast.
 * Text over a picture or a gradient, and text whose background can't be told, is left out. Browser only.
 */
export function textLooks(root: ParentNode, limit = 400): TextLook[] {
  const out: TextLook[] = [];
  const win = (root as Node).ownerDocument?.defaultView ?? window;
  for (const el of [...root.querySelectorAll(TEXT_TAGS)].slice(0, 1500)) {
    if (out.length >= limit) break;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
    if (!own) continue;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    const cs = win.getComputedStyle(el);
    if (cs.visibility === "hidden") continue;
    const fg = parseColor(cs.color);
    if (!fg) continue;
    let bg: Rgb | null = null, alpha = 1, skip = false;
    // Up to the page's own root (never the screen around it, whose color isn't the form's).
    for (let p: Element | null = el; p; p = p.parentElement) {
      const ps = win.getComputedStyle(p);
      alpha *= Number(ps.opacity) || 0;
      if (ps.backgroundImage && ps.backgroundImage !== "none") { skip = true; break; }
      const b = parseColor(ps.backgroundColor);
      if (b && b.a > 0.5) { bg = { ...b, a: 1 }; break; }
    }
    if (skip || !bg) continue;
    const seen = over(fg, bg, alpha);
    const ratio = contrast(seen, bg);
    const min = needFor(parseFloat(cs.fontSize), Number(cs.fontWeight) || 400);
    out.push({ el, text: el.textContent!.trim().replace(/\s+/g, " ").slice(0, 40), fg, bg, alpha, ratio, min });
  }
  return out;
}

const SAFE = /^[A-Za-z_][\w-]*$/;
/**
 * A selector for an element that reads well in the form's CSS and outranks the rule that colored it: the nearest id,
 * then the classed elements down to it. `exact` names its place among its siblings at each step, for one element.
 */
export function selectorFor(el: Element, root: Element, exact = false): string {
  const parts: string[] = [];
  for (let n: Element | null = el; n && n !== root; n = n.parentElement) {
    if (n.id && SAFE.test(n.id) && !/^el\d+$/.test(n.id)) { parts.unshift(`#${n.id}`); break; }
    const cls = [...n.classList].filter((c) => SAFE.test(c) && !/^cl-(edit|root)$/.test(c)).map((c) => `.${c}`).join("");
    const nth = exact && n.parentElement ? `:nth-child(${[...n.parentElement.children].indexOf(n) + 1})` : "";
    if (n === el || cls || exact) parts.unshift(`${n.tagName.toLowerCase()}${cls}${nth}`);
  }
  return `.cl-root ${parts.join(exact ? " > " : " ")}:not(#cl-r)`.replace(/ > (#[\w-]+)/, " $1");
}

const colorText = (c: Rgb) => (c.a < 1 ? `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${+c.a.toFixed(3)})` : hex(c));
const passes = (t: TextLook, c: Rgb) => contrast(over(c, t.bg, t.alpha), t.bg) >= t.min;

/**
 * The rules that make every failing piece of text readable, merged over `had` (the block now): one per selector when
 * one color reads on everything the selector picks, else one per element.
 */
export function readableRules(looks: TextLook[], root: Element, had: Map<string, string> = new Map()): Map<string, string> {
  const out = new Map(had);
  const groups = new Map<string, TextLook[]>();
  for (const t of looks) { const s = selectorFor(t.el, root); groups.set(s, [...(groups.get(s) ?? []), t]); }
  // Too faint to pass at its opacity: drawn solid as well.
  const rule = (t: TextLook) => { const fix = readableOn(t.fg, t.bg, t.min, t.alpha); const solid = !passes(t, fix); return { fix, solid, decl: `color:${colorText(fix)}${solid ? ";opacity:1" : ""}` }; };
  for (const [sel, ts] of groups) {
    const bad = ts.filter((t) => t.ratio < t.min);
    if (!bad.length) continue;
    const { fix, solid, decl } = rule(bad[0]!);
    const forAll = ts.every((t) => passes(solid ? { ...t, alpha: 1 } : t, fix));
    if (forAll) { out.set(sel, decl); continue; }
    for (const t of bad) out.set(selectorFor(t.el, root, true), rule(t).decl);
  }
  return out;
}
/** The readable block in a form's CSS, as rules. */
export function readBlock(css: string): Map<string, string> {
  const out = new Map<string, string>();
  const i = String(css ?? "").indexOf(READABLE);
  if (i < 0) return out;
  const end = css.indexOf(`${READABLE.replace("*/", "end */")}`, i);
  for (const m of css.slice(i + READABLE.length, end < 0 ? undefined : end).matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.set(m[1]!.trim(), m[2]!.trim());
  return out;
}
/** A form's CSS with its readable block set to `rules` (none: the block goes). It sits before the editor's block. */
export function writeBlock(css: string, rules: Map<string, string>): string {
  const END = READABLE.replace("*/", "end */");
  let base = String(css ?? "");
  const i = base.indexOf(READABLE);
  if (i >= 0) { const j = base.indexOf(END, i); base = `${base.slice(0, i).trimEnd()}${j >= 0 ? `\n${base.slice(j + END.length).trimStart()}` : ""}`; }
  if (!rules.size) return base.trimEnd();
  const block = `${READABLE}\n${[...rules].map(([s, d]) => `${s}{${d}}`).join("\n")}\n${END}`;
  const e = base.indexOf("/* editor */");
  return e >= 0 ? `${base.slice(0, e).trimEnd()}\n${block}\n${base.slice(e)}` : `${base.trimEnd()}\n${block}`;
}
