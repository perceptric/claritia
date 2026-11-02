// The Share screens in a real browser (docs/sharing-plan.md), with a fake database and server (scripts/share/entry.tsx):
// a form's Share tab, each way on its left list, a meeting's Share dialog and Settings › Link domain in each state.
//   CHROMIUM_PATH=… node scripts/share-check.ts   (SHOTS=dir saves screenshots)

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
const bundle = await build({ entryPoints: [`${root}scripts/share/entry.tsx`], bundle: true, write: false, format: "esm", jsx: "automatic", alias: { "@": `${root}src` }, define: { "process.env.NODE_ENV": '"development"' }, logLevel: "error" });
const js = bundle.outputFiles[0]!.contents;
const globals = `${root}src/app/globals.css`;
const css = (await postcss([tailwind()]).process(readFileSync(globals, "utf8"), { from: globals })).css;
const server = createServer((req, res) => {
  if (req.url?.startsWith("/app.css")) return void res.writeHead(200, { "content-type": "text/css" }).end(css);
  if (req.url?.startsWith("/app.js")) return void res.writeHead(200, { "content-type": "text/javascript" }).end(js);
  res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><link rel="stylesheet" href="/app.css"><body style="margin:0"><div id="root"></div><script type="module" src="/app.js"></script>`);
});
await new Promise<void>((r) => server.listen(0, r));
const base = `http://localhost:${(server.address() as { port: number }).port}`;
const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const shots = process.env.SHOTS;

/** The Copy button sits above the code, never on it. */
const copyClear = (page: pw.Page) =>
  page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => /Copy code|Copied/.test(b.textContent ?? ""));
    const pre = btn?.closest("div.overflow-hidden")?.querySelector("pre");
    if (!btn || !pre) return false;
    return btn.getBoundingClientRect().bottom <= pre.getBoundingClientRect().top;
  });
const rpcs = (page: pw.Page) => page.evaluate(() => (window as unknown as { rpcs: [string, Record<string, unknown>][] }).rpcs);

async function run(width: number, tag: string) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  page.on("pageerror", (e) => check(false, `${tag}: no page errors (${e.message})`));
  const shot = (name: string) => (shots ? page.screenshot({ path: `${shots}/${tag}-${name}.png`, fullPage: true }) : Promise.resolve());
  await page.goto(`${base}/?view=form`);
  await page.locator("[data-share-link]").waitFor();
  await shot("form-default");
  check((await page.locator("[data-share-link]").textContent())?.endsWith("/f/acme/demo-request") ?? false, `${tag}: Share opens on Link, with the link ending in full`);
  await page.getByRole("button", { name: "Copy link" }).click();
  check(await page.getByRole("button", { name: "Copied" }).first().waitFor({ timeout: 3000 }).then(() => true, () => false), `${tag}: Copy link says Copied`);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check(clip.endsWith("/f/acme/demo-request"), `${tag}: the copied link is the one shown`);
  // The ending: Enter saves, Escape puts it back.
  await page.getByLabel("Link ending").fill("book-a-demo");
  await page.getByLabel("Link ending").press("Enter");
  await page.waitForTimeout(200);
  check((await rpcs(page)).some(([fn, a]) => fn === "form_set_slug" && a.p_slug === "book-a-demo"), `${tag}: Enter saves the link ending`);
  await page.getByLabel("Link ending").fill("other");
  await page.getByLabel("Link ending").press("Escape");
  check((await page.getByLabel("Link ending").inputValue()) === "book-a-demo", `${tag}: Escape puts the saved ending back`);
  // The preview follows the title as it's typed.
  await page.getByLabel("Title").fill("Talk to sales");
  check(((await page.getByLabel("Link preview").textContent()) ?? "").includes("Talk to sales"), `${tag}: the link preview shows the title as it's typed`);
  for (const [name, label] of [["link", "Link"], ["embed", "On your website"], ["email", "Email"], ["qr", "QR code"], ["own", "Your own form"]] as const) {
    await page.getByRole("button", { name: new RegExp(`^${label}`) }).first().click();
    await page.waitForTimeout(300);
    await shot(`form-${name}`);
    if (name === "embed") {
      check(await copyClear(page), `${tag}: the code's Copy button sits above the code`);
      await page.getByRole("radio", { name: "WordPress" }).click();
      check(await page.getByText("In WordPress").isVisible(), `${tag}: a site builder shows its steps`);
    }
    if (name === "email") {
      await page.getByLabel("To").fill("ana@acme.com, not-an-email");
      check(await page.getByText("Not an email: not-an-email").isVisible(), `${tag}: a wrong address is named`);
      check(await page.getByRole("button", { name: "Send", exact: true }).isDisabled(), `${tag}: Send waits for good addresses`);
      await page.getByLabel("To").fill("ana@acme.com, bo@acme.com");
      check(await page.getByText("2 addresses").isVisible(), `${tag}: the count of addresses`);
    }
  }
  await page.goto(`${base}/?view=meeting`);
  await page.locator("[data-share-link]").waitFor();
  await page.getByRole("img", { name: /QR code for/ }).waitFor();
  check(true, `${tag}: a meeting's link has its QR code`);
  await shot("meeting-link");
  for (const label of ["On your website", "In an email"]) {
    await page.getByRole("radio", { name: label }).or(page.getByRole("button", { name: label })).or(page.getByRole("tab", { name: label })).first().click();
    await page.waitForTimeout(200);
    await shot(`meeting-${label.replace(/\W+/g, "-").toLowerCase()}`);
    if (label === "On your website") check(await copyClear(page), `${tag}: the meeting code's Copy button sits above the code`);
  }
  await page.getByRole("button", { name: "Copy signature" }).click();
  check(await page.getByRole("button", { name: "Copied" }).waitFor({ timeout: 3000 }).then(() => true, () => false), `${tag}: Copy signature says Copied`);
  for (const s of ["none", "pending", "active", "failed"]) {
    await page.goto(`${base}/?view=domain&state=${s}&subs=1`);
    await page.waitForTimeout(300);
    await shot(`domain-${s}`);
    if (s === "pending") check(await page.getByRole("button", { name: "Copy name" }).isVisible(), `${tag}: the DNS record's name has its copy`);
    if (s === "failed") check(await page.getByText("Checked just now").isVisible(), `${tag}: when it was last checked`);
  }
  await page.close();
}

try {
  await run(1360, "desk");
  await run(390, "phone");
} catch (e) {
  check(false, `ran to the end (${(e as Error).message})`);
} finally {
  await browser.close();
  server.close();
}
if (failures.length) {
  console.log(`\n${failures.length} failed`);
  process.exit(1);
}
console.log("share-check: all passed");
