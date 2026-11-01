// Copying a site's look into Claritia's forms, part 1: reading it in a real browser (docs/brand-skin.md). On the
// runner, during the brand scan: the site's own buttons, inputs, choice cards, checkboxes, headings and labels, as the
// browser draws them (computed styles, the ::before and ::after layers that many sites draw buttons with, and the
// wrapper that draws an input's box), in their hover, pressed and focus states; a picture of each; and the font
// files the page loads, from its stylesheets or from scripts (FontFace). Nothing is guessed here.

import type pw from "playwright-core";

/** One style, as the browser computed it: the properties that make a control look the way it does. */
export type Style = Record<string, string>;
/** One of the site's controls: its text styles, the box that draws it, and that box in other states. */
export type Part = {
  role: "primary" | "secondary" | "input" | "check" | "card" | "heading" | "text" | "label" | "link";
  text: string;
  self: Style;
  /** Where the visible box is drawn: the element itself, its ::before or ::after layer, or a wrapper around it. */
  boxFrom: "self" | "before" | "after" | "parent";
  box: Style;
  hover?: Style;
  pressed?: Style;
  /** Changes on the element itself (a button that moves down when pressed), when its box is drawn elsewhere. */
  selfHover?: Style;
  selfPressed?: Style;
  focus?: Style;
  /** The element's picture, PNG, base64. */
  shot?: string;
};
export type Face = { family: string; weight: string; style: string; src: string };
export type SkinSource = { url: string; page: Style; parts: Part[]; faces: Face[] };

/** Runs before the page's scripts: records every font a script loads with new FontFace(). */
export const FONT_SPY = `(() => {
  const O = window.FontFace; if (!O || window.__clrFaces) return; window.__clrFaces = [];
  const W = function (family, source, d) { try { if (typeof source === "string") window.__clrFaces.push({ family: String(family), src: source, weight: String((d && d.weight) || "400"), style: String((d && d.style) || "normal") }); } catch (e) {} return new O(family, source, d); };
  W.prototype = O.prototype; window.FontFace = W;
})();`;

