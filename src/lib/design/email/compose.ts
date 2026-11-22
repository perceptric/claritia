// Tia writes emails (docs/email-studio-plan.md Part 8): the model fills in a short outline of parts (a hero, text,
// a photo, numbers, an offer, an event, cards, a quote, a sign-off) and this file draws it with one design language.
// It sets no colors of its own: every color is a brand variable ($text, $muted, $accent, $button-bg, $button-text, and
// $tint and $surface, which the compiler works out from them), so each email shows in the workspace's brand and
// changes with it. Every email gets the header (logo) and the footer.
//
// The design language, in one place:
//   Header      the logo (or the brand's name) on its own, with room around it
//   Photo       a 2:1 photo with rounded corners, from the photo set (photos.ts)
//   Eyebrow     14px, bold, spaced capitals in the accent color, above the title
//   Title       30px bold and tight; section titles 22px; card titles 18px
//   Lead        18px in the muted color under the title; body 16px with room between lines; small 14px muted
//   Buttons     one filled button for the main step; other steps are links in the accent color with an arrow
//   Cards       soft surface panels with rounded corners; event details on the brand's tint
//   Bands       the brand's button color for the moment that matters, its tint for numbers and offers
//   Footer      a hairline above, then the address and unsubscribe line

import type { EmailStyles } from "../model.ts";
import { newEmailId, readEmailDoc, type Block, type EmailDoc, type Section } from "./doc.ts";
import { EMAIL_PHOTOS, emailPhotoUrl } from "./photos.ts";
import { DARK } from "./look.ts";

// Styles are collected while an email is made, keyed by element id, then go into the document.
type Decls = Record<string, string>;
let S: Record<string, EmailStyles> = {};
const put = (id: string, part: keyof EmailStyles, decls: Decls) => {
  const el = (S[id] ??= {});
  el[part] = { ...el[part], base: { ...el[part]?.base, ...decls } } as EmailStyles[keyof EmailStyles];
};
/** The same part's dark-mode values (mail apps that follow dark mode, and the gallery's Dark view). */
const dark = (id: string, part: keyof EmailStyles, decls: Decls) => {
  const el = (S[id] ??= {});
  const rule = (el[part] ??= {}) as Record<string, Decls>;
  rule["base:dark"] = { ...rule["base:dark"], ...decls };
};
const pad = (t: number, r: number, b: number, l: number): Decls => ({ "padding-top": `${t}px`, "padding-right": `${r}px`, "padding-bottom": `${b}px`, "padding-left": `${l}px` });
const corners = (r: number): Decls => Object.fromEntries(["top-left", "top-right", "bottom-left", "bottom-right"].map((c) => [`border-${c}-radius`, `${r}px`]));
const hairline = (side: "top" | "bottom"): Decls => ({ [`border-${side}-width`]: "1px", [`border-${side}-style`]: "solid", [`border-${side}-color`]: "$border" });
const noBorder: Decls = Object.fromEntries(["top", "right", "bottom", "left"].map((s) => [`border-${s}-width`, "0px"]));
/** The main button in dark mode: the brand's, unless it's so dark it would vanish (look.ts washes). */
const BUTTON_DARK: Decls = { "background-color": "$button-bg-dark", color: "$button-text-dark" };
/** A secondary step: a link in the accent color, no box. */
const asLink: Decls = { "background-color": "$background", color: "$accent", ...pad(12, 0, 12, 0), ...noBorder, "font-weight": "600", "font-size": "16px" };

// Blocks ------------------------------------------------------------------------------------------------------------

const id = newEmailId;

