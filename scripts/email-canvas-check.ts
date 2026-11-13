// The Email Canvas in a real browser (docs/email-canvas-b1.md section 15), with a stand-in database
// (scripts/email-canvas/entry.tsx). It checks the first view, zoom toward the pointer, panning, the zoom keys, picking,
// the toolbar (and how it sticks to the top), Enter, drag to reorder (and Escape to cancel), resizing, Duplicate,
// Delete, Add email, a row of 60 emails, Phone, a narrow screen, dark mode and reduced motion.
//   CHROMIUM_PATH=… node scripts/email-canvas-check.ts   (SHOTS=dir saves screenshots)

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import pw from "playwright-core";

const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  if (!ok) failures.push(what);
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};

const root = new URL("..", import.meta.url).pathname;
const bundle = await build({
  entryPoints: [`${root}scripts/email-canvas/entry.tsx`],
  bundle: true,
  write: false,
  format: "esm",
  jsx: "automatic",
  logLevel: "error",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "server-only": `${root}scripts/email-canvas/empty.ts` },
  tsconfig: `${root}tsconfig.json`,
});
const js = bundle.outputFiles[0]!.contents;
const globals = `${root}src/app/globals.css`;
const css = (await postcss([tailwind()]).process(readFileSync(globals, "utf8"), { from: globals })).css;
const page = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css"><style>html,body,#root{height:100%;margin:0}</style></head><body class="bg-paper"><div id="root"></div><script type="module" src="/app.js"></script></body></html>`;
const server = createServer((req, res) => {
  if (req.url?.startsWith("/app.css")) return void res.writeHead(200, { "content-type": "text/css" }).end(css);
  if (req.url?.startsWith("/app.js")) return void res.writeHead(200, { "content-type": "text/javascript" }).end(js);
  if (req.url?.startsWith("/api/email/test")) return void res.writeHead(200, { "content-type": "application/json" }).end("{}");
  res.writeHead(200, { "content-type": "text/html" }).end(page);
});
await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as { port: number }).port;
const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const shots = process.env.SHOTS;
type Call = { mode: string; body: Record<string, unknown> };

