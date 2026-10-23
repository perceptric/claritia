// The brand scan (docs/form-builder.md 5.1). A real browser loads the site's home page and its contact or demo page,
// and reads computed styles: what visitors actually see after every stylesheet, theme and framework has run, which
// is more exact than reading CSS files. What comes back is the fixed token list (src/lib/forms/brand.ts), checked and
// fixed for contrast, plus the forms found on the site for the chat to read. Runs in the runner (playwright-core).

import pw from "playwright-core";
import { cleanColor, cleanFontUrl, cleanTokens, contrast, fixContrast, type Tokens } from "../forms/brand.ts";
import { hostIsPrivate } from "../privateNet.ts";

export type SiteForm = { url: string; fields: { label: string; type: string }[]; button?: string };
export type Scan = { tokens: Tokens; notes: string[]; logo: string | null; forms: SiteForm[]; formShot: Buffer | null; pages: string[] };
export class ScanBlocked extends Error {}

type Raw = {
  blocked: boolean;
  font: string;
  headingFont: string;
  fontSize: string;
  text: string;
  background: string;
  muted: string | null;
  link: string | null;
  button: { bg: string; color: string; radius: string; weight: string; transform: string } | null;
  input: { bg: string; border: string; borderWidth: string; radius: string; height: string } | null;
  label: { size: string; weight: string; position: "above" | "inside" } | null;
  gap: number | null;
  vars: Record<string, string>;
  fontUrl: string | null;
  logo: string | null;
  forms: SiteForm[];
  ctas: string[];
};

