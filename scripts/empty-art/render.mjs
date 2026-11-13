// The 3D pictures for empty screens (src/components/sketches/Sketch.tsx). scene.js builds each object with three.js;
// this renders it in headless Chromium to a transparent 480 px PNG, light and dark.
// Run from this folder:  npm i --no-save --prefix . three@0.170.0 sharp && node render.mjs ../../public/empty
// One picture: node render.mjs ../../public/empty calendar
import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Playwright comes with the machine (global), sharp from this folder.
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const sharp = require("sharp");

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] || path.join(ROOT, "out");
const only = process.argv[3] ? process.argv[3].split(",") : null;
const KINDS = only || ["clipboard", "funnel", "cards", "road", "plane", "signpost", "envelopes", "browser", "megaphone", "gear", "calendar", "sync", "domain", "key"];
const THEMES = (process.env.THEMES || "light,dark").split(",");
const SIZE = Number(process.env.SIZE || 640);

const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
  page.on("console", (m) => m.type() === "error" && console.error(m.text()));
  page.on("pageerror", (e) => console.error(e.message));
  for (const theme of THEMES) {
    for (const kind of KINDS) {
      await page.goto(`http://localhost:${port}/index.html?kind=${kind}&theme=${theme}&size=${SIZE}${process.env.ROT ? `&rot=${process.env.ROT}` : ''}`);
      await page.waitForFunction(() => window.__done === true, null, { timeout: 120000 });
      const data = await page.evaluate(() => document.querySelector("canvas").toDataURL("image/png"));
      const buf = Buffer.from(data.split(",")[1], "base64");
      const file = path.join(OUT, theme === "dark" ? `${kind}-dark.png` : `${kind}.png`);
      await sharp(buf).resize(480, 480).png({ compressionLevel: 9, palette: false }).toFile(file);
      console.log(file);
    }
  }
  await browser.close();
  server.close();
})();
