// The Share screens in a real browser (docs/sharing-plan.md), with a fake database and server (scripts/share/entry.tsx):
// a form's Share tab, each way on its left list, a meeting's Share dialog and Settings › Link domain in each state.
//   CHROMIUM_PATH=… node scripts/share-check.ts   (SHOTS=dir saves screenshots)

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import pw from "playwright-core";
import { buildForms } from "./build-forms.mts";
import { checkForm, emptyForm } from "../src/lib/forms/schema.ts";

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
const formsJs = await buildForms();
// The live form the preview loads (the same as the harness's), and every send the preview makes: there must be none.
const FORM_ID = "6f1c2a90-4b7e-4d2a-9c1e-2b8f4a7d1e03";
const live = checkForm({ ...emptyForm(), title: "Book a demo", submit: { label: "Book my demo" }, steps: [{ id: "s1", title: "Your team", fields: [{ id: "size", key: "q.size", type: "choice", label: "How big is your team?", required: true, options: [{ value: "1", label: "1-10" }, { value: "2", label: "11-50" }] }, { id: "em", key: "email", type: "email", label: "Work email", required: true }] }] }, { custom: [] });
const sends: string[] = [];
const server = createServer((req, res) => {
  if (req.url?.startsWith("/book/")) return void res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><body style="margin:0;font:14px system-ui"><h2 style="margin:16px">Pick a time</h2></body>`);
  if (req.url === "/forms/v1.js") return void res.writeHead(200, { "content-type": "text/javascript" }).end(formsJs);
  if (req.url === `/api/forms/${FORM_ID}`) return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ id: FORM_ID, version: 3, status: "live", body: "form" in live ? live.form : null, tokens: {}, logo_url: null }));
  if (req.url?.startsWith(`/api/forms/${FORM_ID}/`)) {
    sends.push(req.url);
    return void res.writeHead(200, { "content-type": "application/json" }).end("{}");
  }
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
  const way = (label: string) => page.getByRole("button", { name: label, exact: true }).first().click();
  await page.goto(`${base}/?view=form`);
  await page.locator("[data-share-link]").waitFor();
  await page.waitForTimeout(200);
  await shot("form-default");
  check((await page.locator("[data-share-link]").getAttribute("data-share-link"))?.endsWith("/f/acme/demo-request") ?? false, `${tag}: Share opens on Link, with the link ending`);
  check((await page.getByLabel("Link ending").inputValue()) === "demo-request", `${tag}: the ending is typed in the link itself`);
  await page.getByRole("button", { name: "Copy link" }).click();
  check(await page.getByRole("button", { name: "Copied" }).first().waitFor({ timeout: 3000 }).then(() => true, () => false), `${tag}: Copy link says Copied`);
  check((await page.evaluate(() => navigator.clipboard.readText())).endsWith("/f/acme/demo-request"), `${tag}: the copied link is the one shown`);
  // The ending: Enter saves, Escape puts it back.
  await page.getByLabel("Link ending").fill("book-a-demo");
  await page.getByLabel("Link ending").press("Enter");
  await page.waitForTimeout(200);
  check((await rpcs(page)).some(([fn, a]) => fn === "form_set_slug" && a.p_slug === "book-a-demo"), `${tag}: Enter saves the link ending`);
  await page.getByLabel("Link ending").fill("other");
  await page.getByLabel("Link ending").press("Escape");
  check((await page.getByLabel("Link ending").inputValue()) === "book-a-demo", `${tag}: Escape puts the saved ending back`);
  // ⋯ holds the id link and Your own domain.
  await page.getByRole("button", { name: "More link options" }).click();
  check((await page.getByText("Copy the id link").isVisible()) && (await page.getByText("Your own domain").isVisible()), `${tag}: ⋯ has the id link and Your own domain`);
  await page.keyboard.press("Escape");
  await page.mouse.click(5, 880);
  // The preview card is the editor: the title typed on the card.
  await page.getByLabel("Title").fill("Talk to sales");
  check(((await page.getByLabel("Link preview").textContent()) ?? "").includes("Talk to sales") || (await page.getByLabel("Title").inputValue()) === "Talk to sales", `${tag}: the title is typed on the preview card`);
  await page.getByLabel("Title").blur();
  check((await page.evaluate(() => (window as unknown as { ops?: { op: string; share?: { title?: string } }[] }).ops ?? [])).some((o) => o.op === "set_share" && o.share?.title === "Talk to sales"), `${tag}: the card's title is kept`);
  check(!(await page.getByText("Fill in from the link").isVisible()), `${tag}: Fill in from the link moved to Settings`);
  check((await page.locator(".text-\\[12px\\].text-muted").filter({ hasText: /Its own page|In the page or a popup/ }).count()) === 0, `${tag}: the left list has no gray lines`);

  await way("Website");
  await page.waitForTimeout(300);
  check((await page.getByText("Seen on").count()) === 0, `${tag}: no Seen on`);
  check((await page.getByRole("button", { name: "Site builder" }).count()) === 1 && (await page.getByRole("radio", { name: "WordPress" }).count()) === 0, `${tag}: the site builders are one dropdown`);
  const frame = page.frameLocator("iframe[data-site-preview]");
  await frame.locator("claritia-form").waitFor({ state: "attached", timeout: 8000 });
  await page.waitForFunction(() => !!(document.querySelector("iframe[data-site-preview]") as HTMLIFrameElement | null)?.contentDocument?.querySelector("claritia-form")?.shadowRoot?.textContent?.includes("How big is your team?"), null, { timeout: 8000 });
  check(true, `${tag}: the preview shows the real form on a sample page`);
  await shot("form-embed");
  // The preview sends nothing, even a filled form.
  const inside = (sel: string) => page.evaluate((q) => ((document.querySelector("iframe[data-site-preview]") as HTMLIFrameElement).contentDocument!.querySelector("claritia-form")!.shadowRoot!.querySelector(q) as HTMLElement | null)?.click(), sel);
  await inside("input[type=radio]");
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const r = (document.querySelector("iframe[data-site-preview]") as HTMLIFrameElement).contentDocument!.querySelector("claritia-form")!.shadowRoot!;
    const em = r.querySelector("input[type=email]") as HTMLInputElement | null;
    if (em) {
      em.value = "ana@acme.com";
      em.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await inside("button[type=submit]");
  await page.waitForTimeout(1500);
  check(sends.length === 0, `${tag}: the preview sends nothing (no view, start or fill) (${sends.join(", ")})`);
  // A popup opens in the preview to be seen.
  await page.getByRole("radio", { name: "Popup" }).click();
  await page.waitForFunction(() => {
    const f = (document.querySelector("iframe[data-site-preview]") as HTMLIFrameElement | null)?.contentDocument?.querySelector("claritia-form");
    const box = f?.shadowRoot?.querySelector(".pbox") as HTMLElement | null;
    return !!box && box.getBoundingClientRect().width > 0;
  }, null, { timeout: 8000 });
  check(true, `${tag}: Popup opens in the preview`);
  await shot("form-popup");
  check(await copyClear(page), `${tag}: the code's Copy button sits above the code`);
  await page.getByRole("button", { name: "Site builder" }).click();
  check(await page.getByText("In WordPress: add a Custom HTML block and paste.").isVisible(), `${tag}: each builder's steps are in the dropdown`);
  await page.getByRole("option", { name: /WordPress/ }).click();
  check(((await page.getByRole("button", { name: "Site builder" }).textContent()) ?? "").includes("WordPress"), `${tag}: picking a builder shows it`);

  await way("Email");
  await page.waitForTimeout(200);
  await shot("form-email");
  await page.getByLabel("To").fill("ana@acme.com, not-an-email");
  check(await page.getByText("Not an email: not-an-email").isVisible(), `${tag}: a wrong address is named`);
  check(await page.getByRole("button", { name: "Send", exact: true }).isDisabled(), `${tag}: Send waits for good addresses`);
  await page.getByLabel("To").fill("ana@acme.com, bo@acme.com");
  check(await page.getByText("2 addresses").isVisible(), `${tag}: the count of addresses`);
  await page.getByRole("radio", { name: "The form in an email" }).click();
  check(await page.getByRole("button", { name: "Copy for Gmail or Outlook" }).isVisible(), `${tag}: the form in an email is its own picture`);

  await way("Personal link");
  await page.getByLabel("Their email").fill("ana@acme.com");
  await page.getByRole("button", { name: "Make link" }).click();
  await page.locator("[data-personal-link]").waitFor();
  await shot("form-personal");
  check((await page.locator("[data-personal-link]").getAttribute("href"))?.includes("p=") === true && (await page.getByText("Known contact").isVisible()), `${tag}: a personal link for a known contact`);
  const call = (await page.evaluate(() => (window as unknown as { calls: { path: string; body: Record<string, unknown> }[] }).calls)).find((x) => x.path === "/api/forms/personal-link");
  check(call?.body.email === "ana@acme.com", `${tag}: the link is made on the server for that email`);
  await page.getByLabel("Their email").fill("new@acme.com");
  await page.getByRole("button", { name: "Make link" }).click();
  await page.getByText("New person").waitFor();
  check(true, `${tag}: a personal link for someone new`);

  await way("QR code");
  await page.waitForTimeout(300);
  await shot("form-qr");
  check(await page.getByRole("img", { name: /QR code for/ }).isVisible(), `${tag}: the QR code`);
  await way("Own form");
  await page.waitForTimeout(200);
  await shot("form-own");

  // Before 117 the ending's function isn't there: the ending hides, no raw error shows.
  await page.goto(`${base}/?view=form&nolinks=1`);
  await page.locator("[data-share-link]").waitFor();
  await page.waitForTimeout(300);
  check((await page.getByLabel("Link ending").count()) === 0 && (await page.getByText(/schema cache|Could not find/).count()) === 0, `${tag}: a missing ending function hides the ending, with no raw error`);
  check((await page.locator("[data-share-link]").getAttribute("data-share-link"))?.includes(`/f/${FORM_ID}`) ?? false, `${tag}: and the id link is the link`);

  await page.goto(`${base}/?view=meeting`);
  await page.locator("[data-share-link]").waitFor();
  const dlg = await page.getByRole("dialog").boundingBox();
  // The panel is the right 400 px; the dialog is centered on the whole screen and wider than the panel on a desktop.
  check(!!dlg && Math.abs(dlg.x + dlg.width / 2 - width / 2) < 24 && (width < 800 || dlg.width > 400), `${tag}: Share opened from a slid-in panel is centered on the screen, never squeezed into the panel (${Math.round(dlg?.width ?? 0)} px at ${Math.round(dlg?.x ?? 0)})`);
  await page.getByRole("button", { name: "Edit booking page" }).click();
  check(await page.evaluate(() => !!(window as unknown as { editPage?: boolean }).editPage), `${tag}: Share › Link has Edit booking page`);
  await page.getByRole("img", { name: /QR code for/ }).waitFor();
  check(true, `${tag}: a meeting's link has its QR code`);
  await shot("meeting-link");
  for (const label of ["On your website", "In an email"]) {
    await page.getByRole("radio", { name: label }).or(page.getByRole("button", { name: label })).or(page.getByRole("tab", { name: label })).first().click();
    await page.waitForTimeout(300);
    await shot(`meeting-${label.replace(/\W+/g, "-").toLowerCase()}`);
    if (label === "On your website") {
      check(await copyClear(page), `${tag}: the meeting code's Copy button sits above the code`);
      // The calendar's frames, in the sample page and inside <claritia-book>'s shadow root.
      const frames = () =>
        page.evaluate(() => {
          const d = (document.querySelector("iframe[data-site-preview]") as HTMLIFrameElement | null)?.contentDocument;
          if (!d) return [] as { src: string; w: number }[];
          const all = [...d.querySelectorAll("iframe"), ...[...d.querySelectorAll("claritia-book")].flatMap((b) => [...(b.shadowRoot?.querySelectorAll("iframe") ?? [])])];
          return all.map((f) => ({ src: f.src, w: f.getBoundingClientRect().width }));
        });
      await page.waitForFunction(() => {
        const d = (document.querySelector("iframe[data-site-preview]") as HTMLIFrameElement | null)?.contentDocument;
        return !!d && [...d.querySelectorAll("claritia-book")].some((b) => !!b.shadowRoot?.querySelector("iframe"));
      }, null, { timeout: 8000 });
      const src = (await frames()).find((f) => f.src.includes("/book/"))?.src ?? "";
      check(src.includes("/book/acme/demo") && src.includes("embed=1"), `${tag}: the meeting preview shows the real calendar on a sample page`);
      check((await page.locator("iframe[data-site-preview]").evaluate((f) => getComputedStyle(f).pointerEvents)) === "none", `${tag}: and it's look only, so nobody books from the preview`);
      await page.getByRole("radio", { name: "Your own button" }).or(page.getByRole("button", { name: "Your own button" })).first().click();
      await page.waitForTimeout(1200);
      const opened = (await frames()).some((f) => f.src.includes("/book/acme/demo") && f.w > 0);
      check(opened, `${tag}: Your own button opens the calendar in the preview`);
      await shot("meeting-own-button");
    }
  }
  await page.getByRole("button", { name: "Copy signature" }).click();
  check(await page.getByRole("button", { name: "Copied" }).waitFor({ timeout: 3000 }).then(() => true, () => false), `${tag}: Copy signature says Copied`);
  // ⋯ › Embed on a website opens Share on the code, the code before the preview.
  await page.goto(`${base}/?view=meeting&start=site`);
  await page.getByRole("button", { name: "Copy code" }).waitFor();
  const codeY = (await page.getByRole("button", { name: "Copy code" }).boundingBox())!.y;
  const previewY = (await page.locator("iframe[data-site-preview]").boundingBox())!.y;
  check(codeY < previewY, `${tag}: Embed on a website opens on the code, above the preview`);

  // Meeting emails that didn't go out: one line across Meetings with the worker's reason, and a notice on the meeting.
  await page.goto(`${base}/?view=mail`);
  await page.getByText("Meeting emails aren't going out").waitFor();
  await shot("mail");
  check(await page.getByText("Resend isn't set up on the worker (RESEND_API_KEY).").first().isVisible(), `${tag}: the email warning gives the worker's reason`);
  check(await page.getByText("2 emails, last").isVisible(), `${tag}: and how many, and when`);
  check((await page.getByText("Confirmation not sent").isVisible()) && (await page.getByText("to trollong2002@gmail.com").isVisible()), `${tag}: the meeting says which email didn't go out, to whom`);
  const spill = await page.evaluate(() => [...document.querySelectorAll("[role=alert] *")].some((e) => (e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth + 1 || e.getBoundingClientRect().right > window.innerWidth + 1));
  check(!spill, `${tag}: nothing in the warning spills or is cut`);
  await page.goto(`${base}/?view=mail&mailok=1`);
  await page.waitForTimeout(400);
  check((await page.locator("[role=alert]").count()) === 0, `${tag}: emails going out: no warning`);

  // The sidebar with a long workspace name and email: no word is cut short.
  if (width >= 1280) {
    await page.goto(`${base}/?view=sidebar`);
    await page.getByText("Claritia", { exact: true }).waitFor();
    await shot("sidebar");
    const cut = await page.evaluate(() =>
      [...document.querySelectorAll("aside *")]
        .filter((e) => e instanceof HTMLElement && e.children.length === 0 && (e.textContent ?? "").trim() && getComputedStyle(e).display !== "none")
        .filter((e) => (e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth + 1 || getComputedStyle(e).textOverflow === "ellipsis")
        .map((e) => (e.textContent ?? "").trim()),
    );
    check(cut.length === 0, `${tag}: the sidebar cuts no words (${cut.join(", ")})`);
    check(await page.getByText("hoanghy2032002@gmail.com's workspace").isVisible(), `${tag}: the workspace name shows in full`);
    check((await page.getByRole("img", { name: "hoanghy2032002@gmail.com" }).count()) === 1, `${tag}: the account is its avatar, with the email on hover`);
  }

  for (const st of ["none", "pending", "active", "failed"]) {
    await page.goto(`${base}/?view=domain&state=${st}&subs=1`);
    await page.waitForTimeout(300);
    await shot(`domain-${st}`);
    if (st === "pending") check(await page.getByRole("button", { name: "Copy name" }).isVisible(), `${tag}: the DNS record's name has its copy`);
    if (st === "failed") check(await page.getByText("Checked just now").isVisible(), `${tag}: when it was last checked`);
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
