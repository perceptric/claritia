// Branded booking pages: the brand's own stylesheet (the one Form Studio reads, brand_kits.studio_css) drawn on the
// booking page, on paid plans only. Claritia's layout stays (month, Soonest, morning and afternoon times, time zone,
// details); the brand's controls take over its parts: .btn on the main buttons, .btn-secondary on the times, Soonest
// and the outline buttons, .field on the inputs, .label on the field names, .heading on the titles. Everything is
// scoped to .cb-brand (the booking root), so nothing reaches the page around an embed. Runs in the browser (the
// Styling preview) and on the server.

import { cleanColor, contrast } from "../forms/brand.ts";
import { cleanPageCss } from "../studio/page.ts";
import { lookTokens, usesKit, type PageLook } from "./look.ts";

/** Plans with branded booking pages. Branded forms stay on every plan. */
export const BRAND_PLANS = ["starter", "team", "business"] as const;
export const brandPlan = (plan: unknown): boolean => BRAND_PLANS.includes(plan as (typeof BRAND_PLANS)[number]);

/** What a booking page needs to draw the brand: the plan check and the scoped stylesheet with its font links. */
export type BookBrand = { paid: boolean; css: string; fonts: string[]; kit?: { tokens: Record<string, unknown>; logo_url: string | null; design?: unknown } };

export const SCOPE = ".cb-brand";

/** The brand's classes and the booking parts they style. .btn-secondary is matched before .btn. */
const ALIAS: Record<string, string[]> = {
  "btn-secondary": [".cb-btn.cb-ghost", ".cb-time", ".cb-sc"],
  btn: [".cb-btn:not(.cb-ghost):not(.cb-danger)"],
  field: [".cb-in"],
  label: [".cb-field>span"],
  heading: [".cb-h", ".cb-two"],
};
const CLASS = /\.(btn-secondary|btn|field|label|heading)(?![\w-])/;
const ROOT = /^(?::root|html|body)(?![\w-])/;
const KEEP_AT = /^@(?:media|supports|container)\b/i;
const RAW_AT = /^@(?:font-face|(?:-webkit-)?keyframes)\b/i;
const ROOT_DECL = /^(?:--[\w-]+|font(?:-[\w-]+)?|color|line-height|letter-spacing|-webkit-font-smoothing|-moz-osx-font-smoothing|text-rendering|font-feature-settings)\s*:/i;

/**
 * Sizing kept by Claritia, so a brand's full-width or padded button can't break the time list, the time and its Next
 * button, or the Soonest row. The picked time keeps its fill next to the brand's Next button.
 */
const GUARDS = [
  `${SCOPE} .cb-time{flex:1 1 0!important;width:auto!important;min-width:0!important;max-width:none!important;margin:0!important;min-height:44px;padding:6px 8px!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;white-space:nowrap}`,
  `${SCOPE} .cb-tlist>.cb-time{width:100%!important;flex:none!important}`,
  `${SCOPE} .cb-time.cb-on{background:var(--cb-fill)!important;color:var(--clr-text)!important}`,
  `${SCOPE} .cb-tpair{display:flex!important;gap:6px}`,
  `${SCOPE} .cb-tpair .cb-btn{flex:1 1 0!important;width:auto!important;min-width:0!important;margin:0!important;padding:6px 8px!important;min-height:44px;white-space:nowrap}`,
  `${SCOPE} .cb-sc{display:inline-flex!important;align-items:baseline!important;gap:6px!important;width:auto!important;max-width:100%;margin:0!important;min-height:32px!important;padding:6px 12px!important;font-size:.9em}`,
  `${SCOPE} .cb-btn{margin:0!important;max-width:100%}`,
  `${SCOPE} .cb-in{margin:0!important;width:100%!important}`,
  `${SCOPE} textarea.cb-in{min-height:96px}`,
  `${SCOPE} .cb-h,${SCOPE} .cb-two{margin:0!important}`,
].join("\n");

type Block = { stmt: string } | { prelude: string; body: string };

