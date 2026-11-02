// Branded booking pages in a real browser (src/lib/meetings/brandPage.ts): the brand's .btn on the Next button,
// .btn-secondary on the times, .field on the inputs, .heading on the titles; a full-width, padded brand button can't
// break the time list or the time and its Next button, on desktop or a phone; nothing reaches outside the booking
// root; and a dark brand's invisible main color isn't used for the picked day.
//   CHROMIUM_PATH=… node scripts/book-brand-check.ts

import { createServer } from "node:http";
import { build } from "esbuild";
import pw from "playwright-core";

const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  if (!ok) failures.push(what);
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};

const root = new URL("..", import.meta.url).pathname;
const bundle = await build({ entryPoints: [`${root}scripts/book/brand.tsx`], bundle: true, write: false, format: "esm", jsx: "automatic", alias: { "@": `${root}src`, "server-only": `${root}scripts/book/brand.tsx` }, define: { "process.env.NODE_ENV": '"development"' }, logLevel: "error" });
const js = bundle.outputFiles[0].contents;
const server = createServer((req, res) => {
  if (req.url?.startsWith("/b.js")) return void res.writeHead(200, { "content-type": "text/javascript" }).end(js);
  res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><body style="margin:0"><div id="root"></div><script type="module" src="/b.js"></script>`);
});
await new Promise<void>((r) => server.listen(0, r));
const base = `http://localhost:${(server.address() as { port: number }).port}`;
const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
page.on("pageerror", (e) => check(false, `no page errors (${e.message})`));
const style = (sel: string, prop: string) => page.evaluate(([s, p]) => getComputedStyle(document.querySelector(s)!).getPropertyValue(p), [sel, prop] as const);
const box = (sel: string) => page.evaluate((s) => document.querySelector(s)!.getBoundingClientRect().toJSON() as DOMRect, sel);

async function pickTime() {
  await page.locator(".cb-day.cb-has").first().click();
  await page.locator(".cb-tlist .cb-time").first().waitFor();
  await page.waitForTimeout(150);
}

async function layout(where: string) {
  const chips = await page.evaluate(() => [...document.querySelectorAll(".cb-sc")].map((e) => e.getBoundingClientRect().toJSON() as DOMRect));
  check(chips.length > 1 && chips.every((c) => c.height <= 40), `${where}: Soonest chips stay small (${Math.round(chips[0]?.height ?? 0)}px)`);
  if (where === "desktop") check(chips.length > 1 && Math.abs(chips[0]!.top - chips[1]!.top) < 2, `${where}: Soonest chips sit in a row`);
  await pickTime();
  const list = await box(".cb-tlist");
  const times = await page.evaluate(() => [...document.querySelectorAll(".cb-tlist > .cb-time")].map((e) => e.getBoundingClientRect().toJSON() as DOMRect));
  check(times.length > 1 && times.every((t) => t.left >= list.left - 1 && t.right <= list.right + 1), `${where}: every time fits the list`);
  check(times.every((t) => t.height <= 52), `${where}: times keep their height (${Math.round(times[0]?.height ?? 0)}px)`);
  await page.locator(".cb-tlist > .cb-time").first().click();
  await page.locator(".cb-tpair .cb-btn").waitFor();
  await page.waitForTimeout(150);
  const pair = await box(".cb-tpair");
  const t = await box(".cb-tpair .cb-time");
  const b = await box(".cb-tpair .cb-btn");
  check(Math.abs(t.top - b.top) < 2 && t.right <= b.left + 1 && b.right <= pair.right + 1, `${where}: the picked time and Next sit side by side inside the row`);
  check(Math.abs(t.height - b.height) < 2 && b.height <= 52, `${where}: Next is the time's height (${Math.round(b.height)}px)`);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${where}: no sideways scroll`);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${where}.png` });
}

try {
  await page.goto(base);
  await page.locator(".cb-day.cb-has").first().waitFor();
  await page.waitForTimeout(200);
  check((await page.locator(".cb-root.cb-brand").count()) === 1, "the booking root carries the brand scope");
  check((await style("#outside", "border-top-width")) !== "2px", "nothing reaches outside the booking root");
  check((await style(".cb-root", "padding-top")) === "0px", "the brand's body spacing doesn't move the page");
  check((await style(".cb-root", "background-color")) !== "rgb(255, 0, 0)", "the brand's body background doesn't paint the page");
  check((await style(".cb-h", "letter-spacing")) === "3px", "headings take the brand's .heading");
  await layout("desktop");
  check((await style(".cb-tpair .cb-btn", "background-color")) === "rgb(26, 86, 219)", "Next takes the brand's .btn");
  check((await style(".cb-tpair .cb-btn", "font-weight")) === "700", "Next takes the brand's weight");
  check((await style(".cb-tlist > .cb-time", "border-top-width")) === "2px", "open times take the brand's .btn-secondary");
  check((await style('.cb-day[aria-pressed="true"]', "background-color")) === "rgb(26, 86, 219)", "the picked day takes the brand's main color");
  await page.locator(".cb-tpair .cb-btn").click();
  await page.locator(".cb-in").first().waitFor();
  await page.waitForTimeout(200);
  check((await style(".cb-in", "border-top-width")) === "2px" && (await style(".cb-in", "border-top-left-radius")) === "8px", "inputs take the brand's .field");
  const form = await box(".cb-form");
  const input = await box(".cb-in");
  check(input.right <= form.right + 1, "inputs stay inside the form");

  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(base);
  await page.locator(".cb-day.cb-has").first().waitFor();
  await layout("phone");

  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto(`${base}/?dark`);
  await page.locator(".cb-day.cb-has").first().waitFor();
  await pickTime();
  const day = await style('.cb-day[aria-pressed="true"]', "background-color");
  check(day !== "rgb(20, 20, 20)", `a dark brand's near-black main color isn't used for the picked day (${day})`);
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`${failures.length} branded booking check(s) failed`);
  process.exit(1);
}
console.log("All branded booking checks passed");
