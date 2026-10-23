// The booking pages' look from the customer's brand kit (docs/meetings-scheduler.md 1.8): fonts, colors and corners
// come from the kit's checked tokens (src/lib/forms/brand.ts), light or dark as the kit is. With no kit, Claritia's
// own face (Geist) on the default tokens. Every value is cleaned before it becomes CSS.

import { cleanTokens, contrast, fixContrast, tokensCss } from "../../lib/forms/brand.ts";

const GEIST = "Geist, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";

export type Theme = { vars: Record<string, string>; dark: boolean; fontUrl: string };

export function themeOf(raw: Record<string, unknown> | null | undefined): Theme {
  const given = raw && typeof raw === "object" ? raw : {};
  const { tokens } = cleanTokens({ ...given, font: given.font || GEIST });
  const fixed = fixContrast(tokens).tokens;
  const vars: Record<string, string> = {};
  for (const pair of tokensCss(fixed).split(";")) {
    const i = pair.indexOf(":");
    if (i > 0) vars[pair.slice(0, i)] = pair.slice(i + 1);
  }
  // Dark when light text reads better on the background than dark text does.
  const dark = contrast("#ffffff", fixed.background.slice(0, 7)) > contrast("#000000", fixed.background.slice(0, 7));
  return { vars, dark, fontUrl: fixed.fontUrl };
}
