// Every way a form and a meeting go on a website (docs/sharing-plan.md), in a real browser, with the code Share writes
// (src/lib/share/embed.ts) and the real forms/v1.js: in the page, full page, popup (sizes, timed), slider (both sides),
// popover, side tab, a Form Studio page over the page, full screen on a phone unless kept, Escape and focus; and the
// meeting calendar in the page, from a floating button and from the site's own link. A small server stands in for the
// form's read and the booking page.
//   CHROMIUM_PATH=… node scripts/embed-check.ts
import { createServer } from "node:http";
import pw from "playwright-core";
import { checkForm, emptyForm, type Form } from "../src/lib/forms/schema.ts";
import { formEmbedCode, meetingEmbedCode } from "../src/lib/share/embed.ts";
import { pageForm } from "../src/lib/studio/page.ts";
import { buildForms } from "./build-forms.mts";

const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  if (!ok) failures.push(what);
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};

const FORM = "11111111-1111-4111-8111-111111111111";
const PAGE = "22222222-2222-4222-8222-222222222222";
const ready = (f: Form | Record<string, unknown>) => {
  const r = checkForm(f);
  if ("errors" in r) throw new Error(r.errors.join(" "));
  return r.form;
};
const plain = ready(emptyForm());
const studio = ready(
  pageForm({ html: `<form><label for="e">Work email</label><input id="e" name="email" type="email" required><button type="submit">Send</button></form><section data-cl-thanks hidden><h2>Thanks</h2></section>`, css: "", brand: "", after: { kind: "thanks" } }).form,
);
const formsJs = await buildForms();

const pages = new Map<string, string>();
const server = createServer((req, res) => {
  const json = (b: unknown) => res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" }).end(JSON.stringify(b));
  const u = req.url ?? "";
  if (u.startsWith("/forms/v1.js")) return res.writeHead(200, { "content-type": "text/javascript" }).end(formsJs);
  if (u === `/api/forms/${FORM}`) return json({ id: FORM, version: 1, status: "live", body: plain, tokens: {}, logo_url: null });
  if (u === `/api/forms/${PAGE}`) return json({ id: PAGE, version: 1, status: "live", body: studio, tokens: {}, logo_url: null });
  if (u.startsWith("/api/")) return json({});
  if (u.startsWith("/book/")) return res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><body style="margin:0"><h1 id="cal">Pick a time</h1></body>`);
  const page = pages.get(u.split("?")[0]!);
  if (page) return res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;font-family:sans-serif"><main style="height:1600px"><h1>Acme</h1></main>${page}</body></html>`);
  res.writeHead(404).end();
});
await new Promise<void>((r) => server.listen(0, r));
const origin = `http://localhost:${(server.address() as { port: number }).port}`;
const add = (path: string, html: string) => (pages.set(path, html), `${origin}${path}`);

