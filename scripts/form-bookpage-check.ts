// The meeting's own booking page inside a live form (docs/ending-plan.md Part 4), in a real browser with the real
// forms/v1.js: after the send, the page from the reply shows in a frame under the thank-you and grows with it; a
// booking there fires claritia:booked; a page that says nothing within 10 seconds gives way to the form's own
// calendar with the same token; an address that isn't a booking page is never framed.
//   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/form-bookpage-check.ts
import { createServer } from "node:http";
import pw from "playwright-core";
import { checkForm, type Form } from "../src/lib/forms/schema.ts";
import { pageForm } from "../src/lib/studio/page.ts";
import { buildExtras, buildForms } from "./build-forms.mts";

const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  if (!ok) failures.push(what);
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};

const FORM = "11111111-1111-4111-8111-111111111111";
const r = checkForm(
  pageForm({
    html: `<form><label for="e">Work email</label><input id="e" name="email" type="email" required><button type="submit">Send</button></form><section data-cl-thanks hidden id="thanks" class="thanks"><span class="thanks-mark"></span><h2 class="heading" id="ty">Thanks, we got it</h2><p class="text">Pick a time below.</p><div data-cl-book id="book"></div></section>`,
    css: "",
    brand: "",
    after: { kind: "thanks" },
  }).form as Form,
);
if ("errors" in r) throw new Error(r.errors.join(" "));
const form = r.form;
const formsJs = await buildForms(await buildExtras());

