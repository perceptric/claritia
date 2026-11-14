// Booking page designs (Booking page › Styling › Design): ready-made looks a page can wear when it doesn't use a brand
// kit. Each is a set of brand tokens (src/lib/forms/brand.ts, cleaned and contrast-fixed like a kit's) and a few
// page-level variables the booking styles read with fallbacks (src/components/book/styles.ts): the page's color and
// pattern, the card's border and shadow, the heading weight and the footer's colors. Claritia is today's look and sets
// nothing, so it keeps following the guest's light or dark setting; the others keep their own colors.
// Fonts come from Google Fonts only. Runs in the browser and on the server.

export type DesignId = "claritia" | "paper" | "midnight" | "mint" | "coral" | "studio" | "lilac" | "blueprint" | "bold" | "forest";

export type Design = {
  id: DesignId;
  name: string;
  /** Brand tokens for the page (empty for Claritia's own look). */
  tokens: Record<string, string | number>;
  /** Page-level variables on top of the tokens. */
  vars: Record<string, string>;
  /** The colors and font the gallery's small preview draws with. */
  swatch: { page: string; pattern?: string; patternSize?: string; card: string; text: string; accent: string; button: string; buttonText: string; font: string; weight: number; radius: number; buttonRadius: number; border?: string; shadow?: string };
};

const gf = (families: string) => `https://fonts.googleapis.com/css2?${families}&display=swap`;
const INTER = "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";

/** A card that keeps its frame on a person's page too (that page draws straight on the page color otherwise). */
const framed = (border: string, shadow: string): Record<string, string> => ({
  "--cb-card-border": border,
  "--cb-card-shadow": shadow,
  "--cb-narrow-bg": "var(--clr-bg)",
  "--cb-narrow-border": border,
  "--cb-narrow-shadow": shadow,
  "--cb-narrow-pad": "clamp(18px, 4vw, 32px)",
  "--cb-narrow-overflow": "hidden",
});

const dots = (c: string, gap = 18) => ({ img: `radial-gradient(${c} 1px, transparent 1.2px)`, size: `${gap}px ${gap}px` });
const grid = (c: string, gap = 24) => ({ img: `linear-gradient(${c} 1px, transparent 1px), linear-gradient(90deg, ${c} 1px, transparent 1px)`, size: `${gap}px ${gap}px` });

const paperDots = dots("#d9cbb4", 20);
const midnightDots = dots("#2b3666", 22);
const blueprintGrid = grid("rgba(255,255,255,0.14)", 24);
const mintDots = dots("#b5e3cc", 18);

