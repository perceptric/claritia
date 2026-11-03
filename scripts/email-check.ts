// Compiled emails in a real browser (docs/design-system.md Part 11.1): random email designs, compiled
// (src/lib/design/email/compile.ts), must draw every part with the value the cascade says (style.ts), on desktop,
// on a phone (the media rules) and in dark mode. Chromium stands in for Apple Mail; the real-inbox tests cover the
// rest. scripts/test-db.sh runs it when CHROMIUM_PATH is set (it needs no database).
//   CHROMIUM_PATH=… node scripts/email-check.ts

import pw from "playwright-core";
import { literal } from "../src/lib/design/cascade.ts";
import { compileEmail } from "../src/lib/design/email/compile.ts";
import { readEmailDoc, type EmailDoc } from "../src/lib/design/email/doc.ts";
import type { EmailPartKey } from "../src/lib/design/email/parts.ts";
import { resolveEmail, type EmailBp, type EmailState } from "../src/lib/design/email/style.ts";
import { allVariables, readSystem, type DesignSystem } from "../src/lib/design/model.ts";
import type { Prop } from "../src/lib/design/props.ts";
import { DEFAULT_TOKENS } from "../src/lib/forms/brand.ts";

const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  if (!ok) failures.push(what);
  if (!ok || process.env.DEBUG) console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};

const COLORS = ["#112233", "#aa0000", "#00aa55", "#3355ff", "#777777"];
const PROPS: { prop: Prop; values: string[] }[] = [
  { prop: "color", values: COLORS },
  { prop: "font-size", values: ["13px", "17px", "22px", "30px"] },
  { prop: "letter-spacing", values: ["1px", "2px"] },
  { prop: "text-transform", values: ["uppercase", "lowercase", "none"] },
  { prop: "line-height", values: ["1.2", "1.8"] },
];
// Where each part is in the compiled email, for an element id.
const TARGETS: { id: string; part: EmailPartKey; sel: string }[] = [
  { id: "h1", part: "heading", sel: ".ch1-heading, [data-eid=h1] h2" },
  { id: "t1", part: "text", sel: "[data-eid=t1] > div" },
  { id: "q1", part: "quote", sel: "[data-eid=q1] > div" },
  { id: "f1", part: "footer", sel: "[data-eid=f1] > div" },
];
const KEYS = ["base", "phone", "base:dark", "phone:dark"] as const;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function randomCase(seed: number): { system: DesignSystem; doc: EmailDoc } {
  const r = rng(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const variables = [{ id: "ink", name: "Ink", kind: "color", value: pick(COLORS), dark: pick(COLORS) }];
  const rules = () => {
    const out: Record<string, Record<string, Record<string, string>>> = {};
    for (let n = Math.floor(r() * 5); n > 0; n--) {
      const t = pick(TARGETS);
      const p = pick(PROPS);
      const v = p.prop === "color" && r() < 0.4 ? "$ink" : pick(p.values);
      ((out[t.part] ??= {})[pick(KEYS)] ??= {})[p.prop] = v;
    }
    return out;
  };
  const system = readSystem({ variables, email: { globals: rules(), classes: [{ id: "k1", name: "One", styles: rules() }] } }, DEFAULT_TOKENS);
  const doc = readEmailDoc(
    {
      settings: {},
      sections: [
        {
          id: "s1",
          columns: [
            {
              id: "c1",
              blocks: [
                { id: "h1", type: "heading", text: "Heading" },
                { id: "t1", type: "text", html: "<p>Some text</p>" },
                { id: "q1", type: "quote", text: "A quote" },
                { id: "f1", type: "footer", address: "1 Main St" },
              ],
            },
          ],
        },
      ],
      classes: { h1: r() < 0.5 ? ["k1"] : [], t1: r() < 0.5 ? ["k1"] : [] },
      styles: { h1: rules(), t1: rules(), f1: rules() },
    },
    { system, tokens: DEFAULT_TOKENS },
  );
  return { system, doc };
}

const toRgb = (hex: string) => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
const norm = (prop: string, v: string, size: string) => {
  if (prop === "color" && v.startsWith("#")) return toRgb(v);
  // A unitless line height reads back in px.
  if (prop === "line-height" && /^\d+(\.\d+)?$/.test(v)) return `${+(Number(v) * parseFloat(size)).toFixed(2)}px`;
  return v;
};

const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage();
try {
  let compared = 0;
  const runs = Number(process.env.RUNS ?? 80);
  for (let seed = 1; seed <= runs; seed++) {
    const { system, doc } = randomCase(seed);
    const { html } = compileEmail(system, doc, { tokens: DEFAULT_TOKENS, preview: true });
    const vars = new Map(allVariables(system, DEFAULT_TOKENS).map((v) => [v.id, v]));
    for (const view of [
      { bp: "base" as EmailBp, width: 700, dark: false },
      { bp: "phone" as EmailBp, width: 400, dark: false },
      { bp: "base" as EmailBp, width: 700, dark: true },
      { bp: "phone" as EmailBp, width: 400, dark: true },
    ]) {
      await page.setViewportSize({ width: view.width, height: 900 });
      await page.emulateMedia({ colorScheme: view.dark ? "dark" : "light" });
      await page.setContent(html);
      for (const t of TARGETS) {
        const want = resolveEmail(system, doc, t, view.bp, view.dark ? ("dark" as EmailState) : undefined);
        const props = PROPS.map((p) => p.prop).filter((p) => want[p]);
        const got = await page.evaluate(
          ([sel, ps]) => {
            const n = document.querySelector(sel);
            if (!n) return null;
            const cs = getComputedStyle(n);
            return { ...Object.fromEntries(ps.map((p) => [p, cs.getPropertyValue(p)])), __size: cs.fontSize } as Record<string, string>;
          },
          [t.sel, props] as const,
        );
        if (!got) {
          check(false, `seed ${seed} ${t.id}/${t.part} is in the email`);
          continue;
        }
        for (const p of props) {
          const exp = norm(p, literal(want[p]!.value, vars, view.dark), got.__size!);
          compared++;
          check(got[p] === exp, `seed ${seed} ${view.bp}${view.dark ? " dark" : ""} ${t.id}/${t.part} ${p}: want ${exp} (${want[p]!.source.level}) got ${got[p]}`);
        }
      }
    }
    if (failures.length > 5) break;
  }
  check(compared > 1000, `compared ${compared} values`);
  console.log(`compared ${compared} values`);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`${failures.length} email check(s) failed`);
  process.exit(1);
}
console.log("All email checks passed");
