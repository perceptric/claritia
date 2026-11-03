// Form styles (docs/form-templates.md, Styles). Each style sets the form's colors, fonts, corners, field look and
// layout, and some carry a drawing. The app's forms, the editor and the website's template pages all read these,
// so a style picked on the website is the style the form goes live with. Browser and server.

export type FontKey = "inter" | "dm" | "bricolage" | "fraunces" | "instrument" | "mono" | "nunito" | "outfit" | "space" | "playfair" | "lora";

export const FONTS: Record<FontKey, { family: string; css: string; google: string }> = {
  inter: { family: "Inter", css: '"Inter", ui-sans-serif, system-ui, sans-serif', google: "Inter:wght@400;500;600;700" },
  dm: { family: "DM Sans", css: '"DM Sans", ui-sans-serif, system-ui, sans-serif', google: "DM+Sans:wght@400;500;700" },
  bricolage: { family: "Bricolage Grotesque", css: '"Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif', google: "Bricolage+Grotesque:wght@400;600;800" },
  fraunces: { family: "Fraunces", css: '"Fraunces", ui-serif, Georgia, serif', google: "Fraunces:wght@400;600" },
  instrument: { family: "Instrument Serif", css: '"Instrument Serif", ui-serif, Georgia, serif', google: "Instrument+Serif:ital@0;1" },
  mono: { family: "JetBrains Mono", css: '"JetBrains Mono", ui-monospace, Menlo, monospace', google: "JetBrains+Mono:wght@400;600" },
  nunito: { family: "Nunito", css: '"Nunito", ui-rounded, system-ui, sans-serif', google: "Nunito:wght@400;600;800" },
  outfit: { family: "Outfit", css: '"Outfit", ui-sans-serif, system-ui, sans-serif', google: "Outfit:wght@400;500;700" },
  space: { family: "Space Grotesk", css: '"Space Grotesk", ui-sans-serif, system-ui, sans-serif', google: "Space+Grotesk:wght@400;500;700" },
  playfair: { family: "Playfair Display", css: '"Playfair Display", ui-serif, Georgia, serif', google: "Playfair+Display:wght@400;600" },
  lora: { family: "Lora", css: '"Lora", ui-serif, Georgia, serif', google: "Lora:wght@400;600" },
};

/** A Google Fonts address for these fonts. */
export const fontsUrl = (keys: FontKey[]) => `https://fonts.googleapis.com/css2?${[...new Set(keys)].map((k) => `family=${FONTS[k].google}`).join("&")}&display=swap`;

export type ArtKind = "orbs" | "waves" | "grid" | "blocks" | "leaves" | "confetti" | "arches" | "rays" | "stripes";

export type Theme = {
  id: string;
  name: string;
  /** A few words for the style menu. */
  mood: string;
  /** card: the form on a colored page. cover: a drawing across the top. split: a drawing beside the form. plain: no card. */
  layout: "card" | "cover" | "split" | "plain";
  font: FontKey;
  head: FontKey;
  headWeight: number;
  headItalic?: boolean;
  bg: string;
  pattern: "none" | "dots" | "grid" | "lines";
  patternColor: string;
  card: string;
  text: string;
  muted: string;
  faint: string;
  border: string;
  /** A field's border on hover. */
  hover: string;
  field: string;
  /** Picked options and the score box. */
  soft: string;
  accent: string;
  accentInk: string;
  radius: number;
  btnRadius: number;
  cardRadius: number;
  /** Border width of fields and the card. */
  bw: number;
  input: "box" | "line" | "fill";
  shadow: "none" | "soft" | "hard";
  dark?: boolean;
  art?: { kind: ArtKind; colors: string[] };
};

const t = (x: Theme) => x;

