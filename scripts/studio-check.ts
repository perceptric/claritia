// Form Studio in a real browser (docs/forms-chat-plan.md), with a stand-in server (scripts/studio/entry.ts). The brand
// menu opens first; Add a brand reads the site, asks "Is this the brand?" with its real logo and name, and only then
// reads its look. The chat streams Claude's form into the live preview, the logo is the brand's own picture, the steps,
// show-if and required checks work, the booking calendar shows after the send, and Edit, Code and On submission work.
//   CHROMIUM_PATH=… node scripts/studio-check.ts   (SHOTS=dir saves screenshots)

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import pw from "playwright-core";
import { sampleSlots } from "../src/lib/forms/calendar.ts";
import { checkForm, type Form } from "../src/lib/forms/schema.ts";
import { pageForm, type PageAfter } from "../src/lib/studio/page.ts";
import { buildForms } from "./build-forms.mts";

const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  if (!ok) failures.push(what);
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};

const root = new URL("..", import.meta.url).pathname;
const bundle = await build({ entryPoints: [`${root}scripts/studio/entry.ts`], bundle: true, write: false, format: "esm", logLevel: "error" });
const js = bundle.outputFiles[0]!.contents;
const globals = `${root}src/app/globals.css`;
const css = (await postcss([tailwind()]).process(readFileSync(globals, "utf8"), { from: globals })).css;
const formsJs = await buildForms();
// The live form: the published body comes from the studio's Publish (set below), answers and bookings are kept.
let live: Form | null = null;
const sends: { answers: Record<string, unknown> }[] = [];
const page = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css"><style>html,body{height:100%;margin:0}#studio{height:100%;display:flex;flex-direction:column}</style></head><body><div id="studio"></div><script type="module" src="/app.js"></script></body></html>`;
const LIVE_ID = "33333333-3333-4333-8333-333333333333";
const server = createServer((req, res) => {
  const body = () => new Promise<string>((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => r(b)); });
  const json = (o: unknown) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(o));
  if (req.url === "/forms/v1.js") return void res.writeHead(200, { "content-type": "text/javascript" }).end(formsJs);
  if (req.url === `/live`) return void res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><html><head><meta charset="utf-8"><script src="/forms/v1.js"></script></head><body style="margin:0"><claritia-form form-id="${LIVE_ID}" host="http://localhost:${(server.address() as { port: number }).port}"></claritia-form></body></html>`);
  if (req.url === `/api/forms/${LIVE_ID}`) return json({ id: LIVE_ID, version: 1, status: "live", body: live, tokens: {}, logo_url: "https://cdn.example/logo.svg" });
  if (req.url === `/api/forms/${LIVE_ID}/submit`) return void body().then((b) => (sends.push(JSON.parse(b)), json({ id: "s1", booking: { token: "t", slots: sampleSlots(Date.now()), lengths: [30], length: 30 } })));
  if (req.url?.startsWith(`/api/forms/${LIVE_ID}/seen`)) return json({});
  if (req.url?.startsWith("/app.css")) return void res.writeHead(200, { "content-type": "text/css" }).end(css);
  if (req.url?.startsWith("/app.js")) return void res.writeHead(200, { "content-type": "text/javascript" }).end(js);
  res.writeHead(200, { "content-type": "text/html" }).end(page);
});
await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as { port: number }).port;
const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const shots = process.env.SHOTS;
try {
  const p = await browser.newPage({ viewport: { width: 1360, height: 860 } });
  const errors: string[] = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(`http://localhost:${port}/`);
  const $ = (sel: string) => p.locator(`#studio ${sel}`);
  const calls = () => p.evaluate(() => (window as unknown as { calls: { mode: string; body: unknown }[] }).calls);

  // 1. No brand yet: the menu is open, the chat waits
  await $("#brandMenu").waitFor();
  check(await $("#brandMenu").isVisible(), "the brand menu opens when there's no brand");
  check(await $("#input").isDisabled(), "the chat waits for a brand");
  check((await $("#input").getAttribute("placeholder")) === "Pick a brand to start", "the chat says to pick a brand");

  // 2. Add a brand: the site is read for its name and logo, and confirmed before the look
  await $("#brandMenu button", ).filter({ hasText: "Add a brand" }).click();
  await $("#dlgSite").fill("nope.dev");
  await $("#dlgBody button[type=submit]").click();
  await $("#dlgBody .err").waitFor();
  check((await $("#dlgBody").textContent())!.includes("Read it in a browser"), "a site that can't be read offers the browser read");
  await $("#dlgSite").fill("finch.care");
  await $("#dlgBody button[type=submit]").click();
  await $("#dlgName").waitFor();
  check((await $("#dlgName").inputValue()) === "Finch", "the name comes from the site");
  check(((await $("#dlgBody img.mark").getAttribute("src")) ?? "").startsWith("data:image/png"), "the real logo shows before confirming");
  check(!(await calls()).some((c) => c.mode === "look"), "the look isn't read before the brand is confirmed");
  if (shots) await p.screenshot({ path: `${shots}/1-confirm.png` });
  await $("#dlgBody button").filter({ hasText: "Yes, use this brand" }).click();
  await $("#brandDlg").waitFor({ state: "hidden" });
  check((await calls()).some((c) => c.mode === "confirm" && (c.body as { logoUrl: string }).logoUrl === "https://finch.care/logo.png"), "confirming saves the name and the logo's address");
  check((await $("#brandBtn").textContent())!.includes("Finch"), "the picked brand shows in the bar");
  check(await $("#send").isDisabled(), "send waits while the brand's look is read");
  await p.waitForFunction(() => !document.querySelector("#studio")!.shadowRoot!.getElementById("send")!.hasAttribute("disabled"));
  check((await calls()).some((c) => c.mode === "look"), "the look is read after confirming");
  check((await $("#msgs").textContent())!.includes("soft green"), "what Claude found in the look shows in the chat");

  // 3. The chat builds the form in the preview, with the real logo
  await $("#input").fill("A daily check-in");
  await $("#input").press("Enter");
  await p.waitForFunction(() => !document.querySelector("#studio")!.shadowRoot!.querySelector(".msg.ai .tia.working"), null, { timeout: 15000 });
  const chat = (await calls()).find((c) => c.mode === "chat")!.body as { content: string }[];
  const last = chat.at(-1)!.content;
  check(last.includes("<brand_css>") && last.includes("11111111-1111-4111-8111-111111111111: Intro call, 15 min"), "each message carries the brand CSS and the meeting types");
  const form = p.locator("#studio").locator("#host");
  const logo = await p.evaluate(() => (document.querySelector("#studio")!.shadowRoot!.getElementById("host")!.shadowRoot!.querySelector("img[data-cl-logo]") as HTMLImageElement | null)?.src ?? "");
  check(logo.startsWith("data:image/png"), "the form shows the brand's real logo");
  check(await form.locator("#title").isVisible(), "the form draws in the preview");
  if (shots) await p.screenshot({ path: `${shots}/2-built.png` });

  // 4. Required, steps, show-if, thanks and the booking calendar
  await form.locator("[data-cl-next]").click();
  check(((await form.locator('[data-cl-error-for="name"]').textContent()) ?? "").length > 0, "a required answer stops the next step");
  await form.locator("#nm").fill("Sam");
  await form.locator('label:has(input[value="tender"])').first().click();
  check(await form.locator("[data-cl-show-if]").first().isVisible(), "show-if shows the follow-up");
  await form.locator("[data-cl-next]").click();
  const stepOk = await form.locator('input[name="email"]').isVisible();
  if (!stepOk) console.log("debug", await form.locator("[data-cl-error-for]").allTextContents(), await p.evaluate(() => (document.querySelector("#studio")!.shadowRoot!.getElementById("host")!.shadowRoot!.querySelector("section[data-cl-step]") as HTMLElement).hidden));
  check(stepOk, "next moves to step 2");
  await form.locator('input[name="email"]').fill("sam@example.com");
  await form.locator("[type=submit]").click();
  await form.locator(".cl-cal").waitFor();
  check((await form.locator(".cl-cal h4").textContent())!.includes("intro call"), "the route books the right meeting");
  if (shots) await p.screenshot({ path: `${shots}/3-book.png` });

  // 5. Edit, Code, On submission
  await $("#t-edit").click();
  await form.locator("#title").click();
  check((await $("#selTag").textContent()) === "<h1>", "Edit picks an element");
  await $("#t-code").click();
  check((await $("#codeText").inputValue()).includes('id="title"'), "Code shows the HTML");
  await $("#c-brand").click();
  check((await $("#codeText").inputValue()).includes("--finch-mint"), "Code shows the brand CSS");
  await $("#t-after").click();
  const after = (await $("#afterInner").textContent())!;
  check(after.includes("Intro call") && after.includes("Product demo"), "On submission lists the workspace's meeting types");
  check((await $("#afterInner .pill.on").allTextContents()).some((t) => t.startsWith("Product demo")), "Claude's choice of meeting is set");
  if (shots) await p.screenshot({ path: `${shots}/4-after.png` });

  // 6. Tia, the brand as its logo and name, and Publish
  check((await $(".msg.ai .who").first().textContent())!.includes("Tia") && !(await $("#app").textContent())!.includes("Claude"), "the chat is Tia, and Claude isn't named");
  check(!(await $("#brandBtn").textContent())!.includes("finch.care"), "the brand shows as its logo and name");
  await $("#t-preview").click();
  await $("#publish").click();
  await p.waitForFunction(() => document.querySelector("#studio")!.shadowRoot!.getElementById("publish")!.textContent === "Published");
  const pub = (await calls()).find((c) => c.mode === "publish")!.body as { html: string; css: string; brand: string; after: PageAfter; name: string };
  check(pub.name === "Daily check-in" && pub.html.includes("data-cl-step") && pub.brand.includes("--finch-mint"), "Publish sends the form's name, page and brand CSS");
  check(!!(await $("#pubNote a").getAttribute("href")), "a published form links to its page");
  const made = checkForm(pageForm(pub).form);
  check("form" in made, `the published page passes the form checker${"errors" in made ? `: ${made.errors.join("; ")}` : ""}`);
  live = "form" in made ? made.form : null;

  // 7. The live form: the page in the form script, answers by field id, the booking in the page's spot
  const lp = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  lp.on("pageerror", (e) => errors.push(`live: ${e.message}`));
  await lp.goto(`http://localhost:${port}/live`);
  const lf = lp.locator("claritia-form");
  await lf.locator("#title").waitFor();
  check((await lf.locator("img[data-cl-logo]").getAttribute("src")) === "https://cdn.example/logo.svg", "the live form shows the brand's logo");
  await lf.locator("[data-cl-next]").click();
  check(((await lf.locator('[data-cl-error-for="name"]').textContent()) ?? "").length > 0, "the live form checks required answers");
  await lf.locator("#nm").fill("Sam");
  await lf.locator('label:has(input[value="tender"])').first().click();
  await lf.locator("#why").fill("A long week");
  await lf.locator("[data-cl-next]").click();
  await lf.locator('input[name="email"]').fill("sam@example.com");
  await lf.locator("[type=submit]").click();
  await lf.locator("[data-cl-book] .tm .pl").first().waitFor();
  const sent = sends[0]?.answers ?? {};
  const ids = live?.page?.ids ?? {};
  check(sent[ids.name!] === "Sam" && sent[ids.email!] === "sam@example.com" && sent[ids.mood!] === "tender" && sent[ids.why!] === "A long week", "the live form sends each answer by its field id");
  check(await lf.locator("[data-cl-thanks]").isVisible(), "the page's thanks shows after the send");
  check((await lf.locator("[data-cl-book] .tm .pl").count()) > 0, "the booking calendar opens in the page's booking spot");
  if (shots) await lp.screenshot({ path: `${shots}/5-live.png` });

  // 8. Delete a brand from the menu
  await $("#brandBtn").click();
  await $("#brandMenu button[aria-label='Delete Finch']").click();
  await $("#brandMenu .mdel button").filter({ hasText: "Delete" }).click();
  check((await calls()).some((c) => c.mode === "delete"), "a brand can be deleted from the menu");
  check(!(await $("#brandBtn").textContent())!.includes("Finch"), "the deleted brand leaves the bar");
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join("; ")}` : ""}`);
} finally {
  await browser.close();
  server.close();
}
if (failures.length) {
  console.log(`\n${failures.length} failed`);
  process.exit(1);
}
console.log("\nall passed");