/** Runs in the page. Plain JavaScript only: it's serialized into the browser. */
const READ = () => {
  const vis = (el: Element) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 2 && r.height > 2 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.1;
  };
  const css = (el: Element) => getComputedStyle(el);
  const clear = (c: string) => c === "transparent" || /rgba\([^)]*,\s*0\)$/.test(c);
  const text = (document.title + " " + (document.body?.innerText ?? "").slice(0, 2000)).toLowerCase();
  const blocked = /just a moment|attention required|access denied|verify you are (a )?human|captcha|are you a robot|enable javascript and cookies/.test(text) && (document.body?.innerText ?? "").length < 3000;
  const body = document.body;
  let background = css(body).backgroundColor;
  if (clear(background)) background = css(document.documentElement).backgroundColor;
  if (clear(background)) {
    const main = document.querySelector("main, #__next > div, #root > div, body > div");
    background = main && !clear(css(main).backgroundColor) ? css(main).backgroundColor : "rgb(255, 255, 255)";
  }
  const paras = [...document.querySelectorAll("p")].filter(vis).sort((a, b) => (b.textContent ?? "").length - (a.textContent ?? "").length);
  const p = paras[0] ?? body;
  const heading = [...document.querySelectorAll("h1, h2")].find(vis);
  // Gray text: the most used color on short text that isn't the body text.
  const counts = new Map<string, number>();
  for (const el of [...document.querySelectorAll("p, span, li, small, figcaption")].filter(vis).slice(0, 400)) {
    const c = css(el).color;
    if (c !== css(p).color) counts.set(c, (counts.get(c) ?? 0) + (el.textContent ?? "").length);
  }
  const muted = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const link = [...document.querySelectorAll("p a, li a")].find(vis);
  // The primary button: filled, not the page color, scored by call-to-action words, size and how often its color repeats.
  const CTA = /demo|contact|start|sign ?up|get started|talk|book|try|request|subscribe|join/i;
  const cands = [...document.querySelectorAll("button, a, [role=button], input[type=submit]")].filter(vis).filter((el) => {
    const s = css(el);
    return !clear(s.backgroundColor) && s.backgroundColor !== background && el.getBoundingClientRect().height < 90 && (el.textContent ?? (el as HTMLInputElement).value ?? "").trim().length < 40;
  });
  const colorUse = new Map<string, number>();
  for (const el of cands) colorUse.set(css(el).backgroundColor, (colorUse.get(css(el).backgroundColor) ?? 0) + 1);
  const score = (el: Element) => (CTA.test(el.textContent ?? (el as HTMLInputElement).value ?? "") ? 5 : 0) + (colorUse.get(css(el).backgroundColor) ?? 0) + Math.min(el.getBoundingClientRect().width / 100, 3);
  const btn = cands.sort((a, b) => score(b) - score(a))[0];
  const inputs = [...document.querySelectorAll("input[type=text], input[type=email], input:not([type]), textarea")].filter(vis);
  const input = inputs[0];
  const label = [...document.querySelectorAll("form label")].find(vis);
  let gap: number | null = null;
  if (inputs.length > 1) {
    const a = inputs[0].getBoundingClientRect();
    const b = inputs[1].getBoundingClientRect();
    if (b.top > a.bottom) gap = Math.round(b.top - a.bottom - (label ? label.getBoundingClientRect().height + 6 : 0));
  }
  const vars: Record<string, string> = {};
  for (const sheet of [...document.styleSheets]) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const r of [...rules]) {
      const sr = r as CSSStyleRule;
      if (!sr.selectorText || !/^(:root|html|body)$/.test(sr.selectorText.trim())) continue;
      for (const name of [...sr.style]) if (name.startsWith("--") && Object.keys(vars).length < 200) vars[name] = sr.style.getPropertyValue(name).trim();
    }
  }
  const logoEl = document.querySelector("header img[alt*=logo i], header img[src*=logo i], img[alt*=logo i], img[class*=logo i], header img");
  const forms: { url: string; fields: { label: string; type: string }[]; button?: string }[] = [];
  for (const f of [...document.querySelectorAll("form")].filter(vis).slice(0, 3)) {
    const fields: { label: string; type: string }[] = [];
    for (const el of [...f.querySelectorAll("input, select, textarea")].slice(0, 30)) {
      const i = el as HTMLInputElement;
      const t = el.tagName === "SELECT" ? "choice" : el.tagName === "TEXTAREA" ? "textarea" : (i.type || "text").toLowerCase();
      if (["hidden", "submit", "button", "password", "image", "reset", "file"].includes(t) || !vis(el)) continue;
      const lab = (i.labels?.[0]?.textContent || i.getAttribute("aria-label") || i.placeholder || i.name || "").replace(/\s+/g, " ").trim().slice(0, 80);
      fields.push({ label: lab, type: t });
    }
    const sub = f.querySelector("button[type=submit], button:not([type]), input[type=submit]") as HTMLInputElement | null;
    if (fields.length) forms.push({ url: location.href.split("#")[0].split("?")[0], fields, button: ((sub?.textContent || sub?.value || "").trim().slice(0, 40)) || undefined });
  }
  const ctas = [...document.querySelectorAll("a[href]")]
    .filter((a) => vis(a) && (a as HTMLAnchorElement).host === location.host && /contact|demo|sales|get-started|signup|sign-up|book|talk|request/i.test(((a as HTMLAnchorElement).pathname || "") + " " + (a.textContent || "")))
    .map((a) => (a as HTMLAnchorElement).href.split("#")[0]);
  return {
    blocked,
    font: css(p).fontFamily,
    headingFont: heading ? css(heading).fontFamily : "",
    fontSize: css(p).fontSize,
    text: css(p).color,
    background,
    muted,
    link: link ? css(link).color : null,
    button: btn ? { bg: css(btn).backgroundColor, color: css(btn).color, radius: css(btn).borderTopLeftRadius, weight: css(btn).fontWeight, transform: css(btn).textTransform } : null,
    input: input ? { bg: css(input).backgroundColor, border: css(input).borderTopColor, borderWidth: css(input).borderTopWidth, radius: css(input).borderTopLeftRadius, height: String(input.getBoundingClientRect().height) } : null,
    label: label ? { size: css(label).fontSize, weight: css(label).fontWeight, position: "above" as const } : input && (input as HTMLInputElement).placeholder ? { size: css(input).fontSize, weight: "400", position: "inside" as const } : null,
    gap,
    vars,
    fontUrl: (document.querySelector('link[href*="fonts.googleapis.com/css"]') as HTMLLinkElement | null)?.href ?? null,
    logo: logoEl ? ((logoEl as HTMLImageElement).currentSrc || (logoEl as HTMLImageElement).src || null) : null,
    forms,
    ctas: [...new Set(ctas)].slice(0, 10),
  };
};

const px = (v: string | undefined | null) => (v ? Math.round(parseFloat(v)) : NaN);
/** "Inter, sans-serif" stays; a quoted family is kept as written; anything odd is dropped by cleanTokens. */
const family = (f: string) => f.replace(/\s+/g, " ").trim().slice(0, 200);

