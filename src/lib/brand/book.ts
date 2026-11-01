// The brand book (docs/brand-capture.md): Claude reads the deep read (deep.ts) and writes the brand as a guide:
// colors by role, the type, the buttons, corners and shadow, imagery, voice and a few rules. Every color and font in
// it must be one the site actually uses; anything else is dropped. The book sets the kit's tokens, so forms and
// booking pages wear it, and the AI form builder reads it to write in the brand's voice.

import { cleanTokens, contrast, type Tokens } from "../forms/brand.ts";
import type { FontFace, RawBrand } from "./deep.ts";
import { toHex } from "./quick.ts";

export const BOOK_MODEL = "claude-sonnet-5-5";

export type ColorRole = "primary" | "secondary" | "accent" | "background" | "surface" | "text" | "muted" | "border" | "dark";
export type BrandBook = {
  name: string;
  tagline: string;
  colors: { hex: string; role: ColorRole; name: string }[];
  type: {
    heading: { family: string; weight: string };
    body: { family: string; weight: string };
    scale: { role: "h1" | "h2" | "h3" | "body"; size: string; weight: string; lineHeight: string; letterSpacing: string }[];
  };
  buttons: { primary: { bg: string; text: string; radius: number; gradient: string | null }; secondary: { bg: string; text: string; border: string; radius: number } | null };
  corners: number;
  shadow: string | null;
  imagery: string;
  voice: { tone: string; words: string[]; avoid: string[]; ctas: string[] };
  rules: string[];
};

const ROLES: ColorRole[] = ["primary", "secondary", "accent", "background", "surface", "text", "muted", "border", "dark"];
const SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    tagline: { type: "string", description: "Their own line from the site, or their offer in under 10 words." },
    colors: {
      type: "array",
      items: { type: "object", properties: { hex: { type: "string" }, role: { type: "string", enum: ROLES }, name: { type: "string", description: "Two words at most, like Momos red." } }, required: ["hex", "role", "name"], additionalProperties: false },
    },
    type: {
      type: "object",
      properties: {
        heading: { type: "object", properties: { family: { type: "string" }, weight: { type: "string" } }, required: ["family", "weight"], additionalProperties: false },
        body: { type: "object", properties: { family: { type: "string" }, weight: { type: "string" } }, required: ["family", "weight"], additionalProperties: false },
        scale: {
          type: "array",
          items: { type: "object", properties: { role: { type: "string", enum: ["h1", "h2", "h3", "body"] }, size: { type: "string" }, weight: { type: "string" }, lineHeight: { type: "string" }, letterSpacing: { type: "string" } }, required: ["role", "size", "weight", "lineHeight", "letterSpacing"], additionalProperties: false },
        },
      },
      required: ["heading", "body", "scale"],
      additionalProperties: false,
    },
    buttons: {
      type: "object",
      properties: {
        primary: { type: "object", properties: { bg: { type: "string" }, text: { type: "string" }, radius: { type: "number" }, gradient: { type: ["string", "null"] } }, required: ["bg", "text", "radius", "gradient"], additionalProperties: false },
        secondary: { type: ["object", "null"], properties: { bg: { type: "string" }, text: { type: "string" }, border: { type: "string" }, radius: { type: "number" } }, required: ["bg", "text", "border", "radius"], additionalProperties: false },
      },
      required: ["primary", "secondary"],
      additionalProperties: false,
    },
    corners: { type: "number", description: "Card and input corner radius in px." },
    shadow: { type: ["string", "null"] },
    imagery: { type: "string", description: "What their pictures show and how, one sentence." },
    voice: {
      type: "object",
      properties: { tone: { type: "string" }, words: { type: "array", items: { type: "string" } }, avoid: { type: "array", items: { type: "string" } }, ctas: { type: "array", items: { type: "string" } } },
      required: ["tone", "words", "avoid", "ctas"],
      additionalProperties: false,
    },
    rules: { type: "array", items: { type: "string" }, description: "3 to 6 short rules a designer would follow to stay on brand." },
  },
  required: ["name", "tagline", "colors", "type", "buttons", "corners", "shadow", "imagery", "voice", "rules"],
  additionalProperties: false,
};

