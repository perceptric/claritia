// The email compiler (docs/design-system.md Part 4.2): an email document on a design system, as the HTML and plain
// text email clients need. Layout is nested tables; every part's desktop values are inline, since Gmail and others
// drop or limit <style>; phone, hover and dark rules sit in one <style> block with !important to beat them. Columns
// are inline-block divs with ghost tables for Outlook on Windows, buttons are a padded link plus a VML round-rect,
// margins become padding on a wrapper cell, and variables become their values. Conditional content is wrapped in
// markers the send fills per person (`applyConditions`). Nothing here sends; the caller stores the result frozen.

import { literal } from "../cascade.ts";
import { allVariables, type DesignSystem, type Variable } from "../model.ts";
import { cssName, propDef, type Client, type Prop } from "../props.ts";
import type { Tokens } from "../../forms/brand.ts";
import { expandComponents } from "./components.ts";
import { condHolds, type Block, type EmailCond, type EmailDoc, type Section } from "./doc.ts";
import { escapeAttr, escapeText, htmlToText } from "./html.ts";
import { emailPartsOf, type EmailPartKey } from "./parts.ts";
import { resolveEmail, type EmailBp, type EmailState } from "./style.ts";

export type CompileOpts = {
  tokens?: Partial<Tokens>;
  /** The brand kit's logo, for Logo blocks without their own image. */
  logo?: string | null;
  /** A Google Fonts stylesheet for the fonts used, for clients that load web fonts. */
  fontUrl?: string;
  /** Builder previews: mark each element with data-eid, and each part with its class, so the canvas can find them. */
  preview?: boolean;
  /** Builder previews: draw the dark rules whatever the computer's setting is. */
  forceDark?: boolean;
  /** Builder previews (Client view, Part 5.4): leave out what this mail app ignores, so the canvas looks like it. */
  client?: Client;
};
export type CompileNote = { level: "block" | "warn"; text: string; id?: string };
export type Compiled = { html: string; text: string; size: number; notes: CompileNote[] };

/** Gmail clips an email over 102 KB; sends over this are refused (Part 7.4). */
export const MAX_EMAIL_BYTES = 95 * 1024;
const PHONE = 480;

type Ctx = {
  system: DesignSystem;
  doc: EmailDoc;
  vars: Map<string, Variable>;
  opts: CompileOpts;
  rules: { phone: string[]; hover: string[]; dark: string[]; ogsc: string[]; phoneDark: string[] };
  notes: CompileNote[];
};

// Styles -----------------------------------------------------------------------------------------------------------

/** One part's values at a breakpoint and state, with variables written as their values. */
function values(ctx: Ctx, id: string, part: EmailPartKey, bp: EmailBp = "base", state?: EmailState, dark = false): Partial<Record<Prop, string>> {
  const r = resolveEmail(ctx.system, ctx.doc, { id, part }, bp, state);
  const out: Partial<Record<Prop, string>> = {};
  for (const [p, v] of Object.entries(r)) {
    const val = literal(v!.value, ctx.vars, dark);
    if (val) out[p as Prop] = val;
  }
  return out;
}

