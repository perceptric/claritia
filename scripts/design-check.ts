// The design system in a real browser (docs/design-system.md Part 11.1): random design systems and form styles,
// compiled (src/lib/design/web.ts) and drawn by the real <claritia-form>, must give every part the value the style
// panel says it has (src/lib/design/cascade.ts), at every breakpoint and on hover. Also: a form with no design looks
// exactly as before, and nothing a design sets reaches the page around the form.
// scripts/test-db.sh runs it when CHROMIUM_PATH is set (it needs no database).
//   CHROMIUM_PATH=… node scripts/design-check.ts

import { createServer } from "node:http";
import pw from "playwright-core";
import { buildForms } from "./build-forms.mts";
import { literal, resolve } from "../src/lib/design/cascade.ts";
import { allVariables, readFormDesign, readSystem, type Breakpoint, type DesignSystem, type FormDesign } from "../src/lib/design/model.ts";
import type { PartKey } from "../src/lib/design/parts.ts";
import type { Prop } from "../src/lib/design/props.ts";
import { compileWeb, partSelector } from "../src/lib/design/web.ts";
import { DEFAULT_TOKENS } from "../src/lib/forms/brand.ts";
import { checkForm, emptyForm, type Form } from "../src/lib/forms/schema.ts";

const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  if (!ok) failures.push(what);
  if (!ok || process.env.DEBUG) console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};

const form: Form = (() => {
  const r = checkForm({
    ...emptyForm(),
    title: "Talk to sales",
    steps: [
      {
        id: "s1",
        fields: [
          { id: "a", key: "email", type: "email", label: "Work email", required: true, help: "We reply within a day." },
          { id: "b", key: "q.size", type: "choice", label: "Team size", required: false, options: [{ value: "1", label: "Just me" }, { value: "2", label: "2 to 10" }] },
          { id: "c", key: "c.c", type: "heading", label: "Heading", required: false, content: { text: "About you", level: 2 } },
        ],
      },
    ],
  });
  if ("errors" in r) throw new Error(r.errors.join(" "));
  return r.form;
})();
const ELEMENTS = ["a", "b", "c"];

/** Parts to check: where they are and which element they belong to. */
const TARGETS: { id: string; part: PartKey; field?: string }[] = [
  { id: "a", part: "label", field: "a" },
  { id: "a", part: "input", field: "a" },
  { id: "a", part: "help", field: "a" },
  { id: "a", part: "field", field: "a" },
  { id: "b", part: "option-text", field: "b" },
  { id: "b", part: "label", field: "b" },
  { id: "c", part: "heading", field: "c" },
  { id: "form", part: "title" },
  { id: "form", part: "button" },
];

// Values that read back the same way from getComputedStyle.
const COLORS = ["#112233", "#aa0000", "#00aa55", "#3355ff", "#777777"];
const PROPS: { prop: Prop; values: string[] }[] = [
  { prop: "color", values: COLORS },
  { prop: "background-color", values: COLORS },
  { prop: "padding-top", values: ["0px", "4px", "10px", "22px"] },
  { prop: "font-size", values: ["12px", "15px", "19px", "26px"] },
  { prop: "letter-spacing", values: ["1px", "2px", "-1px"] },
  { prop: "text-transform", values: ["uppercase", "lowercase", "none"] },
  { prop: "border-top-width", values: ["0px", "2px", "5px"] },
  { prop: "opacity", values: ["0.5", "0.8", "1"] },
];
const PARTS_FOR_RANDOM: PartKey[] = ["label", "input", "help", "field", "option-text", "heading", "title", "button"];
const KEYS = ["base", "tablet", "phone", "base:hover", "tablet:hover", "phone:hover"] as const;

