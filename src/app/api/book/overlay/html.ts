import type { Busy } from "@/lib/meetings/overlay";

/** The small window's last page: it hands the result to the booking page that opened it and closes. */
export function overlayPage(origin: string, msg: { busy: Busy[]; provider: string } | { error: string }): Response {
  const data = JSON.stringify({ claritia: "overlay", ...msg }).replace(/</g, "\\u003c");
  const target = JSON.stringify(origin).replace(/</g, "\\u003c");
  const html = `<!doctype html><meta charset="utf-8"><title>Claritia</title><body style="font:14px Inter,system-ui,sans-serif;color:#555;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><p>You can close this window.</p><script>try{window.opener&&window.opener.postMessage(${data},${target})}catch(e){}window.close()</script>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}
