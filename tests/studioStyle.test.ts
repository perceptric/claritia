// The website's form styles as Studio stylesheets (src/lib/studio/styleCss.ts): every style survives the page's CSS
// cleaner whole and is known again from its first line, a template used in a style is made in that style (or the
// template's own, a brand or plain), and half-width fields share a row as on the website.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { templateById, templateTheme, TEMPLATES } from "../src/lib/forms/gallery/catalog.ts";
import { makeFromTemplate } from "../src/lib/forms/gallery/make.ts";
import { THEMES } from "../src/lib/forms/gallery/themes.ts";
import { DEFAULT_BRAND_CSS } from "../src/lib/studio/brandDefault.ts";
import { cleanPageCss } from "../src/lib/studio/page.ts";
import { STYLE_ART, styleCss, styleCssById, styleName, styleOf } from "../src/lib/studio/styleCss.ts";
import { templateDraft } from "../src/lib/studio/templatePage.ts";

test("every style is a stylesheet the cleaner keeps whole, known again by its first line", () => {
  assert.equal(THEMES.length, 18);
  for (const th of THEMES) {
    const css = styleCss(th);
    assert.equal(cleanPageCss(css), css, `${th.id} loses nothing to the cleaner`);
    assert.equal(styleOf(css), th.id);
    assert.equal(styleOf(cleanPageCss(css)), th.id);
    assert.match(css, /^@import url\("https:\/\/fonts\.googleapis\.com\//m, `${th.id} loads its fonts`);
    assert.ok(css.includes(`--brand-primary:${th.accent}`) && css.includes(`--brand-bg:${th.bg}`), `${th.id} sets its colors`);
    if (th.art && th.layout !== "card" && th.layout !== "plain") assert.ok(css.includes(`${STYLE_ART}/${th.id}.svg`), `${th.id} draws its picture`);
    if (th.dark) assert.ok(css.includes("color-scheme:dark"), `${th.id} is dark`);
    assert.ok(!/<|javascript:|expression\(/i.test(css));
  }
  assert.equal(styleName("poster"), "Poster style");
  // A brand's own stylesheet, the plain one, or a style's whose first line was edited away, isn't a style.
  assert.equal(styleOf(DEFAULT_BRAND_CSS), null);
  assert.equal(styleOf(":root{--brand-primary:#000}"), null);
  assert.equal(styleOf("/* claritia-style: nope */"), null);
  assert.equal(styleOf(styleCssById("poster").replace(/^\/\*[^*]*\*\/\n/, "")), null);
});

test("a template in a style is a Studio page wearing that style, with its half-width fields side by side", () => {
  const t = templateById("agency.project-inquiry") ?? TEMPLATES.find((x) => x.schema.pages[0]!.fields.some((f) => f.half))!;
  const draft = templateDraft(t, styleCssById("poster"));
  assert.equal(styleOf(draft.page!.brand), "poster");
  assert.equal(draft.page!.brand, styleCssById("poster"));
  assert.match(draft.page!.html, /<div class="fields">/);
  if (t.schema.pages.some((p) => p.fields.some((f) => f.half))) assert.match(draft.page!.html, /class="q half"/);
  // Every template takes every style.
  for (const x of TEMPLATES.slice(0, 40)) for (const th of THEMES.slice(0, 3)) assert.equal(styleOf(templateDraft(x, styleCss(th)).page!.brand), th.id, `${x.id} in ${th.id}`);
});

/** A database that records the form made and answers the brand's stylesheet. */
function fakes(kitCss: string | null = null) {
  const made: { p_draft: { page: { brand: string } }; p_brand_kit: string | null }[] = [];
  const chain = (data: unknown) => {
    const q: Record<string, unknown> = {};
    for (const k of ["select", "eq", "order"]) q[k] = () => q;
    q.maybeSingle = () => Promise.resolve({ data, error: null });
    q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: Array.isArray(data) ? data : [], error: null }).then(res);
    return q;
  };
  const sb = { rpc: (fn: string, a: Record<string, unknown>) => (fn === "form_create" ? (made.push(a as never), Promise.resolve({ data: "f1", error: null })) : Promise.resolve({ data: "w1", error: null })) } as unknown as SupabaseClient;
  const db = { from: (table: string) => chain(table === "brand_kits" ? { studio_css: kitCss } : []) } as unknown as SupabaseClient;
  return { sb, db, made };
}

test("Use template makes the form in the style picked, the template's own, a brand or plain", async () => {
  const t = templateById("agency.project-inquiry") ?? TEMPLATES[0]!;
  const ws = "00000000-0000-4000-8000-000000000001";
  // The style picked on the website.
  let f = fakes();
  await makeFromTemplate({ sb: f.sb, db: f.db, ws, t, theme: "poster" });
  assert.equal(styleOf(f.made[0]!.p_draft.page.brand), "poster");
  assert.equal(f.made[0]!.p_brand_kit, null);
  // No pick: the template's own style, as its card shows it.
  f = fakes();
  await makeFromTemplate({ sb: f.sb, db: f.db, ws, t });
  assert.equal(styleOf(f.made[0]!.p_draft.page.brand), templateTheme(t));
  // Plain.
  f = fakes();
  await makeFromTemplate({ sb: f.sb, db: f.db, ws, t, plain: true });
  assert.equal(f.made[0]!.p_draft.page.brand, cleanPageCss(DEFAULT_BRAND_CSS));
  // A brand wins over a style.
  f = fakes(":root{--brand-primary:#123456}");
  await makeFromTemplate({ sb: f.sb, db: f.db, ws, t, kitId: "11111111-1111-4111-8111-111111111111", theme: "poster" });
  assert.equal(f.made[0]!.p_draft.page.brand, ":root{--brand-primary:#123456}");
  assert.equal(f.made[0]!.p_brand_kit, "11111111-1111-4111-8111-111111111111");
});
