// <claritia-form> in a real browser against the real database (docs/form-builder.md Part 12). A small server stands
// in for the two public routes, using the same checks they use (prepareSubmit) and the same database functions.
// Cases: errors show before anything is sent; the server's own check lands on the right field; a double click sends
// once; a send that can't reach us waits in localStorage and lands once after a reload; steps and the listbox work by
// keyboard; a label with HTML in it stays text; the embed made before the builder (/f/embed.js) still frames the
// form, sizes the frame, passes the page's UTMs, hands the email to the site script and opens the next page. The
// region list follows the country picked, a calc total shows as the visitor answers and the server saves its own, and
// a sent form leaves one field summary (docs/forms-plan.md Parts 1 and 2).
// scripts/test-db.sh runs it when CHROMIUM_PATH is set.
//   PG_URL=… CHROMIUM_PATH=… node scripts/forms-check.ts

import { createServer } from "node:http";
import pg from "pg";
import pw from "playwright-core";
import { buildForms } from "./build-forms.mts";
import { embedScript } from "../src/lib/forms/render.ts";
import { allRegions, usesRegions } from "../src/lib/forms/regions.ts";
import { checkForm, emptyForm, type Form } from "../src/lib/forms/schema.ts";
import { acceptFill, qaOk, type Incoming } from "../src/lib/forms/submit.ts";
import { pgRpc } from "../worker-intel/rpc.ts";
import { capturedForm, TEMPLATES } from "../src/lib/forms/templates.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 4 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  if (!ok) failures.push(what);
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};

const WS = crypto.randomUUID();
const USER = crypto.randomUUID();
await q(`insert into workspaces (id, name) values ($1, 'forms check')`, [WS]);
await q(`insert into auth.users (id, email) values ($1, 'forms-check@t.io')`, [USER]);
await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [WS, USER]);

async function live(template: string, change?: (f: Form) => void) {
  const f = template === "plain" ? emptyForm() : template.startsWith("captured:") ? capturedForm(template.slice(9) as "html") : TEMPLATES.find((t) => t.key === template)!.form();
  change?.(f);
  const r = checkForm(f);
  if ("errors" in r) throw new Error(r.errors.join(" "));
  const id = (await q(`insert into forms (workspace_id, name, draft) values ($1, $2, $3) returning id`, [WS, template, r.form]))[0].id as string;
  await q(`select form_publish($1, $2, $3)`, [id, USER, r.form]);
  return id;
}
const sales = await live("contact_sales", (f) => {
  f.steps[0].fields[0].label = `Name <img src=x onerror="window.pwned=1">`;
});
const partner = await live("partner");
const quote = await live("quote");
const event = await live("event");
const mapFields = (f: Form) => {
  f.steps[0].fields.push(
    { id: "nm", key: "name", type: "text", label: "Name", required: false, source: "full_name" },
    { id: "co", key: "company", type: "text", label: "Company", required: false, source: "company" },
  );
};
const capHtml = await live("captured:html", (f) => {
  mapFields(f);
  f.capture = { adapter: "html", selector: "#demo" };
  f.after.schedule = { tool: "link", url: "https://example.com/book", perOwner: false };
});
const capMarketo = await live("captured:marketo", mapFields);
const framedMsg = await live("plain", (f) => {
  f.spam.minSeconds = 0;
});
const framedGo = await live("plain", (f) => {
  f.spam.minSeconds = 0;
  f.after.end = { kind: "redirect", url: "https://example.com/thanks" };
});
const capHubspot = await live("captured:hubspot", mapFields);

