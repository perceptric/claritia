// The Email Canvas in a real browser (docs/email-canvas-b1.md section 15), with a stand-in database
// (scripts/email-canvas/entry.tsx). It checks the first view, zoom toward the pointer, panning, the zoom keys, picking,
// the toolbar (and how it sticks to the top), Enter, drag to reorder (and Escape to cancel), resizing, Duplicate,
// Delete, Add email, a row of 60 emails, Phone, a narrow screen, dark mode and reduced motion. Part B2
// (docs/email-canvas-b2.md section 9): picking inside an email, hover, stepping out and in, reading order, the panel's
// groups at each level and screen, Every heading and Publish styles, the layer tree, the keys that move, copy and
// delete, undo, a sent email's read-only panel, and the panel as a sheet on a phone.
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
  check((await p.locator("[data-canvas-tag='pick']").textContent()) === "Section", "Enter steps into the picked email's first section");
  await p.locator("[data-canvas-item]").filter({ hasText: "Class reminder" }).first().dblclick();
  const nav = (await calls()).find((c) => c.mode === "navigate");
  const ids = await p.evaluate(() => (window as unknown as { db: { emails: { id: string; group_position: number; group_id: string | null }[] } }).db.emails.filter((e) => e.group_id).sort((a, b) => a.group_position - b.group_position).map((e) => e.id));
  check(nav?.body.i === `campaigns/${ids[1]}` && String(nav?.body.q).startsWith("back="), "arrows step through the emails and a double-click on the name opens it, with the way back");
  await clear();

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
  type Doc = { sections: { columns: { blocks: { id: string; type: string }[] }[] }[]; styles?: Record<string, unknown> };
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