/** In the page: finds the controls and marks them (data-clr-part) so the runner can hover, focus and picture them. */
const FIND = () => {
  const PROPS = ["backgroundColor", "backgroundImage", "color", "fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing", "textTransform", "textAlign", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "borderTopStyle", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor", "borderRadius", "boxShadow", "textShadow", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "height", "minHeight", "outlineColor", "outlineWidth", "outlineStyle", "outlineOffset", "transition", "transform", "filter", "opacity", "cursor", "content", "position", "top", "right", "bottom", "left", "zIndex"];
  const EMPTY = new Set(["none", "normal", "auto", "rgba(0, 0, 0, 0)", "0px", "static", "visible", ""]);
  const take = (s: CSSStyleDeclaration): Record<string, string> => {
    const o: Record<string, string> = {};
    for (const k of PROPS) {
      const v = (s as unknown as Record<string, string>)[k];
      if (v && !EMPTY.has(v)) o[k] = v.slice(0, 300);
    }
    return o;
  };
  // Drawn: a fill, a picture, or a border or shadow you can see (a transparent border only makes room).
  const clear = (c: string) => c === "transparent" || /rgba\([^)]*,\s*0\)$/.test(c);
  const drawn = (s: CSSStyleDeclaration) =>
    !clear(s.backgroundColor) || s.backgroundImage !== "none" || (parseFloat(s.borderTopWidth) > 0 && !clear(s.borderTopColor)) || (parseFloat(s.borderBottomWidth) > 0 && !clear(s.borderBottomColor)) || (s.boxShadow !== "none" && !/^rgba\([^)]*,\s*0\)/.test(s.boxShadow));
  const seen = (e: Element) => {
    const r = e.getBoundingClientRect();
    const s = getComputedStyle(e);
    return r.width > 16 && r.height > 12 && r.top < 4000 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.1;
  };
  /** The box that draws a control: itself, a pseudo layer, or (for inputs) the nearest wrapper with a box. */
  const boxOf = (e: Element, input: boolean): { from: "self" | "before" | "after" | "parent"; box: Record<string, string> } => {
    const s = getComputedStyle(e);
    if (drawn(s)) return { from: "self", box: take(s) };
    for (const p of ["::before", "::after"] as const) {
      const ps = getComputedStyle(e, p);
      if (ps.content && ps.content !== "none" && drawn(ps)) return { from: p === "::before" ? "before" : "after", box: take(ps) };
    }
    if (input) {
      let up = e.parentElement;
      for (let i = 0; up && i < 3; i++, up = up.parentElement) if (drawn(getComputedStyle(up))) return { from: "parent", box: take(getComputedStyle(up)) };
    }
    return { from: "self", box: take(s) };
  };
  const text = (e: Element) => ((e as HTMLElement).innerText || (e as HTMLInputElement).placeholder || (e as HTMLInputElement).value || "").trim().replace(/\s+/g, " ").slice(0, 40);
  const parts: Record<string, unknown>[] = [];
  let n = 0;
  const add = (e: Element, role: string, input = false) => {
    const b = boxOf(e, input);
    e.setAttribute("data-clr-part", String(n++));
    parts.push({ role, text: text(e), self: take(getComputedStyle(e)), boxFrom: b.from, box: b.box });
  };
  // Buttons: filled ones are primary (the biggest first), outlined or plain ones secondary.
  const buttons = [...document.querySelectorAll("button, a, [role=button], input[type=submit], input[type=button]")].filter(seen).filter((e) => text(e).length > 1 && text(e).length < 40);
  const scored = buttons
    .map((e) => {
      const b = boxOf(e, false);
      const bg = b.box.backgroundColor || b.box.backgroundImage || "";
      const filled = !!bg && !/rgb\(255, 255, 255\)|rgba\(255, 255, 255/.test(bg);
      const r = e.getBoundingClientRect();
      return { e, filled, framed: !!b.box.borderTopWidth || !!b.box.borderBottomWidth || !!b.box.boxShadow, area: r.width * r.height };
    })
    .filter((x) => x.filled || x.framed);
  const primary = scored.filter((x) => x.filled).sort((a, b) => b.area - a.area)[0];
  const secondary = scored.filter((x) => !x.filled && x.e !== primary?.e).sort((a, b) => b.area - a.area)[0];
  if (primary) add(primary.e, "primary");
  if (secondary) add(secondary.e, "secondary");
  const input = [...document.querySelectorAll("input[type=email], input[type=text], input:not([type]), input[type=password], input[type=search], input[type=tel], textarea")].filter(seen)[0];
  if (input) add(input, "input", true);
  const check = [...document.querySelectorAll("input[type=checkbox], input[type=radio], [role=checkbox], [role=radio]")].filter((e) => seen(e) || seen(e.parentElement!))[0];
  if (check) add(seen(check) ? check : check.parentElement!, "check");
  const card = [...document.querySelectorAll("[role=radio], [role=option], label, li[role], [aria-pressed], [aria-checked]")].filter(seen).find((e) => drawn(getComputedStyle(e)) || getComputedStyle(e, "::before").content !== "none");
  if (card) add(card, "card");
  const h = [...document.querySelectorAll("h1, h2")].filter(seen)[0];
  if (h) add(h, "heading");
  const p = [...document.querySelectorAll("p")].filter(seen).find((e) => text(e).length > 20);
  if (p) add(p, "text");
  const label = [...document.querySelectorAll("label, legend, [class*=label i]")].filter(seen).find((e) => text(e).length > 1 && text(e).length < 40 && e !== card);
  if (label) add(label, "label");
  const link = [...document.querySelectorAll("p a, li a, span a")].filter(seen).find((e) => text(e).length > 2 && !scored.some((x) => x.e === e));
  if (link) add(link, "link");
  const faces: { family: string; weight: string; style: string; src: string }[] = [];
  for (const sh of [...document.styleSheets]) {
    let rules: CSSRuleList;
    try {
      rules = sh.cssRules;
    } catch {
      continue;
    }
    for (const r of [...rules]) {
      if (!(r instanceof CSSFontFaceRule)) continue;
      const st = r.style;
      const src = st.getPropertyValue("src");
      const url = /url\(["']?([^"')]+)/.exec(src)?.[1];
      if (url) faces.push({ family: st.getPropertyValue("font-family").replace(/["']/g, "").trim(), weight: st.getPropertyValue("font-weight") || "400", style: st.getPropertyValue("font-style") || "normal", src: new URL(url, sh.href || location.href).href });
    }
  }
  const spied = ((window as unknown as { __clrFaces?: { family: string; weight: string; style: string; src: string }[] }).__clrFaces ?? []).map((f) => ({ ...f, src: (/url\(["']?([^"')]+)/.exec(f.src)?.[1] ?? f.src).trim() })).map((f) => ({ ...f, src: new URL(f.src, location.href).href }));
  return { page: take(getComputedStyle(document.body)), parts, faces: [...faces, ...spied], sheets: [...document.styleSheets].map((s) => s.href).filter((x): x is string => !!x) };
};

/** In the page: the style of one marked control's box, in whatever state it's in now. */
const BOX = ([n, from]: [string, string]) => {
  const e = document.querySelector(`[data-clr-part="${n}"]`);
  if (!e) return null;
  const pseudo = from === "before" ? "::before" : from === "after" ? "::after" : null;
  const target = from === "parent" ? e.parentElement! : e;
  const s = getComputedStyle(target, pseudo);
  const o: Record<string, string> = {};
  for (const k of ["backgroundColor", "backgroundImage", "color", "borderTopColor", "borderBottomColor", "borderBottomWidth", "boxShadow", "transform", "filter", "outlineColor", "outlineWidth", "outlineStyle", "top"]) {
    const v = (s as unknown as Record<string, string>)[k];
    if (v) o[k] = v;
  }
  return o;
};

const changed = (a: Style, b: Style | null): Style | undefined => {
  if (!b) return undefined;
  const d: Style = {};
  for (const [k, v] of Object.entries(b)) if ((a[k] ?? "") !== v && !(v === "none" && !a[k]) && !(v === "rgba(0, 0, 0, 0)" && !a[k])) d[k] = v;
  return Object.keys(d).length ? d : undefined;
};

/** @font-face rules in stylesheets the page couldn't read (other sites' files): fetched and read here. */
export function facesIn(css: string, base: string): Face[] {
  const out: Face[] = [];
  for (const m of css.matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
    const body = m[1]!;
    const get = (p: string) => new RegExp(`${p}\\s*:\\s*([^;]+)`, "i").exec(body)?.[1]?.trim() ?? "";
    const url = /url\(\s*["']?([^"')]+\.(?:woff2|woff|ttf|otf)[^"')]*)/i.exec(get("src"))?.[1];
    if (!url) continue;
    try {
      out.push({ family: get("font-family").replace(/["']/g, ""), weight: get("font-weight") || "400", style: get("font-style") || "normal", src: new URL(url, base).href });
    } catch {}
  }
  return out;
}

/**
 * Read the controls on the page that's open. Hover and press each button, focus the input, and take a picture of each
 * part. `fetchCss` reads stylesheets the page itself couldn't (their @font-face rules).
 */
export async function captureParts(page: pw.Page, fetchCss: (url: string) => Promise<string | null>): Promise<SkinSource> {
  const found = (await page.evaluate(FIND)) as { page: Style; parts: Part[]; faces: Face[]; sheets: string[] };
  for (const [i, part] of found.parts.entries()) {
    const loc = page.locator(`[data-clr-part="${i}"]`).first();
    const read = (from: string) => page.evaluate(BOX, [String(i), from] as [string, string]).catch(() => null);
    const base = (await read(part.boxFrom)) ?? {};
    const own = part.boxFrom === "self" ? null : ((await read("self")) ?? {});
    if (part.role === "primary" || part.role === "secondary" || part.role === "card") {
      await loc.hover({ timeout: 2000 }).catch(() => undefined);
      await page.waitForTimeout(250);
      part.hover = changed(base, await read(part.boxFrom));
      if (own) part.selfHover = changed(own, await read("self"));
      // Pressed: the mouse held down on it (never released on it, so nothing is clicked).
      const box = await loc.boundingBox().catch(() => null);
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(150);
        part.pressed = changed(base, await read(part.boxFrom));
        if (own) part.selfPressed = changed(own, await read("self"));
        await page.mouse.move(0, 0);
        await page.mouse.up();
      }
    }
    if (part.role === "input") {
      await loc.focus({ timeout: 2000 }).catch(() => undefined);
      await page.waitForTimeout(200);
      part.focus = changed(base, await page.evaluate(BOX, [String(i), part.boxFrom] as [string, string]).catch(() => null));
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    }
    if (part.role !== "text" && part.role !== "link") {
      const shotOf = part.boxFrom === "parent" ? page.locator(`[data-clr-part="${i}"]`).locator("xpath=..").first() : loc;
      const png = await shotOf.screenshot({ timeout: 3000 }).catch(() => null);
      if (png && png.length < 400_000) part.shot = png.toString("base64");
    }
  }
  const faces = [...found.faces];
  for (const href of found.sheets.slice(0, 12)) {
    const css = await fetchCss(href).catch(() => null);
    if (css) faces.push(...facesIn(css, href));
  }
  // The fonts the controls use, once each.
  const used = new Set(found.parts.flatMap((p) => [p.self.fontFamily, p.box.fontFamily]).filter(Boolean).flatMap((f) => f!.split(",").map((x) => x.trim().replace(/["']/g, "").toLowerCase())));
  const keep = faces.filter((f, i, all) => used.has(f.family.toLowerCase()) && /^https:\/\//.test(f.src) && all.findIndex((x) => x.src === f.src) === i).slice(0, 12);
  return { url: page.url(), page: found.page, parts: found.parts, faces: keep };
}

/** The pages most likely to hold a form: sign up, contact, demo, log in, in that order. */
export function formPages(links: { href: string; text: string }[], home: string): string[] {
  const host = new URL(home).hostname.replace(/^www\./, "");
  const rank = (l: { href: string; text: string }) => {
    const t = `${l.href} ${l.text}`.toLowerCase();
    const order = [/register|sign.?up|get.?started|\bjoin\b|create.?account/, /contact|\bdemo\b|\bquote\b|\bbook(ing)?\b/, /log.?in|sign.?in/];
    const i = order.findIndex((re) => re.test(t));
    return i < 0 ? 99 : i;
  };
  return links
    .filter((l) => {
      try {
        const u = new URL(l.href);
        return /^https?:$/.test(u.protocol) && u.hostname.replace(/^www\./, "") === host && rank(l) < 99;
      } catch {
        return false;
      }
    })
    .sort((a, b) => rank(a) - rank(b))
    .map((l) => l.href.split("#")[0]!)
    .filter((h, i, all) => all.indexOf(h) === i && h !== home)
    .slice(0, 3);
}

/** When no link leads to a form: the addresses most sites keep one at. */
export const GUESS_PATHS = ["/log-in", "/login", "/signin", "/contact", "/signup"];

/** Parts from several pages, the first of each role kept (a form page fills in what the home page lacks). */
export function mergeSources(list: SkinSource[]): SkinSource | null {
  if (!list.length) return null;
  const parts: Part[] = [];
  for (const src of list) for (const p of src.parts) if (!parts.some((x) => x.role === p.role)) parts.push(p);
  const faces = list.flatMap((x) => x.faces).filter((f, i, all) => all.findIndex((y) => y.src === f.src && y.style === f.style) === i);
  return { url: list[0]!.url, page: list[0]!.page, parts, faces };
}