let page = "";
const day = Date.now() + 86_400_000;
const slots = [0, 1, 2, 3].map((i) => Math.ceil(day / 1_800_000) * 1_800_000 + i * 1_800_000);
const server = createServer((req, res) => {
  const json = (b: unknown) => res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" }).end(JSON.stringify(b));
  const u = req.url ?? "";
  if (u.startsWith("/forms/v1.js")) return res.writeHead(200, { "content-type": "text/javascript" }).end(formsJs);
  if (u === `/api/forms/${FORM}`) return json({ id: FORM, version: 1, status: "live", body: form, tokens: {}, logo_url: null });
  if (u === `/api/forms/${FORM}/submit`) return json({ id: "s1", schedule: null, booking: { token: "tok", slots, lengths: [30], length: 30 }, ...(page ? { bookPage: page } : {}) });
  if (u.startsWith("/api/")) return json({});
  if (u === "/") return res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><body><claritia-form form-id="${FORM}" host="http://${req.headers.host}"></claritia-form><script src="/forms/v1.js" async></script><script>window.ev=[];document.addEventListener("claritia:booked",e=>ev.push(e.detail))</script></body>`);
  res.writeHead(404).end();
});
await new Promise<void>((ok) => server.listen(0, ok));
const origin = `http://localhost:${(server.address() as { port: number }).port}`;

// The booking site: "good" reports its height and books on a click; "silent" never says a thing.
const BOOK = `<!doctype html><body style="margin:0"><h1>Demo call</h1><button id="b">Book</button><script>
const tell = (m) => parent.postMessage({ claritia: true, ...m }, "*");
if (location.pathname.endsWith("/good")) { tell({ type: "book:height", height: 900 }); }
document.getElementById("b").onclick = () => tell({ type: "book:booked", start: ${slots[1]}, end: ${slots[1]! + 1_800_000} });
</script></body>`;

const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  const p = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors: string[] = [];
  p.on("pageerror", (e) => errors.push(e.message));
  const framed: string[] = [];
  await p.route("https://book.test/**", (x) => (framed.push(x.request().url()), x.fulfill({ status: 200, contentType: "text/html", body: BOOK })));
  // The booking site sends /book to the app (tryclaritia.com → app.tryclaritia.com): the frame then talks from there.
  await p.route("https://hop.test/**", (x) => x.fulfill({ status: 200, contentType: "text/html", body: `<script>location.replace(${JSON.stringify(x.request().url().replace("https://hop.test", "https://app.hop.test"))})</script>` }));
  await p.route("https://app.hop.test/**", (x) => (framed.push(x.request().url()), x.fulfill({ status: 200, contentType: "text/html", body: BOOK })));
  const send = async (bookPage: string) => {
    page = bookPage;
    framed.length = 0;
    await p.goto(origin);
    const f = p.locator("claritia-form");
    await f.locator("input[name=email]").fill("ana@acme.com");
    await f.locator("button[type=submit]").click();
    await f.locator("#ty").waitFor();
    return f;
  };

  // 1. The booking page, under the thank-you, growing with it.
  let f = await send("https://book.test/book/f/good");
  const frame = f.locator("[data-cl-book] iframe");
  await frame.waitFor();
  check((await frame.getAttribute("src")) === "https://book.test/book/f/good?embed=1", "the booking page from the reply, in embed mode");
  await p.waitForFunction(() => {
    const el = document.querySelector("claritia-form")?.shadowRoot?.querySelector<HTMLIFrameElement>("[data-cl-book] iframe") ?? document.querySelector<HTMLIFrameElement>("claritia-form [data-cl-book] iframe");
    return el?.style.height === "900px";
  }, null, { timeout: 5000 }).then(() => check(true, "the frame takes the page's height"), () => check(false, "the frame takes the page's height"));
  check(await f.locator("#ty").isVisible(), "the thank-you stays over it");
  check((await f.locator("[data-cl-book] .pl").count()) === 0, "the form's own calendar doesn't show");
  await p.frameLocator("claritia-form [data-cl-book] iframe").locator("#b").click();
  await p.waitForFunction(() => (window as unknown as { ev: unknown[] }).ev.length > 0, null, { timeout: 3000 }).catch(() => null);
  const ev = (await p.evaluate(() => (window as unknown as { ev: { start: number }[] }).ev)) as { start: number }[];
  check(ev.length === 1 && ev[0]!.start === slots[1], "a booking in the page fires claritia:booked once, with its start");
  await p.waitForTimeout(10_500);
  check((await f.locator("[data-cl-book] iframe").count()) === 1 && framed.length === 1, "a page that answered stays, loaded once");

  // 1b. A page that moves to the app's address still grows the frame.
  f = await send("https://hop.test/book/f/good");
  await f.locator("[data-cl-book] iframe").waitFor();
  await p.waitForFunction(() => document.querySelector("claritia-form")?.shadowRoot?.querySelector<HTMLIFrameElement>("[data-cl-book] iframe")?.style.height === "900px" || document.querySelector<HTMLIFrameElement>("claritia-form [data-cl-book] iframe")?.style.height === "900px", null, { timeout: 5000 }).then(() => check(true, "a page on the app's address grows the frame too"), () => check(false, "a page on the app's address grows the frame too"));

  // 2. A page that never answers: the form's own calendar, with the same times.
  f = await send("https://book.test/book/f/silent");
  await f.locator("[data-cl-book] iframe").waitFor();
  await f.locator("[data-cl-book] iframe").waitFor({ state: "detached", timeout: 12_000 }).catch(() => null);
  check((await f.locator("[data-cl-book] iframe").count()) === 0, "a silent page gives way after 10 seconds");
  check((await f.locator("[data-cl-book] .pl, [data-cl-book] .cl-cal").count()) > 0, "the form's own calendar shows in its place");

  // 3. Addresses that aren't a booking page are never framed.
  for (const bad of ["http://book.test/book/f/good", "https://book.test/somewhere/else", "javascript:alert(1)"]) {
    f = await send(bad);
    await p.waitForTimeout(300);
    check((await f.locator("[data-cl-book] iframe").count()) === 0 && (await f.locator("[data-cl-book] .pl, [data-cl-book] .cl-cal").count()) > 0, `not framed: ${bad}`);
  }
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
} finally {
  await browser.close();
  server.close();
}
console.log(failures.length ? `\n${failures.length} failed` : "\nall passed");
process.exit(failures.length ? 1 : 0);