const SYSTEM = `You are a brand designer writing a company's brand book from what its website actually uses. You get the site's colors with where each one is used (backgrounds, text, fills, borders, buttons), its fonts and font files, its heading and body type, its button styles, corners, shadows, pictures and words.
- Colors: give each brand color a role. primary is the color of their main buttons and calls to action. secondary and accent are other brand hues they use on purpose. background, surface (cards, bands), text, muted (secondary text), border, dark (dark sections). Use only hex values from the list; skip roles they don't have.
- Type: the heading and body fonts they use most, with real weights and the h1, h2, h3 and body sizes as given.
- Buttons: primary and secondary as given (keep a gradient if the main button has one); radius in px.
- Voice: from their words. words are phrases they use; avoid is what their tone rules out; ctas are their real button labels.
- Never invent a color, font, size or claim that isn't in the data.`;

export type Caller = (p: { system: string; user: string; schema: object; maxTokens: number }) => Promise<{ text: string; usage: unknown } | null>;

/** The data Claude reads: the deep read, trimmed to what matters for the brand. */
export function bookInput(raw: RawBrand): string {
  return JSON.stringify({
    site: raw.site,
    colors: raw.colors.slice(0, 24).map(({ hex, count, bg, text, fill, border, button }) => ({ hex, count, bg, text, fill, border, button })),
    fonts: raw.fonts,
    font_files: [...new Set(raw.faces.map((f) => `${f.family} ${f.weight}`))].slice(0, 16),
    type: raw.type,
    buttons: raw.buttons,
    corners: raw.radii,
    shadows: raw.shadows,
    gradients: raw.gradients,
    pictures: raw.images.slice(0, 8).map((i) => i.alt).filter(Boolean),
    words: raw.copy,
  });
}

const px = (v: string | number | undefined, fallback: number) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? Math.round(n) : fallback;
};