function h(text: string, size: "title" | "section" | "card" = "title", o: { center?: boolean; band?: boolean } = {}): Block {
  const b: Block = { id: id(), type: "heading", text, level: size === "title" ? 1 : size === "section" ? 2 : 3 };
  put(b.id, "heading", {
    ...(size === "title"
      ? { "font-size": "30px", "line-height": "1.2", "font-weight": "700", "letter-spacing": "-0.6px", "margin-bottom": "12px" }
      : size === "section"
        ? { "font-size": "22px", "line-height": "1.3", "font-weight": "700", "letter-spacing": "-0.3px", "margin-bottom": "8px" }
        : { "font-size": "18px", "line-height": "1.35", "font-weight": "600", "margin-bottom": "6px" }),
    ...(o.center ? { "text-align": "center" } : {}),
    ...(o.band ? { color: "$button-text" } : {}),
  });
  if (!o.band) dark(b.id, "heading", { color: DARK.title });
  return b;
}
function t(html: string | string[], kind: "body" | "lead" | "small" | "eyebrow" = "body", o: { center?: boolean; band?: boolean; right?: boolean } = {}): Block {
  const paras = Array.isArray(html) ? html : [html];
  const b: Block = { id: id(), type: "text", html: paras.map((x) => `<p>${x}</p>`).join("") };
  put(b.id, "text", {
    ...(kind === "lead"
      ? { "font-size": "18px", "line-height": "1.6", color: "$muted", "margin-bottom": "22px" }
      : kind === "small"
        ? { "font-size": "14px", "line-height": "1.55", color: "$muted" }
        : kind === "eyebrow"
          ? { "font-size": "14px", "line-height": "1.4", "font-weight": "700", "letter-spacing": "1px", "text-transform": "uppercase", color: "$accent", "margin-bottom": "12px" }
          : { "font-size": "16px", "line-height": "1.65", "margin-bottom": "16px" }),
    ...(o.center ? { "text-align": "center" } : o.right ? { "text-align": "right" } : {}),
    ...(o.band ? { color: "$button-text" } : {}),
  });
  if (!o.band) dark(b.id, "text", { color: kind === "eyebrow" ? "$accent-dark" : kind === "body" ? DARK.text : DARK.muted });
  return b;
}
function btn(label: string, o: { center?: boolean; band?: boolean; quiet?: boolean } = {}): Block {
  const b: Block = { id: id(), type: "button", label: o.quiet ? `${label} →` : label, url: "https://", align: o.center ? "center" : "left" };
  put(b.id, "button", { ...pad(14, 28, 14, 28), "font-weight": "600", "margin-top": "6px", "margin-bottom": "10px" });
  if (!o.band && !o.quiet) dark(b.id, "button", BUTTON_DARK);
  if (o.band) put(b.id, "button", { "background-color": "$button-text", color: "$button-bg" });
  if (o.quiet) {
    put(b.id, "button", asLink);
    dark(b.id, "button", { "background-color": DARK.email, color: "$accent-dark" });
  }
  return b;
}
const list = (items: string[], ordered = false): Block => {
  const b: Block = { id: id(), type: "list", items, ordered };
  put(b.id, "list", { "font-size": "16px", "line-height": "1.7", "margin-bottom": "16px" });
  dark(b.id, "list", { color: DARK.text });
  return b;
};
const quote = (text: string, cite: string): Block => {
  const b: Block = { id: id(), type: "quote", text, cite };
  put(b.id, "quote", { "font-size": "20px", "line-height": "1.5", "font-style": "normal", color: "$text", "padding-left": "20px", "margin-top": "8px", "margin-bottom": "12px" });
  dark(b.id, "quote", { color: DARK.title, "border-left-color": "$accent-dark" });
  return b;
};
const event = (title: string, when: string, where: string, button: string): Block => {
  const b: Block = { id: id(), type: "event", title, when, where, url: "https://", button };
  put(b.id, "card", { "background-color": "$tint", ...noBorder, ...corners(14), ...pad(24, 24, 24, 24) });
  put(b.id, "button", { ...pad(12, 24, 12, 24), "font-weight": "600" });
  dark(b.id, "button", BUTTON_DARK);
  dark(b.id, "card", { "background-color": "$tint-dark" });
  dark(b.id, "card-title", { color: DARK.title });
  dark(b.id, "muted", { color: DARK.muted });
  return b;
};
const card = (title: string, text: string, button = "Read more", price?: string, image?: string): Block => {
  const b: Block = { id: id(), type: "product", title, text, url: "https://", button: button ? `${button} →` : "", ...(price ? { price } : {}), ...(image ? { image } : {}) };
  put(b.id, "card", { "background-color": "$surface", ...noBorder, ...corners(14), ...pad(22, 22, 22, 22), "margin-bottom": "12px" });
  put(b.id, "button", asLink);
  dark(b.id, "card", { "background-color": DARK.card });
  dark(b.id, "card-title", { color: DARK.title });
  dark(b.id, "text", { color: DARK.text });
  dark(b.id, "muted", { color: DARK.muted });
  dark(b.id, "button", { "background-color": DARK.card, color: "$accent-dark" });
  return b;
};
const meeting = (label = "Pick a time"): Block => {
  const b: Block = { id: id(), type: "meeting", label, url: "https://", align: "left" };
  put(b.id, "button", { ...pad(14, 28, 14, 28), "font-weight": "600", "margin-top": "6px", "margin-bottom": "10px" });
  dark(b.id, "button", BUTTON_DARK);
  return b;
};
const sign = (name = "Your name", title = "Your role"): Block => {
  const b: Block = { id: id(), type: "signature", name, title };
  dark(b.id, "text", { color: DARK.title });
  dark(b.id, "muted", { color: DARK.muted });
  return b;
};

