// The fields plan in a real browser (docs/fields-plan.md), in the real forms/v1.js and x1.js: a page with the new
// fields is filled the way a visitor would, the send carries answers the server's own check takes, and the flaky
// cases hold: x1.js failing its first load, an upload failing once, an address lookup that never answers, a wrong
// email code before the right one. Also a page timer that moves on by itself and a date rule ("within 30 days").
// A small server stands in for the form's read, the code route, uploads and the send.
//   CHROMIUM_PATH=… node scripts/fields-check.ts   (SHOTS=dir saves screenshots)
import { createServer } from "node:http";
import pw from "playwright-core";
import { checkForm, type Form } from "../src/lib/forms/schema.ts";
import { checkAnswers } from "../src/lib/forms/values.ts";
import { questionHtml, type QType } from "../src/lib/studio/builder.ts";
import { pageForm } from "../src/lib/studio/page.ts";
import { buildExtras, buildForms } from "./build-forms.mts";

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
const shots = process.env.SHOTS;

const q = (t: QType, name: string, o: Parameters<typeof questionHtml>[2] = {}) => questionHtml(t, name, o);
const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const FIELDS = "11111111-aaaa-4aaa-8aaa-111111111111";
const TIMED = "22222222-bbbb-4bbb-8bbb-222222222222";
const html = `<div class="page"><form>
<div class="cl-progress" data-cl-progress><i></i></div>
<div class="q"><label class="label" for="q_email">Email</label><input class="field" id="q_email" name="email" type="email" data-cl-save="email" data-cl-verify required><p class="error" data-cl-error-for="email"></p></div>
${q("faces", "mood")}${q("thumbs", "helpful")}${q("sum", "points")}${q("range", "budget")}${q("table", "table")}${q("availability", "avail")}
${q("products", "products")}<div class="q"><div data-cl-field="payment" data-cl-name="pay" data-cl-label="Total due" data-cl-from="products" data-cl-currency="USD" id="pay"></div></div>
${q("amount", "gift")}${q("duration", "duration")}${q("rich", "details")}${q("multiselect", "picks", { options: ["Red", "Green", "Blue"] })}
${q("longlist", "city", { options: Array.from({ length: 1200 }, (_, i) => `City ${i + 1}`) })}${q("dependent", "sub", { parent: "category" })}${q("pictures", "picture")}${q("group", "guests")}
${q("draw", "drawing")}${q("location", "where")}${q("video", "clip").replace('data-cl-src=""', 'data-cl-src="https://youtu.be/dQw4w9WgXcQ"')}
${q("toggle", "updates")}${q("unit", "weight")}${q("pattern", "zip")}${q("agree", "terms")}
<div class="q"><label class="label" for="q_start">Start date</label><input class="field" id="q_start" name="start" type="date"><p class="error" data-cl-error-for="start"></p></div>
<p class="text" id="soon" data-cl-show-if="start within 30 days">Starting soon</p>
${q("address", "addr").replace('data-cl-field="address"', 'data-cl-field="address" data-cl-auto')}
<div class="cl-review" data-cl-review></div>
<button type="submit" class="btn">Send</button></form><section data-cl-thanks hidden><h2>Thanks</h2></section></div>`;
const fieldsForm = ready(pageForm({ html, css: "", brand: ".btn{padding:10px}", after: { kind: "thanks" } }).form);
const timed = ready(
  pageForm({
    html: `<form><section data-cl-step id="s1" data-cl-timer="2"><h2>Quick question</h2><div class="q"><label for="a">Answer</label><input id="a" name="a" class="field"></div><button type="button" data-cl-next>Next</button></section><section data-cl-step id="s2"><h2 id="two">Page two</h2><div class="q"><label for="e">Email</label><input id="e" name="email" type="email" data-cl-save="email"></div><button type="submit">Send</button></section></form><section data-cl-thanks hidden><h2>Thanks</h2></section>`,
    css: "",
    brand: "",
    after: { kind: "thanks" },
  }).form,
);

