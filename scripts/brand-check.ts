// The brand scan in a real browser (docs/form-builder.md Part 12) against small sites served here: a light site with
// a contact page, a dark site with CSS variables and a pill button, a site with unreadable colors, and a bot wall.
// The tokens must match what the sites draw, colors must pass contrast, and the wall must be reported, not guessed.
//   CHROMIUM_PATH=… node scripts/brand-check.ts

import { createServer } from "node:http";
import { contrast } from "../src/lib/forms/brand.ts";
import { scanSite, ScanBlocked } from "../src/lib/brand/scan.ts";
import { brandDesign } from "../src/lib/brand/design.ts";

const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  if (!ok) failures.push(what);
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};

const page = (body: string, style: string) => `<!doctype html><html><head><meta charset="utf-8"><title>Site</title><style>${style}</style></head><body>${body}</body></html>`;
const SITES: Record<string, string> = {
  "/light/": page(
    `<header><img src="https://cdn.example.com/acme-logo.svg" alt="Acme logo"><a href="/light/pricing">Pricing</a> <a href="/light/contact">Contact sales</a></header>
     <main><h1>Ship faster</h1><p>Acme helps teams ship faster with fewer meetings and clearer plans, every single week of the year.</p>
     <a class="btn" href="/light/contact">Book a demo</a> <a class="ghost" href="/light/docs">Docs</a><p><small class="muted">Trusted by 2,000 teams</small></p>
     <h2>Why teams switch</h2><section class="band"><div class="card"><h3>Plans</h3><p>Clear plans for every team, every week.</p></div></section></main>
     <footer><a href="https://www.linkedin.com/company/acme">LinkedIn</a> <a href="https://x.com/acme?ref=site">X</a><p>Acme Inc.</p><p>500 Market Street, Suite 2, San Francisco, CA 94105</p></footer>`,
    `body{font-family:"Helvetica Neue",Arial,sans-serif;font-size:16px;color:#222222;background:#ffffff}
     .btn{display:inline-block;background:#2563eb;color:#fff;border-radius:4px;padding:10px 18px;font-weight:600;text-decoration:none}
     .ghost{color:#2563eb}.muted{color:#6b7280}h1{font-size:44px;font-weight:700}h2{font-size:30px}h3{font-size:20px}
     .band{background:#0f766e;padding:40px;width:1100px;height:400px}.card{background:#fff;box-shadow:0 4px 12px rgba(0, 0, 0, 0.12);padding:20px;width:400px}`,
  ),
  "/light/contact": page(
    `<h1>Talk to sales</h1><p>Tell us a little about your team and we will get back to you within one business day.</p>
     <form><label for="e">Work email</label><input id="e" type="email"><label for="c">Company</label><input id="c" type="text">
     <label for="m">Message</label><textarea id="m"></textarea><button type="submit" class="btn">Talk to sales</button></form>`,
    `body{font-family:"Helvetica Neue",Arial,sans-serif;font-size:16px;color:#222222;background:#ffffff}
     form{display:flex;flex-direction:column;width:420px}label{font-size:14px;font-weight:500;margin-top:16px;margin-bottom:6px;display:block}
     input,textarea{height:40px;border:1px solid #d1d5db;border-radius:4px;background:#fff;padding:0 10px}
     .btn{margin-top:20px;background:#2563eb;color:#fff;border:0;border-radius:4px;padding:10px 18px;font-weight:600}`,
  ),
  "/dark/": page(
    `<main><h1>Night mode, all day</h1><p>We build tools for people who work late and want their screens to stay calm and easy on the eyes.</p>
     <button class="cta">Get started</button><form><input type="email" placeholder="you@company.com"><button class="cta">Join</button></form></main>`,
    `:root{--brand:#ff5a1f;--danger:#ff4d4f}body{font-family:Georgia,serif;font-size:17px;color:#e5e5e5;background:#0b0b0f}
     .cta{background:var(--brand);color:#000;border:0;border-radius:999px;padding:12px 20px;text-transform:uppercase;font-weight:700}
     input{height:44px;border:2px solid #333;border-radius:999px;background:#16161c;color:#fff;padding:0 16px}`,
  ),
  "/faint/": page(
    `<p>This site has very light gray text that is hard to read on a white background for most people.</p><button class="b">Start now</button>`,
    `body{font-family:Arial;color:#cccccc;background:#fff}.b{background:#ffee00;color:#fff;border:0;border-radius:6px;padding:10px}`,
  ),
  "/wall/": page(`<h1>Just a moment...</h1><p>Checking if the site connection is secure</p>`, `body{font-family:Arial}`),
};
const server = createServer((req, res) => {
  const html = SITES[req.url ?? ""];
  if (!html) return void res.writeHead(404).end("not found");
  res.writeHead(req.url === "/wall/" ? 503 : 200, { "content-type": "text/html" }).end(html);
});
await new Promise<void>((r) => server.listen(0, r));
const base = `http://localhost:${(server.address() as { port: number }).port}`;
const opts = { chromiumPath: process.env.CHROMIUM_PATH, allowPrivate: true };

