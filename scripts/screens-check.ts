// The Forms screens in a real browser against the whole app (docs/form-builder-v2.md Part 6): the local stack
// (scripts/local-stack.mjs) and `next dev`, signed in as one test user. Each way in goes from an empty workspace to a
// live form that takes a fill and makes a contact: Ask me (eight questions by clicks and keys), a first sentence that
// skips what it settles, a template, and Build by hand with drag and drop.
//   POSTGREST_BIN=… CHROMIUM_PATH=… node scripts/screens-check.ts
// scripts/test-db.sh runs it when both are set.

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import pw from "playwright-core";

const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  if (!ok) failures.push(what);
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => Promise<boolean>, ms: number, what: string) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn().catch(() => false)) return;
    await wait(500);
  }
  throw new Error(`Timed out: ${what}`);
};

const out = join(tmpdir(), `claritia-stack-${process.pid}.json`);
const port = 54400 + (process.pid % 400);
const appPort = 3400 + (process.pid % 400);
const kids: ChildProcess[] = [];
const stop = () =>
  kids.forEach((k) => {
    try {
      // Each child leads its own process group, so next dev's server goes with it.
      if (k.pid) process.kill(-k.pid, "SIGTERM");
    } catch {}
  });
process.on("exit", stop);

const stack = spawn(process.execPath, ["scripts/local-stack.mjs"], { env: { ...process.env, LOCAL_OUT: out, LOCAL_PORT: String(port), LOCAL_DB: `claritia_screens_${process.pid}`, PGOPTIONS: "-c client_min_messages=warning" }, stdio: ["ignore", "ignore", "inherit"], detached: true });
kids.push(stack);
await until(async () => existsSync(out), 180_000, "the local stack");
const st = JSON.parse(readFileSync(out, "utf8")) as { env: Record<string, string>; pg: string; session: object; storageKey: string };
rmSync(out, { force: true });
const base = `http://localhost:${appPort}`;
// `next dev` can stop once on its first start to show a notice; it's started again when that happens.
for (let tries = 0; ; tries++) {
  const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(appPort)], { env: { ...process.env, ...st.env, SECRETS_KEY: "screens-check-secrets-key-long-enough-1234", APP_URL: base, NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "ignore", "ignore"], detached: true });
  kids.push(app);
  let exited = false;
  app.on("exit", () => (exited = true));
  try {
    await until(async () => exited || (await fetch(`${base}/forms`)).ok, 240_000, "next dev");
  } catch (e) {
    if (tries) throw e;
  }
  if (!exited) break;
  if (tries) throw new Error("next dev stopped");
}

const db = new pg.Client({ connectionString: st.pg });
await db.connect();
const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(base);
await page.evaluate(([k, v]) => localStorage.setItem(k, v), [st.storageKey, JSON.stringify(st.session)]);

const formId = () => page.url().split("/").pop()!;
const fill = async (id: string, values: Record<string, string>) => {
  const p = await browser.newPage();
  await p.goto(`${base}/f/${id}`);
  const host = p.locator("claritia-form");
  await host.locator("form").waitFor({ timeout: 30_000 });
  for (const [label, v] of Object.entries(values)) await host.getByLabel(new RegExp(`^${label}`)).fill(v);
  await wait(2200);
  // Next through the steps, then send; the first send waits on the dev server compiling the route.
  await until(async () => {
    if (await host.locator("[role=status]").count()) return true;
    const b = host.locator("button[type=submit]");
    if (await b.isEnabled()) await b.click();
    return false;
  }, 90_000, "the fill to be accepted");
  await p.close();
};
const publish = async () => {
  await page.getByRole("button", { name: "Publish" }).click();
  await until(async () => (await db.query(`select status from forms where id = $1`, [formId()])).rows[0]?.status === "live", 20_000, "the form to go live");
};
const contactFor = async (email: string) => (await db.query(`select id from contacts where email_clean = $1`, [email])).rows.length === 1;

