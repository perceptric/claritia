// Site apps (docs/integrations-plan.md, Next step 7; integrations/wordpress, webflow, framer, shopify): each prints
// the same embed as the form's Share tab (formEmbedCode in src/lib/share/embed.ts), finds the form id in a pasted
// link, escapes every value it prints, and prints nothing for a link or id that isn't a form.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { formEmbedCode, safe, type FormEmbed } from "../src/lib/share/embed.ts";
import { framerParts } from "../integrations/framer/embed.ts";
// @ts-expect-error a plain JS module with no types, read as Webflow loads it
import { embedCode as webflowCode, embedParts as webflowParts } from "../integrations/webflow/public/embed.js";

const ROOT = join(import.meta.dirname, "..");
const ORIGIN = "https://app.tryclaritia.com";
const ID = "6f1c2d3e-4b5a-4c7d-9e8f-0a1b2c3d4e5f";
const LINK = `https://app.tryclaritia.com/f/${ID.toUpperCase()}?utm_source=site`;
const HOSTILE = `"><script>alert(1)</script>`;
const TEXT = `Book a "demo" & <more>`;

/** What the Share tab gives for each mode, with a click to open the popups. */
const CASES: [string, FormEmbed][] = [
  ["inline", { mode: "inline" }],
  ["full", { mode: "full" }],
  ["popup", { mode: "popup", opens: "click", text: TEXT }],
  ["slider", { mode: "slider", opens: "click", text: TEXT }],
  ["popover", { mode: "popover" }],
  ["sidetab", { mode: "sidetab", text: TEXT }],
];
const share = (e: FormEmbed) => formEmbedCode(ORIGIN, ID, e);

/** The WordPress plugin's own PHP, run for each case. */
function wordpress(cases: [string, string, string][]): string[] {
  const php = `define('CLARITIA_TEST', 1); require ${JSON.stringify(join(ROOT, "integrations/wordpress/claritia/claritia.php"))}; $c = json_decode(stream_get_contents(STDIN), true); echo json_encode(array_map(function ($x) { return claritia_embed($x[0], $x[1], $x[2]); }, $c));`;
  return JSON.parse(execFileSync("php", ["-r", php], { input: JSON.stringify(cases) }).toString());
}

/** Framer's element as HTML, the way React sets its attributes. */
function framerHtml(form: string, mode: string, text: string): string {
  const p = framerParts(form, mode, text);
  if (!p) return "";
  const attrs = Object.entries(p.attrs).map(([k, v]) => (v === "" && k !== "form-id" ? k : `${k}="${safe(v, 80)}"`)).join(" ");
  return `<script src="${ORIGIN}/forms/v1.js" async></script>\n<claritia-form ${attrs}></claritia-form>${p.button === null ? "" : `\n<button data-claritia-open="${p.id}">${safe(p.button)}</button>`}`;
}

test("WordPress, Webflow and Framer print the Share tab's code for every mode, from a pasted link", () => {
  const wp = wordpress(CASES.map(([m, e]) => [LINK, m, e.text ?? ""]));
  CASES.forEach(([mode, e], i) => {
    const want = share(e);
    assert.equal(wp[i], want, `WordPress, ${mode}`);
    assert.equal(webflowCode(LINK, mode, e.text ?? ""), want, `Webflow, ${mode}`);
    assert.equal(framerHtml(LINK, mode, e.text ?? ""), want, `Framer, ${mode}`);
  });
  assert.equal(webflowCode(ID, "nope"), share({ mode: "inline" }), "an unknown mode is in the page");
});

test("a link or id that isn't a form prints nothing, and a hostile value is escaped", () => {
  for (const bad of ["", "not a form", HOSTILE, "https://app.tryclaritia.com/f/abc", "6f1c2d3e-4b5a-4c7d-9e8f"]) {
    assert.deepEqual(wordpress([[bad, "inline", ""]]), [""], `WordPress: ${bad}`);
    assert.equal(webflowCode(bad), "", `Webflow: ${bad}`);
    assert.equal(webflowParts(bad), null);
    assert.equal(framerParts(bad), null, `Framer: ${bad}`);
  }
  const hostileText = `"><img src=x onerror=alert(1)>`;
  const [wp] = wordpress([[ID, "popup", hostileText]]);
  for (const out of [wp!, webflowCode(ID, "popup", hostileText), framerHtml(ID, "popup", hostileText)]) {
    assert.ok(!out.includes("<img"), out);
    assert.ok(out.includes("&lt;img src=x onerror=alert(1)&gt;"), out);
  }
  // The id inside a hostile string is found, and nothing around it comes along.
  const sneaky = `${HOSTILE}${ID}${HOSTILE}`;
  assert.equal(wordpress([[sneaky, "inline", ""]])[0], share({ mode: "inline" }));
  assert.equal(webflowCode(sneaky), share({ mode: "inline" }));
});

