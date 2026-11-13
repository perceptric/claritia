// The booking page, round 2, in a real browser (docs/booking-page-plan.md; scripts/book/page.tsx): the host card with
// both clocks, plain Inter labels, the today mark, the picked day under the pointer, the phone's two-column times, a
// guest the page knows booking from the time itself, filled-in answers, holds, the plain-words box, the week view,
// "Show my calendar", the confirmed screen and dark mode.
//   node scripts/booking-page-check.ts   (SHOTS=<dir> saves screenshots)

import { createServer } from "node:http";
import { build } from "esbuild";
import pw from "playwright-core";

const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  if (!ok) failures.push(what);
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};

const root = new URL("..", import.meta.url).pathname;
const bundle = await build({ entryPoints: [`${root}scripts/book/page.tsx`], bundle: true, write: false, format: "esm", jsx: "automatic", alias: { "@": `${root}src`, "server-only": `${root}scripts/email-canvas/empty.ts` }, define: { "process.env.NODE_ENV": '"development"' }, logLevel: "error" });
const js = bundle.outputFiles[0]!.contents;
const server = createServer((req, res) => {
  if (req.url?.startsWith("/b.js")) return void res.writeHead(200, { "content-type": "text/javascript" }).end(js);
  res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><body style="margin:0"><div id="root"></div><script type="module" src="/b.js"></script>`);
});
await new Promise<void>((r) => server.listen(0, r));
const base = `http://localhost:${(server.address() as { port: number }).port}`;
const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
const shots = process.env.SHOTS;

async function open(q = "", o: { width?: number; height?: number; dark?: boolean } = {}) {
  const page = await browser.newPage({ viewport: { width: o.width ?? 1300, height: o.height ?? 900 }, timezoneId: "America/New_York", colorScheme: o.dark ? "dark" : "light" });
  page.on("pageerror", (e) => check(false, `no page errors (${e.message})`));
  await page.goto(`${base}/${q}`);
  await page.locator(".cb-day.cb-has").first().waitFor();
  await page.waitForTimeout(150);
  return page;
}

try {
  // 1. The look.
  let page = await open();
  check((await page.locator(".cb-info .cb-host-one").innerText()).includes("Founder, Perceptric"), "one host shows with their headline");
  check((await page.locator("[data-cb-agenda] li").count()) === 3, "What we'll cover lists the agenda");
  const weekFont = await page.locator(".cb-week").evaluate((el) => getComputedStyle(el).fontFamily + "|" + getComputedStyle(el).textTransform);
  check(!/mono/i.test(weekFont) && weekFont.endsWith("|none"), `day names are Inter, not mono capitals (${weekFont})`);
  check(!/mono/i.test(await page.locator(".cb-soon .cb-eyebrow").evaluate((el) => getComputedStyle(el).fontFamily)), "Soonest is Inter");
  const zone = await page.locator(".cb-zbtn span").innerText();
  check(/^New York, \d{1,2}:\d{2}\s?[AP]M$/.test(zone) && !zone.includes("…"), `the time zone shows in full ("${zone}")`);
  const zoneOver = await page.locator(".cb-zbtn span").evaluate((el) => el.scrollWidth <= el.clientWidth + 1 && getComputedStyle(el).textOverflow !== "ellipsis");
  check(zoneOver, "the time zone is never cut short");
  const todayMarker = await page.locator(".cb-day.cb-today").evaluate((el) => getComputedStyle(el, "::before").content);
  check(todayMarker === "none" || todayMarker === "normal", "today has no stray dash");
  // The picked day keeps its color under the pointer.
  const picked = page.locator('.cb-day[aria-pressed="true"]');
  const before = await picked.evaluate((el) => getComputedStyle(el).backgroundColor);
  await picked.hover();
  await page.waitForTimeout(200);
  check((await picked.evaluate((el) => getComputedStyle(el).backgroundColor)) === before, "the picked day keeps its color when hovered");
  // Both clocks.
  await page.locator(".cb-time").first().click();
  await page.waitForTimeout(150);
  check(/PM for Vincent|AM for Vincent/.test(await page.locator("[data-cb-theirs]").innerText()), "the picked time shows Vincent's own clock");
  check((await page.evaluate(() => (window as unknown as { holds: number[] }).holds.length)) === 1, "picking a time holds it");
  check((await page.locator(".cb-tpair .cb-btn").innerText()) === "Next", "a guest the page doesn't know goes on to their details");
  if (shots) await page.screenshot({ path: `${shots}/booking-desk.png` });

  // 2. The plain-words box.
  await page.locator('input[aria-label="Find a time"]').fill("monday morning");
  await page.locator(".cb-findbtn").first().click();
  await page.waitForTimeout(200);
  const chips = page.locator('[data-cb-chips="found"] .cb-sc');
  const n = await chips.count();
  check(n > 0 && n <= 6, `"monday morning" lists matching times (${n})`);
  const firstMatch = n ? await chips.first().innerText() : "";
  check(/^\d{1,2}:\d{2}\s?AM\s*Mon/.test(firstMatch.replace(/\s+/g, " ")), `the matches are Monday mornings ("${firstMatch.replace(/\s+/g, " ")}")`);
  check((await page.locator(".cb-time.cb-match").count()) > 0, "matching times are marked in the day's list");
  await page.locator('input[aria-label="Find a time"]').fill("the week after the eclipse");
  await page.locator(".cb-findbtn").first().click();
  await page.waitForTimeout(200);
  check((await page.getByText("No open times match").count()) === 1, "words nothing reads say so in one line");
  await page.getByRole("button", { name: "Clear" }).click();
  check((await page.locator('[data-cb-chips="soonest"]').count()) === 1, "Clear brings back Soonest");

  // 3. Week view.
  await page.getByRole("radio", { name: "Week" }).click();
  await page.waitForTimeout(200);
  check((await page.locator(".cb-wcol").count()) === 7, "Week shows seven days");
  check((await page.locator(".cb-times").count()) === 0, "the day's list steps aside in Week");
  await page.locator(".cb-wt").nth(2).click();
  await page.waitForTimeout(150);
  check((await page.locator(".cb-wconfirm .cb-btn").innerText()) === "Next", "a picked time in Week shows Next");
  if (shots) await page.screenshot({ path: `${shots}/booking-week.png` });

  // 4. Show my calendar: the window's answer marks clashing times.
  await page.getByRole("radio", { name: "Month" }).click();
  await page.evaluate(() => {
    window.open = (() => window) as typeof window.open;
  });
  await page.locator("[data-cb-mine]").getByRole("button", { name: "Google" }).click();
  const firstStart = await page.evaluate(() => (window as unknown as { holds: number[] }).holds[0]!);
  await page.evaluate((s) => window.postMessage({ claritia: "overlay", provider: "google", busy: [[s, s + 3_600_000]] }, "*"), firstStart);
  await page.waitForTimeout(200);
  check((await page.locator("[data-cb-mine]").innerText()).includes("Your Google calendar is on"), "Show my calendar turns on with the window's answer");
  check((await page.locator(".cb-time.cb-busy, .cb-tpair .cb-time.cb-busy").count()) >= 1 || (await page.getByText("You're busy").count()) >= 1, "times that clash say You're busy");
  // A message from any other window is ignored.
  await page.locator("[data-cb-mine]").getByRole("button", { name: "Hide" }).click();
  await page.evaluate(() => {
    (window as unknown as { open: unknown }).open = () => ({});
  });
  await page.locator("[data-cb-mine]").getByRole("button", { name: "Google" }).click();
  await page.evaluate((s) => window.postMessage({ claritia: "overlay", provider: "google", busy: [[s, s + 3_600_000]] }, "*"), firstStart);
  await page.waitForTimeout(150);
  check((await page.locator("[data-cb-mine]").innerText()).includes("Show my calendar"), "busy times from a window the page didn't open are ignored");
  await page.close();

  // 5. A guest the page knows books from the time itself, with the form's answers.
  page = await open("?who=known&q=1&known=1");
  await page.locator(".cb-time").first().click();
  await page.waitForTimeout(150);
  check((await page.locator("[data-cb-as]").innerText()).includes("Lee Park"), "the page says who's booking");
  check((await page.locator(".cb-tpair .cb-btn").innerText()) === "Confirm", "the time's button is Confirm");
  await page.locator(".cb-tpair .cb-btn").click();
  await page.locator(".cb-done").waitFor();
  const booked = await page.evaluate(() => (window as unknown as { booked: { name: string; email: string; answers: Record<string, string> }[] }).booked);
  check(booked.length === 1 && booked[0]!.email === "lee@acme.com" && booked[0]!.answers.size === "11-50", "one click books with the known name, email and answers");
  check(/^Starts in /.test(await page.locator("[data-cb-countdown]").innerText()), "the confirmed screen counts down");
  check((await page.locator("[data-cb-prep] li").count()) === 2, "Before the call lists the prep");
  check(/for Vincent/.test(await page.locator(".cb-sum").innerText()), "the confirmed screen shows Vincent's clock too");
  if (shots) await page.screenshot({ path: `${shots}/booking-done.png` });
  await page.close();

  // 6. Known name but a required answer missing: details, with the question asked.
  page = await open("?who=known&q=1");
  await page.locator(".cb-time").first().click();
  check((await page.locator(".cb-tpair .cb-btn").innerText()) === "Next", "a missing answer means Next, not Confirm");
  await page.locator(".cb-tpair .cb-btn").click();
  check((await page.getByText("Team size").count()) >= 1, "the details step asks the missing question");
  await page.close();
  // Change: the guest edits their details.
  page = await open("?who=known");
  await page.locator(".cb-time").first().click();
  await page.locator("[data-cb-as]").getByRole("button", { name: "Change" }).click();
  check((await page.locator(".cb-tpair .cb-btn").innerText()) === "Next", "Change goes back to the details step");
  await page.close();

  // 7. Someone else is booking the time.
  page = await open("?taken=1");
  await page.locator(".cb-time").first().click();
  await page.waitForTimeout(300);
  check((await page.getByRole("alert").innerText()).includes("Someone is booking that time"), "a time someone else holds says so");
  check((await page.locator(".cb-tpair").count()) === 0, "and it's no longer picked");
  await page.close();

  // 8. Phone: two columns of times, nothing spills.
  page = await open("", { width: 390, height: 844 });
  const cols = await page.locator(".cb-tlist").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
  check(cols === 2, `phone times sit in two columns (${cols})`);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways scroll on a phone");
  if (shots) await page.screenshot({ path: `${shots}/booking-phone.png`, fullPage: true });
  await page.close();

  // 9. Dark: Claritia's own look follows the guest's setting.
  page = await open("", { dark: true });
  const bg = await page.locator(".cb-card").evaluate((el) => getComputedStyle(el).backgroundColor);
  const [r] = (bg.match(/\d+/g) ?? ["255"]).map(Number);
  check(r! < 60, `the card is dark in dark mode (${bg})`);
  if (shots) await page.screenshot({ path: `${shots}/booking-dark.png` });
  await page.close();
} finally {
  await browser.close();
  server.close();
}
if (failures.length) {
  console.log(`\n${failures.length} failed`);
  process.exit(1);
}
console.log("\nall passed");
