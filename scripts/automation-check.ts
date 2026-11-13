// The automation editor, round 3 E4, in a real browser (docs/email-unify-plan.md; scripts/automation/entry.tsx): the
// flow on a canvas, branches side by side, summaries and email pictures on the cards, the add menu with search, moving
// a card by dragging it onto a +, ⌘D and Delete, the trigger as cards, Insert data, and the Test tab.
//   node scripts/automation-check.ts   (SHOTS=<dir> saves screenshots)

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
const bundle = await build({ entryPoints: [`${root}scripts/automation/entry.tsx`], bundle: true, write: false, format: "esm", jsx: "automatic", logLevel: "error", define: { "process.env.NODE_ENV": '"production"' }, alias: { "server-only": `${root}scripts/email-canvas/empty.ts` }, tsconfig: `${root}tsconfig.json` });
const js = bundle.outputFiles[0]!.contents;
const globals = `${root}src/app/globals.css`;
const css = (await postcss([tailwind()]).process(readFileSync(globals, "utf8"), { from: globals })).css;
const page = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css"><style>html,body,#root{height:100%;margin:0}</style></head><body class="bg-paper"><div id="root"></div><script type="module" src="/app.js"></script></body></html>`;
const server = createServer((req, res) => {
  if (req.url?.startsWith("/app.css")) return void res.writeHead(200, { "content-type": "text/css" }).end(css);
  if (req.url?.startsWith("/app.js")) return void res.writeHead(200, { "content-type": "text/javascript" }).end(js);
  res.writeHead(200, { "content-type": "text/html" }).end(page);
});
await new Promise<void>((r) => server.listen(0, r));
const base = `http://localhost:${(server.address() as { port: number }).port}`;
const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
const shots = process.env.SHOTS;

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => check(false, `no page errors (${e.message})`));
  await p.goto(base);
  await p.locator('[data-node="trigger"]').waitFor();
  await p.waitForTimeout(600);
  const order = () => p.locator("[data-node]").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.node));

  // The canvas.
  check((await p.getByRole("application", { name: "Workflow" }).count()) === 1, "the flow sits on a canvas");
  check((await p.getByRole("button", { name: "Zoom options" }).count()) === 1, "with the zoom control");
  const before = (await p.locator('[data-node="trigger"]').boundingBox())!;
  await p.getByRole("application", { name: "Workflow" }).hover();
  await p.mouse.wheel(0, 200);
  await p.waitForTimeout(250);
  const after = (await p.locator('[data-node="trigger"]').boundingBox())!;
  check(after.y < before.y - 50, `scrolling pans the canvas (${Math.round(before.y)} → ${Math.round(after.y)})`);
  await p.keyboard.press("Shift+Digit1");
  await p.waitForTimeout(500);
  const fit = (await p.locator("[data-flow]").boundingBox())!;
  const view = (await p.getByRole("application", { name: "Workflow" }).boundingBox())!;
  check(fit.y >= view.y - 1 && fit.y + fit.height <= view.y + view.height + 1, "Shift+1 fits the whole flow");
  // Branches side by side.
  const paths = await p.locator("[data-path]").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y })));
  check(paths.length === 2 && Math.abs(paths[0]!.y - paths[1]!.y) < 2 && paths[1]!.x > paths[0]!.x + 100, "a Branch's paths sit side by side");
  // Cards.
  check((await p.locator('[data-node="w1"]').innerText()).includes("2 days, then Tue or Thu at 9:00 AM"), "the Delay card says every setting in one line");
  check((await p.locator('[data-node="m1"] iframe').count()) === 1, "an email card shows a small picture of the email");
  await p.keyboard.press("Shift+Digit0");
  await p.waitForTimeout(400);

  // The add menu: search, Enter adds the first.
  await p.locator('[data-node="m1"]').scrollIntoViewIfNeeded();
  await p.getByRole("button", { name: "Add a step" }).first().click();
  const menu = p.getByRole("menu", { name: "Add a step" });
  check((await menu.getByRole("menuitem").count()) >= 10 && (await menu.innerText()).includes("Post to Slack"), "the add menu lists every step with one line each");
  await menu.getByLabel("Search steps").fill("slack");
  check((await menu.getByRole("menuitem").count()) === 1, "typing narrows the menu");
  await p.keyboard.press("Enter");
  await p.waitForTimeout(300);
  const added = await order();
  check(added[1] !== "m1" && added.filter((x) => x !== "trigger").length === 7, `Enter adds the step there (${added.join(",")})`);
  check((await p.getByRole("heading", { name: "Slack message" }).count()) + (await p.locator("aside").getByText("Slack message", { exact: true }).count()) >= 1 && (await p.locator("aside").innerText()).includes("Post to Slack"), "the panel shows the new step with its one line");

  // Insert data in the Slack message.
  await p.locator("aside").getByRole("button", { name: "Insert data" }).click();
  await p.getByRole("menuitem", { name: /First name/ }).click();
  check((await p.locator("aside").getByLabel("Message").inputValue()).includes("{{first_name|}}"), "Insert data puts a merge field in the message");

  // ⌘D and Delete on the canvas.
  const n0 = (await order()).length;
  await p.locator('[data-node="w1"]').click();
  await p.keyboard.press("Control+d");
  await p.waitForTimeout(200);
  check((await order()).length === n0 + 1, "⌘D copies the picked step");
  await p.keyboard.press("Delete");
  await p.waitForTimeout(200);
  check((await order()).length === n0, "Delete removes it");
  await p.locator('[data-node="b1"]').click();
  await p.keyboard.press("Delete");
  await p.waitForTimeout(200);
  check((await p.getByRole("dialog").count()) === 1, "deleting a step with steps inside asks first");
  await p.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();

  // Drag the Delay above the first email.
  const ids0 = await order();
  // A real drag: the + under the card lights up, and the drop moves it.
  const dt = await p.evaluateHandle(() => new DataTransfer());
  await p.locator('[data-node="m1"]').dispatchEvent("dragstart", { dataTransfer: dt });
  await p.locator("[data-joint]").nth(3).dispatchEvent("dragover", { dataTransfer: dt });
  check((await p.locator("[data-drop-line]").count()) === 1, "a + under a dragged card shows where it lands");
  await p.locator("[data-joint]").nth(3).dispatchEvent("dragleave", { dataTransfer: dt });
  await p.locator('[data-node="m1"]').dispatchEvent("dragend", { dataTransfer: dt });
  await p.locator('[data-node="w1"]').dragTo(p.locator("[data-joint]").first());
  await p.waitForTimeout(300);
  const ids1 = await order();
  check(ids1.indexOf("w1") < ids1.indexOf("m1") && ids0.indexOf("w1") > ids0.indexOf("m1"), `dragging a card onto a + moves it (${ids1.slice(0, 4).join(",")})`);
  await p.keyboard.press("Control+z");
  await p.waitForTimeout(200);
  const ids2 = await order();
  check(ids2.indexOf("w1") > ids2.indexOf("m1"), "⌘Z puts it back");

  // The trigger as cards.
  await p.getByRole("application", { name: "Workflow" }).focus();
  await p.keyboard.press("Shift+Digit1");
  await p.waitForTimeout(400);
  await p.locator('[data-node="trigger"]').click();
  if (shots) await p.screenshot({ path: `${shots}/automation-trigger.png` });
  const radios = p.locator("aside").getByRole("radiogroup", { name: "Trigger" }).getByRole("radio");
  check((await radios.count()) === 6 && (await p.locator("aside").getByRole("radio", { name: "Form submitted" }).getAttribute("aria-checked")) === "true", "the trigger is a set of cards with the current one picked");

  // One email (docs/workflows.md): the email in the panel, typed in place, no Approve, Open full editor.
  await p.locator('[data-node="m1"]').click();
  await p.waitForTimeout(300);
  const side = p.locator("aside");
  check((await side.getByRole("button", { name: "Approve" }).count()) === 0 && (await side.getByText("Approve the email").count()) === 0 && (await side.getByText("Add the Footer block").count()) === 0, "an email step has no Approve and no footer to add");
  check((await side.locator("[data-email-in-panel] iframe").count()) === 1 && (await side.getByRole("button", { name: "From" }).count()) === 1, "the panel shows From, the subject and the email itself");
  const mailFrame = side.frameLocator("[data-email-in-panel] iframe");
  check(/Unsubscribe/.test(await mailFrame.locator("body").innerText()), "the footer is there, added for you");
  await mailFrame.getByText("Someone will reply within a day.").click();
  await p.waitForTimeout(150);
  check((await mailFrame.locator("[contenteditable='true']").count()) === 1 && (await side.getByRole("toolbar", { name: "Format" }).count()) === 1, "a click on the words types in place, with the format bar");
  await p.keyboard.press("End");
  await p.keyboard.type(" Usually sooner.");
  await p.keyboard.press("Escape");
  await p.waitForTimeout(400);
  check((await side.locator("[data-email-in-panel] iframe").evaluate((f) => (f as HTMLIFrameElement).contentDocument?.body.innerText ?? "")).includes("Usually sooner."), "the typed words stay in the email");
  await p.waitForTimeout(1200);
  const saved = await p.evaluate(() => (window as unknown as { calls: { fn: string; body: { p_doc?: unknown } }[] }).calls.filter((c) => c.fn === "email_draft_save").map((c) => JSON.stringify(c.body.p_doc ?? "")));
  check(saved.some((d) => d.includes("Usually sooner.")), "and reach the email on the Emails page");
  await side.getByRole("button", { name: "Open full editor" }).click();
  await p.waitForTimeout(400);
  const nav = await p.evaluate(() => (window as unknown as { calls: { fn: string; body: { r: string; i: string } }[] }).calls.filter((c) => c.fn === "navigate").map((c) => c.body.i));
  check(nav.some((i) => i?.startsWith("campaigns/group/wf:")), `Open full editor opens the same email on the Emails canvas (${nav.join(", ")})`);
  if (shots) await p.screenshot({ path: `${shots}/automation-email.png` });

  // The Test tab.
  await p.locator('[data-node="w1"]').click();
  await p.locator("aside").getByRole("radio", { name: "Test" }).click();
  await p.locator("aside").getByLabel("Test with").fill("lee");
  await p.locator("aside").getByRole("button", { name: /Lee Park/ }).click();
  await p.locator("[data-test-result]").waitFor();
  check(/Lee Park continues .*Nov 17.* 9:00 AM/.test(await p.locator("[data-test-result]").innerText()), `the Test tab says when the Delay ends for them (${(await p.locator("[data-test-result]").innerText()).trim()})`);
  await p.locator('[data-node="m1"]').click();
  await p.waitForTimeout(150);
  check((await p.locator("[data-test-result]").innerText()).includes("To lee@acme.com") && (await p.locator("[data-test-result] iframe").count()) === 1, "for an email it shows the email as they'd get it");
  await p.locator('[data-node="b1"]').click();
  await p.waitForTimeout(150);
  check((await p.locator("[data-test-result]").innerText()).includes("goes down the No path"), "for a Branch it says the path they take");
  await p.locator('[data-node="x1"]').click();
  await p.waitForTimeout(150);
  check((await p.locator("[data-test-result]").innerText()).includes("doesn't reach this step"), "a step off their path says they don't reach it");
  if (shots) await p.screenshot({ path: `${shots}/automation.png` });
  await p.close();

  // A meeting workflow (docs/workflows-plan.md, Part A): Booking confirmed, with the meeting's own emails.
  const mf = await ctx.newPage();
  mf.on("pageerror", (e) => check(false, `no page errors (${e.message})`));
  await mf.goto(`${base}/?flow=confirmed`);
  await mf.locator("[data-node]").nth(1).waitFor();
  await mf.waitForTimeout(500);
  const cardsText = await mf.locator("[data-node]").allInnerTexts();
  check(cardsText.some((t) => t.includes("Booking confirmed, to the guest")) && cardsText.some((t) => t.includes("New booking for the host, to the host")), `the cards name each meeting email and who gets it (${cardsText.map((t) => t.replace(/\s+/g, " ")).join(" / ")})`);
  check((await mf.getByRole("button", { name: "Delete workflow" }).count()) === 0 && (await mf.getByRole("button", { name: "Pause" }).count()) === 0, "the workflow with the invite has no Delete and no Pause");
  const guestCard = mf.locator("[data-node]").nth(1);
  await guestCard.click();
  await mf.waitForTimeout(400);
  const aside = mf.locator("aside");
  check((await aside.innerText()).includes("with the calendar invite") && (await aside.getByRole("button", { name: "Delete" }).count()) === 0, "the guest's email says it carries the invite and can't be deleted");
  const mframe = aside.frameLocator("[data-email-in-panel] iframe");
  check((await mframe.locator("body").innerText()).includes("Alex Kim"), "the email shows a sample meeting's values");
  await mframe.getByText("Your meeting is booked").click();
  await mf.keyboard.press("End");
  await mf.keyboard.type("!");
  await mf.keyboard.press("Escape");
  await mf.waitForTimeout(1300);
  const sysSaves = await mf.evaluate(() => (window as unknown as { calls: { fn: string; body: { p_id?: string; p_doc?: unknown } }[] }).calls.filter((c) => c.fn === "email_draft_save" && c.body.p_id === "sys-confirm").map((c) => JSON.stringify(c.body.p_doc)));
  check(sysSaves.some((d) => d.includes("Your meeting is booked!")), "typing in it saves the meeting's own email");
  await guestCard.click();
  await mf.keyboard.press("Delete");
  await mf.waitForTimeout(200);
  check((await mf.locator("[data-node]").count()) === 3 && (await mf.getByText("sends the calendar invite").count()) >= 1, "Delete on it says why it stays");
  if (shots) await mf.screenshot({ path: `${shots}/automation-meeting.png` });
  await mf.close();

  // Workflows' first screen (docs/workflows-plan.md, Part B): folders, then a folder's workflows, then one workflow.
  const hm = await ctx.newPage();
  hm.on("pageerror", (e) => check(false, `no page errors (${e.message})`));
  await hm.goto(`${base}/?view=home`);
  await hm.getByRole("button", { name: /^Meetings/ }).first().waitFor();
  await hm.waitForTimeout(400);
  const folderCards = await hm.locator("[data-folder]").allInnerTexts();
  check(folderCards.length === 2 && folderCards[0]!.includes("Meetings") && folderCards[0]!.includes("3") && folderCards[1]!.includes("Forms"), `Workflows opens on its folders (${folderCards.map((t) => t.replace(/\s+/g, " ")).join(" / ")})`);
  check((await hm.getByRole("button", { name: "New folder" }).count()) >= 1 && (await hm.getByRole("button", { name: "New workflow" }).count()) >= 1, "with New folder and New workflow");
  check((await hm.locator("[data-folder] iframe").count()) >= 1, "a folder card shows its emails");
  if (shots) await hm.screenshot({ path: `${shots}/workflows-folders.png` });
  await hm.locator("[data-folder]").first().click();
  await hm.locator("[data-workflow]").first().waitFor();
  const wfCards = await hm.locator("[data-workflow]").allInnerTexts();
  check(wfCards.length === 3 && wfCards[0]!.includes("Booking confirmed") && wfCards[0]!.includes("Always on"), `a folder opens on its workflows (${wfCards.map((t) => t.replace(/\s+/g, " ")).join(" / ")})`);
  check((await hm.getByRole("button", { name: "Workflows" }).count()) >= 1, "with Workflows to go back");
  if (shots) await hm.screenshot({ path: `${shots}/workflows-folder.png` });
  await hm.locator("[data-workflow]").first().click();
  await hm.locator("[data-node]").nth(1).waitFor();
  check((await hm.getByRole("button", { name: "Meetings" }).count()) >= 1, "a workflow opens full width, with its folder to go back");
  if (shots) await hm.screenshot({ path: `${shots}/workflows-open.png` });
  await hm.close();
} finally {
  await browser.close();
  server.close();
}
if (failures.length) {
  console.log(`\n${failures.length} failed`);
  process.exit(1);
}
console.log("\nall passed");
