// The page side of scripts/studio-templates-check.ts (and scripts/guard-check.ts): a template drawn as the Studio draws
// it (its base, the style, the form's CSS after the Studio's tune, the guard last) and measured with the form check's
// own measure.
import { PAGE_BASE } from "../../src/components/app/forms/studio/studio.ts";
import { guardSheet } from "../../src/lib/studio/guard.ts";
import { guardCss } from "../../src/lib/studio/guardCss.ts";
import { AT_REST, measureWidth, type Found } from "../../src/lib/studio/measure.ts";
import { allowedFonts, brandFonts, readableCssText, writeBlock } from "../../src/lib/studio/readable.ts";

export type Page = { id: string; html: string; css: string; brand: string };
const WIDTHS = [390, 768, 1100];
// As the Studio's cssFor: imports out (fonts load from Google, not here), :root and body on the page's host.
const IMPORT = /@import\s+(?:url\(\s*(["']?)([^"')]+)\1\s*\)|(["'])([^"']+)\3)[^;\n]*;?/gi;
const onHost = (css: string) => String(css || "").replace(IMPORT, "").replace(/(^|[\s,{}])(?::root|html|body)(?=[\s,{:.[])/g, "$1:host");

async function draw(p: Page, css: string, w: number) {
  const box = document.createElement("div");
  box.style.cssText = `position:fixed;left:0;top:0;width:${w}px;height:1000px;overflow:auto`;
  document.body.append(box);
  const r = box.attachShadow({ mode: "open" });
  r.innerHTML = `<style>${PAGE_BASE}\n${onHost(guardCss(p.brand))}\n${onHost(guardCss(css))}\n${guardSheet(p.brand, css)}</style><style>${AT_REST}</style><div class="cl-root">${p.html}</div>`;
  r.querySelectorAll("[hidden]").forEach((e) => e.removeAttribute("hidden"));
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  return { box, root: r.querySelector(".cl-root") as HTMLElement };
}

/** What the measure finds on a page drawn as the Studio draws it, at each width. */
export async function measure(p: Page, css: string): Promise<Found[]> {
  const out: Found[] = [];
  const fonts = allowedFonts(p.brand, css);
  for (const w of WIDTHS) {
    const d = await draw(p, css, w);
    measureWidth(d.box, d.root, w, { fonts, out, rules: new Map() });
    d.box.remove();
  }
  return out;
}

/** The Studio's tune as a page lands: the brand's fonts and readable rules, then what the measure finds hard to read. */
export async function tune(p: Page): Promise<{ css: string; rules: number }> {
  let css = readableCssText(brandFonts(p.css, p.brand), p.brand);
  const fonts = allowedFonts(p.brand, css);
  let rules = new Map<string, string>();
  for (const w of WIDTHS) {
    const d = await draw(p, css, w);
    rules = measureWidth(d.box, d.root, w, { fonts, out: [], rules });
    d.box.remove();
  }
  if (rules.size) css = writeBlock(css, rules);
  return { css, rules: rules.size };
}

(window as unknown as { checkPage: (p: Page) => Promise<{ out: Found[]; tuned: number }> }).checkPage = async (p) => {
  const t = await tune(p);
  return { out: await measure(p, t.css), tuned: t.rules };
};
(window as unknown as { tunePage: typeof tune }).tunePage = tune;