export const THEMES: Theme[] = [
  t({ id: "paper", name: "Paper", mood: "Clean and quiet", layout: "card", font: "inter", head: "inter", headWeight: 600, bg: "#f4f4f2", pattern: "dots", patternColor: "#d9d9d4", card: "#ffffff", text: "#0a0a0a", muted: "#5f5f5b", faint: "#a3a3a0", border: "#d4d4d0", hover: "#a8a8a4", field: "#ffffff", soft: "#f2f2f0", accent: "#0a0a0a", accentInk: "#ffffff", radius: 6, btnRadius: 6, cardRadius: 6, bw: 1, input: "box", shadow: "soft" }),
  t({ id: "midnight", name: "Midnight", mood: "Dark and calm", layout: "card", font: "dm", head: "dm", headWeight: 700, bg: "#070b1a", pattern: "grid", patternColor: "#141c3a", card: "#0f1630", text: "#f2f4ff", muted: "#a3acd0", faint: "#6a7399", border: "#283259", hover: "#4a5694", field: "#0b1126", soft: "#18224a", accent: "#5b8cff", accentInk: "#ffffff", radius: 10, btnRadius: 10, cardRadius: 18, bw: 1, input: "box", shadow: "soft", dark: true }),
  t({ id: "coral", name: "Coral", mood: "Warm and bold", layout: "cover", font: "bricolage", head: "bricolage", headWeight: 800, bg: "#ffe5da", pattern: "none", patternColor: "#ffd3c2", card: "#ffffff", text: "#2b1610", muted: "#7a5a4f", faint: "#b8998e", border: "#f0cfc3", hover: "#e2a693", field: "#fff8f5", soft: "#ffefe8", accent: "#ff5a36", accentInk: "#ffffff", radius: 12, btnRadius: 999, cardRadius: 22, bw: 1, input: "box", shadow: "soft", art: { kind: "orbs", colors: ["#ff7a59", "#ffb199", "#ffd166", "#ff5a36"] } }),
  t({ id: "grove", name: "Grove", mood: "Natural and calm", layout: "split", font: "inter", head: "fraunces", headWeight: 600, bg: "#1f3a2e", pattern: "none", patternColor: "#264a3a", card: "#f7f2e7", text: "#1c2a21", muted: "#5d6b60", faint: "#9aa69c", border: "#d9d2bf", hover: "#a8a08a", field: "#fffdf7", soft: "#ece6d4", accent: "#2f6b4f", accentInk: "#ffffff", radius: 8, btnRadius: 8, cardRadius: 14, bw: 1, input: "box", shadow: "soft", art: { kind: "leaves", colors: ["#2f6b4f", "#7fb38e", "#c9dfb0", "#1f3a2e"] } }),
  t({ id: "editorial", name: "Editorial", mood: "Big type, few lines", layout: "plain", font: "inter", head: "instrument", headWeight: 400, headItalic: true, bg: "#f3eee4", pattern: "none", patternColor: "#e6dfd1", card: "#f3eee4", text: "#141210", muted: "#6b655c", faint: "#a39c90", border: "#bdb4a5", hover: "#141210", field: "transparent", soft: "#e8e1d3", accent: "#141210", accentInk: "#f3eee4", radius: 0, btnRadius: 0, cardRadius: 0, bw: 1, input: "line", shadow: "none" }),
  t({ id: "terminal", name: "Terminal", mood: "Code on black", layout: "card", font: "mono", head: "mono", headWeight: 600, bg: "#030504", pattern: "grid", patternColor: "#0d1f12", card: "#07100a", text: "#d7ffe0", muted: "#7fbf8f", faint: "#4f7a5a", border: "#1c3a25", hover: "#3dff7a", field: "#040a06", soft: "#0c2414", accent: "#3dff7a", accentInk: "#03140a", radius: 0, btnRadius: 0, cardRadius: 0, bw: 1, input: "box", shadow: "none", dark: true }),
  t({ id: "bubblegum", name: "Bubblegum", mood: "Playful and round", layout: "cover", font: "nunito", head: "nunito", headWeight: 800, bg: "#ffd7ee", pattern: "dots", patternColor: "#ffc0e2", card: "#ffffff", text: "#3a0b45", muted: "#7d5288", faint: "#b897c0", border: "#ecd0f2", hover: "#c58ed4", field: "#fdf6ff", soft: "#f6e8ff", accent: "#8b3dff", accentInk: "#ffffff", radius: 16, btnRadius: 999, cardRadius: 28, bw: 1, input: "fill", shadow: "soft", art: { kind: "confetti", colors: ["#ff8fd0", "#8b3dff", "#ffd166", "#3ddcff", "#ffe8f6"] } }),
  t({ id: "tide", name: "Tide", mood: "Fresh and light", layout: "cover", font: "outfit", head: "outfit", headWeight: 700, bg: "#e1f1ff", pattern: "none", patternColor: "#cfe6fb", card: "#ffffff", text: "#0b2540", muted: "#4e6a86", faint: "#93a9bf", border: "#cfdeee", hover: "#86aedb", field: "#ffffff", soft: "#e8f3ff", accent: "#0a72ef", accentInk: "#ffffff", radius: 10, btnRadius: 10, cardRadius: 18, bw: 1, input: "box", shadow: "soft", art: { kind: "waves", colors: ["#bfe0ff", "#7fbfff", "#3a95f5", "#0a72ef"] } }),
  t({ id: "poster", name: "Poster", mood: "Loud and graphic", layout: "card", font: "space", head: "space", headWeight: 700, bg: "#ffdf3d", pattern: "none", patternColor: "#f5d22a", card: "#ffffff", text: "#000000", muted: "#333333", faint: "#777777", border: "#000000", hover: "#000000", field: "#ffffff", soft: "#fff3a8", accent: "#000000", accentInk: "#ffdf3d", radius: 0, btnRadius: 0, cardRadius: 0, bw: 2, input: "box", shadow: "hard" }),
  t({ id: "gilded", name: "Gilded", mood: "Black and gold", layout: "split", font: "inter", head: "playfair", headWeight: 600, bg: "#0c0b09", pattern: "none", patternColor: "#16140f", card: "#14120e", text: "#f6edd8", muted: "#b9ab88", faint: "#7c7158", border: "#3b3326", hover: "#d4af37", field: "#0f0e0b", soft: "#221d13", accent: "#d4af37", accentInk: "#14120e", radius: 2, btnRadius: 2, cardRadius: 4, bw: 1, input: "box", shadow: "none", dark: true, art: { kind: "rays", colors: ["#14120e", "#d4af37", "#8a6f22", "#f6edd8"] } }),
  t({ id: "lilac", name: "Lilac", mood: "Soft and friendly", layout: "card", font: "dm", head: "dm", headWeight: 700, bg: "#efeaff", pattern: "dots", patternColor: "#ddd3ff", card: "#ffffff", text: "#251c3d", muted: "#6b6188", faint: "#a59cc0", border: "#e2dbf5", hover: "#b9a8f0", field: "#f5f2ff", soft: "#efe9ff", accent: "#7c5cff", accentInk: "#ffffff", radius: 12, btnRadius: 12, cardRadius: 22, bw: 1, input: "fill", shadow: "soft" }),
  t({ id: "clay", name: "Clay", mood: "Earthy and warm", layout: "split", font: "inter", head: "lora", headWeight: 600, bg: "#e7d4bd", pattern: "none", patternColor: "#dcc6ab", card: "#fbf6ee", text: "#3b2719", muted: "#7a6352", faint: "#b39f8e", border: "#e2d3c1", hover: "#c79f80", field: "#fffdf9", soft: "#f3e8da", accent: "#c0582f", accentInk: "#ffffff", radius: 6, btnRadius: 6, cardRadius: 10, bw: 1, input: "box", shadow: "soft", art: { kind: "arches", colors: ["#e7d4bd", "#c0582f", "#e39b6b", "#7d4a2d"] } }),
  t({ id: "studio", name: "Studio", mood: "Shapes and primary colors", layout: "split", font: "space", head: "space", headWeight: 700, bg: "#ffffff", pattern: "none", patternColor: "#eeeeee", card: "#ffffff", text: "#111111", muted: "#555555", faint: "#999999", border: "#d6d6d6", hover: "#111111", field: "#ffffff", soft: "#fff0e8", accent: "#ff4d00", accentInk: "#ffffff", radius: 4, btnRadius: 4, cardRadius: 0, bw: 1, input: "box", shadow: "none", art: { kind: "blocks", colors: ["#f2ede4", "#ff4d00", "#1d4ed8", "#ffc400", "#111111"] } }),
  t({ id: "harbor", name: "Harbor", mood: "Trusted and clear", layout: "cover", font: "inter", head: "inter", headWeight: 700, bg: "#eef3fb", pattern: "none", patternColor: "#dfe8f6", card: "#ffffff", text: "#0f1f3d", muted: "#4f5f7c", faint: "#94a1b8", border: "#d3dceb", hover: "#8ea6cf", field: "#ffffff", soft: "#e9f0fd", accent: "#1e4fd8", accentInk: "#ffffff", radius: 6, btnRadius: 6, cardRadius: 10, bw: 1, input: "box", shadow: "soft", art: { kind: "grid", colors: ["#1e4fd8", "#3f6fe8", "#8fb0ff", "#ffffff"] } }),
  t({ id: "mint", name: "Mint", mood: "Bright and easy", layout: "card", font: "outfit", head: "outfit", headWeight: 700, bg: "#d9f6ea", pattern: "dots", patternColor: "#bfeeda", card: "#ffffff", text: "#0b3326", muted: "#4b6d61", faint: "#94b3a8", border: "#cfe9de", hover: "#7cc9a8", field: "#f6fffb", soft: "#e4f8ef", accent: "#0c8c5e", accentInk: "#ffffff", radius: 999, btnRadius: 999, cardRadius: 26, bw: 1, input: "box", shadow: "soft" }),
  t({ id: "retro", name: "Retro", mood: "Chunky and sunny", layout: "cover", font: "inter", head: "bricolage", headWeight: 800, bg: "#f6ead3", pattern: "none", patternColor: "#eddcbd", card: "#fffaf0", text: "#2d1b0e", muted: "#6d5442", faint: "#a99280", border: "#2d1b0e", hover: "#2d1b0e", field: "#ffffff", soft: "#fde3cf", accent: "#e4572e", accentInk: "#ffffff", radius: 10, btnRadius: 10, cardRadius: 16, bw: 2, input: "box", shadow: "hard", art: { kind: "stripes", colors: ["#f6ead3", "#e4572e", "#f3a712", "#2a9d8f", "#2d1b0e"] } }),
  t({ id: "noir", name: "Noir", mood: "Dark and elegant", layout: "plain", font: "inter", head: "instrument", headWeight: 400, bg: "#0e0e0e", pattern: "none", patternColor: "#151515", card: "#0e0e0e", text: "#f4f4f4", muted: "#a0a0a0", faint: "#6a6a6a", border: "#3a3a3a", hover: "#f4f4f4", field: "transparent", soft: "#1b1b1b", accent: "#f4f4f4", accentInk: "#0e0e0e", radius: 0, btnRadius: 999, cardRadius: 0, bw: 1, input: "line", shadow: "none", dark: true }),
  t({ id: "sunrise", name: "Sunrise", mood: "Golden and upbeat", layout: "cover", font: "nunito", head: "nunito", headWeight: 800, bg: "#fff3d1", pattern: "none", patternColor: "#ffe9ad", card: "#ffffff", text: "#3a2700", muted: "#7b6431", faint: "#b8a477", border: "#f1e2bb", hover: "#e2b85a", field: "#fffcf2", soft: "#fff3cc", accent: "#e88a00", accentInk: "#ffffff", radius: 12, btnRadius: 12, cardRadius: 20, bw: 1, input: "box", shadow: "soft", art: { kind: "rays", colors: ["#fff3d1", "#ffb627", "#ff8a00", "#ffd76a"] } }),
];