/** A small seeded random, so a failing run can be run again. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function randomCase(seed: number): { system: DesignSystem; design: FormDesign } {
  const r = rng(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const variables = Array.from({ length: Math.floor(r() * 3) }, (_, i) => ({ id: `c${i}`, name: `Color ${i}`, kind: "color", value: pick(COLORS) }));
  const rule = (parts: PartKey[]) => {
    const out: Record<string, Record<string, Record<string, string>>> = {};
    for (let n = Math.floor(r() * 4); n > 0; n--) {
      const part = pick(parts);
      const key = pick(KEYS);
      const p = pick(PROPS);
      const v = p.prop.includes("color") && variables.length && r() < 0.3 ? `$${pick(variables).id}` : pick(p.values);
      const decls = ((out[part] ??= {})[key] ??= {});
      decls[p.prop] = v;
      // A border width shows only with a style, as the style panel sets it (CSS draws no border without one).
      if (p.prop === "border-top-width") decls["border-top-style"] = "solid";
    }
    return out;
  };
  const fieldParts = PARTS_FOR_RANDOM.filter((p) => p !== "title" && p !== "button");
  const classes = [
    { id: "k1", name: "One", styles: rule(fieldParts) },
    { id: "k2", name: "Two", styles: rule(fieldParts) },
    { id: "k3", name: "Combo", with: ["k1"], styles: rule(fieldParts) },
  ];
  const system = readSystem({ variables, globals: rule(PARTS_FOR_RANDOM), classes }, DEFAULT_TOKENS);
  const classOf = () => pick([[], ["k1"], ["k2"], ["k1", "k3"]]);
  const design = readFormDesign(
    { classes: { a: classOf(), b: classOf(), c: classOf() }, styles: { a: rule(fieldParts), b: rule(fieldParts), form: rule(["title", "button"]) } },
    new Set(ELEMENTS),
    system,
    DEFAULT_TOKENS,
  );
  return { system, design };
}

const code = Buffer.from(await buildForms());
const server = createServer((req, res) => {
  if (req.url === "/forms/v1.js") return void res.writeHead(200, { "content-type": "text/javascript" }).end(code);
  res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><title>design</title><body style="margin:0;color:rgb(1, 2, 3)"><p id="outside">Outside</p><div style="width:100%"><claritia-form></claritia-form></div><script src="/forms/v1.js"></script>`);
});
await new Promise<void>((r) => server.listen(0, r));
const base = `http://localhost:${(server.address() as { port: number }).port}`;
const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage();

const VIEWPORTS: { bp: Breakpoint; width: number }[] = [
  { bp: "base", width: 1200 },
  { bp: "tablet", width: 800 },
  { bp: "phone", width: 400 },
];

/** The CSS selector for a target's element inside the shadow root. */
const selOf = (t: (typeof TARGETS)[number]) => partSelector(t.part, t.field ? `.fl[data-id="${t.field}"]` : "")!;

async function show(css: string, design: FormDesign = {}) {
  await page.evaluate(
    ([f, c]) => {
      const el = document.querySelector("claritia-form") as unknown as { preview: unknown };
      el.preview = { form: f, css: c };
    },
    [{ ...form, design }, css] as const,
  );
}

async function computed(sel: string, props: string[]) {
  return page.evaluate(
    ([s, ps]) => {
      const n = document.querySelector("claritia-form")!.shadowRoot!.querySelector(s);
      if (!n) return null;
      const cs = getComputedStyle(n);
      return Object.fromEntries(ps.map((p) => [p, cs.getPropertyValue(p)]));
    },
    [sel, props] as const,
  );
}

const toRgb = (hex: string) => {
  const h = hex.replace("#", "");
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
};
const norm = (prop: string, v: string) => (prop.includes("color") && v.startsWith("#") ? toRgb(v) : v);