try {
  const light = await scanSite(`${base}/light/`, opts);
  // Brand setup (docs/design-system.md Part 7.1): beyond the tokens.
  const b = light.brand;
  const bd = brandDesign(b, light.tokens, ["Deep teal"]);
  check(bd.variables.some((v) => v.id === "brand-1" && v.value === "#0f766e" && v.name === "Deep teal"), `light: the band's teal is the first brand color (${JSON.stringify(bd.variables.filter((v) => v.kind === "color"))})`);
  check(!bd.variables.some((v) => v.kind === "color" && v.value === "#2563eb"), "light: the button blue isn't repeated (the tokens have it)");
  check(JSON.stringify(b.headings.map((h) => h.size)) === '["44px","30px","20px"]', `light: heading sizes (${JSON.stringify(b.headings)})`);
  check(bd.variables.some((v) => v.id === "card-shadow" && v.value.includes("12px")), `light: the card shadow (${b.shadow})`);
  check(JSON.stringify(bd.social) === '[{"kind":"linkedin","url":"https://www.linkedin.com/company/acme"},{"kind":"x","url":"https://x.com/acme"}]', `light: social links (${JSON.stringify(bd.social)})`);
  check(bd.address === "500 Market Street, Suite 2, San Francisco, CA 94105", `light: the address (${bd.address})`);
  check(b.copy.includes("Ship faster") && b.copy.length < 7000, "light: the page's words, for the brief");
  check(bd.email.heading === "$h2-size", "light: email headings take the site's H2 size");
  const t = light.tokens;
  check(t.buttonBg === "#2563eb" && t.buttonText === "#ffffff" && t.buttonRadius === 4 && t.buttonWeight === 600, `light: the primary button (${t.buttonBg}, ${t.buttonRadius}px, ${t.buttonWeight})`);
  check(t.border === "#d1d5db" && t.radius === 4 && t.inputHeight === 42 && t.borderWidth === 1, `light: fields from the contact page, at their drawn height (40px plus borders) (${t.border}, ${t.radius}px, ${t.inputHeight}px)`);
  check(t.text === "#222222" && t.background === "#ffffff" && t.font.includes("Helvetica Neue"), `light: text, background and font (${t.text}, ${t.font})`);
  check(t.labelSize === 14 && t.labelWeight === 500, `light: labels (${t.labelSize}px, ${t.labelWeight})`);
  check(t.muted === "#6b7280", `light: gray text (${t.muted})`);
  check(light.forms.some((f) => f.button === "Talk to sales" && f.fields.map((x) => x.label).join() === "Work email,Company,Message"), "light: the contact form's fields and button text");
  check(light.logo === "https://cdn.example.com/acme-logo.svg", "light: the logo");
  check(light.pages.length === 2 && light.pages[1].endsWith("/light/contact") && !!light.formShot, "light: the contact page was read and its form captured");

  const dark = await scanSite(`${base}/dark/`, opts);
  const d = dark.tokens;
  check(d.background === "#0b0b0f" && d.buttonBg === "#ff5a1f" && d.buttonCase === "uppercase" && d.buttonRadius === 60, `dark: background and pill button (${d.background}, ${d.buttonBg}, ${d.buttonRadius})`);
  check(d.inputBg === "#16161c" && d.borderWidth === 2 && d.error === "#ff4d4f", `dark: dark fields and the error color from a CSS variable (${d.inputBg}, ${d.error})`);
  check(contrast(d.text, d.background) >= 4.5 && contrast(d.buttonText, d.buttonBg) >= 4.5, "dark: every pair reads at WCAG AA");

  const faint = await scanSite(`${base}/faint/`, opts);
  check(contrast(faint.tokens.text, "#ffffff") >= 4.5 && contrast(faint.tokens.buttonText, faint.tokens.buttonBg) >= 4.5 && faint.notes.length >= 2, `faint: unreadable colors fixed and noted (${faint.notes.join(" ")})`);

  let blocked = "";
  try {
    await scanSite(`${base}/wall/`, opts);
  } catch (e) {
    blocked = e instanceof ScanBlocked ? e.message : `other: ${(e as Error).message}`;
  }
  check(/turned the scan away/.test(blocked), "wall: a bot wall is reported, not guessed");

  let priv = "";
  try {
    await scanSite("http://10.0.0.8/", { chromiumPath: process.env.CHROMIUM_PATH });
  } catch (e) {
    priv = (e as Error).message;
  }
  check(/private network/.test(priv), "a private address is refused before a browser opens");
} finally {
  server.close();
}
if (failures.length) {
  console.error(`${failures.length} brand check(s) failed`);
  process.exit(1);
}
console.log("All brand checks passed");
