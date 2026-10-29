// The builder canvas in a real browser (docs/design-system.md Part 3.3): the real <claritia-form> per step with the
// editing layer on top (src/components/app/forms/FormCanvas.tsx). The layer's boxes must sit on the real fields at
// any zoom, a click must pick the part under the pointer, the picked part must show the state being styled, a
// double-click must edit text in its own font, and no click may reach the form below.
// scripts/test-db.sh runs it when CHROMIUM_PATH is set (it needs no database).
//   CHROMIUM_PATH=… node scripts/canvas-check.ts

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
const bundle = await build({
  entryPoints: [`${root}scripts/canvas/entry.tsx`],
  bundle: true,
  write: false,
  format: "esm",
  jsx: "automatic",
  alias: { "@": `${root}src` },
  define: { "process.env.NODE_ENV": '"development"' },
  logLevel: "error",
});
const js = bundle.outputFiles[0].contents;
const globals = `${root}src/app/globals.css`;
const css = (await postcss([tailwind()]).process(readFileSync(globals, "utf8"), { from: globals })).css;

const server = createServer((req, res) => {
  if (req.url?.startsWith("/app.css")) return void res.writeHead(200, { "content-type": "text/css" }).end(css);
  if (req.url?.startsWith("/canvas.js")) return void res.writeHead(200, { "content-type": "text/javascript" }).end(js);
  const z = Number(new URL(req.url ?? "/", "http://x").searchParams.get("z") ?? 100);
  res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><link rel="stylesheet" href="/app.css"><body style="margin:0"><div id="root"></div><script>window.Z=${z}</script><script type="module" src="/canvas.js"></script>`);
});
await new Promise<void>((r) => server.listen(0, r));
const base = `http://localhost:${(server.address() as { port: number }).port}`;
const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
page.on("pageerror", (e) => check(false, `no page errors (${e.message})`));

const open = async (z: number) => {
  await page.goto(`${base}/?z=${z}`);
  await page.waitForFunction(() => document.querySelectorAll("[data-fid]").length === 4);
  // The layer measures after the form draws and its fonts load.
  await page.waitForTimeout(300);
};
/** The middle of a part inside step 1's form. */
const middle = (sel: string) =>
  page.evaluate((s) => {
    const r = document.querySelector("[data-step-frame='0'] claritia-form")!.shadowRoot!.querySelector(s)!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sel);
const inForm = <T,>(fn: (root: ShadowRoot) => T) => page.evaluate(`(${fn.toString()})(document.querySelector("[data-step-frame='0'] claritia-form").shadowRoot)`) as Promise<T>;
const last = () => page.evaluate(() => JSON.stringify((window as unknown as { log: unknown[] }).log.at(-1)));
const clickOn = async (sel: string) => {
  const p = await middle(sel);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(50);
  return last();
};

try {
  for (const z of [100, 60]) {
    await open(z);
    const off = await page.evaluate(() => {
      const host = document.querySelector("[data-step-frame='0'] claritia-form")!;
      return [...document.querySelectorAll<HTMLElement>("[data-step-frame='0'] [data-fid]")].map((box) => {
        const real = host.shadowRoot!.querySelector(`.fl[data-id="${box.dataset.fid}"]`)!.getBoundingClientRect();
        const r = box.getBoundingClientRect();
        return Math.max(Math.abs(r.left - real.left), Math.abs(r.top - real.top), Math.abs(r.width - real.width), Math.abs(r.height - real.height));
      });
    });
    check(off.length === 4 && off.every((d) => d < 1.5), `zoom ${z}%: the layer's boxes sit on the real fields (${off.map((d) => d.toFixed(2))})`);
  }

  await open(100);
  check((await clickOn('.fl[data-id="a"] .lb')) === '["a","label"]', "a click on a label picks the label");
  check((await clickOn('.fl[data-id="a"] .in')) === '["a","input"]', "a click on an input picks the input");
  check((await clickOn('.fl[data-id="c"] .ck span')) === '["c","option-text"]', "a click on an option's words picks the option text");
  check((await clickOn(".f > .h")) === '["form","title"]', "a click on the title picks the title");
  check((await clickOn(".pb")) === '["form","progress"]', "a click on the progress bar picks it");
  check((await clickOn(".ac .bt")) === '["form","button"]', "a click on the button picks the button");

  const label = await inForm((r) => getComputedStyle(r.querySelector(".lb")!).color);
  check(label === "rgb(170, 0, 0)", `the canvas draws the design system's styles (${label})`);
  const bg = async () => inForm((r) => getComputedStyle(r.querySelector(".ac .bt")!).backgroundColor);
  await page.evaluate(() => (window as unknown as { setState: (s: string) => void }).setState("hover"));
  await page.waitForTimeout(100);
  const hovered = await bg();
  check(hovered === "rgb(0, 170, 85)", `the picked part shows the state being styled (${hovered})`);
  await page.evaluate(() => (window as unknown as { setState: (s?: string) => void }).setState(undefined));
  await page.waitForTimeout(100);
  check((await bg()) !== "rgb(0, 170, 85)", "and lets go of it after");

  const p = await middle('.fl[data-id="b"] .lb');
  await page.mouse.dblclick(p.x, p.y);
  await page.waitForSelector('input[aria-label="Label"]');
  const size = await page.evaluate(() => getComputedStyle(document.querySelector('input[aria-label="Label"]')!).fontSize);
  check(size === "18px", `the edit box takes the label's font (${size})`);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Full name");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(50);
  check((await last()) === '["commit",{"kind":"field","id":"b"},"Full name"]', "Enter saves the new text");

  // The Style panel: the picked label at its element, then at a class, then for every form.
  await clickOn('.fl[data-id="a"] .lb');
  const letters = page.getByRole("textbox", { name: "Letter spacing", exact: true });
  await letters.fill("2");
  await letters.press("Enter");
  await page.waitForTimeout(100);
  const spacing = await inForm((r) => getComputedStyle(r.querySelector('.fl[data-id="a"] .lb')!).letterSpacing);
  check(spacing === "2px", `a value typed in the panel shows on the canvas at once (${spacing})`);
  const other = await inForm((r) => getComputedStyle(r.querySelector('.fl[data-id="b"] .lb')!).letterSpacing);
  check(other !== "2px", "and only on that element");
  const fontSize = page.getByRole("textbox", { name: "Size", exact: true });
  await fontSize.fill("10+4");
  await fontSize.press("Enter");
  await page.waitForTimeout(100);
  check((await inForm((r) => getComputedStyle(r.querySelector('.fl[data-id="a"] .lb')!).fontSize)) === "14px", "a typed sum is worked out (10+4 is 14px)");
  await fontSize.fill("red");
  await fontSize.press("Enter");
  await page.waitForTimeout(100);
  const refused = await fontSize.getAttribute("aria-invalid");
  check(refused === "true" && (await inForm((r) => getComputedStyle(r.querySelector('.fl[data-id="a"] .lb')!).fontSize)) === "14px", "a value of the wrong type is refused and nothing changes");
  await fontSize.press("Escape");
  await fontSize.fill("30");
  await fontSize.press("Escape");
  await page.waitForTimeout(50);
  check((await inForm((r) => getComputedStyle(r.querySelector('.fl[data-id="a"] .lb')!).fontSize)) === "14px", "Escape leaves the box without saving");
  await page.getByRole("radio", { name: "All forms" }).click();
  const color = page.getByRole("textbox", { name: "Color", exact: true });
  await color.fill("#0000aa");
  await color.press("Enter");
  await page.waitForTimeout(100);
  const both = await inForm((r) => [...r.querySelectorAll(".lb")].map((n) => getComputedStyle(n).color));
  check(both.length >= 3 && both.every((c) => c === "rgb(0, 0, 170)"), `a global style reaches every label (${both})`);
  // A border width alone also sets a solid style, so the border shows.
  await page.getByRole("radio", { name: "This field" }).click();
  await page.getByRole("button", { name: "Borders" }).click();
  const width = page.getByRole("textbox", { name: "Width", exact: true });
  await width.fill("3");
  await width.press("Enter");
  await page.waitForTimeout(100);
  const border = await inForm((r) => {
    const cs = getComputedStyle(r.querySelector('.fl[data-id="a"] .lb')!);
    return [cs.borderTopWidth, cs.borderTopStyle, cs.borderLeftWidth];
  });
  check(JSON.stringify(border) === '["3px","solid","3px"]', `a border width on every side draws a border (${border})`);
  // SHOT=path saves a picture of the canvas and panel, for a look by eye.
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  const edits = await page.evaluate(() => (window as unknown as { edits: unknown[] }).edits.length);
  check(edits === 4, `each change is one edit (${edits})`);

  const touched = await inForm((r) => ({ errors: r.querySelectorAll(".er").length, checked: (r.querySelector(".ck input") as HTMLInputElement).checked }));
  check(!touched.errors && !touched.checked, `clicks never reach the form below (${JSON.stringify(touched)})`);
  const chip = await page.evaluate(() => document.querySelector('[data-fid="h"]')!.textContent ?? "");
  check(chip.includes("Source") && chip.includes("?utm_source"), `a hidden field shows as a chip (${chip})`);
  const room = await page.evaluate(() => document.querySelector("[data-step-frame='1'] [data-grid]")!.getBoundingClientRect().height);
  check(room >= 79, `an empty step keeps room to drop into (${room}px)`);
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`${failures.length} canvas check(s) failed`);
  process.exit(1);
}
console.log("All canvas checks passed");
