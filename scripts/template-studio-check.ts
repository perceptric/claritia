// Gallery templates as Form Studio pages in a real browser (docs/form-templates.md, "Templates in Form Studio"), in
// the real forms/v1.js: a template made the way Use template makes it opens on its cover, Start and Back move between
// the cover and the questions, an Agreement ticked shows what it unlocks, a repeating group takes two rows, and the
// PDF copy of the answers shows on the page's own thank-you. Flaky cases: the first send fails (the visitor still
// finishes, with no link and no error), a copy link the server didn't make is never shown, and the link is shown once.
// A small server stands in for the form's read and the send.
//   CHROMIUM_PATH=… node scripts/template-studio-check.ts   (SHOTS=dir saves screenshots)
import { createServer } from "node:http";
import pw from "playwright-core";
import { agree, date, email, long, money, rows, tpl, when } from "../src/lib/forms/gallery/templates/build.ts";
import { checkAnswers } from "../src/lib/forms/values.ts";
import { checkStudioPage, errorsIn } from "../src/lib/studio/check.ts";
import { templateDraft } from "../src/lib/studio/templatePage.ts";
import { buildExtras, buildForms } from "./build-forms.mts";

const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  if (!ok) failures.push(what);
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};
const shots = process.env.SHOTS;

const t = tpl("education.check-camp", "education", "Camp sign-up", ["application"], "A camp sign-up.", {
  cover: { title: "Camp sign-up", text: "About 2 minutes.", button: "Start" },
  copy: true,
  pages: [
    {
      title: "You",
      fields: [
        email("Email"),
        money("Deposit"),
        date("Date of birth"),
        agree("I agree to the camp rules"),
        long("Anything we should know?", { show: when("I agree to the camp rules", "is", true) }),
      ],
    },
    { title: "Medicines", fields: [rows("Medicines to take at camp", ["Medicine", "Dose"], { add: "Add a medicine" })] },
  ],
  end: ["Thanks, you're signed up", "We'll email you the camp details."],
});
const form = templateDraft(t, "");
const issues = errorsIn(checkStudioPage({ html: form.page!.html, after: form.page!.after ?? { kind: "thanks" }, meetings: null }));
check(!issues.length, `the page passes the Studio's check${issues.length ? `: ${issues.map((i) => i.text).join("; ")}` : ""}`);
check(form.copy === true, "the form keeps its PDF copy");

const ID = "33333333-cccc-4ccc-8ccc-333333333333";
const SID = "44444444-dddd-4ddd-8ddd-444444444444";
const GOOD = `/api/forms/${ID}/copy/${SID}?k=${"a".repeat(32)}`;
const x1 = await buildExtras();
const formsJs = await buildForms(x1);
const sent: Record<string, unknown>[] = [];
// What the next send answers: a server error, a good copy link, or a link the server didn't make.
const replies: ("fail" | "good" | "odd")[] = ["fail", "good", "odd"];
const server = createServer((req, res) => {
  const json = (b: unknown, status = 200) => res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" }).end(JSON.stringify(b));
  const u = req.url ?? "";
  if (u.startsWith("/forms/v1.js")) return res.writeHead(200, { "content-type": "text/javascript" }).end(formsJs);
  if (u.startsWith("/forms/x1.js")) return res.writeHead(200, { "content-type": "text/javascript" }).end(x1);
  if (/\/submit$/.test(u)) {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      sent.push(JSON.parse(raw || "{}"));
      const r = replies.shift() ?? "good";
      if (r === "fail") return json({ error: "busy" }, 503);
      return json({ id: SID, copy: r === "good" ? GOOD : "https://evil.example/copy.pdf" });
    });
    return;
  }
  if (u === `/api/forms/${ID}`) return json({ id: ID, version: 1, status: "live", body: form, logo_url: null });
  if (u.startsWith("/api/")) return json({});
  if (u.split("?")[0] === `/${ID}`) return res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><html><body><script src="/forms/v1.js" async></script><claritia-form form-id="${ID}" host="${origin}"></claritia-form></body></html>`);
  res.writeHead(404).end();
});
await new Promise<void>((r) => server.listen(0, r));
const origin = `http://localhost:${(server.address() as { port: number }).port}`;

