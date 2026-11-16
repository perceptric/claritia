// Forms right from the start (docs/studio-v2-plan.md Part 16), as visitors get them, in a real browser with the real
// forms/v1.js and the page /api/forms/<id> hands out (src/lib/studio/guard.ts servedForm):
// - a form made wrong on purpose (fixed calendar cells, two fields side by side, a pale eyebrow, fonts that aren't the
//   brand's, radios removed with display:none, its own dropdown arrow), after the Studio's tune, has nothing for the
//   form check's measure at 390, 768 and 1100px (no sideways scroll, nothing hard to read, cut off, too small, out of
//   the keyboard's reach or in another font), and one arrow on its dropdown;
// - a form in a card, inline on a plain white page: the element's box is transparent with no page padding (only the
//   card shows), while the form's own page (/f/<id>) keeps its color;
// - a focused text field and a focused dropdown show one line each, never a border plus a ring with a gap, in a brand
//   that draws its own focus, one that draws none and a gallery style.
//   CHROMIUM_PATH=… node scripts/guard-check.ts   (SHOTS=dir saves screenshots)
import { createServer } from "node:http";
import { build } from "esbuild";
import pw from "playwright-core";
import { checkForm, type Form } from "../src/lib/forms/schema.ts";
import { hostedFormHtml } from "../src/lib/forms/hosted.ts";
import { DEFAULT_BRAND_CSS } from "../src/lib/studio/brandDefault.ts";
import { servedForm } from "../src/lib/studio/guard.ts";
import { pageForm } from "../src/lib/studio/page.ts";
import { styleCssById } from "../src/lib/studio/styleCss.ts";
import { buildExtras, buildForms } from "./build-forms.mts";
import { BAD_CSS, BAD_HTML } from "./studio/badForm.ts";

const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  if (!ok) failures.push(what);
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};
const shots = process.env.SHOTS;
const root = new URL("..", import.meta.url).pathname;
const ready = (f: Record<string, unknown>) => {
  const r = checkForm(f);
  if ("errors" in r) throw new Error(r.errors.join(" "));
  return r.form;
};
const page = (html: string, css: string, brand: string) => ready(pageForm({ html, css, brand, after: { kind: "thanks" } }).form);

// A form in a card on a gray page, with the page's color on body too (as Tia writes them): a text field, a dropdown
// and two choice cards.
const CARD_HTML = `<div class="page" id="page"><div class="form-card" id="card"><h1 class="heading" id="t">Talk to us</h1><form id="f">
<div class="q"><label class="label" for="nm">Name</label><input class="field" id="nm" name="name" required></div>
<div class="q"><label class="label" for="em">Email</label><input class="field" id="em" name="email" type="email" required></div>
<div class="q"><label class="label" for="ind">Industry</label><select class="field" id="ind" name="industry"><option value="">Choose one</option><option value="saas">SaaS</option><option value="retail">Retail</option></select></div>
<fieldset class="q"><legend class="label">Size</legend><div class="choices"><label class="choice"><input type="radio" name="size" value="s"> Small</label><label class="choice"><input type="radio" name="size" value="l"> Large</label></div></fieldset>
<button type="submit" class="btn" id="send">Send</button></form><section data-cl-thanks hidden id="thanks"><h2 class="heading">Thanks</h2></section></div></div>`;
const CARD_CSS = `body{background:#ececec;padding:40px;margin:0}
.page{background:#f3f3f3;padding:48px 24px}
.form-card{max-width:560px;margin-inline:auto;background:#ffffff;border-radius:12px;padding:24px;display:flex;flex-direction:column;gap:14px}
.form-card form{display:flex;flex-direction:column;gap:14px}.q{display:flex;flex-direction:column;gap:6px;border:0;padding:0;margin:0}.choices{display:grid;gap:8px}`;
// A brand that draws no focus of its own.
const BARE_BRAND = `:root{--brand-primary:#1d4ed8;--brand-text:#111111;--brand-muted:#555555;--brand-bg:#ffffff;--brand-surface:#ffffff;--brand-line:#bbbbbb;--brand-font:system-ui,sans-serif}
.page{font-family:var(--brand-font);color:var(--brand-text)}.label{font-size:14px;font-weight:500}
.field{box-sizing:border-box;width:100%;min-height:44px;padding:0 12px;font:inherit;border:1px solid var(--brand-line);border-radius:8px;background:#fff;outline:none}
.choice{display:flex;gap:8px;align-items:center;min-height:44px;padding:0 12px;border:1px solid var(--brand-line);border-radius:8px}
.btn{min-height:44px;padding:0 20px;border:0;border-radius:999px;background:var(--brand-primary);color:#fff;font:inherit}`;