export const DESIGNS: Record<DesignId, Design> = {
  claritia: {
    id: "claritia",
    name: "Claritia",
    tokens: {},
    vars: {},
    swatch: { page: "#f5f5f4", card: "#ffffff", text: "#111111", accent: "#059669", button: "#111111", buttonText: "#ffffff", font: INTER, weight: 600, radius: 12, buttonRadius: 999 },
  },
  paper: {
    id: "paper",
    name: "Paper",
    tokens: {
      font: INTER,
      headingFont: "Fraunces, Georgia, serif",
      fontUrl: gf("family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600"),
      background: "#fffaf1",
      inputBg: "#fffdf8",
      text: "#2b2118",
      muted: "#7a6a58",
      border: "#e3d6c3",
      accent: "#b4532a",
      buttonBg: "#2b2118",
      buttonText: "#fffaf1",
      radius: 8,
      buttonRadius: 999,
    },
    vars: { "--cb-page-bg": "#f2eadb", "--cb-page-img": paperDots.img, "--cb-page-size": paperDots.size, "--cb-h-weight": "560", "--cb-h-track": "-0.01em", ...framed("1px solid #e3d6c3", "0 1px 0 #e3d6c3, 0 24px 48px -28px rgba(80,55,20,0.35)") },
    swatch: { page: "#f2eadb", pattern: paperDots.img, patternSize: "10px 10px", card: "#fffaf1", text: "#2b2118", accent: "#b4532a", button: "#2b2118", buttonText: "#fffaf1", font: "Fraunces, Georgia, serif", weight: 560, radius: 8, buttonRadius: 999 },
  },
  midnight: {
    id: "midnight",
    name: "Midnight",
    tokens: {
      font: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif",
      fontUrl: gf("family=Plus+Jakarta+Sans:wght@400;500;600;700"),
      background: "#121a33",
      inputBg: "#18213f",
      text: "#eef1ff",
      muted: "#9aa3c7",
      border: "#2b3666",
      accent: "#8aa6ff",
      buttonBg: "#8aa6ff",
      buttonText: "#0a0f1f",
      radius: 10,
      buttonRadius: 999,
      error: "#ff8a8a",
    },
    vars: { "--cb-page-bg": "#0a0f1f", "--cb-page-img": midnightDots.img, "--cb-page-size": midnightDots.size, "--cb-h-weight": "700", "--cb-foot-text": "#8b93b8", "--cb-foot-strong": "#eef1ff", "--cb-foot-hover": "rgba(255,255,255,0.08)", ...framed("1px solid #2b3666", "0 30px 80px -30px rgba(70,100,255,0.45)") },
    swatch: { page: "#0a0f1f", pattern: midnightDots.img, patternSize: "10px 10px", card: "#121a33", text: "#eef1ff", accent: "#8aa6ff", button: "#8aa6ff", buttonText: "#0a0f1f", font: "'Plus Jakarta Sans', sans-serif", weight: 700, radius: 10, buttonRadius: 999 },
  },
  mint: {
    id: "mint",
    name: "Mint",
    tokens: {
      font: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif",
      fontUrl: gf("family=Plus+Jakarta+Sans:wght@400;500;600;700"),
      background: "#ffffff",
      text: "#0f2e22",
      muted: "#557466",
      border: "#cfe9dc",
      accent: "#0c8c5e",
      buttonBg: "#0c8c5e",
      buttonText: "#ffffff",
      radius: 14,
      buttonRadius: 999,
    },
    vars: { "--cb-page-bg": "#dff5ea", "--cb-page-img": mintDots.img, "--cb-page-size": mintDots.size, "--cb-h-weight": "700", ...framed("1px solid #cfe9dc", "0 24px 50px -28px rgba(12,140,94,0.4)") },
    swatch: { page: "#dff5ea", pattern: mintDots.img, patternSize: "9px 9px", card: "#ffffff", text: "#0f2e22", accent: "#0c8c5e", button: "#0c8c5e", buttonText: "#ffffff", font: "'Plus Jakarta Sans', sans-serif", weight: 700, radius: 14, buttonRadius: 999 },
  },
  coral: {
    id: "coral",
    name: "Coral",
    tokens: {
      font: "'DM Sans', ui-sans-serif, system-ui, sans-serif",
      fontUrl: gf("family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700"),
      background: "#ffffff",
      text: "#3a1610",
      muted: "#87574c",
      border: "#f6cfc3",
      accent: "#d9401c",
      buttonBg: "#d9401c",
      buttonText: "#ffffff",
      radius: 16,
      buttonRadius: 999,
    },
    vars: { "--cb-page-bg": "#ffe1d6", "--cb-h-weight": "700", "--cb-h-track": "-0.03em", ...framed("0", "0 2px 0 #f6cfc3, 0 30px 60px -30px rgba(217,64,28,0.45)") },
    swatch: { page: "#ffe1d6", card: "#ffffff", text: "#3a1610", accent: "#d9401c", button: "#d9401c", buttonText: "#ffffff", font: "'DM Sans', sans-serif", weight: 700, radius: 16, buttonRadius: 999 },
  },
  studio: {
    id: "studio",
    name: "Studio",
    tokens: {
      font: "'Space Grotesk', ui-sans-serif, system-ui, sans-serif",
      fontUrl: gf("family=Space+Grotesk:wght@400;500;700"),
      background: "#ffffff",
      text: "#0a0a0a",
      muted: "#5c5c5c",
      border: "#d4d4d4",
      accent: "#0a0a0a",
      buttonBg: "#0a0a0a",
      buttonText: "#ffffff",
      radius: 2,
      buttonRadius: 0,
      buttonCase: "uppercase",
    },
    vars: { "--cb-page-bg": "#0a0a0a", "--cb-h-weight": "700", "--cb-h-track": "-0.045em", "--cb-dot": "#ff4d00", "--cb-foot-text": "#8a8a8a", "--cb-foot-strong": "#ffffff", "--cb-foot-hover": "rgba(255,255,255,0.1)", ...framed("0", "none") },
    swatch: { page: "#0a0a0a", card: "#ffffff", text: "#0a0a0a", accent: "#ff4d00", button: "#0a0a0a", buttonText: "#ffffff", font: "'Space Grotesk', sans-serif", weight: 700, radius: 2, buttonRadius: 0 },
  },
  lilac: {
    id: "lilac",
    name: "Lilac",
    tokens: {
      font: "Manrope, ui-sans-serif, system-ui, sans-serif",
      fontUrl: gf("family=Manrope:wght@400;500;600;800"),
      background: "#ffffff",
      text: "#23154d",
      muted: "#6c5f95",
      border: "#ddd3ff",
      accent: "#5b3bf0",
      buttonBg: "#5b3bf0",
      buttonText: "#ffffff",
      radius: 16,
      buttonRadius: 999,
    },
    vars: { "--cb-page-bg": "#ece6ff", "--cb-h-weight": "800", "--cb-h-track": "-0.035em", ...framed("1px solid #ddd3ff", "0 30px 70px -32px rgba(91,59,240,0.45)") },
    swatch: { page: "#ece6ff", card: "#ffffff", text: "#23154d", accent: "#5b3bf0", button: "#5b3bf0", buttonText: "#ffffff", font: "Manrope, sans-serif", weight: 800, radius: 16, buttonRadius: 999 },
  },
  blueprint: {
    id: "blueprint",
    name: "Blueprint",
    tokens: {
      font: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif",
      headingFont: "'IBM Plex Mono', ui-monospace, monospace",
      fontUrl: gf("family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans:wght@400;500;600"),
      background: "#f7f9ff",
      inputBg: "#ffffff",
      text: "#0d1b44",
      muted: "#4f5d86",
      border: "#c9d4f5",
      accent: "#1f4fd1",
      buttonBg: "#1f4fd1",
      buttonText: "#ffffff",
      radius: 4,
      buttonRadius: 4,
    },
    vars: { "--cb-page-bg": "#1f4fd1", "--cb-page-img": blueprintGrid.img, "--cb-page-size": blueprintGrid.size, "--cb-h-weight": "600", "--cb-h-track": "-0.02em", "--cb-foot-text": "#c9d6ff", "--cb-foot-strong": "#ffffff", "--cb-foot-hover": "rgba(255,255,255,0.12)", ...framed("1px solid #c9d4f5", "0 24px 60px -30px rgba(5,20,80,0.6)") },
    swatch: { page: "#1f4fd1", pattern: blueprintGrid.img, patternSize: "12px 12px", card: "#f7f9ff", text: "#0d1b44", accent: "#1f4fd1", button: "#1f4fd1", buttonText: "#ffffff", font: "'IBM Plex Mono', monospace", weight: 600, radius: 4, buttonRadius: 4 },
  },
  bold: {
    id: "bold",
    name: "Bold",
    tokens: {
      font: "Archivo, ui-sans-serif, system-ui, sans-serif",
      fontUrl: gf("family=Archivo:wght@400;500;700;800"),
      background: "#fffdf5",
      inputBg: "#ffffff",
      text: "#111111",
      muted: "#4a4a4a",
      border: "#111111",
      borderWidth: 2,
      accent: "#111111",
      buttonBg: "#111111",
      buttonText: "#ffd84d",
      buttonWeight: 700,
      radius: 0,
      buttonRadius: 0,
    },
    vars: { "--cb-page-bg": "#ffd84d", "--cb-h-weight": "800", "--cb-h-track": "-0.03em", "--cb-dot": "#ff3d00", "--cb-foot-text": "#111111", "--cb-foot-strong": "#111111", "--cb-foot-hover": "rgba(0,0,0,0.08)", ...framed("2px solid #111111", "6px 6px 0 #111111") },
    swatch: { page: "#ffd84d", card: "#fffdf5", text: "#111111", accent: "#ff3d00", button: "#111111", buttonText: "#ffd84d", font: "Archivo, sans-serif", weight: 800, radius: 0, buttonRadius: 0, border: "2px solid #111111", shadow: "3px 3px 0 #111111" },
  },
  forest: {
    id: "forest",
    name: "Forest",
    tokens: {
      font: INTER,
      headingFont: "'DM Serif Display', Georgia, serif",
      fontUrl: gf("family=DM+Serif+Display&family=Inter:wght@400;500;600"),
      background: "#f6f1e4",
      inputBg: "#fbf8f0",
      text: "#13281f",
      muted: "#5d6d63",
      border: "#ddd4bf",
      accent: "#1f6b4a",
      buttonBg: "#13281f",
      buttonText: "#f6f1e4",
      radius: 12,
      buttonRadius: 999,
    },
    vars: { "--cb-page-bg": "#123d2c", "--cb-h-weight": "400", "--cb-h-track": "0", "--cb-foot-text": "#a9c2b4", "--cb-foot-strong": "#f6f1e4", "--cb-foot-hover": "rgba(255,255,255,0.1)", ...framed("0", "0 30px 70px -30px rgba(0,0,0,0.55)") },
    swatch: { page: "#123d2c", card: "#f6f1e4", text: "#13281f", accent: "#1f6b4a", button: "#13281f", buttonText: "#f6f1e4", font: "'DM Serif Display', Georgia, serif", weight: 400, radius: 12, buttonRadius: 999 },
  },
};

/** The gallery's order. */
export const DESIGN_LIST: Design[] = Object.values(DESIGNS);

export const isDesign = (v: unknown): v is DesignId => typeof v === "string" && Object.prototype.hasOwnProperty.call(DESIGNS, v);

/** Every Google Fonts stylesheet the gallery needs, once each. */
export const DESIGN_FONTS: string[] = [...new Set(DESIGN_LIST.map((d) => d.tokens.fontUrl).filter((u): u is string => typeof u === "string" && !!u))];
