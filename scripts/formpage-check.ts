// The form page in a real browser (docs/form-ui-plan.md step 1), with a fake database and server
// (scripts/formpage/entry.tsx): one header for a Form Studio form and an older form. A Studio form reaches
// Submissions, Share, Sync and Settings and comes back to the Studio; a published form whose saved copy comes back
// with its keys reordered reads Live with Share; an edit in the Studio turns the button into Publish changes, which
// from another tab goes to Build and publishes through the Studio; a change in Share after that saves without
// "changed in another window".
//   CHROMIUM_PATH=… node scripts/formpage-check.ts   (SHOTS=dir saves screenshots)

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import pw from "playwright-core";
import { checkForm, emptyForm, type Form } from "../src/lib/forms/schema.ts";
import { pageForm } from "../src/lib/studio/page.ts";
import { toForm } from "../src/lib/forms/spec.ts";
import fx from "./studio/fixtures.json" with { type: "json" };

const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  if (!ok) failures.push(what);
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};

// The two forms, made by the real code: a Studio page (draft.page) and a form from the older builder.
const html = /<form_html>([\s\S]*?)<\/form_html>/.exec(fx.reply)![1]!;
const made = checkForm(pageForm({ html, css: "", brand: fx.brand, after: { kind: "thanks", url: "", meeting: "", routes: [] } as never, title: "Daily check-in" }).form, { custom: [] });
const olds = checkForm(toForm({ title: "Book a demo", submit: "Book my demo", steps: [{ id: "s1", title: "You", fields: [{ id: "em", type: "email", label: "Work email", key: "email", required: true }] }] } as never, emptyForm()), { custom: [] });
if (!("form" in made) || !("form" in olds)) throw new Error("the fixtures don't pass the form checker");
const row = (id: string, name: string, draft: Form) => ({ id, workspace_id: "00000000-0000-4000-8000-000000000001", name, status: "live", version: 1, draft, draft_rev: 4, brand_kit_id: "k1", live_kit_id: "k1", kind: "built", published_at: new Date().toISOString() });
const FIX = { studio: row("aaaaaaaa-0000-4000-8000-000000000001", "Daily check-in", made.form), old: row("bbbbbbbb-0000-4000-8000-000000000002", "Book a demo", olds.form), brand: fx.brand };

