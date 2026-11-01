// The brand scan against a bot check that clears itself (Hostinger, Cloudflare): the first answer is a 403 waiting
// screen that sets a cookie and reloads; the scan waits it out and reads the real page instead of calling it blocked.
// A wall that never clears is still blocked. Skips when no Chromium is installed.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { CHALLENGE, scanSite } from "../src/lib/brand/scan.ts";

const chromiumPath = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium";
const skip = !existsSync(chromiumPath) && "no Chromium";

const WAIT = `<!doctype html><title>Just a moment...</title><body>Checking your browser before accessing.<script>
setTimeout(() => { document.cookie = "passed=1; path=/"; location.reload(); }, 1200);</script></body>`;
const SITE = `<!doctype html><html><head><title>Acme</title><style>
body { font-family: Georgia, serif; color: #333; background: #fff; }
button { background: #0a0a0a; color: #fff; border-radius: 60px; padding: 10px 20px; border: 0; }
input { border: 1px solid #d4d4d0; border-radius: 6px; height: 40px; }</style></head><body>
<h1>Acme makes rockets</h1><p>${"Real page text. ".repeat(40)}</p>
<form><label>Work email <input type="email" name="email"></label><button type="submit">Show me</button></form></body></html>`;

function serve(clears: boolean): Promise<Server> {
  const server = createServer((req, res) => {
    if (req.url === "/favicon.ico") return void res.writeHead(404).end();
    const passed = clears && /passed=1/.test(req.headers.cookie ?? "");
    res.writeHead(passed ? 200 : 403, { "content-type": "text/html" }).end(passed ? SITE : WAIT);
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

test("the challenge text matches the usual waiting screens", () => {
  for (const t of ["Just a moment...", "Checking your browser before accessing", "Verifying you are human", "Attention Required! | Cloudflare"]) assert.ok(CHALLENGE.test(t), t);
  assert.ok(!CHALLENGE.test("Acme makes rockets"));
});

test("a bot check that clears itself is waited out and the real page is read", { skip, timeout: 60_000 }, async () => {
  const server = await serve(true);
  try {
    const scan = await scanSite(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`, { chromiumPath, allowPrivate: true, timeoutMs: 15_000 });
    assert.equal(scan.tokens.buttonBg.toLowerCase(), "#0a0a0a");
    assert.equal(scan.tokens.buttonRadius, 60);
    assert.ok(scan.forms.length >= 1);
  } finally {
    server.close();
  }
});

test("a wall that never clears is still blocked", { skip, timeout: 60_000 }, async () => {
  const server = await serve(false);
  try {
    await assert.rejects(scanSite(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`, { chromiumPath, allowPrivate: true, timeoutMs: 15_000 }));
  } finally {
    server.close();
  }
});
