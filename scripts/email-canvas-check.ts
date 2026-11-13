// The Email Canvas in a real browser (docs/email-canvas-b1.md section 15), with a stand-in database
// (scripts/email-canvas/entry.tsx). It checks the first view, zoom toward the pointer, panning, the zoom keys, picking,
// the toolbar (and how it sticks to the top), Enter, drag to reorder (and Escape to cancel), resizing, Duplicate,
// Delete, Add email, a row of 60 emails, Phone, a narrow screen, dark mode and reduced motion. Part B2
// (docs/email-canvas-b2.md section 9): picking inside an email, hover, stepping out and in, reading order, the panel's
// groups at each level and screen, Every heading and Publish styles, the layer tree, the keys that move, copy and
// delete, undo, a sent email's read-only panel, and the panel as a sheet on a phone. Part B3
// (docs/email-canvas-b3.md section 7): typing in place, the format bar, links, merge values, paste rules, ending and
// undo.
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
  check((await tb.textContent())?.includes("Add to chat") && (await tb.textContent())?.includes("Test") && (await tb.textContent())?.includes("Send") ? true : false, "a draft's toolbar has Add to chat, Test and Send");
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
  check((await p.locator("[data-canvas-tag='pick']").textContent()) === "Section", "Enter steps into the picked email's first section");
  const zoomBefore = await zoom();
  await p.locator("[data-canvas-item]").filter({ hasText: "Class reminder" }).first().dblclick();
  await p.waitForTimeout(450);
  const ids = await p.evaluate(() => (window as unknown as { db: { emails: { id: string; group_position: number; group_id: string | null }[] } }).db.emails.filter((e) => e.group_id).sort((a, b) => a.group_position - b.group_position).map((e) => e.id));
  check((await zoom()) !== zoomBefore && !(await calls()).some((c) => c.mode === "navigate"), "a double-click on an email's name zooms to it (campaign drafts are edited here)");
  await clear();
  await p.keyboard.press("Shift+Digit1");
  await settle();

  // 6. Drag to reorder: Escape cancels; a drop saves the order
  await p.keyboard.press("Escape");
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

  // 8. Duplicate (⌘D) lands right after; Delete asks first (with the whole email picked, by its name)
  await p.mouse.click(r0.x + 12, r0.y - 12);
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
  await p.locator("[role='radiogroup'][aria-label='Size'] [aria-label='Phone']").click();
  await settle();
  const narrow = (await art(0).boundingBox())!.width;
  check(Math.abs(narrow / wide - 390 / 600) < 0.03 || Math.abs(narrow / wide - 390 / 640) < 0.03, "Phone shows the emails at phone width");
  check(errors.length === 0, `no page errors (${errors.join(" | ")})`);

  // B2 ----------------------------------------------------------------------------------------------------------------
  const q = await ctx.newPage();
  q.on("pageerror", (e) => errors.push(e.message));
  await q.goto(`http://localhost:${port}/`);
  await q.waitForFunction(() => document.querySelectorAll("[data-email] iframe").length >= 3, null, { timeout: 15000 });
  await q.waitForTimeout(400);
  type W = { calls: Call[]; db: { emails: { name: string; doc: Doc }[] } };
  type Doc = { sections: { id: string; columns: { id: string; blocks: { id: string; type: string }[] }[] }[]; styles?: Record<string, unknown> };
  const qcalls = () => q.evaluate(() => (window as unknown as W).calls);
  const qclear = () => q.evaluate(() => ((window as unknown as W).calls.length = 0));
  const saves = async () => (await qcalls()).filter((c) => c.mode === "email_draft_save");
  const docOf = (name: string) => q.evaluate((n) => (window as unknown as W).db.emails.find((e) => e.name === n)!.doc, name);
  const readOrder = (d: Doc) => d.sections.flatMap((x) => x.columns.flatMap((c) => c.blocks.map((b) => b.id)));
  /** A part inside email i's frame, by its class: its page point and its element's id. */
  const part = (i: number, kind: string, n = 0) =>
    q.evaluate(
      ([i, kind, n]) => {
        const f = document.querySelectorAll<HTMLIFrameElement>("[data-email] iframe")[i as number]!;
        const els = [...f.contentDocument!.querySelectorAll<HTMLElement>("[class]")].filter((e) => [...e.classList].some((c) => new RegExp(`^c[a-z0-9]+-${kind}$`).test(c)));
        const el = els[n as number]!;
        const fr = f.getBoundingClientRect();
        const b = el.getBoundingClientRect();
        const z = fr.width / f.offsetWidth;
        const id = [...el.classList].map((c) => new RegExp(`^c([a-z0-9]+)-${kind}$`).exec(c)?.[1]).find(Boolean)!;
        return { x: fr.left + (b.left + Math.min(b.width / 2, 40)) * z, y: fr.top + (b.top + b.height / 2) * z, id };
      },
      [i, kind, n] as const,
    );
  const css = (i: number, sel: string, prop: string) =>
    q.evaluate(([i, sel, prop]) => getComputedStyle(document.querySelectorAll<HTMLIFrameElement>("[data-email] iframe")[i as number]!.contentDocument!.querySelector(sel as string)!).getPropertyValue(prop as string), [i, sel, prop] as const);
  const pickTag = async () => (await q.waitForTimeout(60), await q.locator("[data-canvas-tag='pick']").count()) ? await q.locator("[data-canvas-tag='pick']").textContent() : null;
  const pickedId = async () => (await q.waitForTimeout(60), q.locator("[data-canvas-pick]").first().getAttribute("data-canvas-pick", { timeout: 500 }).catch(() => null));
  const panel = q.locator("aside[aria-label='Element']");
  const group = (name: string) => panel.locator("fieldset > section").filter({ has: q.locator(`h3:text-is("${name}")`) });
  const openGroup = async (name: string) => {
    const g = group(name).locator("button[aria-expanded]");
    if ((await g.getAttribute("aria-expanded")) !== "true") await g.click();
  };
  const setField = async (scope: ReturnType<typeof group>, label: string, v: string) => {
    const f = scope.locator(`input[aria-label='${label}']`).first();
    await f.fill(v);
    await f.press("Enter");
    await q.waitForTimeout(60);
  };
  const welcome = await docOf("Welcome");

  // 14. A click inside an email picks the innermost element: outline, tag, element bar, the panel
  const h1 = await part(0, "heading");
  await q.mouse.click(h1.x, h1.y);
  await q.waitForTimeout(120);
  check((await pickedId()) === h1.id && (await pickTag()) === "Heading", "a click inside an email picks the heading under the pointer");
  check((await q.locator("[aria-label='Element actions']").isVisible()) && (await panel.locator("h2").first().textContent()) === "Heading", "the element bar and the panel show for it");
  if (shots) await q.screenshot({ path: `${shots}/6-b2-picked.png` });
  const t1 = await part(0, "text", 1);
  await q.mouse.move(t1.x, t1.y);
  await q.waitForTimeout(80);
  check((await q.locator("[data-canvas-hover]").count()) === 1 && (await q.locator("[data-canvas-tag='hover']").textContent()) === "Text", "hover outlines the element under the pointer with its kind");

  // 15. Escape steps out three levels; Enter steps in; ↑ and ↓ follow reading order
  await q.keyboard.press("Escape");
  check((await pickTag()) === "Section", "Escape steps out to the section");
  await q.keyboard.press("Escape");
  check((await pickedId()) === null && (await q.locator("[aria-label='Email actions']").isVisible()), "Escape again picks the whole email");
  await q.keyboard.press("Escape");
  check(!(await q.locator("[aria-label='Email actions']").isVisible()), "and again picks nothing");
  const q0 = (await q.locator("[data-email]").first().boundingBox())!;
  await q.mouse.click(q0.x + 12, q0.y - 12);
  await q.keyboard.press("Enter");
  const t2 = await pickTag();
  await q.keyboard.press("Enter");
  const t3 = await pickTag();
  await q.keyboard.press("Enter");
  const t4 = await pickTag();
  check(t2 === "Section" && t3 === "Column" && t4 === "Logo", `Enter steps in: ${t2}, ${t3}, ${t4}`);
  const ord = readOrder(welcome);
  await q.keyboard.press("ArrowDown");
  const d1 = await pickedId();
  await q.keyboard.press("ArrowDown");
  const d2 = await pickedId();
  await q.keyboard.press("ArrowUp");
  const d3 = await pickedId();
  check(d1 === ord[1] && d2 === ord[2] && d3 === ord[1], "↓ and ↑ follow reading order across columns and sections");

  // 16. The panel: Size, a color from a variable, Case and Bold show at once; one save after typing stops
  await q.mouse.click(h1.x, h1.y);
  await qclear();
  const text = group("Text");
  await setField(text, "Size", "40");
  check((await css(0, `.c${h1.id}-heading`, "font-size")) === "40px", "a new size shows in the frame at once");
  await text.locator("[aria-label='Color color']").click();
  await q.getByRole("dialog", { name: "Color color" }).getByRole("button").filter({ hasText: "Accent" }).first().click();
  await text.locator("[role='radio'][title='Uppercase']").click();
  await q.waitForTimeout(80);
  check((await css(0, `.c${h1.id}-heading`, "text-transform")) === "uppercase", "Case shows at once");
  await q.waitForTimeout(1100);
  const sv = await saves();
  const st = JSON.stringify((sv[sv.length - 1]?.body.p_doc as Doc | undefined)?.styles?.[h1.id] ?? {});
  check(sv.length === 1 && st.includes("40px") && st.includes("$accent") && st.includes("uppercase"), `one save after typing stops, with the styles (${sv.length} saves)`);
  const tx = await part(0, "text", 1);
  await q.mouse.click(tx.x, tx.y);
  const w0 = Number(await css(0, `.c${tx.id}-text`, "font-weight"));
  await panel.getByRole("group", { name: "Format" }).getByRole("button", { name: "Bold" }).click();
  await q.waitForTimeout(80);
  const w1 = Number(await css(0, `.c${tx.id}-text`, "font-weight"));
  check(w0 >= 600 ? w1 === 400 : w1 >= 700, `Format Bold turns bold on and off (${w0} to ${w1})`);

  // 17. Phone on: a change saves under the phone styles only
  await q.mouse.click(h1.x, h1.y);
  await qclear();
  await panel.locator("[role='radiogroup'][aria-label='Screen'] [role='radio']").nth(1).click();
  await q.waitForTimeout(320);
  await setField(group("Text"), "Size", "22");
  await q.waitForTimeout(1100);
  const ps = await saves();
  const pst = (ps[ps.length - 1]?.body.p_doc as Doc | undefined)?.styles?.[h1.id];
  check(JSON.stringify(pst ?? {}).includes("22px") && JSON.stringify(pst ?? {}).includes("40px") && /phone/i.test(JSON.stringify(pst ?? {})), "with Phone on, the size saves for phones and desktop keeps its own");
  await panel.locator("[role='radiogroup'][aria-label='Screen'] [role='radio']").nth(0).click();
  await q.waitForTimeout(320);

  // 18. Corners Round and Stroke Dashed on a button, padding Each side, Fit on a picture with a height
  const bt = await part(0, "button");
  await q.mouse.click(bt.x, bt.y);
  await openGroup("Corners");
  await group("Corners").locator("[role='radio']").filter({ hasText: "Round" }).last().click();
  await openGroup("Stroke");
  await group("Stroke").locator("[role='radio']").filter({ hasText: "Dashed" }).click();
  await setField(group("Stroke"), "Width", "2");
  const sp = group("Spacing");
  await sp.locator("button").filter({ hasText: "Each side" }).first().click();
  await setField(sp, "Top", "30");
  await q.waitForTimeout(80);
  const bsel = `.c${bt.id}-button`;
  check((await css(0, bsel, "border-top-left-radius")) === "999px", "Corners Round rounds the button");
  check((await css(0, bsel, "border-top-style")) === "dashed" && (await css(0, bsel, "border-bottom-style")) === "dashed", "Stroke Dashed draws on every side");
  check((await css(0, bsel, "padding-top")) === "30px" && (await css(0, bsel, "padding-bottom")) !== "30px", "padding Each side changes just the top");
  if (shots) await q.screenshot({ path: `${shots}/7-b2-button.png` });
  const lg = await part(0, "image");
  await q.mouse.click(lg.x, lg.y);
  await openGroup("Layout");
  check((await group("Layout").locator("[role='radio']").filter({ hasText: "Cover" }).count()) === 0, "Fit hides while the height is Auto");
  await setField(group("Layout"), "Height", "60");
  await group("Layout").locator("[role='radio']").filter({ hasText: "Cover" }).click();
  await q.waitForTimeout(80);
  check((await css(0, `.c${lg.id}-image`, "object-fit")) === "cover", "Fit Cover on a picture with a height");

  // 19. Style for Every heading changes another email's heading and shows Publish styles
  const other = await part(1, "heading");
  const hh = await part(0, "heading", 1);
  await q.mouse.click(hh.x, hh.y);
  await panel.getByRole("button", { name: "Style for" }).click();
  await q.getByRole("option", { name: "Every heading" }).click();
  check((await panel.locator("text=Changes every email that uses it.").count()) === 1, "Every heading says it changes every email");
  // The templates' headings set their own sizes (which win), so Case shows it.
  check((await css(1, `.c${other.id}-heading`, "text-transform")) === "none", "another email's heading starts in its own case");
  await group("Text").locator("[role='radio'][title='Uppercase']").click();
  await q.waitForTimeout(120);
  check((await css(1, `.c${other.id}-heading`, "text-transform")) === "uppercase", "another email's heading changes too");
  const pub = q.getByRole("button", { name: "Publish styles" });
  check(await pub.isVisible(), "Publish styles shows");
  await qclear();
  await pub.click();
  await q.waitForTimeout(500);
  const pc = await qcalls();
  check(pc.some((c) => c.mode === "design_save") && pc.some((c) => c.mode === "brand_kit_design_publish") && !(await pub.isVisible()), "Publish styles saves and publishes the brand's styles");

  // 20. The tree: click picks, keys move through rows, drag reorders and saves
  await panel.getByRole("tab", { name: "Layout" }).click();
  const tree = panel.locator("[role='treeitem']");
  const levels = await tree.evaluateAll((els) => els.map((e) => ({ level: Number(e.getAttribute("aria-level")), text: e.textContent ?? "" })));
  const sec2 = levels.findIndex((r, i) => r.level === 3 && levels.slice(0, i).some((x) => x.level === 3));
  check(sec2 > 0 && levels[sec2 + 1]!.level === 4, "the tree shows Body, Container, sections and blocks");
  await tree.nth(sec2 + 2).click();
  await q.waitForTimeout(80);
  const now0 = (await docOf("Welcome")).sections[1]!.columns[0]!.blocks.map((b) => b.id);
  check((await pickedId()) === now0[1], "a click on a row picks it on the canvas");
  await tree.nth(sec2 + 2).focus();
  await q.keyboard.press("ArrowDown");
  check((await q.evaluate(() => document.activeElement?.getAttribute("aria-level"))) === "4" && (await tree.nth(sec2 + 3).evaluate((e) => e === document.activeElement)), "↓ moves through the rows");
  await qclear();
  const ra = (await tree.nth(sec2 + 1).boundingBox())!;
  const rb = (await tree.nth(sec2 + 2).boundingBox())!;
  await q.mouse.move(ra.x + 60, ra.y + ra.height / 2);
  await q.mouse.down();
  await q.mouse.move(ra.x + 60, rb.y + rb.height * 0.8, { steps: 6 });
  await q.mouse.up();
  await q.waitForTimeout(1100);
  const dragged = (await docOf("Welcome")).sections[1]!.columns[0]!.blocks.map((b) => b.id);
  check(dragged[0] === now0[1] && dragged[1] === now0[0] && (await saves()).length === 1, "dragging a row below the next one reorders and saves");

  // 21. Alt+Shift+↓ moves, ⌘D duplicates, Delete removes with Undo, ⌘Z brings it back
  await panel.getByRole("tab", { name: "Element" }).click();
  const mv = await part(0, "heading", 1);
  await q.mouse.click(mv.x, mv.y);
  const beforeMove = readOrder(await docOf("Welcome"));
  await q.keyboard.press("Alt+Shift+ArrowDown");
  await q.waitForTimeout(1000);
  const afterMove = readOrder(await docOf("Welcome"));
  check(afterMove.indexOf(mv.id) === beforeMove.indexOf(mv.id) + 1, "Alt+Shift+↓ moves the block down");
  const count = async () => q.evaluate(() => document.querySelectorAll<HTMLIFrameElement>("[data-email] iframe")[0]!.contentDocument!.querySelectorAll("[data-eid]").length);
  const c0n = await count();
  await q.keyboard.press("Control+d");
  await q.waitForTimeout(80);
  check((await count()) === c0n + 1 && (await pickedId()) !== mv.id, "⌘D duplicates the block and picks the copy");
  await q.keyboard.press("Delete");
  await q.waitForTimeout(80);
  check((await count()) === c0n && (await q.locator("[role='status']").filter({ hasText: "Deleted" }).isVisible()), "Delete removes it and offers Undo");
  await q.keyboard.press("Control+z");
  await q.waitForTimeout(80);
  check((await count()) === c0n + 1, "⌘Z brings it back");
  await q.keyboard.press("Control+Shift+z");
  await q.waitForTimeout(80);
  check((await count()) === c0n, "⇧⌘Z does it again");
  await q.waitForTimeout(1000);
  check(readOrder(await docOf("Welcome")).length === afterMove.length, "the saved email matches what shows");
  if (shots) await q.screenshot({ path: `${shots}/8-b2-tree.png` });
  await q.close();

  // B3 ----------------------------------------------------------------------------------------------------------------
  const t = await ctx.newPage();
  t.on("pageerror", (e) => errors.push(e.message));
  await t.goto(`http://localhost:${port}/`);
  await t.waitForFunction(() => document.querySelectorAll("[data-email] iframe").length >= 3, null, { timeout: 15000 });
  await t.waitForTimeout(400);
  const tcalls = () => t.evaluate(() => (window as unknown as W).calls);
  const tdoc = () => t.evaluate(() => (window as unknown as W).db.emails.find((e) => e.name === "Welcome")!.doc);
  const blockOf = async (id: string) => (await tdoc()).sections.flatMap((x) => x.columns.flatMap((c) => c.blocks)).find((b) => b.id === id) as Record<string, unknown> | undefined;
  const tpart = (kind: string, n = 0) =>
    t.evaluate(
      ([kind, n]) => {
        const f = document.querySelectorAll<HTMLIFrameElement>("[data-email] iframe")[0]!;
        const els = [...f.contentDocument!.querySelectorAll<HTMLElement>("[class]")].filter((e) => [...e.classList].some((c) => new RegExp(`^c[a-z0-9]+-${kind}$`).test(c)));
        const el = els[n as number]!;
        const fr = f.getBoundingClientRect();
        const b = el.getBoundingClientRect();
        const z = fr.width / f.offsetWidth;
        const id = [...el.classList].map((c) => new RegExp(`^c([a-z0-9]+)-${kind}$`).exec(c)?.[1]).find(Boolean)!;
        return { x: fr.left + (b.left + Math.min(b.width / 2, 30)) * z, y: fr.top + (b.top + b.height / 2) * z, id };
      },
      [kind, n] as const,
    );
  const editing = () => t.evaluate(() => document.querySelectorAll<HTMLIFrameElement>("[data-email] iframe")[0]!.contentDocument!.querySelector("[contenteditable='true']")?.className ?? null);
  const paste = (data: Record<string, string>, plain = false) =>
    t.evaluate(
      ([data, plain]) => {
        const d = document.querySelectorAll<HTMLIFrameElement>("[data-email] iframe")[0]!.contentDocument!;
        const el = d.querySelector("[contenteditable='true']")!;
        if (plain) el.dispatchEvent(new KeyboardEvent("keydown", { key: "V", ctrlKey: true, shiftKey: true, bubbles: true }));
        const dt = new DataTransfer();
        for (const [k, v] of Object.entries(data as Record<string, string>)) dt.setData(k, v);
        el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
      },
      [data, plain] as const,
    );
  const settleSave = () => t.waitForTimeout(1100);

  // 23. Double-click a heading, type, Escape: it shows and one save has it
  const th = await tpart("heading");
  await t.mouse.click(th.x, th.y);
  await t.mouse.dblclick(th.x, th.y);
  await t.waitForTimeout(100);
  check((await editing())?.includes(`c${th.id}-heading`) ?? false, "a double-click on a heading starts typing in it");
  check((await t.locator("[aria-label='Text format']").isVisible()) && !(await t.locator("[aria-label='Element actions']").isVisible()), "the format bar replaces the element bar");
  await t.keyboard.press("Control+a");
  await t.keyboard.type("Fresh words");
  await t.keyboard.press("Escape");
  await t.waitForTimeout(100);
  check((await editing()) === null, "Escape ends typing");
  await settleSave();
  check((await blockOf(th.id))?.text === "Fresh words", "the typed heading saves");
  if (shots) await t.screenshot({ path: `${shots}/10-b3-typed.png` });

  // 24. Enter on a picked text block types; ⌘B bolds; ⌘K links through the dialog
  const tt = await tpart("text", 2);
  await t.mouse.click(tt.x, tt.y);
  await t.keyboard.press("Enter");
  await t.waitForTimeout(100);
  check((await editing())?.includes(`c${tt.id}-text`) ?? false, "Enter on a picked text block starts typing");
  await t.keyboard.press("Control+a");
  await t.keyboard.type("Hello there");
  await t.keyboard.press("Control+a");
  await t.keyboard.press("Control+b");
  check((await t.locator("[aria-label='Text format'] [aria-label='Bold']").getAttribute("aria-pressed")) === "true", "⌘B bolds and the bar shows Bold on");
  await t.keyboard.press("End");
  await t.keyboard.press("Control+b");
  await t.keyboard.type(" more");
  for (let i = 0; i < 4; i++) await t.keyboard.press("Shift+ArrowLeft");
  await t.keyboard.press("Control+k");
  await t.getByRole("dialog").locator("input").fill("https://example.com/guide");
  await t.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await t.waitForTimeout(100);
  if (shots) await t.screenshot({ path: `${shots}/11-b3-format.png` });

  // 25. Merge value puts a merge tag at the caret
  await t.keyboard.press("End");
  await t.locator("[aria-label='Text format'] [aria-label='Merge value']").click();
  await t.getByRole("menuitem", { name: "First name" }).click();
  await settleSave();
  const html1 = String((await blockOf(tt.id))?.html ?? "");
  check(/<b>Hello there<\/b>/.test(html1) && html1.includes('href="https://example.com/guide"') && html1.includes("{{first_name}}"), `bold, the link and the merge value save (${html1})`);

  // 26. Paste: rich keeps bold and drops scripts; ⌘⇧V is plain; Markdown with a heading and a list adds blocks
  await paste({ "text/html": "<b>Pasted</b><script>alert(1)</script> words", "text/plain": "Pasted words" });
  await paste({ "text/html": "<i>plain please</i>", "text/plain": "plain please" }, true);
  await settleSave();
  const html2 = String((await blockOf(tt.id))?.html ?? "");
  check(html2.includes("<b>Pasted</b>") && !html2.includes("script") && !html2.includes("alert"), "a rich paste keeps bold and drops a script");
  check(html2.includes("plain please") && !html2.includes("<i>plain please</i>"), "⌘⇧V pastes plain words");
  await paste({ "text/plain": "# Agenda\n- First thing\n- Second thing" });
  await t.waitForTimeout(150);
  check((await editing()) === null && (await t.locator("[data-canvas-tag='pick']").textContent()) === "List", "a Markdown paste ends typing and picks the new list");
  await settleSave();
  const tcol = (await tdoc()).sections.flatMap((x) => x.columns).find((c) => c.blocks.some((b) => b.id === tt.id))!;
  const atIdx = tcol.blocks.findIndex((b) => b.id === tt.id);
  const tadded = tcol.blocks.slice(atIdx + 1, atIdx + 3) as unknown as { type: string; text?: string; items?: string[] }[];
  check(tadded[0]?.type === "heading" && tadded[0].text === "Agenda" && tadded[1]?.type === "list" && tadded[1].items?.join("|") === "First thing|Second thing", "it adds a Heading and a List right after the text");

  // 27. A button label types and Enter ends
  const tb2 = await tpart("button");
  await t.mouse.click(tb2.x, tb2.y);
  await t.keyboard.press("Enter");
  await t.keyboard.press("Control+a");
  await t.keyboard.type("Book now");
  await t.keyboard.press("Enter");
  await t.waitForTimeout(100);
  check((await editing()) === null, "Enter ends typing in a button");
  await settleSave();
  check((await blockOf(tb2.id))?.label === "Book now", "the button's new label saves");

  // 28. While typing, the wheel still pans; a click on another part ends typing and picks it
  const hh2 = await tpart("heading", 1);
  await t.mouse.click(hh2.x, hh2.y);
  await t.mouse.dblclick(hh2.x, hh2.y);
  const pan0 = (await t.locator("[data-email]").first().boundingBox())!;
  await t.mouse.move(pan0.x + 100, pan0.y + 200);
  await t.mouse.wheel(0, 100);
  await t.waitForTimeout(100);
  const pan1 = (await t.locator("[data-email]").first().boundingBox())!;
  check(Math.abs(pan0.y - pan1.y - 100) < 3 && (await editing()) !== null, "the wheel pans the canvas over the email being typed in");
  const other2 = await tpart("text", 3);
  await t.mouse.click(other2.x, other2.y);
  await t.waitForTimeout(150);
  check((await editing()) === null && (await t.locator("[data-canvas-pick]").first().getAttribute("data-canvas-pick")) === other2.id, "a click on another part ends typing and picks it");

  // 29. A typing run, pauses and all, is one undo step
  const runBefore = String((await blockOf(hh2.id))?.text ?? "");
  const hh3 = await tpart("heading", 1);
  await t.mouse.click(hh3.x, hh3.y);
  await t.keyboard.press("Enter");
  await t.keyboard.press("End");
  await t.keyboard.type(" one");
  await t.waitForTimeout(1300);
  await t.keyboard.type(" two");
  await t.waitForTimeout(1300);
  await t.keyboard.press("Escape");
  await settleSave();
  check((await blockOf(hh2.id))?.text === `${runBefore} one two`, "the run saves as typed");
  await t.keyboard.press("Control+z");
  await settleSave();
  check((await blockOf(hh2.id))?.text === runBefore, "one ⌘Z takes the whole run back");
  void tcalls;
  await t.close();

  // 22. A sent email's panel is read-only
  const sent = await ctx.newPage();
  sent.on("pageerror", (e) => errors.push(e.message));
  await sent.goto(`http://localhost:${port}/?group=ungrouped&n=1`);
  await sent.waitForFunction(() => document.querySelectorAll("[data-email] iframe").length >= 2, null, { timeout: 15000 });
  await sent.waitForTimeout(400);
  const sl = (await sent.locator("[data-canvas-item]").filter({ hasText: "Weekly note #1" }).first().boundingBox())!;
  await sent.mouse.click(sl.x + 40, sl.y + sl.height + 80);
  await sent.waitForTimeout(120);
  const sp2 = sent.locator("aside[aria-label='Element']");
  check((await sp2.locator("text=Sent emails can't change. Duplicate to edit.").count()) === 1 && (await sp2.locator("fieldset[disabled]").count()) === 1, "a sent email's panel is read-only");
  await sent.keyboard.press("Delete");
  await sent.waitForTimeout(200);
  check(!(await sent.evaluate(() => (window as unknown as W).calls.some((c) => c.mode === "email_draft_save"))), "keys change nothing in a sent email");
  await sent.close();

  {
  // B4 ----------------------------------------------------------------------------------------------------------------
  // Each new page starts fresh: the canvas remembers its view and left panel on this computer.
  await ctx.addInitScript(() => {
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith("claritia:canvas")) localStorage.removeItem(k);
    } catch {
      /* no storage */
    }
  });
  type W4 = { calls: Call[]; failNext: unknown; db: { emails: { id: string; name: string; status: string; doc: Doc }[] } };
  const g = await ctx.newPage();
  g.on("pageerror", (e) => errors.push(e.message));
  const openCanvas = async (pg: typeof g, query = "") => {
    await pg.goto(`http://localhost:${port}/${query}`);
    await pg.waitForFunction(() => document.querySelectorAll("[data-email] iframe").length >= 2, null, { timeout: 15000 });
    await pg.waitForTimeout(500);
  };
  await openCanvas(g);
  const gcalls = () => g.evaluate(() => (window as unknown as W4).calls);
  const gclear = () => g.evaluate(() => ((window as unknown as W4).calls.length = 0));
  const gdoc = (name: string) => g.evaluate((n) => (window as unknown as W4).db.emails.find((e) => e.name === n)!.doc, name);
  const gid = (name: string) => g.evaluate((n) => (window as unknown as W4).db.emails.find((e) => e.name === n)!.id, name);
  const ids = (d: Doc) => d.sections.flatMap((x) => x.columns.flatMap((c) => c.blocks.map((b) => b.id)));
  /** A part's or element's page box inside email i's frame: by part class (`kind`) or by element id (`#id`). */
  const gbox = (i: number, what: string, n = 0) =>
    g.evaluate(
      ([i, what, n]) => {
        const f = document.querySelectorAll<HTMLIFrameElement>("[data-email] iframe")[i as number]!;
        const d = f.contentDocument!;
        const els = (what as string).startsWith("#")
          ? [d.querySelector<HTMLElement>(`[data-eid="${(what as string).slice(1)}"]`)!]
          : [...d.querySelectorAll<HTMLElement>("[class]")].filter((e) => [...e.classList].some((c) => new RegExp(`^c[a-z0-9]+-${what}$`).test(c)));
        const el = els[n as number]!;
        const fr = f.getBoundingClientRect();
        const z = fr.width / f.offsetWidth;
        const b = el.getBoundingClientRect();
        const id = (what as string).startsWith("#") ? (what as string).slice(1) : el.closest("[data-eid]")!.getAttribute("data-eid")!;
        return { x: fr.left + b.left * z, y: fr.top + b.top * z, w: b.width * z, h: b.height * z, id };
      },
      [i, what, n] as const,
    );
  const dragTo = async (from: { x: number; y: number }, to: { x: number; y: number }, o: { hold?: () => Promise<void>; release?: boolean } = {}) => {
    await g.mouse.move(from.x, from.y);
    await g.mouse.down();
    await g.mouse.move(from.x + 8, from.y + 8, { steps: 3 });
    await g.mouse.move(to.x, to.y, { steps: 10 });
    await g.waitForTimeout(80);
    if (o.hold) await o.hold();
    if (o.release !== false) await g.mouse.up();
    await g.waitForTimeout(120);
  };
  const welcomeId = await gid("Welcome");
  const reminderId = await gid("Class reminder");
  const newsId = await gid("Monthly news");

  // 30. Drag a heading below the next block: the line and chip show, the source dims; one save with the new order
  const w0 = await gdoc("Welcome");
  const s1 = w0.sections[1]!.columns[0]!.blocks.map((b) => b.id);
  const hd = await gbox(0, `#${s1[1]}`);
  const nx = await gbox(0, `#${s1[2]}`);
  await gclear();
  let seen = { line: false, chip: "", dim: "" };
  await dragTo({ x: hd.x + 30, y: hd.y + hd.h / 2 }, { x: nx.x + 30, y: nx.y + nx.h * 0.8 }, {
    hold: async () => {
      seen = {
        line: (await g.locator("[data-drop-line]").count()) === 1,
        chip: (await g.locator("[data-drag-chip]").textContent()) ?? "",
        dim: await g.evaluate((id) => getComputedStyle(document.querySelectorAll<HTMLIFrameElement>("[data-email] iframe")[0]!.contentDocument!.querySelector(`[data-eid="${id}"]`)!).opacity, s1[1]!),
      };
    },
  });
  check(seen.line && seen.chip.startsWith("Heading") && seen.dim === "0.4", `while dragging: the line, the chip (${seen.chip}) and the source at 40% (${seen.dim})`);
  await g.waitForTimeout(1100);
  const w1 = await gdoc("Welcome");
  check(JSON.stringify(w1.sections[1]!.columns[0]!.blocks.map((b) => b.id)) === JSON.stringify([s1[0], s1[2], s1[1]]) && (await gcalls()).filter((c) => c.mode === "email_draft_save").length === 1, "the drop moves the heading below and one save goes out");

  // 31. Escape mid-drag changes nothing
  await gclear();
  const hd2 = await gbox(0, `#${s1[1]}`);
  await dragTo({ x: hd2.x + 30, y: hd2.y + hd2.h / 2 }, { x: hd2.x + 30, y: hd2.y - 60 }, { hold: async () => g.keyboard.press("Escape"), release: true });
  await g.waitForTimeout(900);
  check(!(await gcalls()).some((c) => c.mode === "email_draft_save") && (await g.locator("[data-drag-chip]").count()) === 0, "Escape during a drag changes and saves nothing");

  // 32. Near the line between two sections, a block lands as a section of its own
  const before32 = await gdoc("Welcome");
  const sec2 = await gbox(0, `#${before32.sections[2]!.id}`);
  const mover = before32.sections[1]!.columns[0]!.blocks[0]!.id;
  const mb = await gbox(0, `#${mover}`);
  await dragTo({ x: mb.x + 30, y: mb.y + mb.h / 2 }, { x: sec2.x + 60, y: sec2.y + 1 });
  await g.waitForTimeout(1100);
  const after32 = await gdoc("Welcome");
  check(after32.sections.length === before32.sections.length + 1 && JSON.stringify(after32.sections[2]!.columns[0]!.blocks.map((b) => b.id)) === JSON.stringify([mover]), "a drop on the line between sections makes a section holding only that block");

  // 33. Into another email: it leaves one and joins the other; the gaining email saves first
  await gclear();
  const moving = (await gdoc("Welcome")).sections[3]!.columns[0]!.blocks[0]!.id;
  const mv = await gbox(0, `#${moving}`);
  const into = await gbox(1, "text", 2);
  await dragTo({ x: mv.x + 30, y: mv.y + mv.h / 2 }, { x: into.x + 20, y: into.y + into.h * 0.8 });
  await g.waitForTimeout(1300);
  const saves33 = (await gcalls()).filter((c) => c.mode === "email_draft_save").map((c) => c.body.p_id);
  const wAfter = await gdoc("Welcome");
  const rAfter = await gdoc("Class reminder");
  check(!ids(wAfter).includes(moving), "the block left Welcome");
  check(saves33[0] === reminderId && saves33[1] === welcomeId && saves33.length === 2, `the gaining email saved first (${saves33.join(", ")})`);
  const rCount = ids(rAfter).length;

  // 34. One ⌘Z puts it back in both
  await gclear();
  await g.keyboard.press("Control+z");
  await g.waitForTimeout(1300);
  check(ids(await gdoc("Welcome")).includes(moving) && ids(await gdoc("Class reminder")).length === rCount - 1 && (await gcalls()).filter((c) => c.mode === "email_draft_save").length === 2, "one ⌘Z takes the move back in both emails (two saves)");

  // 35. A flaky save: the gainer's first save fails with a 503, is tried again on its own, then the loser saves
  await gclear();
  await g.evaluate((id) => ((window as unknown as W4).failNext = { fn: "email_draft_save", email: id, kind: "503" }), reminderId);
  const mv2 = await gbox(0, `#${moving}`);
  const into2 = await gbox(1, "text", 2);
  await dragTo({ x: mv2.x + 30, y: mv2.y + mv2.h / 2 }, { x: into2.x + 20, y: into2.y + into2.h * 0.8 });
  await g.waitForTimeout(2600);
  const seq35 = (await gcalls()).filter((c) => c.mode.startsWith("email_draft_save")).map((c) => `${c.mode === "email_draft_save" ? "" : "503:"}${c.body.p_id === reminderId ? "gainer" : "loser"}`);
  check(seq35.join(",") === "503:gainer,gainer,loser" && (await g.locator("[role='alert']").count()) === 0, `a flaky save is tried again, then the loser saves (${seq35.join(", ")})`);
  check(!ids(await gdoc("Welcome")).includes(moving) && ids(await gdoc("Class reminder")).length === rCount, "nothing is lost after the retry");

  // 36. Alt-drag copies; the original stays
  await gclear();
  const cp = (await gdoc("Welcome")).sections[1]!.columns[0]!.blocks[0]!.id;
  const cpb = await gbox(0, `#${cp}`);
  const into3 = await gbox(1, "text", 1);
  await g.mouse.move(cpb.x + 30, cpb.y + cpb.h / 2);
  await g.mouse.down();
  await g.keyboard.down("Alt");
  await g.mouse.move(cpb.x + 40, cpb.y + cpb.h / 2 + 10, { steps: 3 });
  await g.mouse.move(into3.x + 20, into3.y + into3.h * 0.8, { steps: 10 });
  await g.waitForTimeout(80);
  const chip36 = (await g.locator("[data-drag-chip]").textContent()) ?? "";
  await g.mouse.up();
  await g.keyboard.up("Alt");
  await g.waitForTimeout(1300);
  check(chip36.includes("Copy") && ids(await gdoc("Welcome")).includes(cp) && ids(await gdoc("Class reminder")).length === rCount + 1, `Alt-drag copies and the original stays (${chip36})`);

  // 37. Auto-pan: holding a drag near the right edge moves the canvas
  const stg = (await g.locator("[role='application']").boundingBox())!;
  const a0 = (await g.locator("[data-email]").first().boundingBox())!;
  const ap = await gbox(0, "text", 1);
  await dragTo({ x: ap.x + 30, y: ap.y + ap.h / 2 }, { x: stg.x + stg.width - 8, y: stg.y + stg.height / 2 }, { hold: async () => g.waitForTimeout(500), release: false });
  const a1 = (await g.locator("[data-email]").first().boundingBox())!;
  await g.keyboard.press("Escape");
  await g.mouse.up();
  check(a0.x - a1.x > 40, `holding a drag at the right edge pans the canvas (${Math.round(a0.x - a1.x)} px)`);

  // 38. Sent meanwhile: the gaining email answers "not a draft"; the move is taken back and the loser never saves
  await g.keyboard.press("Shift+Digit1");
  await g.waitForTimeout(400);
  await gclear();
  await g.evaluate((id) => ((window as unknown as W4).failNext = { fn: "email_draft_save", email: id, kind: "not a draft" }), newsId);
  const sm = (await gdoc("Welcome")).sections[1]!.columns[0]!.blocks[0]!.id;
  const smb = await gbox(0, `#${sm}`);
  const into4 = await gbox(2, "text", 1);
  await dragTo({ x: smb.x + 30, y: smb.y + smb.h / 2 }, { x: into4.x + 20, y: into4.y + into4.h * 0.8 });
  await g.waitForTimeout(2000);
  const saves38 = (await gcalls()).filter((c) => c.mode.startsWith("email_draft_save")).map((c) => c.body.p_id);
  const back38 = await g.evaluate((id) => !!document.querySelectorAll<HTMLIFrameElement>("[data-email] iframe")[0]!.contentDocument!.querySelector(`[data-eid="${id}"]`), sm);
  check(!saves38.includes(welcomeId) && back38 && (await g.locator("[role='status']").filter({ hasText: "was sent, so the block stayed in Welcome" }).count()) === 1, "a gaining email sent meanwhile: the move is taken back, the loser never saves, and the message says so");
  if (shots) await g.screenshot({ path: `${shots}/12-b4-drag.png` });
  await g.close();

  // 39. Dragging out of a sent email copies, and the sent email doesn't change
  const ug = await ctx.newPage();
  ug.on("pageerror", (e) => errors.push(e.message));
  await ug.goto(`http://localhost:${port}/?group=ungrouped&n=1`);
  await ug.waitForFunction(() => document.querySelectorAll("[data-email] iframe").length >= 2, null, { timeout: 15000 });
  await ug.waitForTimeout(500);
  const order39 = await ug.evaluate(() => [...document.querySelectorAll("[data-email]")].map((e) => (e as HTMLElement).dataset.email!));
  const sentIdx = await ug.evaluate((o) => o.indexOf((window as unknown as W4).db.emails.find((e) => e.status === "sent")!.id), order39);
  const draftIdx = 1 - sentIdx;
  const sentBefore = await ug.evaluate(() => JSON.stringify((window as unknown as W4).db.emails.find((e) => e.status === "sent")!.doc));
  const srcBox = await ug.evaluate((i) => {
    const f = document.querySelectorAll<HTMLIFrameElement>("[data-email] iframe")[i]!;
    const el = [...f.contentDocument!.querySelectorAll<HTMLElement>("[class]")].find((e) => [...e.classList].some((c) => /^c[a-z0-9]+-heading$/.test(c)))!;
    const fr = f.getBoundingClientRect();
    const z = fr.width / f.offsetWidth;
    const b = el.getBoundingClientRect();
    return { x: fr.left + (b.left + 20) * z, y: fr.top + (b.top + b.height / 2) * z };
  }, sentIdx);
  const dstBox = await ug.evaluate((i) => {
    const f = document.querySelectorAll<HTMLIFrameElement>("[data-email] iframe")[i]!;
    const el = [...f.contentDocument!.querySelectorAll<HTMLElement>("[class]")].filter((e) => [...e.classList].some((c) => /^c[a-z0-9]+-text$/.test(c)))[1]!;
    const fr = f.getBoundingClientRect();
    const z = fr.width / f.offsetWidth;
    const b = el.getBoundingClientRect();
    return { x: fr.left + (b.left + 20) * z, y: fr.top + (b.top + b.height * 0.8) * z };
  }, draftIdx);
  const draftId = order39[draftIdx]!;
  const countOf = (id: string) => ug.evaluate((i) => (window as unknown as W4).db.emails.find((e) => e.id === i)!.doc.sections.flatMap((x) => x.columns.flatMap((c) => c.blocks)).length, id);
  const draftCount = await countOf(draftId);
  await ug.mouse.move(srcBox.x, srcBox.y);
  await ug.mouse.down();
  await ug.mouse.move(srcBox.x + 10, srcBox.y + 10, { steps: 3 });
  await ug.mouse.move(dstBox.x, dstBox.y, { steps: 10 });
  await ug.waitForTimeout(80);
  const chip39 = (await ug.locator("[data-drag-chip]").textContent()) ?? "";
  await ug.mouse.up();
  await ug.waitForTimeout(1300);
  const after39 = { sent: await ug.evaluate(() => JSON.stringify((window as unknown as W4).db.emails.find((e) => e.status === "sent")!.doc)), count: await countOf(draftId) };
  check(chip39.includes("Copy") && after39.sent === sentBefore && after39.count === draftCount + 1, `a drag from a sent email copies and the sent email doesn't change (${chip39})`);
  await ug.close();

  // 40. Resize a picture by its corner: the width tag shows; release saves one width
  const rz = await ctx.newPage();
  rz.on("pageerror", (e) => errors.push(e.message));
  await openCanvas(rz);
  const rzBox = (sel: string) =>
    rz.evaluate((sel) => {
      const f = document.querySelectorAll<HTMLIFrameElement>("[data-email] iframe")[0]!;
      const el = [...f.contentDocument!.querySelectorAll<HTMLElement>("[class]")].find((e) => [...e.classList].some((c) => new RegExp(sel).test(c)))!;
      const fr = f.getBoundingClientRect();
      const z = fr.width / f.offsetWidth;
      const b = el.getBoundingClientRect();
      const cell = el.closest("[data-eid]") as HTMLElement;
      const cs = getComputedStyle(cell);
      return { x: fr.left + b.left * z, y: fr.top + b.top * z, w: b.width * z, h: b.height * z, lw: b.width, id: cell.getAttribute("data-eid")!, max: cell.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), z };
    }, sel);
  const rcalls = () => rz.evaluate(() => (window as unknown as W4).calls);
  const logo = await rzBox("^c[a-z0-9]+-image$");
  await rz.mouse.click(logo.x + logo.w / 2, logo.y + logo.h / 2);
  await rz.waitForTimeout(150);
  const handle = rz.locator("[data-handle='br']");
  check(await handle.isVisible(), "a picked picture shows its corner handles");
  const hb = (await handle.boundingBox())!;
  await rz.evaluate(() => ((window as unknown as W4).calls.length = 0));
  await rz.mouse.move(hb.x + 5, hb.y + 5);
  await rz.mouse.down();
  await rz.mouse.move(hb.x + 5 + 20, hb.y + 5, { steps: 4 });
  const tag40 = (await rz.locator("[data-width-tag]").textContent()) ?? "";
  await rz.mouse.up();
  await rz.waitForTimeout(1100);
  const saved40 = (await rcalls()).filter((c) => c.mode === "email_draft_save");
  const logoAfter = (saved40[0]?.body.p_doc as { sections: { columns: { blocks: { id: string; width?: number }[] }[] }[] } | undefined)?.sections.flatMap((x) => x.columns.flatMap((c) => c.blocks)).find((b) => b.id === logo.id);
  check(tag40.includes(`${Math.round(logo.lw + 20 / logo.z)} px`) && saved40.length === 1 && logoAfter?.width === Math.round(logo.lw + 20 / logo.z), `dragging a corner shows the width (${tag40}) and saves it once (${logoAfter?.width})`);

  // 41. Near the column's width it snaps; Shift turns snapping off
  const l2 = await rzBox("^c[a-z0-9]+-image$");
  const h2 = (await rz.locator("[data-handle='br']").boundingBox())!;
  const toNear = (l2.max - 3 - l2.lw) * l2.z;
  await rz.mouse.move(h2.x + 5, h2.y + 5);
  await rz.mouse.down();
  await rz.mouse.move(h2.x + 5 + toNear, h2.y + 5, { steps: 4 });
  const snapTag = (await rz.locator("[data-width-tag]").textContent()) ?? "";
  await rz.keyboard.down("Shift");
  await rz.mouse.move(h2.x + 5 + toNear + 0.5, h2.y + 5, { steps: 1 });
  const freeTag = (await rz.locator("[data-width-tag]").textContent()) ?? "";
  await rz.keyboard.press("Escape");
  await rz.keyboard.up("Shift");
  await rz.mouse.up();
  check(snapTag.includes("Column width") && !freeTag.includes("Column width"), `it snaps to the column (${snapTag}); Shift doesn't (${freeTag})`);
  const l3 = await rzBox("^c[a-z0-9]+-image$");
  check(Math.abs(l3.lw - l2.lw) < 1, "Escape puts the picture back");

  // 42. A centered picture grows from both sides
  await rz.locator("aside[aria-label='Element'] [role='radio']").filter({ hasText: "Center" }).first().click();
  await rz.waitForTimeout(1100);
  const l4 = await rzBox("^c[a-z0-9]+-image$");
  const h4 = (await rz.locator("[data-handle='br']").boundingBox())!;
  await rz.mouse.move(h4.x + 5, h4.y + 5);
  await rz.mouse.down();
  await rz.mouse.move(h4.x + 5 + 10, h4.y + 5, { steps: 3 });
  const tag42 = (await rz.locator("[data-width-tag]").textContent()) ?? "";
  await rz.keyboard.press("Escape");
  await rz.mouse.up();
  check(tag42.startsWith(`${Math.round(l4.lw + (2 * 10) / l4.z)} px`), `a centered picture grows twice the pointer's move (${tag42})`);

  // 43. Double-click a picture: its library opens in the panel
  const l5 = await rzBox("^c[a-z0-9]+-image$");
  await rz.mouse.dblclick(l5.x + l5.w / 2, l5.y + l5.h / 2);
  await rz.waitForTimeout(250);
  check(await rz.getByRole("dialog", { name: "Images" }).isVisible(), "a double-click on a picture opens its library");
  if (shots) await rz.screenshot({ path: `${shots}/13-b4-resize.png` });
  await rz.close();
  // 44. The + panel: the button and A open it
  const ad = await ctx.newPage();
  ad.on("pageerror", (e) => errors.push(e.message));
  await openCanvas(ad);
  const acalls = () => ad.evaluate(() => (window as unknown as W4).calls);
  const adoc = (name: string) => ad.evaluate((n) => (window as unknown as W4).db.emails.find((e) => e.name === n)!.doc, name);
  const abox = (i: number, what: string, n = 0) =>
    ad.evaluate(
      ([i, what, n]) => {
        const f = document.querySelectorAll<HTMLIFrameElement>("[data-email] iframe")[i as number]!;
        const d = f.contentDocument!;
        const els = (what as string).startsWith("#") ? [d.querySelector<HTMLElement>(`[data-eid="${(what as string).slice(1)}"]`)!] : (what as string).startsWith("[") ? [...d.querySelectorAll<HTMLElement>(what as string)] : [...d.querySelectorAll<HTMLElement>("[class]")].filter((e) => [...e.classList].some((c) => new RegExp(`^c[a-z0-9]+-${what}$`).test(c)));
        const el = els[n as number]!;
        const fr = f.getBoundingClientRect();
        const z = fr.width / f.offsetWidth;
        const b = el.getBoundingClientRect();
        return { x: fr.left + b.left * z, y: fr.top + b.top * z, w: b.width * z, h: b.height * z, id: el.closest("[data-eid]")?.getAttribute("data-eid") ?? "" };
      },
      [i, what, n] as const,
    );
  await ad.getByRole("button", { name: "Add a block" }).click();
  check(await ad.locator("aside[aria-label='Add']").isVisible(), "the + button opens the add panel");
  await ad.locator("aside[aria-label='Add'] [aria-label='Close the add panel']").click();
  await ad.locator("[role='application']").focus();
  await ad.keyboard.press("a");
  check(await ad.locator("aside[aria-label='Add']").isVisible(), "A opens it too");

  // 45. With a block picked, click Heading: it lands right after, picked, typing with its words selected
  const at45 = (await adoc("Welcome")).sections[1]!.columns[0]!.blocks.map((b) => b.id);
  const pb = await abox(0, `#${at45[0]}`);
  await ad.mouse.click(pb.x + 30, pb.y + pb.h / 2);
  await ad.locator("aside[aria-label='Add'] [data-add='heading']").click();
  await ad.waitForTimeout(250);
  const typingNow = await ad.evaluate(() => !!document.querySelectorAll<HTMLIFrameElement>("[data-email] iframe")[0]!.contentDocument!.querySelector("[contenteditable='true']"));
  await ad.keyboard.type("New title");
  await ad.keyboard.press("Escape");
  await ad.waitForTimeout(1100);
  const s45 = (await adoc("Welcome")).sections[1]!.columns[0]!.blocks as unknown as { id: string; type: string; text?: string }[];
  check(typingNow && s45[1]?.type === "heading" && s45[1].text === "New title" && s45[0]!.id === at45[0], `a Heading lands after the picked block and types at once (${s45[1]?.text})`);

  // 46. Drag "2 columns" between two sections: a section with two empty columns and their dashed boxes
  const d46 = await adoc("Welcome");
  const secB = await abox(0, `#${d46.sections[3]!.id}`);
  const tile = (await ad.locator("aside[aria-label='Add'] [data-add='c2']").boundingBox())!;
  await ad.mouse.move(tile.x + tile.width / 2, tile.y + tile.height / 2);
  await ad.mouse.down();
  await ad.mouse.move(tile.x + tile.width / 2 + 10, tile.y + tile.height / 2 + 10, { steps: 3 });
  await ad.mouse.move(secB.x + 60, secB.y + 4, { steps: 10 });
  await ad.waitForTimeout(80);
  await ad.mouse.up();
  await ad.waitForTimeout(1100);
  const d46b = await adoc("Welcome");
  const newSec = d46b.sections[3]!;
  const empties = await ad.evaluate(() => document.querySelectorAll<HTMLIFrameElement>("[data-email] iframe")[0]!.contentDocument!.querySelectorAll("[data-empty]").length);
  check(d46b.sections.length === d46.sections.length + 1 && newSec.columns.length === 2 && newSec.columns.every((c) => !c.blocks.length) && empties === 2, `dragging 2 columns adds an empty two-column section with its dashed boxes (${empties})`);

  // 47. Drag a Text tile into an empty column's box
  const emptyBox = await abox(0, "[data-empty]", 1);
  const tt47 = (await ad.locator("aside[aria-label='Add'] [data-add='text']").boundingBox())!;
  await ad.mouse.move(tt47.x + tt47.width / 2, tt47.y + tt47.height / 2);
  await ad.mouse.down();
  await ad.mouse.move(tt47.x + 20, tt47.y + 20, { steps: 3 });
  await ad.mouse.move(emptyBox.x + emptyBox.w / 2, emptyBox.y + emptyBox.h / 2, { steps: 10 });
  await ad.waitForTimeout(80);
  await ad.mouse.up();
  await ad.waitForTimeout(400);
  await ad.keyboard.press("Escape");
  await ad.waitForTimeout(1100);
  const d47 = await adoc("Welcome");
  check(d47.sections[3]!.columns[1]!.blocks.length === 1 && d47.sections[3]!.columns[1]!.blocks[0]!.type === "text", "a Text tile dropped on an empty column's box lands in that column");

  // 48. The component tile adds a use of it after the picked section
  const sb48 = await abox(0, `#${d47.sections[1]!.id}`);
  await ad.mouse.click(sb48.x + sb48.w - 6, sb48.y + 4);
  await ad.keyboard.press("Escape");
  await ad.waitForTimeout(100);
  const tag48 = await ad.locator("[data-canvas-tag='pick']").textContent().catch(() => "");
  if (tag48 !== "Section") {
    await ad.mouse.click(sb48.x + 60, sb48.y + sb48.h / 2);
    await ad.keyboard.press("Escape");
  }
  await ad.locator("aside[aria-label='Add'] [data-add='cmp:cmp1']").click();
  await ad.waitForTimeout(1100);
  const d48 = await adoc("Welcome") as unknown as { sections: { component?: { id: string } }[] };
  check(d48.sections.some((x) => x.component?.id === "cmp1"), "a component tile adds a use of the component");
  if (shots) await ad.screenshot({ path: `${shots}/14-b4-add.png` });

  // 49. ⌘C a section in Welcome, ⌘V in Class reminder: the copy lands with new ids
  const clipCopy = () =>
    ad.evaluate(() => {
      const dt = new DataTransfer();
      (document.activeElement ?? document.body).dispatchEvent(new ClipboardEvent("copy", { clipboardData: dt, bubbles: true, cancelable: true }));
      return Object.fromEntries(dt.types.map((t) => [t, dt.getData(t)]));
    });
  const clipCut = () =>
    ad.evaluate(() => {
      const dt = new DataTransfer();
      (document.activeElement ?? document.body).dispatchEvent(new ClipboardEvent("cut", { clipboardData: dt, bubbles: true, cancelable: true }));
      return Object.fromEntries(dt.types.map((t) => [t, dt.getData(t)]));
    });
  const clipPaste = (data: Record<string, string>) =>
    ad.evaluate((data) => {
      const dt = new DataTransfer();
      for (const [k, v] of Object.entries(data)) dt.setData(k, v);
      (document.activeElement ?? document.body).dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    }, data);
  await ad.locator("aside[aria-label='Add'] [aria-label='Close the add panel']").click();
  const w49 = await adoc("Welcome");
  const plain49 = (w49.sections as (Doc["sections"][number] & { component?: unknown })[]).findIndex((x, i) => i >= 1 && !x.component && x.columns.length === 1 && x.columns[0]!.blocks.length > 1);
  const secC = await abox(0, `#${w49.sections[plain49]!.columns[0]!.blocks[0]!.id}`);
  await ad.mouse.click(secC.x + 30, secC.y + secC.h / 2);
  for (let i = 0; i < 2 && (await ad.locator("[data-canvas-tag='pick']").textContent().catch(() => "")) !== "Section"; i++) await ad.keyboard.press("Escape");
  const copied = await clipCopy();
  check(!!copied["application/x-claritia-email+json"] && (copied["text/html"] ?? "").includes("data-claritia-clip") && !!copied["text/plain"], "⌘C puts the section on the clipboard three ways");
  const r49 = await adoc("Class reminder");
  const into49 = await abox(1, `#${r49.sections[1]!.columns[0]!.blocks[0]!.id}`);
  await ad.mouse.click(into49.x + 30, into49.y + into49.h / 2);
  for (let i = 0; i < 2 && (await ad.locator("[data-canvas-tag='pick']").textContent().catch(() => "")) !== "Section"; i++) await ad.keyboard.press("Escape");
  await clipPaste(copied);
  await ad.waitForTimeout(1100);
  const r49b = await adoc("Class reminder");
  const srcIds = w49.sections[plain49]!.columns.flatMap((c) => c.blocks.map((b) => b.id));
  const pasted = r49b.sections[2]!;
  check(r49b.sections.length === r49.sections.length + 1 && pasted.columns.flatMap((c) => c.blocks).length === srcIds.length && !pasted.columns.flatMap((c) => c.blocks.map((b) => b.id)).some((id) => srcIds.includes(id)), "⌘V in another email pastes the section after the picked one, with new ids");

  // 50. ⌘X then ⌘V elsewhere: gone from one place, in the other
  const w50 = await adoc("Welcome");
  const cutId = w50.sections[1]!.columns[0]!.blocks[0]!.id;
  const cb50 = await abox(0, `#${cutId}`);
  await ad.mouse.click(cb50.x + 30, cb50.y + cb50.h / 2);
  const cutData = await clipCut();
  await ad.waitForTimeout(100);
  const r50 = await adoc("Class reminder");
  const into50 = await abox(1, `#${r50.sections[1]!.columns[0]!.blocks[0]!.id}`);
  await ad.mouse.click(into50.x + 30, into50.y + into50.h / 2);
  await clipPaste(cutData);
  await ad.waitForTimeout(1300);
  check(!ids(await adoc("Welcome")).includes(cutId) && ids(await adoc("Class reminder")).length === ids(r50).length + 1, "⌘X removes it and ⌘V puts it in the other email");

  // 51. A crafted clip pastes without its script or bad link
  const evil = { claritia: "email-clip", v: 1, kind: "block", el: { id: "evil1", type: "text", html: '<p>Safe words<script>alert(1)</script> <a href="javascript:alert(2)">link</a></p>' }, styles: {}, classes: {}, kit: null, ws: "", from: "" };
  await clipPaste({ "application/x-claritia-email+json": JSON.stringify(evil), "text/plain": "Safe words" });
  await ad.waitForTimeout(1100);
  const r51 = JSON.stringify(await adoc("Class reminder"));
  check(r51.includes("Safe words") && !r51.includes("script") && !r51.includes("javascript"), "a crafted clip pastes without its script or bad link");

  // 52. Words with a Markdown heading and a list paste as blocks after the picked one
  const before52 = ids(await adoc("Class reminder")).length;
  await clipPaste({ "text/plain": "# From notes\n- First point\n- Second point" });
  await ad.waitForTimeout(1100);
  const r52 = (await adoc("Class reminder")).sections.flatMap((x) => x.columns.flatMap((c) => c.blocks)) as unknown as { type: string; text?: string; items?: string[] }[];
  check(r52.length === before52 + 2 && r52.some((b) => b.type === "heading" && b.text === "From notes") && r52.some((b) => b.type === "list" && b.items?.join("|") === "First point|Second point"), "Markdown words paste as a Heading and a List");

  // 53. A clip's classes come along to an email on the same kit, and stay off on another kit
  const classed = { claritia: "email-clip", v: 1, kind: "block", el: { id: "cls9", type: "heading", text: "Classy", level: 2 }, styles: {}, classes: { cls9: ["big1"] }, kit: "aaaaaaaa-0000-4000-8000-000000000001", ws: "ws1", from: "x" };
  await clipPaste({ "application/x-claritia-email+json": JSON.stringify(classed), "text/plain": "Classy" });
  const n53 = await adoc("Monthly news");
  const into53 = await abox(2, `#${n53.sections[1]!.columns[0]!.blocks[0]!.id}`);
  await ad.mouse.click(into53.x + 30, into53.y + into53.h / 2);
  await clipPaste({ "application/x-claritia-email+json": JSON.stringify(classed), "text/plain": "Classy" });
  await ad.waitForTimeout(1300);
  const sameKit53 = JSON.stringify((await adoc("Class reminder") as unknown as { classes?: unknown }).classes ?? {});
  const otherKit53 = JSON.stringify((await adoc("Monthly news") as unknown as { classes?: unknown }).classes ?? {});
  check(sameKit53.includes("big1") && !otherKit53.includes("big1"), "classes come along on the same kit and stay off on another");

  // 54. Alt+Shift+→ moves the picked block into the next email, before its footer
  const w54 = await adoc("Welcome");
  const mv54 = w54.sections[1]!.columns[0]!.blocks[0]!.id;
  const b54 = await abox(0, `#${mv54}`);
  await ad.mouse.click(b54.x + 30, b54.y + b54.h / 2);
  await ad.keyboard.press("Alt+Shift+ArrowRight");
  await ad.waitForTimeout(1300);
  const r54 = await adoc("Class reminder");
  const footerSec = r54.sections.findIndex((x) => x.columns.some((c) => c.blocks.some((b) => b.type === "footer")));
  check(!ids(await adoc("Welcome")).includes(mv54) && r54.sections[footerSec - 1]!.columns[0]!.blocks.length === 1, "Alt+Shift+→ moves the block into the next email before its footer");

  // 55. Right-click a part: the menu; Delete removes it
  await ad.locator("[role='application']").focus();
  await ad.keyboard.press("Shift+Digit1");
  await ad.waitForTimeout(450);
  const w55 = await adoc("Welcome");
  const del55 = w55.sections[1]!.columns[0]!.blocks[0]!.id;
  const b55 = await abox(0, `#${del55}`);
  await ad.mouse.click(b55.x + 30, b55.y + b55.h / 2, { button: "right" });
  await ad.waitForTimeout(150);
  const menu55 = ad.getByRole("menu");
  check((await menu55.getByRole("menuitem").allTextContents()).join("|").startsWith("Add to chat⌘L|CommentC|Copy⌘C|Cut⌘X|Paste⌘V|Duplicate⌘D|Delete⌫"), "right-click opens the menu with Add to chat, Comment, Copy, Cut, Paste, Duplicate, Delete");
  await menu55.getByRole("menuitem", { name: /Delete/ }).click();
  await ad.waitForTimeout(1100);
  check(!ids(await adoc("Welcome")).includes(del55), "the menu's Delete removes it");

  // 56. Shift+F10 opens the menu for the picked element
  const w56 = await adoc("Welcome");
  const b56 = await abox(0, `#${w56.sections[1]!.columns[0]!.blocks[0]!.id}`);
  await ad.mouse.click(b56.x + 30, b56.y + b56.h / 2);
  await ad.keyboard.press("Shift+F10");
  await ad.waitForTimeout(150);
  check(await ad.getByRole("menu").isVisible(), "Shift+F10 opens the menu for the picked element");
  await ad.keyboard.press("Escape");

  // 57. Undo of a change in an email out of view pans back to it
  const w57 = await adoc("Welcome");
  const b57 = await abox(0, `#${w57.sections[1]!.columns[0]!.blocks[0]!.id}`);
  await ad.mouse.click(b57.x + 30, b57.y + b57.h / 2);
  await ad.keyboard.press("Delete");
  await ad.waitForTimeout(200);
  await ad.keyboard.press("Shift+Digit0");
  await ad.waitForTimeout(400);
  for (let i = 0; i < 6; i++) await ad.mouse.wheel(600, 0);
  await ad.waitForTimeout(200);
  const st57 = (await ad.locator("[role='application']").boundingBox())!;
  const off57 = (await ad.locator("[data-email]").first().boundingBox())!;
  await ad.locator("[role='application']").focus();
  await ad.keyboard.press("Control+z");
  await ad.waitForTimeout(700);
  const on57 = (await ad.locator("[data-email]").first().boundingBox())!;
  check(off57.x + off57.width < st57.x && on57.x + on57.width > st57.x && on57.x < st57.x + st57.width, "⌘Z of a change out of view pans back to it");
  void acalls;
  await ad.close();

  // 58. The add panel is a sheet on a phone
  const ph = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const pp = await ph.newPage();
  pp.on("pageerror", (e) => errors.push(e.message));
  await pp.goto(`http://localhost:${port}/`);
  await pp.waitForFunction(() => document.querySelectorAll("[data-email] iframe").length >= 1, null, { timeout: 15000 });
  await pp.waitForTimeout(300);
  await pp.getByRole("button", { name: "Add a block" }).click();
  const sheet58 = (await pp.locator("aside[aria-label='Add']").boundingBox())!;
  check(sheet58.y > 300 && Math.abs(sheet58.width - 390) < 2, "on a phone the add panel is a sheet from the bottom");
  await ph.close();
  // B5 ----------------------------------------------------------------------------------------------------------------
  // 60. Add to chat on a heading, ask: only that heading changes; the email locks while Tia writes
  const ti = await ctx.newPage();
  ti.on("pageerror", (e) => errors.push(e.message));
  await openCanvas(ti);
  await ti.evaluate(() => ((window as unknown as { chatDelay: number }).chatDelay = 700));
  const tdoc5 = (name: string) => ti.evaluate((n) => (window as unknown as W4).db.emails.find((e) => e.name === n)!.doc, name);
  const tcalls5 = () => ti.evaluate(() => (window as unknown as W4).calls);
  const tbox5 = (i: number, id: string) =>
    ti.evaluate(
      ([i, id]) => {
        const f = document.querySelectorAll<HTMLIFrameElement>("[data-email] iframe")[i as number]!;
        const el = f.contentDocument!.querySelector<HTMLElement>(`[data-eid="${id}"]`)!;
        const fr = f.getBoundingClientRect();
        const z = fr.width / f.offsetWidth;
        const b = el.getBoundingClientRect();
        return { x: fr.left + b.left * z, y: fr.top + b.top * z, w: b.width * z, h: b.height * z };
      },
      [i, id] as const,
    );
  const frameText = (i: number, id: string) => ti.evaluate(([i, id]) => document.querySelectorAll<HTMLIFrameElement>("[data-email] iframe")[i as number]!.contentDocument!.querySelector(`[data-eid="${id}"]`)?.textContent ?? "", [i, id] as const);
  const w60 = await tdoc5("Welcome");
  const head60 = w60.sections[1]!.columns[0]!.blocks[1]!.id;
  const text60 = w60.sections[1]!.columns[0]!.blocks[2]!.id;
  const before60 = await frameText(0, text60);
  const hb60 = await tbox5(0, head60);
  await ti.mouse.click(hb60.x + 30, hb60.y + hb60.h / 2);
  await ti.keyboard.press("Control+l");
  await ti.waitForTimeout(150);
  const chipText = (await ti.locator("[aria-label='Added to chat']").textContent()) ?? "";
  check((await ti.locator("aside[aria-label='Tia']").isVisible()) && chipText.includes("Welcome › Heading"), `⌘L adds the heading to the chat (${chipText})`);
  await ti.locator("aside[aria-label='Tia'] textarea").fill("Make it shorter");
  await ti.keyboard.press("Enter");
  await ti.waitForTimeout(250);
  check((await ti.locator("[data-tia-writing]").count()) === 1 && (await ti.locator("aside[aria-label='Element']").textContent())!.includes("Tia is changing this email"), "while Tia writes, the email shows it and its panel is read-only");
  await ti.waitForTimeout(900);
  const sent60 = (await tcalls5()).find((c) => c.mode === "chat")?.body as { scope?: { kind: string; ids?: string[] } } | undefined;
  check(sent60?.scope?.kind === "parts" && sent60.scope.ids?.[0] === head60, "the turn is scoped to the heading");
  check((await frameText(0, head60)) === "Tia's words" && (await frameText(0, text60)) === before60, "only the heading changed");
  check((await ti.locator("aside[aria-label='Tia'] button").filter({ hasText: "Changed the heading" }).count()) === 1, "Tia's reply lists the change by email");
  if (shots) await ti.screenshot({ path: `${shots}/15-b5-tia.png` });

  // 61. A 2-email turn: both lock, both change, one ⌘Z takes back both
  await ti.locator("aside[aria-label='Tia'] [aria-label^='Remove']").click();
  await ti.keyboard.press("Escape");
  await ti.keyboard.press("Escape");
  const boardName = async (name: string) => (await ti.locator("[data-canvas-item]").filter({ hasText: name }).first().boundingBox())!;
  for (const name of ["Welcome", "Class reminder"]) {
    const nb = await boardName(name);
    await ti.mouse.click(nb.x + 10, nb.y + nb.height / 2);
    await ti.getByRole("toolbar", { name: "Email actions" }).getByRole("button", { name: /Add to chat/ }).click();
  }
  await ti.locator("aside[aria-label='Tia'] textarea").fill("Make the headline warmer");
  await ti.keyboard.press("Enter");
  await ti.waitForTimeout(300);
  const locked61 = await ti.locator("[data-tia-writing]").count();
  await ti.waitForTimeout(1300);
  const r61 = await tdoc5("Class reminder");
  const firstHeading = (d: Doc) => (d.sections.flatMap((x) => x.columns.flatMap((c) => c.blocks)) as unknown as { type: string; text?: string }[]).find((b) => b.type === "heading")?.text;
  check(locked61 === 2 && firstHeading(r61) === "Tia's words" && firstHeading(await tdoc5("Welcome")) === "Tia's words", `a 2-email turn locks both (${locked61}) and changes both`);
  await ti.locator("[role='application']").focus();
  await ti.keyboard.press("Control+z");
  await ti.waitForTimeout(1300);
  check(firstHeading(await tdoc5("Class reminder")) !== "Tia's words", "one ⌘Z takes back Tia's turn in both emails");

  // 62. A brand-wide ask: the question with choices; the choice goes back with the yes
  await ti.locator("aside[aria-label='Tia'] textarea").fill("Bigger headings everywhere");
  await ti.keyboard.press("Enter");
  await ti.waitForTimeout(1200);
  const askCard = ti.locator("aside[aria-label='Tia']").getByRole("button", { name: "Yes, every email" });
  check(await askCard.isVisible(), "Tia's question comes with its choices");
  await askCard.click();
  await ti.waitForTimeout(1200);
  const lastChat = [...(await tcalls5())].reverse().find((c) => c.mode === "chat")?.body as { confirmed?: boolean } | undefined;
  check(lastChat?.confirmed === true, "a choice goes back with the person's yes");

  // 63. Many emails from one prompt: a plan card, placeholders, drafts in order; one fails and Try again fills it
  while ((await ti.locator("aside[aria-label='Tia'] [aria-label^='Remove']").count()) > 0) await ti.locator("aside[aria-label='Tia'] [aria-label^='Remove']").first().click();
  await ti.locator("[role='application']").focus();
  await ti.keyboard.press("Escape");
  await ti.keyboard.press("Escape");
  await ti.locator("aside[aria-label='Tia'] textarea").fill("Write a 3-email welcome series");
  await ti.keyboard.press("Enter");
  await ti.waitForTimeout(800);
  check((await ti.locator("[data-plan] li").count()) === 3, "with nothing picked, Tia answers with a plan of 3 emails");
  await ti.evaluate(() => ((window as unknown as { failSeries: number }).failSeries = 1));
  await ti.locator("[data-plan]").getByRole("button", { name: "Write them" }).click();
  await ti.waitForTimeout(150);
  const ph63 = await ti.locator("[data-writing]").count();
  await ti.waitForTimeout(1800);
  const failed63 = ti.locator("[data-writing='failed']");
  check(ph63 === 3 && (await failed63.count()) === 1, `three placeholders show while writing (${ph63}); the failed one stays with Try again`);
  await failed63.getByRole("button", { name: "Try again" }).click();
  await ti.waitForTimeout(1500);
  const order63 = await ti.evaluate(() => (window as unknown as { db: { emails: { name: string; group_id: string | null; group_position: number }[] } }).db.emails.filter((e) => e.group_id).sort((a, b) => a.group_position - b.group_position).map((e) => e.name));
  check(order63.slice(-3).join(",") === "Series email 1,Series email 2,Series email 3" && (await ti.locator("[data-writing]").count()) === 0, `the new drafts land in the group in the planned order (${order63.join(", ")})`);
  if (shots) await ti.screenshot({ path: `${shots}/16-b5-series.png` });
  await ti.close();
  // 64. A hand edit, then picking another email, saves an "Edited" version
  const vp = await ctx.newPage();
  vp.on("pageerror", (e) => errors.push(e.message));
  await openCanvas(vp);
  type W5 = W4 & { db: W4["db"] & { email_versions: { ref: string; note: string; doc: Doc }[]; email_comments: unknown[] } };
  const vdb = () => vp.evaluate(() => (window as unknown as W5).db);
  const vText = (i: number, id: string) => vp.evaluate(([i, id]) => document.querySelectorAll<HTMLIFrameElement>("[data-email] iframe")[i as number]!.contentDocument!.querySelector(`[data-eid="${id}"]`)?.textContent ?? "", [i, id] as const);
  const vBox = (i: number, id: string) =>
    vp.evaluate(
      ([i, id]) => {
        const f = document.querySelectorAll<HTMLIFrameElement>("[data-email] iframe")[i as number]!;
        const el = f.contentDocument!.querySelector<HTMLElement>(`[data-eid="${id}"]`)!;
        const fr = f.getBoundingClientRect();
        const z = fr.width / f.offsetWidth;
        const b = el.getBoundingClientRect();
        return { x: fr.left + b.left * z, y: fr.top + b.top * z, w: b.width * z, h: b.height * z };
      },
      [i, id] as const,
    );
  const welcomeV = (await vdb()).emails.find((e) => e.name === "Welcome")!;
  const hv = welcomeV.doc.sections[1]!.columns[0]!.blocks[1]!.id;
  const hb64 = await vBox(0, hv);
  await vp.mouse.click(hb64.x + 30, hb64.y + hb64.h / 2);
  await vp.keyboard.press("Enter");
  await vp.keyboard.press("Control+a");
  await vp.keyboard.type("First edit");
  await vp.keyboard.press("Escape");
  await vp.waitForTimeout(1100);
  const other64 = (await vp.locator("[data-canvas-item]").filter({ hasText: "Class reminder" }).first().boundingBox())!;
  await vp.mouse.click(other64.x + 10, other64.y + other64.height / 2);
  await vp.waitForTimeout(1200);
  const vs64 = (await vdb()).email_versions.filter((v) => v.ref === `em:${welcomeV.id}`);
  check(vs64.length === 1 && vs64[0]!.note === "Edited" && JSON.stringify(vs64[0]!.doc).includes("First edit"), `a hand edit saves an "Edited" version when the pick leaves (${vs64.length})`);

  // 65. The version pill: hover shows it, Restore brings it back as one step, Back to latest
  const hb2 = await vBox(0, hv);
  await vp.mouse.click(hb2.x + 30, hb2.y + hb2.h / 2);
  await vp.keyboard.press("Enter");
  await vp.keyboard.press("Control+a");
  await vp.keyboard.type("Second edit");
  await vp.keyboard.press("Escape");
  await vp.waitForTimeout(1100);
  // Leaving it saves "Second edit" as a version too.
  await vp.mouse.click(other64.x + 10, other64.y + other64.height / 2);
  await vp.waitForTimeout(1200);
  const pill = vp.locator("[data-version-pill]").first();
  check((await pill.textContent()) === "Latest", "the pill says Latest");
  await pill.click();
  const item = vp.getByRole("menu", { name: "Versions" }).getByRole("menuitem").last();
  await item.hover();
  await vp.waitForTimeout(200);
  check((await vText(0, hv)) === "First edit", "hovering a version shows it on the artboard");
  await item.click();
  await vp.waitForTimeout(200);
  check(await vp.locator("[data-version-bar]").isVisible(), "picking a version keeps it showing, with Restore and Back to latest");
  await vp.locator("[data-version-bar]").getByRole("button", { name: "Back to latest" }).click();
  await vp.waitForTimeout(200);
  check((await vText(0, hv)) === "Second edit", "Back to latest shows the latest again");
  await pill.click();
  await vp.getByRole("menu", { name: "Versions" }).getByRole("menuitem").last().click();
  await vp.locator("[data-version-bar]").getByRole("button", { name: "Restore" }).click();
  await vp.waitForTimeout(1500);
  const db65 = await vdb();
  const restored = db65.emails.find((e) => e.id === welcomeV.id)!;
  check(JSON.stringify(restored.doc).includes("First edit") && db65.email_versions.some((v) => v.ref === `em:${welcomeV.id}` && v.note.startsWith("Restored from")), "Restore brings the version back, saves it, and notes it");
  await vp.locator("[role='application']").focus();
  await vp.keyboard.press("Control+z");
  await vp.waitForTimeout(400);
  check((await vText(0, hv)) === "Second edit", "Restore is one undo step");

  // 66. Comments: C and a click; the pin; a reply; Resolve hides it; Show resolved; Delete asks first
  await vp.keyboard.press("c");
  const tb66 = await vBox(0, welcomeV.doc.sections[1]!.columns[0]!.blocks[2]!.id);
  await vp.mouse.click(tb66.x + 30, tb66.y + tb66.h / 2);
  await vp.waitForTimeout(150);
  await vp.locator("[data-comment-composer] textarea").fill("Shorter?");
  await vp.locator("[data-comment-composer]").getByRole("button", { name: "Comment" }).click();
  await vp.waitForTimeout(400);
  check((await vp.locator("[data-comment-pin]").count()) === 1, "C then a click leaves a comment with a pin");
  await vp.locator("[data-comment-pin]").click();
  await vp.locator("[data-comment-thread] textarea").fill("Agreed");
  await vp.locator("[data-comment-thread]").getByRole("button", { name: "Reply" }).click();
  await vp.waitForTimeout(400);
  check((await vp.locator("[data-comment-pin]").textContent()) === "2" && (await vp.locator("[data-comment-thread]").textContent())!.includes("Agreed"), "a reply joins the thread");
  await vp.locator("[data-comment-thread]").getByRole("button", { name: "Resolve" }).click();
  await vp.waitForTimeout(400);
  check((await vp.locator("[data-comment-pin]").count()) === 0, "Resolve hides the thread");
  const nb66 = (await vp.locator("[data-canvas-item]").filter({ hasText: "Welcome" }).first().boundingBox())!;
  await vp.mouse.click(nb66.x + 10, nb66.y + nb66.height / 2);
  await vp.getByRole("toolbar", { name: "Email actions" }).getByRole("button", { name: "More" }).click();
  await vp.getByRole("menuitem", { name: "Show resolved comments" }).click();
  await vp.waitForTimeout(300);
  check((await vp.locator("[data-comment-pin]").count()) === 1, "Show resolved brings it back");
  await vp.locator("[data-comment-pin]").click();
  await vp.locator("[data-comment-thread]").getByRole("button", { name: "Delete" }).first().click();
  check(await vp.getByRole("dialog").isVisible(), "Delete asks first");
  await vp.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await vp.waitForTimeout(400);
  check((await vp.locator("[data-comment-pin]").count()) === 0 && (await vdb()).email_comments.length === 0, "deleting the first comment takes the thread");
  if (shots) await vp.screenshot({ path: `${shots}/17-b5-versions.png` });
  await vp.close();
  // 67. Check: the count and the list; a note picks its part
  const ck = await ctx.newPage();
  ck.on("pageerror", (e) => errors.push(e.message));
  await openCanvas(ck);
  const ckName = (await ck.locator("[data-canvas-item]").filter({ hasText: "Welcome" }).first().boundingBox())!;
  await ck.mouse.click(ckName.x + 10, ckName.y + ckName.height / 2);
  const checkBtn = ck.getByRole("toolbar", { name: "Email actions" }).getByRole("button", { name: /^Check/ });
  const before67 = (await checkBtn.getAttribute("aria-label")) ?? "";
  await ck.getByRole("button", { name: "Add a block" }).click();
  await ck.locator("aside[aria-label='Add'] [data-add='image']").click();
  await ck.waitForTimeout(300);
  await ck.keyboard.press("Escape");
  const nb67 = (await ck.locator("[data-canvas-item]").filter({ hasText: "Welcome" }).first().boundingBox())!;
  await ck.mouse.click(nb67.x + 10, nb67.y + nb67.height / 2);
  await ck.waitForTimeout(200);
  const after67 = (await checkBtn.getAttribute("aria-label")) ?? "";
  const fixes = (l: string) => Number(/(\d+) to fix/.exec(l)?.[1] ?? 0);
  check(fixes(after67) === fixes(before67) + 1, `Check counts what to fix (${before67} → ${after67})`);
  await checkBtn.click();
  await ck.getByRole("menuitem", { name: "An image has no picture yet." }).last().click();
  await ck.waitForTimeout(150);
  check((await ck.locator("[data-canvas-tag='pick']").textContent()) === "Image", "a note in Check picks its part");

  // 68. Light and Dark: the picked email shows as dark-mode mail apps show it
  const bg = () => ck.evaluate(() => {
    const f = document.querySelectorAll<HTMLIFrameElement>("[data-email] iframe")[0]!;
    const t = f.contentDocument!.querySelector("[data-eid='email']") as HTMLElement;
    return getComputedStyle(t).backgroundColor;
  });
  const light = await bg();
  await ck.getByRole("toolbar", { name: "Email actions" }).getByRole("button", { name: "Dark" }).click();
  await ck.waitForTimeout(300);
  const dark = await bg();
  check(light !== dark && (await ck.getByRole("toolbar", { name: "Email actions" }).getByRole("button", { name: "Light" }).getAttribute("aria-pressed")) === "true", `Dark shows the email in dark mode (${light} → ${dark})`);
  if (shots) await ck.screenshot({ path: `${shots}/18-b5-check.png` });
  await ck.close();
  }

  // E3 ---------------------------------------------------------------------------------------------------------------
  // 69. An automation's emails on their own canvas: the Automation tag, no Add email or Send, edits allowed, and the
  // whole-email actions that belong to the automation say so instead.
  {
    const au = await ctx.newPage();
    au.on("pageerror", (e) => errors.push(e.message));
    await au.goto(`http://localhost:${port}/?group=wf:99999999-9999-4999-8999-999999999999`);
    await au.waitForFunction(() => document.querySelectorAll("[data-email] iframe").length >= 2, null, { timeout: 15000 });
    await au.waitForTimeout(400);
    check((await au.getByText("Automation", { exact: true }).count()) >= 1 && (await au.getByRole("button", { name: "Open the automation" }).count()) === 1, "an automation's canvas has its tag and Open the automation");
    check((await au.getByRole("button", { name: /Add email/ }).count()) === 0, "no Add email on an automation's canvas");
    const names = await au.locator("[data-canvas-item]").allInnerTexts();
    check(names.some((n) => n.includes("Thanks") && n.includes("Changed since publish")) && names.some((n) => n.includes("Still there?") && !n.includes("Changed since publish")), `the email edited since the live version says so (${names.map((n) => n.replace(/\s+/g, " ")).join(" / ")})`);
    const b0 = (await au.locator("[data-email]").first().boundingBox())!;
    // The whole email, picked by its name.
    await au.mouse.click(b0.x + 12, b0.y - 12);
    const bar = au.getByRole("toolbar", { name: "Email actions" });
    await bar.waitFor();
    check((await bar.getByRole("button", { name: "Send" }).count()) === 0 && (await bar.getByRole("button", { name: "Test" }).count()) === 1, "the toolbar has Test and no Send");
    await au.keyboard.press("Delete");
    await au.waitForTimeout(200);
    const said = await au.locator("[role='status']").allInnerTexts();
    check(said.some((t) => t.includes("come and go with their steps")), `Delete on the email says automation emails go with their steps (${said.join(" | ").slice(0, 120)})`);
    check((await au.locator("[data-email]").count()) === 2, "and nothing was deleted");
    await bar.getByRole("button", { name: "More" }).click();
    const items = await au.getByRole("menuitem").allInnerTexts();
    check(items.some((t) => t.includes("Open in the classic editor")) && items.some((t) => t.includes("Open the automation")) && !items.some((t) => /^(Duplicate|Delete|Move to group)/.test(t.trim())), `the menu offers the classic editor and the automation, not Duplicate, Delete or Move (${items.map((t) => t.trim()).join(", ")})`);
    await au.getByRole("menuitem", { name: /Open in the classic editor/ }).click();
    await au.getByRole("dialog").first().waitFor();
    check((await au.getByRole("dialog").first().innerText()).length > 0, "the classic editor opens on the email");
    if (shots) await au.screenshot({ path: `${shots}/19-e3-classic.png` });
    await au.keyboard.press("Escape");
    // Typing in place still works and saves through email_draft_save.
    await au.goto(`http://localhost:${port}/?group=wf:99999999-9999-4999-8999-999999999999`);
    await au.waitForFunction(() => document.querySelectorAll("[data-email] iframe").length >= 2, null, { timeout: 15000 });
    await au.waitForTimeout(400);
    if (shots) await au.screenshot({ path: `${shots}/19-e3-automation.png` });
    await au.close();
  }

  // System emails (docs/system-emails.md) ---------------------------------------------------------------------------
  // 70. The System emails' canvas: one of each with On, Off or Always on; sample values in place of merge fields; no
  // Add email, Send or Delete; Turn off and on; Insert offers the meeting's fields.
  {
    const se = await ctx.newPage();
    se.on("pageerror", (e) => errors.push(e.message));
    await se.goto(`http://localhost:${port}/?group=system`);
    await se.waitForFunction(() => document.querySelectorAll("[data-email] iframe").length >= 2, null, { timeout: 15000 });
    await se.waitForTimeout(500);
    check((await se.locator("[data-email]").count()) === 10, "the System emails' canvas shows all ten");
    check((await se.getByText("System", { exact: true }).count()) >= 1 && (await se.getByRole("button", { name: /Add email/ }).count()) === 0, "it has the System tag and no Add email");
    const names = (await se.locator("[data-canvas-item]").allInnerTexts()).map((n) => n.replace(/\s+/g, " "));
    check(names.some((n) => n.includes("Booking confirmed") && n.includes("Always on")) && names.some((n) => n.includes("Reminder") && n.includes("On")) && names.some((n) => n.includes("Pick a time") && n.includes("Off")), `each email says On, Off or Always on (${names.slice(0, 6).join(" / ")})`);
    const first = await se.locator("[data-email] iframe").first().evaluate((f) => (f as HTMLIFrameElement).contentDocument?.body.innerText ?? "");
    check(first.includes("Intro call with Alex Kim") && !first.includes("{{"), `the canvas shows a sample meeting in place of merge fields (${first.slice(0, 80).replace(/\s+/g, " ")})`);
    // The Reminder, picked by its name: Turn off, no Send.
    const boards = se.locator("[data-email]");
    const rb = (await boards.nth(3).boundingBox())!;
    await se.mouse.click(rb.x + 12, rb.y - 12);
    const bar = se.getByRole("toolbar", { name: "Email actions" });
    await bar.waitFor();
    check((await bar.getByRole("button", { name: "Send" }).count()) === 0 && (await bar.getByRole("button", { name: "Turn off" }).count()) === 1, "a System email's toolbar has Turn off and no Send");
    await bar.getByRole("button", { name: "Turn off" }).click();
    await se.waitForTimeout(200);
    const turned = await se.evaluate(() => (window as unknown as { calls: { mode: string; body: { p_on?: boolean } }[] }).calls.filter((c) => c.mode === "system_email_turn"));
    check(turned.length === 1 && turned[0]!.body.p_on === false && (await se.locator("[data-canvas-item]").nth(3).innerText()).includes("Off"), "Turn off turns it off and says so");
    await se.keyboard.press("Delete");
    await se.waitForTimeout(200);
    check((await se.locator("[data-email]").count()) === 10 && (await se.locator("[role='status']").allInnerTexts()).some((t) => t.includes("one of each")), "Delete leaves it and says why");
    // The confirmation always goes: no Turn off.
    const cb = (await boards.first().boundingBox())!;
    await se.mouse.click(cb.x + 12, cb.y - 12);
    await se.waitForTimeout(150);
    check((await bar.getByRole("button", { name: "Turn off" }).count()) === 0, "the confirmation has no Turn off");
    await bar.getByRole("button", { name: "More" }).click();
    const items = (await se.getByRole("menuitem").allInnerTexts()).map((t) => t.trim());
    check(items.includes("Start over") && !items.some((t) => /^(Duplicate|Delete|Move to group|Turn off)/.test(t)), `its menu has Start over and none of Duplicate, Delete, Move or Turn off (${items.join(", ")})`);
    await se.keyboard.press("Escape");
    if (shots) await se.screenshot({ path: `${shots}/20-system.png` });
    await se.close();
  }

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
  const sheet = (await m.locator("aside[aria-label='Element']").boundingBox())!;
  check(sheet.y > 300 && Math.abs(sheet.width - 390) < 2 && mt.y + mt.height < sheet.y, "on a phone the panel is a sheet from the bottom and the toolbar stays above it");
  await m.locator("aside[aria-label='Element'] [aria-label='Close the panel']").click();
  await m.mouse.click(mb.x + mb.width / 2, mb.y - 12);
  const mt2 = (await m.locator("[aria-label='Email actions']").boundingBox())!;
  check(mt2.y > 600, "with the panel closed the toolbar docks at the bottom");
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