// Sections ----------------------------------------------------------------------------------------------------------

type Look = "hero" | "body" | "band" | "tight" | "close" | "tint";
function sec(look: Look, ...blocks: Block[]): Section {
  const s: Section = { id: id(), stackOnPhone: true, columns: [{ id: id(), width: 100, blocks }] };
  style(s, look);
  return s;
}
function cols(look: Look, ...columns: Block[][]): Section {
  const n = columns.length;
  const s: Section = { id: id(), stackOnPhone: true, columns: columns.map((blocks, i) => ({ id: id(), width: i === n - 1 ? 100 - Math.round(100 / n) * (n - 1) : Math.round(100 / n), blocks })) };
  style(s, look);
  return s;
}
function style(s: Section, look: Look) {
  const sides = { hero: pad(32, 40, 8, 40), body: pad(10, 40, 10, 40), band: pad(44, 40, 44, 40), tight: pad(2, 40, 2, 40), close: pad(10, 40, 36, 40), tint: pad(28, 40, 28, 40) }[look];
  put(s.id, "section", { ...sides, ...(look === "band" ? { "background-color": "$button-bg" } : look === "tint" ? { "background-color": "$tint" } : {}) });
  if (look === "tint") dark(s.id, "section", { "background-color": "$tint-dark" });
}
/** Numbers in a row on the brand's tint: [number, what it counts]. */
function stats(...items: [string, string][]): Section {
  const s = cols(
    "tint",
    ...items.map(([n, label]) => {
      const num = h(n, "section");
      put(num.id, "heading", { "font-size": "30px", color: "$accent", "margin-bottom": "2px" });
      dark(num.id, "heading", { color: "$accent-dark" });
      return [num, t(label, "small")];
    }),
  );
  return s;
}
/** The closing step on the brand's tint, centered: a title, a line and one button. */
function offer(title: string, line: string, button: string, o: { meeting?: boolean } = {}): Section {
  const b = o.meeting ? { ...meeting(button), align: "center" as const } : btn(button, { center: true });
  const s = sec("tint", h(title, "section", { center: true }), t(line, "body", { center: true }), b);
  put(s.id, "section", pad(36, 40, 36, 40));
  return s;
}
function header(): Section {
  const logo: Block = { id: id(), type: "logo", alt: "Logo", width: 120, align: "left" };
  dark(logo.id, "image", { color: DARK.title });
  const s = sec("body", logo);
  put(s.id, "section", pad(30, 40, 6, 40));
  return s;
}
function photoSection(src: string, alt: string): Section {
  const img: Block = { id: id(), type: "image", src, alt, width: 520, align: "center" };
  put(img.id, "image", corners(14));
  const s = sec("body", img);
  put(s.id, "section", pad(18, 40, 2, 40));
  return s;
}
function footer(): Section {
  const f: Block = { id: id(), type: "footer" };
  dark(f.id, "footer", { color: DARK.muted });
  const s = sec("body", f);
  put(s.id, "section", { ...pad(26, 40, 34, 40), ...hairline("top") });
  dark(s.id, "section", { "border-top-color": DARK.line });
  return s;
}

// The outline Tia fills in ----------------------------------------------------------------------------------------

export type ComposePart =
  | { kind: "hero"; eyebrow?: string; title: string; lead?: string }
  | { kind: "photo"; photo: string }
  | { kind: "text"; heading?: string; paragraphs: string[]; link?: string }
  | { kind: "list"; heading?: string; items: string[]; ordered?: boolean }
  | { kind: "button"; label: string }
  | { kind: "band"; title: string; text?: string; button?: string }
  | { kind: "stats"; items: { number: string; label: string }[] }
  | { kind: "offer"; title: string; text: string; button: string; meeting?: boolean }
  | { kind: "event"; title: string; when: string; where: string; button: string }
  | { kind: "cards"; heading?: string; items: { title: string; text: string; link?: string }[] }
  | { kind: "quote"; text: string; cite: string }
  | { kind: "meeting"; text?: string; label: string }
  | { kind: "sign"; text?: string; name: string; title?: string };