try {
  // An empty workspace opens on the first screen.
  await page.goto(`${base}/forms`);
  await page.getByText("What form do you need?").waitFor({ timeout: 60_000 });
  check(true, "an empty workspace opens Forms on the first screen");

  // Ask me: every question by clicks and number keys.
  await page.getByRole("button", { name: /Ask me/ }).click();
  await page.getByText("What's this form for?").waitFor();
  await page.keyboard.press("1");
  await page.getByRole("button", { name: /Pricing page$/ }).click();
  await page.getByRole("button", { name: "Phone", exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("A question to ask").fill("Which CRM do you use? (HubSpot, Salesforce, Other)");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByText("HubSpot, Salesforce, Other").waitFor();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.keyboard.press("1");
  await page.keyboard.press("2");
  await page.getByLabel("Booking link").fill("https://calendly.com/acme/demo");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /Create form/ }).click();
  await page.getByText("Put it on your site").waitFor({ timeout: 30_000 });
  const asked = (await db.query(`select name, draft from forms where id = $1`, [formId()])).rows[0];
  const keys = (asked.draft.steps as { fields: { key: string }[] }[]).flatMap((s) => s.fields.map((f) => f.key));
  check(asked.name === "Demo request, pricing page" && asked.draft.steps.length === 2 && keys.includes("phone") && keys.includes("q.which_crm_do_you_use") && asked.draft.after.schedule?.tool === "calendly", "Ask me builds the form the answers describe");
  check((await page.locator("aside pre").first().textContent())?.includes(`form-id="${formId()}"`) === true, "the embed code names the form");
  await publish();
  await fill(formId(), { "Work email": "ann@acme.com", "First name": "Ann", "Last name": "Lee" });
  await page.getByRole("button", { name: "Next" }).count();
  check(await contactFor("ann@acme.com").catch(() => false), "a fill on the asked form makes a contact");

  // A first sentence skips what it settles.
  await page.goto(`${base}/forms/new`);
  await page.getByLabel("What form do you need?").fill("Contact sales form with phone and budget, business emails only");
  await page.keyboard.press("Enter");
  await page.getByText("Where will it go on your site?").waitFor();
  const thread = (await page.locator("section").first().textContent()) ?? "";
  check(thread.includes("Contact sales") && thread.includes("Yes, business emails only") && !thread.includes("One page or steps?"), "a first sentence settles the goal and the email rule and asks the rest");

  // A template.
  await page.goto(`${base}/forms/new`);
  await page.getByRole("button", { name: /Templates/ }).click();
  await page.getByRole("button", { name: /Webinar/ }).click();
  await page.getByText("Put it on your site").waitFor({ timeout: 30_000 });
  check((await db.query(`select name from forms where id = $1`, [formId()])).rows[0]?.name === "Webinar", "a template opens as a new form");

  // Build by hand: click to add, drag from the list, delete by key.
  await page.goto(`${base}/forms/new`);
  await page.getByRole("button", { name: /Build by hand/ }).click();
  await page.getByText("Contact", { exact: true }).waitFor({ timeout: 30_000 });
  const handles = () => page.locator("[aria-label='Drag to move']").count();
  const n0 = await handles();
  await page.locator("aside button", { hasText: /^First name$/ }).first().click();
  const src = (await page.locator("aside button", { hasText: /^Company$/ }).first().boundingBox())!;
  const dst = (await page.locator("section").filter({ hasText: "Work email" }).first().boundingBox())!;
  await page.mouse.move(src.x + 20, src.y + 10);
  await page.mouse.down();
  await page.mouse.move(src.x + 60, src.y + 20, { steps: 5 });
  await page.mouse.move(dst.x + 100, dst.y + 40, { steps: 15 });
  await page.mouse.up();
  await wait(500);
  check((await handles()) === n0 + 2, "fields are added by click and by drag");
  await page.keyboard.press("Backspace");
  await wait(400);
  check((await handles()) === n0 + 1, "Backspace removes the selected field");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
  await wait(400);
  check((await handles()) === n0 + 2, "Undo brings it back");
  await wait(1500);
  await publish();
  await fill(formId(), { "Work email": "bo@acme.com", "First name": "Bo" });
  check(await contactFor("bo@acme.com"), "a fill on the hand-built form makes a contact");

  check(!errors.length, `no page errors (${errors.slice(0, 3).join(" | ")})`);
} catch (e) {
  failures.push((e as Error).message);
  console.log(`FAIL ${(e as Error).message}`);
} finally {
  await browser.close();
  await db.end();
  stop();
}
if (failures.length) {
  console.error(`${failures.length} screen check(s) failed`);
  process.exit(1);
}
console.log("All screen checks passed");
process.exit(0);
