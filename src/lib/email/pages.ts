// The small public pages behind unsubscribe links: no app, no script, the brand's paper and ink.

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function simplePage(title: string, body: string, form?: { action: string; button: string }, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>body{margin:0;background:#fff;color:#1a1a18;font:15px/1.5 Geist,system-ui,-apple-system,Segoe UI,Arial,sans-serif}
main{max-width:440px;margin:15vh auto 0;padding:0 16px}.box{border:1px solid #e6e4df;padding:24px}h1{font-size:18px;font-weight:500;margin:0 0 8px}
p{margin:0 0 16px;color:#55534e}button{background:#1a1a18;color:#fff;border:0;border-radius:6px;height:36px;padding:0 16px;font:inherit;font-weight:500;cursor:pointer}</style>
</head><body><main><div class="box"><h1>${esc(title)}</h1><p>${esc(body)}</p>${
    form ? `<form method="post" action="${esc(form.action)}"><button type="submit">${esc(form.button)}</button></form>` : ""
  }</div></main></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}