let down = false;
let posts = 0;
const code = Buffer.from(await buildForms());
const server = createServer((req, res) => void handle(req, res).catch((e: Error) => {
  console.log("SERVER ERROR", e.message);
  res.writeHead(500).end();
}));
async function handle(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) {
  const u = new URL(req.url!, "http://localhost");
  const send = (status: number, body: unknown) => res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" }).end(JSON.stringify(body));
  if (u.pathname === "/forms/v1.js") return void res.writeHead(200, { "content-type": "text/javascript" }).end(code);
  // The app's side of the old embed: the script, and the form's own page it frames (src/app/f/[id]/page.tsx).
  if (u.pathname === "/f/embed.js") return void res.writeHead(200, { "content-type": "text/javascript" }).end(embedScript(app));
  const own = /^\/f\/([0-9a-f-]{36})$/.exec(u.pathname);
  if (own) return void res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><title>Form</title><body style="margin:0"><main style="padding:4px"><claritia-form form-id="${own[1]}"></claritia-form></main><script src="/forms/v1.js"></script>`);
  const embed = u.searchParams.get("embed");
  if (embed) {
    // A customer's page on another origin, with Claritia's site script and the old embed line.
    return void res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><title>site</title><body>
      <script>window.claritia = function (kind, email) { window.relay = [kind, email]; };</script>
      <h1>Get the guide</h1><script src="${app}/f/embed.js" data-claritia-form="${embed}" async></script></body>`);
  }
  const m = /^\/api\/forms\/([0-9a-f-]{36})(\/submit|\/seen)?$/.exec(u.pathname);
  if (m && !m[2]) {
    const f = (await q(`select form_public($1) as f`, [m[1]]))[0].f;
    return send(200, { ...f, workspace_id: undefined, strict: true, ...(usesRegions(f.body) ? { regions: allRegions() } : {}) });
  }
  if (m && m[2] === "/seen" && req.method === "POST") {
    let body = "";
    for await (const ch of req) body += ch;
    const b = JSON.parse(body || "{}");
    if (b.kind === "fields") await q(`select form_field_seen($1, $2, $3, $4, $5, $6, $7)`, [m[1], b.vid, b.version, b.fields, b.left ?? null, b.step ?? 0, b.sent === true]);
    else await q(`select form_seen($1, $2, $3)`, [m[1], b.vid, b.kind]);
    return void res.writeHead(204).end();
  }
  if (m && m[2] === "/submit" && req.method === "POST") {
    let body = "";
    for await (const ch of req) body += ch;
    posts++;
    if (down) return send(503, { error: "Try again in a moment." });
    const f = (await q(`select form_public($1) as f`, [m[1]]))[0].f;
    const r = await acceptFill(pgRpc(pool), f, JSON.parse(body) as Incoming, { custom: [] }, { test: qaOk(m[1], (JSON.parse(body) as Incoming).qa, process.env.SECRETS_KEY) });
    return send(r.status, r.body);
  }
  const cap = u.searchParams.get("capture");
  if (cap) {
    // The team's own form; its own handler runs too, and the page doesn't move.
    return void res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><title>own form</title><body>
      <form id="demo" onsubmit="event.preventDefault(); window.ownHandled = (window.ownHandled || 0) + 1"><input name="email"><input name="full_name"><input name="company"><input type="password" name="pw"><button>Send</button></form>
      <form id="other" onsubmit="event.preventDefault()"><input name="email"><button>Other</button></form>
      <script>window.MktoForms2 = { whenReady(cb) { cb({ onSuccess(fn) { window.mktoSuccess = fn; } }); } };</script>
      <script src="/forms/v1.js" data-capture="${cap}"></script></body>`);
  }
  const id = u.searchParams.get("form") ?? sales;
  res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><title>form</title><body style="padding:24px"><claritia-form form-id="${id}"></claritia-form><script src="/forms/v1.js"></script>`);
}
await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as { port: number }).port;
const base = `http://localhost:${port}`;
const app = `http://127.0.0.1:${port}`;

