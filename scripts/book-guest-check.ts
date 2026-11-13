// The guest's booking flow in a real browser (src/components/book/Calendar.tsx): arrow keys move between days and
// Enter picks one, each day says how many open times it has, a returning guest's name and email are filled in, and the
// thank-you screen has the host, Google, Outlook and Apple, and its own Reschedule and Cancel.
//   CHROMIUM_PATH=… node scripts/book-guest-check.ts

import { createServer } from "node:http";
import { build } from "esbuild";
import pw from "playwright-core";

const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  if (!ok) failures.push(what);
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};

const root = new URL("..", import.meta.url).pathname;
const bundle = await build({ entryPoints: [`${root}scripts/book/guest.tsx`], bundle: true, write: false, format: "esm", jsx: "automatic", alias: { "@": `${root}src`, "server-only": `${root}scripts/book/guest.tsx` }, define: { "process.env.NODE_ENV": '"development"' }, logLevel: "error" });
const js = bundle.outputFiles[0].contents;
const server = createServer((req, res) => {
  if (req.url?.startsWith("/b.js")) return void res.writeHead(200, { "content-type": "text/javascript" }).end(js);
  res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><body style="margin:0"><div id="root"></div><script type="module" src="/b.js"></script>`);
});
await new Promise<void>((r) => server.listen(0, r));
const base = `http://localhost:${(server.address() as { port: number }).port}`;
const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, timezoneId: "UTC" });
page.on("pageerror", (e) => check(false, `no page errors (${e.message})`));

try {
  await page.goto(base);
  await page.evaluate(() => localStorage.setItem("claritia:guest", JSON.stringify({ name: "Lee Park", email: "lee@acme.com" })));
  await page.reload();
  await page.locator(".cb-day.cb-has").first().waitFor();
  await page.waitForTimeout(200);
  // The meeting's Description under its name, its line breaks kept.
  const desc = page.locator(".cb-desc");
  const box = await desc.boundingBox();
  const h1 = await page.locator(".cb-info h1").boundingBox();
  check((await desc.innerText()) === "Bring your numbers.\nWe'll look at pricing together." && !!box && !!h1 && box.y >= h1.y + h1.height - 1, "the meeting's Description shows under its name, line breaks kept");

  const label = await page.locator(".cb-day.cb-has").first().getAttribute("aria-label");
  check(/\d+ open times?$/.test(label ?? ""), `a day says how many open times it has ("${label}")`);
  const closed = await page.locator(".cb-day:not(.cb-has)").first().getAttribute("aria-label");
  check(/no times$/.test(closed ?? ""), `a day with none says so ("${closed}")`);
  check((await page.locator('.cb-days [tabindex="0"]').count()) === 1, "one day takes Tab at a time");

  await page.locator('.cb-days [tabindex="0"]').focus();
  const before = await page.evaluate(() => (document.activeElement as HTMLElement).dataset.cbDay);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(80);
  const after = await page.evaluate(() => (document.activeElement as HTMLElement).dataset.cbDay);
  check(!!before && !!after && after > before, `the right arrow moves to the next day (${before} to ${after})`);
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(80);
  // Find an open day from the keyboard and pick it with Enter.
  for (let i = 0; i < 10; i++) {
    const has = await page.evaluate(() => (document.activeElement as HTMLElement).classList.contains("cb-has"));
    if (has) break;
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(40);
  }
  const focused = await page.evaluate(() => (document.activeElement as HTMLElement).dataset.cbDay);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  check((await page.locator(`.cb-day[data-cb-day="${focused}"]`).getAttribute("aria-pressed")) === "true", "Enter picks the day");

  await page.locator(".cb-tlist > .cb-time").first().click();
  // A returning guest books from the time itself (docs/booking-page-plan.md); Change opens their details.
  check((await page.locator(".cb-tpair .cb-btn").innerText()) === "Confirm" && (await page.locator("[data-cb-as]").innerText()).includes("Lee Park"), "a returning guest can confirm from the time");
  await page.locator("[data-cb-as]").getByRole("button", { name: "Change" }).click();
  await page.locator(".cb-tpair .cb-btn").click();
  await page.locator(".cb-in").first().waitFor();
  check((await page.locator(".cb-in").nth(0).inputValue()) === "Lee Park" && (await page.locator(".cb-in").nth(1).inputValue()) === "lee@acme.com", "a returning guest's name and email are filled in");
  await page.locator(".cb-in").nth(0).fill("Lee Park-Jones");
  await page.locator('button[type="submit"]').click();
  await page.locator(".cb-done").waitFor();
  await page.waitForTimeout(150);
  check((await page.locator(".cb-done .cb-av").count()) >= 1, "the thank-you screen shows the host");
  check((await page.locator(".cb-add a", { hasText: "Google" }).count()) === 1 && (await page.locator(".cb-add a", { hasText: "Outlook" }).count()) === 1, "Google and Outlook");
  check((await page.locator(".cb-add a", { hasText: "Apple" }).getAttribute("href")) === "https://app.test/api/book/m/tok123?ics=1", "Apple downloads the meeting's calendar file");
  check((await page.locator("a", { hasText: "Reschedule" }).getAttribute("href")) === "https://app.test/book/m/tok123?do=move", "Reschedule opens the manage page on a new time");
  check((await page.locator("a", { hasText: /^Cancel$/ }).getAttribute("href")) === "https://app.test/book/m/tok123?do=cancel", "Cancel opens the manage page on cancel");
  check((await page.locator(".cb-done").textContent())?.includes("join link is in your invite") === true, "a video meeting says the join link is in the invite");
  const kept = await page.evaluate(() => localStorage.getItem("claritia:guest"));
  check(kept === JSON.stringify({ name: "Lee Park-Jones", email: "lee@acme.com" }), "the guest's details are kept for next time");
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`${failures.length} guest booking check(s) failed`);
  process.exit(1);
}
console.log("All guest booking checks passed");