try {
  await page.goto(base);
  await page.waitForFunction(() => !!customElements.get("claritia-form"));

  // A form with no design: the same look as before the design system, and the base styles still apply.
  await page.setViewportSize({ width: 1200, height: 900 });
  await show("");
  const plain = await computed(".fl .lb", ["font-size", "font-weight"]);
  check(plain?.["font-size"] === `${DEFAULT_TOKENS.labelSize}px` && plain?.["font-weight"] === String(DEFAULT_TOKENS.labelWeight), `a form with no design keeps its look (${JSON.stringify(plain)})`);

  let compared = 0;
  let unhovered = 0;
  const runs = Number(process.env.RUNS ?? 120);
  for (let seed = 1; seed <= runs; seed++) {
    const { system, design } = randomCase(seed);
    const css = compileWeb(system, design, ELEMENTS);
    const vars = new Map(allVariables(system, DEFAULT_TOKENS).map((v) => [v.id, v]));
    await show(css, design);
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: 900 });
      for (const hover of [false, true]) {
        for (const t of TARGETS) {
          const want = resolve(system, design, t, vp.bp, hover ? "hover" : undefined);
          const props = PROPS.map((p) => p.prop).filter((p) => want[p] && want[p]!.source.level !== "default");
          if (!props.length) continue;
          const sel = selOf(t);
          await page.mouse.move(0, 0);
          if (hover) {
            // Move away first: after a resize the pointer can sit still and never hover what moved under it.
            await page.locator("claritia-form").locator(sel).first().hover({ force: true });
            const on = await page.evaluate((s) => document.querySelector("claritia-form")!.shadowRoot!.querySelector(s)!.matches(":hover"), sel);
            if (!on) {
              unhovered++;
              continue;
            }
          }
          const got = await computed(sel, props);
          for (const p of props) {
            const exp = norm(p, literal(want[p]!.value, vars));
            const ok = got?.[p] === exp;
            compared++;
            check(ok, `seed ${seed} ${vp.bp}${hover ? " hover" : ""} ${t.id}/${t.part} ${p}: want ${exp} (${want[p]!.source.level}) got ${got?.[p]}`);
            if (!ok) break;
          }
        }
      }
    }
    if (failures.length > 5) break;
  }
  check(compared > 1000, `compared ${compared} values`);
  console.log(`compared ${compared} values, ${unhovered} hover misses`);
  check(unhovered < compared / 20, `the pointer reached its part almost every time (${unhovered} misses)`);

  // The builder's edit mode (src/components/app/forms/FormCanvas.tsx): every field shows, the hidden one and the one
  // logic hides included, a later step shows its own fields and the submit button, and a forced state draws the same
  // as the real state.
  const edit = checkForm({
    ...emptyForm(),
    steps: [
      {
        id: "s1",
        fields: [
          { id: "a", key: "email", type: "email", label: "Work email", required: true },
          { id: "h", key: "q.utm", type: "hidden", label: "Source", required: false, hidden: { from: "param", name: "utm_source" } },
          { id: "t", key: "q.why", type: "text", label: "Why", required: false },
        ],
      },
      { id: "s2", fields: [{ id: "u", key: "q.more", type: "text", label: "More", required: false }] },
    ],
    rules: [{ id: "r1", when: { field: "a", op: "is", value: "x@y.io" }, then: { action: "show", field: "t" } }],
  });
  if ("errors" in edit) throw new Error(edit.errors.join(" "));
  const sys = readSystem({ globals: { button: { "base:hover": { "background-color": "#aa0000" } } } }, DEFAULT_TOKENS);
  const editCss = compileWeb(sys, {}, ["a", "h", "t", "u"], { preview: true });
  const drawn = async (step: number, on: boolean) =>
    page.evaluate(
      ([f, c, s, e]) => {
        const el = document.querySelector("claritia-form") as unknown as { preview: unknown; shadowRoot: ShadowRoot };
        el.preview = { form: f, css: c, step: s, edit: e };
        const r = el.shadowRoot;
        return { ids: [...r.querySelectorAll(".g > .fl[data-id]")].map((n) => (n as HTMLElement).dataset.id), button: r.querySelector(".ac .bt:not(.bk)")?.textContent ?? "" };
      },
      [edit.form, editCss, step, on] as const,
    );
  const off = await drawn(0, false);
  check(JSON.stringify(off.ids) === '["a"]', `outside edit mode, hidden and logic-hidden fields stay out (${off.ids})`);
  const one = await drawn(0, true);
  check(JSON.stringify(one.ids) === '["a","h","t"]' && one.button === "Next", `edit mode shows every field of step 1 (${one.ids}, ${one.button})`);
  const two = await drawn(1, true);
  check(JSON.stringify(two.ids) === '["u"]' && two.button === edit.form.submit.label, `edit mode shows step 2 with the submit button (${two.ids}, ${two.button})`);
  const forced = await page.evaluate(() => {
    const r = document.querySelector("claritia-form")!.shadowRoot!;
    const b = r.querySelector(".ac .bt:not(.bk)")!;
    const before = getComputedStyle(b).backgroundColor;
    b.classList.add("clr-force-hover");
    return [before, getComputedStyle(b).backgroundColor];
  });
  check(forced[0] !== "rgb(170, 0, 0)" && forced[1] === "rgb(170, 0, 0)", `a forced hover draws the hover style (${forced})`);

  // Nothing reaches the page around the form.
  const outside = await page.evaluate(() => getComputedStyle(document.getElementById("outside")!).color);
  check(outside === "rgb(1, 2, 3)", "the page around the form keeps its own styles");
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`${failures.length} design check(s) failed`);
  process.exit(1);
}
console.log("All design checks passed");