export const DEFAULT_THEME = "paper";
const BY_ID = new Map(THEMES.map((x) => [x.id, x]));
export const themeById = (id: string | undefined | null): Theme => BY_ID.get(id ?? "") ?? BY_ID.get(DEFAULT_THEME)!;
export const isTheme = (id: unknown): id is string => typeof id === "string" && BY_ID.has(id);

/** Styles that suit each industry, in turn, so a gallery of one industry still looks varied. */
const BY_INDUSTRY: Record<string, string[]> = {
  general: ["coral", "paper", "lilac", "tide", "mint", "retro", "sunrise", "bubblegum"],
  saas: ["midnight", "studio", "terminal", "harbor", "lilac", "tide"],
  agency: ["poster", "studio", "editorial", "coral", "noir"],
  consulting: ["editorial", "harbor", "noir", "clay"],
  legal: ["gilded", "editorial", "harbor", "noir"],
  accounting: ["harbor", "mint", "paper", "editorial"],
  finance: ["gilded", "midnight", "harbor", "editorial"],
  insurance: ["harbor", "tide", "mint", "paper"],
  real_estate: ["clay", "editorial", "grove", "gilded", "studio", "sunrise"],
  construction: ["poster", "retro", "clay", "studio"],
  solar: ["sunrise", "mint", "grove"],
  healthcare: ["tide", "mint", "lilac", "paper"],
  wellness: ["grove", "lilac", "clay", "sunrise"],
  fitness: ["bubblegum", "poster", "sunrise", "midnight"],
  education: ["retro", "sunrise", "lilac", "tide"],
  ecommerce: ["coral", "bubblegum", "studio", "editorial"],
  manufacturing: ["studio", "harbor", "terminal", "poster"],
  logistics: ["harbor", "midnight", "poster", "tide"],
  automotive: ["noir", "midnight", "studio", "poster"],
  hospitality: ["clay", "gilded", "coral", "grove", "sunrise"],
  events: ["bubblegum", "noir", "coral", "retro", "midnight"],
  nonprofit: ["grove", "sunrise", "coral", "tide"],
  hr: ["lilac", "mint", "paper", "tide"],
  it: ["terminal", "midnight", "harbor", "studio"],
  beauty: ["bubblegum", "lilac", "clay", "noir", "coral"],
  food: ["clay", "retro", "coral", "sunrise", "gilded"],
  creative: ["editorial", "noir", "poster", "studio"],
  coaching: ["sunrise", "grove", "lilac", "editorial"],
  pets: ["mint", "sunrise", "bubblegum", "grove"],
  faith: ["grove", "paper", "sunrise", "tide"],
  sports: ["poster", "midnight", "retro", "coral"],
  government: ["harbor", "paper", "tide", "editorial"],
  media: ["editorial", "noir", "studio", "poster"],
  retail: ["coral", "bubblegum", "studio", "retro"],
  architecture: ["studio", "editorial", "noir", "clay"],
  security: ["terminal", "midnight", "harbor", "noir"],
  agriculture: ["grove", "clay", "sunrise", "mint"],
  personal: ["lilac", "sunrise", "bubblegum", "paper", "coral"],
};

