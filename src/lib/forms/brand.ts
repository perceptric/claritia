// Brand kit tokens (docs/form-builder.md Part 5). A fixed list of values that styles a form, a booking page or an
// email. Each value is checked against its own pattern before it's saved and again before it becomes CSS, so a
// token can never carry anything but a color, a size, a weight or a font name. Runs in the browser and on the server.

export type Tokens = {
  font: string;
  headingFont: string;
  /** A Google Fonts stylesheet for the fonts above, when they come from there. */
  fontUrl: string;
  fontSize: number;
  text: string;
  muted: string;
  background: string;
  inputBg: string;
  border: string;
  borderWidth: number;
  radius: number;
  inputHeight: number;
  accent: string;
  buttonBg: string;
  buttonText: string;
  buttonRadius: number;
  buttonWeight: number;
  buttonCase: "none" | "uppercase";
  labelSize: number;
  labelWeight: number;
  error: string;
  gap: number;
};

export const DEFAULT_TOKENS: Tokens = {
  font: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  headingFont: "",
  fontUrl: "",
  fontSize: 15,
  text: "#111111",
  muted: "#6b6b6b",
  background: "#ffffff",
  inputBg: "#ffffff",
  border: "#d4d4d4",
  borderWidth: 1,
  radius: 6,
  inputHeight: 42,
  accent: "#111111",
  buttonBg: "#111111",
  buttonText: "#ffffff",
  buttonRadius: 6,
  buttonWeight: 500,
  buttonCase: "none",
  labelSize: 14,
  labelWeight: 500,
  error: "#c4320a",
  gap: 16,
};

const COLORS = ["text", "muted", "background", "inputBg", "border", "accent", "buttonBg", "buttonText", "error"] as const;
const SIZES: Record<string, [number, number]> = {
  fontSize: [12, 22],
  borderWidth: [0, 4],
  radius: [0, 32],
  inputHeight: [30, 72],
  buttonRadius: [0, 60],
  labelSize: [11, 22],
  gap: [6, 40],
};
const WEIGHTS = ["buttonWeight", "labelWeight"] as const;
const FONT = /^[A-Za-z0-9 ,'"_-]{1,200}$/;

/** A CSS color as #rrggbb (or #rrggbbaa), or null when it isn't one we accept. */
export function cleanColor(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  const short = /^#([0-9a-f]{3,4})$/.exec(v);
  const hex = short ? [...short[1]].map((c) => c + c).join("") : /^#([0-9a-f]{6}|[0-9a-f]{8})$/.exec(v)?.[1];
  if (hex) return hex.length === 8 && hex.endsWith("ff") ? `#${hex.slice(0, 6)}` : `#${hex}`;
  const m =/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(v);
  if (m) {
    const [r, g, b] = [m[1], m[2], m[3]].map((x) => Math.min(255, Number(x)));
    let a = m[4] === undefined ? 1 : m[4].endsWith("%") ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
    if (!Number.isFinite(a)) return null;
    a = Math.min(1, Math.max(0, a));
    const two = (n: number) => n.toString(16).padStart(2, "0");
    return `#${two(r)}${two(g)}${two(b)}${a < 1 ? two(Math.round(a * 255)) : ""}`;
  }
  return null;
}

export const cleanFont = (raw: unknown): string | null => (typeof raw === "string" && FONT.test(raw.trim()) ? raw.trim() : null);

/** Only Google Fonts stylesheets: fonts.googleapis.com/css2?family=… */
export function cleanFontUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.hostname === "fonts.googleapis.com" && /^\/css2?$/.test(u.pathname) && !u.username ? u.href.slice(0, 500) : null;
  } catch {
    return null;
  }
}