const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  const desk = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const phone = await browser.newPage({ viewport: { width: 390, height: 780 } });
  const errors: string[] = [];
  for (const p of [desk, phone]) p.on("pageerror", (e) => errors.push(e.message));
  const host = (p: typeof desk) => p.locator("claritia-form");
  const box = (p: typeof desk) => host(p).locator(".pbox");
  const rect = (l: ReturnType<typeof box>) => l.boundingBox();

  // In the page
  await desk.goto(add("/inline", formEmbedCode(origin, FORM, { mode: "inline" })));
  await host(desk).locator(".f").first().waitFor();
  check((await host(desk).locator(".pop").count()) === 0, "in the page: the form is in the page, not over it");

  // Full page
  await desk.goto(add("/full", formEmbedCode(origin, FORM, { mode: "full" })));
  await host(desk).locator(".f").first().waitFor();
  check(((await host(desk).boundingBox())?.height ?? 0) >= 790, "full page: the form fills the window's height");

  // Popup, on click, in each size; Escape closes it and focus goes back
  const widths: number[] = [];
  for (const size of ["s", "m", "l"] as const) {
    await desk.goto(add(`/popup-${size}`, formEmbedCode(origin, FORM, { mode: "popup", opens: "click", size, text: "Talk to us" })));
    await desk.getByRole("button", { name: "Talk to us" }).waitFor();
    await desk.waitForTimeout(150);
    check(!(await box(desk).isVisible()), `popup ${size}: closed until the click`);
    await desk.getByRole("button", { name: "Talk to us" }).click();
    await box(desk).waitFor();
    widths.push((await rect(box(desk)))!.width);
  }
  check(widths[0]! < widths[1]! && widths[1]! < widths[2]!, `popup sizes grow: ${widths.map(Math.round).join(" < ")}`);
  await desk.keyboard.press("Escape");
  check(!(await box(desk).isVisible()), "popup: Escape closes it");
  check(await desk.getByRole("button", { name: "Talk to us" }).evaluate((b) => b === document.activeElement), "popup: focus goes back to the button that opened it");

  // Popup on a timer (the element reads any number of seconds)
  await desk.goto(add("/timer", formEmbedCode(origin, FORM, { mode: "popup", opens: "10", once: true }).replace("delay:10", "delay:1")));
  check(formEmbedCode(origin, FORM, { mode: "popup", opens: "10", once: true }).includes(`popup="delay:10" size="m" once`), "a timed popup's code has its seconds and once");
  await box(desk).waitFor({ timeout: 4000 });
  check(true, "popup: opens by itself after its seconds");

  // Slider from each side, full height
  for (const side of ["left", "right"] as const) {
    await desk.goto(add(`/slider-${side}`, formEmbedCode(origin, FORM, { mode: "slider", side, opens: "click", text: "Open" })));
    await desk.getByRole("button", { name: "Open" }).click();
    await box(desk).waitFor();
    await desk.waitForTimeout(400);
    const r = (await rect(box(desk)))!;
    check(r.height >= 790 && (side === "left" ? r.x <= 1 : Math.abs(r.x + r.width - 1280) <= 1), `slider from the ${side}: full height on that side`);
  }

  // Popover: a round button in the corner, its note, the form above it, and a close on the same button
  await desk.goto(add("/popover", formEmbedCode(origin, FORM, { mode: "popover", icon: "calendar", note: "Questions?" })));
  const fab = host(desk).locator(".lc.fab");
  await fab.waitFor();
  await desk.waitForTimeout(150);
  check(!(await box(desk).isVisible()), "popover: closed until the button is pressed");
  const f = (await fab.boundingBox())!;
  check(Math.abs(f.x + f.width - 1260) <= 2 && Math.abs(f.y + f.height - 780) <= 2 && Math.round(f.width) === 56, "popover: a round button in the bottom right corner");
  check((await host(desk).locator(".lc .nb").textContent()) === "Questions?", "popover: its note shows beside it");
  await fab.click();
  await box(desk).waitFor();
  const b = (await rect(box(desk)))!;
  check(b.y + b.height <= f.y && b.width <= 381, "popover: a small form opens above the button");
  check((await host(desk).locator(".lc.fab").getAttribute("aria-expanded")) === "true", "popover: the button says it's open");
  await host(desk).locator(".lc.fab").click();
  check(!(await box(desk).isVisible()), "popover: the same button closes it");

  // Side tab
  await desk.goto(add("/tab", formEmbedCode(origin, FORM, { mode: "sidetab", text: "Contact us" })));
  const tab = host(desk).locator(".lc.tab");
  await tab.waitFor();
  const t = (await tab.boundingBox())!;
  check(Math.abs(t.x + t.width - 1280) <= 1 && (await tab.textContent()) === "Contact us", "side tab: on the right edge with its words");
  await tab.click();
  await box(desk).waitFor();
  await desk.waitForTimeout(400);
  const s = (await rect(box(desk)))!;
  check(Math.abs(s.x + s.width - 1280) <= 1 && s.height >= 790, "side tab: opens the form from the right");

  // A Form Studio page over the page (it used to draw in the page whatever the code said)
  await desk.goto(add("/studio-popup", formEmbedCode(origin, PAGE, { mode: "popup", opens: "click", text: "Get started" })));
  await desk.getByRole("button", { name: "Get started" }).click();
  await box(desk).locator('input[name="email"]').waitFor();
  check(true, "a Form Studio page opens in a popup like every form");

  // Phones: full screen unless kept
  await phone.goto(add("/phone", formEmbedCode(origin, FORM, { mode: "popup", opens: "click", text: "Open", size: "s" })));
  await phone.getByRole("button", { name: "Open" }).click();
  await box(phone).waitFor();
  const pf = (await rect(box(phone)))!;
  check(Math.round(pf.width) === 390 && pf.height >= 770, "on a phone the popup fills the screen");
  await phone.goto(add("/phone-keep", formEmbedCode(origin, FORM, { mode: "popup", opens: "click", text: "Open", size: "s", phoneFull: false })));
  await phone.getByRole("button", { name: "Open" }).click();
  await box(phone).waitFor();
  check((await rect(box(phone)))!.width < 390, "full screen on phones off: the popup keeps its box");
  await phone.goto(add("/phone-popover", formEmbedCode(origin, FORM, { mode: "popover" })));
  await host(phone).locator(".lc.fab").click();
  await box(phone).waitFor();
  check(Math.round((await rect(box(phone)))!.width) === 390, "on a phone the popover fills the screen too");

  // The meeting calendar
  const book = (p: typeof desk) => p.locator('iframe[title="Book a meeting"]');
  await desk.goto(add("/book-inline", meetingEmbedCode(origin, "acme/demo", { mode: "inline" })));
  await book(desk).waitFor();
  check(((await book(desk).getAttribute("src")) ?? "").endsWith("/book/acme/demo?embed=1"), "meeting in the page: its booking page in a frame");
  await desk.goto(add("/book-button", meetingEmbedCode(origin, "acme/demo", { mode: "button", text: "Book a demo" })));
  await desk.getByRole("button", { name: "Book a demo" }).click();
  await desk.getByRole("dialog", { name: "Book a meeting" }).waitFor();
  check(true, "meeting floating button: opens the calendar over the page");
  await desk.keyboard.press("Escape");
  check((await desk.getByRole("dialog", { name: "Book a meeting" }).count()) === 0, "meeting popup: Escape closes it");
  await phone.goto(add("/book-link", meetingEmbedCode(origin, "acme/demo", { mode: "link", text: "Book a demo" })));
  await phone.getByRole("link", { name: "Book a demo" }).click();
  const dlg = phone.getByRole("dialog", { name: "Book a meeting" });
  await dlg.waitFor();
  check(Math.round((await dlg.boundingBox())!.width) === 390, "meeting from your own link: full screen on a phone");
  await phone.goto(add("/book-keep", meetingEmbedCode(origin, "acme/demo", { mode: "link", text: "Book a demo", phoneFull: false })));
  await phone.getByRole("link", { name: "Book a demo" }).click();
  await phone.getByRole("dialog", { name: "Book a meeting" }).waitFor();
  check((await phone.getByRole("dialog", { name: "Book a meeting" }).boundingBox())!.width < 390, "meeting with full screen off: keeps its box on a phone");

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