/** Top-level statements and blocks, with quotes respected. Comments are stripped before. */
function blocks(css: string): Block[] {
  const out: Block[] = [];
  let i = 0;
  const n = css.length;
  while (i < n) {
    let j = i;
    let q: string | null = null;
    while (j < n) {
      const c = css[j]!;
      if (q) {
        if (c === "\\") j++;
        else if (c === q) q = null;
      } else if (c === '"' || c === "'") q = c;
      else if (c === "{" || c === ";" || c === "}") break;
      j++;
    }
    if (j >= n) break;
    const c = css[j];
    if (c === ";") {
      out.push({ stmt: css.slice(i, j).trim() });
      i = j + 1;
      continue;
    }
    if (c === "}") {
      i = j + 1;
      continue;
    }
    let k = j + 1;
    let depth = 1;
    q = null;
    while (k < n && depth > 0) {
      const ch = css[k]!;
      if (q) {
        if (ch === "\\") k++;
        else if (ch === q) q = null;
      } else if (ch === '"' || ch === "'") q = ch;
      else if (ch === "{") depth++;
      else if (ch === "}") depth--;
      k++;
    }
    out.push({ prelude: css.slice(i, j).trim(), body: css.slice(j + 1, depth ? k : k - 1) });
    i = k;
  }
  return out;
}

/** Splits a selector list on its top-level commas (not inside :is(), :not() and the like). */
function selectors(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of list) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** One brand selector as the booking selectors it styles, scoped. Empty when it styles nothing on the page. */
export function aliasSelector(sel: string): string[] {
  let s = sel.trim();
  if (!s) return [];
  const root = ROOT.exec(s);
  if (root) {
    s = s.slice(root[0].length);
    // :root, html, body: the booking root itself; html body .x and the like: inside it.
    s = s.replace(/^(?:\s*(?:html|body)(?![\w-]))+/, "");
    if (!s.trim()) return [SCOPE];
  }
  if (!CLASS.test(s)) return [];
  let out = [s];
  for (let guard = 0; guard < 4; guard++) {
    const next: string[] = [];
    let changed = false;
    for (const x of out) {
      const m = CLASS.exec(x);
      if (!m) {
        next.push(x);
        continue;
      }
      changed = true;
      for (const to of ALIAS[m[1]!]!) next.push(x.slice(0, m.index) + to + x.slice(m.index + m[0].length));
    }
    out = next.slice(0, 12);
    if (!changed) break;
  }
  return out.map((x) => `${SCOPE} ${x.trim()}`);
}

