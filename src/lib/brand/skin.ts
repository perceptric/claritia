// Copying a site's look into Claritia's forms, part 2 (docs/brand-skin.md): from what the browser read (skinCapture.ts),
// Claude writes a stylesheet for the form's own parts, copying the site's real values: its fonts, its button with every
// layer and state, its inputs, cards, checkboxes, labels and headings. The stylesheet is cleaned before it's kept (no
// links, no imports, no scripts; it can only style the form, which sits in its own shadow root). The site's font files
// are served from Claritia (the fontfile route), since most sites don't let other sites load them.

import type Anthropic from "@anthropic-ai/sdk";
import type { Face, SkinSource } from "./skinCapture.ts";

export const SKIN_MODEL = "claude-sonnet-5-5";
/** What a brand kit keeps: the stylesheet and the font files it needs. */
export type Skin = { css: string; faces: Face[]; at: string; from: string };

/** The form's parts, by the class names the form script draws (src/lib/forms/element.ts). */
export const MARKUP = `The form is drawn inside its own shadow root. Style only these selectors (and their states):
:host                      the whole form: font-family, font-size, color, line-height
.f                         the form (a column); background
.h                         the form's title          .i   the intro line under it
.lo                        the brand's logo picture
.pg .st .pb .pb i          progress: words, the bar, the bar's fill
.fl                        one question (a column: label, then the control)
.lb   .rq   .hp   .er      a question's label, its required star, help text, error text
.in                        text inputs and textareas (input.in, textarea.in): :hover :focus ::placeholder [aria-invalid=true]
.bx                        a dropdown's button (looks like .in); .ls the open list, .op an option, .op.on the one under the cursor
.ch                        a list of choices; .ck one choice row: <label class="ck"><input type=radio|checkbox><span>text</span></label>
.cd                        choice cards (a grid); .cd label one card, .cd label:has(input:checked) the picked card, .cd img its picture
.rt .rn span .rn .on span  a 0 to 10 or 1 to 5 scale: each number, and the picked one; .rs span stars
.pl  .pl[aria-pressed=true] pill buttons (times, pills)
.bt                        the main button (Next, Submit): :hover :active :disabled :focus-visible
.bt.bk                     the secondary button (Back)
.ac                        the row of buttons
.dn .ok                    the screen after sending, and its check mark
.rk .gd .gr .mv            ranking rows, grid table, "add another" rows, small round buttons
.py                        the payment total box`;

const SYSTEM = `You copy a website's look onto a web form exactly. You get the controls a real browser read on the site (their computed styles, where each control's visible box is drawn: the element, its ::before/::after layer, or a wrapper; and the changes on hover, pressed and focus), a picture of each, and the site's fonts. Write one CSS stylesheet that makes the form's parts look exactly like the site's matching controls.

${MARKUP}

RULES
- Copy the measured values exactly: font families (as given, with the site's fallbacks), sizes, weights, letter spacing, text transform, colors, borders per side, corner radius, shadows, padding and heights. Never round, never swap in a similar font.
- Reproduce how the site draws a control. If its button is drawn by a ::before layer with a bottom shadow and moves down when pressed, draw .bt the same way (a ::before layer or the equivalent box-shadow) with the same :hover, :active and :disabled changes. If an input's box is drawn by a wrapper, put that box on .in (and .bx).
- The site's primary button styles .bt; its secondary button styles .bt.bk; its input styles .in and .bx; its choice card styles .cd label (and the picked state from its selected look); its checkbox or radio styles .ck input (use appearance:none and draw the box and check like the site when the site draws its own); its heading styles .h and big labels; its body text styles :host and .i; small uppercase labels on the site style .lb when the site uses that look for field labels.
- Keep the layout working: don't change display, grid or flex on .f, .g, .fl, .ch, .cd, .ac, and don't hide anything.
- No url(), @import, @font-face or expressions: fonts are loaded for you under the family names given.
Answer with JSON {"css": "...", "notes": ["what you copied, short"]}.`;

const OUT_SCHEMA = {
  type: "object",
  properties: { css: { type: "string" }, notes: { type: "array", items: { type: "string" } } },
  required: ["css", "notes"],
  additionalProperties: false,
};

export type SkinCaller = (p: { system: string; content: Anthropic.Beta.BetaContentBlockParam[]; schema: object; maxTokens: number }) => Promise<{ text: string; usage: Anthropic.Beta.BetaUsage } | null>;

/** The message Claude reads: the parts as data (pictures apart), then each part's picture with its role. */
export function skinContent(src: SkinSource): Anthropic.Beta.BetaContentBlockParam[] {
  const data = { site: src.url, page: src.page, fonts: [...new Set(src.faces.map((f) => `${f.family} ${f.weight} ${f.style}`))], controls: src.parts.map((p) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== "shot"))) };
  const content: Anthropic.Beta.BetaContentBlockParam[] = [{ type: "text", text: JSON.stringify(data) }];
  for (const p of src.parts)
    if (p.shot) {
      content.push({ type: "text", text: `Picture of the site's ${p.role}${p.text ? ` "${p.text}"` : ""}:` });
      content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: p.shot } });
    }
  return content;
}

