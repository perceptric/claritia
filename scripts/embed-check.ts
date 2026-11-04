// Every way a form and a meeting go on a website (docs/sharing-plan.md), in a real browser, with the code Share writes
// (src/lib/share/embed.ts) and the real forms/v1.js: in the page, full page, popup (sizes, timed), slider (both sides),
// popover, side tab, a Form Studio page over the page, full screen on a phone unless kept, Escape and focus; and the
// meeting calendar in the page, from a floating button and from the site's own link. A small server stands in for the
// form's read and the booking page.
//   CHROMIUM_PATH=… node scripts/embed-check.ts
import { createServer } from "node:http";
import { build } from "esbuild";
import pw from "playwright-core";
import { checkForm, emptyForm, type Form } from "../src/lib/forms/schema.ts";
import { formEmbedCode, meetingEmbedCode } from "../src/lib/share/embed.ts";
import { studioForm } from "../src/lib/studio/liveForm.ts";
import { pageForm } from "../src/lib/studio/page.ts";
import { styleCssById } from "../src/lib/studio/styleCss.ts";
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
// Two steps, the first only a pick list (an answer clicked in an email moves on), and a studio page with one.
const STEPS = "33333333-3333-4333-8333-333333333333";
const PAGE2 = "44444444-4444-4444-8444-444444444444";
const twoSteps = (() => {
  const base = emptyForm();
  const email = base.steps.flatMap((x) => x.fields).find((x) => x.key === "email")!;
  return ready({ ...base, steps: [{ id: "s1", fields: [{ id: "plan", key: "q.plan", type: "choice", label: "Which plan?", required: true, options: [{ value: "team", label: "Team" }, { value: "ent", label: "Enterprise" }] }] }, { id: "s2", fields: [email] }] } as Form);
})();
const studioPick = ready(
  pageForm({ html: `<form><fieldset><legend>Which plan?</legend><label><input type="radio" name="plan" value="team"> Team</label><label><input type="radio" name="plan" value="ent"> Enterprise</label></fieldset><label for="e">Email</label><input id="e" name="email" type="email" required><button type="submit">Send</button></form><section data-cl-thanks hidden><h2>Thanks</h2></section>`, css: "", brand: "", after: { kind: "thanks" } }).form,
);
// A form in a gallery style, as the Studio makes it, for a site box that sizes to fit what's in it (Framer's Fit).
const STYLED = "55555555-5555-4555-8555-555555555555";
const SHUT = "66666666-6666-4666-8666-666666666666";
// A page made with the no-code builder: a length limit, a most-picks limit, an answer in a heading, and a jump.
const BUILT = "77777777-7777-4777-8777-777777777777";
const built = ready(
  pageForm({
    html: `<form><section data-cl-step id="page-1"><h2 class="heading" id="hi" data-cl-pipe="Hi {first}">Hi {first}</h2><div class="q"><label class="label" for="q_first">First name</label><input class="field" id="q_first" name="first" type="text" minlength="3"><p class="error" data-cl-error-for="first"></p></div><fieldset class="q" data-cl-limit="1"><legend class="label">Tools</legend><div class="choices" data-cl-shuffle><label class="choice"><input type="checkbox" name="tools" value="a" data-cl-label="Tools"> A</label><label class="choice"><input type="checkbox" name="tools" value="b"> B</label></div><p class="error" data-cl-error-for="tools"></p></fieldset><fieldset class="q" data-cl-jump="big=>page-3"><legend class="label">Size</legend><div class="choices"><label class="choice"><input type="radio" name="size" value="small" data-cl-label="Size"> Small</label><label class="choice"><input type="radio" name="size" value="big"> Big</label></div></fieldset><button type="button" data-cl-next>Next</button></section><section data-cl-step id="page-2" data-cl-show-if="size != 'big'"><p class="text" id="two">Page two</p><button type="button" data-cl-next>Next</button></section><section data-cl-step id="page-3"><label for="q_email">Email</label><input id="q_email" name="email" type="email"><button type="submit">Send</button></section><section data-cl-thanks hidden><h2 data-cl-pipe="Thanks, {first}!">Thanks</h2></section></form>`,
    css: "",
    brand: "",
    after: { kind: "thanks" },
  }).form,
);
const styled = (() => {
  const r = studioForm(plain, styleCssById("grove"));
  if ("error" in r) throw new Error(r.error);
  return r.form;
})();
const formsJs = await buildForms();
// The npm package's React components, bundled the way a site's build would (packages/embed).
const reactJs = (
  await build({
    stdin: {
      contents: `import { createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { ClaritiaForm, ClaritiaBook } from "./packages/embed/src/react.tsx";
const ev = (window.reactEvents = []);
createRoot(document.getElementById("root")).render(h("div", null,
  h(ClaritiaForm, { id: "${FORM}", mode: "popup", size: "s", buttonText: "React popup", host: location.origin, onReady: () => ev.push("ready"), onOpen: () => ev.push("open"), onClose: () => ev.push("close") }),
  h(ClaritiaBook, { type: "acme/demo", host: location.origin })));`,
      resolveDir: new URL("..", import.meta.url).pathname,
      loader: "tsx",
    },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "error",
  })
).outputFiles[0]!.text;

