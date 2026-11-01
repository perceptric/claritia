// New form and the builder in a real browser (docs/forms.md), with a fake database and a fake server
// (scripts/newform/entry.tsx). New form: the brand is learned, Claude's thinking streams onto the page, the layout
// switch regroups the sketch, the built form shows in the real form script with its logic working, an answer becomes an
// edit, the CRM and alert are picked, and Publish saves a form the form checker passes, adds the CRM and publishes it.
// The builder: picking a question opens its panel, a new label shows in the live form at once, a question added from
// the outline lands on its step, and the bar's words change the form.
// scripts/test-db.sh runs it when CHROMIUM_PATH is set (it needs no database).
//   CHROMIUM_PATH=… node scripts/newform-check.ts   (SHOTS=dir saves screenshots)

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import pw from "playwright-core";
import { checkForm } from "../src/lib/forms/schema.ts";

const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  if (!ok) failures.push(what);
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};

const root = new URL("..", import.meta.url).pathname;
const bundle = await build({
  entryPoints: [`${root}scripts/newform/entry.tsx`],
  bundle: true,
  write: false,
  format: "esm",
  jsx: "automatic",
  alias: { "@": `${root}src` },
  define: { "process.env.NODE_ENV": '"development"' },
  logLevel: "error",
});
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
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
page.on("pageerror", (e) => check(false, `no page errors (${e.message})`));
const shots = process.env.SHOTS;
const shot = (name: string) => (shots ? page.screenshot({ path: `${shots}/${name}.png` }) : Promise.resolve());
/** Text inside the live form's shadow root. */
const formText = () => page.evaluate(() => [...document.querySelectorAll("claritia-form")].map((f) => f.shadowRoot?.textContent ?? "").join(" "));
const calls = () => page.evaluate(() => (window as unknown as { calls: { path: string; body: Record<string, unknown> }[] }).calls);