/** Each template's own style: the industry's styles in turn, in the order its templates appear. */
export function defaultThemes(templates: { id: string; industry: string }[]): Record<string, string> {
  const seen: Record<string, number> = {};
  const out: Record<string, string> = {};
  for (const x of templates) {
    const list = BY_INDUSTRY[x.industry] ?? [DEFAULT_THEME];
    const n = seen[x.industry] ?? 0;
    seen[x.industry] = n + 1;
    out[x.id] = list[n % list.length]!;
  }
  return out;
}

/** The CSS variables a form reads. */
export function themeVars(th: Theme, accent?: string): Record<string, string> {
  const a = accent && /^#[0-9a-f]{6}$/i.test(accent) ? accent : th.accent;
  return {
    "--f-bg": th.bg,
    "--f-pattern": th.patternColor,
    "--f-card": th.card,
    "--f-text": th.text,
    "--f-muted": th.muted,
    "--f-faint": th.faint,
    "--f-border": th.border,
    "--f-hover": th.hover,
    "--f-field": th.field,
    "--f-soft": th.soft,
    "--f-accent": a,
    "--f-accent-ink": accent && a !== th.accent ? inkOn(a) : th.accentInk,
    "--f-radius": `${th.radius}px`,
    "--f-btn-radius": `${th.btnRadius}px`,
    "--f-card-radius": `${th.cardRadius}px`,
    "--f-bw": `${th.bw}px`,
    "--f-font": FONTS[th.font].css,
    "--f-head": FONTS[th.head].css,
    "--f-head-weight": String(th.headWeight),
    "--f-head-style": th.headItalic ? "italic" : "normal",
    "--f-shadow-hard": th.shadow === "hard" ? `3px 3px 0 ${th.text}` : "none",
    "--f-art-bg": artBg(th),
  };
}