const x1 = await buildExtras();
const formsJs = await buildForms(x1);
const sent: Record<string, unknown>[] = [];
let x1Hits = 0;
let uploads = 0;
const codeCalls: Record<string, unknown>[] = [];
const server = createServer((req, res) => {
  const json = (b: unknown, status = 200) => res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" }).end(JSON.stringify(b));
  const body = (fn: (raw: string) => void) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => fn(raw));
  };
  const u = req.url ?? "";
  if (u.startsWith("/forms/v1.js")) return res.writeHead(200, { "content-type": "text/javascript" }).end(formsJs);
  if (u.startsWith("/forms/x1.js")) {
    // The first load fails: the form tries again.
    if (x1Hits++ === 0) return res.writeHead(500).end();
    return res.writeHead(200, { "content-type": "text/javascript" }).end(x1);
  }
  if (/\/upload$/.test(u)) {
    // The first upload fails with a server error: it's sent again.
    req.resume();
    req.on("end", () => (uploads++ === 0 ? json({ error: "busy" }, 503) : json({ token: `up_${"1".repeat(8)}-1111-4111-8111-111111111111:drawing.png` })));
    return;
  }
  if (/\/code$/.test(u))
    return body((raw) => {
      const b = JSON.parse(raw || "{}") as { code?: string };
      codeCalls.push(b);
      if (b.code === undefined) return json({ sent: true });
      return b.code === "123456" ? json({ proof: "proof-1" }) : json({ error: "That code didn't match. Check it, or send a new one." }, 400);
    });
  if (/\/submit$/.test(u)) return body((raw) => (sent.push(JSON.parse(raw || "{}")), json({ id: "sub1" })));
  if (u === `/api/forms/${FIELDS}`) return json({ id: FIELDS, version: 1, status: "live", body: fieldsForm, logo_url: null, map: "pk.test", codes: { email: true } });
  if (u === `/api/forms/${TIMED}`) return json({ id: TIMED, version: 1, status: "live", body: timed, logo_url: null });
  if (u.startsWith("/api/")) return json({});
  const id = u.slice(1).split("?")[0];
  if (id === FIELDS || id === TIMED) return res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><html><body><script src="/forms/v1.js" async></script><claritia-form form-id="${id}" host="${origin}"></claritia-form></body></html>`);
  res.writeHead(404).end();
});
await new Promise<void>((r) => server.listen(0, r));
const origin = `http://localhost:${(server.address() as { port: number }).port}`;