try {
  // ── New form ──
  await page.goto(`${base}/?view=new`);
  await page.getByRole("dialog", { name: "New form" }).waitFor();
  await page.waitForTimeout(150);
  await shot("1-describe");
  check(await page.getByText("Let's build something").isVisible(), "screen 1: the title");
  await page.getByLabel("Website to learn from").fill("acme.com");
  await page.getByRole("button", { name: "Learn" }).click();
  await page.waitForTimeout(200);
  check((await calls()).some((c) => c.path === "/api/forms/scan"), "Styling: Learn reads the website's brand");
  await page.getByLabel("Describe your form").fill("A demo request that asks team size and books bigger teams");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Bigger teams need more questions").waitFor({ timeout: 5000 });
  await shot("2-thinking");
  check(true, "screen 2: Claude's thinking streams onto the page as it comes");
  await page.getByText("Here's the rough sketch").waitFor();
  check(await page.getByText("It qualifies first").isVisible(), "screen 2: the decision says why");
  const cards = () => page.locator("section[aria-label='Live preview'] .anim-rise-sm").count();
  check((await cards()) === 3, "screen 2: the sketch is drawn as three pages");
  await shot("3-sketch");
  await page.getByRole("radio", { name: "One page" }).first().click();
  check((await cards()) === 1, "the layout switch makes it one page");
  await page.getByRole("radio", { name: "Steps" }).first().click();
  check((await cards()) >= 2, "and back to steps");
  await page.getByRole("button", { name: "Build the form" }).click();
  check(await page.getByRole("status", { name: "Writing every question" }).first().isVisible(), "screen 3: the throbber shows while it builds");
  await shot("4-building");
  await page.getByText("Ask for their phone?").waitFor({ timeout: 5000 });
  await page.waitForTimeout(400);
  check((await formText()).includes("Team size"), "screen 3: the built form shows in the real form script");
  await shot("5-form");
  // The logic works in the preview: picking 11+ shows Budget.
  const hasBudget = () => page.evaluate(() => {
    const r = document.querySelector("claritia-form")!.shadowRoot!;
    const el = [...r.querySelectorAll(".fl")].find((x) => x.textContent?.includes("Budget")) as HTMLElement | undefined;
    return !!el && el.offsetParent !== null && getComputedStyle(el).display !== "none";
  });
  check(!(await hasBudget()), "the preview hides Budget before a team size is picked");
  await page.evaluate(() => {
    const r = document.querySelector("claritia-form")!.shadowRoot!;
    const opt = [...r.querySelectorAll<HTMLElement>("[role=radio], label")].find((x) => x.textContent?.trim() === "11+");
    opt?.click();
  });
  await page.waitForTimeout(150);
  check(await hasBudget(), "picking 11+ shows Budget in the preview");
  const left = page.locator("section").first();
  await left.getByRole("button", { name: "Yes" }).click();
  await left.getByRole("button", { name: "Next" }).click();
  await page.getByRole("heading", { name: "Where answers go." }).waitFor({ timeout: 5000 });
  const edit = (await calls()).find((c) => c.body.mode === "edit");
  check(!!edit && edit.body.ask === "Ask for their phone? Yes", "an answer goes to an edit, with the question and the answer");
  await shot("6-submission");
  check(await left.getByText("HubSpot").isVisible(), "screen 4: the connected CRM is listed");
  check(await left.getByText("me@acme.com").isVisible(), "screen 4: the team alert goes to the person making it");
  await left.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("heading", { name: "After they send it." }).waitFor();
  check((await page.getByLabel("Thank-you title").inputValue()) === "Thanks, you're in.", "screen 5: the thank-you Claude wrote");
  await shot("7-end");
  await left.getByRole("button", { name: "Publish" }).click();
  await page.waitForFunction(() => (window as unknown as { nav: unknown[] }).nav.length > 0, null, { timeout: 5000 });
  const rpcs = await page.evaluate(() => (window as unknown as { rpcs: [string, Record<string, unknown>][] }).rpcs);
  const created = rpcs.find(([fn]) => fn === "form_create")?.[1];
  const checked = created ? checkForm(created.p_draft) : null;
  check(!!checked && "form" in checked, `the saved form passes the form checker${checked && "errors" in checked ? ` (${checked.errors.join("; ")})` : ""}`);
  if (checked && "form" in checked) {
    const f = checked.form;
    check(f.steps.some((s) => s.fields.some((x) => x.key === "phone")), "the answered question's phone field is on the saved form");
    check(f.after.end.kind === "message" && f.after.end.title === "Thanks, you're in.", "the thank-you is on the saved form");
    check(f.spam.turnstile && f.consent.mode === "by_region" && !!f.notify?.on, "spam guard, consent and the team alert are on");
    check(created!.p_brand_kit === "k1", "it takes the learned brand");
  }
  const after = await calls();
  check(after.some((c) => c.path === "/api/forms/destination" && c.body.sourceId === "src1"), "the CRM gets the leads");
  check(after.some((c) => c.path === "/api/forms/publish"), "Publish publishes it");
  const nav = await page.evaluate(() => (window as unknown as { nav: unknown[][] }).nav[0]);
  check(JSON.stringify(nav) === JSON.stringify(["forms", "00000000-0000-4000-8000-000000000009", "tab=share"]), "then the form opens on Share");

  // ── The builder ──
  await page.goto(`${base}/?view=build`);
  await page.getByRole("navigation", { name: "Outline" }).waitFor();
  await page.waitForTimeout(300);
  await shot("8-builder");
  const outline = page.getByRole("navigation", { name: "Outline" });
  await outline.getByRole("button", { name: /Tools you use/ }).click();
  const label = page.getByRole("complementary", { name: "Settings" }).getByLabel("Question", { exact: true });
  check((await label.inputValue()) === "Tools you use", "picking a question opens its panel");
  await label.fill("Tools your team uses");
  await page.waitForTimeout(200);
  check((await formText()).includes("Tools your team uses"), "a new label shows in the live form at once");
  await outline.getByRole("button", { name: /Budget/ }).click();
  check(await page.getByRole("complementary", { name: "Settings" }).getByText("Show this question").isVisible(), "a question with logic shows it");
  await shot("9-logic");
  await outline.getByRole("button", { name: "Add a question" }).first().click();
  await page.getByRole("button", { name: "Question type" }).click();
  await page.getByRole("option", { name: "Yes or no" }).click();
  await page.waitForTimeout(150);
  const added = await page.evaluate(() => (window as unknown as { form: { steps: { fields: { type: string; options?: { value: string }[] }[] }[] } }).form.steps[0]!.fields.at(-1));
  check(added?.type === "choice" && added.options?.map((o) => o.value).join() === "yes,no", "a question added from the outline lands on its step");
  await page.getByLabel("Change the form").fill("Ask for their phone");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByText("Added phone").waitFor({ timeout: 5000 });
  const phone = await page.evaluate(() => (window as unknown as { form: { steps: { fields: { key: string }[] }[] } }).form.steps.some((s) => s.fields.some((f) => f.key === "phone")));
  check(phone, "the bar's words change the form");
  await shot("10-bar");
} catch (e) {
  check(false, `the run finished (${(e as Error).message.split("\n")[0]})`);
  await shot("error");
} finally {
  await browser.close();
  server.close();
}
if (failures.length) {
  console.log(`\n${failures.length} failed`);
  process.exit(1);
}
console.log("\nall passed");