const SKIP_INLINE = new Set<Prop>(["display", "position", "inset-top", "inset-right", "inset-bottom", "inset-left", "z-index", "cursor", "transition-duration", "transition-timing-function", "transform", "outline-width", "outline-style", "outline-color", "outline-offset"]);
const isMargin = (p: string) => p.startsWith("margin-");
// Fonts every mail app has: what a font stack falls back to where web fonts don't load.
const SAFE_FONTS = /^(arial|helvetica|georgia|times new roman|times|verdana|tahoma|trebuchet ms|courier new|courier|segoe ui|system-ui|-apple-system|ui-sans-serif|ui-serif|sans-serif|serif|monospace)$/i;
const safeStack = (v: string) => v.split(",").map((f) => f.trim()).filter((f) => SAFE_FONTS.test(f.replace(/^['"]|['"]$/g, ""))).join(", ") || "sans-serif";

/** Declarations as CSS. With a client (Client view), what it ignores is left out and fonts fall back as it would. */
const cssFor = (client: Client | undefined) => (decls: Partial<Record<Prop, string>>, skip: (p: Prop) => boolean = () => false, important = false) =>
  Object.entries(decls)
    .filter(([p]) => !SKIP_INLINE.has(p as Prop) && !skip(p as Prop) && propDef(p as Prop).email !== false)
    .map(([p, v]) => {
      const ignores = !!client && (propDef(p as Prop).email || []).includes(client);
      if (!ignores) return [p, v] as const;
      return p === "font-family" ? ([p, safeStack(v!)] as const) : null;
    })
    .filter((x): x is readonly [string, string] => !!x)
    .map(([p, v]) => `${cssName(p as Prop)}:${v}${important ? " !important" : ""}`)
    .join(";");

/** What changes from one set of values to another: the rule a breakpoint or state needs. */
const diff = (from: Partial<Record<Prop, string>>, to: Partial<Record<Prop, string>>) => Object.fromEntries(Object.entries(to).filter(([p, v]) => from[p as Prop] !== v)) as Partial<Record<Prop, string>>;

/** The class an element's part carries, for its phone, hover and dark rules. */
const cls = (id: string, part: EmailPartKey) => `c${id}-${part}`;

/**
 * A part's inline style, and its phone, hover and dark rules collected for the <style> block. `skip` leaves out
 * properties placed elsewhere (margins go on the wrapper cell).
 */
function style(ctx: Ctx, id: string, part: EmailPartKey, skip?: (p: Prop) => boolean): { inline: string; className: string; base: Partial<Record<Prop, string>> } {
  const css = cssFor(ctx.opts.client);
  const base = values(ctx, id, part);
  const sel = `.${cls(id, part)}`;
  const phone = diff(base, values(ctx, id, part, "phone"));
  const hover = diff(base, values(ctx, id, part, "base", "hover"));
  const auto = ctx.doc.settings.darkMode === "auto";
  const dark = auto ? diff(base, values(ctx, id, part, "base", "dark", true)) : {};
  // On a phone in dark mode: what differs from what the phone and dark rules show together, written last so it wins.
  const phoneDark = auto ? diff({ ...values(ctx, id, part, "phone"), ...dark }, values(ctx, id, part, "phone", "dark", true)) : {};
  const pd = css(phoneDark, skip, true);
  if (pd) ctx.rules.phoneDark.push(`${sel}{${pd}}`);
  const p = css(phone, skip, true);
  const h = css(hover, skip, true);
  const d = css(dark, skip, true);
  if (p) ctx.rules.phone.push(`${sel}{${p}}`);
  if (h) ctx.rules.hover.push(`${sel}:hover{${h}}`);
  if (d) {
    ctx.rules.dark.push(`${sel}{${d}}`);
    // Outlook.com marks its dark mode with data-ogsc (text colors) and data-ogsb (backgrounds).
    const text = css(dark, (x) => x.startsWith("background") || !!skip?.(x), true);
    const back = css(dark, (x) => !x.startsWith("background") || !!skip?.(x), true);
    if (text) ctx.rules.ogsc.push(`[data-ogsc] ${sel}{${text}}`);
    if (back) ctx.rules.ogsc.push(`[data-ogsb] ${sel}{${back}}`);
  }
  return { inline: css(base, skip), className: p || h || d || pd || ctx.opts.preview ? cls(id, part) : "", base };
}

const attrClass = (c: string) => (c ? ` class="${c}"` : "");
const px = (v: string | undefined, d: number) => {
  const m = /^(-?\d+(?:\.\d+)?)px$/.exec(v ?? "");
  return m ? Number(m[1]) : d;
};

/** A block's margins as padding on the cell around it (Outlook ignores margins). */
function wrapperPadding(base: Partial<Record<Prop, string>>): string {
  const sides = (["top", "right", "bottom", "left"] as const).map((s) => base[`margin-${s}` as Prop]);
  return sides.some((v) => v && v !== "0px" && v !== "0" && v !== "auto") ? `padding:${sides.map((v) => (v && v !== "auto" ? v : "0")).join(" ")};` : "";
}

// Markup -----------------------------------------------------------------------------------------------------------

const encodeCond = (c: EmailCond) => encodeURIComponent(JSON.stringify(c)).replace(/-/g, "%2D");
const IF_OPEN = (c: EmailCond) => `<!--clr-if:${encodeCond(c)}-->`;
const IF_CLOSE = "<!--clr-end-->";

/** Rich text with each paragraph's spacing and each link's look inline (clients drop margins on <p> otherwise). */
function richHtml(ctx: Ctx, id: string, html: string, linkPart: EmailPartKey = "link"): string {
  const link = style(ctx, id, linkPart);
  const linkStyle = `${link.inline};`;
  return html
    .replace(/<p>/g, '<p style="margin:0 0 1em">')
    .replace(/<ul>/g, '<ul style="margin:0 0 1em;padding-left:24px">')
    .replace(/<ol>/g, '<ol style="margin:0 0 1em;padding-left:24px">')
    .replace(/<a href=/g, `<a${attrClass(link.className)} style="${escapeAttr(linkStyle)}" href=`)
    .replace(/(<p style="margin:0 0 1em">)(?![\s\S]*<p style)/, '<p style="margin:0">');
}

function align(a: string | undefined): string {
  return a === "center" || a === "right" ? a : "left";
}

/** A bulletproof button: a padded link, with a VML round-rect for Outlook on Windows. */
function button(ctx: Ctx, id: string, label: string, url: string, where: string, full = false): string {
  const s = style(ctx, id, "button", isMargin);
  const b = s.base;
  const size = px(b["font-size"], 16);
  const padY = px(b["padding-top"], 12);
  const padX = px(b["padding-left"], 24);
  const height = Math.round(size * 1.25 + padY * 2);
  const width = Math.round(label.length * size * 0.6 + padX * 2);
  const radius = px(b["border-top-left-radius"], 0);
  const bg = b["background-color"] ?? "#111111";
  const color = b.color ?? "#ffffff";
  const font = b["font-family"] ?? "sans-serif";
  const safeUrl = escapeAttr(url || "#");
  const text = escapeText(label);
  const vml = `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeUrl}" style="height:${height}px;v-text-anchor:middle;width:${full ? 520 : width}px;" arcsize="${Math.min(50, Math.round((radius / height) * 100))}%" strokecolor="${escapeAttr(bg)}" fillcolor="${escapeAttr(bg)}"><w:anchorlock/><center style="color:${escapeAttr(color)};font-family:${escapeAttr(font)};font-size:${size}px;font-weight:${escapeAttr(String(b["font-weight"] ?? "600"))};">${text}</center></v:roundrect><![endif]-->`;
  const link = `<!--[if !mso]><!--><a href="${safeUrl}"${attrClass(s.className)} style="display:${full ? "block" : "inline-block"};text-align:center;text-decoration:none;mso-padding-alt:0;${escapeAttr(s.inline)}">${text}</a><!--<![endif]-->`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${where}"${full ? ' width="100%"' : ""} style="margin:0${where === "center" ? " auto" : ""}"><tr><td align="center" style="border-radius:${radius}px;background-color:${escapeAttr(bg)}">${vml}${link}</td></tr></table>`;
}

function image(ctx: Ctx, id: string, src: string, alt: string, width: number, url?: string, where = "center", part: EmailPartKey = "image"): string {
  if (!src) {
    ctx.notes.push({ level: "warn", text: "An image has no picture yet.", id });
    return "";
  }
  if (!alt) ctx.notes.push({ level: "warn", text: "An image has no alt text.", id });
  const s = style(ctx, id, part, isMargin);
  const tag = `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" width="${width}"${attrClass(s.className)} style="display:block;width:100%;max-width:${width}px;height:auto;border:0;outline:none;text-decoration:none;${where === "center" ? "margin:0 auto;" : where === "right" ? "margin-left:auto;" : ""}${escapeAttr(s.inline)}">`;
  return url ? `<a href="${escapeAttr(url)}" style="text-decoration:none">${tag}</a>` : tag;
}

function textPart(ctx: Ctx, id: string, part: EmailPartKey, inner: string, tag = "div", extra = ""): string {
  const s = style(ctx, id, part, isMargin);
  return `<${tag}${attrClass(s.className)} style="margin:0;${extra}${escapeAttr(s.inline)}">${inner}</${tag}>`;
}

const SOCIAL_LABEL: Record<string, string> = { linkedin: "LinkedIn", x: "X", facebook: "Facebook", instagram: "Instagram", youtube: "YouTube", github: "GitHub", website: "Website" };

function blockHtml(ctx: Ctx, b: Block, width: number): string {
  switch (b.type) {
    case "heading":
      return textPart(ctx, b.id, "heading", escapeText(b.text), `h${b.level}`);
    case "text":
      return textPart(ctx, b.id, "text", richHtml(ctx, b.id, b.html));
    case "button":
    case "meeting": {
      if (!b.url) ctx.notes.push({ level: "warn", text: `The button "${b.label}" has no link.`, id: b.id });
      return button(ctx, b.id, b.label, b.url, align(b.align), b.type === "button" && b.full);
    }
    case "image":
      return image(ctx, b.id, b.src, b.alt, Math.min(b.width ?? width, width), b.url, align(b.align));
    case "logo":
      return image(ctx, b.id, b.src ?? ctx.opts.logo ?? "", b.alt, Math.min(b.width, width), b.url, align(b.align));
    case "divider": {
      const s = style(ctx, b.id, "divider", isMargin);
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td${attrClass(s.className)} style="font-size:0;line-height:0;${escapeAttr(s.inline)}">&nbsp;</td></tr></table>`;
    }
    case "spacer":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="height:${b.height}px;font-size:0;line-height:0">&nbsp;</td></tr></table>`;
    case "list": {
      const tag = b.ordered ? "ol" : "ul";
      const items = b.items.map((i) => `<li style="margin:0 0 6px">${escapeText(i)}</li>`).join("");
      return textPart(ctx, b.id, "list", items, tag, "padding-left:24px;");
    }
    case "quote":
      return textPart(ctx, b.id, "quote", `${escapeText(b.text).replace(/\n/g, "<br>")}${b.cite ? `<br><span style="font-style:normal;font-size:14px">${escapeText(b.cite)}</span>` : ""}`);
    case "social": {
      const links = b.links.map((l) => `<a href="${escapeAttr(l.url)}" style="color:inherit;text-decoration:none">${SOCIAL_LABEL[l.kind]}</a>`).join("&nbsp;&nbsp;&nbsp;");
      return textPart(ctx, b.id, "social", links || "&nbsp;", "div", `text-align:${align(b.align)};`);
    }
    case "video":
      return image(ctx, b.id, b.thumb, b.alt || "Watch the video", width, b.url, "center");
    case "product": {
      const s = style(ctx, b.id, "card", isMargin);
      const inner = [
        b.image ? image(ctx, b.id, b.image, b.title, width - 40, b.url, "center") + '<div style="height:12px;line-height:12px;font-size:1px">&nbsp;</div>' : "",
        textPart(ctx, b.id, "card-title", escapeText(b.title)),
        b.text ? textPart(ctx, b.id, "text", escapeText(b.text), "div", "padding-top:4px;") : "",
        b.price ? textPart(ctx, b.id, "muted", escapeText(b.price), "div", "padding-top:4px;") : "",
        '<div style="height:12px;line-height:12px;font-size:1px">&nbsp;</div>',
        button(ctx, b.id, b.button, b.url, "left"),
      ].join("");
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td${attrClass(s.className)} style="${escapeAttr(s.inline)}">${inner}</td></tr></table>`;
    }
    case "event": {
      const s = style(ctx, b.id, "card", isMargin);
      const inner = [
        textPart(ctx, b.id, "card-title", escapeText(b.title)),
        textPart(ctx, b.id, "muted", escapeText([b.when, b.where].filter(Boolean).join(", ")), "div", "padding-top:4px;"),
        '<div style="height:12px;line-height:12px;font-size:1px">&nbsp;</div>',
        button(ctx, b.id, b.button, b.url, "left"),
      ].join("");
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td${attrClass(s.className)} style="${escapeAttr(s.inline)}">${inner}</td></tr></table>`;
    }
    case "signature": {
      const pic = b.image ? `<td width="56" valign="top" style="padding-right:12px"><img src="${escapeAttr(b.image)}" alt="" width="48" height="48" style="display:block;width:48px;height:48px;border-radius:24px;border:0"></td>` : "";
      const sub = [b.title, b.company].filter(Boolean).join(", ");
      const words = textPart(ctx, b.id, "text", `<strong>${escapeText(b.name)}</strong>`) + (sub ? textPart(ctx, b.id, "muted", escapeText(sub)) : "");
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${pic}<td valign="middle">${words}</td></tr></table>`;
    }
    case "footer": {
      const link = style(ctx, b.id, "link");
      const unsub = `<a href="{{unsubscribe_url}}"${attrClass(link.className)} style="${escapeAttr(link.inline)}">Unsubscribe</a>`;
      const lines = [b.text ? escapeText(b.text).replace(/\n/g, "<br>") : "", b.address ? escapeText(b.address) : "{{company_address}}", unsub].filter(Boolean);
      return textPart(ctx, b.id, "footer", lines.join("<br>"));
    }
    case "html":
      return b.html;
  }
}

/** Show only on desktop or only on phones. */
function visibility(inner: string, hideOn: "phone" | "desktop" | undefined): string {
  if (hideOn === "phone") return `<div class="clr-hp">${inner}</div>`;
  if (hideOn === "desktop") return `<!--[if !mso]><!--><div class="clr-sp" style="display:none;max-height:0;overflow:hidden;mso-hide:all">${inner}</div><!--<![endif]-->`;
  return inner;
}
const conditional = (inner: string, c: EmailCond | undefined) => (c ? `${IF_OPEN(c)}${inner}${IF_CLOSE}` : inner);

function sectionHtml(ctx: Ctx, s: Section, inner: number): string {
  const sec = style(ctx, s.id, "section", isMargin);
  const padL = px(sec.base["padding-left"], 32);
  const padR = px(sec.base["padding-right"], 32);
  const avail = Math.max(100, inner - padL - padR);
  const mark = (id: string) => (ctx.opts.preview ? ` data-eid="${id}"` : "");
  const colsHtml = (() => {
    if (s.columns.length === 1) {
      const c = s.columns[0]!;
      return `<div${mark(c.id)}>${c.blocks.map((b) => blockRow(ctx, b, avail, mark)).join("")}</div>`;
    }
    const parts: string[] = ['<!--[if mso]><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><![endif]-->'];
    for (const c of s.columns) {
      const w = Math.floor((avail * c.width) / 100);
      const col = style(ctx, c.id, "column", isMargin);
      parts.push(`<!--[if mso]><td width="${w}" valign="top"><![endif]-->`);
      parts.push(
        `<div${mark(c.id)} class="clr-col${s.stackOnPhone ? " clr-stack" : ""}${col.className ? ` ${col.className}` : ""}" style="display:inline-block;vertical-align:top;width:100%;max-width:${w}px;font-size:16px;${escapeAttr(col.inline)}">${c.blocks.map((b) => blockRow(ctx, b, w, mark)).join("")}</div>`,
      );
      parts.push("<!--[if mso]></td><![endif]-->");
    }
    parts.push("<!--[if mso]></tr></table><![endif]-->");
    return parts.join("");
  })();
  const row = `<tr><td${mark(s.id)}${attrClass(sec.className)} style="${s.columns.length > 1 ? "font-size:0;" : ""}${escapeAttr(sec.inline)}">${colsHtml}</td></tr>`;
  return conditional(s.hideOn ? `<tr><td style="padding:0">${visibility(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${row}</table>`, s.hideOn)}</td></tr>` : row, s.showIf);
}

function blockRow(ctx: Ctx, b: Block, width: number, mark: (id: string) => string): string {
  const parts = emailPartsOf(b.type);
  const outer = parts[0] ? values(ctx, b.id, parts[0]) : {};
  const inner = blockHtml(ctx, b, width);
  const pad = `${wrapperPadding(outer)}${b.type === "button" || b.type === "meeting" ? `text-align:${align(b.align)};` : ""}`;
  const cell = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td${mark(b.id)}${pad ? ` style="${pad}"` : ""}>${inner}</td></tr></table>`;
  return conditional(visibility(cell, b.hideOn), b.showIf);
}

// The whole email ----------------------------------------------------------------------------------------------------

export function compileEmail(system: DesignSystem, given: EmailDoc, opts: CompileOpts = {}): Compiled {
  // Component uses get their component's blocks, props and styles.
  const doc = expandComponents(given, system);
  const vars = new Map(allVariables(system, opts.tokens).map((v) => [v.id, v]));
  const ctx: Ctx = { system, doc, vars, opts, rules: { phone: [], hover: [], dark: [], ogsc: [], phoneDark: [] }, notes: [] };
  const width = doc.settings.width;
  const body = style(ctx, "email", "body", isMargin);
  const content = style(ctx, "email", "content", isMargin);
  const bodyBg = body.base["background-color"] ?? "#ffffff";
  const sections = doc.sections.map((s) => sectionHtml(ctx, s, width)).join("");
  if (!doc.sections.some((s) => s.columns.some((c) => c.blocks.some((b) => b.type === "footer")))) ctx.notes.push({ level: "warn", text: "Marketing emails need the Footer block." });
  const fontLink = opts.fontUrl && /^https:\/\/fonts\.googleapis\.com\//.test(opts.fontUrl) ? `<!--[if !mso]><!--><link href="${escapeAttr(opts.fontUrl)}" rel="stylesheet"><!--<![endif]-->` : "";
  const { phone, hover, dark, ogsc, phoneDark } = ctx.rules;
  const styleBlock = [
    "body{margin:0;padding:0;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}",
    "table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0}",
    "img{-ms-interpolation-mode:bicubic}",
    "a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}",
    `@media (max-width:${PHONE}px){.clr-w{width:100%!important}.clr-stack{max-width:100%!important;display:block!important}.clr-hp{display:none!important}.clr-sp{display:block!important;max-height:none!important;overflow:visible!important}${phone.join("")}}`,
    hover.length ? `@media (hover:hover){${hover.join("")}}` : "",
    dark.length ? (opts.forceDark ? dark.join("") : `@media (prefers-color-scheme:dark){${dark.join("")}}${ogsc.join("")}`) : "",
    phoneDark.length ? `@media (max-width:${PHONE}px)${opts.forceDark ? "" : " and (prefers-color-scheme:dark)"}{${phoneDark.join("")}}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const scheme = doc.settings.darkMode === "auto" ? "light dark" : "light";
  const html = `<!doctype html>
<html lang="${escapeAttr(doc.settings.lang)}" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="${scheme}">
<meta name="supported-color-schemes" content="${scheme}">
<title></title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
${fontLink}
<style>
${styleBlock}
</style>
</head>
<body${attrClass(body.className)} style="margin:0;padding:0;background-color:${escapeAttr(bodyBg)}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${escapeAttr(bodyBg)}" style="background-color:${escapeAttr(bodyBg)}"><tr><td align="${doc.settings.align}" style="${escapeAttr(body.inline)}">
<!--[if mso]><table role="presentation" width="${width}" align="${doc.settings.align}" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<div class="clr-w" style="max-width:${width}px;${doc.settings.align === "center" ? "margin:0 auto;" : ""}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"${attrClass(content.className)}${ctx.opts.preview ? ' data-eid="email"' : ""} style="${escapeAttr(content.inline)}">${sections}</table>
</div>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body>
</html>`;
  const size = new TextEncoder().encode(html).length;
  if (size > MAX_EMAIL_BYTES) ctx.notes.push({ level: "block", text: `This email is ${Math.round(size / 1024)} KB. Gmail cuts emails over 102 KB; keep it under 95 KB.` });
  return { html, text: emailText(doc), size, notes: ctx.notes };
}

// Plain text ---------------------------------------------------------------------------------------------------------

function blockText(b: Block): string {
  switch (b.type) {
    case "heading":
      return b.text;
    case "text":
      return htmlToText(b.html);
    case "button":
    case "meeting":
      return b.url ? `${b.label}: ${b.url}` : b.label;
    case "image":
    case "logo":
      return b.url ? `${b.alt} (${b.url})` : "";
    case "divider":
      return "---";
    case "spacer":
      return "";
    case "list":
      return b.items.map((i, n) => `${b.ordered ? `${n + 1}.` : "-"} ${i}`).join("\n");
    case "quote":
      return `"${b.text}"${b.cite ? `\n${b.cite}` : ""}`;
    case "social":
      return b.links.map((l) => `${SOCIAL_LABEL[l.kind]}: ${l.url}`).join("\n");
    case "video":
      return b.url ? `${b.alt || "Watch the video"}: ${b.url}` : "";
    case "product":
      return [b.title, b.text, b.price, b.url ? `${b.button}: ${b.url}` : ""].filter(Boolean).join("\n");
    case "event":
      return [b.title, [b.when, b.where].filter(Boolean).join(", "), b.url ? `${b.button}: ${b.url}` : ""].filter(Boolean).join("\n");
    case "signature":
      return [b.name, [b.title, b.company].filter(Boolean).join(", ")].filter(Boolean).join("\n");
    case "footer":
      return [b.text, b.address ?? "{{company_address}}", "Unsubscribe: {{unsubscribe_url}}"].filter(Boolean).join("\n");
    case "html":
      return htmlToText(b.html);
  }
}

/** The plain text version: every block's words in order, with the same conditions. */
export function emailText(doc: EmailDoc): string {
  const out: string[] = [];
  for (const s of doc.sections) {
    const parts: string[] = [];
    for (const c of s.columns)
      for (const b of c.blocks) {
        const t = blockText(b).trim();
        if (t) parts.push(b.showIf ? `${IF_OPEN(b.showIf)}${t}${IF_CLOSE}` : t);
      }
    if (parts.length) out.push(s.showIf ? `${IF_OPEN(s.showIf)}${parts.join("\n\n")}${IF_CLOSE}` : parts.join("\n\n"));
  }
  return out.join("\n\n");
}

// At send time -------------------------------------------------------------------------------------------------------

/**
 * Keep or drop each conditional part for one person, in HTML or text. Markers that don't read back are dropped with
 * their content, so a damaged condition never shows content meant for someone else.
 */
export function applyConditions(body: string, vars: Record<string, string | null | undefined>): string {
  if (!body.includes("<!--clr-if:")) return body;
  // Innermost first, so nested conditions work.
  const re = /<!--clr-if:([^-]*(?:-(?!->)[^-]*)*)-->((?:(?!<!--clr-if:)[\s\S])*?)<!--clr-end-->/;
  let out = body;
  for (let i = 0; i < 500 && re.test(out); i++)
    out = out.replace(re, (_, enc: string, inner: string) => {
      try {
        const c = JSON.parse(decodeURIComponent(enc)) as EmailCond;
        return condHolds(c, vars) ? inner : "";
      } catch {
        return "";
      }
    });
  return out.replace(/<!--clr-(if:[^>]*|end)-->/g, "");
}
