// Imports (docs/design-system.md Part 7.5): an email from elsewhere as blocks. HTML (pasted, or the HTML part of an
// .eml file) is first cut down to the safe allow list (html.ts), then read: table rows with several cells become
// columns, headings, paragraphs, lists, images, dividers and button-looking links become blocks, and their colors,
// sizes and alignment become the blocks' own styles. MJML maps tag for tag. Anything else stays an HTML block, so
// nothing is lost. The result goes through readEmailDoc like anything saved.

import { checkValue } from "../values.ts";
import type { EmailStyles } from "../model.ts";
import type { Prop } from "../props.ts";
import { newEmailId, readEmailDoc, SOCIAL_KINDS, type Block, type Column, type EmailDoc, type Section, type SocialKind } from "./doc.ts";
import { cleanHtml, escapeAttr, escapeText } from "./html.ts";

type El = { tag: string; attrs: Record<string, string>; kids: Node[] };
type Node = El | string;
export type Imported = { doc: EmailDoc; subject?: string; notes: string[] };

/** A tree from HTML that cleanHtml (or the MJML reader) already made well formed. */
function parse(html: string): El {
  const root: El = { tag: "#root", attrs: {}, kids: [] };
  const stack: El[] = [root];
  const re = /<(\/?)([a-zA-Z][\w-]*)([^<>]*?)(\/?)>|([^<]+)/g;
  for (let m; (m = re.exec(html)); ) {
    const top = stack[stack.length - 1]!;
    if (m[5] !== undefined) {
      top.kids.push(decode(m[5]));
      continue;
    }
    const tag = m[2]!.toLowerCase();
    if (m[1]) {
      const at = stack.map((e) => e.tag).lastIndexOf(tag);
      if (at > 0) stack.length = at;
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of m[3]!.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) attrs[a[1]!.toLowerCase()] = decode(a[2] ?? a[3] ?? a[4] ?? "");
    const el: El = { tag, attrs, kids: [] };
    top.kids.push(el);
    if (!m[4] && !["br", "img", "hr", "mj-image", "mj-divider", "mj-spacer", "mj-social-element", "mj-button"].includes(tag)) stack.push(el);
    else if (tag === "mj-button" || tag === "mj-social-element") stack.push(el);
  }
  return root;
}

const decode = (s: string) => s.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const textOf = (n: Node): string => (typeof n === "string" ? n : n.tag === "br" ? "\n" : n.kids.map(textOf).join(""));
const clean = (s: string) => s.replace(/[ \t\r\n]+/g, " ").trim();
const isEl = (n: Node): n is El => typeof n !== "string";

/** Back to HTML, for rich text (cleanHtml runs on it again). */
function html(n: Node): string {
  if (!isEl(n)) return escapeText(n);
  if (n.tag === "#root") return n.kids.map(html).join("");
  const attrs = Object.entries(n.attrs)
    .filter(([k]) => k === "href")
    .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
    .join("");
  return n.tag === "br" ? "<br>" : `<${n.tag}${attrs}>${n.kids.map(html).join("")}</${n.tag}>`;
}

/** Inline styles worth keeping, as checked values for a part. */
function stylesFrom(style: string | undefined, props: Prop[]): Partial<Record<Prop, string>> {
  const out: Partial<Record<Prop, string>> = {};
  for (const d of (style ?? "").split(";")) {
    const i = d.indexOf(":");
    if (i < 0) continue;
    const name = d.slice(0, i).trim().toLowerCase();
    const value = d.slice(i + 1).trim().replace(/\s*!important$/, "");
    const prop = (name === "background" ? "background-color" : name === "text-decoration" ? "text-decoration-line" : name) as Prop;
    if (!props.includes(prop)) continue;
    const ok = checkValue(prop, value);
    if (ok) out[prop] = ok;
  }
  return out;
}
const TEXT_PROPS: Prop[] = ["color", "font-size", "font-weight", "text-align", "line-height", "font-style", "text-transform", "letter-spacing"];
const BUTTON_PROPS: Prop[] = ["color", "background-color", "font-size", "font-weight"];

