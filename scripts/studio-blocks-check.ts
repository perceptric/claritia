// Studio blocks and converted forms in a real browser, in the real forms/v1.js (src/lib/studio/page.ts, fromForm.ts):
// a price that adds up as people answer, a hidden deposit and its payment, a score's outcome by show-if, a grid and a
// ranking that send their answers, an extra picked and then hidden by a later answer that is never sent or charged,
// and a template turned into a page whose skip passes over a page. A small server stands in for the form's read and
// records the send.
//   CHROMIUM_PATH=… node scripts/studio-blocks-check.ts
import { createServer } from "node:http";
import pw from "playwright-core";
import { templateById } from "../src/lib/forms/gallery/catalog.ts";
import { templateForm } from "../src/lib/forms/gallery/convert.ts";
import { checkForm, type Form } from "../src/lib/forms/schema.ts";
import { formToPage } from "../src/lib/studio/fromForm.ts";
import { pageForm } from "../src/lib/studio/page.ts";
import { buildForms } from "./build-forms.mts";

const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  if (!ok) failures.push(what);
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};
const ready = (f: unknown): Form => {
  const r = checkForm(f);
  if ("errors" in r) throw new Error(r.errors.join(" "));
  return r.form;
};

const PRICED = "55555555-5555-4555-8555-555555555555";
const SKIPS = "66666666-6666-4666-8666-666666666666";
const priced = ready(
  pageForm({
    html: `<div class="page" id="page"><form id="f">
<label for="g">Guests</label><input id="g" name="guests" type="number" class="field">
<fieldset><legend>Service</legend>
<label class="choice"><input type="radio" name="service" value="buffet" data-cl-score="38" data-cl-label="Service"> Buffet</label>
<label class="choice"><input type="radio" name="service" value="plated" data-cl-score="52"> Plated</label></fieldset>
<div id="extras" data-cl-show-if="service == 'plated'"><label class="check"><input type="checkbox" name="wine" data-cl-label="Wine pairing"> Wine pairing</label></div>
<div data-cl-field="calc" data-cl-name="total" data-cl-label="Total" data-cl-formula="{guests} * {service} + {wine} * 300" data-cl-format="money" data-cl-currency="USD" id="total"></div>
<div data-cl-field="calc" data-cl-name="deposit" data-cl-label="Deposit" data-cl-formula="{total} * 0.2" data-cl-hide id="dep"></div>
<div data-cl-field="payment" data-cl-name="pay" data-cl-label="Deposit due now" data-cl-from="deposit" data-cl-currency="USD" id="pay"></div>
<p id="big" class="text" data-cl-show-if="total >= 3000">A big party: we'll call to plan it.</p>
<div data-cl-field="grid" data-cl-name="rate" data-cl-label="Rate us" data-cl-rows="Food|Service" data-cl-cols="OK|Great" id="rate"></div>
<div data-cl-field="ranking" data-cl-name="order" data-cl-label="What matters most" data-cl-options="Price|Taste|Speed" id="order"></div>
<label for="e">Email</label><input id="e" name="email" type="email" data-cl-save="email" required class="field">
<button type="submit" class="btn">Send</button></form>
<section data-cl-thanks hidden><h2>Thanks</h2></section></div>`,
    css: "",
    brand: ".btn{padding:10px}",
    after: { kind: "thanks" },
  }).form,
);
// A template with a skip: the page after the first is passed over for some answers.
const tpl = templateById("legal.case-evaluation")!;
const conv = formToPage(ready(templateForm(tpl)));
const skips = ready(pageForm({ html: conv.html, css: conv.css, brand: "", after: conv.after, title: conv.title }).form);

const formsJs = await buildForms();
const sent: { id: string; body: Record<string, unknown> }[] = [];
const server = createServer((req, res) => {
  const json = (b: unknown) => res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" }).end(JSON.stringify(b));
  const u = req.url ?? "";
  if (u.startsWith("/forms/v1.js")) return res.writeHead(200, { "content-type": "text/javascript" }).end(formsJs);
  const m = /^\/api\/forms\/([0-9a-f-]{36})\/submit/.exec(u);
  if (m) {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      sent.push({ id: m[1]!, body: JSON.parse(raw || "{}") });
      json({ id: "sub1" });
    });
    return;
  }
  if (u === `/api/forms/${PRICED}`) return json({ id: PRICED, version: 1, status: "live", body: priced, tokens: {}, logo_url: null });
  if (u === `/api/forms/${SKIPS}`) return json({ id: SKIPS, version: 1, status: "live", body: skips, tokens: {}, logo_url: null });
  if (u.startsWith("/api/")) return json({});
  const id = u.slice(1).split("?")[0];
  if (id === PRICED || id === SKIPS)
    return res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><html><body><script src="/forms/v1.js" async></script><claritia-form form-id="${id}" host="${origin}"></claritia-form></body></html>`);
  res.writeHead(404).end();
});
await new Promise<void>((r) => server.listen(0, r));
const origin = `http://localhost:${(server.address() as { port: number }).port}`;

