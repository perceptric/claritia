// Form Studio in a real browser (docs/studio-v2-plan.md), with a stand-in server (scripts/studio/entry.ts). Add a brand
// opens first: it reads the site, asks "Is this the brand?" with its real logo and name, and only then reads its look.
// Tia builds the form into the live preview and the chat is saved with it; once built, a change lands with no setup
// question. Edit works right on the form (pick, type, the floating bar, undo) with nothing covering the bar; Code, On
// submission and Publish work, the published page runs in the form script, and each form keeps its own chat.
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
  if (req.url === `/api/forms/${LIVE_ID}/upload`) return void body().then(() => json({ token: "up_11111111-1111-4111-8111-111111111111:day.png" }));
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
  const sh = (fn: string) => p.evaluate(fn);
  const calls = () => p.evaluate(() => (window as unknown as { calls: { mode: string; body: unknown }[] }).calls);
  const idle = () => p.waitForFunction(() => !document.querySelector("#studio")!.shadowRoot!.querySelector(".msg.ai .tia.working"), null, { timeout: 15000 });
  const form = p.locator("#studio").locator("#host");
  // The views: the editor (always), Preview from the page's header, and On submission as the last step.
  const toPreview = async () => { if (!(await $("#exitPrev").isVisible())) await p.locator("#hdrPreview").click(); };
  const toEdit = async () => { if (await $("#exitPrev").isVisible()) await $("#exitPrev").click(); else if (await $("#afterView").isVisible()) await $("#stepBar .sp").first().click(); };
  const toAfter = async () => { await toEdit(); await $("#stepBar .sp.after").click(); };

  // 1. A new workspace opens on the templates: every one, by family and search, with nothing covering them
  await $("#tplGrid .tpl").first().waitFor();
  check((await $("#brandDlg").count()) === 0 && (await $("#tpls").isVisible()), "an empty form shows the templates, with no dialog over them");
  const tplAll = await $("#tplGrid .tpl").count();
  check(tplAll === 48 && (await $("#tplQ").getAttribute("placeholder"))!.startsWith("Search 4"), "the templates show 48 at a time, out of hundreds");
  await $("#tplMore").click();
  check((await $("#tplGrid .tpl").count()) === 144, "Show more adds more templates");
  await $("#tplFam button").filter({ hasText: "Booking" }).click();
  check((await $("#tplFam button[aria-pressed='true']").textContent())!.startsWith("Booking") && (await $("#tplGrid .tpl").count()) > 4, "a family picks its templates");
  await $("#tplFam button").filter({ hasText: "All" }).click();
  await $("#tplQ").fill("patient intake");
  const hits = await $("#tplGrid .tpl .t-nm").allTextContents();
  check(hits.length > 0 && hits.length < 40, `search narrows the templates (${hits.length})`);
  await $("#tplQ").fill("zzzz no such form");
  check((await $("#tplGrid").textContent())!.includes("No templates match"), "a search with no match says so");
  await $("#tplQ").fill("");
  const tplBox = await $("#tpls").evaluate((e) => [...e.querySelectorAll(".tpl")].every((c) => c.scrollWidth <= c.clientWidth + 1));
  check(tplBox, "no template card spills out of its box");
  if (shots) await p.screenshot({ path: `${shots}/0-templates.png` });

  // 1b. No brand yet: the chat waits, and the brand button opens Add a brand
  check(await $("#input").isDisabled(), "the chat waits for a brand");
  await $("#brandBtn").click();
  await $("#brandDlg").waitFor();

  // 2. Add a brand: the site is read for its name and logo, and confirmed before the look
  await $("#dlgSite").fill("nope.dev");
  await $("#dlgBody button[type=submit]").click();
  await $("#dlgBody .err").waitFor();
  check((await $("#dlgBody").textContent())!.includes("Read it in a browser"), "a site that can't be read offers the browser read");
  await $("#dlgSite").fill("finch.care");
  await $("#dlgBody button[type=submit]").click();
  await $("#dlgName").waitFor();
  check((await $("#dlgName").inputValue()) === "Finch", "the name comes from the site");
  check(((await $("#dlgBody .confirm img").getAttribute("src")) ?? "").startsWith("data:image/png"), "the real logo shows before confirming");
  check(!(await calls()).some((c) => c.mode === "look"), "the look isn't read before the brand is confirmed");
  if (shots) await p.screenshot({ path: `${shots}/1-confirm.png` });
  await $("#dlgBody button").filter({ hasText: "Yes, use this brand" }).click();
  await $("#brandDlg").waitFor({ state: "detached" });
  check((await calls()).some((c) => c.mode === "confirm" && (c.body as { logoUrl: string }).logoUrl === "https://finch.care/logo.png"), "confirming saves the name and the logo's address");
  check((await $("#brandBtn").textContent())!.trim() === "Finch", "the brand shows as its logo and name only");
  check(await $("#send").isDisabled(), "send waits while the brand's look is read");
  await p.waitForFunction(() => !document.querySelector("#studio")!.shadowRoot!.getElementById("send")!.hasAttribute("disabled"));
  check((await calls()).some((c) => c.mode === "look"), "the look is read after confirming");
  check((await $("#msgs").textContent())!.includes("soft green"), "what Tia found in the look shows in the chat");
  check((await $(".starts button").first().textContent()) === "A new patient booking form", "an empty chat offers the industry's starting ideas");
  check((await $("#profileBtn").textContent())!.includes("Healthcare and dental in United States, English and Spanish"), "the site's industry, country and languages show under the brand");
  await $("#profileBtn").click();
  await $("#layer .menu .mi").filter({ hasText: "Hospitality and events" }).click();
  check((await $("#profileBtn").textContent())!.startsWith("Hospitality and events") && (await calls()).some((c) => c.mode === "keepProfile" && (c.body as { profile: { industry: string } }).profile.industry === "events"), "one click changes the industry, and it's kept on the brand");
  check((await $(".starts button").first().textContent()) === "An RSVP with a plus-one", "the ideas follow the industry");

  // 3. Tia builds the form; the chat is saved with it
  await $("#input").fill("A daily check-in");
  await $("#input").press("Enter");
  await idle();
  const first = (await calls()).find((c) => c.mode === "tia")!.body as { content: string }[];
  const opts1 = (await calls()).find((c) => c.mode === "tiaOpts")!.body as { brand: string; built: boolean };
  check(first.at(-1)!.content.includes("[NOTHING BUILT YET]") && opts1.brand.includes("11111111-1111-4111-8111-111111111111: Intro call, 15 min") && !opts1.built, "the first message says nothing is built; the meeting types ride in the brand block");
  check(opts1.brand.includes("[Industry: Hospitality and events, US. Write the form in English"), "Tia gets the industry's recipe in the brand block");
  check(opts1.brand.includes("<brand_css>") && !first.at(-1)!.content.includes("<brand_css>"), "the brand's CSS goes once in the cached brand block, not in each message");
  check(await form.locator("#title").isVisible(), "the form draws in the preview");
  check((await form.locator('#photo input[type="file"]').count()) === 1 && (await form.locator("#photo .label").textContent())!.includes("A photo of your day"), "a Claritia block shows in the preview with its label");
  const logo = await p.evaluate(() => (document.querySelector("#studio")!.shadowRoot!.getElementById("host")!.shadowRoot!.querySelector("img[data-cl-logo]") as HTMLImageElement | null)?.src ?? "");
  check(logo.startsWith("data:image/png"), "the form shows the brand's real logo");
  check((await $("#chatPick").textContent())!.includes("Daily check-in"), "the chat takes the form's name");
  check((await $(".msg.ai .who").first().textContent())!.includes("Tia") && !(await $("#app").textContent())!.includes("Claude"), "the chat is Tia, and Claude isn't named");
  await p.waitForFunction(() => Object.values((window as unknown as { saved: Record<string, { body?: { html: string } }> }).saved).some((c) => c.body?.html.includes('id="title"')));
  check(true, "the chat is saved with its form");
  if (shots) await p.screenshot({ path: `${shots}/2-built.png` });

  // 4. Built is built: a change lands with no setup question
  check((await $("#input").getAttribute("placeholder")) === "Ask Tia to change anything", "a built form asks for changes");
  await $("#input").fill("Call the title How was today?");
  await $("#input").press("Enter");
  await idle();
  const second = ((await calls()).filter((c) => c.mode === "tia")[1]!.body as { content: string }[]).at(-1)!.content;
  check(second.includes("[THE FORM IS BUILT]") && ((await calls()).filter((c) => c.mode === "tiaOpts")[1]!.body as { built: boolean }).built, "a change says the form is built, so Tia thinks less");
  check(!/>\s+</.test(/<form_html>([\s\S]*?)<\/form_html>/.exec(second)![1]!), "the form goes to Tia without the spaces between tags");
  check((await form.locator("#title").textContent()) === "How was today?", "Tia's change lands on the form");
  check((await $(".ask").count()) === 0, "no setup question once the form is built");
  check((await $(".did").last().textContent())!.includes("Renamed the title"), "the chat says what changed");

  // 4b. Files for Tia: a picture goes with the message, and shows on it
  await $("#fileIn").setInputFiles({ name: "old-form.png", mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a", "hex") });
  check((await $("#attached .fchip").textContent())!.includes("old-form.png"), "an attached file shows under the box");
  await $("#send").click();
  await idle();
  const opts3 = (await calls()).filter((c) => c.mode === "tiaOpts").at(-1)!.body as { files: { name: string; type: string; data: string }[] };
  const third = ((await calls()).filter((c) => c.mode === "tia").at(-1)!.body as { content: string }[]).at(-1)!.content;
  check(opts3.files.length === 1 && opts3.files[0]!.name === "old-form.png" && opts3.files[0]!.type === "image/png" && opts3.files[0]!.data.length > 0, "the picture goes to Tia with the message");
  check(third.startsWith("Use old-form.png") && (await $(".msg.me .fchip").last().textContent())!.includes("old-form.png") && (await $("#attached").isHidden()), "the message names the file and the box clears");
  await $("#undo").click();

  // 5. The preview still runs: required, steps, show-if, the booking calendar
  check(!(await $("#exitPrev").isVisible()) && (await $("#panel").isVisible()), "the Studio opens in the editor, with no view tabs");
  await toPreview();
  check((await $("#exitPrev").isVisible()) && !(await $("#chat").isVisible()) && !(await $("#panel").isVisible()), "Preview from the header fills the screen, with Back to editor");
  await form.locator("[data-cl-next]").click();
  check(((await form.locator('[data-cl-error-for="name"]').textContent()) ?? "").length > 0, "a required answer stops the next step");
  await form.locator("#nm").fill("Sam");
  await form.locator('label:has(input[value="tender"])').first().click();
  check(await form.locator("[data-cl-show-if]").first().isVisible(), "show-if shows the follow-up");
  await form.locator("[data-cl-next]").click();
  await form.locator('input[name="email"]').fill("sam@example.com");
  await form.locator("[type=submit]").click();
  await form.locator(".cl-cal .cl-time").first().waitFor();
  check((await form.locator(".cl-cal .cl-host b").first().textContent())!.includes("Intro call"), "the route books the right meeting");
  check((await calls()).some((c) => c.mode === "times" && String(c.body).startsWith("1111")) && (await form.locator(".cl-cal .cl-day").count()) === 2 && (await form.locator(".cl-cal .cl-time").count()) === 3, "the preview shows the meeting type's real open times");
  check((await form.locator(".cl-cal .cl-day").first().getAttribute("class"))!.includes("btn") && (await form.locator(".cl-cal .cl-time").first().getAttribute("class"))!.includes("btn-secondary"), "the calendar wears the brand's button classes");

  // 6. Edit: pick, type in place, the floating bar, undo, and nothing covers anything
  await toEdit();
  check((await $("#aiBody").isVisible()) && (await $("#m-ai").getAttribute("aria-selected")) === "true", "a form Tia built stays on AI in the sidebar");
  await $("#m-build").click();
  check((await $("#adds").isVisible()) && !(await $("#aiBody").isVisible()), "Build shows Add fields; AI is one switch away");
  // Steps: one at a time, the thank-you, or all with dividers
  check((await $("#stepBar .sp").count()) === 5 && (await $("#stepBar .sp").nth(2).textContent()) === "Thank-you" && (await $("#stepBar .sp").nth(3).textContent()) === "On submission", "the steps list each page, the thank-you, On submission last, and All");
  check((await $("#stepBar .sp").nth(2).getAttribute("aria-pressed")) === "true", "Edit opens on the step the preview was showing (here the thank-you)");
  await $("#stepBar .sp").nth(0).click();
  check((await form.locator("#nm").isVisible()) && !(await form.locator('input[name="email"]').isVisible()) && !(await form.locator("#thanks").isVisible()), "Edit shows one step at a time");
  check(((await form.locator("#soft").getAttribute("data-cl-if")) ?? "").includes("Tender"), "a part shown only for some answers says so in words");
  await $("#stepBar .sp").nth(1).click();
  check((await form.locator('input[name="email"]').isVisible()) && !(await form.locator("#nm").isVisible()), "picking step 2 shows step 2");
  await $("#stepBar .sp").nth(2).click();
  check((await form.locator("#thanks").isVisible()) && (await form.locator(".cl-bookph").isVisible()), "the thank-you shows on its own, with its booking spot");
  await $("#stepBar .sp").nth(4).click();
  check((await form.locator(".cl-divider").count()) === 3, "All shows every step with a divider");
  await $("#stepBar .sp").nth(0).click();
  await $("#stepBar button[aria-label='Add a page after']").click();
  check((await $("#stepBar .sp").count()) === 6 && (await form.locator("section[data-cl-step]").nth(1).locator("[data-cl-next]").count()) === 1 && (await form.locator("section[data-cl-step]").nth(2).locator("[type=submit]").count()) === 1, "a new step goes in with Next, and the send button stays on the last step");
  await $("#stepBar button[aria-label='Move later']").click();
  check((await form.locator("section[data-cl-step]").nth(2).locator("[type=submit]").count()) === 1 && (await form.locator("section[data-cl-step]").nth(1).locator("[type=submit]").count()) === 0, "moving a step keeps Next and send in order");
  await $("#undo").click();
  await $("#undo").click();
  check((await $("#stepBar .sp").count()) === 5, "undo takes the new step back out");
  await $("#stepBar .sp").nth(0).click();
  await form.locator("#title").click();
  check((await $("#seltag").textContent()) === "Heading" && (await $("#fbar").isVisible()), "picking shows its name and the floating bar");
  await form.locator("#title").click();
  await p.keyboard.press("ControlOrMeta+a");
  await p.keyboard.type("Your day");
  await p.keyboard.press("Enter");
  check((await form.locator("#title").textContent()) === "Your day", "text is typed right on the form");
  await $("#undo").click();
  check((await form.locator("#title").textContent()) === "How was today?", "undo puts it back");
  await form.locator("#title").click();
  await $("#fbar button[aria-label='Duplicate']").click();
  check((await form.locator("h1").count()) >= 2, "the floating bar duplicates");
  await $("#undo").click();

  // 6b. The no-code builder: Add (click, "/", drag), change type, limits, answers in text, jumps and the Form tab.
  const order = () => p.evaluate(() => [...document.querySelector("#studio")!.shadowRoot!.querySelector("#host")!.shadowRoot!.querySelectorAll("[data-k]")].map((e) => (e.getAttribute("name") || e.getAttribute("data-cl-error-for") ? `${e.tagName.toLowerCase()}:${e.getAttribute("name") || `err-${e.getAttribute("data-cl-error-for")}`}` : e.id ? `#${e.id}` : e.tagName.toLowerCase())));
  const builtHtml = () => p.evaluate(() => Object.values((window as unknown as { saved: Record<string, { body?: { html: string; css: string } }> }).saved).map((c) => `${c.body?.html ?? ""}\n${c.body?.css ?? ""}`).find((x) => x.includes('id="title"')) ?? "");
  await $("#stepBar .sp").nth(0).click();
  check((await $("#adds").isVisible()) && (await $("#addList button[data-add]").count()) >= 20, "Edit opens with the Add list, every question type in it");
  await $("#addQ").fill("check");
  check((await $("#addList button[data-add]").count()) === 1, "the Add list finds a type as you type");
  await $("#addQ").fill("");
  await form.locator("#nm").click();
  await $("#addList button[data-add='long']").click();
  let o = await order();
  check(o.indexOf("textarea:details") > o.indexOf("span:err-name") && o.indexOf("textarea:details") < o.indexOf("#q"), "a question added from the list lands after the picked one, past its error line");
  check(((await form.locator("textarea[name='details']").getAttribute("class")) ?? "").includes("field") && ((await form.locator("label[for='q_details']").getAttribute("class")) ?? "") === "lbl", "it wears the page's own classes");
  check((await $("#pscroll").textContent())!.includes("Min characters"), "and its settings open");
  await form.locator("#title").click();
  await p.keyboard.press("Escape");
  await form.locator("#nm").click();
  await p.keyboard.press("/");
  await $("#layer .menu input").fill("date");
  await p.keyboard.press("Enter");
  check((await form.locator("[data-cl-field='date']").count()) === 1, "/ opens the list, and Enter adds the first match");
  await $("#addList button[data-add='yesno']").dragTo(form.locator("#q"), { targetPosition: { x: 10, y: 2 } });
  o = await order();
  check(o.includes("input:yes_no") && o.indexOf("input:yes_no") < o.indexOf("#q"), "a type dragged onto the form lands where it's dropped");
  // Change type keeps the answer's name.
  await form.locator("textarea[name='details']").click();
  await $("#typeBtn").click();
  await $("#layer .menu button").filter({ hasText: "Short answer" }).click();
  check((await form.locator("input[name='details'][type='text']").count()) === 1 && (await form.locator("textarea[name='details']").count()) === 0, "a long answer turns into a short answer, under the same name");
  await form.locator("label:has(input[name='mood'])").first().click();
  await $("#typeBtn").click();
  await $("#layer .menu button").filter({ hasText: "Dropdown" }).click();
  check((await form.locator("select[name='mood'] option").count()) === 4, "a choice turns into a dropdown with the same options");
  await $("#undo").click();
  check((await form.locator("input[name='mood'][type='radio']").count()) === 3, "undo brings the choice back");
  // Limits on an answer.
  await form.locator("#nm").click();
  await $("#p-set").click();
  await $("#pscroll input[aria-label='Max characters']").fill("40");
  await $("#pscroll input[aria-label='Max characters']").press("Enter");
  await $("#pscroll input[aria-label='Max characters']").blur();
  check((await form.locator("#nm").getAttribute("maxlength")) === "40", "the most letters is set on the answer");
  // Options: a dropdown's list is added to, renamed, moved, pasted and trimmed; a renamed option saves what it says.
  await $("#addList button[data-add='dropdown']").click();
  const dd = form.locator("select[name='pick']");
  check((await dd.locator("option").count()) === 4, "a new dropdown comes with three options");
  await $("#pscroll input[aria-label='Option 1']").fill("Small team");
  await $("#pscroll input[aria-label='Option 1']").press("Enter");
  check((await dd.locator("option[value='Small team']").textContent()) === "Small team", "a renamed option saves what it says");
  await $("#pscroll button").filter({ hasText: "Add option" }).click();
  check((await dd.locator("option").count()) === 5, "Add option adds one to the dropdown");
  await $("#pscroll button[aria-label='Move down']").first().click();
  check((await dd.locator("option").nth(2).getAttribute("value")) === "Small team", "an option moves down");
  await $("#pscroll button").filter({ hasText: "Bulk add" }).click();
  await $("#layer .menu textarea").fill("Agency\nSchool");
  await $("#layer .menu button").filter({ hasText: "Add options" }).click();
  const ddVals = await dd.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
  check(ddVals.slice(-2).join(",") === "Agency,School", `a pasted list adds each line in order (${ddVals.join(", ")})`);
  await $("#pscroll button[aria-label='Remove the option']").first().click();
  check((await dd.locator("option").count()) === 6, "an option can be removed");
  await $("#pscroll input[aria-label='Placeholder']").fill("Pick your team");
  await $("#pscroll input[aria-label='Placeholder']").press("Enter");
  await $("#pscroll input[aria-label='Placeholder']").blur();
  check((await dd.locator("option[value='']").textContent()) === "Pick your team", "the dropdown's empty choice says what it's asked to");
  if (shots) await p.screenshot({ path: `${shots}/2c-options.png` });
  // Choices: a value set on purpose stays when its words change, and Other adds a box for their own words.
  await form.locator("label:has(input[value='sunny'])").click();
  await $("#pscroll input[aria-label='Option 1']").fill("Bright");
  await $("#pscroll input[aria-label='Option 1']").press("Enter");
  check(((await form.locator("label:has(input[value='sunny'])").textContent()) ?? "").includes("Bright"), "a choice's words change and its saved value (sunny) stays");
  await $("#pscroll button[aria-label='Allow Other']").click();
  check((await form.locator("input[name='mood'][value='Other']").count()) === 1 && (await form.locator("input[name='mood_other']").count()) === 1, "Other adds a choice and a box for their own words");
  await $("#pscroll input[aria-label='Label']").fill("How do you feel?");
  await $("#pscroll input[aria-label='Label']").press("Enter");
  await $("#pscroll input[aria-label='Label']").blur();
  check(((await form.locator("#q").textContent()) ?? "") === "How do you feel?", "a choice question's words are set from the panel, even in a line of their own");
  // Blocks: a ranking's list and a payment's price.
  await $("#addList button[data-add='ranking']").click();
  await $("#pscroll button").filter({ hasText: /^Add$/ }).click();
  check(((await form.locator("[data-cl-field='ranking']").getAttribute("data-cl-options")) ?? "").split("|").length === 4, "a ranking's list takes another option");
  await $("#addList button[data-add='payment']").click();
  await $("#pscroll input[aria-label='Price']").fill("99");
  await $("#pscroll input[aria-label='Price']").press("Enter");
  await $("#pscroll input[aria-label='Price']").blur();
  check((await form.locator("[data-cl-field='payment']").getAttribute("data-cl-amount")) === "99", "a payment's price is set");
  // An answer in a text.
  await form.locator("#title").click();
  await $("#pscroll button").filter({ hasText: "Insert field value" }).click();
  await $("#layer .menu button").filter({ hasText: "{name}" }).click();
  check(((await form.locator("#title").textContent()) ?? "").endsWith("{name}") && (await form.locator("#title").getAttribute("data-cl-pipe")) !== null, "an earlier answer goes into a text as {name}");
  // A jump: three pages, and Tender skips the second.
  await $("#stepBar .sp").nth(0).click();
  await $("#stepBar button[aria-label='Add a page after']").click();
  await $("#stepBar .sp").nth(0).click();
  await form.locator("label:has(input[name='mood'])").first().click();
  await $("#pscroll button").filter({ hasText: "Add skip rule" }).click();
  await $("#pscroll .jrow .dd").first().click();
  await $("#layer .menu button").filter({ hasText: "Tender" }).click();
  const skipped = await form.locator("section[data-cl-step]").nth(1).getAttribute("data-cl-show-if");
  check(skipped === "mood != 'tender'", `the page a jump skips shows only for other answers (${skipped})`);
  await toPreview();
  await $("#moreBtn").click();
  await $("#layer #restart").click();
  await form.locator("#nm").fill("Sam");
  check(((await form.locator("#title").textContent()) ?? "").endsWith("Sam"), "in Preview the text shows what they typed");
  await form.locator('label:has(input[value="tender"])').first().click();
  await form.locator("[data-cl-next]").first().click();
  check(await form.locator('input[name="email"]').isVisible(), "Tender jumps past the page in between");
  await toEdit();
  // The Form tab: the look over the brand's, and a hidden field.
  check(((await $("#panel .ptabs").textContent()) ?? "").replace(/\s+/g, "").startsWith("SettingsStyleTheme"), "the panel's tabs are Settings, Style, then Theme");
  await $("#p-theme").click();
  check((await $("#pscroll .themes .th").count()) >= 18, "the Theme tab lists the brand and every gallery style");
  if (shots) await p.screenshot({ path: `${shots}/2d-theme.png` });
  await $("#pscroll button[aria-label='blue']").click();
  await p.waitForFunction(() => Object.values((window as unknown as { saved: Record<string, { body?: { css: string } }> }).saved).some((c) => c.body?.css.includes("--brand-primary:#1e6bf0")));
  check(true, "the Form tab's color goes into the form's own CSS");
  // Nothing picked: Settings is the whole form's, with its hidden fields.
  await $("#canvas").click({ position: { x: 6, y: 6 } });
  await $("#p-set").click();
  await $("#pscroll input[aria-label='Add a hidden field']").fill("ref");
  await $("#pscroll input[aria-label='Add a hidden field']").press("Enter");
  check((await form.locator("[data-cl-field='hidden'][data-cl-param='ref']").count()) === 1, "a hidden field from the link is added");
  if (shots) await p.screenshot({ path: `${shots}/2b-builder.png` });
  // Back to the form as it was.
  for (let i = 0; i < 30 && !(await $("#undo").isDisabled()); i++) {
    if (!(await form.locator("[name='details'],[name='yes_no'],[name='pick'],[name='mood_other'],[data-cl-field='date'],[data-cl-field='hidden'],[data-cl-field='ranking'],[data-cl-field='payment']").count()) && !(await form.locator("#title").getAttribute("data-cl-pipe")) && (await form.locator("section[data-cl-step]").count()) === 2 && !(await form.locator("#nm").getAttribute("maxlength")) && ((await form.locator("label:has(input[value='sunny'])").textContent()) ?? "").includes("Sunny") && (await form.locator("#q").textContent()) === "How are you feeling today?") break;
    await $("#undo").click();
  }
  await p.waitForTimeout(1600);
  const backTo = [(await form.locator("section[data-cl-step]").count()) === 2, (await form.locator("#title").textContent()) === "How was today?", !(await builtHtml()).includes("--brand-primary:#1e6bf0"), !(await builtHtml()).includes('name="details"')];
  check(backTo.every(Boolean), `undo takes every builder change back out (${backTo.join(", ")})`);
  await $("#p-style").click();
  const barBox = await $("section.stage > .bar").boundingBox();
  const panelBox = await $("#panel").boundingBox();
  check(!!barBox && !!panelBox && barBox.y + barBox.height <= panelBox.y, "the panel sits below the bar and never covers it");
  check((await $("#publish").count()) + (await $("#checkBtn").count()) + (await $("#shareBtn").count()) + (await $("#backBtn").count()) === 0, "Publish, the check, Share and Back live in the page's header, never in the Studio's bar");
  for (const id of ["d-desk", "d-tab", "d-phone"]) if (!(await $(`#${id}`).getAttribute("data-tip"))) check(false, `${id} has a tooltip`);
  check((await $("#t-edit").count()) + (await $("#t-preview").count()) + (await $("#t-after").count()) + (await $("#addBtn").count()) === 0, "no Preview, Edit and On submission tabs, and no Add button in the bar");
  // The steps sit under the form.
  const canvasBox = await $("#canvas").boundingBox();
  const stepsBox = await $("#stepBar").boundingBox();
  check(!!canvasBox && !!stepsBox && stepsBox.y >= canvasBox.y + canvasBox.height - 2, "the steps sit under the form");
  const controls = await p.evaluate(() => [...document.querySelector("#studio")!.shadowRoot!.querySelectorAll("section.stage > .bar > button, section.stage > .bar > a, section.stage > .bar > .grp > button")].filter((b) => !(b as HTMLElement).hidden).length);
  check(controls <= 11, `the bar holds at most 11 controls besides the steps (${controls})`);
  await $("#moreBtn").click();
  check((await $("#layer .menu").textContent())!.includes("Back to page 1"), "⋯ holds Back to page 1");
  await $("#moreBtn").click();
  await $("#s-layers").click();
  check(!(await $("#navi").isHidden()) && (await $("#adds").isHidden()), "Layers is a tab of Build in the sidebar");
  await $("#s-add").click();
  check((await $("#navi").isHidden()) && !(await $("#adds").isHidden()), "and Add fields is the other");
  await $("#stepBar .sp").nth(1).click();
  await form.locator("#photo").click();
  await $("#p-set").click();
  check((await $("#pscroll").textContent())!.includes("File upload") && (await $("#pscroll").textContent())!.includes("File types"), "a block's settings show its kind, label and the files it takes");
  await $("#stepBar .sp").nth(0).click();
  await form.locator('label:has(input[value="tender"])').first().click();
  check((await $("#pscroll").textContent())!.includes("Field") && (await $("#pscroll").textContent())!.includes("Options"), "Settings shows the field and its options");
  check((await $("#pscroll").textContent())!.includes("Contact field"), "Settings shows the contact field the answer saves to");
  if (shots) await p.screenshot({ path: `${shots}/3-edit.png` });

  // 7. On submission (the form's code is on Share › Embed HTML, scripts/formpage-check.ts)
  check((await $("#t-code").count()) === 0, "the Studio has no Code view: the code is on Share");
  await toAfter();
  check((await $("#stepBar .sp.after").getAttribute("aria-pressed")) === "true", "On submission opens as the last step");
  const after = (await $("#afterInner").textContent())!;
  check(after.includes("Intro call") && after.includes("Product demo"), "On submission lists the workspace's meeting types");
  // The picked pill keeps its words on hover (it used to turn ink on ink), and each scheduler shows its logo.
  const picked = $("#afterInner .pill.on").first();
  await picked.hover();
  const [fg, bg] = await picked.evaluate((e) => [getComputedStyle(e).color, getComputedStyle(e).backgroundColor]);
  check(fg !== bg, `a picked pill keeps its words on hover (${fg} on ${bg})`);
  check((await $("#afterInner .pill .logo").count()) >= 5, "Book with shows each scheduler's logo");
  if (shots) await p.screenshot({ path: `${shots}/4-after.png` });
  // An outside scheduler: its link, checked, and opened in the form's booking spot
  await $("#afterInner .pill").filter({ hasText: "Calendly" }).click();
  await $("#afterInner input[aria-label='Scheduler link']").fill("https://evil.example/x");
  await $("#afterInner input[aria-label='Scheduler link']").press("Enter");
  await $("#afterInner .err").waitFor();
  check(true, "a scheduler link that isn't the scheduler's is caught");
  await $("#afterInner input[aria-label='Scheduler link']").fill("https://calendly.com/finch/coach");
  await $("#afterInner input[aria-label='Scheduler link']").press("Enter");
  await toEdit();
  await toPreview();
  await $("#stepBar .sp").filter({ hasText: "Thank-you" }).click();
  await form.locator("#book iframe").waitFor({ state: "attached" });
  check((await form.locator("#book iframe").getAttribute("src")) === "https://calendly.com/finch/coach", "Calendly opens in the form's booking spot");
  await toAfter();
  await $("#afterInner .pill").filter({ hasText: "Claritia calendar" }).click();
  check((await $("#afterInner").textContent())!.includes("Route by answer"), "back to Claritia's calendar with its routes");
  // Who books it: the picked meeting is Dynamic, so its rules show in one line, with Edit routing.
  const who = (await $("#afterInner").textContent())!;
  check(who.includes("Who books it") && who.includes("Locations is at least 50 → Enterprise, otherwise anyone on the team"), "a Dynamic meeting shows who books it in one line");
  await $("#afterInner .pill").filter({ hasText: "Edit routing" }).click();
  check((await calls()).some((c) => c.mode === "openMeeting" && c.body === "22222222-2222-4222-8222-222222222222"), "Edit routing opens that meeting type");
  check(who.includes("Otherwise, book") && who.includes("Tender"), "a route saved before tests still reads, with Otherwise");
  // Route by answer: a past fill, and a number test on a text question changes the value box.
  await $("#afterInner .pill").filter({ hasText: "Add a route" }).click();
  await $("#afterInner [aria-label='Question']").nth(1).click();
  await $(".menu .mi").filter({ hasText: "Has sent this form before" }).click();
  check((await $("#afterInner .rule").nth(1).textContent())!.includes("Has sent this form before") && (await $("#afterInner .rule").nth(1).textContent())!.includes("Yes"), "a route can test a past fill");
  await $("#afterInner [aria-label='Test']").first().click();
  await $(".menu .mi").filter({ hasText: "is not" }).click();
  check((await $("#afterInner .rule").first().textContent())!.includes("is not"), "a route can use any test that fits its question");
  // Always do
  await $("#afterInner .pill").filter({ hasText: "Email the team" }).click();
  await $("#afterInner input[aria-label='Team emails']").fill("coach@finch.care");
  await $("#afterInner input[aria-label='Team emails']").press("Enter");
  await $("#afterInner .pill").filter({ hasText: "Post to Slack" }).click();
  await $("#afterInner [aria-label='Send to']").click();
  await $(".menu .mi").filter({ hasText: "Webhook" }).click();
  await $("#afterInner .pill").filter({ hasText: "hooks.acme.dev" }).waitFor();
  const cs = await calls();
  check(cs.some((c) => c.mode === "saveDraft") && cs.some((c) => c.mode === "addSend"), "Send to saves the form once, then adds the webhook");
  await $("#afterInner [aria-label='New follow-up']").click();
  await $(".menu .mi").filter({ hasText: "When they don't book" }).click();
  check((await calls()).some((c) => c.mode === "newFollowUp" && (c.body as { when: string }).when === "not_booked"), "New follow-up starts a workflow on this form");
  if (shots) await p.screenshot({ path: `${shots}/4b-after.png` });
  const kept = Object.values(await p.evaluate(() => (window as unknown as { saved: Record<string, { body: { after: { always?: { to?: string[]; slack?: boolean } } } }> }).saved));
  check(kept.some((c) => c.body.after.always?.to?.[0] === "coach@finch.care" && c.body.after.always.slack === true), "Notification is kept on the chat");

  // 7b. The form check: a sound form is ready; a broken one can't be published, and Tia gets the fix
  const problems = () => p.evaluate(() => (window as unknown as { studioState: { issues: { level: string }[] } | null }).studioState?.issues.filter((i) => i.level === "error").length ?? -1);
  await p.waitForFunction(() => !!(window as unknown as { studioState: { ready: boolean } | null }).studioState?.ready);
  await p.waitForTimeout(900);
  // Turning on Email the team before typing the emails is a problem for a moment; the check runs again on the emails.
  await p.waitForFunction(() => (window as unknown as { studioState: { issues: { level: string }[] } }).studioState.issues.every((i) => i.level !== "error"), null, { timeout: 5000 }).catch(() => undefined);
  check((await problems()) === 0, "the form check finds nothing to fix on a sound form");
  const savedHtml = () => p.evaluate(() => Object.values((window as unknown as { saved: Record<string, { body: { html?: string } }> }).saved).map((c) => c.body.html ?? "").join("\n"));
  check((await savedHtml()).includes("data-cl-id="), "every question carries its field id");
  // The send button deleted in Edit, from the floating bar.
  await toEdit();
  await $("#stepBar .sp").last().click();
  await form.locator("[type=submit]").first().click();
  await $("#fbar button[aria-label='Delete']").click();
  await toPreview();
  await p.waitForFunction(() => (window as unknown as { studioState: { issues: { level: string }[] } }).studioState.issues.some((i) => i.level === "error"));
  check((await p.locator("#hdrAction").getAttribute("data-problems")) !== "0", "a form with no send button shows a problem to fix, as a count on Publish");
  await p.locator("#hdrAction").click();
  await p.locator("#hdrCheck:not([hidden])").waitFor();
  check((await p.locator("#hdrMsg").textContent())!.includes("first") && (await p.locator("#hdrCheck").textContent())!.includes("no send button"), "Publish is stopped and the problem is listed");
  check(!(await calls()).some((c) => c.mode === "publish"), "nothing was published");
  const tiaBefore = (await calls()).filter((c) => c.mode === "tia").length;
  await p.locator("#hdrCheck .issue button").filter({ hasText: "Fix" }).first().click();
  await idle();
  const fixAsk = ((await calls()).filter((c) => c.mode === "tia")[tiaBefore]!.body as { content: string }[]).at(-1)!.content;
  check(fixAsk.startsWith("Fix this:") && fixAsk.includes("send button"), "Fix sends the problem to Tia");
  await $("#undo").click();
  await $("#undo").click();
  await p.waitForFunction(() => (window as unknown as { studioState: { issues: { level: string }[] } }).studioState.issues.every((i) => i.level !== "error"));
  check(true, "undo brings the send button back and the problem clears");

  // 7c. Languages: Tia writes the form in French and Arabic; each previews, Arabic right to left
  await toPreview();
  check((await $("#langBtn").textContent())!.trim() === "EN", "the form's own language shows in the bar");
  await $("#langBtn").click();
  await $("#layer .menu .mi").filter({ hasText: "French" }).click();
  await p.waitForFunction(() => document.querySelector("#studio")!.shadowRoot!.getElementById("langBtn")!.textContent!.trim() === "FR");
  check((await form.locator("#title").textContent()) === "Comment était ta journée ?", "Tia writes the form in French and it previews");
  const tr = (await calls()).find((c) => c.mode === "translate")!.body as { texts: string[] };
  check(tr.texts.includes("How was today?") && !tr.texts.some((t) => t.includes("<")), "only the words go to Tia for a translation");
  await $("#langBtn").click();
  await $("#layer .menu .mi").filter({ hasText: "Arabic" }).click();
  await p.waitForFunction(() => document.querySelector("#studio")!.shadowRoot!.getElementById("langBtn")!.textContent!.trim() === "AR");
  check((await form.locator(".cl-root").getAttribute("dir")) === "rtl", "Arabic shows right to left");
  await p.waitForTimeout(900);
  check((await problems()) === 0, "both languages pass the form check at all three widths");
  await $("#langBtn").click();
  await $("#layer .menu .mi").filter({ hasText: "the form's own" }).click();
  check((await form.locator("#title").textContent()) === "How was today?", "back to the form's own language");

  // 8. Publish, then the live form in the form script
  await toPreview();
  await p.locator("#hdrAction").click();
  await p.waitForFunction(() => document.getElementById("hdrAction")!.textContent === "Share");
  const pub = (await calls()).find((c) => c.mode === "publish")!.body as { html: string; css: string; brand: string; after: PageAfter; name: string };
  check(pub.name === "Daily check-in" && pub.html.includes("data-cl-step") && pub.brand.includes("--finch-mint"), "Publish sends the form's name, page and brand CSS");
  check(Object.keys((pub as unknown as { langs: Record<string, string> }).langs).sort().join() === "ar,fr" && (pub as unknown as { lang: string }).lang === "en", "Publish sends the form's languages");
  await $("#moreBtn").click();
  check(await $("#layer .menu #openBtn").isVisible(), "a published form links to its page, from the bar's ⋯");
  await $("#moreBtn").click();
  await p.locator("#hdrAction").click();
  check((await calls()).some((c) => c.mode === "openShare" && c.body === "33333333-3333-4333-8333-333333333333"), "once live, the one button is Share, for the published form");
  await p.waitForFunction(() => Object.values((window as unknown as { saved: Record<string, { formId: string; state: string }> }).saved).some((c) => c.formId && c.state === "live"));
  check(true, "the chat keeps its published form");
  const made = checkForm(pageForm(pub as Parameters<typeof pageForm>[0]).form);
  check("form" in made, `the published page passes the form checker${"errors" in made ? `: ${made.errors.join("; ")}` : ""}`);
  live = "form" in made ? made.form : null;
  // A French visitor gets French, with a switch; English keeps what was typed.
  const fctx = await browser.newContext({ locale: "fr-FR", viewport: { width: 1100, height: 900 } });
  const fp = await fctx.newPage();
  fp.on("pageerror", (e) => errors.push(`live fr: ${e.message}`));
  await fp.goto(`http://localhost:${port}/live`);
  const ff = fp.locator("claritia-form");
  await ff.locator("#title").waitFor();
  check((await ff.locator("#title").textContent()) === "Comment était ta journée ?" && (await ff.locator(".cl-langs button").count()) === 3, "a French visitor gets the French form, with a language switch");
  await ff.locator("#nm").fill("Camille");
  await ff.locator(".cl-langs button").filter({ hasText: "English" }).click();
  await ff.locator("#title").filter({ hasText: "How was today?" }).waitFor();
  check((await ff.locator("#nm").inputValue()) === "Camille", "switching language keeps what was typed");
  await ff.locator(".cl-langs button").filter({ hasText: "العربية" }).click();
  check((await ff.locator(".cl-root").getAttribute("dir")) === "rtl", "the live form flips right to left in Arabic");
  await ff.locator(".cl-langs button").filter({ hasText: "English" }).click();
  await ff.locator("#nm").fill("");
  await ff.locator("[data-cl-next]").click();
  const desc = (await ff.locator("#nm").getAttribute("aria-describedby")) ?? "";
  const errId = (await ff.locator('[data-cl-error-for="name"]').getAttribute("id")) ?? "-";
  check(desc.includes(errId) && (await ff.locator('[data-cl-error-for="name"]').getAttribute("aria-live")) === "polite", "an error is tied to its question and read out");
  await fctx.close();

  const lp = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  lp.on("pageerror", (e) => errors.push(`live: ${e.message}`));
  await lp.goto(`http://localhost:${port}/live`);
  const lf = lp.locator("claritia-form");
  await lf.locator("#title").waitFor();
  check((await lf.locator("img[data-cl-logo]").getAttribute("src")) === "https://cdn.example/logo.svg", "the live form shows the brand's logo");
  await lf.locator("#nm").fill("Sam");
  await lf.locator('label:has(input[value="tender"])').first().click();
  await lf.locator("#why").fill("A long week");
  await lf.locator("[data-cl-next]").click();
  await lf.locator('input[name="email"]').fill("sam@example.com");
  check((await lf.locator('#photo input[type="file"]').count()) === 1, "the live form draws the file block");
  await lf.locator('#photo input[type="file"]').setInputFiles({ name: "day.png", mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a", "hex") });
  await lf.locator("#photo").getByText("day.png").waitFor();
  await lf.locator("#clr-consent").check();
  await lf.locator("[type=submit]").click();
  await lf.locator("[data-cl-book] .cl-times button").first().waitFor();
  const sent = sends[0]?.answers ?? {};
  const ids = live?.page?.ids ?? {};
  check(sent[ids.name!] === "Sam" && sent[ids.email!] === "sam@example.com" && sent[ids.mood!] === "tender" && sent[ids.why!] === "A long week", "the live form sends each answer by its field id");
  check(sent[ids.photo!] === "up_11111111-1111-4111-8111-111111111111:day.png", "the uploaded file goes with the answers");
  check((await lf.locator("[data-cl-book] .cl-times button").count()) > 0, "the booking calendar opens in the page's booking spot");
  check((await lf.locator("[data-cl-book] .cl-times .btn-secondary").count()) > 0 && (await lf.locator("[data-cl-book] .cl-days .btn").count()) === 1, "the live calendar wears the brand's classes");
  check((await lf.locator("[data-cl-book] .ok").count()) === 0 && (await lf.locator("[data-cl-book] h2").count()) === 0, "no second thank-you over the calendar");
  check((await lf.locator("[data-cl-book] .cl-times button").count()) <= 9 && /^Times in .+\(GMT/.test((await lf.locator("[data-cl-book] .cl-zone span").textContent()) ?? ""), "a short grid of times and the zone in words");
  const moreTimes = lf.locator("[data-cl-book] .cl-link").filter({ hasText: "more times" });
  if (await moreTimes.count()) {
    await moreTimes.click();
    await lf.locator("[data-cl-book] .cl-times button").nth(9).waitFor({ state: "attached", timeout: 3000 }).then(() => true, () => false).then((ok) => check(ok, "More times shows the rest of the day"));
  }
  await lf.locator("[data-cl-book] .cl-zone .cl-link").click();
  await lf.locator("[data-cl-book] #clr-_tz").waitFor({ state: "attached", timeout: 3000 }).then(() => true, () => false).then((ok) => check(ok, "Change opens the time zone list"));
  const box = await lf.locator("[data-cl-book]").boundingBox();
  const days = await lf.locator("[data-cl-book] .cl-days").evaluate((e) => e.scrollWidth <= e.clientWidth + 1 || getComputedStyle(e).overflowX === "auto");
  check(!!box && days, "the days scroll in their row instead of being cut off");
  check((await lf.locator("#clr-consent").count()) === 1 && (await lf.locator('input[name="company_url"]').count()) === 1, "the live form has the consent line and the spam trap");
  if (shots) await lp.screenshot({ path: `${shots}/5-live.png` });

  // 9. One chat per form: a new chat starts empty, and the first keeps its form
  await toEdit();
  if (await $("#chat").evaluate((e) => e.classList.contains("folded"))) await $("#chatFold").click();
  await $("#chatPick").click();
  check((await $("#layer .menu").textContent())!.includes("Daily check-in") && (await $("#layer .menu").textContent())!.includes("Live"), "the chat list shows each form and its state, in the header's words");
  await $("#layer .menu button").filter({ hasText: "New chat" }).click();
  check(!(await form.locator("#title").count()) && (await $(".starts button").count()) > 0, "a new chat starts empty, with ideas");
  await $("#blankBtn").click();
  check((await form.locator("input[type='email']").count()) === 1 && (await form.locator("[type=submit]").count()) === 1 && (await $("#adds").isVisible()), "Start blank makes an email question and a send button, and opens Edit with the Add list");
  await $("#chatPick").click();
  await $("#layer .menu .mi").filter({ hasText: "Daily check-in" }).click();
  await form.locator("#title").waitFor();
  check((await form.locator("#title").textContent()) === "How was today?", "switching back keeps the first chat's form");

  // 9b. A built form switches brand only when asked, keeps its look until the new one is ready, then Tia moves it
  await $("#m-ai").click();
  await $("#brandBtn").click();
  await $("#layer .menu .mi").filter({ hasText: "Add a brand" }).click();
  await $("#dlgSite").fill("acme.dev");
  await $("#dlgBody button[type=submit]").click();
  await $("#dlgBody button").filter({ hasText: "Yes, use this brand" }).click();
  await $("#brandDlg h2").filter({ hasText: "Switch this form to Acme?" }).waitFor();
  check(true, "adding a brand on a built form asks before switching it");
  const tiaN = (await calls()).filter((c) => c.mode === "tia").length;
  await $("#brandDlg button").filter({ hasText: "Switch" }).click();
  await p.waitForFunction((n) => (window as unknown as { calls: { mode: string }[] }).calls.filter((c) => c.mode === "tia").length > n, tiaN);
  await idle();
  const sw = ((await calls()).filter((c) => c.mode === "tia")[tiaN]!.body as { content: string }[]).at(-1)!.content;
  check(sw.startsWith("Switch this form to Acme") && sw.includes("[The brand just changed from Finch to Acme."), "Tia moves the form to the new brand in one change");
  check((await $("#brandBtn").textContent())!.trim() === "Acme", "the form is on the new brand");

  // 9c. A template on a new chat's empty canvas makes the form in the chat's brand, opens it, and the empty chat goes
  await $("#m-ai").click();
  await $("#chatPick").click();
  await $("#layer .menu button").filter({ hasText: "New chat" }).click();
  await $("#tplGrid .tpl").first().waitFor();
  const tplId = await $("#tplGrid .tpl").first().getAttribute("data-tpl");
  const emptyChat = await p.evaluate(() => (window as unknown as { studioState: { chatId: string } | null }).studioState?.chatId ?? "");
  await $("#tplGrid .tpl").first().click();
  await p.waitForFunction(() => (window as unknown as { calls: { mode: string }[] }).calls.some((c) => c.mode === "openForm"));
  const used = (await calls()).find((c) => c.mode === "useTemplate")!.body as { id: string; look: { kitId?: string } };
  check(used.id === tplId && used.look.kitId === "55555555-5555-4555-8555-555555555555", "a template is made in the chat's brand");
  check((await calls()).some((c) => c.mode === "openForm" && c.body === "77777777-7777-4777-8777-777777777777"), "the new form opens");
  check(!!emptyChat && (await calls()).some((c) => c.mode === "deleteChat" && c.body === emptyChat), "the empty chat it started from is removed");
  await $("#chatPick").click();
  await $("#layer .menu .mi").filter({ hasText: "Daily check-in" }).click();
  await form.locator("#title").waitFor();

  // 10. Delete a brand from the menu
  await $("#brandBtn").click();
  await $("#layer button[aria-label='Delete Finch']").click();
  await $("#layer .mdel button").filter({ hasText: "Delete" }).click();
  check((await calls()).some((c) => c.mode === "delete"), "a brand can be deleted from the menu");
  void sh;
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
