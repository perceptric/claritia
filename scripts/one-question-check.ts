import { createServer } from "node:http";
import pw from "playwright-core";
import { templateById } from "../src/lib/forms/gallery/catalog.ts";
import { templateDraft } from "../src/lib/studio/templatePage.ts";
import { styleCssById } from "../src/lib/studio/styleCss.ts";
import { formEmbedCode } from "../src/lib/share/embed.ts";
import { buildExtras, buildForms } from "./build-forms.mts";
import { TEMPLATES } from "../src/lib/forms/gallery/catalog.ts";

// Every template that asks one question at a time (or the ids given): answered screen by screen in a real browser,
// it reaches its result or thank-you and sends once with every answer.
//   node scripts/one-question-check.ts [template ids...]
const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  if (!ok) failures.push(what);
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};
const ids = process.argv.length > 2 ? process.argv.slice(2) : TEMPLATES.filter((t) => t.schema.one).map((t) => t.id);
const x1 = await buildExtras();
const js = await buildForms(x1);
const forms: Record<string, unknown> = {};
const fid = (i: number) => `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`;
const sent: Record<string, string> = {};
ids.forEach((id, i) => {
  const t = templateById(id)!;
  forms[fid(i)] = templateDraft({ ...t, schema: { ...t.schema, one: true } }, styleCssById("paper"));
});
const server = createServer((req, res) => {
  const u = req.url ?? "";
  const json = (b: unknown) => res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" }).end(JSON.stringify(b));
  if (u.startsWith("/forms/v1.js")) return res.writeHead(200, { "content-type": "text/javascript" }).end(js);
  if (u.startsWith("/forms/x1.js")) return res.writeHead(200, { "content-type": "text/javascript" }).end(x1);
  const m = /^\/api\/forms\/([0-9a-f-]{36})(\/submit)?/.exec(u);
  if (m && m[2]) { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => ((sent[m[1]!] = b), json({ id: "s1" }))); return; }
  if (m) return json({ id: m[1], version: 1, status: "live", body: forms[m[1]!], logo_url: null });
  if (u.startsWith("/api/")) return json({});
  const id = u.slice(1);
  res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><body style="margin:0">${formEmbedCode(`http://localhost:${(server.address() as { port: number }).port}`, id, { mode: "inline" })}</body>`);
});
await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as { port: number }).port;
const b = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
const errors: string[] = [];
p.on("pageerror", (e) => errors.push(e.message));
for (let i = 0; i < ids.length; i++) {
  await p.goto(`http://localhost:${port}/0000000${i}-0000-4000-8000-000000000000`);
  const f = p.locator("claritia-form");
  await f.locator("[data-cl-one-step]").first().waitFor({ state: "attached" });
  let screens = 0;
  for (let guard = 0; guard < 80; guard++) {
    if (await f.locator("[data-cl-thanks]:not([hidden])").count()) break;
    const s = f.locator("[data-cl-one-step]:not([hidden])").first();
    if (!(await s.count())) { await p.waitForTimeout(200); continue; }
    screens++;
    for (const r of await s.locator("input[type=radio]").all()) { const n = await r.getAttribute("name"); if (!(await s.locator(`input[name="${n}"]:checked`).count())) await r.check({ force: true }); }
    for (const pk of await s.locator("button.cl-pick[data-empty]").all()) { await pk.click(); await s.locator(".cl-list li").first().click(); }
    for (const c of await s.locator("input[type=checkbox][required]").all()) await c.check({ force: true });
    for (const t of await s.locator("input[type=text]:visible,input[type=number]:visible,input[type=email]:visible,input[type=tel]:visible,textarea:visible").all()) if (!(await t.inputValue())) await t.fill((await t.getAttribute("type")) === "email" ? "dana@acme.com" : (await t.getAttribute("type")) === "number" ? "5" : (await t.getAttribute("type")) === "tel" ? "5551234567" : "Test");
    await p.waitForTimeout(400);
    if (!(await s.isVisible())) continue;
    const ok = s.locator(".cl-one-nav [data-cl-next], [type=submit]").first();
    if (await ok.count()) await ok.click(); else break;
    await p.waitForTimeout(300);
  }
  await p.waitForTimeout(500);
  const thanks = await f.locator("[data-cl-thanks]:not([hidden])").count();
  const body = sent[fid(i)];
  check(thanks === 1 && !!body && Object.keys(JSON.parse(body).answers).length > 0, `${ids[i]}: ${screens} screens, then the result, sent once`);
}
check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join("; ")}` : ""}`);
await b.close();
server.close();
if (failures.length) {
  console.log(`\n${failures.length} failed`);
  process.exit(1);
}
console.log("\nall passed");
