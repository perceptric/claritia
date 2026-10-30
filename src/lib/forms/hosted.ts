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
  ".missing{font-weight:600;letter-spacing:-.02em;padding:64px 0;margin:0;text-align:center;font-size:18px;color:#0a0a0a}",
].join("");

/** The hosted form page. `framed`: inside /f/embed.js's frame. `script`: the form script's (versioned) address. */
export function hostedFormHtml(id: string, o: { framed: boolean; script: string }): string {
  const ok = ID.test(id);
  const body = ok ? `<claritia-form form-id="${esc(id)}"></claritia-form>` : `<p class="missing">Form not found.</p>`;
  return `<!doctype html>
<html lang="en"${o.framed ? ' class="framed"' : ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Form</title>
<meta name="robots" content="noindex">
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