export async function writeSkin(call: SkinCaller, src: SkinSource): Promise<{ css: string; notes: string[]; usage: Anthropic.Beta.BetaUsage } | null> {
  if (!src.parts.length) return null;
  const out = await call({ system: SYSTEM, content: skinContent(src), schema: OUT_SCHEMA, maxTokens: 16000 }).catch(() => null);
  if (!out) return null;
  try {
    const j = JSON.parse(out.text) as { css?: unknown; notes?: unknown };
    const css = cleanSkin(typeof j.css === "string" ? j.css : "");
    return css ? { css, notes: Array.isArray(j.notes) ? j.notes.map(String).slice(0, 12) : [], usage: out.usage } : null;
  } catch {
    return null;
  }
}

const AT_OK = /^@(media|container|supports|keyframes|-webkit-keyframes)\b/i;

/**
 * A skin as it may be kept: no links of any kind (url(), image-set, @import), no @font-face, no scripts or old IE
 * tricks, only the at-rules layout needs, balanced braces, and at most 40 KB. Anything else is dropped, not fixed.
 */
export function cleanSkin(raw: string): string {
  let css = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<\/?\s*style[^>]*>/gi, "");
  if (css.length > 40_000) return "";
  if (/url\s*\(|image-set|@import|@font-face|@charset|@namespace|expression\s*\(|javascript:|behavior\s*:|-moz-binding|\\[0-9a-f]{1,6}/i.test(css)) {
    // Drop the declarations that carry them instead of the whole sheet.
    css = css.replace(/[^;{}]*(url\s*\(|image-set|expression\s*\(|javascript:|behavior\s*:|-moz-binding)[^;{}]*;?/gi, "");
    css = css.replace(/@(import|charset|namespace)[^;]*;/gi, "").replace(/@font-face\s*\{[^}]*\}/gi, "");
    if (/\\[0-9a-f]{1,6}/i.test(css)) return "";
  }
  // Balanced braces, and only allowed at-rules.
  let depth = 0;
  for (const ch of css) {
    if (ch === "{") depth++;
    else if (ch === "}" && --depth < 0) return "";
  }
  if (depth !== 0) return "";
  for (const m of css.matchAll(/@[a-z-]+/gi)) if (!AT_OK.test(m[0])) return "";
  return css.trim();
}

/** The @font-face rules that load a skin's fonts from Claritia's copy of each file. */
export function skinFontCss(kitId: string, faces: Face[], base: string): string {
  const safe = (s: string) => s.replace(/["\\<>{};]/g, "");
  return faces
    .map((f, i) => `@font-face{font-family:"${safe(f.family)}";src:url("${base}/api/brand/fontfile/${kitId}/${i}") format("${/\.woff2(\?|$)/.test(f.src) ? "woff2" : /\.woff(\?|$)/.test(f.src) ? "woff" : /\.otf(\?|$)/.test(f.src) ? "opentype" : "truetype"}");font-weight:${/^[\d\s]+$/.test(f.weight) ? f.weight : "400"};font-style:${f.style === "italic" ? "italic" : "normal"};font-display:swap}`)
    .join("\n");
}

/** A skin read from the database: only what it should hold. */
export function readSkin(raw: unknown): Skin | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<Skin>;
  const css = typeof s.css === "string" ? cleanSkin(s.css) : "";
  if (!css) return null;
  const faces = (Array.isArray(s.faces) ? s.faces : []).filter((f): f is Face => !!f && typeof f.src === "string" && /^https:\/\//.test(f.src) && typeof f.family === "string").slice(0, 12);
  return { css, faces, at: typeof s.at === "string" ? s.at : "", from: typeof s.from === "string" ? s.from : "" };
}

/** Claude for the skin, on the runner: the parts' pictures and data in, the stylesheet out. */
export function claudeSkinner(client: Anthropic): SkinCaller {
  return async (p) => {
    const res = await client.beta.messages.create({
      model: SKIN_MODEL,
      max_tokens: p.maxTokens,
      output_config: { effort: "medium", format: { type: "json_schema", schema: p.schema } },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: p.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: p.content }],
    } as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming);
    if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return null;
    return { text: res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(""), usage: res.usage };
  };
}

/** A kit's skin as the form script takes it, with its fonts served from `base` (the app's address). */
export function skinForKit(kit: { id: string; skin?: unknown } | null | undefined, base: string): { css: string; fonts: string } | null {
  const s = kit ? readSkin(kit.skin) : null;
  return s && kit ? { css: s.css, fonts: skinFontCss(kit.id, s.faces, base) } : null;
}