test("the WordPress block and Webflow and Framer controls offer the same modes; the plugin escapes and checks", () => {
  const block = JSON.parse(readFileSync(join(ROOT, "integrations/wordpress/claritia/block/block.json"), "utf8"));
  assert.deepEqual(block.attributes.mode.enum, ["inline", "full", "popup", "slider", "popover", "sidetab"]);
  const php = readFileSync(join(ROOT, "integrations/wordpress/claritia/claritia.php"), "utf8");
  assert.match(php, /Requires at least: 6\.3/);
  assert.match(php, /htmlspecialchars\(/);
  assert.match(php, /exit;/, "nothing runs when the file is opened directly");
  const readme = readFileSync(join(ROOT, "integrations/wordpress/claritia/readme.txt"), "utf8");
  assert.match(readme, /^=== Claritia Forms ===/);
  assert.match(readme, /== External service ==|= External service =/);
  const html = readFileSync(join(ROOT, "integrations/webflow/public/index.html"), "utf8");
  for (const m of ["inline", "full", "popup", "slider", "popover", "sidetab"]) assert.ok(html.includes(`value="${m}"`), `Webflow offers ${m}`);
  assert.equal(JSON.parse(readFileSync(join(ROOT, "integrations/webflow/webflow.json"), "utf8")).apiVersion, "2");
});

test("Shopify: both blocks find the form id, escape every value, and print the Share tab's lines", () => {
  const read = (f: string) => readFileSync(join(ROOT, "integrations/shopify/extensions/claritia-form/blocks", f), "utf8");
  const form = read("form.liquid");
  const popup = read("popup.liquid");
  for (const liquid of [form, popup]) {
    assert.match(liquid, /if p\.size == 36 and bits\.size == 5/, "only a form id passes");
    assert.match(liquid, /\{%- if id != blank -%\}/, "no form, nothing printed");
    assert.ok(liquid.includes(`<script src="${ORIGIN}/forms/v1.js" async></script>`));
    // Every value printed from the settings goes through escape.
    for (const out of liquid.matchAll(/\{\{([^}]*)\}\}/g)) if (!/\| t\s*$/.test(out[1]!)) assert.match(out[1]!, /\|\s*escape\s*$/, `escaped: {{${out[1]}}}`);
    JSON.parse(/\{% schema %\}([\s\S]*?)\{% endschema %\}/.exec(liquid)![1]!);
  }
  // Each mode's element, with the id and text where the block puts them, is the Share tab's own line.
  const tpl = (code: string, text?: string) => {
    let s = code.split("\n").slice(1).join("\n").replaceAll(ID, "{{ id | escape }}");
    if (text) s = s.replaceAll(`>${safe(text)}<`, ">{{ text | escape }}<").replaceAll(`"${safe(text, 40)}"`, `"{{ text | escape }}"`);
    return s;
  };
  for (const e of [{ mode: "inline" }, { mode: "full" }, { mode: "popup", opens: "click", text: "x" }] as FormEmbed[]) assert.ok(form.includes(tpl(share(e), e.text)), `form.liquid, ${e.mode}`);
  for (const e of [{ mode: "popover" }, { mode: "sidetab", text: "x" }, { mode: "popup", opens: "10", once: true }, { mode: "popup", opens: "exit", once: true }] as FormEmbed[])
    assert.ok(popup.includes(tpl(share(e), e.text)), `popup.liquid, ${e.mode} ${e.opens ?? ""}`);
  const schema = JSON.parse(readFileSync(join(ROOT, "integrations/shopify/extensions/claritia-form/locales/en.default.schema.json"), "utf8"));
  for (const k of ["inline", "full", "popup", "popover", "sidetab", "popup_10", "popup_exit"]) assert.ok(schema.claritia.mode[k], `label for ${k}`);
});