const FORMS: Record<string, { raw: Form; served: Form; brand: string; css: string }> = {};
const add = (id: string, f: Form) => (FORMS[id] = { raw: f, served: servedForm(f), brand: f.page!.brand, css: f.page!.css });
const RAW = "10000000-0000-4000-8000-000000000001", BAD = "10000000-0000-4000-8000-000000000002";
const CARD = "10000000-0000-4000-8000-000000000003", BARE = "10000000-0000-4000-8000-000000000004", STYLE = "10000000-0000-4000-8000-000000000005";
add(CARD, page(CARD_HTML, CARD_CSS, DEFAULT_BRAND_CSS));
add(BARE, page(CARD_HTML, CARD_CSS, BARE_BRAND));
add(STYLE, page(CARD_HTML, "", styleCssById("midnight")));

const x1 = await buildExtras();
const v1 = await buildForms(x1);
const entry = (await build({ entryPoints: [`${root}scripts/studio/guard-entry.ts`], bundle: true, write: false, format: "esm", logLevel: "error" })).outputFiles[0]!.contents;
const plainPage = (id: string) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><script src="/forms/v1.js"></script><script type="module" src="/guard.js"></script></head><body style="margin:0;background:#ffffff;font:16px system-ui"><p style="margin:16px">A plain page on someone's site.</p><claritia-form form-id="${id}"></claritia-form></body></html>`;
const server = createServer((req, res) => {
  const u = req.url ?? "";
  const json = (b: unknown) => res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" }).end(JSON.stringify(b));
  if (u.startsWith("/forms/v1.js")) return void res.writeHead(200, { "content-type": "text/javascript" }).end(v1);
  if (u.startsWith("/forms/x1.js")) return void res.writeHead(200, { "content-type": "text/javascript" }).end(x1);
  if (u === "/guard.js") return void res.writeHead(200, { "content-type": "text/javascript" }).end(entry);
  if (u === "/tune") return void res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><script type="module" src="/guard.js"></script></body></html>`);
  const m = /^\/(plain|f)\/([\w-]+)$/.exec(u);
  if (m) return void res.writeHead(200, { "content-type": "text/html" }).end(m[1] === "f" ? hostedFormHtml(m[2]!, { framed: false, script: "/forms/v1.js" }).replace("</head>", `<script type="module" src="/guard.js"></script></head>`) : plainPage(m[2]!));
  const a = /^\/api\/forms\/([\w-]+)$/.exec(u);
  // As /api/forms/<id> answers: guarded, except the form shown as it was before the guard.
  if (a && FORMS[a[1]!]) return json({ id: a[1], version: 1, status: "live", body: a[1] === RAW ? FORMS[a[1]!]!.raw : FORMS[a[1]!]!.served, logo_url: null });
  if (/^\/api\/forms\/[\w-]+\/seen/.test(u)) return json({});
  res.writeHead(404).end();
});
await new Promise<void>((r) => server.listen(0, r));
const base = `http://localhost:${(server.address() as { port: number }).port}`;
const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors: string[] = [];
type Found = { text: string };

try {
  // ── The bad form: the Studio's tune at author time, then what visitors get ──
  const tp = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  tp.on("pageerror", (e) => errors.push(`tune: ${e.message}`));
  await tp.goto(`${base}/tune`);
  await tp.waitForFunction(() => typeof (window as unknown as { tunePage?: unknown }).tunePage === "function");
  const tuned = await tp.evaluate((p) => (window as unknown as { tunePage: (p: unknown) => Promise<{ css: string; rules: number }> }).tunePage(p), { id: "bad", html: BAD_HTML, css: BAD_CSS, brand: DEFAULT_BRAND_CSS });
  await tp.close();
  check(tuned.rules > 0 && !/Lobster|Pacifico/.test(tuned.css), `the tune makes the pale eyebrow readable (${tuned.rules} rule) and puts the brand's fonts back`);
  add(RAW, page(BAD_HTML, BAD_CSS, DEFAULT_BRAND_CSS));
  add(BAD, page(BAD_HTML, tuned.css, DEFAULT_BRAND_CSS));

  for (const w of [390, 768, 1100]) {
    const p = await browser.newPage({ viewport: { width: w, height: 900 } });
    p.on("pageerror", (e) => errors.push(`${w}: ${e.message}`));
    for (const id of [RAW, BAD]) {
      await p.goto(`${base}/plain/${id}`);
      await p.locator("claritia-form #fn").waitFor();
      await p.waitForFunction(() => typeof (window as unknown as { measureLive?: unknown }).measureLive === "function");
      await p.waitForTimeout(500);
      const found = await p.evaluate(({ brand, css }) => (window as unknown as { measureLive: (b: string, c: string) => Found[] }).measureLive(brand, css), { brand: FORMS[id]!.brand, css: FORMS[id]!.css });
      if (id === RAW) {
        if (w === 390) check(found.length > 0, `before the guard, the bad form has problems at 390px: ${found.map((f) => f.text).join("; ")}`);
        if (shots && w === 390) await p.screenshot({ path: `${shots}/bad-before-390.png`, fullPage: true });
        continue;
      }
      check(found.length === 0, `the bad form has nothing for the form check at ${w}px${found.length ? `: ${found.map((f) => f.text).join("; ")}` : ""}`);
      const f = p.locator("claritia-form");
      const look = await f.evaluate((host) => {
        const r = host.shadowRoot!;
        const pick = r.querySelector(".cl-pick") as HTMLElement | null;
        const radio = r.querySelector('input[name="size"]') as HTMLInputElement;
        const parent = pick?.parentElement;
        const drawn = parent ? [getComputedStyle(parent, "::after").content, getComputedStyle(parent, "::before").content].filter((c) => c && c !== "none" && c !== "normal").length : -1;
        return { svgs: pick?.querySelectorAll("svg").length ?? 0, bg: pick ? getComputedStyle(pick).backgroundImage : "", drawn, radio: getComputedStyle(radio).display !== "none" && getComputedStyle(radio).visibility !== "hidden", wide: document.documentElement.scrollWidth };
      });
      check(look.svgs === 1 && look.bg === "none" && look.drawn === 0, `at ${w}px the dropdown has one arrow`);
      check(look.radio, `at ${w}px the radios a design removed are there for the keyboard`);
      check(look.wide <= w, `at ${w}px the page doesn't scroll sideways (${look.wide}px)`);
      if (shots && w === 390) await p.screenshot({ path: `${shots}/bad-after-390.png`, fullPage: true });
    }
    await p.close();
  }

  // ── Embedded on a plain white page: only the card shows; the form's own page keeps its color ──
  const ep = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  ep.on("pageerror", (e) => errors.push(`embed: ${e.message}`));
  await ep.goto(`${base}/plain/${CARD}`);
  await ep.locator("claritia-form #nm").waitFor();
  const box = async (pg: typeof ep) =>
    pg.locator("claritia-form").evaluate((host) => {
      const hs = getComputedStyle(host), pageEl = host.shadowRoot!.querySelector(".page") as HTMLElement, ps = getComputedStyle(pageEl), card = getComputedStyle(host.shadowRoot!.querySelector(".form-card")!);
      return { host: hs.backgroundColor, hostPad: hs.paddingTop, page: ps.backgroundColor, pagePad: ps.paddingTop, card: card.backgroundColor };
    });
  const emb = await box(ep);
  check(emb.host === "rgba(0, 0, 0, 0)" && emb.hostPad === "0px", `inline on a white page the form's box is transparent with no padding (${emb.host}, ${emb.hostPad})`);
  check(emb.page === "rgba(0, 0, 0, 0)" && emb.pagePad === "0px" && emb.card === "rgb(255, 255, 255)", `only the card shows: no page color or padding around it (${JSON.stringify(emb)})`);

  // One line on a focused field and a focused dropdown, in each brand.
  const ring = (pg: typeof ep, sel: string) =>
    pg.locator(`claritia-form ${sel}`).evaluate((el) => {
      const cs = getComputedStyle(el);
      const outline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
      const shadow = cs.boxShadow !== "none";
      return { outline, offset: parseFloat(cs.outlineOffset) || 0, shadow, border: cs.borderTopColor, focused: el.matches(":focus-visible") };
    });
  for (const [id, name] of [[CARD, "a brand that draws its own focus"], [BARE, "a brand that draws none"], [STYLE, "a gallery style"]] as const) {
    if (id !== CARD) {
      await ep.goto(`${base}/plain/${id}`);
      await ep.locator("claritia-form #nm").waitFor();
    }
    const rest = await ring(ep, "#nm");
    await ep.locator("body").click({ position: { x: 5, y: 5 } });
    await ep.keyboard.press("Tab");
    const field = await ring(ep, "#nm");
    const one = (r: typeof field) => r.focused && !(r.outline && r.shadow) && (!r.outline || r.offset <= 0) && (r.outline || r.shadow || r.border !== rest.border);
    check(one(field), `${name}: a focused text field shows one line (${JSON.stringify(field)})`);
    if (shots && id === CARD) await ep.screenshot({ path: `${shots}/embed-white-focus.png` });
    await ep.keyboard.press("Tab");
    await ep.keyboard.press("Tab");
    const pick = await ring(ep, ".cl-pick");
    check(one(pick), `${name}: a focused dropdown shows one line (${JSON.stringify(pick)})`);
    await ep.keyboard.press("Tab");
    const choice = await ep.locator("claritia-form label.choice").first().evaluate((l) => {
      const cs = getComputedStyle(l), input = getComputedStyle(l.querySelector("input")!);
      return { card: (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none", offset: parseFloat(cs.outlineOffset) || 0, input: input.outlineStyle !== "none" && parseFloat(input.outlineWidth) > 0, focused: !!l.querySelector("input:focus-visible") };
    });
    check(choice.focused && choice.card && !choice.input && choice.offset <= 0, `${name}: a focused choice card shows one ring and its radio none (${JSON.stringify(choice)})`);
  }
  await ep.close();

  const hp = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  hp.on("pageerror", (e) => errors.push(`hosted: ${e.message}`));
  await hp.goto(`${base}/f/${CARD}`);
  await hp.locator("claritia-form #nm").waitFor();
  const own = await box(hp);
  check(own.host === "rgb(236, 236, 236)" && own.page === "rgb(243, 243, 243)", `the form's own page keeps its colors (${own.host}, ${own.page})`);
  await hp.close();
  check(!errors.length, `no page errors${errors.length ? `: ${errors.join("; ")}` : ""}`);
} finally {
  await browser.close();
  server.close();
}
if (failures.length) {
  console.log(`\n${failures.length} failed`);
  process.exit(1);
}
console.log("\nall passed");
