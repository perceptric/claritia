// The template gallery in a real browser (docs/form-templates.md), with a fake database and server
// (scripts/templates/entry.tsx): a template opened from the website keeps the style picked there; a card opens in its
// own style; the style menu, a workspace brand and Plain each change the preview; Use template asks for the look
// shown; and the cards show the form itself, its real questions, with no drawing or page color around it.
//   CHROMIUM_PATH=… node scripts/templates-check.ts   (SHOTS=dir saves screenshots)

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import pw from "playwright-core";
import { templateById, templateSlug, templateTheme, TEMPLATES } from "../src/lib/forms/gallery/catalog.ts";
import { themeById } from "../src/lib/forms/gallery/themes.ts";

const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  if (!ok) failures.push(what);
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};
const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

const root = new URL("..", import.meta.url).pathname;
const bundle = await build({ entryPoints: [`${root}scripts/templates/entry.tsx`], bundle: true, write: false, format: "esm", jsx: "automatic", alias: { "@": `${root}src` }, define: { "process.env.NODE_ENV": '"development"' }, logLevel: "error" });
const js = bundle.outputFiles[0]!.contents;
const globals = `${root}src/app/globals.css`;
const css = (await postcss([tailwind()]).process(readFileSync(globals, "utf8"), { from: globals })).css;
const server = createServer((req, res) => {
  if (req.url?.startsWith("/app.css")) return void res.writeHead(200, { "content-type": "text/css" }).end(css);
  if (req.url?.startsWith("/app.js")) return void res.writeHead(200, { "content-type": "text/javascript" }).end(js);
  res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><link rel="stylesheet" href="/app.css"><body style="margin:0"><div id="root"></div><script type="module" src="/app.js"></script></body>`);
});
await new Promise<void>((r) => server.listen(0, r));
const base = `http://localhost:${(server.address() as { port: number }).port}`;
const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const shots = process.env.SHOTS;

const inquiry = templateById("agency.project-inquiry")!;
// A template whose own style isn't Poster, for the card's own style.
const other = TEMPLATES.find((t) => templateTheme(t) === "midnight")!;

try {
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  page.on("pageerror", (e) => check(false, `no page errors (${e.message})`));
  const shot = (name: string) => (shots ? page.screenshot({ path: `${shots}/${name}.png` }) : Promise.resolve());
  const sheet = page.getByRole("dialog", { name: inquiry.name });
  /** The preview's stage color, once the form has drawn. */
  const stage = async () => {
    await page.waitForFunction(() => !!document.querySelector("claritia-form")?.shadowRoot?.querySelector(".page"), null, { timeout: 10000 });
    await page.waitForTimeout(150);
    return page.evaluate(() => getComputedStyle(document.querySelector("claritia-form")!.shadowRoot!.querySelector(".page")!).backgroundColor);
  };
  /** The preview's send button color: a style shows in its button, with no page color around the form. */
  const button = async () => {
    await stage();
    return page.evaluate(() => getComputedStyle(document.querySelector("claritia-form")!.shadowRoot!.querySelector(".btn, button[type=submit]")!).backgroundColor);
  };
  const used = () => page.evaluate(() => (window as unknown as { calls: { path: string; body: Record<string, unknown> }[] }).calls.filter((c) => c.path === "/api/forms/templates").map((c) => c.body).at(-1));

  // ── From the website: Poster picked there ──
  await page.goto(`${base}/forms/templates/${templateSlug(inquiry)}?theme=poster`);
  await sheet.waitFor();
  check((await page.getByRole("button", { name: "Style", exact: true }).textContent())?.includes("Poster style") === true, "the style picked on the website is the look");
  check((await button()) === rgb(themeById("poster").accent), "the preview wears Poster");
  check((await stage()) === rgb(themeById("poster").card), "the form fills the preview in its own color, with no stage color around it");
  await shot("1-poster");
  await page.getByRole("button", { name: "Use form template" }).click();
  await page.waitForFunction(() => (window as unknown as { nav: unknown[] }).nav.length > 0);
  const a = await used();
  check(a?.theme === "poster" && !a.kitId && !a.plain, `Use template asks for Poster (${JSON.stringify(a)})`);

  // ── The style menu: another style ──
  await page.goto(`${base}/forms/templates/${templateSlug(inquiry)}?theme=poster`);
  await sheet.waitFor();
  await page.getByRole("button", { name: "Style", exact: true }).click();
  await page.getByRole("option", { name: /^Midnight/ }).click();
  check((await button()) === rgb(themeById("midnight").accent), "a style from the menu changes the preview");
  check(page.url().includes("theme=midnight"), "the address keeps the style");
  // ── A workspace brand, then Plain ──
  await page.getByRole("radio", { name: "acme.com" }).click();
  check((await stage()) === "rgb(204, 251, 241)", "a brand changes the preview to the brand's look");
  await page.getByRole("button", { name: "Use form template" }).click();
  await page.waitForFunction(() => (window as unknown as { nav: unknown[] }).nav.length > 0);
  const b = await used();
  check(b?.kitId === "11111111-1111-4111-8111-111111111111" && !b.theme, `Use template asks for the brand (${JSON.stringify(b)})`);
  await page.goto(`${base}/forms/templates/${templateSlug(inquiry)}`);
  await sheet.waitFor();
  await page.getByRole("radio", { name: "Plain" }).click();
  check((await stage()) === "rgb(255, 255, 255)", "Plain shows Claritia's plain look");
  await page.getByRole("button", { name: "Use form template" }).click();
  await page.waitForFunction(() => (window as unknown as { nav: unknown[] }).nav.length > 0);
  check((await used())?.plain === true, "Use template asks for plain");
  // Back to the style: one click on its chip.
  await page.goto(`${base}/forms/templates/${templateSlug(inquiry)}`);
  await sheet.waitFor();
  await page.getByRole("radio", { name: "Plain" }).click();
  await page.getByRole("radio", { name: /style$/ }).click();
  check((await button()) === rgb(themeById(templateTheme(inquiry)).accent), "the style chip brings the style back");

  // ── From the gallery: a card opens in its own style ──
  await page.goto(`${base}/forms/templates`);
  await page.getByPlaceholder(/^Search/).fill(other.name);
  await page.getByRole("button", { name: `Preview ${other.name}`, exact: true }).first().click();
  await page.getByRole("dialog", { name: other.name }).waitFor();
  check((await button()) === rgb(themeById("midnight").accent), `a card opens in its own style, as the card shows (${other.name})`);
  await shot("2-card");
  const arts = await page.evaluate(() => [...document.querySelectorAll("img, [style]")].map((n) => (n as HTMLImageElement).src || (n as HTMLElement).style.backgroundImage || "").filter((s) => s.includes("form-art")));
  check(arts.length === 0, `the cards have no drawings (${arts.length})`);
  const firstQ = other.schema.pages[0]!.fields.find((f) => f.kind !== "hidden" && f.kind !== "statement" && f.kind !== "calc")!.label;
  await page.keyboard.press("Escape");
  check(((await page.getByRole("button", { name: `Preview ${other.name}`, exact: true }).first().textContent()) ?? "").includes(firstQ), `a card shows the form's own first question (${firstQ})`);
} finally {
  await browser.close();
  server.close();
}
if (failures.length) {
  console.log(`\ntemplates-check: ${failures.length} failed`);
  process.exit(1);
}
console.log("\ntemplates-check: all passed");
