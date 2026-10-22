// <claritia-form> in a real browser against the real database (docs/form-builder.md Part 12). A small server stands
// in for the two public routes, using the same checks they use (prepareSubmit) and the same database functions.
// Cases: errors show before anything is sent; the server's own check lands on the right field; a double click sends
// once; a send that can't reach us waits in localStorage and lands once after a reload; steps and the listbox work by
// keyboard; a label with HTML in it stays text.
// scripts/test-db.sh runs it when CHROMIUM_PATH is set.
//   PG_URL=… CHROMIUM_PATH=… node scripts/forms-check.ts

import { createServer } from "node:http";
import pg from "pg";
import pw from "playwright-core";
import { buildForms } from "./build-forms.mts";
import { checkForm, type Form } from "../src/lib/forms/schema.ts";
import { prepareSubmit, type Incoming } from "../src/lib/forms/submit.ts";
import { TEMPLATES } from "../src/lib/forms/templates.ts";

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
  const f = TEMPLATES.find((t) => t.key === template)!.form();
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
const event = await live("event");

let down = false;
let posts = 0;
const code = Buffer.from(await buildForms());
const server = createServer(async (req, res) => {
  const u = new URL(req.url!, "http://localhost");
  const send = (status: number, body: unknown) => res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" }).end(JSON.stringify(body));
  if (u.pathname === "/forms/v1.js") return void res.writeHead(200, { "content-type": "text/javascript" }).end(code);
  const m = /^\/api\/forms\/([0-9a-f-]{36})(\/submit)?$/.exec(u.pathname);
  if (m && !m[2]) {
    const f = (await q(`select form_public($1) as f`, [m[1]]))[0].f;
    return send(200, { ...f, workspace_id: undefined, strict: true });
  }
  if (m && m[2] && req.method === "POST") {
    let body = "";
    for await (const ch of req) body += ch;
    posts++;
    if (down) return send(503, { error: "Try again in a moment." });
    const f = (await q(`select form_public($1) as f`, [m[1]]))[0].f;
    const r = prepareSubmit(f.body, f.version, JSON.parse(body) as Incoming, { custom: [] });
    if ("errors" in r) return send(400, { errors: r.errors });
    if ("error" in r) return send(r.status, { error: r.error });
    const a = r.args;
    const out = (await q(`select form_submit($1, $2, $3, $4, $5, $6, $7, $8, $9, false) as r`, [m[1], a.p_version, a.p_idem, a.p_values, a.p_hidden, a.p_contact, a.p_consent, a.p_country, a.p_spam]))[0].r;
    return send(200, { id: out.id });
  }
  const id = u.searchParams.get("form") ?? sales;
  res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><title>form</title><body style="padding:24px"><claritia-form form-id="${id}"></claritia-form><script src="/forms/v1.js"></script>`);
});
await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as { port: number }).port;
const base = `http://localhost:${port}`;

const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const fills = async (form: string) => Number((await q(`select count(*)::int n from submissions where form_id = $1`, [form]))[0].n);
try {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
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

  // The listbox by keyboard.
  await page.goto(`${base}/?form=${partner}`);
  await host.locator("form").waitFor();
  const box = host.locator("button.bx");
  await box.click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  check((await box.textContent())?.includes("Technology") === true, "the listbox opens, moves and picks by keyboard");
  await box.focus();
  check((await box.getAttribute("aria-expanded")) === "false", "the listbox closes after a pick");
  await page.screenshot({ path: process.env.FORMS_SHOT || "/tmp/forms-check.png", fullPage: true });
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
