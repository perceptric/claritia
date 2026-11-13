// Email round 3, E1 and E2, in a real browser (docs/email-unify-plan.md; scripts/emails/entry.tsx): the import panel's
// padding and checkbox, Audiences' columns, sorting, editing in place, the Columns menu and Add person; the
// automation editor's deleted-form trigger, problems in words on the cards, the Delay's number fields and time picker.
//   node scripts/emails-check.ts   (SHOTS=<dir> saves screenshots)

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
const bundle = await build({ entryPoints: [`${root}scripts/emails/entry.tsx`], bundle: true, write: false, format: "esm", jsx: "automatic", logLevel: "error", define: { "process.env.NODE_ENV": '"production"' }, alias: { "server-only": `${root}scripts/email-canvas/empty.ts` }, tsconfig: `${root}tsconfig.json` });
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
type Call = { fn: string; body: Record<string, unknown> };

try {
  // Audiences ------------------------------------------------------------------------------------------------------
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 } });
  let p = await ctx.newPage();
  p.on("pageerror", (e) => check(false, `no page errors (${e.message})`));
  const calls = () => p.evaluate(() => (window as unknown as { calls: Call[] }).calls);
  await p.goto(`${base}/?view=audiences`);
  await p.locator("tr[data-person]").first().waitFor();
  const heads = await p.locator("thead th").allInnerTexts();
  check(["First name", "Last name", "Email", "Phone", "Email status", "Came from", "Lists", "Added", "Last email"].every((h) => heads.some((x) => x.trim().startsWith(h))), `the table has its columns (${heads.map((h) => h.trim()).filter(Boolean).join(", ")})`);
  check((await p.locator('tr[data-person="lee@acme.com"]').innerText()).includes("+1 415 555 0142"), "phone shows in its own column");
  check((await p.locator('input[type="checkbox"]').count()) === 0, "no browser checkboxes on the page");
  // Sorting.
  await p.locator("thead button", { hasText: "First name" }).click();
  await p.waitForTimeout(200);
  const firsts = await p.locator("tbody tr [data-edit-cell='first_name']").allInnerTexts();
  check(firsts.join(",") === "Ana,Lee,Add", `First name sorts A to Z with empty last (${firsts.join(",")})`);
  const sorted = (await calls()).filter((c) => c.fn === "audience_people").at(-1)!;
  check(sorted.body.p_sort === "first" && sorted.body.p_desc === false, "the sort goes to the database");
  // Edit in place.
  await p.locator('tr[data-person="ben@ortiz.dev"] [data-edit-cell="first_name"]').click();
  await p.keyboard.type("Ben");
  await p.keyboard.press("Enter");
  await p.waitForTimeout(250);
  const upd = (await calls()).filter((c) => c.fn === "audience_person_update").at(-1);
  check(!!upd && (upd.body.p_patch as Record<string, string>).first_name === "Ben", "Enter saves the first name");
  check((await p.locator('tr[data-person="ben@ortiz.dev"] [data-edit-cell="first_name"]').innerText()) === "Ben", "the new name shows in the row");
  await p.locator('tr[data-person="lee@acme.com"] [data-edit-cell="phone"]').click();
  await p.keyboard.type("999");
  await p.keyboard.press("Escape");
  check((await p.locator('tr[data-person="lee@acme.com"] [data-edit-cell="phone"]').innerText()) === "+1 415 555 0142", "Escape leaves without saving");
  // Columns menu.
  await p.getByRole("button", { name: "Columns" }).click();
  await p.getByRole("checkbox", { name: "Phone" }).click();
  await p.getByRole("checkbox", { name: "Title" }).click();
  await p.keyboard.press("Escape");
  const heads2 = (await p.locator("thead th").allInnerTexts()).map((h) => h.trim());
  check(!heads2.includes("Phone") && heads2.some((h) => h.startsWith("Title")), "Columns hides Phone and shows Title");
  await p.reload();
  await p.locator("tr[data-person]").first().waitFor();
  check((await p.locator("thead th").allInnerTexts()).some((h) => h.trim().startsWith("Title")), "the columns picked are kept after a reload");
  // Search by phone.
  await p.getByLabel("Search people").fill("(415) 555");
  await p.waitForTimeout(300);
  check((await p.locator("tr[data-person]").count()) === 1, "search finds a person by phone");
  await p.getByLabel("Search people").fill("");
  // Add person.
  await p.getByRole("button", { name: "Add person" }).click();
  const sheet = p.getByRole("dialog");
  await sheet.getByLabel("First name").fill("Mai");
  await sheet.getByLabel("Last name").fill("Tran");
  await sheet.getByLabel("Email").fill("mai@lotus.vn");
  await sheet.getByLabel("Country").fill("vn");
  await sheet.getByRole("checkbox", { name: "They agreed to get email from us" }).click();
  if (shots) await p.screenshot({ path: `${shots}/emails-add-person.png` });
  await sheet.getByRole("button", { name: "Add person" }).click();
  await p.waitForTimeout(300);
  const imp = (await calls()).filter((c) => c.fn === "import").at(-1);
  const row = (imp?.body.rows as Record<string, string>[] | undefined)?.[0];
  check(!!row && row.email === "mai@lotus.vn" && row.country === "VN" && imp!.body.consent === true && imp!.body.listId === null, "Add person sends one person with consent and no list");
  check((await p.getByRole("status").innerText()).includes("Person added"), "a line says the person was added");
  check((await p.locator('tr[data-person="mai@lotus.vn"]').count()) === 1, "the new person shows in the table");
  // Edit sheet from the email.
  await p.locator('tr[data-person="ana@northwind.io"] td button', { hasText: "ana@northwind.io" }).click();
  await p.getByRole("dialog").getByLabel("Country").fill("1x");
  await p.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  check((await p.getByRole("dialog").getByRole("alert").innerText()).includes("two-letter"), "a country that isn't a code says so");
  await p.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  if (shots) await p.screenshot({ path: `${shots}/emails-audiences.png` });

  // Import panel: padding and its checkbox.
  await p.getByLabel("Show", { exact: true }).click();
  await p.getByRole("option", { name: /Test/ }).click();
  await p.getByRole("button", { name: "Import CSV" }).click();
  const imSheet = p.getByRole("dialog");
  // Measured once the panel has finished sliding in.
  await p.waitForTimeout(600);
  const panel = await imSheet.boundingBox();
  const drop = await imSheet.locator("button", { hasText: "Drop a CSV file here" }).boundingBox();
  check(!!panel && !!drop && drop.x - panel.x >= 16 && panel.x + panel.width - (drop.x + drop.width) >= 16, `the drop area sits inside the panel's padding (${drop && panel ? Math.round(drop.x - panel.x) : "?"} px)`);
  const consent = imSheet.getByRole("checkbox", { name: "They agreed to get email from us" });
  const cb = await consent.boundingBox();
  check(!!cb && !!panel && cb.x - panel.x >= 16, `the consent checkbox sits inside the padding (${cb && panel ? Math.round(cb.x - panel.x) : JSON.stringify(cb)} px)`);
  await consent.click();
  check((await consent.getAttribute("aria-checked")) === "true", "the consent checkbox ticks");
  if (shots) await p.screenshot({ path: `${shots}/emails-import.png` });
  await p.close();

  // Automation editor -----------------------------------------------------------------------------------------------
  p = await ctx.newPage();
  p.on("pageerror", (e) => check(false, `no page errors (${e.message})`));
  await p.goto(`${base}/?view=flow`);
  await p.getByText("Trigger").first().waitFor();
  const trig = p.locator("button", { hasText: "Form submitted" }).first();
  check((await trig.innerText()).includes("The form this starts from was deleted. Pick a form."), "the trigger card says its form was deleted");
  check((await p.getByRole("alert").innerText()).includes("was deleted"), "the trigger panel says it too");
  check((await p.getByText("Deleted form", { exact: true }).count()) === 1, `the deleted form shows as its own chip (${await p.getByText("Deleted form").count()})`);
  check((await p.locator("[data-publish]").getAttribute("data-publish")) === "off", "Publish stays off");
  await p.getByRole("button", { name: "Remove the deleted form" }).click();
  await p.getByRole("button", { name: "Contact us", pressed: false }).click();
  check((await p.getByText("was deleted").count()) === 0, "picking a form clears the problem");
  const trigger = await p.evaluate(() => (window as unknown as { body: { trigger: { forms: string[] } } }).body.trigger.forms);
  check(JSON.stringify(trigger) === '["f1"]', `the trigger holds the picked form only (${JSON.stringify(trigger)})`);
  // Problems in words on the cards, no counts.
  const delayCard = p.locator("button", { hasText: "Delay" }).first();
  check((await delayCard.innerText()).includes("Set how long to wait"), "the Delay card says what's wrong in words");
  check((await p.locator("button span", { hasText: /^\d+$/ }).count()) === 0, "no bare problem counts on the cards");
  // Re-entry number field.
  await p.getByRole("button", { name: "More days" }).click();
  const gap = await p.evaluate(() => (window as unknown as { body: { entry: { gapDays: number } } }).body.entry.gapDays);
  check(gap === 31, `+ adds a day to Re-entry (${gap})`);
  // The Delay's fields.
  await delayCard.click();
  check((await p.locator('input[type="number"], input[type="time"]').count()) === 0, "no browser number or time boxes");
  await p.getByRole("button", { name: "More days" }).click();
  await p.getByRole("button", { name: "More days" }).click();
  await p.getByRole("button", { name: "Less days" }).click();
  const days = await p.evaluate(() => (window as unknown as { body: { steps: { days: number }[] } }).body.steps[0]!.days);
  check(days === 1, `− and + set the days (${days})`);
  check((await delayCard.innerText()).includes("Set how long to wait") === false, "the problem goes once there's a wait");
  await p.getByRole("button", { name: "At", exact: true }).click();
  const opts = await p.getByRole("option").allInnerTexts();
  check(opts[0] === "Any time" && opts.length === 97 && opts.includes("9:15 AM"), `At lists Any time and every 15 minutes (${opts.length})`);
  await p.getByRole("option", { name: "9:15 AM", exact: true }).click();
  const at = await p.evaluate(() => (window as unknown as { body: { steps: { at?: string }[] } }).body.steps[0]!.at);
  check(at === "09:15", `the time is kept as 09:15 (${at})`);
  // Typing into the number field.
  const daysBox = p.getByRole("textbox", { name: "Days" });
  await daysBox.fill("400");
  const capped = await p.evaluate(() => (window as unknown as { body: { steps: { days: number }[] } }).body.steps[0]!.days);
  check(capped === 365, `typing keeps days at most 365 (${capped})`);
  if (shots) await p.screenshot({ path: `${shots}/emails-delay.png` });

  // E3: the email step and its copy on the Emails canvas.
  const steps = () => p.evaluate(() => (window as unknown as { body: { steps: { id: string; email?: { subject: string; doc?: unknown }; approved?: boolean }[] } }).body.steps);
  const m1 = (await steps()).find((s) => s.id === "m1")!;
  check(m1.email!.subject === "From the canvas" && !!m1.email!.doc, `the canvas's newer words come into the draft (${m1.email!.subject})`);
  await p.locator("button", { hasText: "From the canvas" }).first().click();
  check((await p.getByRole("button", { name: "Edit email" }).count()) === 1, "the email step has Edit email");
  const subj = p.getByRole("textbox").first();
  await subj.fill("Thanks again");
  await p.waitForTimeout(1300);
  const saves = (await p.evaluate(() => (window as unknown as { calls: { fn: string; body: Record<string, unknown> }[] }).calls)).filter((c) => c.fn === "email_draft_save");
  check(saves.some((c) => c.body.p_id === "copy-m1" && c.body.p_subject === "Thanks again"), "a subject typed here reaches the copy");
  await p.getByRole("button", { name: "Edit email" }).click();
  const edit = (await p.evaluate(() => (window as unknown as { calls: { fn: string; body: Record<string, unknown> }[] }).calls)).find((c) => c.fn === "edit_email");
  check(edit?.body.copy === "copy-m1", "Edit email opens that email's copy");
  await p.close();
} finally {
  await browser.close();
  server.close();
}
if (failures.length) {
  console.log(`\n${failures.length} failed`);
  process.exit(1);
}
console.log("\nall passed");
