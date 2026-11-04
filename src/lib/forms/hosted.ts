// A form on its own page (docs/form-builder.md Part 6), as plain HTML: forms.tryclaritia.com/f/<id> and the Share
// link. No app framework: the page is the <claritia-form> element and its script (loaded from the head, so it
// downloads while the page parses), with the little CSS the page itself needs inline. The form draws itself from the
// live version, in its brand kit. /f/embed.js can frame this page with ?c=<the page around it>; in a frame it sits
// flush, so its height can follow the form.

const ID = /^[0-9a-f-]{36}$/;
const FONTS = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// The page's own look (globals.css's paper, card and ink; Inter), on a page and in a frame.
const CSS = [
  "*,*::before,*::after{box-sizing:border-box}",
  "html,body{margin:0;background:#f7f7f5;color:#0a0a0a;font-size:14px;letter-spacing:-.006em}",
  "body{min-height:100%;font-family:Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}",
  "main{min-height:100vh;display:flex;justify-content:center;padding:48px 16px;background:#fff}",
  "main>div{width:100%;max-width:720px}",
  ".framed main{min-height:0;display:block;padding:4px;background:transparent}",
  ".framed main>div{max-width:none}",
  // A studio page fills the page, edge to edge.
  "main:has([data-page]){padding:0;display:block}main:has([data-page])>div{max-width:none}html:not(.framed) [data-page]{min-height:100vh}",
  ".missing{font-weight:600;letter-spacing:-.02em;padding:64px 0;margin:0;text-align:center;font-size:18px;color:#0a0a0a}",
].join("");

/** The link's preview in chats and social posts (Share › Link): title, line, picture and the address shared. */
export type PagePreview = { title?: string; description?: string; image?: string; url?: string };

/** The tags a chat or social app reads for the link's preview card. */
export function previewTags(p: PagePreview): string {
  const t: string[] = [];
  if (p.title) t.push(`<meta property="og:title" content="${esc(p.title)}">`, `<meta name="twitter:title" content="${esc(p.title)}">`);
  if (p.description) t.push(`<meta name="description" content="${esc(p.description)}">`, `<meta property="og:description" content="${esc(p.description)}">`, `<meta name="twitter:description" content="${esc(p.description)}">`);
  if (p.image && /^https:\/\//.test(p.image)) t.push(`<meta property="og:image" content="${esc(p.image)}">`, `<meta name="twitter:image" content="${esc(p.image)}">`, `<meta name="twitter:card" content="summary_large_image">`);
  else if (p.title) t.push(`<meta name="twitter:card" content="summary">`);
  if (p.url && /^https?:\/\//.test(p.url)) t.push(`<meta property="og:url" content="${esc(p.url)}">`);
  if (t.length) t.push(`<meta property="og:type" content="website">`);
  return t.join("\n");
}

/**
 * The hosted form page. `framed`: inside /f/embed.js's frame. `script`: the form script's (versioned) address.
 * `preview`: the link's preview card, and the page's title.
 */
export function hostedFormHtml(id: string, o: { framed: boolean; script: string; preview?: PagePreview }): string {
  const ok = ID.test(id);
  const body = ok ? `<claritia-form form-id="${esc(id)}" hosted></claritia-form>` : `<p class="missing">Form not found.</p>`;
  return `<!doctype html>
<html lang="en"${o.framed ? ' class="framed"' : ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.preview?.title || "Form")}</title>
<meta name="robots" content="noindex">
${o.preview ? previewTags(o.preview) : ""}
<link rel="icon" href="/favicon.ico" sizes="any">
<style>${CSS}</style>
${ok ? `<script src="${esc(o.script)}" async></script>` : ""}
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}" media="print" onload="this.media='all'">
</head>
<body><main><div>${body}</div></main></body>
</html>
`;
}