const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  const fill = async (round: number) => {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const f = page.locator("claritia-form");
    await page.goto(`${origin}/${ID}`);
    const start = f.locator("#cover button[data-cl-next]");
    await start.waitFor({ timeout: 8000 });
    if (round === 0) {
      check(await f.locator("#cover h1", { hasText: "Camp sign-up" }).isVisible(), "the cover shows the template's title");
      check(!(await f.locator("#s0").isVisible()), "the questions wait behind the cover");
      if (shots) await page.screenshot({ path: `${shots}/template-cover.png` });
    }
    await start.click();
    await f.locator("input[name=email]").waitFor({ state: "visible" });
    if (round === 0) {
      await f.locator("#s0 [data-cl-back]").click();
      check(await start.isVisible(), "Back from the first page opens the cover again");
      await start.click();
      await f.locator("input[name=email]").waitFor({ state: "visible" });
      check(!(await f.locator("textarea[name=anything_we_should_know]").isVisible()), "what the Agreement unlocks stays hidden until it's ticked");
    }
    await f.locator("input[name=email]").fill("ana@acme-industries.com");
    await f.locator("input[name=deposit]").fill("150.50");
    await f.locator("input[name=date_of_birth]").fill("2014-05-02");
    await f.locator("input[name=i_agree_to_the]").check();
    if (round === 0) check(await f.locator("textarea[name=anything_we_should_know]").isVisible(), "ticking the Agreement shows the question it unlocks");
    await f.locator("textarea[name=anything_we_should_know]").fill("Bring sunscreen.");
    await f.locator("#s0 button[data-cl-next]").click();
    await f.locator(".gr input").first().waitFor({ state: "visible" });
    await f.locator(".gr input").nth(0).fill("Inhaler");
    await f.locator(".gr input").nth(1).fill("2 puffs");
    await f.locator(".gr input").nth(1).press("Tab");
    await f.locator("button", { hasText: "Add a medicine" }).click();
    await f.locator(".gr").nth(1).locator("input").first().fill("Allergy tablet");
    await f.locator(".gr").nth(1).locator("input").first().press("Tab");
    if (round === 0 && shots) await page.screenshot({ path: `${shots}/template-group.png` });
    await f.locator("button[type=submit]").click();
    await page.waitForFunction(() => document.querySelector("claritia-form")?.shadowRoot?.querySelector("[data-cl-thanks]:not([hidden])"), null, { timeout: 8000 });
    await page.waitForTimeout(150);
    const links = await f.locator("[data-cl-thanks] a", { hasText: "Download a copy" }).all();
    const hrefs = await Promise.all(links.map((a) => a.getAttribute("href")));
    const alerts = await f.locator("[role=alert]").allTextContents();
    await ctx.close();
    return { hrefs, errors, alerts: alerts.filter((x) => x.trim()) };
  };

  const first = await fill(0);
  check(first.hrefs.length === 0 && first.alerts.length === 0, `a send that fails is kept to send again: the thank-you shows, with no link and no error${first.alerts.length ? `: ${first.alerts.join("; ")}` : ""}`);
  const second = await fill(1);
  check(second.hrefs.length === 1 && second.hrefs[0] === `${origin}${GOOD}`, `the thank-you has one Download a copy link: ${second.hrefs.join(", ")}`);
  const third = await fill(2);
  check(third.hrefs.length === 0, "a copy link the server didn't make is never shown");
  check([...first.errors, ...second.errors, ...third.errors].length === 0, `no page errors${[...first.errors, ...second.errors, ...third.errors].join("; ")}`);

  const s = sent.find((x) => x && (x as { answers?: unknown }).answers) as { answers: Record<string, unknown> } | undefined;
  check(!!s, "the form sends");
  if (s) {
    const id = (n: string) => form.page!.ids[n]!;
    const a = s.answers;
    const meds = a[id("medicines_to_take_at")] as Record<string, string>[] | undefined;
    check(Array.isArray(meds) && meds.length === 2 && Object.values(meds[0]!).join(" ") === "Inhaler 2 puffs" && Object.values(meds[1]!)[0] === "Allergy tablet", `the group sends both rows: ${JSON.stringify(meds)}`);
    check(a[id("i_agree_to_the")] === true, `the Agreement sends yes: ${JSON.stringify(a[id("i_agree_to_the")])}`);
    check(String(a[id("deposit")]) === "150.50" || a[id("deposit")] === 150.5, `the deposit keeps its cents: ${a[id("deposit")]}`);
    const r = checkAnswers(form, a, {});
    check(!Object.keys(r.errors).length, `the server's check takes the answers${Object.keys(r.errors).length ? `: ${JSON.stringify(r.errors)}` : ""}`);
  }
} finally {
  await browser.close();
  server.close();
}
if (failures.length) {
  console.log(`\n${failures.length} failed`);
  process.exit(1);
}
console.log("\nall passed");