/** The tokens a page's styles add up to. The form page's fields and labels win over the home page's. */
export function tokensFrom(home: Raw, form: Raw | null): { tokens: Tokens; notes: string[] } {
  const field = form?.input ? form : home;
  const notes: string[] = [];
  const bg = cleanColor(home.background) ?? "#ffffff";
  const btn = home.button ?? form?.button ?? null;
  const varColor = (re: RegExp) => Object.entries({ ...home.vars, ...(form?.vars ?? {}) }).find(([k, v]) => re.test(k) && cleanColor(v))?.[1];
  const raw: Record<string, unknown> = {
    font: family(home.font),
    headingFont: home.headingFont && home.headingFont !== home.font ? family(home.headingFont) : "",
    fontUrl: cleanFontUrl(home.fontUrl ?? "") ?? "",
    fontSize: px(home.fontSize),
    text: home.text,
    muted: home.muted && cleanColor(home.muted) && contrast(cleanColor(home.muted)!.slice(0, 7), bg.slice(0, 7)) < contrast((cleanColor(home.text) ?? "#000000").slice(0, 7), bg.slice(0, 7)) ? home.muted : undefined,
    background: bg,
    accent: home.link ?? btn?.bg,
    error: varColor(/error|danger|destructive|red/i),
  };
  if (btn) Object.assign(raw, { buttonBg: btn.bg, buttonText: btn.color, buttonRadius: px(btn.radius), buttonWeight: Number(btn.weight) || 500, buttonCase: btn.transform === "uppercase" ? "uppercase" : "none" });
  else notes.push("No filled button found; the button uses the text color.");
  if (field.input) {
    const ib = cleanColor(field.input.bg);
    Object.assign(raw, { inputBg: ib && ib.length === 7 ? ib : bg, border: field.input.border, borderWidth: px(field.input.borderWidth), radius: px(field.input.radius), inputHeight: px(field.input.height) });
  } else {
    notes.push("No form fields found on the site; field shapes follow the button.");
    if (btn) Object.assign(raw, { radius: Math.min(px(btn.radius), 12) });
  }
  if (field.label) Object.assign(raw, { labelSize: px(field.label.size), labelWeight: Number(field.label.weight) || 500 });
  if (field.gap !== null && field.gap !== undefined && field.gap > 0) raw.gap = field.gap;
  if (!btn) Object.assign(raw, { buttonBg: raw.text, buttonText: bg });
  const clean = cleanTokens(raw);
  for (const d of clean.dropped) if (d === "font") notes.push("The site's font name couldn't be used; the form uses a system font.");
  const fixed = fixContrast(clean.tokens);
  return { tokens: fixed.tokens, notes: [...notes, ...fixed.notes] };
}

/**
 * Scan a site. Throws ScanBlocked when the site turns the browser away (a bot wall, an error page, a private address).
 * `allowPrivate` is for tests on localhost only.
 */
export async function scanSite(rawUrl: string, opts: { chromiumPath?: string; allowPrivate?: boolean; timeoutMs?: number } = {}): Promise<Scan> {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
  } catch {
    throw new ScanBlocked("That isn't a site address.");
  }
  if (!/^https?:$/.test(u.protocol) || u.username) throw new ScanBlocked("That isn't a site address.");
  if (!opts.allowPrivate && (await hostIsPrivate(u.hostname))) throw new ScanBlocked("That address is on a private network.");
  const browser = await pw.chromium.launch({ headless: true, executablePath: opts.chromiumPath || undefined, args: ["--disable-dev-shm-usage"] });
  const timeout = opts.timeoutMs ?? 25_000;
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, userAgent: "Mozilla/5.0 (compatible; ClaritiaBrandScan/1; +https://tryclaritia.com)" });
    // Never let the page reach private addresses while it loads.
    if (!opts.allowPrivate)
      await ctx.route("**/*", async (route) => {
        const host = new URL(route.request().url()).hostname;
        if (await hostIsPrivate(host)) return route.abort();
        return route.continue();
      });
    const page = await ctx.newPage();
    const visit = async (href: string): Promise<Raw> => {
      const res = await page.goto(href, { waitUntil: "load", timeout });
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
      await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
      const r = (await page.evaluate(READ)) as Raw;
      if (res && res.status() >= 400 && !r.forms.length) r.blocked = r.blocked || res.status() === 403 || res.status() === 503;
      return r;
    };
    const home = await visit(u.href);
    if (home.blocked) throw new ScanBlocked("The site turned the scan away. Set the colors and font in Design.");
    const pages = [page.url()];
    // The page most likely to hold a form: contact or demo first.
    const next = home.ctas.sort((a, b) => Number(/contact|demo/i.test(b)) - Number(/contact|demo/i.test(a)))[0];
    let formPage: Raw | null = null;
    let formShot: Buffer | null = null;
    if (next && next !== pages[0]) {
      try {
        formPage = await visit(next);
        if (formPage.blocked) formPage = null;
        else pages.push(page.url());
      } catch {
        formPage = null;
      }
    }
    const withForm = formPage?.forms.length ? formPage : home.forms.length ? home : null;
    if (withForm) {
      if (withForm === home && formPage) await page.goto(pages[0], { waitUntil: "load", timeout }).catch(() => undefined);
      const el = page.locator("form").first();
      formShot = await el.screenshot({ timeout: 5000 }).catch(() => null);
    }
    const { tokens, notes } = tokensFrom(home, formPage);
    const forms = [...home.forms, ...(formPage?.forms ?? [])].slice(0, 5);
    const logo = home.logo && /^https:\/\//.test(home.logo) ? home.logo.slice(0, 1000) : null;
    return { tokens, notes, logo, forms, formShot, pages };
  } finally {
    await browser.close().catch(() => undefined);
  }
}