class Builder {
  sections: Section[] = [];
  styles: Record<string, EmailStyles> = {};
  notes: string[] = [];
  private col: Block[] | null = null;
  private text: Node[] = [];

  start(): Block[] {
    this.flush();
    const blocks: Block[] = [];
    this.sections.push({ id: newEmailId(), stackOnPhone: true, columns: [{ id: newEmailId(), width: 100, blocks }] });
    this.col = blocks;
    return blocks;
  }
  private target(): Block[] {
    return this.col ?? this.start();
  }
  add(b: Block, style?: Partial<Record<Prop, string>>, part?: keyof EmailStyles) {
    this.flushText();
    this.target().push(b);
    if (style && part && Object.keys(style).length) this.styles[b.id] = { [part]: { base: style } };
  }
  /** Loose words and inline tags gather into one Text block. */
  inline(n: Node) {
    this.text.push(n);
  }
  flushText() {
    const pending = this.text;
    this.text = [];
    const words = clean(pending.map(textOf).join(""));
    if (words) this.target().push({ id: newEmailId(), type: "text", html: cleanHtml(`<p>${pending.map(html).join("").trim()}</p>`, "rich") });
  }
  flush() {
    this.flushText();
    this.col = null;
  }
  /** A row of cells side by side: one section with a column each. */
  columns(cells: El[], walk: (n: Node, b: Builder) => void) {
    this.flush();
    const cols: Column[] = cells.slice(0, 4).map((c) => {
      const sub = new Builder();
      sub.start();
      for (const k of c.kids) walk(k, sub);
      sub.flush();
      Object.assign(this.styles, sub.styles);
      this.notes.push(...sub.notes);
      const width = Number(/^(\d+)%$/.exec(c.attrs.width ?? "")?.[1]) || 0;
      return { id: newEmailId(), width: width || Math.round(100 / cells.length), blocks: sub.sections.flatMap((s) => s.columns.flatMap((x) => x.blocks)) };
    });
    this.sections.push({ id: newEmailId(), stackOnPhone: true, columns: cols });
    this.col = null;
  }
}

const INLINE = new Set(["b", "strong", "i", "em", "u", "s", "a", "span", "small", "sup", "sub", "br"]);
const looksLikeButton = (a: El, cell?: El) => /background(-color)?\s*:/.test(a.attrs.style ?? "") || /padding\s*:/.test(a.attrs.style ?? "") || !!cell?.attrs.bgcolor;

function walkHtml(n: Node, b: Builder, cell?: El): void {
  if (!isEl(n)) {
    if (n.trim()) b.inline(n);
    return;
  }
  const t = n.tag;
  if (t === "a" && n.attrs.href && looksLikeButton(n, cell) && clean(textOf(n)).length <= 60 && !n.kids.some((k) => isEl(k) && k.tag === "img")) {
    return b.add({ id: newEmailId(), type: "button", label: clean(textOf(n)), url: n.attrs.href, align: "left" }, stylesFrom(n.attrs.style, BUTTON_PROPS), "button");
  }
  if (t === "a" && n.kids.length === 1 && isEl(n.kids[0]!) && n.kids[0].tag === "img") return walkImg(n.kids[0], b, n.attrs.href);
  if (INLINE.has(t)) return b.inline(n);
  if (t === "img") return walkImg(n, b);
  if (t === "hr") return b.add({ id: newEmailId(), type: "divider" });
  if (/^h[1-6]$/.test(t)) {
    const text = clean(textOf(n));
    if (text) b.add({ id: newEmailId(), type: "heading", text, level: Math.min(3, Number(t[1])) as 1 | 2 | 3 }, stylesFrom(n.attrs.style, TEXT_PROPS), "heading");
    return;
  }
  if (t === "ul" || t === "ol") {
    const items = n.kids.filter((k): k is El => isEl(k) && k.tag === "li").map((li) => clean(textOf(li))).filter(Boolean);
    if (items.length) b.add({ id: newEmailId(), type: "list", items, ordered: t === "ol" });
    return;
  }
  if (t === "blockquote") {
    const text = clean(textOf(n));
    if (text) b.add({ id: newEmailId(), type: "quote", text });
    return;
  }
  if (t === "p") {
    b.flushText();
    for (const k of n.kids) walkHtml(k, b, cell);
    const style = stylesFrom(n.attrs.style, TEXT_PROPS);
    b.flushText();
    // The paragraph's own look goes on the Text block just made.
    if (Object.keys(style).length) {
      const last = b.sections.at(-1)?.columns.at(-1)?.blocks.at(-1);
      if (last?.type === "text" && !b.styles[last.id]) b.styles[last.id] = { text: { base: style } };
    }
    return;
  }
  if (t === "table" || t === "tbody") {
    for (const k of n.kids) walkHtml(k, b, cell);
    return;
  }
  if (t === "tr") {
    const hasImg = (e: El): boolean => e.kids.some((k) => isEl(k) && (k.tag === "img" || hasImg(k)));
    const cells = n.kids.filter((k): k is El => isEl(k) && (k.tag === "td" || k.tag === "th") && (!!clean(textOf(k)) || hasImg(k)));
    if (cells.length >= 2) return b.columns(cells, (k, sub) => walkHtml(k, sub));
    for (const c of cells) for (const k of c.kids) walkHtml(k, b, c);
    b.flushText();
    return;
  }
  // div, td, center and the rest: their insides, with a break before and after.
  b.flushText();
  for (const k of n.kids) walkHtml(k, b, t === "td" || t === "th" ? n : cell);
  b.flushText();
}