/** The rules inside a block body, scoped; nested at-rules recurse. */
function scopeRules(css: string, fonts: string[], vars: Map<string, string>, top: boolean): string {
  const out: string[] = [];
  for (const b of blocks(css)) {
    if ("stmt" in b) {
      const imp = /^@import\s+(?:url\(\s*)?["']?(https:\/\/fonts\.googleapis\.com\/[^"')\s]+)/i.exec(b.stmt);
      if (imp && fonts.length < 6 && !fonts.includes(imp[1]!)) fonts.push(imp[1]!);
      continue;
    }
    const p = b.prelude;
    if (p.startsWith("@")) {
      if (KEEP_AT.test(p)) {
        const inner = scopeRules(b.body, fonts, vars, false);
        if (inner) out.push(`${p}{${inner}}`);
      } else if (RAW_AT.test(p) && !/[{}]/.test(b.body.replace(/\{[^{}]*\}/g, ""))) out.push(`${p}{${b.body}}`);
      continue;
    }
    if (b.body.includes("{")) continue; // nested CSS: left out
    const sels = selectors(p).flatMap(aliasSelector);
    if (!sels.length) continue;
    const body = b.body.trim();
    const inner = [...new Set(sels.filter((s) => s !== SCOPE))];
    if (sels.includes(SCOPE)) {
      // On the root, only variables and type: the page's own spacing and background stay Claritia's.
      const keep = body
        .split(";")
        .map((d) => d.trim())
        .filter((d) => ROOT_DECL.test(d));
      if (top)
        for (const d of keep) {
          const m = /^(--[\w-]+)\s*:\s*([\s\S]+?)$/.exec(d);
          if (m) vars.set(m[1]!.toLowerCase(), m[2]!.replace(/\s*!important$/i, ""));
        }
      if (keep.length) out.push(`.cb-root${SCOPE}{${keep.join(";")}}`);
    }
    if (inner.length) out.push(`${inner.join(",")}{${body}}`);
  }
  return out.join("\n");
}

/** A variable's value with var() references followed (a few steps). */
function resolve(vars: Map<string, string>, v: string | undefined, depth = 0): string | undefined {
  if (v === undefined || depth > 4) return v;
  const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)$/.exec(v.trim());
  return m ? (resolve(vars, vars.get(m[1]!.toLowerCase()), depth + 1) ?? m[2]?.trim()) : v;
}

const firstVar = (vars: Map<string, string>, names: RegExp, not?: RegExp) => [...vars.keys()].find((k) => names.test(k) && !(not && not.test(k)));

/**
 * The brand's variables feeding the booking page's own (--clr-*, --cb-dot), so the parts the brand doesn't style
 * (the month's days, focus rings, the dots) still take its colors. !important, so they beat the theme set inline.
 * The main color is skipped when it can't be seen on the brand's background (a dark brand on its light page).
 */
export function bridgeVars(vars: Map<string, string>): string {
  const out: string[] = [];
  const has = (k: string) => vars.has(k);
  const set = (to: string, from: string) => out.push(`${to}:var(${from})!important`);
  const bg = cleanColor(resolve(vars, vars.get("--brand-bg"))) ?? "#ffffff";
  if (has("--brand-primary")) {
    const p = cleanColor(resolve(vars, vars.get("--brand-primary")));
    if (!p || contrast(p.slice(0, 7), bg.slice(0, 7)) >= 2.5) {
      set("--clr-accent", "--brand-primary");
      set("--clr-btn-bg", "--brand-primary");
      set("--cb-dot", "--brand-primary");
      if (p) out.push(`--clr-btn-text:${contrast(p.slice(0, 7), "#ffffff") >= contrast(p.slice(0, 7), "#0a0a0a") ? "#ffffff" : "#0a0a0a"}!important`);
    }
  }
  const pairs: [string, string][] = [
    ["--brand-text", "--clr-text"],
    ["--brand-muted", "--clr-muted"],
    ["--brand-bg", "--clr-bg"],
    ["--brand-line", "--clr-border"],
    ["--brand-surface", "--clr-input-bg"],
    ["--brand-radius", "--clr-radius"],
  ];
  for (const [from, to] of pairs) if (has(from)) set(to, from);
  const font = firstVar(vars, /^--brand-font(?:-(?:body|sans|family|text))?$/) ?? firstVar(vars, /font/, /heading|display|title|mono|size|weight/);
  const head = firstVar(vars, /^--brand-(?:heading|display|title)(?:-font)?$|^--brand-font-(?:heading|display|title)$/) ?? font;
  if (font) set("--clr-font", font);
  if (head) set("--clr-heading-font", head);
  return out.length ? `${SCOPE}{${out.join(";")}}` : "";
}

/**
 * The brand's stylesheet for a booking page: cleaned (cleanPageCss), comments out, every rule scoped to .cb-brand
 * with the brand's classes on the booking parts, its variables bridged, then Claritia's sizing guards. Google Fonts
 * @imports come back as links. Empty when there's nothing to draw.
 */
export function bookBrandCss(raw: string | null | undefined): { css: string; fonts: string[] } {
  const clean = cleanPageCss(String(raw ?? "")).replace(/\/\*[\s\S]*?(?:\*\/|$)/g, "");
  if (!clean.trim()) return { css: "", fonts: [] };
  const fonts: string[] = [];
  const vars = new Map<string, string>();
  const rules = scopeRules(clean, fonts, vars, true);
  if (!rules.trim()) return { css: "", fonts };
  return { css: [rules, bridgeVars(vars), GUARDS].filter(Boolean).join("\n"), fonts };
}

/** What a booking page draws with, from the plan and the kit's stylesheet: nothing on Free or without one. */
export function bookBrand(plan: unknown, studioCss: string | null | undefined): BookBrand {
  const paid = brandPlan(plan);
  return paid ? { paid, ...bookBrandCss(studioCss) } : { paid, css: "", fonts: [] };
}

/**
 * A booking page's shell: the kit or Claritia's look, with the page's accent and buttons (look.ts). The kit, the
 * brand's stylesheet and a hidden badge are on paid plans; on Free the page is Claritia's look with the badge on,
 * whatever the page saved, so a downgrade falls back by itself.
 */
export function pageShell(t: { kit: { tokens: Record<string, unknown>; logo_url: string | null; design?: unknown }; look: PageLook; brand?: BookBrand }) {
  const paid = t.brand?.paid === true;
  // The brand sets its own colors and corners, so the old accent and button choices no longer apply.
  const base: PageLook = { ...t.look, accent: "emerald", buttons: undefined };
  const look: PageLook = paid ? base : { ...base, look: "claritia", badge: true };
  // The kit the page picked (read with the plan), else the one the page's read found.
  const k = (paid && t.brand?.kit) || t.kit;
  const kit = usesKit(look, !!k.tokens && Object.keys(k.tokens).length > 0);
  const l = lookTokens(look, k.tokens);
  const brand = kit && t.brand?.css ? { css: t.brand.css, fonts: t.brand.fonts } : undefined;
  return { tokens: l.tokens, design: kit ? k.design : undefined, vars: l.vars, badge: look.badge, logo: kit ? k.logo_url : null, brand };
}
