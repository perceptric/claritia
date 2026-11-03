// Brand setup (docs/design-system.md Part 7.1): what the scan found beyond the 22 tokens, as the design system's
// own variables and starting email styles. The palette's brand colors (the ones the tokens don't already cover),
// the heading sizes and the card shadow become variables; email headings take the site's H2 size. Social links and
// the company address are kept on the kit for the Social and Footer blocks. Everything goes through the same checks
// as hand edits; brand_scan_design (076_brand_setup.sql) never overwrites a kit's own variables or styles.

import { hex } from "../design/check.ts";
import type { Variable } from "../design/model.ts";
import { checkValue } from "../design/values.ts";
import { SOCIAL_KINDS, type SocialKind } from "../design/email/doc.ts";
import type { Tokens } from "../forms/brand.ts";
import type { BrandExtras } from "./scan.ts";

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const near = (a: string, b: string, d = 28) => {
  const [r, g, bb] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.hypot(r! - r2!, g! - g2!, bb! - b2!) < d;
};
/** Grays (white, black and in between) aren't brand colors. */
const gray = (h: string) => {
  const [r, g, b] = rgb(h);
  return Math.max(r!, g!, b!) - Math.min(r!, g!, b!) < 18;
};

/** Up to six brand colors from the palette, most used first, not grays and not ones the tokens already have. */
export function brandColors(extras: Pick<BrandExtras, "palette">, tokens: Partial<Tokens>): string[] {
  const taken = [tokens.text, tokens.background, tokens.muted, tokens.accent, tokens.buttonBg, tokens.buttonText, tokens.border, tokens.inputBg].map((t) => hex(t)).filter((x): x is string => !!x);
  const out: string[] = [];
  for (const p of extras.palette) {
    const c = hex(p.color);
    if (!c || gray(c) || taken.some((t) => near(t, c)) || out.some((o) => near(o, c))) continue;
    out.push(c);
    if (out.length >= 6) break;
  }
  return out;
}

export type BrandDesign = { variables: Variable[]; email: { heading?: string }; social: { kind: SocialKind; url: string }[]; address: string | null };

/** The scan's extras as variables and email defaults. `names` are the brief's names for the colors, in order. */
export function brandDesign(extras: BrandExtras, tokens: Partial<Tokens>, names: string[] = []): BrandDesign {
  const variables: Variable[] = brandColors(extras, tokens).map((value, i) => ({ id: `brand-${i + 1}`, name: (names[i] ?? "").trim().slice(0, 40) || `Brand ${i + 1}`, kind: "color", value }));
  for (const h of extras.headings) {
    const size = Math.round(parseFloat(h.size));
    if (size >= 12 && size <= 96) variables.push({ id: `h${h.level}-size`, name: `H${h.level} size`, kind: "length", value: `${size}px` });
  }
  // Browsers write a shadow color first ("rgba(0, 0, 0, 0.12) 0px 4px 12px 0px"); the check wants it last. Only the first shadow is kept.
  const first = (extras.shadow ?? "").split(/,(?![^(]*\))/)[0]!.trim();
  const shadow = first ? checkValue("box-shadow", first.replace(/^((?:rgba?|hsla?)\([^)]*\)|#[0-9a-f]{3,8})\s+(.+)$/i, "$2 $1")) : null;
  if (shadow && !shadow.startsWith("$") && shadow !== "none") variables.push({ id: "card-shadow", name: "Card shadow", kind: "shadow", value: shadow });
  const social = extras.social.filter((s): s is { kind: SocialKind; url: string } => SOCIAL_KINDS.includes(s.kind as SocialKind) && /^https:\/\/[^\s"'<>]{4,300}$/.test(s.url)).slice(0, 8);
  return {
    variables,
    email: variables.some((v) => v.id === "h2-size") ? { heading: "$h2-size" } : {},
    social,
    address: extras.address ? extras.address.replace(/\s+/g, " ").trim().slice(0, 300) : null,
  };
}