/** The model's book, kept only where it matches the site: colors from the site, fonts it uses. */
export function cleanBook(out: unknown, raw: RawBrand): BrandBook | null {
  if (!out || typeof out !== "object") return null;
  const b = out as BrandBook;
  const have = new Set(raw.colors.map((c) => c.hex));
  for (const btn of raw.buttons) for (const c of [btn.bg, btn.color]) if (c) have.add(c);
  const fam = new Set([...raw.fonts.map((f) => f.family.toLowerCase()), ...raw.faces.map((f) => f.family.toLowerCase())]);
  const hex = (v: unknown) => {
    const h = toHex(String(v ?? ""));
    return h && have.has(h) ? h : null;
  };
  const font = (v: unknown, fallback: string) => (typeof v === "string" && fam.has(v.toLowerCase()) ? v : fallback);
  const top = raw.fonts[0]?.family ?? "";
  const colors = (Array.isArray(b.colors) ? b.colors : []).flatMap((c) => {
    const h = hex(c?.hex);
    return h && ROLES.includes(c.role) ? [{ hex: h, role: c.role, name: String(c.name ?? "").slice(0, 40) }] : [];
  });
  const primary = b.buttons?.primary;
  const pbg = hex(primary?.bg) ?? colors.find((c) => c.role === "primary")?.hex;
  if (!pbg) return null;
  const list = (v: unknown, n: number, len = 80) => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, n).map((x) => x.slice(0, len)) : []);
  const sec = b.buttons?.secondary;
  return {
    name: String(b.name ?? raw.site.name).slice(0, 80),
    tagline: String(b.tagline ?? "").slice(0, 160),
    colors: colors.slice(0, 12),
    type: {
      heading: { family: font(b.type?.heading?.family, top), weight: String(b.type?.heading?.weight ?? "600").slice(0, 4) },
      body: { family: font(b.type?.body?.family, top), weight: String(b.type?.body?.weight ?? "400").slice(0, 4) },
      scale: (Array.isArray(b.type?.scale) ? b.type.scale : []).slice(0, 4).map((s) => ({ role: s.role, size: String(s.size).slice(0, 40), weight: String(s.weight).slice(0, 4), lineHeight: String(s.lineHeight).slice(0, 20), letterSpacing: String(s.letterSpacing).slice(0, 20) })),
    },
    buttons: {
      primary: { bg: pbg, text: hex(primary?.text) ?? (contrast("#ffffff", pbg) >= 3 ? "#ffffff" : "#111111"), radius: Math.min(px(primary?.radius, 8), 999), gradient: typeof primary?.gradient === "string" && /^linear-gradient\([^;{}<>]{1,300}\)$/.test(primary.gradient) ? primary.gradient : null },
      secondary: sec && hex(sec.bg) && hex(sec.text) ? { bg: hex(sec.bg)!, text: hex(sec.text)!, border: String(sec.border ?? "").slice(0, 60), radius: px(sec.radius, 8) } : null,
    },
    corners: Math.min(px(b.corners, 8), 40),
    shadow: typeof b.shadow === "string" && b.shadow.length < 160 && !/url\(|;|{/.test(b.shadow) ? b.shadow : null,
    imagery: String(b.imagery ?? "").slice(0, 300),
    voice: { tone: String(b.voice?.tone ?? "").slice(0, 200), words: list(b.voice?.words, 8), avoid: list(b.voice?.avoid, 6), ctas: list(b.voice?.ctas, 6, 40) },
    rules: list(b.rules, 6, 200),
  };
}

export async function writeBook(call: Caller, raw: RawBrand): Promise<BrandBook | null> {
  const out = await call({ system: SYSTEM, user: bookInput(raw), schema: SCHEMA, maxTokens: 6000 }).catch(() => null);
  if (!out) return null;
  try {
    return cleanBook(JSON.parse(out.text), raw);
  } catch {
    return null;
  }
}

/** The kit's tokens from the book, so every form and booking page wears it. fontUrl serves the site's own fonts. */
export function tokensFromBook(book: BrandBook, fontUrl: string | null): Tokens {
  const role = (r: ColorRole) => book.colors.find((c) => c.role === r)?.hex;
  const q = (f: string) => (/\s/.test(f) ? `'${f}'` : f);
  const t: Partial<Tokens> = {
    font: `${q(book.type.body.family)}, ui-sans-serif, system-ui, sans-serif`,
    ...(book.type.heading.family && book.type.heading.family !== book.type.body.family ? { headingFont: `${q(book.type.heading.family)}, ${q(book.type.body.family)}, sans-serif` } : {}),
    ...(fontUrl ? { fontUrl } : {}),
    accent: role("primary") ?? book.buttons.primary.bg,
    buttonBg: book.buttons.primary.bg,
    buttonText: book.buttons.primary.text,
    buttonRadius: Math.min(book.buttons.primary.radius, 32),
    radius: Math.min(book.corners, 16),
    ...(role("text") && contrast(role("text")!, role("background") ?? "#ffffff") >= 4.5 ? { text: role("text") } : {}),
    ...(role("muted") ? { muted: role("muted") } : {}),
    ...(role("background") ? { background: role("background") } : {}),
    ...(role("border") ? { border: role("border") } : {}),
  };
  const w = Number(book.type.heading.weight);
  if (w >= 500 && w <= 800) t.buttonWeight = w >= 600 ? 600 : 500;
  return cleanTokens(t).tokens;
}

/** @font-face rules for the site's own font files, for the fonts the book uses. */
export function fontCss(faces: FontFace[], families: string[]): string {
  const want = new Set(families.map((f) => f.toLowerCase()));
  return faces
    .filter((f) => want.has(f.family.toLowerCase()) && /^https:\/\/[^\s"'()<>]+$/.test(f.src))
    .map((f) => `@font-face{font-family:"${f.family.replace(/["\\]/g, "")}";src:url("${f.src}");font-weight:${/^[\d\s]+$/.test(f.weight) ? f.weight : "400"};font-style:${f.style === "italic" ? "italic" : "normal"};font-display:swap}`)
    .join("\n");
}