const root = new URL("..", import.meta.url).pathname;
// Studio.tsx imports "./studio" (studio.ts beside it); esbuild would pick Studio.tsx itself by a case-blind match.
const exactStudio = { name: "exact-studio", setup(b: { onResolve: (o: { filter: RegExp }, f: (a: { importer: string }) => { path: string } | undefined) => void }) { b.onResolve({ filter: /^\.\/studio$/ }, (a) => (a.importer.endsWith("/studio/Studio.tsx") ? { path: `${root}src/components/app/forms/studio/studio.ts` } : undefined)); } };
const bundle = await build({ entryPoints: [`${root}scripts/formpage/entry.tsx`], bundle: true, write: false, format: "esm", jsx: "automatic", alias: { "@": `${root}src` }, define: { "process.env.NODE_ENV": '"development"' }, logLevel: "error", plugins: [exactStudio] });
const js = bundle.outputFiles[0]!.contents;
const globals = `${root}src/app/globals.css`;
const css = (await postcss([tailwind()]).process(readFileSync(globals, "utf8"), { from: globals })).css;
const server = createServer((req, res) => {
  if (req.url?.startsWith("/app.css")) return void res.writeHead(200, { "content-type": "text/css" }).end(css);
  if (req.url?.startsWith("/app.js")) return void res.writeHead(200, { "content-type": "text/javascript" }).end(js);
  res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><link rel="stylesheet" href="/app.css"><body style="margin:0"><div id="root"></div><script>window.FIX=${JSON.stringify(FIX).replace(/</g, "\\u003c")}</script><script type="module" src="/app.js"></script></body>`);
});
await new Promise<void>((r) => server.listen(0, r));
const base = `http://localhost:${(server.address() as { port: number }).port}`;
const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const shots = process.env.SHOTS;

try {
  const page = await browser.newPage({ viewport: { width: 1360, height: 860 } });
  page.on("pageerror", (e) => check(false, `no page errors (${e.message}${process.env.STACK ? ` ${e.stack}` : ""})`));
  const shot = (name: string) => (shots ? page.screenshot({ path: `${shots}/${name}.png` }) : Promise.resolve());
  const action = page.locator("[data-form-action]");
  const tab = (name: string) => page.getByRole("tab", { name: new RegExp(`^${name}`) });
  const studioReady = () => page.waitForFunction(() => !!document.querySelector("[data-studio-host]")?.shadowRoot?.getElementById("t-code"), null, { timeout: 15000 });
  const $s = (sel: string) => page.locator(`[data-studio-host] ${sel}`);

  // ── A Form Studio form ──
  await page.goto(`${base}/?form=studio`);
  await studioReady();
  await page.waitForTimeout(600);
  await shot("1-studio");
  check(await tab("Submissions").isVisible(), "a Studio form shows the five tabs");
  check((await action.textContent())?.trim() === "Share" && (await page.getByText("Live", { exact: true }).isVisible()), "published and unchanged (its saved copy comes back with the keys reordered): Live, and the button is Share");
  check((await $s("#publish").count()) === 0 && (await $s("#backBtn").count()) === 0, "the Studio draws no Publish or back button of its own");

  for (const t of ["Submissions", "Share", "Sync", "Settings"]) {
    await tab(t).click();
    await page.waitForTimeout(250);
    check((await tab(t).getAttribute("aria-selected")) === "true" && new URL(page.url()).searchParams.get("tab") === t.toLowerCase(), `${t} opens from a Studio form, with its address`);
  }
  await shot("2-settings");
  await tab("Build").click();
  await studioReady();
  check(true, "Build brings the Studio back");

  // An edit in the Studio: the button says Publish changes.
  await $s("#t-code").click();
  await $s("#c-html").click();
  await $s("#codeText").fill((await $s("#codeText").inputValue()).replace("Daily check-in", "Morning check-in"));
  await $s("#codeApply").click();
  await page.waitForFunction(() => document.querySelector("[data-form-action]")?.textContent?.trim() === "Publish changes");
  check(await page.getByText("Changes not live").isVisible(), "an edit in the Studio: Changes not live, and Publish changes");

  // Publish changes from another tab goes to Build and publishes through the Studio.
  await tab("Share").click();
  await page.waitForTimeout(250);
  await action.click();
  await page.waitForFunction(() => document.querySelector("[data-form-action]")?.textContent?.trim() === "Share", null, { timeout: 15000 });
  const calls = await page.evaluate(() => (window as unknown as { calls: { path: string; body: Record<string, unknown> }[] }).calls);
  const save = calls.find((c) => c.path === "/api/studio" && c.body.mode === "save");
  check(!!save && String(save.body.html).includes("Morning check-in") && calls.some((c) => c.path === "/api/forms/publish"), "Publish changes from Share went to Build and published the Studio's page");
  check((await tab("Build").getAttribute("aria-selected")) === "true", "it publishes from Build");
  await shot("3-published");

  // After the Studio wrote the draft on the server, a change on Share saves without "changed in another window".
  await tab("Share").click();
  await page.getByLabel("Title").fill("Check in with Finch");
  await page.getByLabel("Title").blur();
  await page.waitForFunction(() => (window as unknown as { rpcs: [string][] }).rpcs.some(([f]) => f === "form_save"), null, { timeout: 5000 });
  await page.waitForTimeout(400);
  const saved = await page.evaluate(() => (window as unknown as { db: { forms: Record<string, { draft: { share?: { title?: string }; page?: { html: string } } }> } }).db.forms["aaaaaaaa-0000-4000-8000-000000000001"]!.draft);
  check(saved.share?.title === "Check in with Finch" && !!saved.page?.html.includes("Morning check-in"), "the Share change saved on top of the Studio's new page");
  check(!(await page.getByText("changed in another window").isVisible()), "no 'changed in another window'");
  check((await action.textContent())?.trim() === "Publish changes", "a Share change is a change to publish");
  await action.click();
  await page.waitForFunction(() => document.querySelector("[data-form-action]")?.textContent?.trim() === "Share", null, { timeout: 10000 });
  check((await tab("Share").getAttribute("aria-selected")) === "true", "a settings-only change publishes where it is, without opening the Studio");

  // ── A form from the older builder ──
  await page.goto(`${base}/?form=old`);
  await tab("Build").waitFor();
  await page.waitForTimeout(400);
  await shot("4-old");
  check((await action.textContent())?.trim() === "Share" && (await page.getByText("Live", { exact: true }).isVisible()), "an older published form reads Live with Share (it used to say Live, edited)");
  check((await page.locator("[data-studio-host]").count()) === 0, "its Build is the older builder");

  // ── New form: Form Studio before the form exists ──
  await page.goto(`${base}/?form=new`);
  await studioReady();
  await page.waitForTimeout(400);
  await shot("4b-new");
  check((await page.getByLabel("Form name").inputValue()) === "New form" && (await page.getByText("Draft", { exact: true }).isVisible()), "New form: the same header, named New form, Draft");
  check((await tab("Submissions").count()) === 0, "its tabs wait until the form exists");
  check((await action.textContent())?.trim() === "Publish" && (await action.isDisabled()), "Publish waits until there's a form to publish");
  await page.goto(`${base}/?form=old`);
  await tab("Build").waitFor();

  // ── Sync: a lead joins an email tool's list (docs/integrations-plan.md step 1) ──
  await tab("Sync").click();
  await page.getByRole("button", { name: /^Mailchimp/ }).first().click();
  await page.getByRole("button", { name: "Audience" }).click();
  await page.getByRole("option", { name: "Webinar guests" }).click();
  await page.getByRole("button", { name: "Add leads to Mailchimp" }).click();
  await page.getByText("Subscribe", { exact: true }).waitFor();
  const dest = () => page.evaluate(() => (window as unknown as { db: { dests: { config: { list?: { id: string }; tags?: string[]; rules?: { consent: boolean } } }[] } }).db.dests[0]?.config);
  check((await dest())?.list?.id === "aud2", "Sync: an email tool takes the audience picked");
  await page.getByLabel("Add a tag").fill("Webinar");
  await page.getByLabel("Add a tag").press("Enter");
  await page.waitForFunction(() => (window as unknown as { db: { dests: { config: { tags?: string[] } }[] } }).db.dests[0]?.config.tags?.includes("Webinar"));
  check(true, "Sync: tags are added");
  check((await dest())?.rules?.consent === true, "Sync: a new list subscribes only people who ticked consent");
  await page.getByRole("radio", { name: "Everyone" }).or(page.getByRole("button", { name: "Everyone" })).first().click();
  await page.waitForFunction(() => (window as unknown as { db: { dests: { config: { rules?: { consent: boolean } } }[] } }).db.dests[0]?.config.rules?.consent === false);
  check(true, "Sync: Subscribe Everyone is saved");
  await shot("4c-sync-list");

  // ── Phone width: the tabs move under the name ──
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(200);
  await shot("5-phone");
  const nameBox = await page.getByLabel("Form name").boundingBox();
  const tabBox = await tab("Build").boundingBox();
  const btnBox = await action.boundingBox();
  check(!!nameBox && !!tabBox && tabBox.y > nameBox.y + nameBox.height - 1, "on a phone the tabs sit under the name");
  check(!!btnBox && btnBox.x + btnBox.width <= 390, "the button stays on the screen");
} catch (e) {
  check(false, `ran to the end (${(e as Error).message})`);
  if (process.env.STACK) {
    const pg = browser.contexts()[0]?.pages()[0];
    if (pg) {
      console.log("button:", await pg.locator("[data-form-action]").textContent().catch(() => "?"), "url:", pg.url());
      console.log("calls:", JSON.stringify(await pg.evaluate(() => (window as unknown as { calls: { path: string; body: { mode?: string } }[] }).calls.map((c) => `${c.path}${c.body.mode ? `:${c.body.mode}` : ""}`).slice(-15))));
      if (shots) await pg.screenshot({ path: `${shots}/fail.png` });
    }
  }
} finally {
  await browser.close();
  server.close();
}
if (failures.length) {
  console.log(`\n${failures.length} failed`);
  process.exit(1);
}
console.log("formpage-check: all passed");
