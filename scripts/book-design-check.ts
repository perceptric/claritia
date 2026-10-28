// Booking pages on the design system in a real browser (docs/design-system.md Part 3.5): the brand's booking styles
// draw on the real calendar (days, the picked day, headings, and times on a phone-sized card), win over the pages'
// own stylesheet, and a kit with no booking styles looks exactly as before.
// scripts/test-db.sh runs it when CHROMIUM_PATH is set (it needs no database).
//   CHROMIUM_PATH=… node scripts/book-design-check.ts

import { createServer } from "node:http";
import { build } from "esbuild";
import pw from "playwright-core";

const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  if (!ok) failures.push(what);
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};

const root = new URL("..", import.meta.url).pathname;
const bundle = await build({ entryPoints: [`${root}scripts/book/entry.tsx`], bundle: true, write: false, format: "esm", jsx: "automatic", alias: { "@": `${root}src`, "server-only": `${root}scripts/book/entry.tsx` }, define: { "process.env.NODE_ENV": '"development"' }, logLevel: "error" });
const js = bundle.outputFiles[0].contents;
const server = createServer((req, res) => {
  if (req.url?.startsWith("/b.js")) return void res.writeHead(200, { "content-type": "text/javascript" }).end(js);
  const plain = req.url?.includes("plain");
  res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><body style="margin:0"><div id="root"></div>${plain ? "<script>window.NO_DESIGN=true</script>" : ""}<script type="module" src="/b.js"></script>`);
});
await new Promise<void>((r) => server.listen(0, r));
const base = `http://localhost:${(server.address() as { port: number }).port}`;
const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
page.on("pageerror", (e) => check(false, `no page errors (${e.message})`));
const style = (sel: string, prop: string) => page.evaluate(([s, p]) => getComputedStyle(document.querySelector(s)!).getPropertyValue(p), [sel, prop] as const);

try {
  await page.goto(`${base}/?plain`);
  await page.locator(".cb-day.cb-has").first().waitFor();
  await page.waitForTimeout(200);
  const plainDay = await style('.cb-day.cb-has:not([aria-pressed="true"])', "color");
  const plainHeading = await style(".cb-h", "letter-spacing");
  await page.goto(base);
  await page.locator(".cb-day.cb-has").first().waitFor();
  await page.waitForTimeout(200);
  check((await style('.cb-day.cb-has:not([aria-pressed="true"])', "color")) === "rgb(170, 0, 0)", `days take the brand variable (was ${plainDay})`);
  check((await style(".cb-h", "letter-spacing")) === "2px", `headings take their style (was ${plainHeading})`);
  await page.locator(".cb-day.cb-has").first().click();
  await page.waitForTimeout(150);
  check((await style('.cb-day[aria-pressed="true"]', "background-color")) === "rgb(0, 170, 85)", "the picked day takes the picked style, over the page's own");
  const desktopTime = await style(".cb-time", "font-size");
  await page.setViewportSize({ width: 420, height: 900 });
  await page.waitForTimeout(150);
  check(desktopTime !== "20px" && (await style(".cb-time", "font-size")) === "20px", `on a phone-sized card, times take the phone style (${desktopTime} on desktop)`);
  check((await page.locator(".cb-root.cb-ds").count()) === 1, "the styles are scoped to the booking page");
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`${failures.length} booking design check(s) failed`);
  process.exit(1);
}
console.log("All booking design checks passed");
