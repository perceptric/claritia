// Emails in the workspace's brand (docs/brand-capture.md, "The workspace's brand"): the kit set as the brand leads on
// every email screen and in every send, a logo-less brand shows its name where the logo goes, and the brand's own
// fonts load. Flaky cases: a newer kit set as the brand while an older one exists, a set brand that was deleted, a kit
// with no look, a draft that names no kit, and a font that isn't on Google Fonts.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { brandOf, kitsBrandFirst } from "../src/lib/brand/workspaceKit.ts";
import { compileWithKit, loadKits } from "../src/lib/design/email/server.ts";
import { compileEmail } from "../src/lib/design/email/compile.ts";
import { sampleEmail } from "./fixtures/emailSample.ts";
import { readSystem } from "../src/lib/design/model.ts";
import { cleanTokens } from "../src/lib/forms/brand.ts";
import { fontUrl, tokenFonts } from "../src/lib/design/fonts.ts";

const OLD = "11111111-1111-4111-8111-111111111111";
const NEW = "22222222-2222-4222-8222-222222222222";
const BARE = "33333333-3333-4333-8333-333333333333";
const kits = [
  { id: OLD, tokens: { accent: "#000000" }, logo_url: null, book_name: null, created_at: 1 },
  { id: NEW, tokens: { accent: "#d73e33", buttonBg: "#d73e33", font: "Poppins, sans-serif" }, logo_url: null, book_name: "Momos", created_at: 2 },
  { id: BARE, tokens: {}, logo_url: null, book_name: null, created_at: 3 },
];

/** Just enough of Supabase's query builder for these reads. */
function fakeDb(brand: string | null, name = "Ridgeline Roofing", named: boolean | null = null): SupabaseClient {
  const from = (table: string) => {
    const q = {
      select: () => q,
      eq: () => q,
      in: () => q,
      order: () => q,
      limit: () => q,
      maybeSingle: async () => ({ data: table === "workspaces" ? { brand_kit_id: brand, name, named } : null, error: null }),
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: table === "brand_kits" ? kits : [], error: null }).then(ok),
    };
    return q;
  };
  return { from } as unknown as SupabaseClient;
}

test("the brand: the kit the workspace set, else the oldest with a look, else the oldest", () => {
  assert.equal(brandOf(kits, NEW)?.id, NEW, "a newer kit set as the brand wins over an older one");
  assert.equal(brandOf(kits, null)?.id, OLD);
  assert.equal(brandOf(kits, "gone")?.id, OLD, "a deleted brand falls back");
  assert.equal(brandOf([kits[2]!, kits[1]!], null)?.id, NEW, "a kit with no look isn't picked over one with a look");
  assert.equal(brandOf([], NEW), undefined);
});

test("email screens get every kit with the brand first", async () => {
  const r = await kitsBrandFirst<{ id: string }>(fakeDb(NEW), "ws", "tokens, logo_url");
  assert.deepEqual(r.data?.map((k) => k.id), [NEW, OLD, BARE]);
  const none = await kitsBrandFirst<{ id: string }>(fakeDb(null), "ws", "id, tokens");
  assert.deepEqual(none.data?.map((k) => k.id), [OLD, NEW, BARE]);
});

test("sends: a draft that names no kit compiles in the workspace's brand, its fonts loaded", async () => {
  const list = await loadKits(fakeDb(NEW), "ws", [undefined]);
  assert.equal(list[0]!.id, NEW, "the brand leads, so it's the fallback");
  assert.equal(list.length, 1, "with ids, only the named kits and the brand");
  assert.equal(list[0]!.brand_name, "Momos", "the brand book's name");
  const doc = sampleEmail();
  const out = compileWithKit(doc, list, "live");
  assert.ok(out.html.includes("#d73e33"), "the brand's color");
  assert.ok(out.html.includes("family=Poppins"), "the brand's Google font loads");
  assert.ok(out.html.includes(">Momos</div>"), "no logo yet: the brand's name where the logo goes");
  const named = await loadKits(fakeDb(NEW), "ws", [OLD]);
  assert.deepEqual(named.map((k) => k.id), [NEW, OLD]);
  assert.ok(compileWithKit({ ...doc, kitId: OLD }, named, "live").html.includes("#000000"), "a draft that names a kit keeps it");
  const team = await loadKits(fakeDb(OLD, "Ridgeline Roofing"), "ws");
  assert.equal(team[0]!.brand_name, "Ridgeline Roofing", "no brand book: the team's name");
  const auto = await loadKits(fakeDb(OLD, "ann's workspace", false), "ws");
  assert.equal(auto[0]!.brand_name, null, "a team name made from the sign-up email never shows");
});

test("the logo block: the kit's logo, else the brand's name in its heading font, else nothing", () => {
  const tokens = cleanTokens({ headingFont: "Inter, sans-serif", text: "#15181e" }).tokens;
  const doc = sampleEmail();
  const sys = readSystem({}, tokens);
  const logo = compileEmail(sys, doc, { tokens, logo: "https://acme.test/logo.png", brandName: "Acme" }).html;
  assert.ok(logo.includes('src="https://acme.test/logo.png"') && !logo.includes(">Acme</div>"));
  const name = compileEmail(sys, doc, { tokens, brandName: "Acme & <Co>" }).html;
  assert.match(name, /font-family:Inter, sans-serif;[^"]*color:#15181e;[^"]*">Acme &amp; &lt;Co&gt;<\/div>/, "escaped, in the heading font and text color");
  const bare = compileEmail(sys, doc, { tokens }).html;
  assert.ok(!bare.includes("<img") || !/alt="Logo"/.test(bare), "no logo and no name: nothing");
});

test("brand fonts: the first family of each stack, and only Google fonts make the stylesheet", () => {
  assert.deepEqual(tokenFonts({ font: "Poppins, ui-sans-serif", headingFont: "'Playfair Display', serif" }), ["Poppins", "Playfair Display"]);
  assert.deepEqual(tokenFonts({}), []);
  assert.equal(fontUrl(tokenFonts({ font: "'Wulkan Text', sans-serif" })), "", "a site's own font isn't on Google Fonts");
});