const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const f = page.locator("claritia-form");

  await page.goto(`${origin}/${PRICED}`);
  await f.locator("#g").waitFor();
  const total = () => f.locator("#total output").textContent();
  check((await total())?.trim() === "—" || (await total())?.trim() === "", "no answers yet: no total");
  await f.locator("#g").fill("40");
  await f.locator("label.choice", { hasText: "Plated" }).click();
  await page.waitForTimeout(100);
  check((await total())?.includes("2,080") === true, `the total adds up as people answer: ${await total()}`);
  check(await f.locator("#extras").isVisible(), "the extra shows for its answer");
  await f.locator("label.check", { hasText: "Wine pairing" }).click();
  await page.waitForTimeout(100);
  check((await total())?.includes("2,380") === true, `a ticked extra counts its points: ${await total()}`);
  check((await f.locator("#dep output").count()) === 0, "a hidden calc isn't shown");
  check((await f.locator("#pay").textContent())?.includes("476") === true, `the payment shows the hidden deposit: ${await f.locator("#pay").textContent()}`);
  check(!(await f.locator("#big").isVisible()), "an outcome by a calc stays hidden below its number");
  await f.locator("#g").fill("60");
  await page.waitForTimeout(100);
  check(await f.locator("#big").isVisible(), "a show-if on a calc shows once the total passes it");
  // Back to buffet: the extra hides, so it's neither priced nor sent.
  await f.locator("label.choice", { hasText: "Buffet" }).click();
  await page.waitForTimeout(100);
  check(!(await f.locator("#extras").isVisible()), "the extra hides when its answer changes");
  check((await total())?.includes("2,280") === true, `a hidden extra no longer counts: ${await total()}`);
  // The grid and the ranking, drawn by the form script in the page.
  const grid = f.locator("#rate");
  check((await grid.locator("input[type=radio]").count()) === 4, "the grid draws a choice per row and column");
  await grid.locator("input[type=radio]").nth(1).check();
  await grid.locator("input[type=radio]").nth(3).check();
  check((await f.locator("#order li, #order [role=listitem], #order .rk").count()) >= 3 || (await f.locator("#order").textContent())!.includes("Taste"), "the ranking draws its options");
  await f.locator("#e").fill("ada@acme-industries.com");
  await f.getByRole("button", { name: "Send" }).click();
  await f.getByText("Thanks").waitFor({ timeout: 5000 });
  const got = sent.find((x) => x.id === PRICED)?.body as { answers?: Record<string, unknown> } | undefined;
  const ids = priced.page!.ids;
  const a = got?.answers ?? {};
  check(a[ids.guests!] !== undefined && a[ids.service!] === "buffet", "the answers go by field id");
  check(!(ids.wine! in a), "an extra a show-if hid isn't sent (so it can't be charged)");
  check(!(ids.total! in a) && !(ids.deposit! in a), "a calc's number isn't sent: the server works it out");
  check(JSON.stringify(a[ids.rate!] ?? null).includes("Great") || JSON.stringify(a[ids.rate!] ?? null).includes("OK"), `the grid's answer is sent: ${JSON.stringify(a[ids.rate!])}`);

  // A converted template: its first page, then a skip passes over pages for some answers.
  await page.goto(`${origin}/${SKIPS}`);
  await f.locator("[data-cl-step]").first().waitFor();
  check((await f.locator("[data-cl-step]").count()) === tpl.schema.pages.length, `the template's ${tpl.schema.pages.length} pages are steps`);
  check((await f.locator("[data-cl-progress]").count()) === 1, "a progress bar shows");
  check(await f.locator("img[data-cl-logo]").count() === 1, "the logo spot is there");
  check(errors.length === 0, `no page errors: ${errors.join(" | ")}`);
} finally {
  await browser.close();
  server.close();
}
if (failures.length) {
  console.log(`\n${failures.length} failed`);
  process.exit(1);
}
console.log("\nall passed");
