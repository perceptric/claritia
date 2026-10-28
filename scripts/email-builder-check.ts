// The email builder in a real browser (docs/design-system.md Part 5): the compiled email shows in its frame, a
// click picks a block, Settings and Style change it at once, blocks are added and removed, undo puts things back,
// links in the frame never open, and a style for every email saves to the brand kit's draft.
// scripts/test-db.sh runs it when CHROMIUM_PATH is set (it needs no database).
//   CHROMIUM_PATH=… node scripts/email-builder-check.ts

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import pw from "playwright-core";

const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  if (!ok) failures.push(what);
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};

const root = new URL("..", import.meta.url).pathname;
const bundle = await build({ entryPoints: [`${root}scripts/email-builder/entry.tsx`], bundle: true, write: false, format: "esm", jsx: "automatic", alias: { "@": `${root}src` }, define: { "process.env.NODE_ENV": '"development"' }, logLevel: "error" });
const js = bundle.outputFiles[0].contents;
const globals = `${root}src/app/globals.css`;
const css = (await postcss([tailwind()]).process(readFileSync(globals, "utf8"), { from: globals })).css;
const server = createServer((req, res) => {
  if (req.url?.startsWith("/app.css")) return void res.writeHead(200, { "content-type": "text/css" }).end(css);
  if (req.url?.startsWith("/b.js")) return void res.writeHead(200, { "content-type": "text/javascript" }).end(js);
  res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><link rel="stylesheet" href="/app.css"><body style="margin:0"><div id="root"></div><script type="module" src="/b.js"></script>`);
});
await new Promise<void>((r) => server.listen(0, r));
const base = `http://localhost:${(server.address() as { port: number }).port}`;
const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.on("pageerror", (e) => check(false, `no page errors (${e.message})`));
// The design system's draft saves here.
const saves: unknown[] = [];
let rev = 0;
await page.route("**/api/design/save", async (route) => {
  const b = JSON.parse(route.request().postData() ?? "{}");
  saves.push(b);
  await route.fulfill({ json: { rev: ++rev, design: b.design } });
});

const frame = () => page.frameLocator('iframe[title="Email"]');
const inFrame = <T,>(fn: string) => page.evaluate(`(() => { const d = document.querySelector('iframe[title="Email"]').contentDocument; return (${fn})(d); })()`) as Promise<T>;
const saved = () => page.evaluate(() => (window as unknown as { saved: { sections: { columns: { blocks: { type: string; text?: string }[] }[] }[] }[] }).saved.at(-1));

try {
  await page.goto(base);
  await frame().locator("h2").first().waitFor();
  check((await frame().locator("h2").first().textContent()) === "Welcome aboard", "the compiled email shows in the frame");

  // A click picks the heading; Settings changes its words at once.
  await frame().locator("h2").first().click();
  const words = page.getByRole("textbox", { name: "Heading", exact: true });
  await words.fill("Hello Dana");
  await page.waitForTimeout(150);
  check((await frame().locator("h2").first().textContent()) === "Hello Dana", "typing in Settings changes the email at once");
  check((await saved())?.sections[0]!.columns[0]!.blocks[0]!.text === "Hello Dana", "and hands the document back to be saved");

  // Style: the heading's size for this one block.
  await page.getByRole("tab", { name: "Style" }).click();
  const size = page.getByRole("textbox", { name: "Size", exact: true });
  await size.fill("34");
  await size.press("Enter");
  await page.waitForTimeout(150);
  check((await inFrame<string>("(d) => getComputedStyle(d.querySelector('h2')).fontSize")) === "34px", "a style shows in the email at once");
  check(await page.getByRole("img", { name: /ignore/ }).count().then((n) => n > 0), "properties some clients ignore are marked");

  // Undo puts it back, redo again.
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(150);
  check((await inFrame<string>("(d) => getComputedStyle(d.querySelector('h2')).fontSize")) === "26px", "undo puts the style back");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await page.waitForTimeout(150);
  check((await inFrame<string>("(d) => getComputedStyle(d.querySelector('h2')).fontSize")) === "34px", "redo brings it again");

  // A style for every email saves to the brand kit's draft.
  await page.getByRole("radio", { name: "All emails" }).click();
  const color = page.getByRole("textbox", { name: "Color", exact: true });
  await color.fill("#aa0000");
  await color.press("Enter");
  await page.waitForTimeout(1200);
  check(saves.length === 1 && JSON.stringify(saves[0]).includes("#aa0000"), `a style for every email saves to the kit's draft (${saves.length})`);
  check((await inFrame<string>("(d) => getComputedStyle(d.querySelector('h2')).color")) === "rgb(170, 0, 0)", "and shows at once");

  // Add a button after the heading, then remove it with Delete.
  await page.getByRole("tab", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Button", exact: true }).click();
  await page.waitForTimeout(150);
  const blocks = async () => (await saved())!.sections.flatMap((s) => s.columns.flatMap((c) => c.blocks.map((b) => b.type)));
  check(JSON.stringify(await blocks()) === '["heading","button","text","footer"]', `a new block goes after the picked one (${await blocks()})`);
  check((await frame().locator("a", { hasText: "Learn more" }).count()) === 1, "and shows in the email");
  await page.keyboard.press("Delete");
  await page.waitForTimeout(150);
  check(JSON.stringify(await blocks()) === '["heading","text","footer"]', "Delete removes the picked block");

  // Links in the frame never open.
  const before = await inFrame<string>("(d) => d.location.href");
  await frame().locator("a", { hasText: "read this" }).click();
  await page.waitForTimeout(200);
  check((await inFrame<string>("(d) => d.location.href")) === before, "a link in the email doesn't open in the builder");

  // Components: save the first section as one, use it again, change this use's words.
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page.getByRole("button", { name: "Section 1", exact: true }).click();
  await page.getByRole("button", { name: "Save as component" }).click();
  await page.getByRole("dialog", { name: "Save as a component" }).getByRole("textbox").fill("Intro");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(150);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Intro", exact: true }).click();
  await page.waitForTimeout(200);
  check((await frame().locator("h2", { hasText: "Hello Dana" }).count()) === 2, "a component is used twice");
  const heading = page.getByRole("textbox", { name: "Text", exact: true }).first();
  await heading.fill("Second copy");
  await page.waitForTimeout(200);
  check((await frame().locator("h2", { hasText: "Second copy" }).count()) === 1 && (await frame().locator("h2", { hasText: "Hello Dana" }).count()) === 1, "one use's own words leave the other alone");

  // Phone width and dark mode.
  await page.getByRole("radio", { name: "Phone", exact: true }).click();
  await page.waitForTimeout(400);
  check((await page.locator('iframe[title="Email"]').evaluate((f) => f.getBoundingClientRect().width)) === 390, "Phone shows the email at a phone's width");
  await page.getByRole("radio", { name: "Dark", exact: true }).click();
  await page.waitForTimeout(200);
  check(await frame().locator("h2").first().isVisible(), "dark mode draws");
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });

  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  check(await page.locator("#closed").isVisible(), "Escape closes the builder");
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`${failures.length} email builder check(s) failed`);
  process.exit(1);
}
console.log("All email builder checks passed");
