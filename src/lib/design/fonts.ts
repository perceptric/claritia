// The Google Fonts the email builder and the style panels offer, the CSS stack for each, and one stylesheet link for
// the families a design uses (checked by src/lib/forms/brand.ts cleanFont and cleanFontUrl).

export type FontDef = { name: string; cat: "sans" | "serif" | "mono" | "display"; weights: number[] };
const V = [400, 500, 600, 700];
const RB = [400, 700];
/** Popular Google Fonts. Weights are the ones each family has, so the stylesheet link never asks for one it lacks. */
export const FONTS: FontDef[] = [
  { name: "Inter", cat: "sans", weights: V },
  { name: "Roboto", cat: "sans", weights: V },
  { name: "Open Sans", cat: "sans", weights: V },
  { name: "Montserrat", cat: "sans", weights: V },
  { name: "Poppins", cat: "sans", weights: V },
  { name: "Lato", cat: "sans", weights: RB },
  { name: "Raleway", cat: "sans", weights: V },
  { name: "Nunito", cat: "sans", weights: V },
  { name: "Source Sans 3", cat: "sans", weights: V },
  { name: "Work Sans", cat: "sans", weights: V },
  { name: "DM Sans", cat: "sans", weights: V },
  { name: "Manrope", cat: "sans", weights: V },
  { name: "Plus Jakarta Sans", cat: "sans", weights: V },
  { name: "Outfit", cat: "sans", weights: V },
  { name: "Figtree", cat: "sans", weights: V },
  { name: "Rubik", cat: "sans", weights: V },
  { name: "Karla", cat: "sans", weights: V },
  { name: "Mulish", cat: "sans", weights: V },
  { name: "IBM Plex Sans", cat: "sans", weights: V },
  { name: "Space Grotesk", cat: "sans", weights: V },
  { name: "Sora", cat: "sans", weights: V },
  { name: "Lexend", cat: "sans", weights: V },
  { name: "Urbanist", cat: "sans", weights: V },
  { name: "Barlow", cat: "sans", weights: V },
  { name: "Archivo", cat: "sans", weights: V },
  { name: "Public Sans", cat: "sans", weights: V },
  { name: "Noto Sans", cat: "sans", weights: V },
  { name: "PT Sans", cat: "sans", weights: RB },
  { name: "Geist", cat: "sans", weights: V },
  { name: "Playfair Display", cat: "serif", weights: V },
  { name: "Merriweather", cat: "serif", weights: RB },
  { name: "Lora", cat: "serif", weights: V },
  { name: "Libre Baskerville", cat: "serif", weights: RB },
  { name: "EB Garamond", cat: "serif", weights: V },
  { name: "Crimson Pro", cat: "serif", weights: V },
  { name: "Fraunces", cat: "serif", weights: V },
  { name: "Source Serif 4", cat: "serif", weights: V },
  { name: "DM Serif Display", cat: "display", weights: [400] },
  { name: "Bricolage Grotesque", cat: "display", weights: V },
  { name: "Space Mono", cat: "mono", weights: RB },
  { name: "JetBrains Mono", cat: "mono", weights: V },
  { name: "IBM Plex Mono", cat: "mono", weights: V },
];
const FALLBACK: Record<FontDef["cat"], string> = { sans: "sans-serif", serif: "serif", mono: "monospace", display: "sans-serif" };
export const SYSTEM_FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";

/** The first family named in a font stack, without quotes. */
export const familyOf = (stack: string) => (stack.split(",")[0] ?? "").trim().replace(/^['"]|['"]$/g, "");
export const fontDef = (name: string) => FONTS.find((f) => f.name.toLowerCase() === name.toLowerCase());
/** A CSS stack for a family, in the shape the brand checker accepts. */
export function fontStack(name: string): string {
  const def = fontDef(name);
  const fam = /\s/.test(name) ? `'${name}'` : name;
  return `${fam}, ${def ? FALLBACK[def.cat] : "sans-serif"}`;
}
/** One Google Fonts stylesheet for the families picked; "" when none come from Google. */
export function fontUrl(names: string[]): string {
  const defs = [...new Set(names.map((n) => fontDef(n)).filter((d): d is FontDef => !!d))];
  if (!defs.length) return "";
  const fam = defs.map((d) => `family=${d.name.replace(/ /g, "+")}:wght@${d.weights.join(";")}`).join("&");
  return `https://fonts.googleapis.com/css2?${fam}&display=swap`;
}
/** A tiny stylesheet with just the letters of each name, so the picker can show every font in itself. */
export function previewFontsUrl(): string {
  const letters = [
    ...new Set(
      FONTS.map((f) => f.name)
        .join("")
        .replace(/\s/g, ""),
    ),
  ]
    .sort()
    .join("");
  return `https://fonts.googleapis.com/css2?${FONTS.map((f) => `family=${f.name.replace(/ /g, "+")}`).join("&")}&text=${encodeURIComponent(letters)}&display=swap`;
}
