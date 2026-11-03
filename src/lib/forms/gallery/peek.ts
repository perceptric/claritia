// See it in your brand (docs/form-templates-plan.md 5.3): a visitor's site, read from its page source with no AI,
// as the few values the gallery's forms take: the button color and its text, the font, the button corners and the
// logo. A value the page doesn't show clearly is left out, so the form keeps its style's own value there.

import type { RawBrand } from "../../brand/deep.ts";

export type Peek = { name: string; accent?: string; accentInk?: string; font?: string; fontUrl?: string; radius?: number; logo?: string };

const HEX = /^#[0-9a-f]{6}$/i;
const hex6 = (c?: string | null): string | null => {
  if (!c) return null;
  const s = c.trim().toLowerCase();
  if (HEX.test(s)) return s;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(s);
  if (rgb) {
    const a = rgb[4] === undefined ? 1 : rgb[4].endsWith("%") ? Number(rgb[4].slice(0, -1)) / 100 : Number(rgb[4]);
    if (a < 0.9) return null;
    return `#${[rgb[1], rgb[2], rgb[3]].map((x) => Math.min(255, Number(x)).toString(16).padStart(2, "0")).join("")}`;
  }
  return null;
};
const lum = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
/** How colorful a color is (0 gray, 1 full), so a brand color wins over the page's grays. */
const chroma = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  return (Math.max(r!, g!, b!) - Math.min(r!, g!, b!)) / 255;
};
/** Text that reads on a color: white or near black, whichever has more contrast. */
export const inkFor = (bg: string) => (contrast(bg, "#ffffff") >= contrast(bg, "#111111") ? "#ffffff" : "#111111");

const GENERIC = /^(inherit|initial|system-ui|sans-serif|serif|monospace|ui-sans-serif|ui-serif|-apple-system|blinkmacsystemfont|segoe ui|arial|helvetica|helvetica neue|roboto|times new roman|georgia)$/i;

/** The peek from a read of the home page. */
export function peekFrom(raw: RawBrand, name: string): Peek {
  const out: Peek = { name };
  // The button: the most used solid button color that isn't white, black or a near gray.
  const btn = raw.buttons
    .filter((b) => !b.gradient)
    .map((b) => ({ bg: hex6(b.bg), ink: hex6(b.color), radius: b.radius, count: b.count }))
    .filter((b): b is { bg: string; ink: string | null; radius: string | undefined; count: number } => !!b.bg && chroma(b.bg) > 0.12)
    .sort((a, b) => b.count - a.count)[0];
  const brandColor = btn?.bg ?? raw.colors.filter((c) => HEX.test(c.hex) && chroma(c.hex) > 0.25 && c.button + c.fill + c.bg > 0).sort((a, b) => b.button * 3 + b.fill + b.bg - (a.button * 3 + a.fill + a.bg))[0]?.hex.toLowerCase();
  if (brandColor) {
    out.accent = brandColor;
    out.accentInk = btn?.ink && contrast(btn.ink, brandColor) >= 3 ? btn.ink : inkFor(brandColor);
  }
  const r = btn?.radius ? parseFloat(btn.radius) : NaN;
  if (Number.isFinite(r)) out.radius = btn!.radius!.includes("%") || r >= 40 ? 999 : Math.max(0, Math.min(Math.round(r), 24));
  // The font: the most used named family that a page can load from Google Fonts.
  const fam = raw.fonts.map((f) => f.family.replace(/["']/g, "").trim()).find((f) => f && !GENERIC.test(f) && !/icon|awesome|symbol|emoji/i.test(f));
  if (fam && raw.googleFonts && raw.googleFonts.toLowerCase().includes(fam.toLowerCase().replace(/\s+/g, "+"))) {
    out.font = fam;
    out.fontUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fam).replace(/%20/g, "+")}:wght@400;500;600;700&display=swap`;
  }
  const logo = [raw.logo.src, raw.icons.touch].find((u) => !!u && /^https:\/\//.test(u));
  if (logo) out.logo = logo;
  return out;
}