export type ComposeSpec = { preheader: string; parts: ComposePart[] };

export const PART_KINDS = ["hero", "photo", "text", "list", "button", "band", "stats", "offer", "event", "cards", "quote", "meeting", "sign"] as const;

const s = (v: unknown, max = 600) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strs = (v: unknown, n: number, max = 600) => (Array.isArray(v) ? v.map((x) => s(x, max)).filter(Boolean).slice(0, n) : []);
/** Words go in as text: the outline never carries markup. Merge tags stay. */
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The model's outline, checked: what's kept, or what to fix. */
export function readComposeSpec(input: unknown): ComposeSpec | { error: string } {
  const o = (input ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(o.parts) ? o.parts : [];
  if (!raw.length) return { error: "parts needs at least one part." };
  if (raw.length > 14) return { error: "Keep it to 14 parts or fewer." };
  const parts: ComposePart[] = [];
  let photos = 0;
  let mains = 0;
  for (const [i, x] of raw.entries()) {
    const p = (x ?? {}) as Record<string, unknown>;
    const bad = (why: string) => ({ error: `Part ${i + 1} (${s(p.kind, 20) || "no kind"}): ${why}` });
    switch (p.kind) {
      case "hero":
        if (!s(p.title)) return bad("needs a title.");
        parts.push({ kind: "hero", title: s(p.title, 120), ...(s(p.eyebrow) ? { eyebrow: s(p.eyebrow, 40) } : {}), ...(s(p.lead) ? { lead: s(p.lead, 300) } : {}) });
        break;
      case "photo":
        if (!EMAIL_PHOTOS[s(p.photo, 60)]) return bad(`no photo "${s(p.photo, 60)}". Pick one from the photo list, or leave the photo out.`);
        if (++photos > 1) return bad("one photo per email.");
        parts.push({ kind: "photo", photo: s(p.photo, 60) });
        break;
      case "text": {
        const paragraphs = strs(p.paragraphs, 6, 900);
        if (!paragraphs.length) return bad("needs paragraphs.");
        parts.push({ kind: "text", paragraphs, ...(s(p.heading) ? { heading: s(p.heading, 120) } : {}), ...(s(p.link) ? { link: s(p.link, 40) } : {}) });
        break;
      }
      case "list": {
        const items = strs(p.items, 8, 200);
        if (items.length < 2) return bad("needs 2 or more items.");
        parts.push({ kind: "list", items, ordered: p.ordered === true, ...(s(p.heading) ? { heading: s(p.heading, 120) } : {}) });
        break;
      }
      case "button":
      case "meeting":
        if (!s(p.label)) return bad("needs a label.");
        mains++;
        parts.push(p.kind === "button" ? { kind: "button", label: s(p.label, 40) } : { kind: "meeting", label: s(p.label, 40), ...(s(p.text) ? { text: s(p.text, 300) } : {}) });
        break;
      case "band":
        if (!s(p.title)) return bad("needs a title.");
        if (s(p.button)) mains++;
        parts.push({ kind: "band", title: s(p.title, 120), ...(s(p.text) ? { text: s(p.text, 300) } : {}), ...(s(p.button) ? { button: s(p.button, 40) } : {}) });
        break;
      case "stats": {
        const items = (Array.isArray(p.items) ? p.items : []).map((y) => ({ number: s((y as Record<string, unknown>)?.number, 12), label: s((y as Record<string, unknown>)?.label, 40) })).filter((y) => y.number && y.label);
        if (items.length < 2 || items.length > 3) return bad("needs 2 or 3 items, each a number and a label.");
        parts.push({ kind: "stats", items });
        break;
      }
      case "offer":
        if (!s(p.title) || !s(p.text) || !s(p.button)) return bad("needs a title, a text and a button.");
        mains++;
        parts.push({ kind: "offer", title: s(p.title, 120), text: s(p.text, 300), button: s(p.button, 40), meeting: p.meeting === true });
        break;
      case "event":
        if (!s(p.title) || !s(p.when) || !s(p.button)) return bad("needs a title, when and a button.");
        mains++;
        parts.push({ kind: "event", title: s(p.title, 120), when: s(p.when, 120), where: s(p.where, 120), button: s(p.button, 40) });
        break;
      case "cards": {
        const items = (Array.isArray(p.items) ? p.items : []).map((y) => ({ title: s((y as Record<string, unknown>)?.title, 80), text: s((y as Record<string, unknown>)?.text, 300), link: s((y as Record<string, unknown>)?.link, 40) })).filter((y) => y.title && y.text);
        if (items.length < 2 || items.length > 3) return bad("needs 2 or 3 cards, each a title and a text.");
        parts.push({ kind: "cards", items: items.map((y) => ({ title: y.title, text: y.text, ...(y.link ? { link: y.link } : {}) })), ...(s(p.heading) ? { heading: s(p.heading, 120) } : {}) });
        break;
      }
      case "quote":
        if (!s(p.text) || !s(p.cite)) return bad("needs the words and who said them.");
        parts.push({ kind: "quote", text: s(p.text, 400), cite: s(p.cite, 80) });
        break;
      case "sign":
        if (!s(p.name)) return bad("needs a name.");
        parts.push({ kind: "sign", name: s(p.name, 80), ...(s(p.title) ? { title: s(p.title, 80) } : {}), ...(s(p.text) ? { text: s(p.text, 300) } : {}) });
        break;
      default:
        return bad(`kind is one of ${PART_KINDS.join(", ")}.`);
    }
  }
  if (mains > 2) return { error: "Keep to one or two main buttons (button, meeting, band button, offer, event). Use a text link for the rest." };
  return { preheader: s(o.preheader, 200), parts };
}

function draw(p: ComposePart): Section[] {
  switch (p.kind) {
    case "hero":
      return [sec("hero", ...(p.eyebrow ? [t(esc(p.eyebrow), "eyebrow")] : []), h(p.title), ...(p.lead ? [t(esc(p.lead), "lead")] : []))];
    case "photo": {
      const pic = EMAIL_PHOTOS[p.photo]!;
      return [photoSection(emailPhotoUrl(pic), pic.alt)];
    }
    case "text":
      return [sec("body", ...(p.heading ? [h(p.heading, "card")] : []), t(p.paragraphs.map(esc))), ...(p.link ? [sec("tight", btn(p.link, { quiet: true }))] : [])];
    case "list":
      return [sec("body", ...(p.heading ? [h(p.heading, "card")] : []), list(p.items))];
    case "button":
      return [sec("body", btn(p.label))];
    case "band":
      return [sec("band", h(p.title, "section", { band: true }), ...(p.text ? [t(esc(p.text), "body", { band: true })] : []), ...(p.button ? [btn(p.button, { band: true })] : []))];
    case "stats":
      return [stats(...p.items.map((x) => [x.number, esc(x.label)] as [string, string]))];
    case "offer":
      return [offer(p.title, esc(p.text), p.button, { meeting: p.meeting })];
    case "event":
      return [sec("body", event(p.title, p.when, p.where, p.button))];
    case "cards":
      return [...(p.heading ? [sec("body", h(p.heading, "section"))] : []), ...p.items.map((c) => sec("tight", card(c.title, c.text, c.link ?? "")))];
    case "quote":
      return [sec("body", quote(p.text, p.cite))];
    case "meeting":
      return [sec("close", ...(p.text ? [t(esc(p.text), "small")] : []), meeting(p.label))];
    case "sign":
      return [sec("close", ...(p.text ? [t(esc(p.text))] : []), sign(p.name, p.title ?? ""))];
  }
}

/** The outline as an email: the header, the parts in order, then the footer. */
export function composeEmail(spec: ComposeSpec): EmailDoc {
  S = {};
  put("email", "content", corners(16));
  dark("email", "content", { "background-color": DARK.email });
  dark("email", "body", { "background-color": DARK.page });
  const sections = [header(), ...spec.parts.flatMap(draw), footer()];
  const styles = S;
  S = {};
  return readEmailDoc({ v: 1, settings: { width: 600, align: "center", darkMode: "auto", preheader: spec.preheader, lang: "en" }, sections, styles });
}

/** An empty email: the header and the footer, for Start blank. */
export const blankEmail = (): EmailDoc => composeEmail({ preheader: "", parts: [] });