function walkImg(n: El, b: Builder, href?: string) {
  const src = n.attrs.src ?? "";
  if (!/^https:\/\//.test(src)) {
    b.notes.push("An image that wasn't on https was left out.");
    return;
  }
  const w = Number(n.attrs.width);
  // Tracking pixels and spacers aren't content.
  if (w && w <= 2) return;
  b.add({ id: newEmailId(), type: "image", src, alt: n.attrs.alt ?? "", ...(href ? { url: href } : {}), ...(w ? { width: w } : {}), align: "center" });
}

/** HTML (a whole email or a piece of one) as blocks. */
export function importHtml(source: string): Imported {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(source)?.[1] ?? source;
  const preheader = /<div[^>]*display\s*:\s*none[^>]*>([\s\S]*?)<\/div>/i.exec(body)?.[1];
  const safe = cleanHtml(preheader ? body.replace(/<div[^>]*display\s*:\s*none[^>]*>[\s\S]*?<\/div>/i, "") : body, "block");
  const b = new Builder();
  walkHtml(parse(safe), b);
  b.flush();
  const title = /<title>([^<]*)<\/title>/i.exec(source)?.[1];
  return finish(b, preheader ? clean(decode(preheader.replace(/<[^>]+>/g, ""))) : "", title ? clean(decode(title)) : undefined);
}

function finish(b: Builder, preheader: string, subject?: string): Imported {
  const hasFooter = b.sections.some((s) => s.columns.some((c) => c.blocks.some((x) => x.type === "footer")));
  const sections = b.sections.filter((s) => s.columns.some((c) => c.blocks.length));
  // An imported email's own unsubscribe text stays as written; the Footer block is what sends need.
  if (!hasFooter) sections.push({ id: newEmailId(), stackOnPhone: true, columns: [{ id: newEmailId(), width: 100, blocks: [{ id: newEmailId(), type: "footer" }] }] });
  const doc = readEmailDoc({ v: 1, settings: { preheader }, sections, styles: b.styles }, { allowHtml: true });
  return { doc, ...(subject ? { subject } : {}), notes: [...new Set(b.notes)] };
}

// MJML ---------------------------------------------------------------------------------------------------------------

const SOCIAL_MAP: Record<string, SocialKind> = { linkedin: "linkedin", twitter: "x", x: "x", facebook: "facebook", instagram: "instagram", youtube: "youtube", github: "github", web: "website" };

