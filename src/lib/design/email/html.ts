// Rich text and HTML blocks in emails (docs/design-system.md Parts 4.1 and 10): only tags and attributes on an
// allow list survive, links must be https, http, mailto, tel or a merge tag, and everything else is escaped, so
// nothing written into an email can run script, load a frame or break out of its block. No DOM needed: it runs on
// the server and in the browser the same way.

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Text for HTML: escaped, keeping entities that are already written. */
export const escapeText = (s: string) => s.replace(/&(?!(?:[a-z]{2,8}|#\d{1,6}|#x[0-9a-f]{1,6});)/gi, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const escapeAttr = esc;

/** A link people can follow: https, http, mailto, tel, or a merge tag that becomes one ({{unsubscribe_url}}). */
export function safeHref(raw: string): string | null {
  const v = raw.trim().replace(/[\u0000-\u001f\u007f\s]+/g, (m) => (m.trim() ? "" : m === " " ? "%20" : ""));
  if (/^\{\{\s*[a-z_][a-z0-9_.]{0,60}\s*(\|[^}]{0,60})?\}\}$/i.test(v)) return v;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(v) && v.length <= 2000 && !/["'<>`\\]/.test(v)) return v;
  return null;
}

// Rich text: what the Text block's editor writes. Rich HTML blocks (owners only) allow more.
const RICH: Record<string, string[]> = { b: [], strong: [], i: [], em: [], u: [], s: [], a: ["href"], br: [], p: [], ul: [], ol: [], li: [], span: [] };
const BLOCK: Record<string, string[]> = /* @__PURE__ */ Object.assign({}, RICH, {
  h1: [],
  h2: [],
  h3: [],
  h4: [],
  div: ["align"],
  table: ["width", "align", "cellpadding", "cellspacing", "border", "role", "bgcolor"],
  tbody: [],
  tr: [],
  td: ["width", "align", "valign", "colspan", "rowspan", "bgcolor"],
  th: ["width", "align", "valign", "colspan", "rowspan", "bgcolor"],
  img: ["src", "alt", "width", "height"],
  hr: [],
  blockquote: [],
  small: [],
  sup: [],
  sub: [],
  center: [],
});
const VOID = /* @__PURE__ */ new Set(["br", "img", "hr"]);
// A style attribute in an HTML block keeps only these, with plain values.
const STYLE_PROPS = /* @__PURE__ */ new Set(["color", "background-color", "font-size", "font-weight", "font-style", "text-align", "text-decoration", "line-height", "padding", "margin", "border", "border-radius", "width", "max-width", "height", "display"]);

function cleanStyle(raw: string): string {
  const out: string[] = [];
  for (const d of raw.split(";")) {
    const i = d.indexOf(":");
    if (i < 0) continue;
    const p = d.slice(0, i).trim().toLowerCase();
    const v = d.slice(i + 1).trim();
    if (!STYLE_PROPS.has(p) || !v || v.length > 80 || /[<>"'`\\(){}]|expression|url|@/i.test(v)) continue;
    out.push(`${p}:${v}`);
  }
  return out.join(";");
}

/**
 * HTML cut down to an allow list. `rich` is the Text block's set; `block` adds layout tags, images and simple inline
 * styles for HTML blocks. Comments, scripts, styles and anything unknown are dropped (unknown tags keep their text).
 */
export function cleanHtml(input: string, mode: "rich" | "block" = "rich"): string {
  const allow = mode === "rich" ? RICH : BLOCK;
  const src = input.slice(0, 200_000).replace(/<!--[\s\S]*?(-->|$)/g, "").replace(/<(script|style|iframe|object|embed|noscript|template|title|head|svg|math)\b[\s\S]*?(<\/\1\s*>|$)/gi, "");
  let out = "";
  const open: string[] = [];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^<>]*)>|([^<]+)|(<)/g;
  for (let m; (m = re.exec(src)); ) {
    if (m[3] !== undefined) {
      out += escapeText(m[3]);
      continue;
    }
    if (m[4]) {
      out += "&lt;";
      continue;
    }
    const tag = m[1]!.toLowerCase();
    const closing = m[0].startsWith("</");
    const attrsAllowed = allow[tag];
    if (!attrsAllowed) continue;
    if (closing) {
      const at = open.lastIndexOf(tag);
      if (at < 0) continue;
      while (open.length > at) out += `</${open.pop()}>`;
      continue;
    }
    const attrs: string[] = [];
    const ar = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    for (let a; (a = ar.exec(m[2]!)); ) {
      const name = a[1]!.toLowerCase();
      const value = (a[2] ?? a[3] ?? a[4] ?? "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
      if (name === "style" && mode === "block") {
        const s = cleanStyle(value);
        if (s) attrs.push(`style="${esc(s)}"`);
        continue;
      }
      if (!attrsAllowed.includes(name)) continue;
      if (name === "href") {
        const h = safeHref(value);
        if (h) attrs.push(`href="${esc(h)}"`);
      } else if (name === "src") {
        if (/^https:\/\/[^\s"'<>`]{4,1500}$/.test(value)) attrs.push(`src="${esc(value)}"`);
      } else if (/^(width|height|cellpadding|cellspacing|border|colspan|rowspan)$/.test(name)) {
        if (/^\d{1,4}%?$/.test(value)) attrs.push(`${name}="${value}"`);
      } else if (name === "align" || name === "valign") {
        if (/^(left|right|center|top|middle|bottom)$/i.test(value)) attrs.push(`${name}="${value.toLowerCase()}"`);
      } else if (name === "bgcolor") {
        if (/^#?[0-9a-f]{3,8}$/i.test(value)) attrs.push(`bgcolor="${value}"`);
      } else if (name === "role") {
        if (value === "presentation") attrs.push('role="presentation"');
      } else attrs.push(`${name}="${esc(value.slice(0, 300))}"`);
    }
    if (tag === "a" && !attrs.some((a) => a.startsWith("href="))) continue;
    out += `<${tag}${attrs.length ? ` ${attrs.join(" ")}` : ""}>`;
    if (!VOID.has(tag)) open.push(tag);
  }
  while (open.length) out += `</${open.pop()}>`;
  return out;
}

/** The words in some HTML, for plain text: block ends become line breaks, links become "text (url)". */
export function htmlToText(html: string): string {
  return html
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, text: string) => {
      const t = text.replace(/<[^>]+>/g, "").trim();
      const h = href.replace(/&amp;/g, "&");
      return t && t !== h ? `${t} (${h})` : h;
    })
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|ul|ol|table)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
