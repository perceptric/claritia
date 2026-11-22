// The look an email takes from its brand kit, and Claritia's own calm look for a workspace with no brand yet
// (docs/brand.md: dark text, a dark pill button, Claritia green as the one accent). Every place an email is drawn
// (the template gallery, the builder, the canvas, the send) reads its tokens here, so they all match.

import { cleanTokens, type Tokens } from "../../forms/brand.ts";

export const EMAIL_LOOK: Partial<Tokens> = {
  font: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  text: "#171717",
  muted: "#737373",
  background: "#ffffff",
  inputBg: "#fafafa",
  border: "#ebebeb",
  // Claritia green, the strong one: the lighter #0c8c5e falls just short of 4.5:1 for small words on white.
  accent: "#0a7a52",
  buttonBg: "#171717",
  buttonText: "#ffffff",
  buttonRadius: 60,
  buttonWeight: 600,
  radius: 10,
};

/** Whether a kit has a look of its own (the brand read found something). */
export const hasLook = (tokens: unknown) => !!tokens && typeof tokens === "object" && Object.keys(tokens as object).length > 0;

/** The tokens an email is drawn with: the kit's, else Claritia's calm look. */
export function emailTokens(kitTokens: unknown): Tokens {
  return cleanTokens((hasLook(kitTokens) ? kitTokens : EMAIL_LOOK) as object).tokens;
}

// Two colors email can't mix at render time, worked out here: a soft wash of the accent for bands and tiles, and a
// light neutral surface for cards. Light only: emails change for dark mode only where a style says so, and mail apps
// that darken emails on their own darken these with the rest.

const hex = (v: string | undefined): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{6})/i.exec((v ?? "").trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const out = (c: number[]) => `#${c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("")}`;

/** `a` laid over `b` at `share` (0 to 1), as #rrggbb. Falls back to `b`, then to a light gray, when they aren't hex. */
export function mix(a: string | undefined, b: string | undefined, share: number): string {
  const x = hex(a);
  const y = hex(b);
  if (!y) return "#f5f5f5";
  if (!x) return out(y);
  return out([0, 1, 2].map((i) => x[i]! * share + y[i]! * (1 - share)));
}

/** How light a hex color is, 0 to 1 (relative luminance). */
export function lightness(v: string | undefined): number {
  const c = hex(v);
  if (!c) return 0;
  const [r, g, b] = c.map((x) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** The dark email's own page and email colors (the templates' dark rules use them as they are). */
export const DARK = { page: "#111111", email: "#1c1c1c", title: "#f2f2f2", text: "#e4e4e4", muted: "#a3a3a3", card: "#262626", line: "#333333" };

/**
 * The soft accent tint and the neutral surface for a brand's colors, and their dark versions: the tint on the dark
 * email, and the accent lifted where it's too dark to read there.
 */
export function washes(t: { accent?: string; text?: string; background?: string; buttonBg?: string; buttonText?: string }): {
  tint: string;
  surface: string;
  tintDark: string;
  accentDark: string;
  buttonBgDark: string;
  buttonTextDark: string;
} {
  const bg = t.background ?? "#ffffff";
  const accent = hex(t.accent) ? t.accent! : "#111111";
  // A near-black button would vanish on the dark email: it turns light, with dark words.
  const flip = lightness(t.buttonBg ?? "#111111") < 0.03;
  return {
    buttonBgDark: flip ? DARK.title : (t.buttonBg ?? "#111111"),
    buttonTextDark: flip ? "#171717" : (t.buttonText ?? "#ffffff"),
    tint: mix(accent, bg, 0.08),
    surface: mix(t.text, bg, 0.035),
    tintDark: mix(accent, DARK.email, 0.18),
    accentDark: lightness(accent) < 0.18 ? mix("#ffffff", accent, 0.6) : mix(accent, "#000000", 1),
  };
}
