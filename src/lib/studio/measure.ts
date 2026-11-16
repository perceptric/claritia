// The form check's measure of a drawn page (docs/studio-v2-plan.md 6.5 and Part 16), shared by the Studio
// (studio.ts, layoutFor) and the template check (scripts/studio-templates-check.ts), so both read a page the same way:
// sideways scroll at each width, text that's hard to read, and at phone width choices the keyboard can't reach, text
// cut off, taps smaller than a finger and fonts that aren't the brand's. A safety net: the guard and the Studio's tune
// make these right, so on a page they've seen it finds nothing. Browser only.

import { fontAllowed, readableRules, textLooks } from "./readable.ts";

export type Found = { level: "error" | "warning"; code: string; text: string };
const WHERE: Record<number, string> = { 390: "a phone", 768: "a tablet", 1100: "a desktop" };

/** Hidden render styles that measure a page at rest: a page sliding in would read as wider than it is. */
export const AT_REST = "*,*::before,*::after{animation:none!important;transition:none!important}";

/**
 * One width of a drawn page: `box` holds it (`w` px wide) and `root` is its .cl-root. `label` names another language
 * (only sideways and cut-off text are measured then); `fonts` are the fonts it may use (null: any). `rules` gathers
 * the readable rules for what's hard to read, merged across widths; `out` gathers what's found.
 */
export function measureWidth(box: HTMLElement, root: HTMLElement, w: number, o: { label?: string; fonts: Set<string> | null; out: Found[]; rules: Map<string, string> }): Map<string, string> {
  const { out, label = "" } = o;
  const where0 = label ? `In ${label}, ` : "";
  let rules = o.rules;
  if (Math.max(box.scrollWidth, root.scrollWidth) > w + 2) out.push({ level: w <= 390 ? "error" : "warning", code: "sideways", text: `${where0}the form scrolls sideways on ${WHERE[w] ?? `a screen ${w}px wide`} (${w}px wide).`.replace(/^t/, "T") });
  if (!label) {
    const looks = textLooks(root);
    rules = readableRules(looks, root, rules);
    let low = out.filter((i) => i.code === "contrast").length;
    for (const t of looks) if (t.ratio < t.min && low < 2 && !out.some((i) => i.code === "contrast" && i.text.startsWith(`"${t.text}"`))) { low++; out.push({ level: "warning", code: "contrast", text: `"${t.text}" is hard to read (contrast ${t.ratio.toFixed(1)} to 1).` }); }
  }
  if (w > 390) return rules;
  const win = root.ownerDocument.defaultView ?? window;
  const cs0 = (e: Element) => win.getComputedStyle(e);
  // Choice cards whose own radio or check box is removed can't be reached with the keyboard.
  const gone = [...root.querySelectorAll('input[type="radio"],input[type="checkbox"]')].find((x) => { const cs = cs0(x); return cs.display === "none" || cs.visibility === "hidden"; });
  if (gone && !label) out.push({ level: "warning", code: "keyboard", text: "Some choices can't be reached with the keyboard: their radio or check box is removed." });
  let clipped = false, small = false, font = "";
  for (const el of [...root.querySelectorAll("h1,h2,h3,h4,p,label,span,button,a,legend,li,strong,b,small")].slice(0, 300)) {
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
    const rect = el.getBoundingClientRect();
    if (!own || !rect.width || !rect.height) continue;
    const cs = cs0(el);
    if (!clipped && /hidden|clip/.test(cs.overflow + cs.overflowX) && el.scrollWidth > el.clientWidth + 1) { clipped = true; out.push({ level: "warning", code: "clipped", text: `${where0}"${el.textContent!.trim().slice(0, 40)}" is cut off on a phone.` }); }
    if (label) continue;
    // Taps: buttons, links that act as buttons, and choices.
    const tap = el.tagName === "BUTTON" || el.matches("a.btn, a.btn-secondary, [role=button], label:has(input[type=radio], input[type=checkbox])");
    if (!small && tap && rect.height < 43.5) { small = true; out.push({ level: "warning", code: "small-tap", text: `"${el.textContent!.trim().slice(0, 30)}" is smaller than a finger on a phone (${Math.round(rect.height)}px tall).` }); }
    const fam = (cs.fontFamily.split(",")[0] || "").replace(/["']/g, "").trim();
    if (!font && o.fonts && !fontAllowed(fam, o.fonts)) { font = fam; out.push({ level: "warning", code: "font", text: `Uses the font ${fam}, which isn't the brand's.` }); }
  }
  return rules;
}