/** MJML tag for tag: sections, columns and their content blocks. */
export function importMjml(source: string): Imported {
  // MJML is XML-like; keep only its tags and the HTML inside mj-text and mj-raw (cleaned when used).
  const tree = parse(source.replace(/<!--[\s\S]*?-->/g, "").replace(/<mj-(style|attributes|font|breakpoint)\b[\s\S]*?<\/mj-\1>/gi, ""));
  const b = new Builder();
  const preview = find(tree, "mj-preview");
  const title = find(tree, "mj-title");
  const body = find(tree, "mj-body") ?? tree;
  const sectionOf = (s: El) => {
    const cols = s.kids.filter((k): k is El => isEl(k) && (k.tag === "mj-column" || k.tag === "mj-group")).flatMap((k) => (k.tag === "mj-group" ? k.kids.filter((x): x is El => isEl(x) && x.tag === "mj-column") : [k]));
    if (!cols.length) return;
    b.flush();
    const columns: Column[] = cols.slice(0, 4).map((c) => {
      const blocks: Block[] = [];
      for (const k of c.kids) if (isEl(k)) blocks.push(...mjBlock(k, b));
      return { id: newEmailId(), width: Number(/^(\d+)%$/.exec(c.attrs.width ?? "")?.[1]) || Math.round(100 / cols.length), blocks };
    });
    b.sections.push({ id: newEmailId(), stackOnPhone: true, columns });
  };
  for (const k of body.kids) {
    if (!isEl(k)) continue;
    if (k.tag === "mj-section") sectionOf(k);
    else if (k.tag === "mj-wrapper") for (const s of k.kids) if (isEl(s) && s.tag === "mj-section") sectionOf(s);
  }
  return finish(b, preview ? clean(textOf(preview)) : "", title ? clean(textOf(title)) : undefined);
}

function find(n: El, tag: string): El | null {
  for (const k of n.kids) {
    if (!isEl(k)) continue;
    if (k.tag === tag) return k;
    const f = find(k, tag);
    if (f) return f;
  }
  return null;
}

function mjBlock(k: El, b: Builder): Block[] {
  const id = newEmailId();
  const align = (k.attrs.align === "center" || k.attrs.align === "right" ? k.attrs.align : "left") as "left" | "center" | "right";
  switch (k.tag) {
    case "mj-text": {
      const inner = k.kids.map(html).join("");
      const style = stylesFrom(`color:${k.attrs.color ?? ""};font-size:${k.attrs["font-size"] ?? ""};text-align:${k.attrs.align ?? ""};line-height:${k.attrs["line-height"] ?? ""}`, TEXT_PROPS);
      if (Object.keys(style).length) b.styles[id] = { text: { base: style } };
      return [{ id, type: "text", html: cleanHtml(/<(p|div|h\d)\b/.test(inner) ? inner : `<p>${inner}</p>`, "rich") }];
    }
    case "mj-button": {
      const style = stylesFrom(`color:${k.attrs.color ?? ""};background-color:${k.attrs["background-color"] ?? ""};font-size:${k.attrs["font-size"] ?? ""}`, BUTTON_PROPS);
      if (Object.keys(style).length) b.styles[id] = { button: { base: style } };
      return [{ id, type: "button", label: clean(textOf(k)) || "Learn more", url: k.attrs.href ?? "", align }];
    }
    case "mj-image": {
      const src = k.attrs.src ?? "";
      if (!/^https:\/\//.test(src)) {
        b.notes.push("An image that wasn't on https was left out.");
        return [];
      }
      const w = parseInt(k.attrs.width ?? "", 10);
      return [{ id, type: "image", src, alt: k.attrs.alt ?? "", ...(k.attrs.href ? { url: k.attrs.href } : {}), ...(w ? { width: w } : {}), align: align === "left" && !k.attrs.align ? "center" : align }];
    }
    case "mj-divider":
      return [{ id, type: "divider" }];
    case "mj-spacer":
      return [{ id, type: "spacer", height: parseInt(k.attrs.height ?? "", 10) || 24 }];
    case "mj-social":
      return [
        {
          id,
          type: "social",
          align: "center",
          links: k.kids
            .filter((x): x is El => isEl(x) && x.tag === "mj-social-element")
            .map((x) => ({ kind: SOCIAL_MAP[(x.attrs.name ?? "").replace(/-noshare$/, "")] ?? ("website" as SocialKind), url: x.attrs.href ?? "" }))
            .filter((l) => SOCIAL_KINDS.includes(l.kind) && l.url),
        },
      ];
    case "mj-raw":
      b.notes.push("Raw HTML came in as an HTML block.");
      return [{ id, type: "html", html: cleanHtml(k.kids.map(html).join(""), "block") }];
    default:
      return [];
  }
}