const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 }, permissions: [] });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Map lookups: the first street search never answers (the form keeps working), the next one finds an address.
  let lookups = 0;
  await page.route("https://api.mapbox.com/**", async (route) => {
    if (lookups++ === 0) return; // never answers
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ features: [{ properties: { name: "1 Market St", full_address: "1 Market St, San Francisco, California 94105, United States", context: { place: { name: "San Francisco" }, region: { name: "California" }, postcode: { name: "94105" }, country: { name: "United States" } } } }] }) });
  });
  const f = page.locator("claritia-form");
  await page.goto(`${origin}/${FIELDS}`);
  await f.locator("#q_email").waitFor();
  // x1.js failed once, then loaded: the widgets draw.
  await f.locator("button[aria-label='Happy']").waitFor({ timeout: 8000 });
  check(x1Hits >= 2, "x1.js is tried again after a failed load, and the fields draw");
  check((await f.locator(".vd iframe").getAttribute("src")) === "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "a video plays from YouTube without cookies");

  await f.locator("button[aria-label='Happy']").click();
  await f.locator("button[aria-label='Thumbs up']").click();
  check((await f.locator("button[aria-label='Happy']").getAttribute("aria-checked")) === "true" && (await f.locator("button[aria-label='Thumbs up']").getAttribute("aria-checked")) === "true", "the smiley and the thumb picked show as picked");
  const sumBoxes = f.locator("input[aria-label='Price'], input[aria-label='Quality'], input[aria-label='Support']");
  await sumBoxes.nth(0).fill("50");
  await sumBoxes.nth(1).fill("30");
  await sumBoxes.nth(2).fill("20");
  await sumBoxes.nth(2).press("Tab");
  check((await f.locator(".xm").filter({ hasText: "points" }).first().textContent())?.includes("All 100") === true, "points to spread count down to all given");
  await f.locator("input[type=number][aria-label='Lowest']").fill("200");
  await f.locator("input[type=number][aria-label='Lowest']").press("Tab");
  await f.locator("input[type=number][aria-label='Highest']").fill("800");
  await f.locator("input[type=number][aria-label='Highest']").press("Tab");
  await f.locator("input[aria-label='Item 1, Quantity']").fill("3");
  await f.locator("input[aria-label='Item 1, Quantity']").press("Tab");
  await f.locator("input[aria-label='Monday, Morning']").check();
  await f.locator("input[aria-label='Tuesday, Evening']").check();
  await f.locator("button[aria-label='One more Product A']").click();
  await f.locator("button[aria-label='One more Product A']").click();
  await page.waitForTimeout(100);
  check((await f.locator(".xm").filter({ hasText: "Total" }).textContent())?.includes("40") === true, "products add up their prices");
  check((await f.locator("#pay").textContent())?.includes("40") === true, `the payment charges the products' total: ${await f.locator("#pay").textContent()}`);
  await f.locator("button[role=radio]", { hasText: "$25" }).click();
  check((await f.locator("button[role=radio]", { hasText: "$25" }).getAttribute("aria-pressed")) === "true", "the amount picked shows as picked");
  await f.locator("input[aria-label='Hours']").fill("1");
  await f.locator("input[aria-label='Minutes']").fill("30");
  await f.locator("input[aria-label='Minutes']").press("Tab");
  await f.locator(".xr textarea").fill("Hello there");
  await f.locator(".xr textarea").press("Tab");
  // Multi-select dropdown.
  await f.locator("button[aria-haspopup=listbox]", { hasText: "Choose…" }).first().click();
  await f.locator(".xpop label", { hasText: "Red" }).click();
  await f.locator(".xpop label", { hasText: "Blue" }).click();
  await f.locator(".xpop button", { hasText: "Done" }).click();
  check((await f.locator("button[aria-haspopup=listbox]", { hasText: "Red, Blue" }).count()) === 1, "a multi-select dropdown shows what's picked");
  // A searchable list of 1,200 cities: typing finds one.
  const cityBtn = f.locator(".bx").filter({ hasNotText: "Red" }).first();
  await cityBtn.click();
  await f.locator(".ls input").fill("City 1150");
  await f.locator(".ls .op", { hasText: "City 1150" }).first().click();
  check((await f.locator(".bx", { hasText: "City 1150" }).count()) === 1, "a long list finds an option as it's typed");
  // Dependent dropdown: the list follows the category.
  await f.locator("select[name=category]").selectOption("Category B");
  await page.waitForTimeout(100);
  const subBtn = f.locator(".bx").last();
  await subBtn.click();
  const subOpts = await f.locator(".ls .op").allTextContents();
  check(subOpts.join("|") === "Option 3|Option 4", `a dependent dropdown shows the options for the category picked: ${subOpts.join("|")}`);
  await f.locator(".ls .op", { hasText: "Option 3" }).click();
  // Picture choice, the repeating group, the drawing.
  await f.locator(".cd label, .cd button, .cd [role=radio]").first().click().catch(() => undefined);
  await f.locator(".gr input").first().fill("Ana");
  await f.locator(".gr input").first().press("Tab");
  const cv = f.locator("canvas.xcv");
  await cv.scrollIntoViewIfNeeded();
  const box = await cv.boundingBox();
  if (box) {
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 80, { steps: 8 });
    await page.mouse.up();
  }
  await f.locator(".hp", { hasText: "Drawing saved" }).waitFor({ timeout: 6000 }).then(() => true, () => false).then((ok) => check(ok && uploads === 2, `a drawing saves, its first failed upload sent again (${uploads} tries)`));
  await f.locator("input[placeholder='City, address or coordinates']").fill("Austin, Texas");
  await f.locator("input[placeholder='City, address or coordinates']").press("Tab");
  await f.locator(".cl-switch").click();
  await f.locator("#q_weight").fill("72");
  await f.locator("#q_zip").fill("12");
  await f.locator("label.choice", { hasText: "terms and conditions" }).locator("input").check();
  // The date rule: within 30 days shows, 60 days out hides.
  await f.locator("#q_start").fill(day(5));
  await page.waitForTimeout(50);
  check(await f.locator("#soon").isVisible(), "a date within the next 30 days meets the rule");
  await f.locator("#q_start").fill(day(60));
  await page.waitForTimeout(50);
  check(!(await f.locator("#soon").isVisible()), "a date 60 days out doesn't");
  // An address lookup that never answers leaves the boxes to type in; the next one suggests the address.
  const street = f.locator("input[aria-label='Street address']");
  await street.fill("1 Mark");
  await page.waitForTimeout(600);
  await street.fill("1 Market St");
  await f.locator(".xpop button", { hasText: "San Francisco" }).waitFor({ timeout: 6000 });
  await f.locator(".xpop button", { hasText: "San Francisco" }).click();
  check((await f.locator("input[aria-label='City']").inputValue()) === "San Francisco" && (await f.locator("input[aria-label='Postcode']").inputValue()) === "94105", "a picked address fills the city and postcode");
  await f.locator("#q_email").fill("ana@acme.com");
  await f.locator("#q_email").press("Tab");
  const rv = (await f.locator("[data-cl-review]").textContent()) ?? "";
  check(rv.includes("ana@acme.com") && rv.includes("Happy") && rv.includes("Thumbs up"), "the answer review lists the answers so far, in words");
  // Formatted text: a ZIP that isn't five digits is refused with the format's own words.
  await f.locator("button[type=submit]").click();
  await page.waitForTimeout(100);
  check((await f.locator('[data-cl-error-for="zip"]').textContent()) === "Enter 5 digits.", "formatted text checks its format");
  await f.locator("#q_zip").fill("94105");
  await f.locator("button[type=submit]").click();
  // The email code: a wrong one first, then the right one.
  await f.locator(".cl-code input").waitFor({ timeout: 5000 });
  check(codeCalls.length === 1 && !("code" in codeCalls[0]!), "a code is sent to the email before the form sends");
  await f.locator(".cl-code input").fill("000000");
  await f.locator(".cl-code button", { hasText: "Confirm" }).click();
  await f.locator(".cl-code .error").waitFor();
  check((await f.locator(".cl-code .error").textContent())?.includes("didn't match") === true && !sent.length, "a wrong code is refused and nothing is sent");
  await f.locator(".cl-code input").fill("123456");
  await f.locator(".cl-code button", { hasText: "Confirm" }).click();
  await page.waitForFunction(() => document.querySelector("claritia-form")?.shadowRoot?.querySelector("[data-cl-thanks]:not([hidden])"), null, { timeout: 8000 });
  if (shots) await page.screenshot({ path: `${shots}/fields.png`, fullPage: true });
  const s = sent[0] as { answers: Record<string, unknown>; codes?: Record<string, string> } | undefined;
  check(!!s, "the form sends once the code is confirmed");
  if (s) {
    const id = (n: string) => fieldsForm.page!.ids[n]!;
    check(s.codes?.[id("email")] === "proof-1", "the send carries the code's proof");
    const a = s.answers;
    check(a[id("mood")] === 4 && a[id("helpful")] === 2, `smileys and thumbs answer numbers: ${a[id("mood")]}, ${a[id("helpful")]}`);
    check(JSON.stringify(a[id("points")]) === JSON.stringify({ Price: "50", Quality: "30", Support: "20" }), `points: ${JSON.stringify(a[id("points")])}`);
    check(JSON.stringify(a[id("budget")]) === JSON.stringify({ from: "200", to: "800" }), `range: ${JSON.stringify(a[id("budget")])}`);
    check((a[id("table")] as Record<string, string>)?.["Item 1: Quantity"] === "3", "the table keeps each cell");
    check(JSON.stringify(a[id("avail")]) === JSON.stringify({ Monday: ["Morning"], Tuesday: ["Evening"] }), `availability: ${JSON.stringify(a[id("avail")])}`);
    check(JSON.stringify(a[id("products")]) === JSON.stringify({ "Product A": "2" }), `products: ${JSON.stringify(a[id("products")])}`);
    check(a[id("gift")] === "25" && a[id("duration")] === "90", `amount ${a[id("gift")]}, duration ${a[id("duration")]} minutes`);
    check(JSON.stringify(a[id("picks")]) === JSON.stringify(["Red", "Blue"]) && a[id("city")] === "City 1150" && a[id("sub")] === "Option 3", "the lists send their picks");
    check((a[id("addr")] as Record<string, string>)?.city === "San Francisco", "the address sends its parts");
    check(typeof a[id("drawing")] === "string" && String(a[id("drawing")]).startsWith("up_"), "the drawing sends its upload");
    // The server's own check takes every answer as sent.
    const r = checkAnswers(fieldsForm, a, { today: day(0) });
    check(!Object.keys(r.errors).length, `the server's check takes the answers${Object.keys(r.errors).length ? `: ${JSON.stringify(r.errors)}` : ""}`);
  }

  // A page timer moves on by itself.
  await page.goto(`${origin}/${TIMED}`);
  await f.locator(".cl-timer").waitFor();
  check((await f.locator(".cl-timer").textContent())?.startsWith("Time left 0:0") === true, "a timed page shows the time left");
  await f.locator("#two").waitFor({ state: "visible", timeout: 5000 }).then(() => true, () => false).then((ok) => check(ok, "when the time is up, the next page opens"));
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