const pages = new Map<string, string>();
const server = createServer((req, res) => {
  const json = (b: unknown) => res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" }).end(JSON.stringify(b));
  const u = req.url ?? "";
  if (u.startsWith("/forms/v1.js")) return res.writeHead(200, { "content-type": "text/javascript" }).end(formsJs);
  if (u === "/react.js") return res.writeHead(200, { "content-type": "text/javascript" }).end(reactJs);
  if (u === `/api/forms/${STEPS}/submit`) return json({ id: "s1" });
  if (u === `/api/forms/${FORM}`) return json({ id: FORM, version: 1, status: "live", body: plain, tokens: {}, logo_url: null });
  if (u === `/api/forms/${PAGE}`) return json({ id: PAGE, version: 1, status: "live", body: studio, tokens: {}, logo_url: null });
  if (u === `/api/forms/${STEPS}`) return json({ id: STEPS, version: 1, status: "live", body: twoSteps, tokens: {}, logo_url: null });
  if (u === `/api/forms/${PAGE2}`) return json({ id: PAGE2, version: 1, status: "live", body: studioPick, tokens: {}, logo_url: null });
  if (u === `/api/forms/${BUILT}`) return json({ id: BUILT, version: 1, status: "live", body: built, logo_url: null });
  if (u === `/api/forms/${SHUT}`) return json({ id: SHUT, version: 1, status: "paused", closed: "Sign-ups are closed for this year.", body: styled, logo_url: null });
  if (u === `/api/forms/${STYLED}`) return json({ id: STYLED, version: 1, status: "live", body: styled, logo_url: null });
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

  // In a box that sizes to fit what's in it (Framer's Fit, an inline block, a flex row): the form keeps a real width
  for (const [name, wrap] of [["fit content", "width:fit-content"], ["inline block", "display:inline-block"], ["flex row", "display:flex"]] as const) {
    await desk.goto(add(`/fit-${name.replace(" ", "-")}`, `<div style="${wrap}"><div>${formEmbedCode(origin, STYLED, { mode: "inline" }).replace("<claritia-form", '<claritia-form style="flex:none"')}</div></div>`));
    await host(desk).locator(".cl-root form").waitFor();
    const w = (await host(desk).boundingBox())?.width ?? 0;
    check(w >= 560, `in a box set to ${name}: the form keeps its width (${Math.round(w)}px)`);
  }
  await phone.goto(add("/fit-phone", `<div style="width:fit-content">${formEmbedCode(origin, STYLED, { mode: "inline" })}</div>`));
  await host(phone).locator(".cl-root form").waitFor();
  const pw2 = (await host(phone).boundingBox())?.width ?? 0;
  check(pw2 <= 390 && pw2 >= 300, `in a fit box on a phone: the form fits the screen (${Math.round(pw2)}px)`);

  // Made with the no-code builder: its limits, the answer in the heading and the jump run on the live form
  await desk.goto(add("/built", formEmbedCode(origin, BUILT, { mode: "inline" })));
  const bf = host(desk);
  await bf.locator("input[name='first']").waitFor();
  await bf.locator("input[name='first']").fill("Al");
  await bf.locator("[data-cl-next]").first().click();
  check(((await bf.locator('[data-cl-error-for="first"]').textContent()) ?? "").includes("at least 3"), "built: a length limit stops the next page");
  await bf.locator("input[name='first']").fill("Alex");
  check(((await bf.locator("#hi").textContent()) ?? "") === "Hi Alex", "built: the heading shows the typed name");
  await bf.locator("input[value='a']").check();
  await bf.locator("input[value='b']").check();
  await bf.locator("[data-cl-next]").first().click();
  check(((await bf.locator('[data-cl-error-for="tools"]').textContent()) ?? "").includes("Pick up to 1"), "built: the most picks stops the next page");
  await bf.locator("input[value='b']").uncheck();
  await bf.locator("input[value='big']").check();
  await bf.locator("[data-cl-next]").first().click();
  check((await bf.locator("input[name='email']").isVisible()) && !(await bf.locator("#two").isVisible()), "built: Big jumps past page two");

  // Closed by Settings › Access: the form's own closed message in place of the form
  await desk.goto(add("/shut", formEmbedCode(origin, SHUT, { mode: "inline" })));
  await host(desk).locator(".f").first().waitFor();
  check(((await host(desk).locator(".f").first().textContent()) ?? "").includes("Sign-ups are closed for this year.") && (await host(desk).locator("form").count()) === 0, "closed: the form's closed message shows, with no form");

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

  // An answer clicked in an email: filled in, past the first step; a deleted answer opens the form as it is
  await desk.goto(`${add("/answer", formEmbedCode(origin, STEPS, { mode: "inline" }))}?clr_a=plan%3Aent`);
  await host(desk).locator('input[type="email"]').waitFor();
  check(true, "an email's answer fills the first question and moves on to the next");
  await desk.goto(`${add("/answer-gone", formEmbedCode(origin, STEPS, { mode: "inline" }))}?clr_a=plan%3Agone`);
  await host(desk).locator('input[value="team"]').waitFor();
  check((await host(desk).locator('input[type="email"]').count()) === 0 && !(await host(desk).locator('input[value="ent"]').isChecked()), "an answer deleted since the email opens the form at its first question");
  const studioId = Object.entries(studioPick.page!.ids).find(([n]) => n === "plan")![1];
  await desk.goto(`${add("/answer-studio", formEmbedCode(origin, PAGE2, { mode: "inline" }))}?clr_a=${encodeURIComponent(`${studioId}:ent`)}`);
  await host(desk).locator('input[name="plan"][value="ent"]').waitFor();
  await desk.waitForTimeout(100);
  check(await host(desk).locator('input[name="plan"][value="ent"]').isChecked(), "a Form Studio page checks the email's answer");

  // window.Claritia: open a form with no element on the page, close it, a meeting's calendar, and the events
  await desk.goto(add("/api", `<script src="${origin}/forms/v1.js" async></script>`));
  await desk.waitForFunction(() => (window as unknown as { Claritia?: { version: number } }).Claritia?.version === 1);
  await desk.evaluate(() => {
    const w = window as unknown as { seen: string[]; Claritia: { on: (e: string, f: (d: Record<string, unknown>) => void) => void } };
    w.seen = [];
    for (const e of ["ready", "step", "open", "close", "submitted"]) w.Claritia.on(e, (d) => w.seen.push(`${e}:${d.formId ?? ""}${d.step !== undefined ? `:${d.step}` : ""}${d.submissionId ? `:${d.submissionId}` : ""}`));
  });
  await desk.evaluate((id) => (window as unknown as { Claritia: { open: (id: string, o: object) => void } }).Claritia.open(id, { prefill: { plan: "ent" } }), STEPS);
  await box(desk).waitFor();
  check(true, "Claritia.open() makes a popup for a form that isn't on the page");
  check(await host(desk).locator('input[value="ent"]').isChecked(), "Claritia.open() fills what it's given");
  await host(desk).locator("button", { hasText: /next/i }).first().click();
  await host(desk).locator('input[type="email"]').fill("dana@acme.com");
  await host(desk).locator('button[type="submit"]').click();
  await desk.waitForFunction(() => (window as unknown as { seen: string[] }).seen.some((x) => x.startsWith("submitted")));
  const seen = await desk.evaluate(() => (window as unknown as { seen: string[] }).seen);
  check(seen.indexOf(`ready:${STEPS}`) < seen.indexOf(`step:${STEPS}:0`), "ready comes before the first step");
  check(seen.includes(`open:${STEPS}`) && seen.includes(`ready:${STEPS}`) && seen.includes(`step:${STEPS}:1`) && seen.includes(`submitted:${STEPS}:s1`), `events: ready, open, step and submitted with their details (${seen.join(", ")})`);
  await desk.evaluate(() => (window as unknown as { Claritia: { close: () => void } }).Claritia.close());
  check(!(await box(desk).isVisible()) && (await desk.evaluate(() => (window as unknown as { seen: string[] }).seen.includes(`close:${"" + document.querySelector("claritia-form")!.getAttribute("form-id")}`))), "Claritia.close() closes it, with a close event");
  await desk.evaluate(() => (window as unknown as { Claritia: { open: (t: string) => void } }).Claritia.open("acme/demo"));
  await desk.getByRole("dialog", { name: "Book a meeting" }).waitFor();
  await desk.evaluate(() => (window as unknown as { Claritia: { close: () => void } }).Claritia.close());
  check((await desk.getByRole("dialog", { name: "Book a meeting" }).count()) === 0, "Claritia.open() and close() a meeting's calendar");

  // Calls made before the script loads run once it's there
  await desk.goto(add("/queue", `<script>window.Claritia = { q: [["prefill", { email: "early@acme.com" }]] };</script>${formEmbedCode(origin, FORM, { mode: "inline" })}`));
  await host(desk).locator('input[type="email"]').waitFor();
  await desk.waitForFunction(() => (document.querySelector("claritia-form")!.shadowRoot!.querySelector('input[type="email"]') as HTMLInputElement).value === "early@acme.com", null, { timeout: 4000 });
  check(true, "a prefill queued before the script loads fills the form once it's there");

  // The npm package's React components
  await desk.goto(add("/react", `<div id="root"></div><script src="/react.js"></script>`));
  await desk.getByRole("button", { name: "React popup" }).click();
  await box(desk).waitFor();
  await desk.keyboard.press("Escape");
  await desk.waitForFunction(() => (window as unknown as { reactEvents: string[] }).reactEvents.includes("close"));
  check(true, "<ClaritiaForm> loads the script, opens from its button, and its onOpen and onClose run");
  check(((await desk.locator('iframe[title="Book a meeting"]').getAttribute("src")) ?? "").endsWith("/book/acme/demo?embed=1"), "<ClaritiaBook> draws the meeting's calendar");
  check((await desk.locator('script[src$="/forms/v1.js"]').count()) === 1, "the script loads once for both");

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