/** Every token checked; a bad or missing one takes the default. Returns the notes for values that were dropped. */
export function cleanTokens(raw: unknown): { tokens: Tokens; dropped: string[] } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const t: Tokens = { ...DEFAULT_TOKENS };
  const dropped: string[] = [];
  const has = (k: string) => r[k] !== undefined && r[k] !== null && r[k] !== "";
  for (const k of COLORS) {
    if (!has(k)) continue;
    const c = cleanColor(r[k]);
    if (c) t[k] = c;
    else dropped.push(k);
  }
  for (const [k, [lo, hi]] of Object.entries(SIZES)) {
    if (!has(k)) continue;
    const n = Number(String(r[k]).replace(/px$/, ""));
    if (Number.isFinite(n)) (t as Record<string, unknown>)[k] = Math.round(Math.min(hi, Math.max(lo, n)));
    else dropped.push(k);
  }
  for (const k of WEIGHTS) {
    if (!has(k)) continue;
    const n = Math.round(Number(r[k]) / 100) * 100;
    if (n >= 300 && n <= 800) t[k] = n;
    else dropped.push(k);
  }
  for (const k of ["font", "headingFont"] as const) {
    if (!has(k)) continue;
    const f = cleanFont(r[k]);
    if (f) t[k] = f;
    else dropped.push(k);
  }
  if (has("fontUrl")) {
    const u = cleanFontUrl(r.fontUrl);
    if (u) t.fontUrl = u;
    else dropped.push("fontUrl");
  }
  if (has("buttonCase")) t.buttonCase = r.buttonCase === "uppercase" ? "uppercase" : "none";
  return { tokens: t, dropped };
}

// Contrast (WCAG 2.1) -----------------------------------------------------------------------------------------

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "").slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** The color moved toward black or white, a step at a time, until it reads on `bg` at `ratio`. */
export function readableOn(fg: string, bg: string, ratio = 4.5): string {
  if (contrast(fg, bg) >= ratio) return fg.slice(0, 7);
  const towardWhite = luminance(bg) < 0.4;
  let [r, g, b] = rgb(fg);
  for (let i = 0; i < 40 && contrast(toHex(r, g, b), bg) < ratio; i++) {
    const t = towardWhite ? 255 : 0;
    r = Math.round(r + (t - r) * 0.12);
    g = Math.round(g + (t - g) * 0.12);
    b = Math.round(b + (t - b) * 0.12);
  }
  return contrast(toHex(r, g, b), bg) >= ratio ? toHex(r, g, b) : towardWhite ? "#ffffff" : "#000000";
}

const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;

/** Fix the pairs a visitor must be able to read. Returns the fixed tokens and a note per change. */
export function fixContrast(t: Tokens): { tokens: Tokens; notes: string[] } {
  const out = { ...t };
  const notes: string[] = [];
  const bg = t.background.slice(0, 7);
  const pairs: [keyof Tokens, string, number, string][] = [
    ["text", bg, 4.5, "Text color darkened to read on the background."],
    ["muted", bg, 4.5, "Gray text darkened to read on the background."],
    ["error", bg, 4.5, "Error color adjusted to read on the background."],
    ["buttonText", t.buttonBg.slice(0, 7), 4.5, "Button text adjusted to read on the button."],
  ];
  for (const [k, on, ratio, note] of pairs) {
    const v = out[k] as string;
    const fixed = readableOn(v, on, ratio);
    if (fixed !== v.slice(0, 7)) {
      (out as Record<string, unknown>)[k] = fixed;
      notes.push(note);
    }
  }
  return { tokens: out, notes };
}

/** Tokens as CSS custom properties, for the form's shadow root. Only checked values reach here. */
export function tokensCss(raw: Partial<Tokens>): string {
  const t = cleanTokens(raw).tokens;
  const px = (n: number) => `${n}px`;
  const vars: [string, string][] = [
    ["--clr-font", t.font],
    ["--clr-heading-font", t.headingFont || t.font],
    ["--clr-size", px(t.fontSize)],
    ["--clr-text", t.text],
    ["--clr-muted", t.muted],
    ["--clr-bg", t.background],
    ["--clr-input-bg", t.inputBg],
    ["--clr-border", t.border],
    ["--clr-border-w", px(t.borderWidth)],
    ["--clr-radius", px(t.radius)],
    ["--clr-input-h", px(t.inputHeight)],
    ["--clr-accent", t.accent],
    ["--clr-btn-bg", t.buttonBg],
    ["--clr-btn-text", t.buttonText],
    ["--clr-btn-radius", px(t.buttonRadius)],
    ["--clr-btn-weight", String(t.buttonWeight)],
    ["--clr-btn-case", t.buttonCase],
    ["--clr-label-size", px(t.labelSize)],
    ["--clr-label-weight", String(t.labelWeight)],
    ["--clr-error", t.error],
    ["--clr-gap", px(t.gap)],
  ];
  return vars.map(([k, v]) => `${k}:${v};`).join("");
}