const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const fills = async (form: string) => Number((await q(`select count(*)::int n from submissions where form_id = $1`, [form]))[0].n);
try {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("page error:", e.message));
  const host = page.locator("claritia-form");
  await page.goto(`${base}/?form=${sales}`);
  await host.locator("form").waitFor();

  // A label with HTML in it stays text.
  check((await host.locator("img").count()) === 0 && (await page.evaluate(() => (window as unknown as { pwned?: number }).pwned)) === undefined, "a label with HTML in it is shown as text");

  // Errors before anything is sent.
  await host.locator("button[type=submit]").click();
  check((await host.locator("[aria-invalid=true]").count()) >= 3 && posts === 0, "required fields show errors and nothing is sent");

  // The server's own check: a free email on a work email field.
  await page.waitForTimeout(2100);
  await host.getByLabel(/^Name/).fill("Ana Diaz");
  await host.getByLabel(/^Work email/).fill("ana@gmail.com");
  await host.getByLabel(/^Company/).fill("Acme");
  await host.getByLabel(/^How can we help/).fill("Pricing please");
  await host.locator("#clr-consent").check();
  await host.locator("button[type=submit]").click();
  await host.locator(".er").first().waitFor();
  check((await host.locator(".er").first().textContent()) === "Use your work email.", "the server's work email check shows on the email field");

  // A double click sends once.
  await host.getByLabel(/^Work email/).fill("ana@acme.com");
  await host.locator("button[type=submit]").dblclick();
  await host.locator("[role=status]").waitFor();
  check((await fills(sales)) === 1, "a double click lands one fill");
  const c = (await q(`select c.email_clean, c.first_name, k.wording from submissions s join contacts c on c.id = s.contact_id left join consents k on k.contact_id = c.id where s.form_id = $1`, [sales]))[0];
  check(c?.email_clean === "ana@acme.com" && c?.first_name === "Ana" && !!c?.wording, "the fill made the contact with its consent wording");

  // Can't reach us: the visitor is done, the fill waits in localStorage, and lands once after a reload.
  down = true;
  await page.goto(`${base}/?form=${sales}`);
  await host.locator("form").waitFor();
  await page.waitForTimeout(2100);
  await host.getByLabel(/^Name/).fill("Bo Lee");
  await host.getByLabel(/^Work email/).fill("bo@acme.com");
  await host.getByLabel(/^Company/).fill("Acme");
  await host.getByLabel(/^How can we help/).fill("Call me");
  await host.locator("button[type=submit]").click();
  await host.locator("[role=status]").waitFor();
  const queued = await page.evaluate(() => JSON.parse(localStorage.getItem("clr_form_queue") || "[]").length);
  check(queued === 1 && (await fills(sales)) === 1, "a fill that can't be sent shows the thank-you and waits in the browser");
  down = false;
  await page.reload();
  await host.locator("form").waitFor();
  await page.waitForFunction(() => !localStorage.getItem("clr_form_queue"), null, { timeout: 10_000 });
  await page.reload();
  await host.locator("form").waitFor();
  await page.waitForTimeout(500);
  check((await fills(sales)) === 2, "after a reload the waiting fill lands once");

  // Steps: Next checks the step, Back keeps the answers.
  await page.goto(`${base}/?form=${event}`);
  await host.locator("form").waitFor();
  await host.locator("button[type=submit]").click();
  check((await host.locator(".st").textContent())?.startsWith("Step 1 of 2") === true && (await host.locator("[aria-invalid=true]").count()) === 2, "Next checks the first step before moving on");
  await host.getByLabel(/^Email/).fill("cy@acme.com");
  await host.getByLabel(/^Full name/).fill("Cy Park");
  await host.locator("button[type=submit]").click();
  await host.getByText("Step 2 of 2", { exact: false }).waitFor();
  await host.getByRole("button", { name: "Back" }).click();
  check((await host.getByLabel(/^Email/).inputValue()) === "cy@acme.com", "Back keeps what was typed");

  // The listbox by keyboard: the country, searched and picked. Then the region list for that country.
  await page.goto(`${base}/?form=${partner}`);
  await host.locator("form").waitFor();
  const box = host.locator("button.bx").first();
  check((await host.locator("button.bx").count()) === 1, "the region list stays hidden until a country is picked");
  await box.click();
  await page.keyboard.type("United States");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  check((await box.textContent())?.includes("United States") === true, "the listbox opens, moves and picks by keyboard");
  await box.focus();
  check((await box.getAttribute("aria-expanded")) === "false", "the listbox closes after a pick");
  const region = host.locator("button.bx").nth(1);
  await region.click();
  await page.keyboard.type("Tex");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  check((await region.textContent())?.includes("Texas") === true, "the region list follows the country picked");
  await host.getByLabel(/^Work email/).fill("pia@agency.io");
  await host.getByLabel(/^Company/).fill("Agency");
  await host.getByLabel(/^Website/).fill("agency.io");
  await host.getByText("Reseller").click();
  await page.screenshot({ path: process.env.FORMS_SHOT || "/tmp/forms-check.png", fullPage: true });
  await host.locator("button[type=submit]").click();
  await host.locator(".dn").waitFor();
  const pv = (await q(`select "values" from submissions where form_id = $1`, [partner]))[0]?.values ?? {};
  check(pv.region === "Texas" && pv.country === "US", `the fill saves the country and region (${JSON.stringify({ country: pv.country, region: pv.region })})`);
  await page.waitForTimeout(300);
  const fs = (await q(`select sent, fields from form_field_sessions where form_id = $1`, [partner]))[0];
  check(!!fs?.sent && Object.keys(fs.fields).length >= 5, "a sent form leaves one field summary, and never the answers");
  check(!JSON.stringify(fs?.fields ?? {}).includes("pia@agency.io"), "the field summary has no answers in it");

  // A calc: the price shows as the visitor answers, and the server works it out again.
  await page.goto(`${base}/?form=${quote}`);
  await host.locator("form").waitFor();
  await host.getByLabel(/^Seats/).fill("12");
  await host.getByLabel(/^Seats/).blur();
  await host.locator("button.bx").click();
  await host.getByRole("option", { name: "Team" }).click();
  check((await host.locator("output").textContent())?.replace(/\s/g, "") === "$480", `the price shows as the visitor answers (${await host.locator("output").textContent()})`);
  await host.getByLabel(/^Work email/).fill("li@buyer.com");
  await host.getByLabel(/^Full name/).fill("Li Wu");
  await host.getByLabel(/^Company/).fill("Buyer");
  await host.getByLabel(/^What do you need/).fill("Seats for the team");
  await host.evaluate((el) => {
    // A visitor who edits the page: the total they send is ignored.
    const o = el.shadowRoot?.querySelector("output");
    if (o) o.textContent = "$1";
  });
  await host.locator("button[type=submit]").click();
  await host.locator(".dn").waitFor();
  const qv = (await q(`select "values" from submissions where form_id = $1`, [quote]))[0]?.values ?? {};
  check(qv["q.estimate"] === 480, `the server saves its own total (${qv["q.estimate"]})`);

  // Captured forms: the team's own HTML form is read when sent, only from the set-up form, only its mapped fields.
  await page.goto(`${base}/?capture=${capHtml}`);
  await page.waitForTimeout(300);
  await page.fill("#other [name=email]", "other@acme.com");
  await page.click("#other button");
  await page.fill("#demo [name=email]", "dee@acme.com");
  await page.fill("#demo [name=full_name]", "Dee Lane");
  await page.fill("#demo [name=company]", "Acme");
  await page.fill("#demo [name=pw]", "secret");
  await page.click("#demo button");
  await page.locator("iframe[title='Book a meeting']").waitFor({ timeout: 10_000 });
  const capRow = (await q(`select s."values", c.first_name from submissions s join contacts c on c.id = s.contact_id where s.form_id = $1`, [capHtml]));
  check(capRow.length === 1 && capRow[0].values.email === "dee@acme.com" && capRow[0].values.company === "Acme" && capRow[0].first_name === "Dee", "a captured HTML form lands its mapped fields once");
  check(!JSON.stringify(capRow[0]?.values ?? {}).includes("secret") && (await page.evaluate(() => (window as unknown as { ownHandled?: number }).ownHandled)) === 1, "the password isn't read and the site's own handler still ran");
  check((await page.locator("iframe[title='Book a meeting']").getAttribute("src"))?.startsWith("https://example.com/book?email=dee%40acme.com") === true, "after a captured fill the booking calendar opens over the page");

  await page.goto(`${base}/?capture=${capMarketo}`);
  await page.waitForFunction(() => typeof (window as unknown as { mktoSuccess?: unknown }).mktoSuccess === "function");
  await page.evaluate(() => (window as unknown as { mktoSuccess: (v: object) => void }).mktoSuccess({ email: "mo@acme.com", full_name: "Mo Ray", company: "Acme" }));
  await page.waitForTimeout(800);
  check((await fills(capMarketo)) === 1, "a captured Marketo form lands from its onSuccess");

  await page.goto(`${base}/?capture=${capHubspot}`);
  await page.waitForTimeout(500);
  await page.evaluate(() => window.postMessage({ type: "hsFormCallback", eventName: "onFormSubmitted", data: [{ name: "email", value: "hu@acme.com" }, { name: "company", value: "Acme" }] }, "*"));
  await page.evaluate(() => window.postMessage({ type: "hsFormCallback", eventName: "onFormSubmitted", data: [{ name: "email", value: "hu@acme.com" }, { name: "company", value: "Acme" }] }, "*"));
  await page.waitForTimeout(800);
  check((await fills(capHubspot)) === 1, "a captured HubSpot form lands once from its submit callback");

  // The old embed: a page on another origin frames /f/<id>, which now holds <claritia-form>.
  const ids = async (form: string) => (await q(`select v.body from forms f join form_versions v on v.form_id = f.id and v.version = f.version where f.id = $1`, [form]))[0].body.steps[0].fields[0].id as string;
  await page.goto(`${base}/?embed=${framedMsg}&utm_source=news&gclid=g1`);
  const frame = page.frameLocator("iframe[data-claritia-frame]");
  await frame.locator("claritia-form form").waitFor({ timeout: 10_000 });
  await page.waitForFunction(() => (document.querySelector("iframe[data-claritia-frame]") as HTMLIFrameElement).offsetHeight > 150, null, { timeout: 5000 });
  await page.waitForTimeout(600);
  const tall = await page.evaluate(() => (document.querySelector("iframe[data-claritia-frame]") as HTMLIFrameElement).offsetHeight);
  await page.waitForTimeout(600);
  const still = await page.evaluate(() => (document.querySelector("iframe[data-claritia-frame]") as HTMLIFrameElement).offsetHeight);
  check(tall > 150 && tall < 1200 && tall === still, `the old embed frames the new form and sizes the frame to it (${tall}px)`);
  await frame.locator(`claritia-form #clr-${await ids(framedMsg)}`).fill("em@acme.com");
  await frame.locator("claritia-form button[type=submit]").click();
  await frame.locator("claritia-form [role=status]").waitFor();
  await page.waitForFunction(() => !!(window as unknown as { relay?: unknown }).relay, null, { timeout: 5000 });
  check(JSON.stringify(await page.evaluate(() => (window as unknown as { relay: unknown }).relay)) === JSON.stringify(["form", "em@acme.com"]), "the fill hands the email to the site script on the page around the frame");
  const em = (await q(`select hidden from submissions where form_id = $1`, [framedMsg]))[0]?.hidden ?? {};
  check(em.utm_source === "news" && em.gclid === "g1" && em.first_utm_source === "news" && em.page === `${base}/`, `the fill keeps the outer page and its UTMs (${JSON.stringify(em)})`);
  await page.route("https://example.com/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<title>thanks</title>" }));
  await page.goto(`${base}/?embed=${framedGo}`);
  await frame.locator("claritia-form form").waitFor({ timeout: 10_000 });
  await frame.locator(`claritia-form #clr-${await ids(framedGo)}`).fill("go@acme.com");
  await frame.locator("claritia-form button[type=submit]").click();
  await page.waitForURL("https://example.com/thanks", { timeout: 10_000 });
  check((await fills(framedGo)) === 1, "a form that opens a page after the submit opens it on the page around the frame");
} finally {
  await browser.close();
  server.close();
  await pool.end();
}
if (failures.length) {
  console.error(`${failures.length} form check(s) failed`);
  process.exit(1);
}
console.log("All form checks passed");
