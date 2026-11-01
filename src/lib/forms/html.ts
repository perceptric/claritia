// HTML sections on forms (docs/ai-form-builder.md): the hero, picture-and-text and proof sections the AI writes.
// The HTML is cleaned to a short list of tags and attributes, the same way in the browser and on the server, so a
// section can never run a script, load a frame, post a form or reach a private address. Questions, sliders and
// results stay native fields; sections are only words, pictures and layout.

const TAGS = new Set(["section", "div", "header", "footer", "article", "aside", "figure", "figcaption", "h1", "h2", "h3", "h4", "p", "span", "strong", "b", "em", "i", "small", "br", "hr", "ul", "ol", "li", "blockquote", "img", "a"]);
/** Tags dropped with everything inside them. */
const DROP = new Set(["script", "style", "iframe", "object", "embed", "form", "input", "button", "select", "textarea", "svg", "math", "template", "noscript", "link", "meta", "base", "frame", "frameset", "video", "audio", "canvas"]);
const ATTRS = new Set(["class", "style", "alt", "href", "src", "width", "height", "title", "role", "aria-label", "aria-hidden"]);
// Style properties a section may set: layout, spacing, type and color. Never position, behavior or remote content.
const PROPS = new Set([
  "display", "flex", "flex-direction", "flex-wrap", "flex-basis", "flex-grow", "flex-shrink", "gap", "row-gap", "column-gap", "grid-template-columns", "grid-column", "align-items", "align-self", "justify-content", "justify-items", "place-items",
  "width", "max-width", "min-width", "height", "max-height", "min-height", "aspect-ratio", "object-fit", "object-position", "overflow",
  "margin", "margin-top", "margin-bottom", "margin-left", "margin-right", "margin-inline", "margin-block", "padding", "padding-top", "padding-bottom", "padding-left", "padding-right", "padding-inline", "padding-block",
  "color", "background", "background-color", "opacity", "border", "border-top", "border-bottom", "border-left", "border-right", "border-color", "border-width", "border-style", "border-radius",
  "font-size", "font-weight", "font-style", "font-family", "line-height", "letter-spacing", "text-align", "text-transform", "text-decoration", "text-wrap", "white-space", "list-style", "vertical-align",
]);
const MAX = 20_000;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** Only https links and pictures, and mailto links; never javascript:, data:, or an address with a user in it. */
function safeHref(v: string, img: boolean): string | null {
  const t = v.trim();
  if (!img && /^mailto:[^\s<>"]+$/i.test(t)) return t;
  if (!img && /^#[\w-]{1,60}$/.test(t)) return t;
  try {
    const u = new URL(t);
    if (u.protocol !== "https:" || u.username || u.password) return null;
    const h = u.hostname;
    if (h === "localhost" || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(h) || h.endsWith(".internal") || h.endsWith(".local") || !h.includes(".")) return null;
    return u.href;
  } catch {
    return null;
  }
}

/** The style attribute with only allowed properties and no urls, expressions or escapes. */
export function cleanStyle(raw: string): string {
  return raw
    .split(";")
    .map((d) => {
      const at = d.indexOf(":");
      if (at < 1) return "";
      const k = d.slice(0, at).trim().toLowerCase();
      const v = d.slice(at + 1).trim();
      if (!PROPS.has(k) || !v || v.length > 200) return "";
      if (/url\s*\(|expression|javascript:|@import|\\|<|>/i.test(v)) return "";
      return `${k}:${v}`;
    })
    .filter(Boolean)
    .join(";");
}

/** HTML a form section may hold: the allowed tags and attributes, safe links and pictures, nothing else. */
export function cleanHtml(raw: string): string {
  const src = String(raw ?? "").slice(0, MAX * 2);
  let out = "";
  let i = 0;
  const open: string[] = [];
  let dropping: string | null = null;
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    const text = lt < 0 ? src.slice(i) : src.slice(i, lt);
    if (!dropping && text) out += esc(unesc(text));
    if (lt < 0) break;
    // A comment or a declaration: skipped.
    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt + 4);
      i = end < 0 ? src.length : end + 3;
      continue;
    }
    // A "<" that doesn't start a tag is just text.
    if (!/^<[a-zA-Z/!]/.test(src.slice(lt, lt + 2))) {
      if (!dropping) out += "&lt;";
      i = lt + 1;
      continue;
    }
    const gt = src.indexOf(">", lt);
    if (gt < 0) break;
    const tag = src.slice(lt + 1, gt);
    i = gt + 1;
    const m = /^(\/?)([a-zA-Z][a-zA-Z0-9-]*)([\s\S]*?)(\/?)$/.exec(tag.trim());
    if (!m) continue;
    const closing = m[1] === "/";
    const name = m[2]!.toLowerCase();
    if (dropping) {
      if (closing && name === dropping) dropping = null;
      continue;
    }
    if (DROP.has(name)) {
      if (!closing && m[4] !== "/") dropping = name;
      continue;
    }
    if (!TAGS.has(name)) continue;
    if (closing) {
      const at = open.lastIndexOf(name);
      if (at >= 0) {
        for (const t of open.splice(at).reverse()) out += `</${t}>`;
      }
      continue;
    }
    const attrs: string[] = [];
    const re = /([a-zA-Z][a-zA-Z0-9-]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    let a: RegExpExecArray | null;
    while ((a = re.exec(m[3]!))) {
      const k = a[1]!.toLowerCase();
      const v = unesc(a[3] ?? a[4] ?? a[5] ?? "");
      if (!ATTRS.has(k)) continue;
      if (k === "href" || k === "src") {
        if ((k === "src") !== (name === "img")) continue;
        const ok = safeHref(v, k === "src");
        if (ok) attrs.push(`${k}="${esc(ok)}"`);
      } else if (k === "style") {
        const st = cleanStyle(v);
        if (st) attrs.push(`style="${esc(st)}"`);
      } else if (k === "class") {
        const c = v.split(/\s+/).filter((x) => /^[a-z][a-z0-9_-]{0,40}$/i.test(x)).slice(0, 10).join(" ");
        if (c) attrs.push(`class="${c}"`);
      } else attrs.push(`${k}="${esc(v.slice(0, 300))}"`);
    }
    if (name === "a") attrs.push('rel="noopener noreferrer"', 'target="_blank"');
    if (name === "img") {
      if (!attrs.some((x) => x.startsWith("src="))) continue;
      if (!attrs.some((x) => x.startsWith("alt="))) attrs.push('alt=""');
      attrs.push('loading="lazy"');
    }
    const void_ = name === "img" || name === "br" || name === "hr";
    out += `<${name}${attrs.length ? ` ${attrs.join(" ")}` : ""}>`;
    if (!void_) open.push(name);
    if (out.length > MAX) break;
  }
  for (const t of open.reverse()) out += `</${t}>`;
  return out.length > MAX ? "" : out;
}

/** The words in a section, for the builder's list and the checker. */
export const htmlText = (html: string) => unesc(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
