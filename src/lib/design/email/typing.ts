// Typing in place on the canvas (docs/email-canvas-b3.md): which blocks type and how, the words a block shows while
// it's typed in (merge tags as written), the block change from what was typed, and the paste rules (rich HTML cut to
// the Text block's allow list, plain text as paragraphs, Markdown as inline formatting or as new blocks). Pure; no DOM.

import { cleanHtml, escapeText, safeHref } from "./html.ts";
import type { Block } from "./doc.ts";

export type TypeMode = "line" | "rich" | "items" | "lines";
type Typable = Extract<Block, { type: "heading" | "text" | "button" | "meeting" | "list" | "quote" }>;

/** How a block types: one plain line, rich text, one item per line, or plain lines. Null when it doesn't type. */
export function typeMode(b: Block): TypeMode | null {
  switch (b.type) {
    case "heading":
    case "button":
    case "meeting":
      return "line";
    case "text":
      return "rich";
    case "list":
      return "items";
    case "quote":
      return "lines";
    default:
      return null;
  }
}
export const typable = (b: Block): b is Typable => typeMode(b) !== null;

/** The part a block's words sit in, for its class (`c<id>-<part>`). */
export const typePart = (b: Typable): "heading" | "text" | "button" | "list" | "quote" => (b.type === "meeting" ? "button" : b.type);

/** The HTML put into the part when typing starts: the words as written (merge tags as {{first_name}}). */
export function typeSource(b: Typable): string {
  switch (b.type) {
    case "heading":
      return escapeText(b.text);
    case "button":
    case "meeting":
      return escapeText(b.label);
    case "text":
      return b.html || "<p><br></p>";
    case "list":
      return (b.items.length ? b.items : [""]).map((i) => `<li style="margin:0 0 6px">${escapeText(i) || "<br>"}</li>`).join("");
    case "quote":
      return escapeText(b.text).replace(/\n/g, "<br>") || "<br>";
  }
}

/** What the browser wrote, as the Text block keeps it: div lines as paragraphs, strike as s, then the allow list. */
export function cleanTyped(html: string): string {
  let h = html
    .replace(/<div(\s[^>]*)?>/gi, "<p>")
    .replace(/<\/div>/gi, "</p>")
    .replace(/<(\/?)(strike|del)(\s[^>]*)?>/gi, "<$1s>")
    .replace(/<(\/?)strong(\s[^>]*)?>/gi, "<$1b>")
    .replace(/<(\/?)em(\s[^>]*)?>/gi, "<$1i>")
    .replace(/&nbsp;/g, " ");
  h = cleanHtml(h, "rich")
    .replace(/<span>([\s\S]*?)<\/span>/g, "$1")
    .replace(/<p>\s*(<br>)?\s*<\/p>/g, "<p><br></p>");
  // Words loose at the top level go into a paragraph, and empty paragraphs at the ends go.
  if (h && !/^<(p|ul|ol)>/.test(h)) h = h.replace(/^([\s\S]*?)(?=<(p|ul|ol)>|$)/, (m) => (m.trim() ? `<p>${m}</p>` : ""));
  h = h.replace(/^(<p><br><\/p>)+/, "").replace(/(<p><br><\/p>)+$/, "");
  return h;
}

const oneLine = (t: string) => t.replace(/\s+/g, " ").trim();

/** The block change from what was typed: `html` is the part's HTML, `text` its words with line breaks. */
export function typedPatch(b: Typable, typed: { html: string; text: string; items?: string[] }): Partial<Block> {
  switch (b.type) {
    case "heading":
      return { text: oneLine(typed.text).slice(0, 300) } as Partial<Block>;
    case "button":
    case "meeting":
      return { label: oneLine(typed.text).slice(0, 80) } as Partial<Block>;
    case "text":
      return { html: cleanTyped(typed.html) } as Partial<Block>;
    case "list": {
      const items = (typed.items ?? typed.text.split("\n")).map(oneLine).filter(Boolean);
      return { items: items.length ? items : [""] } as Partial<Block>;
    }
    case "quote":
      return { text: typed.text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim() } as Partial<Block>;
  }
}

