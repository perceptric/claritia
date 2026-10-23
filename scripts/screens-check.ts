// The Forms screens in a real browser against the whole app (docs/form-studio.md): the local stack
// (scripts/local-stack.mjs) and `next dev`, signed in as one test user. Each way in goes from an empty workspace to a
// live form that takes a fill and makes a contact: Ask (five questions by clicks and keys, opening on Design), a
// first sentence that skips what it settles, a template, and Start blank with click and drag on the canvas. Then the
// CRM: a custom field from the table, a rating from the record page, a note and a task.
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

const formId = () => new URL(page.url()).pathname.split("/").pop()!;
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
  // The first publish waits on next dev compiling the publish route.
  await until(async () => (await db.query(`select status from forms where id = $1`, [formId()])).rows[0]?.status === "live", 60_000, "the form to go live");
};
const contactFor = async (email: string) => (await db.query(`select id from contacts where email_clean = $1`, [email])).rows.length === 1;

try {
  // An empty workspace opens on the first screen.
  await page.goto(`${base}/forms`);
  await page.getByText("What form do you need?").waitFor({ timeout: 60_000 });
  check(true, "an empty workspace opens Forms on the first screen");

  // Ask: five questions by clicks and keys, then the form opens on Design.
  await page.getByText("What's this form for?").waitFor();
  await page.keyboard.press("1");
  await page.getByRole("checkbox", { name: "Phone", exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("textbox", { name: "Add your own" }).fill("Which CRM do you use?");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("checkbox", { name: "Which CRM do you use?" }).waitFor();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Book a meeting", exact: true }).click();
  await page.getByRole("button", { name: "Calendly", exact: true }).click();
  await page.getByLabel("Booking link").fill("https://calendly.com/acme/demo");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Create form" }).click();
  await page.locator("[data-fid]").first().waitFor({ timeout: 30_000 });
  check(new URL(page.url()).searchParams.get("tab") === "design", "a new form opens on the Design tab");
  const asked = (await db.query(`select name, draft from forms where id = $1`, [formId()])).rows[0];
  const keys = (asked.draft.steps as { fields: { key: string }[] }[]).flatMap((s) => s.fields.map((f) => f.key));
  check(asked.name === "Demo request" && keys.includes("phone") && keys.includes("q.which_crm_do_you_use") && asked.draft.after.schedule?.tool === "calendly", "Ask builds the form the answers describe");
  await page.getByRole("tab", { name: "Share", exact: true }).click();
  await page.getByText("Put it on your site").waitFor({ timeout: 30_000 });
  check((await page.locator("aside pre").first().textContent())?.includes(`form-id="${formId()}"`) === true, "the embed code names the form");
  await publish();
  await fill(formId(), { "Work email": "ann@acme.com", "First name": "Ann", "Last name": "Lee" });
  check(await contactFor("ann@acme.com").catch(() => false), "a fill on the asked form makes a contact");

  // The name changes in place.
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Pricing demo");
  await page.keyboard.press("Enter");
  await until(async () => (await db.query(`select name from forms where id = $1`, [formId()])).rows[0]?.name === "Pricing demo", 15_000, "the new name to save");
  check(true, "a form is renamed from its title");

  // A first sentence answers what it can and skips those questions.
  await page.goto(`${base}/forms/new`);
  await page.getByRole("textbox", { name: "Describe your form" }).fill("Contact sales form with phone and budget");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Contact sales", exact: true }).waitFor();
  check((await page.getByRole("region", { name: "What's this form for?" }).count()) === 0, "a first sentence settles the goal and moves on");

  // A template.
  await page.goto(`${base}/forms/new`);
  await page.getByRole("button", { name: "Start from a template" }).click();
  await page.getByRole("button", { name: /Webinar/ }).click();
  await page.locator("[data-fid]").first().waitFor({ timeout: 30_000 });
  check((await db.query(`select name from forms where id = $1`, [formId()])).rows[0]?.name === "Webinar", "a template opens as a new form");

  // Start blank: click to add, drag onto the canvas, delete by key, undo.
  await page.goto(`${base}/forms/new`);
  await page.getByRole("button", { name: "Start blank" }).click();
  await page.locator("[data-fid]").first().waitFor({ timeout: 30_000 });
  const tiles = page.locator("aside[aria-label=Elements]");
  const count = () => page.locator("[data-fid]").count();
  const n0 = await count();
  await tiles.getByRole("button", { name: "First name", exact: true }).click();
  const src = (await tiles.getByRole("button", { name: "Company", exact: true }).boundingBox())!;
  const dst = (await page.locator("[data-fid]").first().boundingBox())!;
  await page.mouse.move(src.x + 20, src.y + 10);
  await page.mouse.down();
  await page.mouse.move(src.x + 60, src.y + 20, { steps: 5 });
  await page.mouse.move(dst.x + 100, dst.y + dst.height - 4, { steps: 15 });
  await page.mouse.up();
  await wait(500);
  check((await count()) === n0 + 2, "fields are added by click and by drag");
  await page.locator("[data-fid]").last().click();
  await page.keyboard.press("Backspace");
  await wait(400);
  check((await count()) === n0 + 1, "Backspace removes the selected field");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
  await wait(400);
  check((await count()) === n0 + 2, "Undo brings it back");
  await wait(1500);
  await publish();
  await fill(formId(), { "Work email": "bo@acme.com", "First name": "Bo" });
  check(await contactFor("bo@acme.com"), "a fill on the hand-built form makes a contact");

  // The CRM: a field added from the table with colored options, a rating from the record page, a note and a task.
  const ws = (await db.query(`select workspace_id from workspace_members limit 1`)).rows[0].workspace_id as string;
  await db.query(`select contacts_upsert($1, 'manual', $2)`, [ws, JSON.stringify([{ email: "dana@acme.com", email_clean: "dana@acme.com", email_class: "work", first_name: "Dana", last_name: "Ray" }])]);
  await page.goto(`${base}/contacts`);
  await page.getByText("Dana Ray").first().waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: "Add field" }).click();
  await page.getByPlaceholder(/Budget, Renewal date/).fill("Plan");
  await page.getByRole("button", { name: /Pick one/ }).click();
  await page.getByLabel("Option 1").fill("Free");
  await page.keyboard.press("Enter");
  await page.getByLabel("Option 2").fill("Pro");
  await page.getByRole("button", { name: "Add field", exact: true }).last().click();
  await page.locator("th", { hasText: "Plan" }).waitFor({ timeout: 10_000 });
  const plan = (await db.query(`select options from fields where workspace_id = $1 and key = 'plan'`, [ws])).rows[0]?.options as { label: string; color?: string }[] | undefined;
  check(plan?.length === 2 && plan[1].color === "brand", "a field added from the table keeps its colored options and joins the table");
  await page.getByText("Dana Ray").first().click();
  await page.getByLabel("New note").fill("Wants a demo next week.");
  await page.getByRole("button", { name: "Add note" }).click();
  await page.getByText("Wants a demo next week.").last().waitFor();
  await page.getByText("Tasks", { exact: true }).first().click();
  await page.getByLabel("New task").fill("Send the deck");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("checkbox", { name: "Mark done" }).first().click();
  await until(async () => (await db.query(`select done from tasks where title = 'Send the deck'`)).rows[0]?.done === true, 10_000, "the task to be done");
  check((await db.query(`select count(*)::int n from notes where workspace_id = $1`, [ws])).rows[0].n === 1, "a note and a done task land on the contact");
  await page.getByRole("button", { name: "Add field" }).last().click();
  await page.getByPlaceholder(/Budget, Renewal date/).fill("Fit score");
  await page.getByRole("button", { name: /Rating/ }).click();
  await page.getByRole("button", { name: "Add field", exact: true }).last().click();
  await page.getByText("Fit score").first().waitFor({ timeout: 10_000 });
  check((await db.query(`select type from fields where workspace_id = $1 and key = 'fit_score'`, [ws])).rows[0]?.type === "rating", "a rating field is added from the record page");

  check(!errors.length, `no page errors (${errors.slice(0, 3).join(" | ")})`);
} catch (e) {
  failures.push((e as Error).message);
  console.log(`FAIL ${(e as Error).message}`);
  // SHOT_ON_FAIL=<file.png> keeps a picture of the page where it stopped.
  if (process.env.SHOT_ON_FAIL) await page.screenshot({ path: process.env.SHOT_ON_FAIL }).catch(() => {});
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