/** The color behind a style's drawing, to fill a panel taller than the drawing. */
export function artBg(th: Theme): string {
  if (!th.art) return th.accent;
  const c = th.art.colors;
  return ({ orbs: c[1], leaves: c[2], confetti: c[4] } as Partial<Record<ArtKind, string>>)[th.art.kind] ?? c[0]!;
}

/** Black or white text on a color, whichever reads. */
export function inkOn(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1]!, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 0.45 ? "#0c0c0b" : "#ffffff";
}

// Drawings for cover and split styles: flat shapes only, drawn from the style's colors. ---------------------------

function rand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

/** An SVG drawing for a style, sized to fill whatever box it sits in. */
export function themeArt(th: Theme): string {
  if (!th.art) return "";
  const c = th.art.colors;
  const open = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">';
  const bg = (x: string) => `<rect width="400" height="300" fill="${x}"/>`;
  let body = "";
  switch (th.art.kind) {
    case "orbs":
      body = `${bg(c[1]!)}<circle cx="330" cy="40" r="120" fill="${c[0]}"/><circle cx="60" cy="260" r="130" fill="${c[2]}"/><circle cx="220" cy="190" r="56" fill="${c[3]}"/><circle cx="130" cy="70" r="22" fill="${c[2]}"/><circle cx="360" cy="250" r="14" fill="${c[3]}"/>`;
      break;
    case "waves":
      body = `${bg(c[0]!)}<path d="M0 120 C80 90 160 150 240 120 S360 90 400 110 V300 H0Z" fill="${c[1]}"/><path d="M0 170 C90 140 170 200 260 170 S370 140 400 160 V300 H0Z" fill="${c[2]}"/><path d="M0 225 C100 195 180 255 280 225 S380 200 400 215 V300 H0Z" fill="${c[3]}"/><circle cx="320" cy="60" r="26" fill="#ffffff" opacity=".85"/>`;
      break;
    case "grid": {
      let lines = "";
      for (let x = 0; x <= 400; x += 40) lines += `<path d="M${x} 0V300" stroke="${c[1]}" stroke-width="1"/>`;
      for (let y = 0; y <= 300; y += 40) lines += `<path d="M0 ${y}H400" stroke="${c[1]}" stroke-width="1"/>`;
      body = `${bg(c[0]!)}${lines}<rect x="240" y="40" width="80" height="80" fill="${c[2]}"/><rect x="80" y="160" width="40" height="40" fill="${c[3]}"/><rect x="320" y="200" width="40" height="40" fill="${c[3]}" opacity=".5"/><circle cx="160" cy="80" r="40" fill="none" stroke="${c[3]}" stroke-width="2"/>`;
      break;
    }
    case "blocks":
      body = `${bg(c[0]!)}<circle cx="110" cy="105" r="70" fill="${c[1]}"/><rect x="200" y="40" width="130" height="130" fill="${c[2]}"/><path d="M40 300 A110 110 0 0 1 260 300Z" fill="${c[3]}"/><path d="M290 300 L360 180 L400 260 V300Z" fill="${c[4]}"/><rect x="250" y="200" width="36" height="36" fill="${c[4]}"/>`;
      break;
    case "leaves": {
      const leaf = (x: number, y: number, r: number, s: number, col: string) =>
        `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})"><path d="M0 0 C40 -60 120 -60 160 0 C120 60 40 60 0 0Z" fill="${col}"/><path d="M8 0H150" stroke="${c[3]}" stroke-width="2" opacity=".35"/></g>`;
      body = `${bg(c[2]!)}${leaf(-20, 80, 20, 1.3, c[0]!)}${leaf(150, 210, -30, 1.1, c[1]!)}${leaf(210, 40, 35, 0.9, c[0]!)}${leaf(40, 250, -10, 0.8, c[1]!)}${leaf(280, 160, 70, 0.7, c[3]!)}`;
      break;
    }
    case "confetti": {
      const r = rand(7);
      let bits = "";
      for (let i = 0; i < 46; i++) {
        const x = Math.round(r() * 400);
        const y = Math.round(r() * 300);
        const col = c[i % 4]!;
        const k = i % 3;
        bits +=
          k === 0
            ? `<circle cx="${x}" cy="${y}" r="${4 + Math.round(r() * 7)}" fill="${col}"/>`
            : k === 1
              ? `<rect x="${x}" y="${y}" width="${8 + Math.round(r() * 10)}" height="${5 + Math.round(r() * 5)}" rx="2" fill="${col}" transform="rotate(${Math.round(r() * 90)} ${x} ${y})"/>`
              : `<path d="M${x} ${y} l9 16 h-18z" fill="${col}" transform="rotate(${Math.round(r() * 120)} ${x} ${y})"/>`;
      }
      body = `${bg(c[4]!)}${bits}`;
      break;
    }
    case "arches":
      body = `${bg(c[0]!)}<path d="M60 300 V180 A90 90 0 0 1 240 180 V300Z" fill="${c[1]}"/><path d="M95 300 V185 A55 55 0 0 1 205 185 V300Z" fill="${c[2]}"/><path d="M250 300 V120 A70 70 0 0 1 390 120 V300Z" fill="${c[3]}"/><path d="M280 300 V125 A40 40 0 0 1 360 125 V300Z" fill="${c[0]}"/><circle cx="330" cy="50" r="22" fill="${c[1]}"/>`;
      break;
    case "rays": {
      let rays = "";
      for (let i = 0; i < 16; i++) {
        const a1 = (Math.PI * i) / 16;
        const a2 = (Math.PI * (i + 0.5)) / 16;
        if (i % 2) continue;
        const p = (a: number) => `${200 + Math.cos(Math.PI + a) * 420} ${300 + Math.sin(Math.PI + a) * 420}`;
        rays += `<path d="M200 300 L${p(a1)} L${p(a2)}Z" fill="${c[3]}" opacity=".55"/>`;
      }
      body = `${bg(c[0]!)}${rays}<circle cx="200" cy="300" r="120" fill="${c[1]}"/><circle cx="200" cy="300" r="80" fill="${c[2]}"/>`;
      break;
    }
    case "stripes":
      body = `${bg(c[0]!)}<g transform="rotate(-18 200 150)"><rect x="-100" y="170" width="600" height="34" fill="${c[1]}"/><rect x="-100" y="214" width="600" height="34" fill="${c[2]}"/><rect x="-100" y="258" width="600" height="34" fill="${c[3]}"/></g><circle cx="300" cy="90" r="52" fill="${c[2]}"/><circle cx="300" cy="90" r="52" fill="none" stroke="${c[4]}" stroke-width="3"/>`;
      break;
  }
  return `${open}${body}</svg>`;
}