try {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 } });
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on("pageerror", (e) => errors.push(e.message));
  const calls = () => p.evaluate(() => (window as unknown as { calls: Call[] }).calls);
  const clear = () => p.evaluate(() => ((window as unknown as { calls: Call[] }).calls.length = 0));
  const zoom = async () => Number(((await p.locator("[aria-label='Zoom options']").textContent()) ?? "0").replace("%", ""));
  const box = async (sel: string) => (await p.locator(sel).first().boundingBox())!;
  const stage = () => box("[role='application']");
  const art = (i: number) => p.locator("[data-email]").nth(i);
  const settle = () => p.waitForTimeout(320);

  await p.goto(`http://localhost:${port}/`);
  await p.waitForFunction(() => document.querySelectorAll("[data-email] iframe").length >= 3, null, { timeout: 15000 });
  await settle();
  if (shots) await p.screenshot({ path: `${shots}/1-first.png` });

  // 1. The first view fits every email, never past 100%
  const s = await stage();
  const a0 = (await art(0).boundingBox())!;
  const a2 = (await art(2).boundingBox())!;
  check(a0.x >= s.x && a2.x + a2.width <= s.x + s.width && (await zoom()) <= 100, `the first view fits all three emails (${await zoom()}%)`);
  check((await p.locator("[data-email] iframe").count()) === 3, "each email shows in its own frame");

  // 2. Cmd/Ctrl + wheel zooms toward the pointer: the point under it stays put
  const px = a0.x + a0.width * 0.5, py = a0.y + 120;
  const before = { x: (px - a0.x) / a0.width, y: (py - a0.y) / a0.height };
  await p.mouse.move(px, py);
  await p.keyboard.down("Control");
  await p.mouse.wheel(0, -100);
  await p.keyboard.up("Control");
  await p.waitForTimeout(80);
  const b0 = (await art(0).boundingBox())!;
  const after = { x: (px - b0.x) / b0.width, y: (py - b0.y) / b0.height };
  check(b0.width > a0.width * 1.3 && Math.abs(before.x - after.x) < 0.01 && Math.abs(before.y - after.y) < 0.01, "Ctrl + wheel zooms toward the pointer, keeping the point under it");

  // 3. Panning: a two-finger scroll, Space + drag, and the Hand tool
  let c0 = (await art(0).boundingBox())!;
  await p.mouse.wheel(120, 80);
  await p.waitForTimeout(60);
  let c1 = (await art(0).boundingBox())!;
  check(Math.abs(c0.x - c1.x - 120) < 2 && Math.abs(c0.y - c1.y - 80) < 2, "scrolling pans");
  c0 = c1;
  await p.mouse.move(s.x + 300, s.y + 300);
  await p.keyboard.down("Space");
  await p.mouse.down();
  await p.mouse.move(s.x + 360, s.y + 340, { steps: 4 });
  await p.mouse.up();
  await p.keyboard.up("Space");
  c1 = (await art(0).boundingBox())!;
  check(Math.abs(c1.x - c0.x - 60) < 2 && Math.abs(c1.y - c0.y - 40) < 2, "Space + drag pans");
  check((await calls()).length === 0, "panning picks and saves nothing");
  await p.locator("[aria-label='Hand, H']").click();
  c0 = c1;
  await p.mouse.move(s.x + 500, s.y + 400);
  await p.mouse.down();
  await p.mouse.move(s.x + 450, s.y + 380, { steps: 4 });
  await p.mouse.up();
  c1 = (await art(0).boundingBox())!;
  check(Math.abs(c0.x - c1.x - 50) < 2, "the Hand tool pans");
  await p.keyboard.press("v");
  check((await p.locator("[aria-label='Select, V']").getAttribute("aria-pressed")) === "true", "V goes back to Select");

  // 4. The zoom keys
  await p.keyboard.press("Shift+Digit0");
  await settle();
  check((await zoom()) === 100, "Shift+0 goes to 100%");
  await p.keyboard.press("Shift+Digit1");
  await settle();
  const fitted = await zoom();
  const f2 = (await art(2).boundingBox())!;
  check(fitted <= 100 && f2.x + f2.width <= s.x + s.width, `Shift+1 fits every email (${fitted}%)`);
  await p.keyboard.press("Control+Equal");
  await settle();
  check((await zoom()) > fitted, "Ctrl + = steps in");
  await p.keyboard.press("Shift+Digit1");
  await settle();

  // 5. Picking: click, the toolbar, Shift+click, arrows, Escape
  const pick0 = (await art(0).boundingBox())!;
  await p.mouse.click(pick0.x + 40, pick0.y + 80);
  const tb = p.locator("[aria-label='Email actions']");
  check(await tb.isVisible(), "a click picks the email and shows the toolbar");
  check((await tb.textContent())?.includes("Open") && (await tb.textContent())?.includes("Send") ? true : false, "a draft's toolbar has Open, Test and Send");
  const tbb = (await tb.boundingBox())!;
  check(tbb.y + tbb.height <= pick0.y && tbb.x < pick0.x + pick0.width && tbb.x + tbb.width > pick0.x, "the toolbar sits above the picked email");
  if (shots) await p.screenshot({ path: `${shots}/2-picked.png` });
  const pick1 = (await art(1).boundingBox())!;
  await p.keyboard.down("Shift");
  await p.mouse.click(pick1.x + 40, pick1.y + 60);
  await p.keyboard.up("Shift");
  check((await tb.textContent())?.includes("2 emails") ?? false, "Shift+click adds to the pick");
  await p.keyboard.press("Escape");
  check(!(await tb.isVisible()), "Escape clears the pick");
  await p.keyboard.press("ArrowRight");
  await p.keyboard.press("ArrowRight");
  await p.keyboard.press("Enter");
  const nav = (await calls()).find((c) => c.mode === "navigate");
  const ids = await p.evaluate(() => (window as unknown as { db: { emails: { id: string; group_position: number; group_id: string | null }[] } }).db.emails.filter((e) => e.group_id).sort((a, b) => a.group_position - b.group_position).map((e) => e.id));
  check(nav?.body.i === `campaigns/${ids[1]}` && String(nav?.body.q).startsWith("back="), "arrows step through the emails and Enter opens the picked one, with the way back");
  await clear();

  // 6. Drag to reorder: Escape cancels; a drop saves the order
  await p.keyboard.press("Escape");
  const label = async (i: number) => (await p.locator("[data-canvas-item]").filter({ hasText: ["Welcome", "Class reminder", "Monthly news"][i]! }).first().boundingBox())!;
  let l0 = await label(0);
  const end = (await art(2).boundingBox())!;
  await p.mouse.move(l0.x + 10, l0.y + l0.height / 2);
  await p.mouse.down();
  await p.mouse.move(l0.x + 60, l0.y + 60, { steps: 4 });
  await p.mouse.move(end.x + end.width - 5, end.y + 100, { steps: 6 });
  await p.keyboard.press("Escape");
  await p.mouse.up();
  await settle();
  check(!(await calls()).some((c) => c.mode === "email_group_place"), "Escape during a drag puts it back and saves nothing");
  l0 = await label(0);
  await p.mouse.move(l0.x + 10, l0.y + l0.height / 2);
  await p.mouse.down();
  await p.mouse.move(l0.x + 60, l0.y + 60, { steps: 4 });
  const e2 = (await art(2).boundingBox())!;
  await p.mouse.move(e2.x + e2.width - 5, e2.y + 100, { steps: 6 });
  if (shots) await p.screenshot({ path: `${shots}/3-dragging.png` });
  await p.mouse.up();
  await settle();
  const place = (await calls()).find((c) => c.mode === "email_group_place");
  check(place?.body.p_email === ids[0] && place?.body.p_position === 2, "dragging the first email past the last saves it last");
  const order = await p.evaluate(() => (window as unknown as { db: { emails: { name: string; group_position: number; group_id: string | null }[] } }).db.emails.filter((e) => e.group_id).sort((a, b) => a.group_position - b.group_position).map((e) => e.name));
  check(order.join(",") === "Class reminder,Monthly news,Welcome", `the new order: ${order.join(", ")}`);
  await clear();

  // 7. Resize from a side handle: snaps to 640 and saves
  await p.keyboard.press("Shift+Digit1");
  await settle();
  const r0 = (await art(0).boundingBox())!;
  await p.mouse.click(r0.x + 40, r0.y + 60);
  const z = (await zoom()) / 100;
  const handle = p.locator("[aria-label^='Resize']").nth(1);
  const hb = (await handle.boundingBox())!;
  await p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await p.mouse.down();
  await p.mouse.move(hb.x + 40 * z, hb.y + 5, { steps: 5 });
  check((await p.locator("text=640 px").count()) > 0, "the width shows while resizing");
  await p.mouse.up();
  await settle();
  const saved = (await calls()).find((c) => c.mode === "email_draft_save");
  check((saved?.body.p_doc as { settings?: { width?: number } } | undefined)?.settings?.width === 640, "a resize snaps to 640 px and saves it");
  await clear();

  // 8. Duplicate (⌘D) lands right after; Delete asks first
  await p.keyboard.press("Control+d");
  await settle();
  const cs = await calls();
  check(cs.some((c) => c.mode === "email_draft_save" && !c.body.p_id) && cs.some((c) => c.mode === "email_group_place" && c.body.p_position === 1), "⌘D makes a copy right after the email");
  check((await p.locator("[data-email]").count()) === 4, "the copy shows on the canvas");
  await clear();
  await p.keyboard.press("Delete");
  check(await p.getByRole("dialog").isVisible(), "Delete asks first");
  await p.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await settle();
  check((await calls()).some((c) => c.mode === "email_draft_delete") && (await p.locator("[data-email]").count()) === 3, "confirmed, the draft goes");
  await clear();

  // 9. The toolbar sticks to the top when the email's top is out of view
  const t0 = (await art(0).boundingBox())!;
  await p.mouse.click(t0.x + 40, t0.y + 60);
  await p.keyboard.press("Shift+Digit0");
  await settle();
  await p.mouse.move(s.x + 400, s.y + 400);
  await p.mouse.wheel(0, 500);
  await p.waitForTimeout(80);
  const stuck = (await tb.boundingBox())!;
  check(Math.abs(stuck.y - (s.y + 10)) < 3, "the toolbar sticks to the top of the canvas");
  await p.keyboard.press("Shift+Digit1");
  await settle();

  // 10. Add email › New email: a draft at the end of the group, picked
  await p.getByRole("button", { name: /Add email/ }).click();
  await p.getByRole("menuitem", { name: "New email" }).click();
  await settle();
  const add = await calls();
  check(add.some((c) => c.mode === "email_draft_save" && !c.body.p_id) && add.some((c) => c.mode === "email_group_place" && c.body.p_position === null), "New email makes a draft at the end of the group");
  check((await tb.isVisible()) && (await p.locator("[data-email]").count()) === 4, "the new email is picked");
  await clear();

  // 11. Phone shows every email at 390 px
  const wide = (await art(0).boundingBox())!.width;
  await p.getByRole("radio", { name: "Phone" }).click();
  await settle();
  const narrow = (await art(0).boundingBox())!.width;
  check(Math.abs(narrow / wide - 390 / 600) < 0.03 || Math.abs(narrow / wide - 390 / 640) < 0.03, "Phone shows the emails at phone width");
  check(errors.length === 0, `no page errors (${errors.join(" | ")})`);

  // 12. A row of 60 emails: only those near the view load
  const big = await ctx.newPage();
  big.on("pageerror", (e) => errors.push(e.message));
  await big.goto(`http://localhost:${port}/?group=ungrouped&n=60`);
  await big.waitForFunction(() => document.querySelectorAll("[data-email] iframe").length >= 3, null, { timeout: 15000 });
  await big.waitForTimeout(400);
  const frames = await big.locator("[data-email] iframe").count();
  const boards = await big.locator("[data-email]").count();
  check(boards === 61 && frames < 25, `Ungrouped: 61 emails, ${frames} loaded`);
  const bz = Number(((await big.locator("[aria-label='Zoom options']").textContent()) ?? "0").replace("%", ""));
  check(bz >= 25, `a long row opens at a size you can read (${bz}%)`);
  if (shots) await big.screenshot({ path: `${shots}/4-ungrouped.png` });
  await big.close();

  // 13. A narrow screen docks the toolbar at the bottom; dark mode; reduced motion jumps
  const small = await browser.newContext({ viewport: { width: 390, height: 800 }, colorScheme: "dark", reducedMotion: "reduce" });
  const m = await small.newPage();
  m.on("pageerror", (e) => errors.push(e.message));
  await m.goto(`http://localhost:${port}/`);
  await m.waitForFunction(() => document.querySelectorAll("[data-email] iframe").length >= 1, null, { timeout: 15000 });
  await m.waitForTimeout(300);
  const mb = (await m.locator("[data-email]").first().boundingBox())!;
  await m.mouse.click(mb.x + mb.width / 2, mb.y + 40);
  const mt = (await m.locator("[aria-label='Email actions']").boundingBox())!;
  check(mt.y > 600, "on a phone the toolbar docks at the bottom");
  await m.keyboard.press("Shift+Digit0");
  check((await m.locator("[aria-label='Zoom options']").textContent()) === "100%", "with reduced motion, zoom jumps at once");
  if (shots) await m.screenshot({ path: `${shots}/5-phone-dark.png` });
  await small.close();
  check(errors.length === 0, `no page errors anywhere (${errors.join(" | ")})`);
} finally {
  await browser.close();
  server.close();
}
console.log(failures.length ? `\n${failures.length} failed` : "\nall passed");
process.exit(failures.length ? 1 : 0);