// .eml ---------------------------------------------------------------------------------------------------------------

/** An .eml file: its subject, and its HTML part (or its text, as paragraphs). */
export function importEml(source: string): Imported {
  const { headers, body } = splitMime(source);
  const subject = decodeHeader(headers.subject ?? "");
  const part = htmlPart(headers, body);
  if (part?.html) {
    const r = importHtml(part.html);
    return { ...r, ...(subject ? { subject } : {}) };
  }
  const text = part?.text ?? body;
  const b = new Builder();
  for (const para of text.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean)) b.add({ id: newEmailId(), type: "text", html: `<p>${escapeText(para).replace(/\n/g, "<br>")}</p>` });
  return { ...finish(b, ""), ...(subject ? { subject } : {}) };
}

function splitMime(s: string): { headers: Record<string, string>; body: string } {
  const at = s.search(/\r?\n\r?\n/);
  const head = at < 0 ? s : s.slice(0, at);
  const body = at < 0 ? "" : s.slice(at).replace(/^\r?\n\r?\n/, "");
  const headers: Record<string, string> = {};
  for (const line of head.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return { headers, body };
}

function decodeBody(body: string, enc: string | undefined, charset = "utf-8"): string {
  const e = (enc ?? "").toLowerCase();
  let bytes: Uint8Array;
  if (e === "base64") bytes = Uint8Array.from(atob(body.replace(/\s+/g, "")), (c) => c.charCodeAt(0));
  else if (e === "quoted-printable") {
    const raw = body.replace(/=\r?\n/g, "");
    const out: number[] = [];
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === "=" && /^[0-9A-F]{2}$/i.test(raw.slice(i + 1, i + 3))) {
        out.push(parseInt(raw.slice(i + 1, i + 3), 16));
        i += 2;
      } else out.push(raw.charCodeAt(i) & 0xff);
    }
    bytes = new Uint8Array(out);
  } else return body;
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

function htmlPart(headers: Record<string, string>, body: string, depth = 0): { html?: string; text?: string } | null {
  const type = (headers["content-type"] ?? "text/plain").toLowerCase();
  const charset = /charset="?([\w-]+)"?/i.exec(headers["content-type"] ?? "")?.[1] ?? "utf-8";
  if (type.startsWith("text/html")) return { html: decodeBody(body, headers["content-transfer-encoding"], charset) };
  if (type.startsWith("text/plain")) return { text: decodeBody(body, headers["content-transfer-encoding"], charset) };
  const boundary = /boundary="?([^";]+)"?/i.exec(headers["content-type"] ?? "")?.[1];
  if (!type.startsWith("multipart/") || !boundary || depth > 4) return null;
  let text: string | undefined;
  for (const piece of body.split(`--${boundary}`).slice(1)) {
    if (piece.startsWith("--")) break;
    const sub = splitMime(piece.replace(/^\r?\n/, ""));
    const r = htmlPart(sub.headers, sub.body, depth + 1);
    if (r?.html) return r;
    if (r?.text && !text) text = r.text;
  }
  return text ? { text } : null;
}

/** A header in RFC 2047 words (=?utf-8?B?...?=) as text. */
function decodeHeader(v: string): string {
  return v
    .replace(/=\?([\w-]+)\?([BQ])\?([^?]*)\?=/gi, (_, cs: string, enc: string, data: string) =>
      enc.toUpperCase() === "B" ? decodeBody(data, "base64", cs) : decodeBody(data.replace(/_/g, " "), "quoted-printable", cs),
    )
    .trim()
    .slice(0, 200);
}

/** What was pasted or dropped: MJML, an .eml file or HTML. */
export function importAny(source: string): Imported {
  const s = source.slice(0, 5_000_000);
  if (/^\s*<mjml[\s>]/i.test(s)) return importMjml(s);
  if (/^(received|from|subject|mime-version|content-type|return-path|date|to|message-id):/im.test(s.slice(0, 2000)) && /\r?\n\r?\n/.test(s)) return importEml(s);
  return importHtml(s);
}