// Paste -------------------------------------------------------------------------------------------------------------

/** Plain text as paragraphs: a blank line starts one, a single line break stays a break. */
export function plainToRich(text: string): string {
  return text
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeText(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Markdown's inline marks as the Text block's HTML: bold, italic, strike and links (unsafe links stay words). */
export function inlineMarkdown(text: string): string {
  let h = escapeText(text);
  h = h.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t: string, url: string) => {
    const href = safeHref(url.replace(/&amp;/g, "&"));
    return href ? `<a href="${href.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">${t}</a>` : t;
  });
  h = h.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/__([^_]+)__/g, "<b>$1</b>");
  h = h.replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\*)/g, "$1<i>$2</i>").replace(/(^|[^_\w])_([^_\s][^_]*)_(?!_)/g, "$1<i>$2</i>");
  h = h.replace(/~~([^~]+)~~/g, "<s>$1</s>");
  return h;
}

export type PasteBlock = { type: "heading"; text: string; level: 1 | 2 | 3 | 4 | 5 | 6 } | { type: "list"; items: string[]; ordered: boolean } | { type: "text"; html: string };

const HEAD = /^(#{1,6})\s+(.+)$/;
const ITEM = /^\s*(?:[-*+]|(\d+)[.)])\s+(.+)$/;
const INLINE = /\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\[[^\]]+\]\([^)\s]+\)|(^|\s)\*[^*\s][^*]*\*(\s|$)/;

/** Whether plain text reads as Markdown: a heading or list line, or inline marks. */
export function looksLikeMarkdown(text: string): boolean {
  const lines = text.replace(/\r/g, "").split("\n");
  return lines.some((l) => HEAD.test(l) || ITEM.test(l)) || INLINE.test(text);
}

/** Markdown as blocks: headings, lists (bulleted or numbered) and runs of paragraphs. Strips the marks it reads. */
export function markdownBlocks(text: string): PasteBlock[] {
  const out: PasteBlock[] = [];
  let para: string[] = [];
  let list: { items: string[]; ordered: boolean } | null = null;
  const flushPara = () => {
    const ps = para.join("\n").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    if (ps.length) out.push({ type: "text", html: ps.map((p) => `<p>${inlineMarkdown(p).replace(/\n/g, "<br>")}</p>`).join("") });
    para = [];
  };
  const flushList = () => {
    if (list?.items.length) out.push({ type: "list", items: list.items, ordered: list.ordered });
    list = null;
  };
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const h = HEAD.exec(raw);
    const it = ITEM.exec(raw);
    if (h) {
      flushPara();
      flushList();
      out.push({ type: "heading", text: stripMarks(h[2]!).slice(0, 300), level: Math.min(6, h[1]!.length) as 1 | 2 | 3 | 4 | 5 | 6 });
    } else if (it) {
      flushPara();
      const ordered = !!it[1];
      if (list && list.ordered !== ordered) flushList();
      list ??= { items: [], ordered };
      list.items.push(stripMarks(it[2]!));
    } else {
      flushList();
      para.push(raw);
    }
  }
  flushPara();
  flushList();
  return out;
}

/** Words without Markdown's marks (lists and headings keep plain words). */
export function stripMarks(t: string): string {
  return t
    .replace(/\[([^\]]+)\]\([^)\s]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, "$1$2")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/(^|\W)[*_]([^*_]+)[*_](?=\W|$)/g, "$1$2")
    .trim();
}

/**
 * What a Markdown paste does in a text block: one paragraph of inline marks goes in at the caret (`inline`); anything
 * with a heading or list becomes blocks after this one (`blocks`).
 */
export function markdownPaste(text: string): { inline: string } | { blocks: PasteBlock[] } {
  const blocks = markdownBlocks(text);
  if (blocks.length === 1 && blocks[0]!.type === "text") {
    const one = blocks[0].html.replace(/^<p>([\s\S]*)<\/p>$/, "$1");
    if (!one.includes("<p>")) return { inline: one };
  }
  return { blocks };
}
