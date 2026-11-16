// Every template right from the start (docs/studio-v2-plan.md Part 16): each of the gallery's templates, in its own
// style, drawn as the Studio draws it (its base, the style, the form's CSS with the Studio's tune, the guard last) at
// 390px and 1100px, has nothing in the form check's layout and contrast measure (src/lib/studio/measure.ts): no
// sideways scroll, no hard-to-read text, no removed radio, no cut-off text, no small tap, no other font. All of them
// by default; LIMIT=n checks the first n.
//   CHROMIUM_PATH=… node scripts/studio-templates-check.ts

import { createServer } from "node:http";
import { build } from "esbuild";
import pw from "playwright-core";
import { templateTheme, TEMPLATES } from "../src/lib/forms/gallery/catalog.ts";
import { templateForm } from "../src/lib/forms/gallery/convert.ts";
import { checkForm } from "../src/lib/forms/schema.ts";
import { formToPage } from "../src/lib/studio/fromForm.ts";
import { styleCssById } from "../src/lib/studio/styleCss.ts";

const root = new URL("..", import.meta.url).pathname;
const limit = Number(process.env.LIMIT) || TEMPLATES.length;
const pages: { id: string; html: string; css: string; brand: string }[] = [];
const skipped: string[] = [];
for (const t of TEMPLATES.slice(0, limit)) {
  const checked = checkForm(templateForm(t));
  if ("errors" in checked) { skipped.push(t.id); continue; }
  const page = formToPage(checked.form);
  pages.push({ id: t.id, html: page.html, css: page.css, brand: styleCssById(templateTheme(t)) });
}

// The page side (scripts/studio/templates-entry.ts): the Studio's own CSS pieces, its tune and its measure.
const bundle = await build({ entryPoints: [`${root}scripts/studio/templates-entry.ts`], bundle: true, write: false, format: "esm", logLevel: "error" });
const js = bundle.outputFiles[0]!.contents;
const server = createServer((req, res) => {
  if (req.url === "/app.js") return void res.writeHead(200, { "content-type": "text/javascript" }).end(js);
  res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><script type="module" src="/app.js"></script></body></html>`);
});
await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as { port: number }).port;
const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const bad: string[] = [];
let tuned = 0;
try {
  const p = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors: string[] = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(`http://localhost:${port}/`);
  await p.waitForFunction(() => typeof (window as unknown as { checkPage?: unknown }).checkPage === "function");
  for (const page of pages) {
    const r = await p.evaluate((x) => (window as unknown as { checkPage: (x: unknown) => Promise<{ out: { text: string }[]; tuned: number }> }).checkPage(x), page);
    if (r.tuned) tuned++;
    if (r.out.length) bad.push(`${page.id}: ${r.out.map((i) => i.text).join("; ")}`);
  }
  if (errors.length) bad.push(`page errors: ${errors.join("; ")}`);
} finally {
  await browser.close();
  server.close();
}
for (const b of bad.slice(0, 40)) console.log(`FAIL ${b}`);
console.log(`${pages.length} templates at 390px and 1100px: ${pages.length - bad.length} with nothing in the form check, ${bad.length} with something (${tuned} made readable by the tune${skipped.length ? `; ${skipped.length} not drawn: ${skipped.join(", ")}` : ""})`);
if (bad.length || skipped.length) process.exit(1);
console.log("\nall passed");
